import type { UserRole } from './user.js';

export interface JwtPayload {
  sub: string; // userId
  tid: string; // tenantId
  role: UserRole;
  email: string;
  jti: string; // JWT ID (for blacklisting)
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  tid: string; // tenantId
  jti: string; // token family ID
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number; // seconds
}

export interface RegisterInput {
  tenantName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface InviteUserInput {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface AcceptInviteInput {
  token: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  jti: string;
  requestId: string;
}
