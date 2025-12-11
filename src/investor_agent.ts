import { StateGraph, START, END } from "@langchain/langgraph";
import { withLangGraph } from "@langchain/langgraph/zod";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { b } from "../baml_client";
import type { Message } from "../baml_client/types";
import { webResearcherGraph, calculatorGraph } from "./subagents";

// ============================================================================
// Main Investor Agent State
// ============================================================================

function messagesReducer(
  left: Message[] | null | undefined,
  right: Message[] | null | undefined,
): Message[] {
  if (right != null && right.length > 0) {
    return [...(left || []), ...right];
  }
  return left || [];
}

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  message: z.string(),
});

const InvestorAgentState = z.object({
  // Input field: accepts either a simple string (for Studio UX) or formatted messages
  input: z.union([
    z.string(),
    z.array(MessageSchema),
  ]).optional(),
  messages: withLangGraph(z.array(MessageSchema), {
    reducer: {
      schema: z.array(MessageSchema),
      fn: messagesReducer,
    },
  }),
  turnCount: z.number().default(0),
  research_results: z.string().optional(),
  calculation_results: z.string().optional(),
  current_action: z.enum(["thinking", "researching", "calculating", "responding", "asking"]).default("thinking"),
  pending_research_query: z.string().optional(),
  pending_calculation_request: z.string().optional(),
});

type InvestorAgentStateType = z.infer<typeof InvestorAgentState>;

// ============================================================================
// Main Agent Nodes
// ============================================================================

const thinkNode = async (state: InvestorAgentStateType) => {
  console.log("\n💭 [InvestorAgent] Thinking...");
  console.log("   Messages:", state.messages.length);
  console.log("   Turn:", state.turnCount);
  console.log("   Has research results:", !!state.research_results);
  console.log("   Has calculation results:", !!state.calculation_results);

  // Convert messages to BAML Message format (BAML will format them using PrintMessages template)
  const messages: Message[] = state.messages.map(msg => ({
    role: msg.role as "user" | "assistant",
    message: msg.message,
  }));

  // Only pass research/calculation results if they exist (they'll be cleared after use)
  const decision = await b.InvestorAgent(
    messages,
    state.research_results,
    state.calculation_results
  );

  // Clear research and calculation results after using them
  // They should only be available immediately after coming from subagents
  const clearResults = {
    research_results: undefined,
    calculation_results: undefined,
  };

  if ("research_query" in decision) {
    console.log("   → Need research:", decision.research_query);
    return {
      current_action: "researching",
      pending_research_query: decision.research_query,
      ...clearResults, // Clear any previous results
    };
  } else if ("calculation_request" in decision) {
    console.log("   → Need calculation:", decision.calculation_request);
    return {
      current_action: "calculating",
      pending_calculation_request: decision.calculation_request,
      ...clearResults, // Clear any previous results
    };
  } else if ("question" in decision) {
    console.log("   → Need more info:", decision.question);
    return {
      current_action: "asking",
      messages: [{ role: "assistant", message: decision.question }],
      ...clearResults, // Clear any previous results
    };
  } else if ("response" in decision) {
    console.log("   → Ready to respond");
    return {
      current_action: "responding",
      messages: [{ role: "assistant", message: decision.response }],
      turnCount: state.turnCount + 1,
      ...clearResults, // Clear any previous results
    };
  }

  return {
    ...state,
    ...clearResults, // Clear results even if no decision made
  };
};

const researchNode = async (state: InvestorAgentStateType) => {
  console.log("\n🔍 [InvestorAgent] Delegating to WebResearcher...");
  
  if (!state.pending_research_query) {
    console.log("   ⚠️ No research query found, returning to thinking");
    return { current_action: "thinking" };
  }

  const researchResult = await webResearcherGraph.invoke(
    {
      original_query: state.pending_research_query,
      research_results: [],
      iteration_count: 0,
    },
      { configurable: { thread_id: `research-${state.turnCount}-${Date.now()}` } }
  );

  const finalResults = researchResult.research_results.join("\n\n");
  console.log("   ✓ Research complete");

  return {
    research_results: finalResults,
    current_action: "thinking", // Go back to thinking with new research
    pending_research_query: undefined, // Clear the pending query
  };
};

const calculateNode = async (state: InvestorAgentStateType) => {
  console.log("\n🧮 [InvestorAgent] Delegating to Calculator...");
  
  if (!state.pending_calculation_request) {
    console.log("   ⚠️ No calculation request found, returning to thinking");
    return { current_action: "thinking" };
  }

  const calcResult = await calculatorGraph.invoke(
    {
      calculation_request: state.pending_calculation_request,
      iteration_count: 0,
      complete: false,
    },
    { configurable: { thread_id: `calc-${state.turnCount}-${Date.now()}` } }
  );

  const finalResult = calcResult.python_code_response || "Calculation completed";
  console.log("   ✓ Calculation complete");

  // Return calculation results - they will be available for the next thinkNode call
  // and then cleared after use
  return {
    calculation_results: finalResult,
    current_action: "thinking", // Go back to thinking with new calculation
    pending_calculation_request: undefined, // Clear the pending request
  };
};

// ============================================================================
// Input Transformation (for LangGraph Studio UX)
// ============================================================================

// Node that transforms simple string input to Message format
const formatInputNode = async (state: InvestorAgentStateType): Promise<Partial<InvestorAgentStateType>> => {
  // If input is provided, convert it to messages
  if (state.input) {
    let messages: Message[];
    
    if (typeof state.input === "string") {
      // Simple string input - convert to Message format
      messages = [{ role: "user", message: state.input }];
    } else {
      // Already formatted messages
      messages = state.input;
    }
    
    return {
      messages,
      input: undefined, // Clear input after processing
    };
  }
  
  // No input to process, just pass through
  return {};
};

// ============================================================================
// Main Graph
// ============================================================================

const investorAgentGraph = new StateGraph({ state: InvestorAgentState })
  .addNode("think", thinkNode)
  .addNode("research", researchNode)
  .addNode("calculate", calculateNode)
  .addEdge(START, "think")
  .addConditionalEdges("think", (state: InvestorAgentStateType) => {
    // Route based on current_action set by thinkNode
    if (state.current_action === "researching") return "research";
    if (state.current_action === "calculating") return "calculate";
    if (state.current_action === "responding" || state.current_action === "asking") return END;
    return "think"; // Continue thinking if needed
  })
  .addEdge("research", "think") // After research, go back to thinking
  .addEdge("calculate", "think") // After calculation, go back to thinking
  .compile({ checkpointer: new MemorySaver() });

// Graph with input transformation for better LangGraph Studio UX
// This allows users to type a simple string instead of [{role: "user", message: "..."}]
const investorAgentGraphWithInput = new StateGraph({ state: InvestorAgentState })
  .addNode("format_input", formatInputNode)
  .addNode("think", thinkNode)
  .addNode("research", researchNode)
  .addNode("calculate", calculateNode)
  .addEdge(START, "format_input")
  .addEdge("format_input", "think")
  .addConditionalEdges("think", (state: InvestorAgentStateType) => {
    // Route based on current_action set by thinkNode
    if (state.current_action === "researching") return "research";
    if (state.current_action === "calculating") return "calculate";
    if (state.current_action === "responding" || state.current_action === "asking") return END;
    return "think"; // Continue thinking if needed
  })
  .addEdge("research", "think") // After research, go back to thinking
  .addEdge("calculate", "think") // After calculation, go back to thinking
  .compile({ checkpointer: new MemorySaver() });

// Export the graph with input transformation for better Studio UX
export { investorAgentGraphWithInput as investorAgentGraph };

