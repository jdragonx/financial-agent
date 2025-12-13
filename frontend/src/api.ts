import apiConfig from './config/api.config';

export interface Message {
  role: 'user' | 'assistant';
  message: string;
}

export interface ChatRequest {
  message: string;
  threadId?: string;
  messages?: Message[];
}

export interface ChatResponse {
  threadId: string;
  messages: Message[];
  turnCount: number;
  currentAction: 'thinking' | 'researching' | 'calculating' | 'responding' | 'asking';
  researchResults?: string;
  calculationResults?: string;
}

export async function sendMessage(
  message: string,
  threadId?: string,
): Promise<ChatResponse> {
  const response = await fetch(`${apiConfig.apiUrl}/investor-agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      threadId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}
