import { getRedis } from './client.js';
import { REDIS_KEYS, PRESENCE_OFFLINE_THRESHOLD_SECONDS } from '@flowdesk/shared';

export interface PresenceEntry {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeenAt: number; // Unix timestamp ms
}

/**
 * Mark a user as online within a tenant's presence set.
 * Uses a Redis sorted set scored by timestamp for easy TTL checking.
 */
export async function setUserOnline(userId: string, tenantId: string): Promise<void> {
  const redis = getRedis();
  const key = REDIS_KEYS.PRESENCE_SET(tenantId);
  await redis.zadd(key, Date.now(), userId);
  // Store per-user status for quick individual lookup
  await redis.setex(
    REDIS_KEYS.PRESENCE_USER(userId),
    PRESENCE_OFFLINE_THRESHOLD_SECONDS * 2,
    JSON.stringify({ status: 'online', tenantId, lastSeenAt: Date.now() }),
  );
}

/**
 * Mark a user as offline within a tenant's presence set.
 */
export async function setUserOffline(userId: string, tenantId: string): Promise<void> {
  const redis = getRedis();
  await redis.zrem(REDIS_KEYS.PRESENCE_SET(tenantId), userId);
  await redis.del(REDIS_KEYS.PRESENCE_USER(userId));
}

/**
 * Returns IDs of all users currently online in a tenant.
 * Prunes stale entries (older than PRESENCE_OFFLINE_THRESHOLD_SECONDS).
 */
export async function getOnlineUsers(tenantId: string): Promise<string[]> {
  const redis = getRedis();
  const key = REDIS_KEYS.PRESENCE_SET(tenantId);
  const cutoff = Date.now() - PRESENCE_OFFLINE_THRESHOLD_SECONDS * 1000;

  // Remove stale entries first
  await redis.zremrangebyscore(key, 0, cutoff);

  // Return remaining members (all online within the threshold)
  return redis.zrange(key, 0, -1);
}

/**
 * Check if a specific user is currently online.
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  const result = await getRedis().exists(REDIS_KEYS.PRESENCE_USER(userId));
  return result === 1;
}

/**
 * Refresh a user's presence heartbeat (keep them "online").
 */
export async function refreshPresence(userId: string, tenantId: string): Promise<void> {
  await setUserOnline(userId, tenantId);
}
