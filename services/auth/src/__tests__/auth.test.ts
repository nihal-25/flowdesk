/**
 * Integration tests for the FlowDesk Auth Service.
 *
 * Prerequisites:
 *   - PostgreSQL running (docker-compose up -d)
 *   - Redis running (docker-compose up -d)
 *   - A .env file in services/auth/ with valid credentials
 *
 * These tests hit a real running Express server spun up in-process.
 * The server connects to actual Postgres and Redis (no mocks).
 *
 * Run with: npm test -w services/auth
 */

import request from 'supertest';
import { randomUUID } from 'crypto';

// ─── Env setup (must come before any service imports that read process.env) ───
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // OS-assigned port — avoids conflicts with running instances

// Load .env file for test credentials
import { config as dotenvConfig } from 'dotenv';
import path from 'path';
dotenvConfig({ path: path.resolve(__dirname, '../../.env') });

// ─── App bootstrap ─────────────────────────────────────────────────────────────
// We import the express app without calling app.listen() so supertest manages
// the lifecycle. The bootstrap logic (DB migrations, Redis, Kafka) is handled
// by a test-specific setup helper.
import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initPool, testConnection, runMigrations } from '@flowdesk/database';
import { initRedis, testRedisConnection } from '@flowdesk/redis';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { responseMiddleware } from '../middleware/response.js';
import { errorHandler, notFoundHandler } from '../middleware/error-handler.js';
import { authRouter } from '../routes/auth.js';

let app: Application;

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Generate a unique email to prevent conflicts across test runs */
function uniqueEmail(): string {
  return `test-${randomUUID().slice(0, 8)}@flowdesk-test.example.com`;
}

/** Extract Set-Cookie header value for a named cookie */
function getCookie(res: request.Response, name: string): string | undefined {
  const cookies = res.headers['set-cookie'] as string[] | string | undefined;
  if (!cookies) return undefined;
  const list = Array.isArray(cookies) ? cookies : [cookies];
  const match = list.find((c) => c.startsWith(`${name}=`));
  if (!match) return undefined;
  return match.split(';')[0]; // e.g. "fd_refresh=eyJ..."
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Build a minimal Express app identical to the real one but without Kafka
  // (Kafka requires an active Redpanda Cloud connection — not available in CI)
  app = express();
  app.use(helmet());
  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(responseMiddleware);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'auth-test' });
  });

  app.use('/auth', authRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Connect to real Postgres + Redis
  initPool({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await testConnection();
  await runMigrations();

  initRedis({
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT ?? 6379),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    tls: process.env.REDIS_TLS === 'true',
  });

  await testRedisConnection();
}, 30_000);

