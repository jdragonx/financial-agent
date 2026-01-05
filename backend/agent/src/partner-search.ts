import { StateGraph, START, END } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { withLangGraph } from "@langchain/langgraph/zod";
import { z } from "zod";
import { b } from "../baml_client/index.js";

// ============================================================================
// Partner Search Subagent
// ============================================================================

const RECOMMENDATION_SERVICE_URL = process.env.RECOMMENDATION_SERVICE_URL || "http://localhost:8000";

// Schema for partner results from the API
const PartnerResultSchema = z.object({
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
});

const SearchResultSchema = z.object({
  partner: PartnerResultSchema,
  score: z.number(),
});

// Reducer to merge partner results arrays
function partnerResultsReducer(
  left: z.infer<typeof SearchResultSchema>[] | null | undefined,
  right: z.infer<typeof SearchResultSchema>[] | null | undefined,
): z.infer<typeof SearchResultSchema>[] {
  if (right != null && right.length > 0) {
    return [...(left || []), ...right];
  }
  return left || [];
}

const PartnerSearchState = z.object({
  // Input
  original_query: z.string(),
  
  // Results from each search type
  semantic_results: withLangGraph(z.array(SearchResultSchema), {
    reducer: {
      schema: z.array(SearchResultSchema),
      fn: partnerResultsReducer,
    },
  }),
  tfidf_results: withLangGraph(z.array(SearchResultSchema), {
    reducer: {
      schema: z.array(SearchResultSchema),
      fn: partnerResultsReducer,
    },
  }),
  keyword_results: withLangGraph(z.array(SearchResultSchema), {
    reducer: {
      schema: z.array(SearchResultSchema),
      fn: partnerResultsReducer,
    },
  }),
  
  // Intermediate state for keyword search
  keyword_search_query: z.string().optional(),
  
  // Track completion of parallel branches
  semantic_complete: z.boolean().default(false),
  tfidf_complete: z.boolean().default(false),
  keyword_complete: z.boolean().default(false),
});

type PartnerSearchStateType = z.infer<typeof PartnerSearchState>;

// HTTP client for recommendation service
async function searchPartners(
  query: string,
  endpoint: "search" | "search-tfidf" | "search-keywords",
  topN: number = 5,
): Promise<z.infer<typeof SearchResultSchema>[]> {
  try {
    const response = await fetch(`${RECOMMENDATION_SERVICE_URL}/recommendations/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        top_n: topN,
      }),
    });

    if (!response.ok) {
      console.warn(`   ⚠️ Partner search failed for ${endpoint}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.warn(`   ⚠️ Partner search error for ${endpoint}:`, error);
    return [];
  }
}

// Node: Semantic search (embedding-based)
const semanticSearchNode = async (state: PartnerSearchStateType) => {
  console.log("\n🔍 [PartnerSearch] Performing semantic search...");
  console.log("   Query:", state.original_query);

  const results = await searchPartners(state.original_query, "search");
  console.log(`   ✓ Semantic search complete: ${results.length} results`);

  return {
    semantic_results: results,
    semantic_complete: true,
  };
};

// Node: TF-IDF search
const tfidfSearchNode = async (state: PartnerSearchStateType) => {
  console.log("\n🔍 [PartnerSearch] Performing TF-IDF search...");
  console.log("   Query:", state.original_query);

  const results = await searchPartners(state.original_query, "search-tfidf");
  console.log(`   ✓ TF-IDF search complete: ${results.length} results`);

  return {
    tfidf_results: results,
    tfidf_complete: true,
  };
};

// Node: Keyword agent - generates optimized keyword query
const keywordAgentNode = async (state: PartnerSearchStateType) => {
  console.log("\n🔍 [PartnerSearch] Running keyword agent...");
  console.log("   Original query:", state.original_query);

  const keywordQuery = await b.KeywordQueryAgent(state.original_query);
  console.log("   Generated keywords:", keywordQuery);

  return {
    keyword_search_query: keywordQuery,
  };
};

// Node: Keyword search - uses the generated keyword query
const keywordSearchNode = async (state: PartnerSearchStateType) => {
  console.log("\n🔍 [PartnerSearch] Performing keyword search...");
  
  const query = state.keyword_search_query || state.original_query;
  console.log("   Query:", query);

  const results = await searchPartners(query, "search-keywords");
  console.log(`   ✓ Keyword search complete: ${results.length} results`);

  return {
    keyword_results: results,
    keyword_complete: true,
  };
};

// Build the graph
// Structure: START -> parallel(semantic, tfidf, keywordAgent->keywordSearch) -> END
const partnerSearchGraph = new StateGraph({ state: PartnerSearchState })
  .addNode("semantic_search", semanticSearchNode)
  .addNode("tfidf_search", tfidfSearchNode)
  .addNode("keyword_agent", keywordAgentNode)
  .addNode("keyword_search", keywordSearchNode)
  // Parallel branches from START
  .addEdge(START, "semantic_search")
  .addEdge(START, "tfidf_search")
  .addEdge(START, "keyword_agent")
  // Keyword agent -> keyword search (sequential within this branch)
  .addEdge("keyword_agent", "keyword_search")
  // All branches converge to END
  .addEdge("semantic_search", END)
  .addEdge("tfidf_search", END)
  .addEdge("keyword_search", END)
  .compile({ checkpointer: new MemorySaver() });

export { partnerSearchGraph, PartnerSearchState, SearchResultSchema, PartnerResultSchema };
export type { PartnerSearchStateType };
