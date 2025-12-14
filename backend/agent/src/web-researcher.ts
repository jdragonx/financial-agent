import { StateGraph, START, END } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { withLangGraph } from "@langchain/langgraph/zod";
import { z } from "zod";
import { b } from "../baml_client/index.js";
import { tavilySearch } from "./tools.js";

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
  planning_steps: z.string().optional(),
  iteration_count: z.number(), // No default - must be explicitly provided
  complete: z.boolean(), // No default - must be explicitly provided
  // Internal state for node communication
  pending_search_query: z.string().optional(),
  decision_type: z.enum(["complete", "search"]).optional(),
});

type WebResearcherStateType = z.infer<typeof WebResearcherState>;

// Node 1: Analyze and decide what to do
const analyzeNode = async (state: WebResearcherStateType) => {
  console.log("\n🔍 [WebResearcher] Analyzing research needs...");
  console.log("   Iteration:", state.iteration_count, "/", MAX_RESEARCH_ITERATIONS);
  console.log("   Previous results:", state.research_results?.length ?? 0);

  const previousResultsText = (state.research_results && state.research_results.length > 0)
    ? state.research_results.join("\n\n")
    : undefined;

  // Get the latest search results if any
  const latestSearchResults = (state.research_results && state.research_results.length > 0)
    ? state.research_results[state.research_results.length - 1]
    : undefined;

  // Give the agent a chance to decide first
  const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
  const decision = await b.WebResearcher(
    state.original_query,
    previousResultsText,
    latestSearchResults,
    state.planning_steps, // Pass planning steps so agent remembers the plan
    state.iteration_count,
    MAX_RESEARCH_ITERATIONS,
    currentDate
  );

  // If the agent says research is complete, honor that
  if ("research_summary" in decision) {
    console.log("   ✓ Research complete (Agent decision)");
    return {
      decision_type: "complete",
      research_results: [decision.research_summary],
      iteration_count: state.iteration_count + 1,
      complete: true,
      planning_steps: undefined, // Clear planning steps after completion
    };
  }

  // If the agent wants to continue searching
  if ("search_query" in decision || "additional_query" in decision) {
    // Extract planning steps if provided
    const planningSteps = "planning_steps" in decision ? decision.planning_steps : state.planning_steps;
    if (planningSteps && !state.planning_steps) {
      console.log("   📋 Planning steps:", planningSteps.substring(0, 100));
    }
    // Check if we've exceeded max iterations - only force stop at absolute max
    if (state.iteration_count >= MAX_RESEARCH_ITERATIONS) {
      console.log("   ⚠️ Max iterations reached, forcing completion despite the agent wanting to continue");
      const summary = previousResultsText 
        ? `Research Summary (after ${state.iteration_count} iterations):\n\n${previousResultsText}`
        : "Research completed with available information.";
      
      return {
        decision_type: "complete",
        research_results: [summary],
        iteration_count: state.iteration_count + 1,
        complete: true,
        planning_steps: undefined, // Clear planning steps after completion
      };
    }

    // Check if we're past the threshold - warn but still allow
    if (state.iteration_count >= (MAX_RESEARCH_ITERATIONS - RESEARCH_THRESHOLD)) {
      console.log("   ⚠️ Approaching max iterations, but allowing the agent to continue");
    }

    const query = "search_query" in decision ? decision.search_query : decision.additional_query;
    
    return {
      decision_type: "search",
      pending_search_query: query,
      planning_steps: planningSteps, // Preserve planning steps for next iteration
    };
  }

  return {
    decision_type: "complete",
    ...state,
  };
};

// Node 2: Perform web search
const searchNode = async (state: WebResearcherStateType) => {
  console.log("\n🔍 [WebResearcher] Performing web search...");
  
  if (!state.pending_search_query) {
    console.log("   ⚠️ No search query found");
    return {
      decision_type: "complete",
      complete: true,
    };
  }

  console.log("   Query:", state.pending_search_query);
  
  // Perform web search
  const searchResults = await tavilySearch(state.pending_search_query, 5);
  
  console.log("   ✓ Search complete");
  
  // Add search results and continue (will loop back to analyze)
  return {
    research_results: [searchResults],
    pending_search_query: undefined,
    iteration_count: state.iteration_count + 1,
    complete: false,
    decision_type: undefined,
  };
};

const webResearcherGraph = new StateGraph({ state: WebResearcherState })
  .addNode("analyze", analyzeNode)
  .addNode("search", searchNode)
  .addEdge(START, "analyze")
  .addConditionalEdges("analyze", (state: WebResearcherStateType) => {
    if (state.decision_type === "complete") {
      return END;
    }
    if (state.decision_type === "search") {
      return "search";
    }
    // If we've reached max iterations, force completion
    if (state.iteration_count >= MAX_RESEARCH_ITERATIONS) {
      console.log("   ⚠️ Max iterations reached, forcing completion");
      return END;
    }
    // Safety fallback
    return END;
  })
  .addEdge("search", "analyze") // After search, go back to analyze
  .compile({ checkpointer: new MemorySaver() });

export { webResearcherGraph };
