import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '@flowdesk/database';
import { getRedis, getOnlineUsers, cacheGetOrSet } from '@flowdesk/redis';
import { REDIS_KEYS, parsePeriod } from '@flowdesk/shared';
import { authenticate } from '../middleware/auth.js';
import { ValidationError } from '../errors.js';

export const analyticsRouter = Router();

// ─── GET /analytics/overview ──────────────────────────────────────────────────

analyticsRouter.get('/overview', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;

    const data = await cacheGetOrSet(
      REDIS_KEYS.ANALYTICS_OVERVIEW(tenantId),
      async () => {
        const redis = getRedis();
        const statsKey = `analytics:${tenantId}:stats`;

        // Get Redis counters
        const [
          openTicketsRaw,
          resolvedTodayRaw,
          totalResMsRaw,
          resolvedCountRaw,
        ] = await Promise.all([
          redis.hget(statsKey, 'open_tickets'),
          redis.hget(statsKey, 'resolved_today'),
          redis.hget(statsKey, 'total_resolution_time_ms'),
          redis.hget(statsKey, 'resolved_count_for_avg'),
        ]);

        const openTickets = parseInt(openTicketsRaw ?? '0', 10);
        const resolvedToday = parseInt(resolvedTodayRaw ?? '0', 10);
        const totalResMs = parseInt(totalResMsRaw ?? '0', 10);
        const resolvedCount = parseInt(resolvedCountRaw ?? '0', 10);
        const avgResolutionTimeMs = resolvedCount > 0 ? Math.round(totalResMs / resolvedCount) : 0;

        // DB queries for agents
        const agentsResult = await queryOne<{ total: string }>(
          `SELECT COUNT(*) AS total FROM users WHERE tenant_id = $1 AND role IN ('admin', 'agent') AND is_active = true`,
          [tenantId],
        );

        const onlineAgents = await getOnlineUsers(tenantId);

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const monthTickets = await queryOne<{ count: string }>(
          `SELECT COUNT(*) AS count FROM tickets WHERE tenant_id = $1 AND created_at >= $2`,
          [tenantId, monthStart],
        );

        return {
          stats: {
            openTickets,
            resolvedToday,
            avgResolutionTimeMs,
            totalAgents: parseInt(agentsResult?.total ?? '0', 10),
            activeAgents: onlineAgents.length,
            totalTicketsThisMonth: parseInt(monthTickets?.count ?? '0', 10),
          },
          updatedAt: new Date().toISOString(),
        };
      },
      60, // 60 seconds cache TTL
    );

    res.json({
      success: true,
      data,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /analytics/tickets?period=7d ────────────────────────────────────────

analyticsRouter.get('/tickets', authenticate, async (req, res, next) => {
  try {
    const periodSchema = z.object({
      period: z.string().default('7d'),
    });
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query params', parsed.error.flatten());

    const { tenantId } = req.auth;
    const { startDate, endDate } = parsePeriod(parsed.data.period);

    const rows = await query<{ date: string; created: string; resolved: string; closed: string }>(
      `SELECT
         DATE(created_at)::text AS date,
         COUNT(*) FILTER (WHERE true) AS created,
         COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
         COUNT(*) FILTER (WHERE status = 'closed') AS closed
       FROM tickets
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3 AND is_deleted = false
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [tenantId, startDate, endDate],
    );

    res.json({
      success: true,
      data: {
        period: parsed.data.period,
        dataPoints: rows.rows.map((row) => ({
          date: row.date,
          created: parseInt(row.created, 10),
          resolved: parseInt(row.resolved, 10),
          closed: parseInt(row.closed, 10),
        })),
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /analytics/agents ────────────────────────────────────────────────────

analyticsRouter.get('/agents', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;

    const data = await cacheGetOrSet(
      REDIS_KEYS.ANALYTICS_AGENTS(tenantId),
      async () => {
        const agents = await query<{
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          assigned_count: string;
          resolved_count: string;
        }>(
          `SELECT
             u.id,
             u.first_name,
             u.last_name,
             u.email,
             COUNT(t.id) FILTER (WHERE t.assigned_to = u.id AND t.status NOT IN ('resolved', 'closed')) AS assigned_count,
             COUNT(t.id) FILTER (WHERE t.assigned_to = u.id AND t.status IN ('resolved', 'closed')) AS resolved_count
           FROM users u
           LEFT JOIN tickets t ON t.tenant_id = u.tenant_id AND t.assigned_to = u.id AND t.is_deleted = false
           WHERE u.tenant_id = $1 AND u.role IN ('admin', 'agent', 'superadmin') AND u.is_active = true
           GROUP BY u.id, u.first_name, u.last_name, u.email
           ORDER BY u.first_name ASC`,
          [tenantId],
        );

        const onlineIds = await getOnlineUsers(tenantId);
        const onlineSet = new Set(onlineIds);

        return {
          agents: agents.rows.map((agent) => ({
            agentId: agent.id,
            firstName: agent.first_name,
            lastName: agent.last_name,
            email: agent.email,
            assignedCount: parseInt(agent.assigned_count, 10),
            resolvedCount: parseInt(agent.resolved_count, 10),
            avgResponseTimeMs: 0, // Would require message timestamps
            avgResolutionTimeMs: 0, // Would require resolution times
            isOnline: onlineSet.has(agent.id),
          })),
          updatedAt: new Date().toISOString(),
        };
      },
      120, // 2 minute cache
    );

    res.json({
      success: true,
      data,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /analytics/response-times ───────────────────────────────────────────

analyticsRouter.get('/response-times', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;

    const result = await query<{ bucket: string; count: string }>(
      `WITH resolution_times AS (
         SELECT
           EXTRACT(EPOCH FROM (resolved_at - created_at)) * 1000 AS resolution_ms
         FROM tickets
         WHERE tenant_id = $1
           AND status IN ('resolved', 'closed')
           AND resolved_at IS NOT NULL
           AND is_deleted = false
       ),
       bucketed AS (
         SELECT
           CASE
             WHEN resolution_ms < 3600000 THEN '< 1h'
             WHEN resolution_ms < 14400000 THEN '1-4h'
             WHEN resolution_ms < 86400000 THEN '4-24h'
             ELSE '> 24h'
           END AS bucket,
           COUNT(*) AS count
         FROM resolution_times
         GROUP BY bucket
       )
       SELECT bucket, count FROM bucketed`,
      [tenantId],
    );

    const totalTickets = result.rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0);
    const bucketOrder = ['< 1h', '1-4h', '4-24h', '> 24h'];

    const buckets = bucketOrder.map((label) => {
      const row = result.rows.find((r) => r.bucket === label);
      const count = parseInt(row?.count ?? '0', 10);
      return {
        rangeLabel: label,
        count,
        percentage: totalTickets > 0 ? Math.round((count / totalTickets) * 100) : 0,
      };
    });

    res.json({
      success: true,
      data: {
        buckets,
        totalTickets,
        updatedAt: new Date().toISOString(),
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
