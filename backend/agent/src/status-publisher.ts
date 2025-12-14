import type { RedisService } from '../../src/redis/redis.service.js';

let redisServiceInstance: RedisService | null = null;

/**
 * Initialize the status publisher with a Redis service instance
 * This allows the agent graph to publish status updates without direct dependency injection
 */
export function initializeStatusPublisher(redisService: RedisService) {
  redisServiceInstance = redisService;
}

/**
 * Publish a status update for a thread
 */
export async function publishStatusUpdate(
  threadId: string,
  status: 'thinking' | 'researching' | 'calculating' | 'responding' | 'asking' | 'complete' | 'error',
  message?: string,
  progress?: string,
  researchResults?: string,
  calculationResults?: string,
  error?: string,
): Promise<void> {
  if (!redisServiceInstance) {
    // Silently fail if Redis is not initialized (e.g., in tests or LangGraph Studio)
    return;
  }

  try {
    await redisServiceInstance.publishStatusUpdate(threadId, {
      threadId,
      status,
      message,
      progress,
      researchResults,
      calculationResults,
      error,
    });
  } catch (err) {
    // Log but don't throw - status updates are non-critical
    console.error('Failed to publish status update:', err);
  }
}
