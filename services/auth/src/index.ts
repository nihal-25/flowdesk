import './config.js'; // Validate env at startup
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { initPool, testConnection, runMigrations } from '@flowdesk/database';
import { initRedis, testRedisConnection } from '@flowdesk/redis';
import { initKafka } from '@flowdesk/kafka';

import { config } from './config.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { responseMiddleware } from './middleware/response.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.js';

const app = express();

// ─── Security & parsing middleware ───────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-api-key'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Request tracking ────────────────────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(responseMiddleware);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  console.info('[auth] Starting FlowDesk Auth Service...');

  // Initialize database
  initPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
  });
  await testConnection();
  await runMigrations();

  // Initialize Redis
  initRedis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
    tls: config.REDIS_TLS,
  });
  await testRedisConnection();

  // Initialize Kafka (Redpanda Cloud)
  initKafka({
    clientId: 'flowdesk-auth',
    brokers: config.KAFKA_BROKERS.split(',').map((b) => b.trim()),
    sasl: {
      mechanism: 'scram-sha-256',
      username: config.KAFKA_SASL_USERNAME,
      password: config.KAFKA_SASL_PASSWORD,
    },
    ssl: true,
  });

  app.listen(config.PORT, () => {
    console.info(`[auth] Auth service listening on port ${config.PORT} (${config.NODE_ENV})`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.info('[auth] SIGTERM received. Shutting down gracefully...');
  const { closePool } = await import('@flowdesk/database');
  const { closeRedis } = await import('@flowdesk/redis');
  const { disconnectProducer } = await import('@flowdesk/kafka');
  await Promise.all([closePool(), closeRedis(), disconnectProducer()]);
  process.exit(0);
});

bootstrap().catch((err) => {
  console.error('[auth] Bootstrap failed:', err);
  process.exit(1);
});
