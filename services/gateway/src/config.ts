import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Upstream service URLs
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  TICKETS_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  CHAT_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  NOTIFICATIONS_SERVICE_URL: z.string().url().default('http://localhost:3004'),
  ANALYTICS_SERVICE_URL: z.string().url().default('http://localhost:3005'),

  // Database (for API key validation)
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: z.string().transform((v) => v === 'true').default('false'),

  // Redis
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.string().transform((v) => v === 'true').default('false'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),

  // Kafka
  KAFKA_BROKERS: z.string().min(1),
  KAFKA_SASL_USERNAME: z.string().min(1),
  KAFKA_SASL_PASSWORD: z.string().min(1),

  // Rate Limiting
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
  RATE_LIMIT_MAX_PER_TENANT: z.coerce.number().default(1000),
  RATE_LIMIT_MAX_PER_IP: z.coerce.number().default(100),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[gateway:config] Invalid environment variables:');
    for (const [field, errors] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${field}: ${(errors as string[]).join(', ')}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
