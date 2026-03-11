import './config.js';
import express from 'express';
import type { Socket } from 'net';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { initPool, testConnection } from '@flowdesk/database';
import { initRedis, testRedisConnection } from '@flowdesk/redis';
import { initKafka } from '@flowdesk/kafka';

import { config } from './config.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { authenticate } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { auditMiddleware } from './middleware/audit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────
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
app.use(requestIdMiddleware);

// ─── Health check (no auth required) ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
});

// ─── Auth routes (no JWT required — pass-through) ────────────────────────────
// pathRewrite restores the /auth prefix that Express strips when matching app.use('/auth', ...)
app.use('/auth', createProxyMiddleware({
  target: config.AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/': '/auth/' },
  on: {
    proxyReq: (proxyReq, req: express.Request) => {
      proxyReq.setHeader('x-request-id', req.id);
    },
  },
}));

// ─── Authenticated + rate-limited routes ─────────────────────────────────────
app.use(authenticate as express.RequestHandler);
app.use(rateLimitMiddleware as express.RequestHandler);
app.use(auditMiddleware);

// Forward x-auth headers downstream so services know who's making the request
app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
  if (req.auth) {
    req.headers['x-user-id'] = req.auth.userId;
    req.headers['x-tenant-id'] = req.auth.tenantId;
    req.headers['x-user-role'] = req.auth.role;
    req.headers['x-request-id'] = req.id;
  }
  next();
});

// pathRewrite restores the path prefix that Express strips when matching app.use('/prefix', ...)
const proxyOptions = (target: string, prefix: string) => ({
  target,
  changeOrigin: true,
  pathRewrite: { '^/': `/${prefix}/` },
  on: {
    error: (err: Error, _req: express.Request, res: express.Response | Socket) => {
      console.error('[gateway:proxy] Upstream error:', err.message);
      if ('status' in res && typeof res.status === 'function') {
        res.status(502).json({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Upstream service unavailable' },
          timestamp: new Date().toISOString(),
        });
      }
    },
  },
});

app.use('/tickets', createProxyMiddleware(proxyOptions(config.TICKETS_SERVICE_URL, 'tickets')));
app.use('/agents', createProxyMiddleware(proxyOptions(config.TICKETS_SERVICE_URL, 'agents')));
app.use('/customers', createProxyMiddleware(proxyOptions(config.TICKETS_SERVICE_URL, 'customers')));
app.use('/chat', createProxyMiddleware({ ...proxyOptions(config.CHAT_SERVICE_URL, 'chat'), ws: true }));
app.use('/presence', createProxyMiddleware(proxyOptions(config.CHAT_SERVICE_URL, 'presence')));
app.use('/notifications', createProxyMiddleware(proxyOptions(config.NOTIFICATIONS_SERVICE_URL, 'notifications')));
app.use('/analytics', createProxyMiddleware(proxyOptions(config.ANALYTICS_SERVICE_URL, 'analytics')));

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  console.info('[gateway] Starting FlowDesk API Gateway...');

  initPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
  });
  await testConnection();

  initRedis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
    tls: config.REDIS_TLS,
  });
  await testRedisConnection();

  initKafka({
    clientId: 'flowdesk-gateway',
    brokers: config.KAFKA_BROKERS.split(',').map((b) => b.trim()),
    sasl: {
      mechanism: 'scram-sha-256',
      username: config.KAFKA_SASL_USERNAME,
      password: config.KAFKA_SASL_PASSWORD,
    },
    ssl: true,
  });

  const server = app.listen(config.PORT, () => {
    console.info(`[gateway] API Gateway listening on port ${config.PORT} (${config.NODE_ENV})`);
  });

  // WebSocket upgrade forwarding for chat service
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/chat')) {
      console.info('[gateway] Forwarding WebSocket upgrade for chat service');
    }
  });

  process.on('SIGTERM', async () => {
    console.info('[gateway] SIGTERM received. Shutting down gracefully...');
    server.close();
    const { closePool } = await import('@flowdesk/database');
    const { closeRedis } = await import('@flowdesk/redis');
    await Promise.all([closePool(), closeRedis()]);
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('[gateway] Bootstrap failed:', err);
  process.exit(1);
});
