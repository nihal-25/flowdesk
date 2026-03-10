import type { Request, Response, NextFunction } from 'express';
import type { AuthContext } from '@flowdesk/shared';
import { AuthError } from '../errors.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth: AuthContext;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'] as string | undefined;
  const tenantId = req.headers['x-tenant-id'] as string | undefined;
  const role = req.headers['x-user-role'] as string | undefined;
  const requestId = req.headers['x-request-id'] as string | undefined;

  if (!userId || !tenantId || !role) {
    return next(new AuthError('Missing auth context from gateway'));
  }

  req.auth = {
    userId,
    tenantId,
    role: role as never, // Gateway already validated
    email: '',
    jti: '',
    requestId: requestId ?? req.id,
  };
  next();
}
