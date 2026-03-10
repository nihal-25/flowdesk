import { getRedis } from './client.js';
import { REDIS_KEYS } from '@flowdesk/shared';

// Sliding window rate limiter using Redis sorted sets.
// Each request is scored by its timestamp (ms). Old entries outside the window
// are pruned on each check, giving a true sliding window (not fixed buckets).

const SLIDING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window_ms = tonumber(ARGV[2])
  local max_requests = tonumber(ARGV[3])
  local ttl = tonumber(ARGV[4])

  -- Remove entries outside the sliding window
  redis.call("ZREMRANGEBYSCORE", key, 0, now - window_ms)

  -- Count current requests in window
  local current = redis.call("ZCARD", key)

  if current >= max_requests then
    return {0, current, 0}  -- {allowed, current, remaining}
  end

  -- Add current request (score = timestamp, member = timestamp+random for uniqueness)
  redis.call("ZADD", key, now, now .. "-" .. math.random(1000000))
  redis.call("PEXPIRE", key, ttl)

  local remaining = max_requests - current - 1
  return {1, current + 1, remaining}
`;

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  remaining: number;
  resetMs: number; // Time until window resets (approximate)
}

/**
 * Checks and increments the sliding window rate limit for a key.
 *
 * @param key          - Redis key (use REDIS_KEYS.RATE_LIMIT_*)
 * @param windowSec    - Window size in seconds
 * @param maxRequests  - Maximum requests allowed in the window
 */
export async function checkRateLimit(
  key: string,
  windowSec: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const ttlMs = windowMs + 1000; // Keep key alive slightly longer than window

  const result = (await redis.eval(
    SLIDING_WINDOW_SCRIPT,
    1,
    key,
    now,
    windowMs,
    maxRequests,
    ttlMs,
  )) as [number, number, number];

  return {
    allowed: result[0] === 1,
    current: result[1] ?? 0,
    remaining: result[2] ?? 0,
    resetMs: windowMs,
  };
}

/**
 * Rate limit per tenant ID.
 */
export async function rateLimitTenant(
  tenantId: string,
  windowSec: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  return checkRateLimit(REDIS_KEYS.RATE_LIMIT_TENANT(tenantId), windowSec, maxRequests);
}

/**
 * Rate limit per IP address.
 */
export async function rateLimitIp(
  ip: string,
  windowSec: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  return checkRateLimit(REDIS_KEYS.RATE_LIMIT_IP(ip), windowSec, maxRequests);
}
