import { getRedis } from './client.js';

/**
 * Get a cached value. Returns null on cache miss.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const value = await redis.get(key);
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with optional TTL in seconds.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const redis = getRedis();
  const serialized = JSON.stringify(value);

  if (ttlSeconds) {
    await redis.setex(key, ttlSeconds, serialized);
  } else {
    await redis.set(key, serialized);
  }
}

/**
 * Invalidate (delete) a single cache key.
 */
export async function cacheInvalidate(key: string): Promise<void> {
  await getRedis().del(key);
}

/**
 * Invalidate all keys matching a glob pattern.
 * Uses SCAN to avoid blocking Redis with KEYS on large datasets.
 *
 * @example cacheInvalidateByPattern('analytics:overview:*')
 */
export async function cacheInvalidateByPattern(pattern: string): Promise<number> {
  const redis = getRedis();
  let cursor = '0';
  let deletedCount = 0;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;

    if (keys.length > 0) {
      await redis.del(...keys);
      deletedCount += keys.length;
    }
  } while (cursor !== '0');

  return deletedCount;
}

/**
 * Get-or-set cache helper. Executes the fetcher only on cache miss.
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}
