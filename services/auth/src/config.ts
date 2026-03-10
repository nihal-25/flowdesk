import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Database
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
  JWT_REFRESH_SECRET: z.string().min(32),

  // Kafka (Redpanda Cloud)
  KAFKA_BROKERS: z.string().min(1), // Comma-separated
  KAFKA_SASL_USERNAME: z.string().min(1),
  KAFKA_SASL_PASSWORD: z.string().min(1),

  // Email (Nodemailer / Gmail)
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('FlowDesk <noreply@flowdesk.app>'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[config] Invalid environment variables:');
    for (const [field, errors] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${field}: ${(errors as string[]).join(', ')}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();

export type Config = typeof config;
