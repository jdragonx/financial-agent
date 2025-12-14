/**
 * Message type for chat messages
 */
export interface Message {
  role: 'user' | 'assistant';
  message: string;
}

/**
 * The result of chatting with the investor agent.
 */
export interface ChatResult {
  /**
   * The thread ID for this conversation.
   */
  threadId: string;

  /**
   * All messages in the conversation.
   */
  messages: Message[];

  /**
   * The number of turns in the conversation.
   */
  turnCount: number;

  /**
   * The current action the agent is performing.
   */
  currentAction: 'thinking' | 'researching' | 'calculating' | 'responding' | 'asking';

  /**
   * Research results if the agent performed research.
   */
  researchResults?: string;

  /**
   * Calculation results if the agent performed calculations.
   */
  calculationResults?: string;
}

/**
 * A service that provides access to the investor agent.
 */
export interface InvestorAgentProvider {
  /**
   * Sends a message to the investor agent and returns the response.
   * @param message The user message to send.
   * @param threadId Optional thread ID for conversation continuity.
   * @param messages Optional conversation history.
   */
  chat(
    message: string,
    threadId?: string,
    messages?: Message[],
  ): Promise<ChatResult>;

  /**
   * Sends a message to the investor agent asynchronously.
   * Returns immediately with the threadId, then processes in the background.
   * Status updates are published via Redis pub/sub and can be subscribed via WebSocket.
   * @param message The user message to send.
   * @param threadId Optional thread ID for conversation continuity.
   * @param messages Optional conversation history.
   * @returns Promise that resolves immediately with the threadId
   */
  chatAsync(
    message: string,
    threadId?: string,
    messages?: Message[],
  ): Promise<{ threadId: string }>;

  /**
   * Get the result for an async request by threadId.
   * Returns null if the result is not available or has expired.
   * @param threadId The thread ID to get the result for.
   */
  getAsyncResult(threadId: string): ChatResult | null;
}

export const INVESTOR_AGENT_PROVIDER = Symbol('investor-agent-provider');

