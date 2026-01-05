import { StateGraph, START, END } from "@langchain/langgraph";
import { withLangGraph } from "@langchain/langgraph/zod";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { b } from "../baml_client/index.js";
import type { Message, PartnerInfo } from "../baml_client/types.js";
import { webResearcherGraph } from "./web-researcher.js";
import { calculatorGraph } from "./calculator.js";
import { publishStatusUpdate } from "./status-publisher.js";
import { partnerSearchGraph, SearchResultSchema } from "./partner-search.js";

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

// Schema for partner search results
const PartnerSearchResultSchema = z.object({
  partner: z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable(),
    industry: z.string().nullable(),
    location: z.string().nullable(),
    website: z.string().nullable(),
    contact_email: z.string().nullable(),
    contact_phone: z.string().nullable(),
    additional_data: z.record(z.any()).nullable(),
    created_at: z.string(),
    updated_at: z.string().nullable(),
  }),
  score: z.number(),
});

const InvestorAgentState = z.object({
  // Input field: accepts either a simple string (for Studio UX) or formatted messages
  input: z.union([
    z.string(),
    z.array(MessageSchema),
  ]).optional(),
  threadId: z.string().optional(), // Thread ID for status updates
  messages: withLangGraph(z.array(MessageSchema), {
    reducer: {
      schema: z.array(MessageSchema),
      fn: messagesReducer,
    },
  }),
  turnCount: z.number().default(0),
  research_results: z.string().optional(),
  calculation_results: z.string().optional(),
  // Accumulated results from multiple steps (for multi-step workflows)
  accumulated_research_results: z.array(z.string()).default([]),
  accumulated_calculation_results: z.array(z.string()).default([]),
  current_action: z.enum(["thinking", "researching", "calculating", "responding", "asking"]).default("thinking"),
  pending_research_query: z.string().optional(),
  pending_calculation_request: z.string().optional(),
  planning_steps: z.string().optional(),
  
  // Partner search results (populated by sequential partner search)
  partner_semantic_results: z.array(PartnerSearchResultSchema).default([]),
  partner_tfidf_results: z.array(PartnerSearchResultSchema).default([]),
  partner_keyword_results: z.array(PartnerSearchResultSchema).default([]),
  
  // For partner integration
  agent_response_for_integration: z.string().optional(),
  featured_partner: z.object({
    id: z.number(),
    name: z.string(),
    description: z.string(),
    industry: z.string(),
    website: z.string(),
  }).optional(),
});

type InvestorAgentStateType = z.infer<typeof InvestorAgentState>;

// ============================================================================
// Main Agent Nodes
// ============================================================================

