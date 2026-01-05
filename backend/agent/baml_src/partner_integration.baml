// Partner integration agent that decides whether to feature a partner in the response

class PartnerInfo {
  id int @description("The unique identifier of the partner")
  name string @description("The name of the partner company")
  description string @description("A brief description of the partner")
  industry string @description("The industry the partner operates in")
  website string @description("The partner's website URL")
}

class FeaturePartner {
  updated_response string @description("The updated response that naturally integrates the featured partner. The response should blend the partner recommendation seamlessly into the conversation, explaining why this partner could be helpful for the user's specific situation.")
  partner PartnerInfo @description("The partner to feature in the response")
}

class NoPartner {
  reason string @description("Brief reason why no partner is being featured (e.g., 'no suitable partners', 'off-topic query', 'partner would feel forced')")
}

function PartnerIntegrationAgent(
  original_query: string,
  agent_response: string,
  partner_results: PartnerInfo[],
) -> FeaturePartner | NoPartner {
  client "openai/gpt-4o-mini"
  prompt #"
    You are a partner integration specialist. Your task is to determine if any of the available partners should be featured in the response to the user.

    Original user query:
    ```
    {{ original_query }}
    ```

    Agent's response:
    ```
    {{ agent_response }}
    ```

    Available partners from search:
    {% for partner in partner_results %}
    - ID: {{ partner.id }}
      Name: {{ partner.name }}
      Description: {{ partner.description }}
      Industry: {{ partner.industry }}
      Website: {{ partner.website }}
    {% endfor %}

    DECISION CRITERIA:
    
    DO feature a partner when:
    - The user is asking about a topic where a partner could provide relevant services
    - The agent is providing actionable advice that a partner could help implement
    - There's a clear match between the user's needs and a partner's offerings
    - The response provides substantive information or recommendations

    DO NOT feature a partner when:
    - There are no suitable partners that match the user's needs
    - The query is off-topic or general conversation
    - The partner results are empty or irrelevant
    - Featuring a partner would feel forced or unnatural

    If featuring a partner:
    - Rewrite the agent's response to naturally incorporate the partner recommendation
    - Explain why this partner might be helpful for the user's specific situation
    - Keep the original advice intact while adding the partner as a resource
    - Make it feel like a helpful suggestion, not an advertisement

    {{ ctx.output_format }}
  "#
}

test partner_integration_feature {
  functions [PartnerIntegrationAgent]
  args {
    original_query "I'm looking for help with retirement planning"
    agent_response "Based on your interest in retirement planning, I recommend starting with a diversified portfolio that includes index funds and bonds. Consider maximizing your 401(k) contributions and opening a Roth IRA for tax-advantaged growth."
    partner_results [
      {
        id 1
        name "Vanguard Financial Advisors"
        description "Full-service financial planning and retirement advisory services"
        industry "Financial Services"
        website "https://vanguard.com"
      }
    ]
  }
}

test partner_integration_no_partner {
  functions [PartnerIntegrationAgent]
  args {
    original_query "What is the current price of AAPL?"
    agent_response "The current price of Apple Inc. (AAPL) is $175.50 per share as of today. The stock has shown strong performance this quarter with a 12% increase."
    partner_results []
  }
}
