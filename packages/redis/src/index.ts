export {
  createRedisClient,
  initRedis,
  getRedis,
  getSubscriberClient,
  closeRedis,
  testRedisConnection,
  type RedisConfig,
} from './client.js';

export { acquireLock, withLock, type LockResult } from './lock.js';

export {
  checkRateLimit,
  rateLimitTenant,
  rateLimitIp,
  type RateLimitResult,
} from './rate-limiter.js';

export {
  cacheGet,
  cacheSet,
  cacheInvalidate,
  cacheInvalidateByPattern,
  cacheGetOrSet,
} from './cache.js';

export {
  blacklistToken,
  isTokenBlacklisted,
  storeRefreshTokenFamily,
  invalidateRefreshTokenFamily,
  storeInviteToken,
  consumeInviteToken,
} from './session.js';

export {
  setUserOnline,
  setUserOffline,
  getOnlineUsers,
  isUserOnline,
  refreshPresence,
  type PresenceEntry,
} from './presence.js';

export {
  publish,
  subscribe,
  psubscribe,
  type PubSubMessage,
  type PubSubChannel,
} from './pubsub.js';
