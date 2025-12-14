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
      // Publish error status
      await this.redisService.publishStatusUpdate(conversationThreadId, {
        threadId: conversationThreadId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
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
      // Publish error status if processing fails
      this.redisService.publishStatusUpdate(conversationThreadId, {
        threadId: conversationThreadId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }).catch((pubError) => {
        console.error('Failed to publish error status:', pubError);
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
}

