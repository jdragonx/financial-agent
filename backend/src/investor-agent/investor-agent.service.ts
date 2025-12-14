import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { investorAgentGraph } from '../../agent/src/investor_agent.js';
import { initializeStatusPublisher } from '../../agent/src/status-publisher.js';
import type { Message } from './investor-agent.interface.js';
import {
  ChatResult,
  InvestorAgentProvider,
} from './investor-agent.interface.js';
import { RedisService } from '../redis/redis.service.js';

// Store final results temporarily (in production, use Redis with TTL)
const resultCache = new Map<string, { result: ChatResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class InvestorAgentService implements InvestorAgentProvider {
  constructor(
    @Inject(RedisService)
    private readonly redisService: RedisService,
  ) {
    // Initialize the status publisher so the agent graph can use it
    initializeStatusPublisher(redisService);
  }

  async chat(
    message: string,
    threadId?: string,
    messages?: Message[],
  ): Promise<ChatResult> {
    // Generate a new thread ID if not provided
    // Each threadId represents a separate conversation context
    const conversationThreadId = threadId || `thread-${randomUUID()}`;

    // Publish initial status
    await this.redisService.publishStatusUpdate(conversationThreadId, {
      threadId: conversationThreadId,
      status: 'thinking',
      message: 'Processing your request...',
    });

    // Prepare the input state
    // LangGraph's MemorySaver checkpointer automatically:
    // - Loads previous conversation state when thread_id exists
    // - Saves new state after execution
    // - Each thread_id maintains its own independent conversation
    const inputState: {
      input?: string | Message[];
      threadId?: string;
    } = {
      threadId: conversationThreadId,
    };

    if (messages && messages.length > 0) {
      // If explicit conversation history is provided, use it
      // This allows clients to manage their own conversation state
      // Note: This will replace the checkpointer's stored state for this thread
      inputState.input = messages;
    } else {
      // Send just the new message
      // For new conversations: starts fresh
      // For continuing conversations: checkpointer loads previous messages,
      // formatInputNode adds the new message, and messagesReducer appends it
      inputState.input = message;
    }

    try {
      // Invoke the LangGraph agent with the thread_id
      // The checkpointer handles state persistence automatically
      // Status updates are published by the agent graph nodes
      const result = await investorAgentGraph.invoke(inputState, {
        configurable: { thread_id: conversationThreadId },
      });

      // Extract messages from the result
      // The result includes all messages: previous (from checkpointer) + new ones
      const resultMessages: Message[] = (result.messages || []).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        message: msg.message,
      }));

      const chatResult: ChatResult = {
        threadId: conversationThreadId,
        messages: resultMessages, // Complete conversation history
        turnCount: result.turnCount || 0,
        currentAction: result.current_action || 'responding',
        researchResults: result.research_results,
        calculationResults: result.calculation_results,
      };

      // Store result in cache for async requests
      resultCache.set(conversationThreadId, {
        result: chatResult,
        timestamp: Date.now(),
      });

      // Clean up old cache entries
      this.cleanupCache();

      // Publish completion status
      await this.redisService.publishStatusUpdate(conversationThreadId, {
        threadId: conversationThreadId,
        status: 'complete',
        message: 'Response ready',
        researchResults: result.research_results,
        calculationResults: result.calculation_results,
      });

      return chatResult;
    } catch (error) {
      // Log full error with stacktrace for debugging
      console.error('Error in investor agent chat:', {
        threadId: conversationThreadId,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        } : error,
      });

      // Convert technical error to user-friendly message
      const userFriendlyError = this.getUserFriendlyError(error);

      // Publish user-friendly error status to frontend
      await this.redisService.publishStatusUpdate(conversationThreadId, {
        threadId: conversationThreadId,
        status: 'error',
        error: userFriendlyError,
      });
      throw error;
    }
  }

  async chatAsync(
    message: string,
    threadId?: string,
    messages?: Message[],
  ): Promise<{ threadId: string }> {
    // Generate a new thread ID if not provided
    const conversationThreadId = threadId || `thread-${randomUUID()}`;

    // Publish initial status
    await this.redisService.publishStatusUpdate(conversationThreadId, {
      threadId: conversationThreadId,
      status: 'thinking',
      message: 'Processing your request...',
    });

    // Process in the background (don't await)
    this.chat(message, conversationThreadId, messages).catch((error) => {
      // Log full error with stacktrace for debugging
      console.error('Error in investor agent chatAsync:', {
        threadId: conversationThreadId,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        } : error,
      });

      // Convert technical error to user-friendly message
      const userFriendlyError = this.getUserFriendlyError(error);

      // Publish user-friendly error status to frontend
      this.redisService.publishStatusUpdate(conversationThreadId, {
        threadId: conversationThreadId,
        status: 'error',
        error: userFriendlyError,
      }).catch((pubError) => {
        console.error('Failed to publish error status:', {
          threadId: conversationThreadId,
          error: pubError instanceof Error ? {
            message: pubError.message,
            stack: pubError.stack,
            name: pubError.name,
          } : pubError,
        });
      });
    });

    // Return immediately with threadId
    return { threadId: conversationThreadId };
  }

  /**
   * Get the result for an async request by threadId
   */
  getAsyncResult(threadId: string): ChatResult | null {
    const cached = resultCache.get(threadId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }
    // Clean up expired entry
    if (cached) {
      resultCache.delete(threadId);
    }
    return null;
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [threadId, cached] of resultCache.entries()) {
      if (now - cached.timestamp >= CACHE_TTL) {
        resultCache.delete(threadId);
      }
    }
  }

  /**
   * Convert technical errors to user-friendly messages
   * Technical details are logged but not shown to users
   */
  private getUserFriendlyError(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'An unexpected error occurred. Please try again.';
    }

    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    // Type errors, null assertions, etc. - technical errors users don't need to see
    if (
      errorName.includes('type') ||
      errorName.includes('null') ||
      errorName.includes('undefined') ||
      errorName.includes('assertion') ||
      errorMessage.includes('cannot read property') ||
      errorMessage.includes('is not defined') ||
      errorMessage.includes('is not a function')
    ) {
      return 'An internal error occurred. Our team has been notified. Please try again in a moment.';
    }

    // Network/timeout errors
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('connection')
    ) {
      return 'Connection issue. Please check your internet connection and try again.';
    }

    // API/service errors
    if (
      errorMessage.includes('api') ||
      errorMessage.includes('service') ||
      errorMessage.includes('500') ||
      errorMessage.includes('503')
    ) {
      return 'Service temporarily unavailable. Please try again in a moment.';
    }

    // Authentication/authorization errors
    if (
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('401') ||
      errorMessage.includes('403')
    ) {
      return 'Authentication error. Please refresh the page and try again.';
    }

    // Rate limiting
    if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('429')
    ) {
      return 'Too many requests. Please wait a moment and try again.';
    }

    // Validation errors - these might be user-friendly already
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      // Check if it's a user input validation error (keep it) or technical validation (hide it)
      if (
        errorMessage.includes('message') ||
        errorMessage.includes('input') ||
        errorMessage.includes('required')
      ) {
        // User input validation - show a simplified version
        return 'Invalid input. Please check your message and try again.';
      }
      return 'An error occurred processing your request. Please try again.';
    }

    // Default: Generic user-friendly message
    // Full error details are already logged for debugging
    return 'Something went wrong. Please try again. If the problem persists, contact support.';
  }
}

