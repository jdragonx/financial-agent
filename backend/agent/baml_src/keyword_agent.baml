// Keyword agent that converts natural language queries to keyword-based search terms

function KeywordQueryAgent(
  original_query: string,
) -> string {
  client "openai/gpt-4o-mini"
  prompt #"
    You are a keyword extraction specialist. Your task is to convert a natural language query into effective keyword-based search terms.

    Original query:
    ```
    {{ original_query }}
    ```

    Extract the most important keywords and phrases that would be effective for a keyword-based search.
    Focus on:
    - Key entities (companies, products, services, industries)
    - Action words and descriptors
    - Domain-specific terms

    Return ONLY the keywords/phrases separated by spaces, no punctuation or explanation.
    Example: "fintech payment processing startup Series A"

    {{ ctx.output_format }}
  "#
}
