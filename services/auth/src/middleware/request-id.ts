import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Attaches a unique request ID to every request for distributed tracing.
 * Forwards the ID in the response header for client-side correlation.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
