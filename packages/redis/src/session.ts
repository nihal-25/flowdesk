import { getRedis } from './client.js';
import { REDIS_KEYS, JWT_ACCESS_TOKEN_TTL_SECONDS } from '@flowdesk/shared';

/**
 * Blacklists a JWT by its JTI (JWT ID) until its expiry time.
 * Used on logout to invalidate the access token before it expires.
 */
export async function blacklistToken(jti: string, expiresAt: number): Promise<void> {
  const redis = getRedis();
  const key = REDIS_KEYS.TOKEN_BLACKLIST(jti);
  const ttlSeconds = Math.max(expiresAt - Math.floor(Date.now() / 1000), 1);
  await redis.setex(key, ttlSeconds, '1');
}

/**
 * Checks if a JWT JTI has been blacklisted.
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const result = await getRedis().exists(REDIS_KEYS.TOKEN_BLACKLIST(jti));
  return result === 1;
}

/**
 * Stores refresh token metadata for rotation tracking.
 * The actual token hash is stored in PostgreSQL; this is for fast family invalidation.
 */
export async function storeRefreshTokenFamily(
  userId: string,
  familyId: string,
  ttlSeconds = 7 * 24 * 60 * 60,
): Promise<void> {
  const key = REDIS_KEYS.REFRESH_TOKEN(userId, familyId);
  await getRedis().setex(key, ttlSeconds, '1');
}

/**
 * Invalidates an entire refresh token family (detected token reuse — security event).
 * All tokens in the family become invalid immediately.
 */
export async function invalidateRefreshTokenFamily(
  userId: string,
  familyId: string,
): Promise<void> {
  await getRedis().del(REDIS_KEYS.REFRESH_TOKEN(userId, familyId));
}

/**
 * Stores an invite token with expiry.
 */
export async function storeInviteToken(
  token: string,
  payload: Record<string, unknown>,
  ttlSeconds: number,
): Promise<void> {
  const key = REDIS_KEYS.INVITE_TOKEN(token);
  await getRedis().setex(key, ttlSeconds, JSON.stringify(payload));
}

/**
 * Retrieves and deletes an invite token (single-use).
 */
export async function consumeInviteToken(
  token: string,
): Promise<Record<string, unknown> | null> {
  const key = REDIS_KEYS.INVITE_TOKEN(token);
  const redis = getRedis();

  // Atomic GET + DEL to prevent race conditions
  const [value] = await redis
    .multi()
    .get(key)
    .del(key)
    .exec() as [[null, string | null], [null, number]];

  if (!value[1]) return null;
  try {
    return JSON.parse(value[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
