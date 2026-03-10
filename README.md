# FlowDesk

> Real-time multi-tenant SaaS customer support platform — production-grade microservices architecture

<!-- Badges -->
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Apache Kafka](https://img.shields.io/badge/Kafka-Redpanda_Cloud-231F20?logo=apachekafka)](https://www.redpanda.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**[Live Demo](https://flowdesk.vercel.app)** · **[API Docs](#api-reference)** · **[Architecture](#architecture)**

---

## Overview

FlowDesk is a customer support ticketing platform built with microservices architecture. It handles real-time agent–customer communication, multi-tenant data isolation, and event-driven notifications at scale.

Built as a portfolio project demonstrating senior-level engineering: not just "it works" but **why** each architectural decision was made and the tradeoffs involved.

**Key numbers:**
- 6 independent Node.js microservices behind a single API Gateway
- 12 PostgreSQL tables with row-level tenant isolation on every query
- 8 Kafka topics consumed by 5 independent consumer groups
- Redis used for rate limiting, token blacklisting, pub/sub, and presence tracking
- WebSocket scaling that works across any number of chat service instances

---

## Architecture

```
                        ┌──────────────────────────────────────────────────┐
                        │                    CLIENTS                        │
                        │  React SPA (Vite)  ·  API Consumers (API Keys)   │
                        └──────────────┬───────────────────┬───────────────┘
                                       │ HTTPS             │ WebSocket
                        ┌──────────────▼───────────────────▼───────────────┐
                        │             API GATEWAY  :3000                    │
                        │  JWT Auth · API Key Auth · Rate Limit (Redis)    │
                        │  Tenant Isolation · RBAC · Audit Logging         │
                        └──┬──────────┬──────────┬──────────┬──────────────┘
                           │          │          │          │
        ┌──────────────────▼──┐  ┌────▼───┐  ┌──▼─────┐  ┌▼───────────────┐
        │    AUTH  :3001       │  │TICKETS │  │  CHAT  │  │   ANALYTICS    │
        │  Register · Login    │  │ :3002  │  │  :3003 │  │     :3005      │
        │  JWT · Refresh Tokens│  │  CRUD  │  │Socket.IO│  │  Kafka Consumer│
        │  Invite · API Keys   │  │ Kafka  │  │Redis   │  │  Redis Cache   │
        └──────────────────────┘  │ Events │  │Pub/Sub │  └────────────────┘
                                  └────────┘  └────────┘
                                                          ┌─────────────────┐
                                                          │  NOTIFICATIONS  │
                                                          │     :3004       │
                                                          │  Kafka Consumer │
                                                          │  HMAC Webhooks  │
                                                          │  Nodemailer     │
                                                          └─────────────────┘

        ┌──────────────────────────────────────────────────────────────────┐
        │                         DATA LAYER                               │
        │  PostgreSQL 15             Redis 7           Redpanda Cloud      │
        │  12 tables · UUIDs         Rate limiting     8 Kafka topics      │
        │  Row-level isolation       Token blacklist   5 consumer groups   │
        │  Raw SQL migrations        Pub/Sub scaling   SASL/SCRAM-SHA-256  │
        └──────────────────────────────────────────────────────────────────┘
```

### Service Responsibilities

| Service | Port | Responsibility |
|---------|------|----------------|
| **gateway** | 3000 | Single entry point: JWT/API key validation, rate limiting, reverse proxy |
| **auth** | 3001 | Tenant registration, login, JWT issuance, refresh token rotation, API keys, invites |
| **tickets** | 3002 | Ticket CRUD, agent assignment, status transitions, message threads |
| **chat** | 3003 | Socket.IO WebSocket server, typing indicators, presence tracking, Redis pub/sub |
| **notifications** | 3004 | Kafka consumer, email delivery via SMTP, HMAC-signed webhook dispatch |
| **analytics** | 3005 | Kafka consumer, stats aggregation, response time histograms, agent performance |

---

## Tech Stack

| Technology | Version | Why |
|-----------|---------|-----|
| **TypeScript** | 5.4 (strict) | Zero-tolerance for runtime type errors; `exactOptionalPropertyTypes` enforced across all packages |
| **Node.js + Express** | 20 LTS | Mature, battle-tested; non-blocking I/O ideal for chat and event-heavy workloads |
| **PostgreSQL** | 15 | ACID compliance for ticket data; raw SQL gives full query control and visible tenant isolation |
| **Redis** | 7 | Sub-millisecond latency for rate limiting, presence tracking, pub/sub fanout, and token blacklisting |
| **Apache Kafka** | Redpanda Cloud | Durable event stream with replay; decouples services; multiple consumers per topic |
| **Socket.IO** | 4.7 | WebSocket with automatic fallback; built-in rooms map cleanly to ticket isolation |
| **React + Vite** | 18 / 5 | Fast HMR in development; optimized production bundles with code splitting |
| **Tailwind CSS** | 3.4 | Utility-first with design tokens; no CSS-in-JS overhead at runtime |
| **Zustand** | 4.5 | Minimal boilerplate state management; no Provider nesting; supports slices pattern |
| **Zod** | 3.23 | Schema validation at every service boundary; parse-don't-validate pattern throughout |

---

## Engineering Highlights

### Multi-Tenant Architecture
Every database table carries a `tenant_id` foreign key. All queries are scoped with `WHERE tenant_id = $1` — there is no shared data between tenants. The API Gateway extracts the tenant from the JWT or API key and forwards it downstream via `x-tenant-id` headers, so each microservice never has to re-validate the token. This keeps the auth surface area small and auditable.

The tenant isolation layer is visible at the SQL level rather than hidden inside ORM magic. Every cross-tenant data leak would require explicitly removing a `WHERE` clause — it cannot happen accidentally.

### Real-Time WebSocket Scaling (Redis Pub/Sub)
A naive Socket.IO setup breaks when you run multiple chat service instances — users connected to different servers can't see each other's messages. FlowDesk solves this with Redis pub/sub: when a message arrives on instance A, it publishes to `pubsub:messages:{tenantId}`. All instances (including B, C, D) subscribe to that channel and broadcast to their locally connected clients. This is the same pattern used by Discord and Slack for horizontal WebSocket scaling.

Presence tracking uses Redis sorted sets scored by Unix timestamp. Each user's last heartbeat updates their score. Stale entries (score older than 60 seconds) are pruned atomically with `ZREMRANGEBYSCORE` on every presence query. `ZADD` + `ZRANGE` give O(log N) insert and O(log N + M) range queries.

### JWT + Refresh Token Rotation with Family Tracking
Access tokens (15-minute TTL) are stored in-memory on the client only. Refresh tokens (7-day TTL) are stored as SHA-256 hashes in PostgreSQL, grouped by `family_id`. On each refresh, the old token is consumed and a new one issued within the same family.

If a refresh token is reused (impossible in normal flow — it means the token was stolen and used before the legitimate user rotated it), the entire token family is immediately invalidated. All active sessions for that user are revoked, forcing re-login. This implements the refresh token rotation pattern from RFC 9700 (OAuth 2.0 Security Best Current Practice).

Logged-out access tokens are blacklisted in Redis with a TTL equal to their remaining natural expiry, so they can't be replayed.

### Event-Driven Microservices (Apache Kafka)
Services communicate exclusively through Kafka events — no direct service-to-service HTTP calls in the hot path. This means:
- The ticket service doesn't need to know the notification service exists
- If the notification service is down for 10 minutes, Kafka holds the messages — no events are lost
- Multiple services can independently consume the same event (ticket.created is consumed by both notifications and analytics) without coordination
- Event history is replayable for debugging or backfilling a new consumer

Topics follow the pattern `{entity}.{action}`: `ticket.created`, `ticket.updated`, `ticket.message.added`, `audit.log`, etc.

### HMAC-SHA256 Signed Webhooks
Outbound webhooks include an `X-FlowDesk-Signature: sha256=<hex>` header. Customers verify the signature with their endpoint secret to ensure the payload wasn't tampered in transit. The implementation mirrors GitHub's webhook signature scheme.

Failed deliveries use exponential backoff: 1s → 2s → 4s → 8s → 16s. After 5 consecutive failures, the endpoint is automatically disabled to prevent hammering dead URLs. Endpoint health is tracked per-tenant and surfaced in the dashboard.

### Redis Sliding Window Rate Limiting
Rate limiting is implemented as a Lua atomic script on Redis sorted sets. Each request adds a timestamped entry; entries older than the window are pruned atomically on each call. This gives true sliding-window behavior (unlike fixed-window, which allows a burst of 2× the limit across a window boundary).

Two independent limits are enforced: per-tenant (1000 req/min) and per-IP (100 req/min). The Lua script executes atomically — no race conditions between the check and the increment.

---

## Project Structure

```
flowdesk/
├── packages/
│   ├── shared/          # TypeScript types, constants, Zod schemas
│   │                    # Single source of truth — imported by all services
│   ├── database/        # PostgreSQL pool factory, migration runner, query helpers
│   │   └── migrations/  # Ordered SQL migration files (001_tenants.sql, ...)
│   ├── redis/           # ioredis client, distributed locks, rate limiter, pub/sub
│   └── kafka/           # Typed KafkaJS producer/consumer factory with SASL support
├── services/
│   ├── gateway/         # API Gateway — single entry point, auth middleware, proxying
│   ├── auth/            # Authentication, JWT, API keys, invites, email
│   ├── tickets/         # Ticket CRUD, messaging, SLA tracking, agent management
│   ├── chat/            # Socket.IO WebSocket server, real-time events, presence
│   ├── notifications/   # Kafka consumers, email delivery, webhook dispatch
│   └── analytics/       # Kafka consumers, time-series aggregation, REST API
├── frontend/            # React + Vite + Tailwind dashboard
├── docker-compose.yml   # Local PostgreSQL + Redis (production uses Railway)
└── README.md
```

### Shared Package Pattern
Each package in `packages/` compiles independently to `dist/`. Services reference them as npm workspace dependencies (`"@flowdesk/shared": "*"`). TypeScript project references ensure incremental compilation — changing `packages/shared` rebuilds only the packages and services that depend on it.

This avoids the monorepo trap of everything sharing one massive `tsconfig.json`. Each package has its own strict TypeScript config and exports only what it intentionally exposes.

---

## Local Development

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- A free Redpanda Cloud account: [console.redpanda.com](https://console.redpanda.com)

### Quick Start

```bash
# 1. Clone and install all dependencies
git clone https://github.com/YOUR_USERNAME/flowdesk.git
cd flowdesk
npm install

# 2. Start PostgreSQL + Redis
docker-compose up -d

# 3. Configure environment variables
#    Copy .env.example in each service and fill in your values
cp .env.example .env
cp services/auth/.env.example services/auth/.env
cp services/gateway/.env.example services/gateway/.env
cp services/tickets/.env.example services/tickets/.env
cp services/chat/.env.example services/chat/.env
cp services/notifications/.env.example services/notifications/.env
cp services/analytics/.env.example services/analytics/.env
cp frontend/.env.example frontend/.env

# Edit the .env files — at minimum set:
#   JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (openssl rand -hex 32)
#   KAFKA_BROKERS, KAFKA_SASL_USERNAME, KAFKA_SASL_PASSWORD

# 4. Run database migrations
npm run db:migrate

# 5. Build shared packages
npm run build -w packages/shared
npm run build -w packages/database
npm run build -w packages/redis
npm run build -w packages/kafka

# 6. Start all services (concurrently)
npm run dev

# 7. Open the dashboard
open http://localhost:5173
```

### Services after startup

| Service | URL |
|---------|-----|
| API Gateway | http://localhost:3000 |
| Auth Service | http://localhost:3001 |
| Tickets Service | http://localhost:3002 |
| Chat Service | http://localhost:3003 |
| Notifications Service | http://localhost:3004 |
| Analytics Service | http://localhost:3005 |
| React Frontend | http://localhost:5173 |

---

## API Reference

All endpoints return a consistent envelope:

```json
// Success
{ "success": true, "data": { ... }, "requestId": "uuid" }

// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { ... } } }
```

### Authentication (`/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | — | Create tenant + admin account |
| `POST` | `/auth/login` | — | Login, returns access token + sets refresh cookie |
| `POST` | `/auth/refresh` | Cookie (`fd_refresh`) | Rotate refresh token — issues new pair |
| `POST` | `/auth/logout` | Bearer | Blacklists access token, clears refresh cookie |
| `GET`  | `/auth/me` | Bearer | Current user, tenant info, permissions |
| `POST` | `/auth/invite` | Bearer (admin) | Send invite email to new team member |
| `POST` | `/auth/accept-invite` | — | Accept invite, set password, activate account |
| `POST` | `/auth/api-keys` | Bearer | Create API key (raw key shown exactly once) |
| `GET`  | `/auth/api-keys` | Bearer | List API keys (name + preview only, no raw keys) |
| `DELETE` | `/auth/api-keys/:id` | Bearer | Revoke API key immediately |

**Register example:**
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Acme Support",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@acme.com",
    "password": "SecurePass123!"
  }'
```

### Tickets (`/tickets`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/tickets` | Create ticket |
| `GET`  | `/tickets` | Paginated list with filters (`status`, `priority`, `assigneeId`, `page`, `limit`) |
| `GET`  | `/tickets/:id` | Full ticket detail with messages and event history |
| `PATCH` | `/tickets/:id` | Update fields — enforces valid status transitions |
| `DELETE` | `/tickets/:id` | Soft delete (admin only) |
| `POST` | `/tickets/:id/messages` | Add message to ticket thread |
| `PATCH` | `/tickets/:id/assign` | Assign or reassign to agent |

**Status transitions (enforced server-side):**
```
open → in_progress → resolved → closed
open → closed (direct close)
resolved → open (re-open)
```

**Create ticket example:**
```bash
curl -X POST http://localhost:3000/tickets \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Payment gateway returning 402",
    "description": "All transactions failing since 14:30 UTC",
    "priority": "urgent",
    "tags": ["billing", "production"]
  }'
```

### Analytics (`/analytics`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/analytics/overview` | Summary: open tickets, avg response time, CSAT |
| `GET`  | `/analytics/tickets?period=7d` | Ticket volume time series (7d, 30d, 90d) |
| `GET`  | `/analytics/agents` | Per-agent stats: tickets handled, avg resolution time |
| `GET`  | `/analytics/response-times` | Response time histogram (P50, P90, P99) |

### WebSocket Events (Chat Service `:3003`)

Connect with Socket.IO, authenticating via JWT in the handshake:

```javascript
const socket = io('http://localhost:3003', {
  auth: { token: accessToken },
});

// Join a ticket room
socket.emit('ticket:join', { ticketId: 'uuid' });

// Receive real-time messages
socket.on('ticket:message', (message) => { ... });

// Send a message
socket.emit('ticket:message', { ticketId: 'uuid', content: 'Hello!' });

// Typing indicators
socket.emit('ticket:typing', { ticketId: 'uuid', isTyping: true });
socket.on('ticket:typing', ({ userId, isTyping }) => { ... });

// Presence
socket.on('presence:update', ({ userId, online }) => { ... });
```

---

## Testing

### Running Integration Tests

The auth service includes integration tests that run against a real PostgreSQL and Redis instance:

```bash
# Ensure docker-compose services are up
docker-compose up -d

# Copy and fill in .env for auth service
cp services/auth/.env.example services/auth/.env

# Install test dependencies
npm install -w services/auth

# Run tests
npm test -w services/auth
```

The tests cover:
- Tenant registration and duplicate detection
- Login with valid and invalid credentials
- JWT access token verification (`/auth/me`)
- Refresh token rotation (issues new pair on each call)
- Refresh token reuse detection (invalidates entire token family)
- Logout and access token blacklisting
- API key lifecycle (create, list, revoke)

### Manual API Testing

```bash
# Register
TOKEN=$(curl -s -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"Demo Corp","firstName":"Test","lastName":"User","email":"test@demo.com","password":"Demo123!"}' \
  | jq -r '.data.accessToken')

# Create a ticket
curl -X POST http://localhost:3000/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Ticket","description":"This is a test","priority":"high"}'

# Get analytics overview
curl http://localhost:3000/analytics/overview \
  -H "Authorization: Bearer $TOKEN"
```

---

## Deployment

### Docker (all services)

Each service has a multi-stage Dockerfile. Build and run the full stack:

```bash
# Build a specific service
docker build -f services/auth/Dockerfile -t flowdesk-auth .

# Or build all and run with docker-compose (extend docker-compose.yml for services)
docker build -f services/gateway/Dockerfile -t flowdesk-gateway .
docker build -f frontend/Dockerfile -t flowdesk-frontend .
```

### Railway (Backend Services)

Railway supports monorepos with per-service Dockerfiles:

```bash
npm install -g @railway/cli
railway login

# Create a project and link
railway init

# Deploy each service (run from repo root — Railway uses the Dockerfile)
railway up --service gateway
railway up --service auth
railway up --service tickets
railway up --service chat
railway up --service notifications
railway up --service analytics
```

Set environment variables in the Railway dashboard. Use Railway's managed PostgreSQL and Redis add-ons — set `DB_SSL=true` and `REDIS_TLS=true` accordingly.

### Vercel (Frontend)

```bash
cd frontend
npx vercel --prod
# When prompted, set VITE_API_URL to your Railway gateway URL
# e.g., https://flowdesk-gateway.up.railway.app
```

---

## Architecture Decisions

**Why raw SQL instead of an ORM?**

ORMs abstract away the query layer, which sounds useful until you're debugging a tenant data leak at 2 AM. For a multi-tenant system where every query must include `tenant_id`, raw SQL makes the isolation visible, greppable, and auditable. No ORM magic can accidentally omit a `WHERE tenant_id = $1`. The query helpers in `packages/database` provide connection pooling and transaction support without hiding the SQL.

**Why Kafka for service communication instead of direct HTTP calls?**

Direct HTTP between services creates synchronous coupling: the ticket service must wait for the notification service to respond before returning to the user. Kafka decouples this:
1. The ticket service publishes `ticket.created` and immediately returns a 201 to the client
2. The notification service processes the event asynchronously — if it's down, messages queue up in Kafka and are processed on recovery
3. A new analytics event consumer can be added without touching the ticket service
4. Events are replayable for debugging or backfilling a new consumer from history

**Why Redis for rate limiting instead of in-memory counters?**

In-memory counters break with horizontal scaling — each instance has its own counter, so a user can exceed the limit N times by hitting N instances. Redis makes rate limiting stateless. A Lua script executes atomically on the Redis server, making the check-and-increment operation race-condition-free.

**Why refresh token families instead of simple rotation?**

Simple rotation (one token in, one token out) doesn't detect theft. Token families do: if a consumed token is presented again, it's impossible in legitimate flow — the only explanation is that a third party captured the token before it was rotated. Detecting this, FlowDesk invalidates the entire family, forcing re-login. This is the recommendation from RFC 9700 and the pattern used by Google and GitHub.

**Why a monorepo with npm workspaces instead of separate repos?**

The shared types in `packages/shared` are used by all 6 services and the frontend. With separate repos, keeping type definitions in sync requires versioning, publishing, and updating across 7 repos on every change. A monorepo with workspace symlinks means a type change in `packages/shared` is immediately reflected everywhere, and TypeScript project references catch type errors at build time before deployment.

---

## Resume Bullet Points

```
• Architected a multi-tenant SaaS platform with 6 Node.js microservices, PostgreSQL
  row-level tenant isolation enforced on every query, and an API Gateway handling
  JWT/API-key auth with Redis sliding-window rate limiting (per-tenant + per-IP)

• Implemented real-time customer support chat using Socket.IO + Redis pub/sub for
  horizontal scaling across multiple service instances; typing indicators, presence
  tracking via Redis sorted sets, and message read receipts

• Built an event-driven notification pipeline over 8 Kafka topics (Redpanda Cloud,
  SASL/SCRAM-SHA-256); HMAC-SHA256 signed webhook delivery with 5-attempt
  exponential backoff and automatic endpoint deactivation on repeated failure

• Designed JWT refresh token rotation with token family tracking (RFC 9700) to
  detect and invalidate stolen tokens; access token blacklisting in Redis on logout
  with TTL matching remaining token lifetime

• Structured a TypeScript monorepo with npm workspaces and project references:
  packages/shared, packages/database, packages/redis, packages/kafka consumed
  across all services with incremental compilation and strict type checking
```

---

## License

MIT © 2025
