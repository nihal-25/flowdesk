import './config.js'; // Validate env at startup
import { createServer } from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { Server } from 'socket.io';

import { initPool, testConnection } from '@flowdesk/database';
import { initRedis, testRedisConnection, getSubscriberClient, setUserOnline, setUserOffline, refreshPresence, getOnlineUsers } from '@flowdesk/redis';
import { initKafka } from '@flowdesk/kafka';
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from '@flowdesk/shared';
import type { PubSubMessage } from '@flowdesk/redis';

import { config } from './config.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { extractSocketToken, verifySocketToken } from './socket/auth.js';

const app = express();
const httpServer = createServer(app);

// ─── Socket.io setup ──────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// ─── Express middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
  credentials: true,
}));
app.use(express.json());
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(requestIdMiddleware);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'chat', timestamp: new Date().toISOString() });
});

// ─── REST endpoint: GET /presence/:tenantId ───────────────────────────────────
app.get('/presence/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const onlineUsers = await getOnlineUsers(tenantId);
    res.json({
      success: true,
      data: onlineUsers,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[chat] Error fetching presence:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch presence' } });
  }
});

// ─── Socket.io authentication middleware ─────────────────────────────────────
io.use((socket, next) => {
  try {
    const token = extractSocketToken(
      socket.handshake.auth as Record<string, unknown>,
      socket.handshake.headers as Record<string, string | string[] | undefined>,
    );
    const authCtx = verifySocketToken(token);
    socket.data['userId'] = authCtx.userId;
    socket.data['tenantId'] = authCtx.tenantId;
    socket.data['role'] = authCtx.role;
    socket.data['email'] = authCtx.email;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    next(new Error(message));
  }
});

// ─── Socket.io connection handler ────────────────────────────────────────────
io.on('connection', async (socket) => {
  const userId = socket.data['userId'] as string;
  const tenantId = socket.data['tenantId'] as string;

  console.info(`[chat] Socket connected: userId=${userId} tenantId=${tenantId}`);

  // Join tenant room + a per-user room (used for targeted notifications)
  await socket.join(`tenant:${tenantId}`);
  await socket.join(`user:${userId}`);

  // Mark user as online
  await setUserOnline(userId, tenantId);

  // Broadcast presence update to tenant
  io.to(`tenant:${tenantId}`).emit('presence:update', {
    userId,
    status: 'online',
    firstName: '',
    lastName: '',
  });

  // Heartbeat to keep presence alive
  const heartbeatInterval = setInterval(() => {
    refreshPresence(userId, tenantId).catch((err) => {
      console.error('[chat] Heartbeat error:', err);
    });
  }, PRESENCE_HEARTBEAT_INTERVAL_MS);

  // ─── join:ticket ────────────────────────────────────────────────────────────
  socket.on('join:ticket', async (data: { ticketId: string }) => {
    if (!data?.ticketId) return;
    await socket.join(`ticket:${data.ticketId}`);
    console.info(`[chat] userId=${userId} joined ticket:${data.ticketId}`);
  });

  // ─── leave:ticket ───────────────────────────────────────────────────────────
  socket.on('leave:ticket', async (data: { ticketId: string }) => {
    if (!data?.ticketId) return;
    await socket.leave(`ticket:${data.ticketId}`);
  });

  // ─── typing:start ───────────────────────────────────────────────────────────
  socket.on('typing:start', (data: { ticketId: string }) => {
    if (!data?.ticketId) return;
    socket.to(`ticket:${data.ticketId}`).emit('agent:typing', {
      userId,
      firstName: '',
      lastName: '',
      ticketId: data.ticketId,
    });
  });

  // ─── typing:stop ────────────────────────────────────────────────────────────
  socket.on('typing:stop', (data: { ticketId: string }) => {
    if (!data?.ticketId) return;
    socket.to(`ticket:${data.ticketId}`).emit('agent:stopped-typing', {
      userId,
      ticketId: data.ticketId,
    });
  });

  // ─── message:read ───────────────────────────────────────────────────────────
  socket.on('message:read', (_data: { ticketId: string; messageId: string }) => {
    // Acknowledged; could update DB here
  });

  // ─── disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    clearInterval(heartbeatInterval);
    await setUserOffline(userId, tenantId);
    io.to(`tenant:${tenantId}`).emit('presence:update', {
      userId,
      status: 'offline',
      firstName: '',
      lastName: '',
    });
    console.info(`[chat] Socket disconnected: userId=${userId}`);
  });
});

// ─── Redis pub/sub for horizontal scaling ─────────────────────────────────────
// A single subscriber + one pmessage handler routes by channel prefix. This is
// the bridge that turns events published by other services (tickets,
// notifications) into WebSocket emits to the right rooms.
async function setupPubSub(): Promise<void> {
  const subscriber = getSubscriberClient();

  subscriber.psubscribe('pubsub:messages:*', (err) => { if (err) console.error('[chat] psubscribe messages error:', err); });
  subscriber.psubscribe('pubsub:tickets:*', (err) => { if (err) console.error('[chat] psubscribe tickets error:', err); });
  subscriber.psubscribe('pubsub:notifications:*', (err) => { if (err) console.error('[chat] psubscribe notifications error:', err); });

  subscriber.on('pmessage', (_pattern: string, channel: string, rawMessage: string) => {
    try {
      const parsed = JSON.parse(rawMessage) as PubSubMessage<Record<string, unknown>>;
      const tenantId = parsed.tenantId;
      const ticketId = parsed.data['ticketId'] as string | undefined;

      if (channel.startsWith('pubsub:messages:')) {
        // New message → only the ticket room (frontend dedupes by id anyway).
        if (ticketId) io.to(`ticket:${ticketId}`).emit('message:new', parsed.data);
      } else if (channel.startsWith('pubsub:tickets:')) {
        // Ticket created/updated → the ticket room (detail view) AND the tenant
        // room (so anyone viewing the ticket LIST updates without a refresh).
        if (ticketId) io.to(`ticket:${ticketId}`).emit('ticket:updated', parsed.data);
        io.to(`tenant:${tenantId}`).emit('ticket:updated', parsed.data);
      } else if (channel.startsWith('pubsub:notifications:')) {
        // Notification → the specific recipient's room.
        const userId = parsed.data['userId'] as string | undefined;
        if (userId) io.to(`user:${userId}`).emit('notification:new', parsed.data);
      }
    } catch (err) {
      console.error('[chat] pmessage parse error:', err);
    }
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  console.info('[chat] Starting FlowDesk Chat Service...');

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
    clientId: 'flowdesk-chat',
    brokers: config.KAFKA_BROKERS.split(',').map((b) => b.trim()),
    sasl: {
      mechanism: 'plain',
      username: config.KAFKA_SASL_USERNAME,
      password: config.KAFKA_SASL_PASSWORD,
    },
    ssl: true,
  });

  await setupPubSub();

  httpServer.listen(config.PORT, () => {
    console.info(`[chat] Chat service listening on port ${config.PORT} (${config.NODE_ENV})`);
  });
}

process.on('SIGTERM', async () => {
  console.info('[chat] SIGTERM received. Shutting down gracefully...');
  const { closePool } = await import('@flowdesk/database');
  const { closeRedis } = await import('@flowdesk/redis');
  const { disconnectProducer } = await import('@flowdesk/kafka');
  await Promise.all([closePool(), closeRedis(), disconnectProducer()]);
  process.exit(0);
});

bootstrap().catch((err) => {
  console.error('[chat] Bootstrap failed:', err);
  process.exit(1);
});