const thinkNode = async (state: InvestorAgentStateType) => {
  console.log("\n💭 [InvestorAgent] Thinking...");
  console.log("   Messages:", state.messages?.length ?? 0);
  console.log("   Turn:", state.turnCount);
  console.log("   Has research results:", !!state.research_results);
  console.log("   Has calculation results:", !!state.calculation_results);

  // Publish status update
  if (state.threadId) {
    await publishStatusUpdate(
      state.threadId,
      "thinking",
      "Analyzing your request and planning the next steps...",
    );
  }

  // Convert messages to BAML Message format (BAML will format them using PrintMessages template)
  const messages: Message[] = (state.messages || []).map(msg => ({
    role: msg.role as "user" | "assistant",
    message: msg.message,
  }));

  // Combine current results with accumulated results for multi-step workflows
  // Current results are from the most recent subagent call
  // Accumulated results are from previous steps in the same workflow
  const allResearchResults = [
    ...(state.accumulated_research_results || []),
    ...(state.research_results ? [state.research_results] : []),
  ];
  const allCalculationResults = [
    ...(state.accumulated_calculation_results || []),
    ...(state.calculation_results ? [state.calculation_results] : []),
  ];

  // Format combined results for the prompt
  const combinedResearchResults = allResearchResults.length > 0
    ? allResearchResults.join("\n\n---\n\n")
    : undefined;
  const combinedCalculationResults = allCalculationResults.length > 0
    ? allCalculationResults.join("\n\n---\n\n")
    : undefined;

  // Only pass research/calculation results if they exist
  const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
  const decision = await b.InvestorAgent(
    messages,
    combinedResearchResults,
    combinedCalculationResults,
    state.planning_steps, // Pass planning steps so agent remembers the plan
    currentDate
  );

  // Clear current results (they're now in accumulated), but keep accumulated for next step
  // Only clear accumulated results when we're actually responding/asking (workflow complete)
  const clearCurrentResults = {
    research_results: undefined,
    calculation_results: undefined,
  };

  if ("research_query" in decision) {
    const planningSteps = "planning_steps" in decision ? decision.planning_steps : undefined;
    if (planningSteps) {
      console.log("   📋 Planning steps:", planningSteps);
    }
    console.log("   → Need research:", decision.research_query);
    
    // Publish status update
    if (state.threadId) {
      await publishStatusUpdate(
        state.threadId,
        "researching",
        `Researching: ${decision.research_query}`,
        planningSteps,
      );
    }
    
    return {
      current_action: "researching",
      pending_research_query: decision.research_query,
      planning_steps: planningSteps, // Store planning steps for reference
      ...clearCurrentResults, // Clear current results (they're in accumulated)
    };
  } else if ("calculation_request" in decision) {
    const planningSteps = "planning_steps" in decision ? decision.planning_steps : undefined;
    if (planningSteps) {
      console.log("   📋 Planning steps:", planningSteps);
    }
    console.log("   → Need calculation:", decision.calculation_request);
    
    // Publish status update
    if (state.threadId) {
      await publishStatusUpdate(
        state.threadId,
        "calculating",
        `Calculating: ${decision.calculation_request}`,
        planningSteps,
      );
    }
    
    return {
      current_action: "calculating",
      pending_calculation_request: decision.calculation_request,
      planning_steps: planningSteps, // Store planning steps for reference
      ...clearCurrentResults, // Clear current results (they're in accumulated)
    };
  } else if ("question" in decision) {
    console.log("   → Need more info:", decision.question);
    
    // Publish status update
    if (state.threadId) {
      await publishStatusUpdate(
        state.threadId,
        "asking",
        "Need more information to proceed",
      );
    }
    
    // Questions don't need partner integration - return directly
    return {
      current_action: "asking",
      messages: [{ role: "assistant", message: decision.question }],
      ...clearCurrentResults, // Clear current results
      // Clear accumulated results since workflow is complete
      accumulated_research_results: [],
      accumulated_calculation_results: [],
    };
  } else if ("response" in decision) {
    console.log("   → Ready to respond");
    
    // Publish status update
    if (state.threadId) {
      await publishStatusUpdate(
        state.threadId,
        "responding",
        "Preparing response...",
      );
    }
    
    // Store response for partner integration instead of adding to messages directly
    return {
      current_action: "responding",
      agent_response_for_integration: decision.response,
      turnCount: state.turnCount + 1,
      planning_steps: undefined, // Clear planning steps after completing the plan
      ...clearCurrentResults, // Clear current results
      // Clear accumulated results since workflow is complete
      accumulated_research_results: [],
      accumulated_calculation_results: [],
    };
  }

  return {
    ...state,
    ...clearCurrentResults, // Clear current results even if no decision made
  };
};

