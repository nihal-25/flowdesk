// ─── JWT ──────────────────────────────────────────────────────────────────────
export const JWT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const JWT_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const JWT_INVITE_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// ─── Rate Limiting ────────────────────────────────────────────────────────────
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS_PER_TENANT = 1000;
export const RATE_LIMIT_MAX_REQUESTS_PER_IP = 100;

// ─── API Key ──────────────────────────────────────────────────────────────────
export const API_KEY_PREFIX = 'fd_live_';
export const API_KEY_LENGTH = 40; // chars after prefix

// ─── Pagination ───────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// ─── WebSocket ────────────────────────────────────────────────────────────────
export const TYPING_INDICATOR_TTL_SECONDS = 3;
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000;
export const PRESENCE_OFFLINE_THRESHOLD_SECONDS = 60;

// ─── Webhook ──────────────────────────────────────────────────────────────────
export const WEBHOOK_MAX_RETRIES = 5;
export const WEBHOOK_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
export const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 5;
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_SIGNATURE_HEADER = 'x-flowdesk-signature';

// ─── Redis Key Prefixes ───────────────────────────────────────────────────────
export const REDIS_KEYS = {
  // Auth
  TOKEN_BLACKLIST: (jti: string) => `blacklist:${jti}`,
  REFRESH_TOKEN: (userId: string, family: string) => `refresh:${userId}:${family}`,
  SESSION: (userId: string) => `session:${userId}`,

  // Rate limiting
  RATE_LIMIT_TENANT: (tenantId: string) => `rl:tenant:${tenantId}`,
  RATE_LIMIT_IP: (ip: string) => `rl:ip:${ip}`,

  // Presence
  PRESENCE_SET: (tenantId: string) => `presence:${tenantId}`,
  PRESENCE_USER: (userId: string) => `presence:user:${userId}`,

  // Analytics cache
  ANALYTICS_OVERVIEW: (tenantId: string) => `analytics:overview:${tenantId}`,
  ANALYTICS_AGENTS: (tenantId: string) => `analytics:agents:${tenantId}`,

  // Locks
  LOCK: (resource: string) => `lock:${resource}`,

  // Invite tokens
  INVITE_TOKEN: (token: string) => `invite:${token}`,

  // Pub/Sub channels
  PUBSUB_MESSAGES: (tenantId: string) => `pubsub:messages:${tenantId}`,
  PUBSUB_TICKETS: (tenantId: string) => `pubsub:tickets:${tenantId}`,
  PUBSUB_PRESENCE: (tenantId: string) => `pubsub:presence:${tenantId}`,
  PUBSUB_ANALYTICS: (tenantId: string) => `pubsub:analytics:${tenantId}`,
} as const;

// ─── Tenant Plans ─────────────────────────────────────────────────────────────
export const PLAN_LIMITS = {
  free: { maxAgents: 3, maxTicketsPerMonth: 100 },
  starter: { maxAgents: 10, maxTicketsPerMonth: 1000 },
  growth: { maxAgents: 50, maxTicketsPerMonth: 10000 },
  enterprise: { maxAgents: Infinity, maxTicketsPerMonth: Infinity },
} as const;
