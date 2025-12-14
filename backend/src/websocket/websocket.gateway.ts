import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';

interface ClientInfo {
  threadId: string;
  unsubscribe?: () => Promise<void>;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/agent-status',
})
@Injectable()
export class AgentStatusGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentStatusGateway.name);
  private clients = new Map<string, ClientInfo>();

  constructor(private readonly redisService: RedisService) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const clientInfo = this.clients.get(client.id);
    if (clientInfo?.unsubscribe) {
      await clientInfo.unsubscribe();
    }
    this.clients.delete(client.id);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() data: { threadId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { threadId } = data;
    if (!threadId) {
      client.emit('error', { message: 'threadId is required' });
      return;
    }

    this.logger.log(`Client ${client.id} subscribing to thread ${threadId}`);

    // Unsubscribe from previous thread if any
    const existingClientInfo = this.clients.get(client.id);
    if (existingClientInfo?.unsubscribe) {
      await existingClientInfo.unsubscribe();
    }

    // Subscribe to Redis channel for this thread
    const unsubscribe = await this.redisService.subscribeToStatusUpdates(
      threadId,
      (update) => {
        client.emit('status-update', update);
      },
    );

    this.clients.set(client.id, { threadId, unsubscribe });

    client.emit('subscribed', { threadId });
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(@ConnectedSocket() client: Socket) {
    const clientInfo = this.clients.get(client.id);
    if (clientInfo?.unsubscribe) {
      await clientInfo.unsubscribe();
      this.clients.delete(client.id);
      client.emit('unsubscribed');
    }
  }
}
