import { getRedis } from './client.js';
import { REDIS_KEYS } from '@flowdesk/shared';

const LOCK_TTL_MS = 30_000; // Default: 30 seconds

// Lua script for atomic lock release:
// Only deletes the key if the value matches our lock token (prevents releasing another holder's lock)
const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

export interface LockResult {
  acquired: boolean;
  token: string;
  release: () => Promise<boolean>;
}

/**
 * Attempts to acquire a distributed lock using SET NX with TTL.
 * Returns a LockResult with an atomic release function.
 *
 * @param resource - The resource identifier to lock
 * @param ttlMs    - Lock TTL in milliseconds (auto-expires to prevent deadlocks)
 */
export async function acquireLock(resource: string, ttlMs = LOCK_TTL_MS): Promise<LockResult> {
  const redis = getRedis();
  const key = REDIS_KEYS.LOCK(resource);
  // Unique token to identify this lock holder
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const result = await redis.set(key, token, 'PX', ttlMs, 'NX');
  const acquired = result === 'OK';

  const release = async (): Promise<boolean> => {
    const released = await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
    return released === 1;
  };

  return { acquired, token, release };
}

/**
 * Acquires a lock, runs the callback, then automatically releases.
 * Throws if the lock cannot be acquired within the timeout.
 *
 * @param resource   - Resource name
 * @param callback   - Async function to run while holding the lock
 * @param ttlMs      - Lock TTL
 * @param timeoutMs  - How long to wait for the lock before throwing
 * @param retryMs    - Interval between retry attempts
 */
export async function withLock<T>(
  resource: string,
  callback: () => Promise<T>,
  ttlMs = LOCK_TTL_MS,
  timeoutMs = 5_000,
  retryMs = 50,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const lock = await acquireLock(resource, ttlMs);
    if (lock.acquired) {
      try {
        return await callback();
      } finally {
        await lock.release();
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, retryMs));
  }

  throw new Error(`Could not acquire lock on "${resource}" within ${timeoutMs}ms`);
}
