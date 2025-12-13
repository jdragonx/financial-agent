import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { investorAgentGraph } from '../../agent/src/investor_agent.js';
import type { Message } from './investor-agent.interface.js';
import {
  ChatResult,
  INVESTOR_AGENT_PROVIDER,
  InvestorAgentProvider,
} from './investor-agent.interface.js';

@Injectable()
export class InvestorAgentService implements InvestorAgentProvider {
  constructor() {}

  async chat(
    message: string,
    threadId?: string,
    messages?: Message[],
  ): Promise<ChatResult> {
    // Generate a new thread ID if not provided
    // Each threadId represents a separate conversation context
    const conversationThreadId = threadId || `thread-${randomUUID()}`;

    // Prepare the input state
    // LangGraph's MemorySaver checkpointer automatically:
    // - Loads previous conversation state when thread_id exists
    // - Saves new state after execution
    // - Each thread_id maintains its own independent conversation
    const inputState: {
      input?: string | Message[];
    } = {};

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

    // Invoke the LangGraph agent with the thread_id
    // The checkpointer handles state persistence automatically
    const result = await investorAgentGraph.invoke(inputState, {
      configurable: { thread_id: conversationThreadId },
    });

    // Extract messages from the result
    // The result includes all messages: previous (from checkpointer) + new ones
    const resultMessages: Message[] = (result.messages || []).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      message: msg.message,
    }));

    return {
      threadId: conversationThreadId,
      messages: resultMessages, // Complete conversation history
      turnCount: result.turnCount || 0,
      currentAction: result.current_action || 'responding',
      researchResults: result.research_results,
      calculationResults: result.calculation_results,
    };
  }
}

