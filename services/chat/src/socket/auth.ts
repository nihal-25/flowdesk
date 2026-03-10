import jwt from 'jsonwebtoken';
import type { JwtPayload } from '@flowdesk/shared';
import { config } from '../config.js';
import { AuthError } from '../errors.js';

export interface SocketAuthContext {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  jti: string;
}

export function verifySocketToken(token: string): SocketAuthContext {
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    return {
      userId: payload.sub,
      tenantId: payload.tid,
      role: payload.role,
      email: payload.email,
      jti: payload.jti,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError('Token expired', 'TOKEN_EXPIRED');
    }
    throw new AuthError('Invalid token', 'TOKEN_INVALID');
  }
}

export function extractSocketToken(
  auth: Record<string, unknown>,
  headers: Record<string, string | string[] | undefined>,
): string {
  // Try socket handshake auth.token first
  if (auth['token'] && typeof auth['token'] === 'string') {
    return auth['token'];
  }

  // Try Authorization header
  const authHeader = headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  throw new AuthError('No authentication token provided');
}
