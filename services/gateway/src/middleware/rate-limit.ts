import type { Request, Response, NextFunction } from 'express';
import { rateLimitTenant, rateLimitIp } from '@flowdesk/redis';
import { config } from '../config.js';
import { RateLimitError } from '../errors.js';

/**
 * Rate limiting middleware using Redis sliding window algorithm.
 * Limits per tenant (if authenticated) AND per IP address.
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    // IP-based rate limiting (for unauthenticated requests)
    const ipResult = await rateLimitIp(
      ip,
      config.RATE_LIMIT_WINDOW_SECONDS,
      config.RATE_LIMIT_MAX_PER_IP,
    );

    res.setHeader('X-RateLimit-Limit-IP', config.RATE_LIMIT_MAX_PER_IP);
    res.setHeader('X-RateLimit-Remaining-IP', ipResult.remaining);

    if (!ipResult.allowed) {
      res.setHeader('Retry-After', config.RATE_LIMIT_WINDOW_SECONDS);
      throw new RateLimitError();
    }

    // Tenant-based rate limiting (for authenticated requests)
    if (req.auth?.tenantId) {
      const tenantResult = await rateLimitTenant(
        req.auth.tenantId,
        config.RATE_LIMIT_WINDOW_SECONDS,
        config.RATE_LIMIT_MAX_PER_TENANT,
      );

      res.setHeader('X-RateLimit-Limit-Tenant', config.RATE_LIMIT_MAX_PER_TENANT);
      res.setHeader('X-RateLimit-Remaining-Tenant', tenantResult.remaining);

      if (!tenantResult.allowed) {
        res.setHeader('Retry-After', config.RATE_LIMIT_WINDOW_SECONDS);
        throw new RateLimitError();
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}
