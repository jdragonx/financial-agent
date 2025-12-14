import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { sendMessage, type Message, type StatusUpdate, disconnectSocket } from './api';
import './Chat.css';

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Refocus input after assistant message is received
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      // Small delay to ensure the message is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isLoading, messages.length]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      message: input.trim(),
    };

    // Add user message immediately
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setCurrentStatus('Sending request...');

    const handleStatusUpdate = (update: StatusUpdate) => {
      // Update status message
      const statusMessages: Record<string, string> = {
        thinking: '🤔 Thinking and planning...',
        researching: `🔍 ${update.message || 'Researching...'}`,
        calculating: `🧮 ${update.message || 'Calculating...'}`,
        responding: '💬 Preparing response...',
        asking: '❓ Need more information...',
        complete: '✅ Complete',
        error: `❌ Error: ${update.error || 'Unknown error'}`,
      };
      setCurrentStatus(statusMessages[update.status] || update.message || 'Processing...');
    };

    try {
      const response = await sendMessage(
        userMessage.message,
        threadId,
        handleStatusUpdate,
      );
      setThreadId(response.threadId);
      setMessages(response.messages);
      setCurrentStatus(null);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        message: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setCurrentStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setThreadId(undefined);
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="header-content">
          <div>
            <h1>Investor Agent</h1>
            <p>Ask me anything about investments, stocks, or financial analysis</p>
          </div>
          {messages.length > 0 && (
            <button onClick={handleClear} className="clear-button" title="Clear conversation">
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="welcome-message">
            <p>👋 Welcome! Start a conversation by asking a question.</p>
            <p className="example-questions">
              Try asking: &quot;What is the current price of AAPL?&quot; or &quot;Calculate the P/E ratio for a stock with price $150 and earnings $6.11&quot;
            </p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
          >
            <div className="message-content">
              {msg.role === 'assistant' ? (
                <ReactMarkdown>{msg.message}</ReactMarkdown>
              ) : (
                msg.message
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant-message">
            <div className="message-content loading">
              {currentStatus ? (
                <div className="status-update">
                  <span className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                  <span className="status-text">{currentStatus}</span>
                </div>
              ) : (
                <span className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={isLoading}
          className="chat-input"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="send-button"
        >
          Send
        </button>
      </form>
    </div>
  );
}
