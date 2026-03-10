import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { JwtPayload, RefreshTokenPayload, UserRole } from '@flowdesk/shared';
import { JWT_ACCESS_TOKEN_TTL_SECONDS, JWT_REFRESH_TOKEN_TTL_SECONDS } from '@flowdesk/shared';
import { config } from '../config.js';
import { AuthError } from '../errors.js';
import { ERROR_CODES } from '@flowdesk/shared';

export function signAccessToken(payload: {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
}): { token: string; jti: string; expiresAt: number } {
  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + JWT_ACCESS_TOKEN_TTL_SECONDS;

  const claims: JwtPayload = {
    sub: payload.userId,
    tid: payload.tenantId,
    role: payload.role,
    email: payload.email,
    jti,
    iat: now,
    exp: expiresAt,
  };

  const token = jwt.sign(claims, config.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
  return { token, jti, expiresAt };
}

export function signRefreshToken(payload: {
  userId: string;
  tenantId: string;
  familyId?: string;
}): { token: string; jti: string; familyId: string; expiresAt: Date } {
  const jti = randomUUID();
  const familyId = payload.familyId ?? randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_REFRESH_TOKEN_TTL_SECONDS;

  const claims: RefreshTokenPayload = {
    sub: payload.userId,
    tid: payload.tenantId,
    jti,
    iat: now,
    exp,
  };

  const token = jwt.sign(claims, config.JWT_REFRESH_SECRET, { algorithm: 'HS256' });
  const expiresAt = new Date(exp * 1000);

  return { token, jti, familyId, expiresAt };
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload;
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError('Access token has expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new AuthError('Invalid access token', ERROR_CODES.TOKEN_INVALID);
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as RefreshTokenPayload;
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError('Refresh token has expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new AuthError('Invalid refresh token', ERROR_CODES.TOKEN_INVALID);
  }
}
