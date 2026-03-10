import { randomBytes, createHash } from 'crypto';

/**
 * Generates a cryptographically secure random string of given byte length,
 * returned as a URL-safe base64 string.
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Generates an API key with the FlowDesk prefix.
 * Format: fd_live_<40 random chars>
 */
export function generateApiKey(): string {
  return `fd_live_${randomBytes(30).toString('base64url').slice(0, 40)}`;
}

/**
 * Creates a SHA-256 hash of a string (for API key storage lookup).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Slugifies a string for use as a tenant slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Returns a promise that resolves after the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay with jitter.
 */
export function exponentialBackoff(attempt: number, baseMs = 1000, maxMs = 30_000): number {
  const exponential = Math.min(baseMs * 2 ** attempt, maxMs);
  const jitter = Math.random() * exponential * 0.1;
  return Math.floor(exponential + jitter);
}

/**
 * Omits specified keys from an object (useful for removing sensitive fields).
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * Returns the first N lines of a string (for truncating response bodies).
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}... [truncated]`;
}

/**
 * Parses a period string like "7d", "30d", "1m" into start/end Date objects.
 */
export function parsePeriod(period: string): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();

  const match = /^(\d+)([dwhm])$/.exec(period);
  if (!match) {
    // Default: 7 days
    startDate.setDate(startDate.getDate() - 7);
    return { startDate, endDate };
  }

  const [, amountStr, unit] = match;
  const amount = parseInt(amountStr ?? '7', 10);

  switch (unit) {
    case 'd':
      startDate.setDate(startDate.getDate() - amount);
      break;
    case 'w':
      startDate.setDate(startDate.getDate() - amount * 7);
      break;
    case 'h':
      startDate.setHours(startDate.getHours() - amount);
      break;
    case 'm':
      startDate.setMonth(startDate.getMonth() - amount);
      break;
  }

  return { startDate, endDate };
}

/**
 * Formats milliseconds into a human-readable duration string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}
