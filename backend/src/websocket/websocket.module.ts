import { Module } from '@nestjs/common';
import { AgentStatusGateway } from './websocket.gateway.js';
import { RedisModule } from '../redis/redis.module.js';

@Module({
  imports: [RedisModule],
  providers: [AgentStatusGateway],
  exports: [AgentStatusGateway],
})
export class WebSocketModule {}