afterAll(async () => {
  const { closePool } = await import('@flowdesk/database');
  const { closeRedis } = await import('@flowdesk/redis');
  await Promise.all([closePool(), closeRedis()]);
}, 10_000);

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Auth Service — Integration', () => {
  // Shared state across tests in this suite
  const email = uniqueEmail();
  const password = 'TestPass123!';
  let accessToken: string;
  let refreshCookie: string;

  // ── 1. Register ─────────────────────────────────────────────────────────────
  describe('POST /auth/register', () => {
    it('creates a new tenant and admin user', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          tenantName: `Test Tenant ${randomUUID().slice(0, 6)}`,
          firstName: 'Jane',
          lastName: 'Smith',
          email,
          password,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        user: {
          email,
          role: 'admin',
        },
      });
      expect(res.body.data.accessToken).toBeDefined();
      expect(typeof res.body.data.accessToken).toBe('string');

      // Should set a refresh token cookie
      const cookie = getCookie(res, 'fd_refresh');
      expect(cookie).toBeDefined();
    });

    it('rejects duplicate tenant slug', async () => {
      // Same tenant name → same slug → conflict
      const tenantName = `Conflict Tenant ${randomUUID().slice(0, 4)}`;
      await request(app)
        .post('/auth/register')
        .send({ tenantName, firstName: 'A', lastName: 'B', email: uniqueEmail(), password });

      const res = await request(app)
        .post('/auth/register')
        .send({ tenantName, firstName: 'C', lastName: 'D', email: uniqueEmail(), password })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBeDefined();
    });

    it('rejects invalid email', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          tenantName: 'Any Corp',
          firstName: 'X',
          lastName: 'Y',
          email: 'not-an-email',
          password,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects weak password (< 8 chars)', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          tenantName: 'Any Corp',
          firstName: 'X',
          lastName: 'Y',
          email: uniqueEmail(),
          password: 'short',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ── 2. Login ────────────────────────────────────────────────────────────────
  describe('POST /auth/login', () => {
    it('returns access token and sets refresh cookie on valid credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe(email);

      accessToken = res.body.data.accessToken;
      const cookie = getCookie(res, 'fd_refresh');
      expect(cookie).toBeDefined();
      refreshCookie = cookie!;
    });

    it('rejects wrong password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email, password: 'WrongPassword999!' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('rejects non-existent email', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('rejects missing fields', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ── 3. /auth/me ─────────────────────────────────────────────────────────────
  describe('GET /auth/me', () => {
    it('returns current user info with valid access token', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.user.role).toBe('admin');
      expect(res.body.data.tenant).toBeDefined();
      expect(res.body.data.permissions).toBeDefined();
    });

    it('rejects request without token', async () => {
      const res = await request(app).get('/auth/me').expect(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects malformed token', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer not.a.real.token')
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ── 4. Refresh token rotation ────────────────────────────────────────────────
  describe('POST /auth/refresh', () => {
    it('rotates refresh token and returns new access token', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();

      // New access token should be different
      expect(res.body.data.accessToken).not.toBe(accessToken);

      // Should set a new refresh cookie
      const newCookie = getCookie(res, 'fd_refresh');
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toBe(refreshCookie);

      // Update state for downstream tests
      accessToken = res.body.data.accessToken;
      refreshCookie = newCookie!;
    });

    it('rejects refresh with no cookie', async () => {
      const res = await request(app).post('/auth/refresh').expect(401);
      expect(res.body.success).toBe(false);
    });

    it('detects refresh token reuse and invalidates the whole family', async () => {
      // Save the current (valid) refresh cookie
      const stolenCookie = refreshCookie;

      // Legitimate rotation — produces a new cookie, old one is now consumed
      const rotateRes = await request(app)
        .post('/auth/refresh')
        .set('Cookie', stolenCookie)
        .expect(200);

      const newCookie = getCookie(rotateRes, 'fd_refresh')!;
      accessToken = rotateRes.body.data.accessToken;
      refreshCookie = newCookie;

      // Attempt to reuse the old (now-consumed) token — should invalidate family
      const reuseRes = await request(app)
        .post('/auth/refresh')
        .set('Cookie', stolenCookie)
        .expect(401);

      expect(reuseRes.body.success).toBe(false);

      // The new cookie should also now be invalid (family revoked)
      const afterRevokeRes = await request(app)
        .post('/auth/refresh')
        .set('Cookie', newCookie)
        .expect(401);

      expect(afterRevokeRes.body.success).toBe(false);

      // Re-login to get fresh tokens for subsequent tests
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      accessToken = loginRes.body.data.accessToken;
      refreshCookie = getCookie(loginRes, 'fd_refresh')!;
    });
  });

  // ── 5. Logout ────────────────────────────────────────────────────────────────
  describe('POST /auth/logout', () => {
    it('blacklists the access token and clears the refresh cookie', async () => {
      // Verify token works before logout
      await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Logout
      const logoutRes = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshCookie)
        .expect(200);

      expect(logoutRes.body.success).toBe(true);

      // Access token should now be blacklisted
      const meRes = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(meRes.body.success).toBe(false);

      // Refresh cookie should be cleared
      const refreshAfterLogout = await request(app)
        .post('/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);

      expect(refreshAfterLogout.body.success).toBe(false);
    });
  });

  // ── 6. API Keys ──────────────────────────────────────────────────────────────
  describe('API Keys', () => {
    let freshToken: string;
    let createdKeyId: string;

    beforeAll(async () => {
      // Re-login to get a fresh token (previous one was logged out)
      const res = await request(app)
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      freshToken = res.body.data.accessToken;
    });

    it('creates a new API key and returns the raw key once', async () => {
      const res = await request(app)
        .post('/auth/api-keys')
        .set('Authorization', `Bearer ${freshToken}`)
        .send({ name: 'Test Integration Key' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.rawKey).toMatch(/^fd_/);
      expect(res.body.data.apiKey.name).toBe('Test Integration Key');
      expect(res.body.data.apiKey.keyPreview).toBeDefined();

      createdKeyId = res.body.data.apiKey.id;
    });

    it('lists API keys without exposing the raw key', async () => {
      const res = await request(app)
        .get('/auth/api-keys')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.apiKeys)).toBe(true);

      const created = res.body.data.apiKeys.find((k: { id: string }) => k.id === createdKeyId);
      expect(created).toBeDefined();
      // Raw key must never be returned in list
      expect(created?.rawKey).toBeUndefined();
    });

    it('revokes an API key', async () => {
      const res = await request(app)
        .delete(`/auth/api-keys/${createdKeyId}`)
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Should no longer appear in the list
      const listRes = await request(app)
        .get('/auth/api-keys')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);

      const revoked = listRes.body.data.apiKeys.find((k: { id: string }) => k.id === createdKeyId);
      expect(revoked).toBeUndefined();
    });

    it('rejects API key creation without auth', async () => {
      const res = await request(app)
        .post('/auth/api-keys')
        .send({ name: 'Unauthenticated Key' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ── 7. Health check ──────────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 with service status', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
