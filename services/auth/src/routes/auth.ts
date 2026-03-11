import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '@flowdesk/database';
import {
  blacklistToken,
  isTokenBlacklisted,
  storeRefreshTokenFamily,
  invalidateRefreshTokenFamily,
  storeInviteToken,
  consumeInviteToken,
} from '@flowdesk/redis';
import {
  generateSecureToken,
  generateApiKey,
  hashToken,
  slugify,
  ROLE_PERMISSIONS,
  JWT_REFRESH_TOKEN_TTL_SECONDS,
  JWT_INVITE_TOKEN_TTL_SECONDS,
  API_KEY_PREFIX,
} from '@flowdesk/shared';
import { publishEvent } from '@flowdesk/kafka';
import { KAFKA_TOPICS } from '@flowdesk/shared';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../lib/password.js';
import { sendInviteEmail } from '../lib/email.js';
import {
  ValidationError,
  AuthError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../errors.js';
import { ERROR_CODES } from '@flowdesk/shared';
import { config } from '../config.js';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  tenantName: z.string().min(2).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

const inviteSchema = z.object({
  email: z.string().email().toLowerCase(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['admin', 'agent', 'viewer']),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = 'fd_refresh';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    // 'none' allows the cookie to be sent on cross-origin requests
    // (required when frontend and API are on different domains, e.g. vercel.app → railway.app)
    // 'none' requires secure:true in production
    sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: JWT_REFRESH_TOKEN_TTL_SECONDS * 1000,
    path: '/auth',
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /auth/register
 * Creates a new tenant and admin user.
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = registerSchema.safeParse(req.body);
    if (!input.success) throw new ValidationError('Invalid input', input.error.flatten());

    const { tenantName, firstName, lastName, email, password } = input.data;

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) throw new ValidationError(pwCheck.reason ?? 'Weak password');

    const slug = slugify(tenantName);

    const result = await withTransaction(async (client) => {
      // Check slug uniqueness
      const existing = await client.query(
        'SELECT id FROM tenants WHERE slug = $1',
        [slug],
      );
      if ((existing.rowCount ?? 0) > 0) {
        throw new ConflictError(`Tenant slug "${slug}" is already taken`);
      }

      // Check email uniqueness (no tenant yet — check globally for superadmin case)
      // For multi-tenant: email is unique within a tenant, but on registration it's a new tenant
      const hashed = await hashPassword(password);

      const tenantRow = await client.query<{ id: string }>(
        `INSERT INTO tenants (name, slug, plan, max_agents, max_tickets_per_month)
         VALUES ($1, $2, 'free', 3, 100)
         RETURNING id`,
        [tenantName, slug],
      );
      const tenant = tenantRow.rows[0];
      if (!tenant) throw new Error('Failed to create tenant');

      const userRow = await client.query<{ id: string; email: string; role: string }>(
        `INSERT INTO users (tenant_id, email, first_name, last_name, role, hashed_password)
         VALUES ($1, $2, $3, $4, 'admin', $5)
         RETURNING id, email, role`,
        [tenant.id, email, firstName, lastName, hashed],
      );
      const user = userRow.rows[0];
      if (!user) throw new Error('Failed to create user');

      return { tenantId: tenant.id, userId: user.id, role: user.role };
    });

    const { token: accessToken, jti, expiresAt } = signAccessToken({
      userId: result.userId,
      tenantId: result.tenantId,
      role: 'admin',
      email,
    });

    const refresh = signRefreshToken({
      userId: result.userId,
      tenantId: result.tenantId,
    });

    const refreshHash = hashToken(refresh.token);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [result.userId, refreshHash, refresh.familyId, refresh.expiresAt],
    );

    await storeRefreshTokenFamily(result.userId, refresh.familyId);
    setRefreshCookie(res, refresh.token);

    // Publish audit event
    await publishEvent(KAFKA_TOPICS.AUDIT_LOG, {
      topic: KAFKA_TOPICS.AUDIT_LOG,
      tenantId: result.tenantId,
      userId: result.userId,
      action: 'user.created',
      entityType: 'user',
      entityId: result.userId,
      oldValue: null,
      newValue: { email, role: 'admin' },
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });

    res.success({ accessToken, expiresIn: expiresAt - Math.floor(Date.now() / 1000) }, 201);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/login
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = loginSchema.safeParse(req.body);
    if (!input.success) throw new ValidationError('Invalid input', input.error.flatten());

    const { email, password } = input.data;

    const user = await queryOne<{
      id: string;
      tenant_id: string;
      email: string;
      role: string;
      hashed_password: string;
      is_active: boolean;
    }>(
      `SELECT u.id, u.tenant_id, u.email, u.role, u.hashed_password, u.is_active
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND t.is_active = true
       LIMIT 1`,
      [email],
    );

    if (!user) throw new AuthError('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
    if (!user.is_active) throw new AuthError('Account is disabled', ERROR_CODES.ACCOUNT_DISABLED);

    const passwordValid = await verifyPassword(password, user.hashed_password);
    if (!passwordValid) throw new AuthError('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);

    const { token: accessToken, expiresAt } = signAccessToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role as never,
      email: user.email,
    });

    const refresh = signRefreshToken({ userId: user.id, tenantId: user.tenant_id });
    const refreshHash = hashToken(refresh.token);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, refreshHash, refresh.familyId, refresh.expiresAt],
    );

    await query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id],
    );

    await storeRefreshTokenFamily(user.id, refresh.familyId);
    setRefreshCookie(res, refresh.token);

    res.success({ accessToken, expiresIn: expiresAt - Math.floor(Date.now() / 1000) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/refresh
 * Rotates the refresh token (silent refresh).
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
    if (!rawToken) throw new AuthError('Refresh token not found');

    const payload = verifyRefreshToken(rawToken);
    const tokenHash = hashToken(rawToken);

    const stored = await queryOne<{
      id: string;
      user_id: string;
      family_id: string;
      revoked: boolean;
      expires_at: Date;
    }>(
      `SELECT id, user_id, family_id, revoked, expires_at
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [tokenHash],
    );

    if (!stored) throw new AuthError('Invalid refresh token', ERROR_CODES.TOKEN_INVALID);

    if (stored.revoked) {
      // Token reuse detected — invalidate entire family
      await query(
        `UPDATE refresh_tokens SET revoked = true, revoked_at = NOW()
         WHERE family_id = $1`,
        [stored.family_id],
      );
      await invalidateRefreshTokenFamily(payload.sub, stored.family_id);
      throw new AuthError('Refresh token reuse detected. Please login again.', ERROR_CODES.TOKEN_INVALID);
    }

    if (stored.expires_at < new Date()) {
      throw new AuthError('Refresh token has expired', ERROR_CODES.TOKEN_EXPIRED);
    }

    // Revoke the used token
    await query(
      `UPDATE refresh_tokens SET revoked = true, revoked_at = NOW() WHERE id = $1`,
      [stored.id],
    );

    const user = await queryOne<{ id: string; tenant_id: string; email: string; role: string; is_active: boolean }>(
      `SELECT id, tenant_id, email, role, is_active FROM users WHERE id = $1`,
      [payload.sub],
    );
    if (!user || !user.is_active) throw new AuthError('Account not found or disabled');

    // Issue new token pair
    const { token: newAccess, expiresAt } = signAccessToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role as never,
      email: user.email,
    });

    const newRefresh = signRefreshToken({
      userId: user.id,
      tenantId: user.tenant_id,
      familyId: stored.family_id, // Keep same family for tracking
    });

    const newRefreshHash = hashToken(newRefresh.token);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, newRefreshHash, newRefresh.familyId, newRefresh.expiresAt],
    );

    setRefreshCookie(res, newRefresh.token);
    res.success({ accessToken: newAccess, expiresIn: expiresAt - Math.floor(Date.now() / 1000) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/logout
 */
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = verifyAccessToken(token);
        await blacklistToken(payload.jti, payload.exp);
      } catch {
        // Token might already be expired — that's fine
      }
    }

    const rawRefresh = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
    if (rawRefresh) {
      const refreshHash = hashToken(rawRefresh);
      await query(
        `UPDATE refresh_tokens SET revoked = true, revoked_at = NOW()
         WHERE token_hash = $1`,
        [refreshHash],
      );
    }

    clearRefreshCookie(res);
    res.success({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/me
 * Returns the authenticated user and tenant profile.
 */
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new AuthError();

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    const blacklisted = await isTokenBlacklisted(payload.jti);
    if (blacklisted) throw new AuthError('Token has been revoked', ERROR_CODES.TOKEN_BLACKLISTED);

    const user = await queryOne<{
      id: string;
      tenant_id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      is_active: boolean;
      avatar_url: string | null;
      last_login_at: Date | null;
      created_at: Date;
      tenant_name: string;
      tenant_slug: string;
      tenant_plan: string;
    }>(
      `SELECT u.id, u.tenant_id, u.email, u.first_name, u.last_name, u.role,
              u.is_active, u.avatar_url, u.last_login_at, u.created_at,
              t.name AS tenant_name, t.slug AS tenant_slug, t.plan AS tenant_plan
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [payload.sub],
    );

    if (!user) throw new NotFoundError('User');

    res.success({
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      avatarUrl: user.avatar_url,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        slug: user.tenant_slug,
        plan: user.tenant_plan,
      },
      permissions: ROLE_PERMISSIONS[user.role as keyof typeof ROLE_PERMISSIONS] ?? [],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/invite
 * Admin invites a team member.
 */
router.post('/invite', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new AuthError();

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    if (!['admin', 'superadmin'].includes(payload.role)) throw new ForbiddenError();

    const input = inviteSchema.safeParse(req.body);
    if (!input.success) throw new ValidationError('Invalid input', input.error.flatten());

    const { email, firstName, lastName, role } = input.data;

    // Check if user already exists in this tenant
    const existing = await queryOne(
      `SELECT id FROM users WHERE tenant_id = $1 AND email = $2`,
      [payload.tid, email],
    );
    if (existing) throw new ConflictError(`User ${email} already exists in this tenant`);

    const inviteToken = generateSecureToken(32);
    const tokenHash = hashToken(inviteToken);

    const inviter = await queryOne<{ first_name: string; last_name: string }>(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [payload.sub],
    );
    const tenant = await queryOne<{ name: string }>(
      `SELECT name FROM tenants WHERE id = $1`,
      [payload.tid],
    );

    await query(
      `INSERT INTO invite_tokens (tenant_id, email, first_name, last_name, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '24 hours')`,
      [payload.tid, email, firstName, lastName, role, tokenHash, payload.sub],
    );

    await storeInviteToken(
      inviteToken,
      { tenantId: payload.tid, email, firstName, lastName, role },
      JWT_INVITE_TOKEN_TTL_SECONDS,
    );

    const inviteUrl = `${config.CORS_ORIGINS.split(',')[0] ?? 'http://localhost:5173'}/accept-invite?token=${inviteToken}`;

    await sendInviteEmail({
      to: email,
      firstName,
      inviterName: inviter ? `${inviter.first_name} ${inviter.last_name}` : 'A team member',
      tenantName: tenant?.name ?? 'your team',
      inviteUrl,
    });

    res.success({ message: `Invitation sent to ${email}` }, 201);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/accept-invite
 */
router.post('/accept-invite', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = acceptInviteSchema.safeParse(req.body);
    if (!input.success) throw new ValidationError('Invalid input', input.error.flatten());

    const { token, password, firstName: newFirstName, lastName: newLastName } = input.data;

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) throw new ValidationError(pwCheck.reason ?? 'Weak password');

    // Try Redis first (fast path), fallback to DB
    const cached = await consumeInviteToken(token);
    const tokenHash = hashToken(token);

    const dbToken = await queryOne<{
      id: string;
      tenant_id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `SELECT id, tenant_id, email, first_name, last_name, role, expires_at, used_at
       FROM invite_tokens
       WHERE token_hash = $1`,
      [tokenHash],
    );

    if (!dbToken) throw new AuthError('Invalid or expired invite token', ERROR_CODES.INVITE_INVALID);
    if (dbToken.used_at) throw new AuthError('Invite token already used', ERROR_CODES.INVITE_INVALID);
    if (dbToken.expires_at < new Date()) throw new AuthError('Invite token has expired', ERROR_CODES.INVITE_EXPIRED);

    const firstName = newFirstName ?? dbToken.first_name;
    const lastName = newLastName ?? dbToken.last_name;
    const hashed = await hashPassword(password);

    const user = await withTransaction(async (client) => {
      const userRow = await client.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, first_name, last_name, role, hashed_password)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [dbToken.tenant_id, dbToken.email, firstName, lastName, dbToken.role, hashed],
      );
      await client.query(
        `UPDATE invite_tokens SET used_at = NOW() WHERE id = $1`,
        [dbToken.id],
      );
      return userRow.rows[0];
    });

    if (!user) throw new Error('Failed to create user');

    const { token: accessToken, expiresAt } = signAccessToken({
      userId: user.id,
      tenantId: dbToken.tenant_id,
      role: dbToken.role as never,
      email: dbToken.email,
    });

    const refresh = signRefreshToken({ userId: user.id, tenantId: dbToken.tenant_id });
    const refreshHash = hashToken(refresh.token);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, refreshHash, refresh.familyId, refresh.expiresAt],
    );

    setRefreshCookie(res, refresh.token);
    res.success({ accessToken, expiresIn: expiresAt - Math.floor(Date.now() / 1000) }, 201);

    // Suppress unused variable warning for cached
    void cached;
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/api-keys
 * Create a new API key (raw returned once, then hashed).
 */
