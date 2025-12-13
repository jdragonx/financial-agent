import {
  Body,
  Controller,
  Inject,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { ApiResponses } from '../../lib/swagger.js';
import {
  INVESTOR_AGENT_PROVIDER,
  InvestorAgentProvider,
} from '../investor-agent/index.js';
import {
  ChatRequestDto,
  ChatResponseDto,
  ErrorResponseDto,
  TooManyRequestsResponseDto,
} from './dto/investor-agent.dto.js';

@Controller('investor-agent')
@ApiTags('investor-agent')
@UsePipes(ZodValidationPipe)
export class InvestorAgentController {
  constructor(
    @Inject(INVESTOR_AGENT_PROVIDER)
    private readonly investorAgentService: InvestorAgentProvider,
  ) {}

  @Post('chat')
  @ApiOperation({
    operationId: 'chat',
    summary: 'Send a message to the investor agent and get a response',
    description: `Send a message to the investor agent. The agent can:
- Perform web research on investment topics
- Execute Python calculations for financial analysis
- Ask clarifying questions when needed
- Provide direct investment advice and insights

**Conversation Management:**
- Each request without a \`threadId\` starts a new conversation
- Include a \`threadId\` from a previous response to continue the same conversation
- The agent maintains conversation context within a thread
- Each thread is independent - different users should use different threadIds

**Example Usage:**
1. First message: Send \`{"message": "What is the current price of AAPL?"}\`
2. Continue conversation: Use the \`threadId\` from the response in subsequent requests
3. The agent remembers the conversation context within the same thread`,
  })
  @ApiBody({
    description: 'Chat request with message and optional conversation context',
    examples: {
      newConversation: {
        summary: 'Starting a new conversation',
        value: {
          message: 'What is the current price of AAPL?',
        },
      },
      continueConversation: {
        summary: 'Continuing an existing conversation',
        value: {
          message: 'What about its market cap?',
          threadId: 'thread-12345-abcde',
        },
      },
      withHistory: {
        summary: 'Providing conversation history manually',
        value: {
          message: 'Can you compare it to MSFT?',
          threadId: 'thread-12345-abcde',
          messages: [
            { role: 'user', message: 'What is the current price of AAPL?' },
            { role: 'assistant', message: 'The current price of AAPL is $150.25...' },
            { role: 'user', message: 'What about its market cap?' },
            { role: 'assistant', message: 'AAPL has a market cap of $2.4 trillion...' },
          ],
        },
      },
    },
  })
  @ApiResponses([
    {
      status: 200,
      description: 'The agent successfully processed the message and returned a response',
      type: ChatResponseDto,
      examples: {
        success: {
          summary: 'Successful response with research',
          value: {
            threadId: 'thread-550e8400-e29b-41d4-a716-446655440000',
            messages: [
              {
                role: 'user',
                message: 'What is the current price of AAPL?',
              },
              {
                role: 'assistant',
                message: 'The current price of Apple Inc. (AAPL) is approximately $150.25 per share as of the latest market data. The stock has shown strong performance recently with a market cap of around $2.4 trillion.',
              },
            ],
            turnCount: 1,
            currentAction: 'responding',
            researchResults: 'Research findings: AAPL current price is $150.25, market trends show positive momentum, analyst ratings are mostly bullish...',
          },
        },
        withCalculation: {
          summary: 'Response with calculation results',
          value: {
            threadId: 'thread-550e8400-e29b-41d4-a716-446655440000',
            messages: [
              {
                role: 'user',
                message: 'Calculate the P/E ratio if AAPL has earnings of $6.11 per share',
              },
              {
                role: 'assistant',
                message: 'The P/E ratio for AAPL is approximately 24.6, calculated by dividing the current price of $150.25 by the earnings per share of $6.11.',
              },
            ],
            turnCount: 1,
            currentAction: 'responding',
            calculationResults: 'P/E Ratio = $150.25 / $6.11 = 24.6',
          },
        },
      },
    },
    {
      status: 400,
      description: 'Bad request - invalid input',
      type: ErrorResponseDto,
      examples: {
        validationError: {
          summary: 'Validation error',
          value: {
            statusCode: 400,
            message: 'Validation failed',
            error: 'Bad Request',
          },
        },
      },
    },
    {
      status: 429,
      description: 'Too many requests',
      type: TooManyRequestsResponseDto,
      examples: {
        rateLimit: {
          summary: 'Rate limit exceeded',
          value: {
            statusCode: 429,
            message: 'ThrottlerException: Too Many Requests',
          },
        },
      },
    },
    {
      status: 500,
      description: 'Internal server error',
      type: ErrorResponseDto,
      examples: {
        serverError: {
          summary: 'Internal server error',
          value: {
            statusCode: 500,
            message: 'Internal server error',
            error: 'Internal Server Error',
          },
        },
      },
    },
  ])
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponseDto> {
    const result = await this.investorAgentService.chat(
      body.message,
      body.threadId,
      body.messages,
    );

    return {
      threadId: result.threadId,
      messages: result.messages,
      turnCount: result.turnCount,
      currentAction: result.currentAction,
      researchResults: result.researchResults,
      calculationResults: result.calculationResults,
    };
  }
}