const researchNode = async (state: InvestorAgentStateType) => {
  console.log("\n🔍 [InvestorAgent] Delegating to WebResearcher...");
  
  if (!state.pending_research_query) {
    console.log("   ⚠️ No research query found, returning to thinking");
    return { current_action: "thinking" };
  }

  // Publish status update
  if (state.threadId) {
    await publishStatusUpdate(
      state.threadId,
      "researching",
      `Searching the web for: ${state.pending_research_query}`,
    );
  }

  const researchResult = await webResearcherGraph.invoke(
    {
      original_query: state.pending_research_query,
      research_results: [],
      iteration_count: 0,
      complete: false, // Explicitly required - no default in schema
    },
      { configurable: { thread_id: `research-${state.turnCount}-${Date.now()}` } }
  );

  const finalResults = (researchResult.research_results || []).join("\n\n");
  console.log("   ✓ Research complete");

  // Publish status update with research results
  if (state.threadId) {
    await publishStatusUpdate(
      state.threadId,
      "researching",
      "Research completed, analyzing results...",
      undefined,
      finalResults.substring(0, 500), // Limit size for status update
    );
  }

  return {
    research_results: finalResults, // Current result (will be added to accumulated in next think)
    // Add to accumulated results for multi-step workflows
    accumulated_research_results: [
      ...(state.accumulated_research_results || []),
      finalResults,
    ],
    current_action: "thinking", // Go back to thinking with new research
    pending_research_query: undefined, // Clear the pending query
    // Keep planning_steps so agent remembers the full plan
  };
};

const calculateNode = async (state: InvestorAgentStateType) => {
  console.log("\n🧮 [InvestorAgent] Delegating to Calculator...");
  
  if (!state.pending_calculation_request) {
    console.log("   ⚠️ No calculation request found, returning to thinking");
    return { current_action: "thinking" };
  }

  // Publish status update
  if (state.threadId) {
    await publishStatusUpdate(
      state.threadId,
      "calculating",
      `Executing calculation: ${state.pending_calculation_request}`,
    );
  }

  const calcResult = await calculatorGraph.invoke(
    {
      calculation_request: state.pending_calculation_request,
      iteration_count: 0,
      complete: false,
      all_execution_results: [], // Explicitly initialize to prevent undefined
    },
    { configurable: { thread_id: `calc-${state.turnCount}-${Date.now()}` } }
  );

  const finalResult = calcResult.python_code_response || "Calculation completed";
  console.log("   ✓ Calculation complete");

  // Publish status update with calculation results
  if (state.threadId) {
    await publishStatusUpdate(
      state.threadId,
      "calculating",
      "Calculation completed, analyzing results...",
      undefined,
      undefined,
      finalResult.substring(0, 500), // Limit size for status update
    );
  }

  // Return calculation results - they will be available for the next thinkNode call
  return {
    calculation_results: finalResult, // Current result (will be added to accumulated in next think)
    // Add to accumulated results for multi-step workflows
    accumulated_calculation_results: [
      ...(state.accumulated_calculation_results || []),
      finalResult,
    ],
    current_action: "thinking", // Go back to thinking with new calculation
    pending_calculation_request: undefined, // Clear the pending request
    // Keep planning_steps so agent remembers the full plan
  };
};

// Partner search node - runs sequentially after agent responds
const partnerSearchNode = async (state: InvestorAgentStateType) => {
  console.log("\n🤝 [InvestorAgent] Running partner search...");
  
  // Get the original user query from messages
  const userMessages = (state.messages || []).filter(m => m.role === "user");
  const originalQuery = userMessages.length > 0 
    ? userMessages[userMessages.length - 1].message 
    : "";
  
  if (!originalQuery) {
    console.log("   ⚠️ No user query found for partner search");
    return {};
  }

  console.log("   Query:", originalQuery);

  try {
    const searchResult = await partnerSearchGraph.invoke(
      {
        original_query: originalQuery,
        semantic_results: [],
        tfidf_results: [],
        keyword_results: [],
      },
      { configurable: { thread_id: `partner-search-${Date.now()}` } }
    );

    console.log("   ✓ Partner search complete");
    console.log(`     Semantic: ${searchResult.semantic_results?.length || 0} results`);
    console.log(`     TF-IDF: ${searchResult.tfidf_results?.length || 0} results`);
    console.log(`     Keyword: ${searchResult.keyword_results?.length || 0} results`);

    return {
      partner_semantic_results: searchResult.semantic_results || [],
      partner_tfidf_results: searchResult.tfidf_results || [],
      partner_keyword_results: searchResult.keyword_results || [],
    };
  } catch (error) {
    console.warn("   ⚠️ Partner search failed:", error);
    return {};
  }
};


