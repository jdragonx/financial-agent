import { z } from 'zod';

const DEFAULT_API_URL = 'http://localhost:3000';

const schema = z.object({
  API_URL: z.string().url().default(DEFAULT_API_URL),
});

const getConfig = () => {
  try {
    const env = import.meta.env;
    const parsed = schema.parse({
      API_URL: env.API_URL,
    });
    return {
      apiUrl: parsed.API_URL,
    };
  } catch (err) {
    console.error('Error while validating environment variables:', err);
    // Return default config on error
    return {
      apiUrl: DEFAULT_API_URL,
    };
  }
};

export default getConfig();
