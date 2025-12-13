import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ApiModule } from './api/index.js';
import apiAppConfig from './config/api-app.config.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [apiAppConfig],
    }),
    HealthModule,
    ApiModule,
  ],
})
export class ApiAppModule {}

