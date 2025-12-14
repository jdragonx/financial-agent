import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiModule } from './api/index.js';
import apiAppConfig from './config/api-app.config.js';
import { HealthModule } from './health/health.module.js';
import { RedisModule } from './redis/redis.module.js';
import { WebSocketModule } from './websocket/websocket.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [apiAppConfig],
    }),
    RedisModule,
    WebSocketModule,
    HealthModule,
    ApiModule,
  ],
})
export class ApiAppModule {}

