import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { ConfigType } from '@nestjs/config';
import { writeFileSync } from 'node:fs';
import { ApiAppModule } from './api-app.module.js';
import apiAppConfig from './config/api-app.config.js';

async function bootstrap() {
  const APP_NAME = 'investor-agent-api';

  // Load the application
  console.log('Loading modules');
  const app = await NestFactory.create(ApiAppModule, { bufferLogs: true });

  // Enable CORS
  app.enableCors();

  // Load config
  const config = app.get<ConfigType<typeof apiAppConfig>>(apiAppConfig.KEY);

  // Swagger/OpenAPI setup
  console.log('Setting up Swagger/OpenAPI');
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Investor Agent API')
    .setDescription(
      'REST API for the Investor Agent - a LangGraph-powered agent that can research, calculate, and provide investment advice',
    )
    .setVersion('1.0')
    .addTag('investor-agent', 'Investor agent endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  
  // Write swagger.json file
  const swaggerJson = JSON.stringify(document, null, 2);
  writeFileSync('./swagger.json', swaggerJson, 'utf8');
  console.log('Swagger JSON generated at ./swagger.json');
  
  SwaggerModule.setup('swagger', app, document, {
    customSiteTitle: 'Investor Agent API',
    customfavIcon: '/favicon.ico',
    customCss: '.swagger-ui .topbar { display: none }',
  });
  console.log('Swagger UI available at /swagger');

  // Start the app
  app.enableShutdownHooks();
  await app.listen(config.port, () => {
    console.log(`Application listening on port ${config.port}`, {
      service: APP_NAME,
      port: config.port,
    });
  });
}

bootstrap().catch((error: unknown) => {
  console.error('Error while bootstrapping application', {
    error: error instanceof Error ? error : new Error(String(error)),
  });
  process.exit(1);
});