// Partner integration node - decides whether to feature a partner
const partnerIntegrationNode = async (state: InvestorAgentStateType) => {
  console.log("\n🤝 [InvestorAgent] Running partner integration...");
  
  // Get the agent's response that needs potential partner integration
  const agentResponse = state.agent_response_for_integration;
  if (!agentResponse) {
    console.log("   ⚠️ No agent response to integrate");
    return {};
  }

  // Get the original user query
  const userMessages = (state.messages || []).filter(m => m.role === "user");
  const originalQuery = userMessages.length > 0 
    ? userMessages[userMessages.length - 1].message 
    : "";

  // Combine and deduplicate partner results
  const allResults = [
    ...(state.partner_semantic_results || []),
    ...(state.partner_tfidf_results || []),
    ...(state.partner_keyword_results || []),
  ];
  
  // Deduplicate by partner ID
  const seenIds = new Set<number>();
  const uniquePartners: PartnerInfo[] = [];
  for (const result of allResults) {
    if (!seenIds.has(result.partner.id)) {
      seenIds.add(result.partner.id);
      uniquePartners.push({
        id: result.partner.id,
        name: result.partner.name,
        description: result.partner.description || "",
        industry: result.partner.industry || "",
        website: result.partner.website || "",
      });
    }
  }

  if (uniquePartners.length === 0) {
    console.log("   No partners to consider");
    return {
      messages: [{ role: "assistant", message: agentResponse }],
      agent_response_for_integration: undefined,
    };
  }

  console.log(`   Considering ${uniquePartners.length} unique partners`);

  try {
    const decision = await b.PartnerIntegrationAgent(
      originalQuery,
      agentResponse,
      uniquePartners,
    );

    if ("updated_response" in decision) {
      console.log(`   ✓ Featuring partner: ${decision.partner.name}`);
      return {
        messages: [{ role: "assistant", message: decision.updated_response }],
        featured_partner: decision.partner,
        agent_response_for_integration: undefined,
      };
    } else {
      console.log(`   ✓ No partner featured: ${decision.reason}`);
      return {
        messages: [{ role: "assistant", message: agentResponse }],
        agent_response_for_integration: undefined,
      };
    }
  } catch (error) {
    console.warn("   ⚠️ Partner integration failed:", error);
    return {
      messages: [{ role: "assistant", message: agentResponse }],
      agent_response_for_integration: undefined,
    };
  }
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

// Graph with input transformation for better LangGraph Studio UX
// This allows users to type a simple string instead of [{role: "user", message: "..."}]
const investorAgentGraph = new StateGraph({ state: InvestorAgentState })
  .addNode("format_input", formatInputNode)
  .addNode("think", thinkNode)
  .addNode("research", researchNode)
  .addNode("calculate", calculateNode)
  .addNode("partner_search", partnerSearchNode)
  .addNode("partner_integration", partnerIntegrationNode)
  .addEdge(START, "format_input")
  .addEdge("format_input", "think")
  .addConditionalEdges("think", (state: InvestorAgentStateType) => {
    // Route based on current_action set by thinkNode
    if (state.current_action === "researching") return "research";
    if (state.current_action === "calculating") return "calculate";
    if (state.current_action === "asking") return END; // Questions skip partner integration
    if (state.current_action === "responding") return "partner_search"; // Sequential: search then integrate
    return "think"; // Continue thinking if needed
  })
  .addEdge("research", "think") // After research, go back to thinking
  .addEdge("calculate", "think") // After calculation, go back to thinking
  .addEdge("partner_search", "partner_integration") // After search, integrate
  .addEdge("partner_integration", END)
  .compile({ checkpointer: new MemorySaver() });

// Export the graph with input transformation for better Studio UX
export { investorAgentGraph };

