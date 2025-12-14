import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface StatusUpdate {
  threadId: string;
  status: 'thinking' | 'researching' | 'calculating' | 'responding' | 'asking' | 'complete' | 'error';
  message?: string;
  progress?: string;
  researchResults?: string;
  calculationResults?: string;
  error?: string;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis;
  private subscriber: Redis;
  private readonly channelPrefix = 'agent:status:';

  constructor(private configService: ConfigService) {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);

    this.publisher = new Redis({
      host: redisHost,
      port: redisPort,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.subscriber = new Redis({
      host: redisHost,
      port: redisPort,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
  }

  async onModuleInit() {
    // Test connection
    try {
      await this.publisher.ping();
      console.log('Redis publisher connected');
      await this.subscriber.ping();
      console.log('Redis subscriber connected');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.publisher.quit();
    await this.subscriber.quit();
  }

  /**
   * Publish a status update for a specific thread
   */
  async publishStatusUpdate(threadId: string, update: StatusUpdate): Promise<void> {
    const channel = `${this.channelPrefix}${threadId}`;
    await this.publisher.publish(channel, JSON.stringify(update));
  }

  /**
   * Subscribe to status updates for a specific thread
   */
  async subscribeToStatusUpdates(
    threadId: string,
    callback: (update: StatusUpdate) => void,
  ): Promise<() => Promise<void>> {
    const channel = `${this.channelPrefix}${threadId}`;
    
    await this.subscriber.subscribe(channel);
    
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          const update = JSON.parse(message) as StatusUpdate;
          callback(update);
        } catch (error) {
          console.error('Failed to parse status update:', error);
        }
      }
    });

    // Return unsubscribe function
    return async () => {
      await this.subscriber.unsubscribe(channel);
    };
  }

  /**
   * Get the subscriber instance for direct access if needed
   */
  getSubscriber(): Redis {
    return this.subscriber;
  }

  /**
   * Get the publisher instance for direct access if needed
   */
  getPublisher(): Redis {
    return this.publisher;
  }
}
