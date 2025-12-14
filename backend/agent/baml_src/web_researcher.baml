// Web researcher subagent that uses Tavily to search the web
class SearchQuery {
  search_query string @description("The search query to send to Tavily. Use this only if you want to search a completely new topic, or is the first search you are doing.")
}

class ResearchComplete {
  research_summary string @description("A comprehensive summary of all research findings. Use this only if you have comprehensive information covering all aspects of the original query")
}

class NeedMoreResearch {
  additional_query string @description("An additional search query needed to complete the research. Use this only if you need to search for more information to provide a complete answer.")
}

function WebResearcher(
  original_query: string,
  previous_results: string?,
  new_search_results: string?,
  iteration_count: int,
  max_iterations: int,
  current_date: string,
) -> SearchQuery | ResearchComplete | NeedMoreResearch {
  client "openai/gpt-4o-mini"
  prompt #"
    You are a web research specialist. Your task is to gather comprehensive information using web searches.

    Current date: {{ current_date }}
    Use this date as the reference point for all time-sensitive information (e.g., "current", "recent", "this year", etc.).

    Original research request:
    {{ original_query }}

    {% if previous_results %}
      Previous research findings:
      {{ previous_results }}
    {% endif %}

    {% if new_search_results %}
      Latest search results:
      {{ new_search_results }}
    {% endif %}

    Current iteration: {{ iteration_count }} / {{ max_iterations }}

    Your goal is to:
    1. Determine if you need to search for more information
    2. Determine if you have enough information to provide a complete answer

    IMPORTANT: If the iteration count ({{ iteration_count }}) is equal to or greater than the max iterations ({{ max_iterations }}), you MUST return ResearchComplete with a summary of all the research findings you have gathered so far, even if it's not complete. Do not request more research when you've reached the limit.

    {{ ctx.output_format }}
  "#
}

