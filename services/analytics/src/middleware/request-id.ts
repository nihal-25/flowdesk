import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
