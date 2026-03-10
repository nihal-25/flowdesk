import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isTokenBlacklisted } from '@flowdesk/redis';
import { queryOne } from '@flowdesk/database';
import { hashToken } from '@flowdesk/shared';
import type { JwtPayload, AuthContext, Permission } from '@flowdesk/shared';
import { ROLE_PERMISSIONS, ERROR_CODES } from '@flowdesk/shared';
import { config } from '../config.js';
import { AuthError, ForbiddenError } from '../errors.js';

// Augment Express Request with auth context
declare global {
  namespace Express {
    interface Request {
      id: string;
      auth: AuthContext;
    }
  }
}

/**
 * Middleware: validates JWT or API key, attaches auth context to req.auth.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const authHeader = req.headers.authorization;

    if (apiKey) {
      await authenticateWithApiKey(req, apiKey);
    } else if (authHeader?.startsWith('Bearer ')) {
      await authenticateWithJwt(req, authHeader.slice(7));
    } else {
      throw new AuthError('No authentication credentials provided');
    }

    next();
  } catch (err) {
    next(err);
  }
}

async function authenticateWithJwt(req: Request, token: string): Promise<void> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError('Access token has expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new AuthError('Invalid access token', ERROR_CODES.TOKEN_INVALID);
  }

  const blacklisted = await isTokenBlacklisted(payload.jti);
  if (blacklisted) {
    throw new AuthError('Token has been revoked', ERROR_CODES.TOKEN_BLACKLISTED);
  }

  req.auth = {
    userId: payload.sub,
    tenantId: payload.tid,
    role: payload.role,
    email: payload.email,
    jti: payload.jti,
    requestId: req.id,
  };
}

async function authenticateWithApiKey(req: Request, rawKey: string): Promise<void> {
  const keyHash = hashToken(rawKey);

  const apiKey = await queryOne<{
    id: string;
    tenant_id: string;
    user_id: string;
    is_active: boolean;
    expires_at: Date | null;
  }>(
    `SELECT id, tenant_id, user_id, is_active, expires_at
     FROM api_keys
     WHERE key_hash = $1`,
    [keyHash],
  );

  if (!apiKey || !apiKey.is_active) {
    throw new AuthError('Invalid or revoked API key', ERROR_CODES.UNAUTHORIZED);
  }

  if (apiKey.expires_at && apiKey.expires_at < new Date()) {
    throw new AuthError('API key has expired', ERROR_CODES.TOKEN_EXPIRED);
  }

  const user = await queryOne<{
    id: string;
    email: string;
    role: string;
    is_active: boolean;
  }>(
    `SELECT id, email, role, is_active FROM users WHERE id = $1`,
    [apiKey.user_id],
  );

  if (!user || !user.is_active) {
    throw new AuthError('Associated user is disabled', ERROR_CODES.ACCOUNT_DISABLED);
  }

  // Update last_used_at asynchronously (don't block the request)
  queryOne(
    `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
    [apiKey.id],
  ).catch((err: unknown) => console.error('[gateway:auth] Failed to update api key last_used_at:', err));

  req.auth = {
    userId: user.id,
    tenantId: apiKey.tenant_id,
    role: user.role as never,
    email: user.email,
    jti: `apikey-${apiKey.id}`,
    requestId: req.id,
  };
}

/**
 * Middleware factory: checks if the authenticated user has a required permission.
 */
export function requirePermission(permission: Permission) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    const req = _req;
    const permissions = ROLE_PERMISSIONS[req.auth.role] ?? [];
    if (!permissions.includes(permission)) {
      return next(new ForbiddenError(`Permission "${permission}" required`));
    }
    next();
  };
}

/**
 * Middleware: ensures tenant isolation — the tenantId in the path must match the auth token.
 */
export function requireTenantMatch(paramName = 'tenantId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const paramTenantId = req.params[paramName];
    if (paramTenantId && paramTenantId !== req.auth.tenantId) {
      return next(new ForbiddenError('Access to this tenant is not allowed'));
    }
    next();
  };
}
