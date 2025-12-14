import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
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
  ChatAsyncResponseDto,
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

    @Post('chat-async')
    @ApiOperation({
      operationId: 'chatAsync',
      summary: 'Send a message to the investor agent asynchronously',
      description: `Send a message to the investor agent and get an immediate response with the threadId.
The agent will process the request in the background and publish status updates via Redis pub/sub.
Subscribe to WebSocket status updates using the returned threadId to receive real-time progress updates.

**Status Updates:**
- Subscribe to WebSocket namespace \`/agent-status\` 
- Emit \`subscribe\` event with the threadId
- Listen for \`status-update\` events with statuses: thinking, researching, calculating, responding, asking, complete, error

**Use Cases:**
- Long-running requests that might timeout on HTTP
- Real-time status updates for better UX
- Avoiding cloud platform HTTP timeout restrictions`,
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
      },
    })
    @ApiResponses([
      {
        status: 200,
        description: 'Request accepted, processing started. Subscribe to WebSocket for status updates.',
        type: ChatAsyncResponseDto,
        examples: {
          success: {
            summary: 'Async request accepted',
            value: {
              threadId: 'thread-550e8400-e29b-41d4-a716-446655440000',
              status: 'processing',
              message: 'Processing your request...',
            },
          },
        },
      },
      {
        status: 400,
        description: 'Bad request - invalid input',
        type: ErrorResponseDto,
      },
      {
        status: 429,
        description: 'Too many requests',
        type: TooManyRequestsResponseDto,
      },
      {
        status: 500,
        description: 'Internal server error',
        type: ErrorResponseDto,
      },
    ])
    async chatAsync(@Body() body: ChatRequestDto): Promise<ChatAsyncResponseDto> {
      const result = await this.investorAgentService.chatAsync(
        body.message,
        body.threadId,
        body.messages,
      );

      return {
        threadId: result.threadId,
        status: 'processing',
        message: 'Processing your request... Subscribe to WebSocket status updates using the threadId.',
      };
    }

    @Get('chat-async/result/:threadId')
    @ApiOperation({
      operationId: 'getAsyncResult',
      summary: 'Get the result of an async chat request',
      description: `Get the final result of an async chat request by threadId.
This endpoint should be called after receiving a 'complete' status update via WebSocket.
Results are cached for 5 minutes after completion.`,
    })
    @ApiResponses([
      {
        status: 200,
        description: 'Result found and returned',
        type: ChatResponseDto,
      },
      {
        status: 404,
        description: 'Result not found or expired',
        type: ErrorResponseDto,
      },
    ])
    async getAsyncResult(
      @Param('threadId') threadId: string,
    ): Promise<ChatResponseDto> {
      const result = this.investorAgentService.getAsyncResult(threadId);
      
      if (!result) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Result not found or expired. The request may still be processing or the result has been cleaned up.',
            error: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

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

