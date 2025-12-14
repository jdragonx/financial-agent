import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Message schema for chat messages
 */
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']).describe('The role of the message sender'),
  message: z.string().min(1).describe('The message content'),
});

/**
 * DTO for the request to chat with the investor agent.
 */
export class ChatRequestDto extends createZodDto(
  z.object({
    message: z
      .string()
      .min(1)
      .describe('The user message to send to the investor agent'),
    threadId: z
      .string()
      .optional()
      .describe('Optional thread ID for conversation continuity'),
    messages: z
      .array(MessageSchema)
      .optional()
      .describe('Optional conversation history as an array of messages'),
  }),
) {}

/**
 * DTO for the response from the investor agent chat.
 */
export class ChatResponseDto extends createZodDto(
  z.object({
    threadId: z.string().describe('The thread ID for this conversation'),
    messages: z
      .array(MessageSchema)
      .describe('All messages in the conversation including the new response'),
    turnCount: z
      .number()
      .describe('The number of turns in the conversation'),
    currentAction: z
      .enum(['thinking', 'researching', 'calculating', 'responding', 'asking'])
      .describe('The current action the agent is performing'),
    researchResults: z
      .string()
      .optional()
      .describe('Research results if the agent performed research'),
    calculationResults: z
      .string()
      .optional()
      .describe('Calculation results if the agent performed calculations'),
  }),
) {}

/**
 * DTO for error responses.
 */
export class ErrorResponseDto extends createZodDto(
  z.object({
    statusCode: z.number().describe('HTTP status code'),
    message: z.string().describe('Error message'),
    error: z.string().optional().describe('Error type'),
  }),
) {}

/**
 * DTO for too many requests response.
 */
export class TooManyRequestsResponseDto extends createZodDto(
  z.object({
    statusCode: z.literal(429).describe('HTTP status code'),
    message: z.string().describe('Error message'),
  }),
) {}

/**
 * DTO for the async chat response (returns immediately with threadId).
 */
export class ChatAsyncResponseDto extends createZodDto(
  z.object({
    threadId: z.string().describe('The thread ID for this conversation. Subscribe to WebSocket status updates using this ID.'),
    status: z.literal('processing').describe('The initial status indicating processing has started'),
    message: z.string().describe('Initial status message'),
  }),
) {}

