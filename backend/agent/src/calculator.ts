import { StateGraph, START, END } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { b } from "../baml_client/index.js";
import { pythonExecutor } from "./tools.js";

// ============================================================================
// Calculator Subagent
// ============================================================================

const MAX_CALCULATOR_ITERATIONS = 10;
const CALCULATOR_THRESHOLD = 3; // Allow natural completion until (MAX - THRESHOLD) iterations

const CalculatorState = z.object({
  calculation_request: z.string(),
  python_code_response: z.string().optional(),
  // Accumulate all execution results for multi-step calculations
  all_execution_results: z.array(z.string()), // No default - must be explicitly provided
  previous_plannification_steps: z.string().optional(),
  previous_python_code: z.string().optional(),
  iteration_count: z.number(), // No default - must be explicitly provided
  complete: z.boolean(), // No default - must be explicitly provided
  // Internal state for node communication
  pending_python_code: z.string().optional(),
  pending_plannification_steps: z.string().optional(),
  decision_type: z.enum(["complete", "execute"]).optional(),
});

type CalculatorStateType = z.infer<typeof CalculatorState>;

// Node 1: Analyze calculation needs
const analyzeNode = async (state: CalculatorStateType) => {
  console.log("\n🧮 [Calculator] Analyzing calculation needs...");
  console.log("   Iteration:", state.iteration_count, "/", MAX_CALCULATOR_ITERATIONS);
  console.log("   Has python_code_response:", !!state.python_code_response);
  console.log("   Has previous_plannification_steps:", !!state.previous_plannification_steps);
  console.log("   Has previous_python_code:", !!state.previous_python_code);

  // Combine all execution results for the prompt
  // This gives the agent visibility into all previous steps, not just the last one
  const allResults = (state.all_execution_results && state.all_execution_results.length > 0)
    ? state.all_execution_results.join("\n\n--- Execution Result ---\n\n")
    : state.python_code_response;

  const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
  const decision = await b.PythonCalculator(
    state.calculation_request,
    allResults, // Pass all accumulated results, not just the last one
    state.previous_plannification_steps,
    state.previous_python_code,
    state.iteration_count,
    MAX_CALCULATOR_ITERATIONS,
    currentDate
  );

  if ("calculation_result" in decision) {
    // Calculation is complete
    console.log("   ✓ Calculation complete (Agent decision)");
    return {
      decision_type: "complete",
      python_code_response: decision.calculation_result,
      iteration_count: state.iteration_count + 1,
      complete: true,
    };
  }

  if ("python_code" in decision) {
    // Check if we've exceeded max iterations - only force stop at absolute max
    if (state.iteration_count >= MAX_CALCULATOR_ITERATIONS) {
      console.log("   ⚠️ Max iterations reached, forcing completion despite the agent wanting to continue");
      const finalResult = state.python_code_response 
        ? `Calculation Result (after ${state.iteration_count} iterations):\n\n${state.python_code_response}`
        : "Calculation completed with available information.";
      
      return {
        decision_type: "complete",
        python_code_response: finalResult,
        iteration_count: state.iteration_count + 1,
        complete: true,
      };
    }

    // Check if we're past the threshold - warn but still allow
    if (state.iteration_count >= (MAX_CALCULATOR_ITERATIONS - CALCULATOR_THRESHOLD)) {
      console.log("   ⚠️ Approaching max iterations, but allowing the agent to continue");
    }

    // Store code and plannification steps for execution
    const code = decision.python_code;
    const plannificationSteps = decision.plannification_steps;
    console.log("   → Generated Python code");
    console.log("   → Plannification steps:", plannificationSteps.substring(0, 100));
    
    return {
      decision_type: "execute",
      pending_python_code: code,
      pending_plannification_steps: plannificationSteps,
    };
  }

  return {
    decision_type: "complete",
    ...state,
  };
};

// Node 2: Execute Python code
const executeNode = async (state: CalculatorStateType) => {
  console.log("\n🧮 [Calculator] Executing Python code...");
  
  if (!state.pending_python_code) {
    console.log("   ⚠️ No Python code found");
    return {
      decision_type: "complete",
      complete: true,
    };
  }

  const code = state.pending_python_code;
  const plannificationSteps = state.pending_plannification_steps;
  
  try {
    const executionResult = await pythonExecutor(code);
    console.log("   → Execution result:", executionResult.substring(0, 100));
    
    // Store the execution result, plannification steps, and code for next iteration
    // Add to accumulated results so agent can see all previous steps
    return {
      python_code_response: executionResult, // Keep for backward compatibility
      all_execution_results: [
        ...(state.all_execution_results || []),
        executionResult,
      ],
      previous_plannification_steps: plannificationSteps,
      previous_python_code: code,
      pending_python_code: undefined,
      pending_plannification_steps: undefined,
      iteration_count: state.iteration_count + 1,
      complete: false,
      decision_type: undefined,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("   → Execution error:", errorMessage);
    
    // Store error, plannification steps, and code for next iteration
    // Add to accumulated results so agent can see all previous steps including errors
    const errorResult = `Execution error: ${errorMessage}`;
    return {
      python_code_response: errorResult, // Keep for backward compatibility
      all_execution_results: [
        ...(state.all_execution_results || []),
        errorResult,
      ],
      previous_plannification_steps: plannificationSteps,
      previous_python_code: code,
      pending_python_code: undefined,
      pending_plannification_steps: undefined,
      iteration_count: state.iteration_count + 1,
      complete: false,
      decision_type: undefined,
    };
  }
};

const calculatorGraph = new StateGraph({ state: CalculatorState })
  .addNode("analyze", analyzeNode)
  .addNode("execute", executeNode)
  .addEdge(START, "analyze")
  .addConditionalEdges("analyze", (state: CalculatorStateType) => {
    if (state.decision_type === "complete") {
      return END;
    }
    if (state.decision_type === "execute") {
      return "execute";
    }
    // If we've reached max iterations, force completion
    if (state.iteration_count >= MAX_CALCULATOR_ITERATIONS) {
      console.log("   ⚠️ Max iterations reached, forcing completion");
      return END;
    }
    // Safety fallback
    return END;
  })
  .addEdge("execute", "analyze") // After execution, go back to analyze
  .compile({ checkpointer: new MemorySaver() });

export { calculatorGraph };
