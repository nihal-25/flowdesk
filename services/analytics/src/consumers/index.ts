import { createConsumer } from '@flowdesk/kafka';
import { KAFKA_TOPICS } from '@flowdesk/shared';
import type {
  TicketCreatedEvent,
  TicketResolvedEvent,
  MessageSentEvent,
  TicketAssignedEvent,
} from '@flowdesk/shared';
import { getRedis } from '@flowdesk/redis';

// ─── Redis analytics key helpers ─────────────────────────────────────────────

function statsKey(tenantId: string): string {
  return `analytics:${tenantId}:stats`;
}

function agentWorkloadKey(tenantId: string, agentId: string): string {
  return `analytics:${tenantId}:agent:${agentId}:workload`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleTicketCreated(payload: TicketCreatedEvent): Promise<void> {
  const redis = getRedis();
  const key = statsKey(payload.tenantId);
  await redis.hincrby(key, 'open_tickets', 1);
  await redis.hincrby(key, 'total_tickets', 1);

  if (payload.assignedTo) {
    await redis.hincrby(agentWorkloadKey(payload.tenantId, payload.assignedTo), 'assigned', 1);
  }
}

async function handleTicketResolved(payload: TicketResolvedEvent): Promise<void> {
  const redis = getRedis();
  const key = statsKey(payload.tenantId);
  await redis.hincrby(key, 'open_tickets', -1);
  await redis.hincrby(key, 'resolved_today', 1);
  await redis.hincrby(key, 'total_resolved', 1);

  // Store resolution time (accumulate for avg calculation)
  await redis.hincrby(key, 'total_resolution_time_ms', payload.resolutionTimeMs);
  await redis.hincrby(key, 'resolved_count_for_avg', 1);

  if (payload.resolvedByUserId) {
    await redis.hincrby(agentWorkloadKey(payload.tenantId, payload.resolvedByUserId), 'resolved', 1);
  }
}

async function handleMessageSent(payload: MessageSentEvent): Promise<void> {
  const redis = getRedis();
  await redis.hincrby(statsKey(payload.tenantId), 'total_messages', 1);
}

async function handleTicketAssigned(payload: TicketAssignedEvent): Promise<void> {
  const redis = getRedis();
  if (payload.assignedToUserId) {
    await redis.hincrby(agentWorkloadKey(payload.tenantId, payload.assignedToUserId), 'assigned', 1);
  }
  if (payload.previousAssigneeId) {
    await redis.hincrby(agentWorkloadKey(payload.tenantId, payload.previousAssigneeId), 'assigned', -1);
  }
}

// ─── Start consumers ──────────────────────────────────────────────────────────

export async function startConsumers(): Promise<void> {
  await createConsumer(
    {
      groupId: 'flowdesk-analytics',
      topics: [
        KAFKA_TOPICS.TICKET_CREATED,
        KAFKA_TOPICS.TICKET_RESOLVED,
        KAFKA_TOPICS.MESSAGE_SENT,
        KAFKA_TOPICS.TICKET_ASSIGNED,
      ],
    },
    [
      {
        topic: KAFKA_TOPICS.TICKET_CREATED,
        handler: async (payload) => {
          await handleTicketCreated(payload as TicketCreatedEvent);
        },
      },
      {
        topic: KAFKA_TOPICS.TICKET_RESOLVED,
        handler: async (payload) => {
          await handleTicketResolved(payload as TicketResolvedEvent);
        },
      },
      {
        topic: KAFKA_TOPICS.MESSAGE_SENT,
        handler: async (payload) => {
          await handleMessageSent(payload as MessageSentEvent);
        },
      },
      {
        topic: KAFKA_TOPICS.TICKET_ASSIGNED,
        handler: async (payload) => {
          await handleTicketAssigned(payload as TicketAssignedEvent);
        },
      },
    ],
  );

  console.info('[analytics] Consumers started');
}
