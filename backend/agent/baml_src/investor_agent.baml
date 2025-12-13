// Message type for conversation history
class Message {
  role string @description("The role of the message sender: 'user' or 'assistant'")
  message string @description("The message content")
}

// Template to format messages for the prompt
template_string PrintMessages(messages: Message[]) #"
  {% for m in messages %}
    {{ _.role(m.role) }}
    {{ m.message }}
  {% endfor %}
"#

// Main investor agent that coordinates subagents
class InvestorResponse {
  response string @description("The response to the user with financial advice or plan. Use this only if you have enough information to provide a complete answer")
}

class NeedResearch {
  research_query string @description("The query to search for on the web. Use this only if you need to research current market data, trends, or company information")
}

class NeedCalculation {
  calculation_request string @description("The request for a complex calculation. Use this only if you need to perform financial calculations (ROI, compound interest, portfolio analysis, etc.)")
}

class NeedMoreInfo {
  question string @description("A question to ask the user for more information. Use this only if you need more information from the user to provide a complete answer")
}

function InvestorAgent(
  messages: Message[],
  research_results: string?,
  calculation_results: string?,
) -> InvestorResponse | NeedResearch | NeedCalculation | NeedMoreInfo {
  client "openai/gpt-4o-mini"
  prompt #"
    You are an expert financial advisor helping investors make informed decisions.
    Your goal is to provide comprehensive financial planning and investment advice.

    Conversation history:
    {{ PrintMessages(messages) }}

    {% if research_results %}
      Web research results:
      {{ research_results }}
      
      IMPORTANT: If research results are provided above, you MUST use them to form your response.
      Do NOT request new research if you already have research results that answer the question.
      Only request new research if:
      - No research results are provided, OR
      - The existing research results don't answer the question, OR
      - You need to research a completely different topic.
    {% endif %}

    {% if calculation_results %}
      Calculation results:
      {{ calculation_results }}
      
      IMPORTANT: If calculation results are provided above, you MUST use them to form your response. 
      Do NOT request a new calculation if you already have calculation results that answer the question.
      Only request a new calculation if:
      - No calculation results are provided, OR
      - The existing calculation results don't answer the question, OR
      - A completely different calculation is needed for a different question.
    {% endif %}

    Do not EVER try to make a calculation yourself. Always delegate using a calculation request.
    However, if calculation results are already provided above, use them instead of requesting a new calculation.

    Based on the conversation and any available information:

    {{ ctx.output_format }}
  "#
}

test tech_stocks_investment {
  functions [InvestorAgent]
  args {
    messages [
      {
        role "user"
        message "I'm interested in investing in tech stocks. What is the current market trend for tech stocks?"
      }
    ]
  }
}