router.post('/api-keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new AuthError();
    const payload = verifyAccessToken(authHeader.slice(7));

    const input = createApiKeySchema.safeParse(req.body);
    if (!input.success) throw new ValidationError('Invalid input', input.error.flatten());

    const rawKey = generateApiKey();
    const keyHash = hashToken(rawKey);
    const keyPrefix = rawKey.slice(0, 15) + '...';

    const row = await queryOne<{ id: string; created_at: Date }>(
      `INSERT INTO api_keys (tenant_id, user_id, name, key_hash, key_prefix)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [payload.tid, payload.sub, input.data.name, keyHash, keyPrefix],
    );

    if (!row) throw new Error('Failed to create API key');

    res.success({
      id: row.id,
      name: input.data.name,
      keyPrefix,
      rawKey, // Shown once — never retrievable again
      createdAt: row.created_at,
    }, 201);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/api-keys
 */
router.get('/api-keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new AuthError();
    const payload = verifyAccessToken(authHeader.slice(7));

    const rows = await query<{
      id: string;
      name: string;
      key_prefix: string;
      last_used_at: Date | null;
      is_active: boolean;
      created_at: Date;
    }>(
      `SELECT id, name, key_prefix, last_used_at, is_active, created_at
       FROM api_keys
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [payload.tid],
    );

    res.success(rows.rows.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.key_prefix,
      lastUsedAt: r.last_used_at,
      isActive: r.is_active,
      createdAt: r.created_at,
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /auth/api-keys/:id
 */
router.delete('/api-keys/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new AuthError();
    const payload = verifyAccessToken(authHeader.slice(7));

    const result = await query(
      `UPDATE api_keys SET is_active = false
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [req.params['id'], payload.tid],
    );

    if ((result.rowCount ?? 0) === 0) throw new NotFoundError('API key');

    res.success({ message: 'API key revoked' });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
