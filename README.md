# FlowDesk

> Production-grade real-time multi-tenant SaaS customer support platform built with microservices architecture

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4_strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Kafka](https://img.shields.io/badge/Kafka-Redpanda_Cloud-231F20?logo=apachekafka&logoColor=white)](https://www.redpanda.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)

---

## 🔗 Live Links

| | URL |
|---|---|
| **Frontend Dashboard** | **https://flowdesk-orpin.vercel.app** |
| **API Gateway** | **https://gateway-production-25dc.up.railway.app** |
| **Health Check** | https://gateway-production-25dc.up.railway.app/health |
| **GitHub** | https://github.com/nihal-25/flowdesk |

> The full stack is deployed and running. Use the [Quick Demo walkthrough](#quick-demo-for-recruiters) below to explore everything in under 5 minutes.

---

## Table of Contents

- [What is FlowDesk?](#what-is-flowdesk)
- [Quick Demo for Recruiters](#quick-demo-for-recruiters)
- [Feature Breakdown](#feature-breakdown)
- [Architecture](#architecture)
- [Engineering Highlights](#engineering-highlights)
- [Tech Stack](#tech-stack)
- [API Reference with curl Examples](#api-reference-with-curl-examples)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Architecture Decisions (Why)](#architecture-decisions-why)
- [Resume Bullet Points](#resume-bullet-points)

---

## What is FlowDesk?

FlowDesk is a **customer support ticketing platform** — think Intercom or Zendesk — built from scratch as a portfolio project to demonstrate senior-level backend and full-stack engineering.

Companies use FlowDesk to:
- Receive and manage support tickets from customers
- Assign tickets to agents and track resolution
- Chat with customers in real time inside each ticket
- Get notified by email or webhook when tickets change
- See analytics on team performance and response times

**What makes this portfolio-worthy:**
- 6 independent Node.js microservices with a real API Gateway
- Multi-tenant: every query enforces tenant isolation at the SQL level
- Real-time WebSocket chat that scales horizontally via Redis pub/sub
- Event-driven async processing via Kafka (not direct HTTP calls between services)
- JWT security with refresh token rotation and theft detection
- Production deployments on Railway + Vercel with CI via GitHub

---

## Quick Demo for Recruiters

The live app is fully deployed. Here is the fastest path to seeing everything.

### Step 1 — Open the dashboard and register

Go to **https://flowdesk-orpin.vercel.app**

Click **"Get Started"** or **"Register"** and fill in:
- Company name: `Acme Support`
- Your name and email
- Any password

This creates a new **tenant** (isolated workspace) and logs you in as the admin.

---

### Step 2 — Load demo data (one click)

On the dashboard homepage, click the **"Load Demo Data"** button.

This creates:
- 3 agent accounts (Sarah Chen, Marcus Johnson, Priya Patel) with different roles
- 10 tickets across all statuses (`open`, `in_progress`, `resolved`, `closed`) and priorities (`low`, `medium`, `high`, `urgent`)
- Message threads inside tickets
- Ticket events (status changes, assignments) for the audit timeline

After loading, the dashboard numbers populate and the ticket list fills up.

---

### Step 3 — Explore the Tickets page

Go to **`/tickets`** in the sidebar.

What to notice:
- **Filters**: filter by status, priority, assignee, date range — all update in real time
- **Search**: search by ticket title
- **Click any ticket** to open the detail view

Inside a ticket detail:
- You can change the **status** (enforced transitions: `open → in_progress → resolved → closed`)
- You can **reassign** the ticket to a different agent
- You can **change priority**, add/remove **tags**
- There is a full **message thread** at the bottom
- On the right side is a **timeline of all events** (every status change, assignment, update — immutable audit log)

---

### Step 4 — Watch real-time chat

Open the ticket detail page in **two browser tabs** (or two different browsers).

In one tab, type a reply in the message box at the bottom. Watch it appear **instantly** in the other tab without a page refresh. This is Socket.IO + Redis pub/sub.

While typing (before sending), watch the **"... is typing"** indicator appear in the other tab.

---

### Step 5 — Analytics page

Go to **`/analytics`** in the sidebar.

What you see:
- **Overview cards**: open ticket count, resolved today, average resolution time, active agents
- **Ticket volume chart**: line graph of ticket creation over the last 7 days (recharts)
- **Agent performance table**: tickets assigned vs resolved per agent, avg response time
- **Response time histogram**: distribution of first-response times

These numbers update in real time as Kafka consumers process ticket events and push stats into Redis.

---

### Step 6 — Test the notification bell

Invite a second agent via **Settings → Team → Invite Agent** (enter any email).

In a second session (different browser or incognito), log in as one of the demo agents created in Step 2. Assign a ticket to yourself. Watch the bell icon in the top nav show an unread count badge.

Click the bell to see the notification dropdown. Click a notification to jump to the relevant ticket.

---

### Step 7 — API Keys and Webhooks (Settings page)

Go to **`/settings`** → **API Keys** tab:
- Click **"Create API Key"** — the raw key is shown exactly once (copy it)
- The key is stored as a bcrypt hash — even the server can't see the original
- Use the key as a `Bearer` token to make API calls from external systems

Go to **Settings → Webhooks**:
- Add a webhook URL (use https://webhook.site to get a test endpoint)
- Select which events to receive (`ticket.created`, `ticket.updated`, etc.)
- When a ticket is created, FlowDesk signs the payload with HMAC-SHA256 and delivers it to your URL
- Failed deliveries retry with exponential backoff: 1s → 2s → 4s → 8s → 16s

---

### Step 8 — Test the live API directly

```bash
# Register and grab the access token
TOKEN=$(curl -s -X POST https://gateway-production-25dc.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "API Test Corp",
    "firstName": "Test",
    "lastName": "User",
    "email": "apitest@example.com",
    "password": "SecurePass123!"
  }' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

echo "Token: $TOKEN"

# Create a ticket
curl -s -X POST https://gateway-production-25dc.up.railway.app/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API test ticket",
    "description": "Created directly via API",
    "priority": "high",
    "tags": ["api", "test"]
  }' | cat

# Get analytics
curl -s https://gateway-production-25dc.up.railway.app/analytics/overview \
  -H "Authorization: Bearer $TOKEN" | cat
```

---

## Feature Breakdown

### Authentication & Security
| Feature | Description |
|---|---|
| Tenant registration | Creating an account creates an isolated workspace (tenant). All data is scoped to that tenant. |
| JWT access tokens | 15-minute TTL, stored in memory (never localStorage). Signed with HS256. |
| Refresh token rotation | 7-day tokens, hashed in PostgreSQL. Each use issues a new pair and invalidates the old one. |
| Theft detection | If a used refresh token is presented again, the entire token family is invalidated — all sessions revoked. |
| Token blacklisting | On logout, the access token is added to Redis with a TTL = its remaining natural lifetime. It cannot be replayed. |
| API Keys | SHA-256 hashed in the database. Raw key shown exactly once at creation. Can be revoked instantly. |
| Team invites | Admin sends invite email with a signed token. Invitee sets password on accept. |
| RBAC | Roles: `superadmin`, `admin`, `agent`, `viewer`. Route-level enforcement in the gateway. |

### Ticket Management
| Feature | Description |
|---|---|
| Create ticket | Title, description, priority (`low`, `medium`, `high`, `urgent`), tags |
| Status transitions | Enforced server-side: `open → in_progress → resolved → closed`. Invalid transitions return 422. |
| Assignment | Assign/reassign to any agent in the tenant. Triggers Kafka event → notification to assignee. |
| Message thread | Full message history per ticket. Each message stored with sender, timestamp, read status. |
| Ticket events | Every state change creates an immutable `ticket_events` record — full audit trail. |
| Filters | Filter by status, priority, assignee, date range. All parameterized SQL — no string concatenation. |
| Soft delete | Tickets are never hard-deleted. Admins can soft-delete; data is retained for audit. |

### Real-Time Chat
| Feature | Description |
|---|---|
| WebSocket connection | Socket.IO with JWT auth in the connection handshake. Unauthenticated connections are rejected. |
| Tenant isolation | Users can only join rooms (`ticket:{id}`, `tenant:{id}`) belonging to their own tenant. |
| Typing indicators | `typing:start` emits to all participants; auto-expires after 3 seconds of inactivity. |
| Presence tracking | Online/offline status using Redis sorted sets. Stale entries pruned atomically. |
| Horizontal scaling | Redis pub/sub: a message received on server instance A is broadcast to all instances. Multiple chat pods can run simultaneously. |
| Read receipts | `message:read` event marks messages as read and updates unread counts. |

### Notifications
| Feature | Description |
|---|---|
| In-app notifications | Created by Kafka consumers. Bell icon with unread count badge, dropdown list, mark-as-read. |
| Email notifications | Nodemailer via Gmail SMTP. Sent when tickets are assigned, resolved, or get a new message while the recipient is offline. |
| Webhook delivery | HMAC-SHA256 signed payloads (`X-FlowDesk-Signature: sha256=...`). Configurable per-tenant. |
| Retry logic | 5 attempts with exponential backoff (1s → 16s). Auto-disables endpoint after 5 consecutive failures. |
| Delivery log | Every webhook attempt logged to `webhook_deliveries` table with status code and response body. |

### Analytics
| Feature | Description |
|---|---|
| Overview stats | Open tickets, resolved today, avg resolution time, total agents, avg first-response time. |
| Ticket volume chart | Time series of ticket creation by day (7d / 30d / 90d). |
| Agent performance | Per-agent: tickets assigned, resolved, avg resolution time, avg first-response time. |
| Response time histogram | Distribution bucketed by response time. Useful for SLA tracking. |
| Real-time updates | Dashboard numbers pushed via WebSocket when Kafka consumers process new events. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                    │
│           React SPA (Vite)          API Consumers (API Keys)        │
│        https://flowdesk-orpin.vercel.app                            │
└──────────────────────┬──────────────────────────┬───────────────────┘
                       │ HTTPS / REST              │ WebSocket (wss://)
          ┌────────────▼──────────────────────────▼───────────────┐
          │                   API GATEWAY  :3000                   │
          │                                                        │
          │  • JWT validation (signature + Redis blacklist check)  │
          │  • API key validation (SHA-256 lookup in PostgreSQL)   │
          │  • Tenant extraction → x-tenant-id header downstream  │
          │  • RBAC enforcement per route                         │
          │  • Redis sliding-window rate limiting (per-tenant + IP)│
          │  • Request ID injection (UUID, all logs correlated)    │
          │  • Audit log on every mutating request                 │
          │  • Reverse proxy to internal services                  │
          └──────┬──────────┬──────────┬─────────┬────────────────┘
                 │          │          │         │
     ┌───────────▼──┐  ┌────▼───┐  ┌──▼────┐  ┌▼──────────────┐
     │  AUTH :3001   │  │TICKETS │  │ CHAT  │  │  ANALYTICS    │
     │               │  │ :3002  │  │ :3003 │  │    :3005      │
     │ • Register    │  │        │  │       │  │               │
     │ • Login       │  │ • CRUD │  │ WS    │  │ • Kafka       │
     │ • JWT issue   │  │ • Msgs │  │ rooms │  │   consumer    │
     │ • Refresh     │  │ • State│  │ Redis │  │ • Stats agg   │
     │   rotation    │  │   mgmt │  │pub/sub│  │ • REST API    │
     │ • Invite flow │  │ • Kafka│  │Presence  └───────────────┘
     │ • API keys    │  │   emit │  │tracking│
     └───────────────┘  └────────┘  └────────┘
                                              ┌──────────────────┐
                                              │  NOTIFICATIONS   │
                                              │     :3004        │
                                              │                  │
                                              │ • Kafka consumer │
                                              │ • Email (SMTP)   │
                                              │ • HMAC webhooks  │
                                              │ • Retry + backoff│
                                              └──────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                   │
│                                                                      │
│  PostgreSQL 15 (Railway)      Redis 7 (Railway)    Redpanda Cloud   │
│  ─────────────────────        ────────────────     ───────────────  │
│  12 tables, UUID PKs          Rate limiting        8 Kafka topics   │
│  Row-level tenant isolation   Token blacklist      5 consumer groups│
│  Raw SQL migrations           Pub/Sub broadcast    SASL/SCRAM-256   │
│  withTransaction() helper     Presence sets        Durable replay   │
│  Parameterized queries only   Session cache        Auto-retry       │
└─────────────────────────────────────────────────────────────────────┘
```

### Kafka Event Flow

```
Ticket Service                   Kafka Topics               Consumers
─────────────                    ────────────               ─────────
ticket.create() ──────────────► ticket.created ──────────► notifications service
                                                ──────────► analytics service

ticket.assign() ──────────────► ticket.assigned ─────────► notifications service
                                                ─────────► analytics service

message.add()   ──────────────► message.sent ────────────► notifications service
                                                ─────────► analytics service

                                 notification.send ───────► notifications service
                                 webhook.deliver ─────────► notifications service
                                 audit.log ───────────────► analytics service
```

Services never call each other over HTTP in the critical path. The ticket service publishes and immediately returns `201`. Downstream processing is guaranteed-delivery async.

### Database Schema (12 tables)

```
tenants ──────────────────────────────────────────────────────────────┐
   └── users ──────────────────────────────────────────────────────┐  │
        └── refresh_tokens                                         │  │
        └── api_keys                                               │  │
        └── tickets ─────────────────────────────────────────────┐│  │
             └── messages                                         ││  │
             └── ticket_events (audit trail)                      ││  │
        └── notifications                                         ││  │
        └── presence                                              ││  │
        └── webhook_endpoints ──────────────────────────────────┐ ││  │
             └── webhook_deliveries                              │ ││  │
        └── audit_logs                                           │ ││  │
                                                                 └─┘└──┘
                                     All tables: tenant_id FK on every row
```

Every single query in the codebase includes `WHERE tenant_id = $tenant_id`. There is no shared state between tenants at the database level.

---

## Engineering Highlights

### 1. Multi-Tenant Row-Level Isolation

Every table has a `tenant_id` UUID foreign key. Every SQL query is scoped:

```sql
-- Example: ticket list query in tickets service
SELECT t.*, u.first_name || ' ' || u.last_name AS assigned_to_name
FROM tickets t
LEFT JOIN users u ON t.assigned_to = u.id
WHERE t.tenant_id = $1          -- ← always here, always first parameter
  AND ($2::text IS NULL OR t.status = $2)
  AND ($3::text IS NULL OR t.priority = $3)
ORDER BY t.created_at DESC
LIMIT $4 OFFSET $5;
```

The Gateway extracts the tenant from the JWT and forwards it as `x-tenant-id`. Services trust this header (they sit behind the Gateway, not exposed publicly). Cross-tenant leaks require explicitly removing a `WHERE` clause — they cannot happen through ORM abstraction bugs.

### 2. WebSocket Horizontal Scaling via Redis Pub/Sub

```
Client A (server pod 1)        Client B (server pod 2)
        │                               │
        │ sends message                 │
        ▼                               │
   Pod 1 receives                       │
        │                               │
        ├─── PUBLISH pubsub:msg:{tenant} ──► Redis
        │                               │
        │                          Pod 2 SUBSCRIBE fires
        │                               │
        │                               ▼
        │                     Pod 2 broadcasts to Client B
```

Without this, messages to users on a different pod would be lost. With Redis pub/sub, all pods see every message for their tenant. Add or remove pods freely.

### 3. Refresh Token Family Tracking (Theft Detection)

```
Login:          issue token T1 (family: F1, status: active)

First refresh:  T1 → consumed, issue T2 (family: F1)

Attack scenario:
  Attacker steals T1 before user uses it

  Attacker uses T1:  T1 still active → issue T3 (family: F1)
  User tries T1 now: T1 is consumed → DETECT REUSE
                                     → invalidate entire family F1
                                     → T2 and T3 both revoked
                                     → user forced to re-login
```

Implemented in `services/auth/src/routes/auth.ts`. Token families tracked in the `refresh_tokens` table with a `revoked` boolean and a shared `family_id` UUID column.

### 4. Redis Sliding Window Rate Limiter (Lua atomic script)

```lua
-- Executed atomically on Redis — no race conditions
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, now .. math.random())
  redis.call('EXPIRE', key, window / 1000)
  return 1  -- allowed
end
return 0    -- rejected
```

Two independent limiters per request: per-tenant (1000 req/min) and per-IP (100 req/min). Unlike a fixed window, a sliding window prevents a burst of 2× the limit across a window boundary.

### 5. HMAC-SHA256 Signed Webhook Delivery

```
FlowDesk sends:
  POST https://customer-endpoint.com/hook
  X-FlowDesk-Signature: sha256=a1b2c3d4...
  Content-Type: application/json

  { "event": "ticket.created", "data": { ... }, "timestamp": 1709123456 }

Customer verifies:
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  const isValid = timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(received.replace('sha256=', ''))
  );
```

This mirrors GitHub's webhook security scheme. Customers can verify the payload wasn't tampered in transit.

---

## Tech Stack

| Technology | Role | Why this choice |
|---|---|---|
| **TypeScript 5.4 (strict)** | Language | `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` — zero runtime surprises from type gaps |
| **Node.js 20 + Express** | HTTP runtime | Non-blocking I/O ideal for chat; well-understood for microservices; stable LTS |
| **PostgreSQL 15** | Primary database | ACID for ticket data; row-level tenant isolation visible in plain SQL; no ORM magic hiding queries |
| **Redis 7** | Cache, pub/sub, rate limiting | Sub-ms latency; atomic Lua scripts; sorted sets for presence and rate limiting; pub/sub for WS scaling |
| **Apache Kafka (Redpanda Cloud)** | Message bus | Durable replay; multiple consumers per topic; decouples services; no data loss if consumer is down |
| **Socket.IO 4** | WebSocket server | Fallback transport; rooms map to ticket isolation; solid reconnection logic |
| **Zod 3** | Schema validation | Parse-don't-validate at every boundary; errors surface as structured `ValidationError` objects |
| **React 18 + Vite** | Frontend | Fast HMR; tree-shaking; no CRA overhead |
| **Tailwind CSS 3** | Styling | Utility-first; consistent design tokens; no runtime CSS-in-JS |
| **Zustand 4** | Frontend state | Minimal boilerplate; no Provider wrapping; works with slices pattern for auth + notifications + websocket |
| **Recharts** | Charts | Composable React charting; zero-config SVG output |
| **npm workspaces** | Monorepo | Workspace symlinks; shared types without versioning; TypeScript project references for incremental builds |
| **Docker multi-stage** | Containerization | Builder stage compiles TS; production stage has only the compiled output + prod deps; non-root user |
| **Railway** | Backend hosting | Per-service deployments; managed PostgreSQL and Redis; private networking between services |
| **Vercel** | Frontend hosting | Zero-config Vite deployment; edge CDN; auto-preview per branch |

---

## API Reference with curl Examples

All responses use a consistent envelope:

```json
// Success
{
  "success": true,
  "data": { ... },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-03-11T19:00:00.000Z"
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": { "priority": "must be one of: low, medium, high, urgent" }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Auth Endpoints

```bash
# ── Register (creates tenant + admin account) ──────────────────────────────
curl -X POST https://gateway-production-25dc.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Acme Corp",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@acme.com",
    "password": "SecurePass123!"
  }'
# → { "data": { "accessToken": "eyJ...", "user": {...}, "tenant": {...} } }

# ── Login ──────────────────────────────────────────────────────────────────
curl -X POST https://gateway-production-25dc.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{ "email": "jane@acme.com", "password": "SecurePass123!" }'
# → access token in body, refresh token in httpOnly cookie

# ── Get current user ───────────────────────────────────────────────────────
curl https://gateway-production-25dc.up.railway.app/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# ── Refresh access token ──────────────────────────────────────────────────
curl -X POST https://gateway-production-25dc.up.railway.app/auth/refresh \
  -b cookies.txt
# → new access token + rotated refresh token cookie

# ── Logout ────────────────────────────────────────────────────────────────
curl -X POST https://gateway-production-25dc.up.railway.app/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
# → access token blacklisted in Redis, cookie cleared

# ── Create API Key ─────────────────────────────────────────────────────────
curl -X POST https://gateway-production-25dc.up.railway.app/auth/api-keys \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Production Integration" }'
# → { "data": { "key": "fd_live_abc123..." } }  ← shown ONCE only
```

### Ticket Endpoints

```bash
# ── Create ticket ─────────────────────────────────────────────────────────
curl -X POST https://gateway-production-25dc.up.railway.app/tickets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Payment gateway returning 402",
    "description": "All transactions failing since 14:30 UTC. Affects EU region.",
    "priority": "urgent",
    "tags": ["billing", "production", "eu-region"]
  }'

# ── List tickets with filters ──────────────────────────────────────────────
curl "https://gateway-production-25dc.up.railway.app/tickets?status=open&priority=urgent&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"

# ── Get ticket detail (includes messages + event timeline) ────────────────
curl https://gateway-production-25dc.up.railway.app/tickets/TICKET_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# ── Update ticket (status transition) ────────────────────────────────────
curl -X PATCH https://gateway-production-25dc.up.railway.app/tickets/TICKET_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "in_progress" }'

# ── Add message to ticket ─────────────────────────────────────────────────
curl -X POST https://gateway-production-25dc.up.railway.app/tickets/TICKET_ID/messages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "body": "Investigated and found the root cause. Fixing now." }'

# ── Assign ticket to agent ────────────────────────────────────────────────
curl -X PATCH https://gateway-production-25dc.up.railway.app/tickets/TICKET_ID/assign \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "agentId": "AGENT_UUID" }'
```

### Analytics Endpoints

```bash
# ── Overview stats ────────────────────────────────────────────────────────
curl https://gateway-production-25dc.up.railway.app/analytics/overview \
  -H "Authorization: Bearer YOUR_TOKEN"
# → { open_tickets, resolved_today, avg_resolution_time_hours, active_agents }

# ── Ticket volume time series ─────────────────────────────────────────────
curl "https://gateway-production-25dc.up.railway.app/analytics/tickets?period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"

# ── Agent performance ─────────────────────────────────────────────────────
curl https://gateway-production-25dc.up.railway.app/analytics/agents \
  -H "Authorization: Bearer YOUR_TOKEN"

# ── Response time histogram ───────────────────────────────────────────────
curl https://gateway-production-25dc.up.railway.app/analytics/response-times \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Notification Endpoints

```bash
# ── Get notifications (paginated) ─────────────────────────────────────────
curl https://gateway-production-25dc.up.railway.app/notifications \
  -H "Authorization: Bearer YOUR_TOKEN"

# ── Mark notification as read ─────────────────────────────────────────────
curl -X PATCH https://gateway-production-25dc.up.railway.app/notifications/NOTIF_ID/read \
  -H "Authorization: Bearer YOUR_TOKEN"

# ── Mark all read ─────────────────────────────────────────────────────────
curl -X PATCH https://gateway-production-25dc.up.railway.app/notifications/read-all \
  -H "Authorization: Bearer YOUR_TOKEN"

# ── Unread count ──────────────────────────────────────────────────────────
curl https://gateway-production-25dc.up.railway.app/notifications/unread-count \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Status Transition Rules

```
Valid transitions (enforced server-side, 422 on invalid):

  open ──────────► in_progress ──────► resolved ──────► closed
   │                                      │
   └──────────────────────────────────────┘ (direct close)
                                          │
                                          └──────► open (re-open)
```

---

## Project Structure

```
flowdesk/
│
├── packages/                         # Shared npm workspace packages
│   ├── shared/                       # TypeScript types, Zod schemas, constants
│   │   └── src/
│   │       ├── types/                # Tenant, User, Ticket, Message, Notification...
│   │       ├── schemas/              # Zod validation schemas for all entities
│   │       └── constants/           # Kafka topic names, status enums, error codes
│   │
│   ├── database/                     # PostgreSQL connection, migrations, helpers
│   │   └── src/
│   │       ├── pool.ts               # pg Pool factory with connection retry
│   │       ├── query.ts              # query(), queryOne(), withTransaction() helpers
│   │       ├── migrate.ts            # Migration runner (reads ordered .sql files)
│   │       └── migrations/           # 001_tenants.sql ... 007_audit_logs.sql
│   │
│   ├── redis/                        # ioredis client factory + utilities
│   │   └── src/
│   │       ├── client.ts             # initRedis(), getRedis(), getSubscriberClient()
│   │       ├── rateLimiter.ts        # Lua sliding-window rate limiter
│   │       ├── lock.ts               # Distributed lock (SETNX + atomic Lua release)
│   │       ├── cache.ts              # get/set/invalidate/invalidatePattern helpers
│   │       ├── session.ts            # Session helpers
│   │       ├── blacklist.ts          # Token blacklist (SET with TTL)
│   │       └── presence.ts           # ZADD/ZRANGE presence tracking per tenant
│   │
│   └── kafka/                        # KafkaJS producer/consumer factory
│       └── src/
│           ├── producer.ts           # Typed producer with all topic constants
│           └── consumer.ts           # Consumer factory with exponential backoff
│
├── services/
│   ├── gateway/                      # API Gateway (port 3000)
│   │   └── src/
│   │       ├── middleware/
│   │       │   ├── auth.ts           # JWT + API key validation
│   │       │   ├── tenant.ts         # Tenant extraction, x-tenant-id header injection
│   │       │   ├── rbac.ts           # Role-based access control
│   │       │   ├── rateLimit.ts      # Per-tenant + per-IP rate limiting
│   │       │   ├── requestId.ts      # UUID injection for tracing
│   │       │   └── audit.ts          # Audit log on mutating requests
│   │       └── index.ts              # Express app, route proxying
│   │
│   ├── auth/                         # Auth service (port 3001)
│   │   └── src/
│   │       ├── routes/auth.ts        # All auth endpoints
│   │       ├── services/             # Token, invite, API key business logic
│   │       └── email/                # Nodemailer SMTP templates
│   │
│   ├── tickets/                      # Ticket service (port 3002)
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── tickets.ts        # CRUD, filters, pagination
│   │       │   ├── messages.ts       # Message thread management
│   │       │   └── agents.ts         # Agent list, workload
│   │       └── services/             # Status transition engine, event publisher
│   │
│   ├── chat/                         # Chat service (port 3003)
│   │   └── src/
│   │       ├── socket/
│   │       │   ├── auth.ts           # Socket.IO JWT middleware
│   │       │   ├── rooms.ts          # Ticket room management, tenant isolation
│   │       │   └── events.ts         # message, typing, presence event handlers
│   │       └── index.ts              # Socket.IO + Express + Redis pub/sub setup
│   │
│   ├── notifications/                # Notifications service (port 3004)
│   │   └── src/
│   │       ├── consumers/            # Kafka consumers per topic
│   │       ├── email/                # SMTP delivery with templates
│   │       ├── webhook/              # HMAC signing, delivery, retry
│   │       └── routes/               # Notification REST endpoints
│   │
│   └── analytics/                    # Analytics service (port 3005)
│       └── src/
│           ├── consumers/            # Kafka consumers → Redis stat updates
│           └── routes/               # Overview, time-series, agent, histogram
│
├── frontend/                         # React dashboard
│   └── src/
│       ├── pages/                    # Dashboard, Tickets, TicketDetail, Analytics...
│       ├── components/               # Shared UI components
│       ├── stores/                   # Zustand stores (auth, notifications, websocket)
│       ├── hooks/                    # useWebSocket, useTickets, useAnalytics...
│       └── lib/                      # API client (axios), WebSocket client
│
├── docker-compose.yml                # Local PostgreSQL + Redis (no Kafka — uses Redpanda Cloud)
└── README.md
```

---

## Local Development

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A free Redpanda Cloud account at [console.redpanda.com](https://console.redpanda.com)

### Setup

```bash
# 1. Clone
git clone https://github.com/nihal-25/flowdesk.git
cd flowdesk

# 2. Install all workspace dependencies
npm install

# 3. Start PostgreSQL + Redis locally
docker-compose up -d

# 4. Copy and fill in .env files for each service
cp services/auth/.env.example          services/auth/.env
cp services/gateway/.env.example       services/gateway/.env
cp services/tickets/.env.example       services/tickets/.env
cp services/chat/.env.example          services/chat/.env
cp services/notifications/.env.example services/notifications/.env
cp services/analytics/.env.example     services/analytics/.env
cp frontend/.env.example               frontend/.env

# 5. Generate JWT secrets (paste into services/auth/.env and services/gateway/.env)
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET

# 6. Add Redpanda Cloud credentials to all service .env files:
#    KAFKA_BROKERS=your-cluster.redpanda.cloud:9092
#    KAFKA_SASL_USERNAME=your-user
#    KAFKA_SASL_PASSWORD=your-password

# 7. Build shared packages (once)
npm run build -w packages/shared
npm run build -w packages/database
npm run build -w packages/redis
npm run build -w packages/kafka

# 8. Run database migrations
node packages/database/dist/migrate.js

# 9. Start all services in dev mode
npm run dev

# 10. Open the dashboard
open http://localhost:5173
```

### Local Service URLs

| Service | URL |
|---|---|
| API Gateway | http://localhost:3000 |
| Auth | http://localhost:3001 |
| Tickets | http://localhost:3002 |
| Chat (WebSocket) | http://localhost:3003 |
| Notifications | http://localhost:3004 |
| Analytics | http://localhost:3005 |
| Frontend | http://localhost:5173 |

---

## Architecture Decisions (Why)

### Why raw SQL and not an ORM?

ORMs hide the query layer. For a multi-tenant system where every query **must** include `WHERE tenant_id = $1`, hiding SQL means hiding the isolation mechanism. A bug in ORM query-building can silently omit the tenant filter and leak data between customers. With raw SQL:
- The tenant condition is visible and greppable in every file
- A code review can catch a missing `WHERE` clause
- There is no "magic" to debug at 2 AM during an incident

The `query()`, `queryOne()`, and `withTransaction()` helpers in `packages/database` provide connection pooling and transaction support without abstracting away the SQL.

### Why Kafka for inter-service communication and not REST?

If the ticket service calls the notification service over HTTP synchronously:
- The API response is blocked waiting for the notification to send
- If the notification service is down, ticket creation fails too
- Adding a third consumer (e.g. an ML service) requires modifying the ticket service

With Kafka:
1. Ticket service publishes `ticket.created` and returns `201` immediately
2. Notification service consumes the event asynchronously — 50ms or 5 minutes later, doesn't matter
3. If the notification service is down for 10 minutes, Kafka holds the events — zero data loss
4. A new analytics service subscribes to the same topic without any change to the ticket service

The topology follows domain events: `ticket.created`, `ticket.assigned`, `message.sent`, `webhook.deliver`, `audit.log`.

### Why Redis for rate limiting and not in-process counters?

In-process counters break with horizontal scaling. Pod A has its own counter; Pod B has its own. A user can exceed the limit N times by round-robin hitting N pods. Redis centralizes the counter. A Lua script makes the `ZREMRANGEBYSCORE` (prune) + `ZCARD` (check) + `ZADD` (increment) sequence atomic. No race conditions.

Sliding window (not fixed window) prevents the classic burst-at-boundary attack where you send max requests just before the window resets and max requests just after, effectively getting 2× the limit.

### Why refresh token families instead of simple rotation?

Simple token rotation (give me token T1, get T2) doesn't help if T1 was already stolen. The attacker uses T1 to get T3 before the legitimate user does. Both attacker and user now have valid tokens.

Token families solve this: T1, T2, T3 all share a `family_id`. If T1 is presented **after** it was already rotated (only possible if someone stole it and held it), the server detects reuse and **invalidates the entire family** — T2 and T3 both revoked. The user is forced to re-login. The attacker loses their session.

This is the approach recommended by [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) and implemented by Google and GitHub.

### Why a monorepo instead of separate repos?

The `packages/shared` types (`Ticket`, `User`, `Tenant`, `KafkaEvent`) are used by all 6 services and the frontend. With 7 separate repos, a type change requires: bump version → publish → update each repo. In a monorepo with workspace symlinks, changing `packages/shared/src/types/ticket.ts` is immediately reflected in all services and caught by TypeScript's project references at compile time — before any deployment.

---

## Resume Bullet Points

```
• Architected FlowDesk, a multi-tenant SaaS platform with 6 Node.js microservices,
  PostgreSQL row-level tenant isolation enforced on every query, and an API Gateway
  handling JWT/API-key auth, RBAC, and Redis sliding-window rate limiting (per-tenant + per-IP)

• Implemented real-time WebSocket chat with Socket.IO + Redis pub/sub for horizontal
  scaling across multiple service instances; typing indicators, presence tracking via
  Redis sorted sets, and per-ticket room isolation per tenant

• Built an event-driven async pipeline over 8 Kafka topics (Redpanda Cloud,
  SASL/SCRAM-SHA-256); services communicate exclusively through events — no
  synchronous HTTP calls in the critical path; zero data loss if consumers restart

• Engineered HMAC-SHA256 signed webhook delivery with 5-attempt exponential backoff
  (1s→16s), delivery log per attempt, and automatic endpoint deactivation after
  consecutive failures; mirrors GitHub's webhook security scheme

• Designed JWT refresh token rotation with token family tracking (RFC 9700) for
  stolen-token detection: reuse of a consumed token invalidates the entire family;
  access token blacklisting in Redis with TTL = remaining natural lifetime

• Structured a TypeScript strict-mode monorepo (npm workspaces + project references):
  4 shared packages (shared, database, redis, kafka) consumed by 6 services and React
  frontend with incremental compilation and zero runtime `any` types
```

---

## License

MIT © 2026 Nihal Manjunath
