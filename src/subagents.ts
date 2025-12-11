import { StateGraph, START, END } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { withLangGraph } from "@langchain/langgraph/zod";
import { z } from "zod";
import { b } from "../baml_client";
import { tavilySearch, pythonExecutor } from "./tools";

// ============================================================================
// Web Researcher Subagent
// ============================================================================

function webResearcherReducer(
  left: string[] | null | undefined,
  right: string[] | null | undefined,
): string[] {
  if (right != null && right.length > 0) {
    return [...(left || []), ...right];
  }
  return left || [];
}

const MAX_RESEARCH_ITERATIONS = 10;
const RESEARCH_THRESHOLD = 3; // Allow natural completion until (MAX - THRESHOLD) iterations

const WebResearcherState = z.object({
  original_query: z.string(),
  research_results: withLangGraph(z.array(z.string()), {
    reducer: {
      schema: z.array(z.string()),
      fn: webResearcherReducer,
    },
  }),
  iteration_count: z.number().default(0),
  complete: z.boolean().default(false),
});

type WebResearcherStateType = z.infer<typeof WebResearcherState>;

const webResearcherNode = async (state: WebResearcherStateType) => {
  console.log("\n🔍 [WebResearcher] Processing:", state.original_query);
  console.log("   Iteration:", state.iteration_count, "/", MAX_RESEARCH_ITERATIONS);
  console.log("   Previous results:", state.research_results.length);

  const previousResultsText = state.research_results.length > 0
    ? state.research_results.join("\n\n")
    : undefined;

  // Get the latest search results if any
  const latestSearchResults = state.research_results.length > 0
    ? state.research_results[state.research_results.length - 1]
    : undefined;

  // Give the agent a chance to decide first
  const decision = await b.WebResearcher(
    state.original_query,
    previousResultsText,
    latestSearchResults,
    state.iteration_count,
    MAX_RESEARCH_ITERATIONS
  );

  // If the agent says research is complete, honor that
  if ("research_summary" in decision) {
    console.log("   ✓ Research complete (Agent decision)");
    return {
      research_results: [decision.research_summary],
      iteration_count: state.iteration_count + 1,
      complete: true,
    };
  }

  // If the agent wants to continue searching
  if ("search_query" in decision || "additional_query" in decision) {
    // Check if we've exceeded max iterations - only force stop at absolute max
    if (state.iteration_count >= MAX_RESEARCH_ITERATIONS) {
      console.log("   ⚠️ Max iterations reached, forcing completion despite the agent wanting to continue");
      const summary = previousResultsText 
        ? `Research Summary (after ${state.iteration_count} iterations):\n\n${previousResultsText}`
        : "Research completed with available information.";
      
      return {
        research_results: [summary],
        iteration_count: state.iteration_count + 1,
        complete: true,
      };
    }

    // Check if we're past the threshold - warn but still allow
    if (state.iteration_count >= (MAX_RESEARCH_ITERATIONS - RESEARCH_THRESHOLD)) {
      console.log("   ⚠️ Approaching max iterations, but allowing the agent to continue");
    }

    const query = "search_query" in decision ? decision.search_query : decision.additional_query;
    
    // Perform web search
    const searchResults = await tavilySearch(query, 5);
    
    // Add search results and continue (will loop back to this node)
    return {
      research_results: [searchResults],
      iteration_count: state.iteration_count + 1,
      complete: false,
    };
  }

  return state;
};

const webResearcherGraph = new StateGraph({ state: WebResearcherState })
  .addNode("research", webResearcherNode)
  .addEdge(START, "research")
  .addConditionalEdges("research", (state: WebResearcherStateType) => {
    // If the research is complete, return END
    if (state.complete) {
      return END;
    }
    // If we've reached max iterations, force completion
    if (state.iteration_count >= MAX_RESEARCH_ITERATIONS) {
      console.log("   ⚠️ Max iterations reached, forcing completion");
      return END;
    }
    // Continue researching (loop back)
    return "research";
  })
  .compile({ checkpointer: new MemorySaver() });

// ============================================================================
// Calculator Subagent
// ============================================================================

const CalculatorState = z.object({
  calculation_request: z.string(),
  python_code_response: z.string().optional(),
  iteration_count: z.number().default(0),
  complete: z.boolean().default(false),
});

type CalculatorStateType = z.infer<typeof CalculatorState>;

const calculatorNode = async (state: CalculatorStateType) => {
  console.log("\n🧮 [Calculator] Processing:", state.calculation_request);
  console.log("   Iteration:", state.iteration_count);
  console.log("   Has python_code_response:", !!state.python_code_response);

  const decision = await b.PythonCalculator(
    state.calculation_request,
    state.python_code_response
  );

  if ("python_code" in decision) {
    // Generate Python code and execute it
    const code = decision.python_code;
    console.log("   → Generated Python code");
    
    try {
      const executionResult = await pythonExecutor(code);
      console.log("   → Execution result:", executionResult.substring(0, 100));
      
      // Store the execution result and loop back to check if it answers the request
      return {
        python_code_response: executionResult,
        iteration_count: state.iteration_count + 1,
        complete: false,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log("   → Execution error:", errorMessage);
      
      // Store error and loop back to generate corrected code
      return {
        python_code_response: `Execution error: ${errorMessage}`,
        iteration_count: state.iteration_count + 1,
        complete: false,
      };
    }
  } else if ("calculation_result" in decision) {
    // Calculation is complete
    console.log("   ✓ Calculation complete");
    return {
      python_code_response: decision.calculation_result,
      iteration_count: state.iteration_count + 1,
      complete: true,
    };
  }

  return state;
};

const calculatorGraph = new StateGraph({ state: CalculatorState })
  .addNode("calculate", calculatorNode)
  .addEdge(START, "calculate")
  .addConditionalEdges("calculate", (state: CalculatorStateType) => {
    // If calculation is complete, return END
    if (state.complete) {
      return END;
    }
    // Continue calculating (loop back) - max 10 iterations to prevent infinite loops
    if (state.iteration_count >= 10) {
      console.log("   ⚠️ Max iterations reached, returning current result");
      return END;
    }
    return "calculate";
  })
  .compile({ checkpointer: new MemorySaver() });

export { webResearcherGraph, calculatorGraph };

