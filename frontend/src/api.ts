import apiConfig from './config/api.config';
import { io, Socket } from 'socket.io-client';

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

export interface StatusUpdate {
  threadId: string;
  status: 'thinking' | 'researching' | 'calculating' | 'responding' | 'asking' | 'complete' | 'error';
  message?: string;
  progress?: string;
  researchResults?: string;
  calculationResults?: string;
  error?: string;
}

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    // Socket.IO connects to the same URL as the API, namespace is part of the URL
    socket = io(`${apiConfig.apiUrl}/agent-status`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
  }
  return socket;
}

export async function sendMessage(
  message: string,
  threadId: string | undefined,
  onStatusUpdate: (update: StatusUpdate) => void,
): Promise<ChatResponse> {
  return new Promise((resolve, reject) => {
    const ws = getSocket();
    let statusHandler: ((update: StatusUpdate) => void) | null = null;
    let subscriptionThreadId: string | null = null;
    let finalResult: ChatResponse | null = null;

    // Make the async chat request - returns immediately with threadId
    fetch(`${apiConfig.apiUrl}/investor-agent/chat-async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        threadId,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((asyncResult: { threadId: string; status: string; message: string }) => {
        subscriptionThreadId = asyncResult.threadId;
        
        // Subscribe to status updates immediately
        ws.emit('subscribe', { threadId: asyncResult.threadId });

        // Listen for status updates
        statusHandler = (update: StatusUpdate) => {
          if (update.threadId === asyncResult.threadId) {
            onStatusUpdate(update);

            // When we get the complete status, fetch the final result
            if (update.status === 'complete' && !finalResult) {
              // Fetch the final result from the result endpoint
              fetch(`${apiConfig.apiUrl}/investor-agent/chat-async/result/${asyncResult.threadId}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                },
              })
                .then(async (response) => {
                  if (!response.ok) {
                    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
                    throw new Error(error.message || `Failed to fetch final result: ${response.status}`);
                  }
                  return response.json();
                })
                .then((result: ChatResponse) => {
                  finalResult = result;
                  if (statusHandler) {
                    ws.off('status-update', statusHandler);
                  }
                  ws.emit('unsubscribe');
                  resolve(result);
                })
                .catch((error) => {
                  if (statusHandler) {
                    ws.off('status-update', statusHandler);
                  }
                  ws.emit('unsubscribe');
                  reject(error);
                });
            } else if (update.status === 'error') {
              if (statusHandler) {
                ws.off('status-update', statusHandler);
              }
              ws.emit('unsubscribe');
              // The error message from backend is already user-friendly
              reject(new Error(update.error || 'Something went wrong. Please try again.'));
            }
          }
        };

        ws.on('status-update', statusHandler);

        // Set a timeout in case we don't get a complete status
        setTimeout(() => {
          if (!finalResult && statusHandler) {
            ws.off('status-update', statusHandler);
            ws.emit('unsubscribe');
            reject(new Error('Request timed out - no completion status received'));
          }
        }, 300000); // 5 minute timeout
      })
      .catch((error) => {
        // Clean up on error
        if (statusHandler && subscriptionThreadId) {
          ws.off('status-update', statusHandler);
          ws.emit('unsubscribe');
        }
        reject(error);
      });
  });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
