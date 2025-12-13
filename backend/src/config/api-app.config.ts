import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const DEFAULT_SERVICE_PORT = 3000;

const schema = z.object({
  API_APP_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_SERVICE_PORT),
});

export default registerAs('api-app', () => {
  try {
    const env = process.env;
    const parsed = schema.parse({
      API_APP_PORT: env.API_APP_PORT,
    });
    return {
      port: parsed.API_APP_PORT,
    };
  } catch (err) {
    throw new Error('Error while validating environment variables');
  }
});

