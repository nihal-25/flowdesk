import { createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { createConsumer } from '@flowdesk/kafka';
import { publishEvent } from '@flowdesk/kafka';
import { query, queryOne, withTransaction } from '@flowdesk/database';
import { isUserOnline } from '@flowdesk/redis';
import {
  KAFKA_TOPICS,
  WEBHOOK_MAX_RETRIES,
  WEBHOOK_RETRY_DELAYS_MS,
  WEBHOOK_MAX_CONSECUTIVE_FAILURES,
  WEBHOOK_TIMEOUT_MS,
  WEBHOOK_SIGNATURE_HEADER,
  sleep,
} from '@flowdesk/shared';
import type {
  TicketCreatedEvent,
  TicketAssignedEvent,
  TicketResolvedEvent,
  MessageSentEvent,
  NotificationSendEvent,
  WebhookDeliverEvent,
} from '@flowdesk/shared';
import { sendEmail } from '../lib/mailer.js';

// ─── Helper: insert notification ─────────────────────────────────────────────

async function insertNotification(opts: {
  userId: string;
  tenantId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO notifications (id, user_id, tenant_id, type, title, body, is_read, entity_type, entity_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, NOW())
     ON CONFLICT DO NOTHING`,
    [
      uuidv4(),
      opts.userId,
      opts.tenantId,
      opts.type,
      opts.title,
      opts.body,
      opts.entityType ?? null,
      opts.entityId ?? null,
    ],
  );
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleTicketCreated(payload: TicketCreatedEvent): Promise<void> {
  const { tenantId, ticketId, title } = payload;

  // Notify all tenant admins
  const admins = await query<{ id: string }>(
    `SELECT id FROM users WHERE tenant_id = $1 AND role IN ('admin', 'superadmin') AND is_active = true`,
    [tenantId],
  );

  for (const admin of admins.rows) {
    await insertNotification({
      userId: admin.id,
      tenantId,
      type: 'ticket_created',
      title: `New ticket: ${title}`,
      body: `A new ticket has been created: "${title}"`,
      entityType: 'ticket',
      entityId: ticketId,
    });
  }
}

async function handleTicketAssigned(payload: TicketAssignedEvent): Promise<void> {
  const { tenantId, ticketId, title, assignedToUserId } = payload;

  await insertNotification({
    userId: assignedToUserId,
    tenantId,
    type: 'ticket_assigned',
    title: `Ticket assigned to you: ${title}`,
    body: `You have been assigned the ticket: "${title}"`,
    entityType: 'ticket',
    entityId: ticketId,
  });
}

async function handleTicketResolved(payload: TicketResolvedEvent): Promise<void> {
  const { tenantId, ticketId, title, customerId } = payload;

  if (!customerId) return;

  // Find user associated with customerId
  const customer = await queryOne<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE id = $1 AND tenant_id = $2`,
    [customerId, tenantId],
  );

  if (!customer) return;

  await insertNotification({
    userId: customer.id,
    tenantId,
    type: 'ticket_resolved',
    title: `Your ticket has been resolved: ${title}`,
    body: `The ticket "${title}" has been resolved.`,
    entityType: 'ticket',
    entityId: ticketId,
  });
}

async function handleMessageSent(payload: MessageSentEvent): Promise<void> {
  const { tenantId, ticketId, messageId, senderId } = payload;

  // Get all participants (assignee + creator) who are offline
  const ticket = await queryOne<{ assigned_to: string | null; customer_id: string | null }>(
    `SELECT assigned_to, customer_id FROM tickets WHERE id = $1 AND tenant_id = $2`,
    [ticketId, tenantId],
  );

  if (!ticket) return;

  const participantIds = new Set<string>();
  if (ticket.assigned_to) participantIds.add(ticket.assigned_to);

  // Get ticket creator from events
  const creatorRow = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM ticket_events WHERE ticket_id = $1 AND event_type = 'created' AND user_id IS NOT NULL LIMIT 1`,
    [ticketId],
  );
  if (creatorRow) participantIds.add(creatorRow.user_id);

  for (const participantId of participantIds) {
    if (participantId === senderId) continue;

    const online = await isUserOnline(participantId);
    if (!online) {
      await insertNotification({
        userId: participantId,
        tenantId,
        type: 'message_received',
        title: 'New message in ticket',
        body: 'You have a new message in a ticket you are watching.',
        entityType: 'message',
        entityId: messageId,
      });
    }
  }
}

async function handleNotificationSend(payload: NotificationSendEvent): Promise<void> {
  const { userId, tenantId, type, title, body, entityType, entityId, sendEmail: shouldSendEmail, emailTo, emailSubject } = payload;

  await insertNotification({
    userId,
    tenantId,
    type,
    title,
    body,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
  });

  if (shouldSendEmail && emailTo) {
    try {
      await sendEmail({
        to: emailTo,
        subject: emailSubject ?? title,
        text: body,
      });
    } catch (err) {
      console.error('[notifications] Failed to send email:', err);
    }
  }
}

async function handleWebhookDeliver(payload: WebhookDeliverEvent): Promise<void> {
  const { tenantId, webhookEndpointId, eventType, payload: webhookPayload, attemptNumber, requestId } = payload;

  const endpoint = await queryOne<{
    id: string;
    url: string;
    secret: string;
    is_active: boolean;
    consecutive_failures: number;
  }>(
    `SELECT id, url, secret, is_active, consecutive_failures FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2`,
    [webhookEndpointId, tenantId],
  );

  if (!endpoint || !endpoint.is_active) {
    console.warn(`[notifications] Webhook endpoint ${webhookEndpointId} not found or inactive`);
    return;
  }

  const bodyStr = JSON.stringify(webhookPayload);
  const signature = `sha256=${createHmac('sha256', endpoint.secret).update(bodyStr).digest('hex')}`;

  let success = false;
  let responseCode: number | null = null;
  let responseBody: string | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => { controller.abort(); }, WEBHOOK_TIMEOUT_MS);

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [WEBHOOK_SIGNATURE_HEADER]: signature,
        'x-flowdesk-event': eventType,
        'x-flowdesk-delivery': uuidv4(),
      },
      body: bodyStr,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    responseCode = response.status;
    responseBody = await response.text().catch(() => '');
    success = response.ok;
  } catch (err) {
    console.error(`[notifications] Webhook delivery failed (attempt ${attemptNumber}):`, err);
    success = false;
  }

  await withTransaction(async (client) => {
    if (success) {
      await client.query(
        `UPDATE webhook_endpoints SET consecutive_failures = 0, last_triggered_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [webhookEndpointId],
      );
      await client.query(
        `INSERT INTO webhook_deliveries (id, webhook_endpoint_id, event_type, payload, status, response_code, response_body, attempt_number, next_retry_at, created_at)
         VALUES ($1, $2, $3, $4, 'success', $5, $6, $7, NULL, NOW())
         ON CONFLICT DO NOTHING`,
        [uuidv4(), webhookEndpointId, eventType, JSON.stringify(webhookPayload), responseCode, responseBody, attemptNumber],
      );
    } else {
      const newFailures = endpoint.consecutive_failures + 1;
      const shouldDeactivate = newFailures >= WEBHOOK_MAX_CONSECUTIVE_FAILURES;

      await client.query(
        `UPDATE webhook_endpoints SET consecutive_failures = $1, is_active = $2, updated_at = NOW() WHERE id = $3`,
        [newFailures, !shouldDeactivate, webhookEndpointId],
      );

      await client.query(
        `INSERT INTO webhook_deliveries (id, webhook_endpoint_id, event_type, payload, status, response_code, response_body, attempt_number, next_retry_at, created_at)
         VALUES ($1, $2, $3, $4, 'failed', $5, $6, $7, $8, NOW())
         ON CONFLICT DO NOTHING`,
        [
          uuidv4(),
          webhookEndpointId,
          eventType,
          JSON.stringify(webhookPayload),
          responseCode,
          responseBody,
          attemptNumber,
          attemptNumber < WEBHOOK_MAX_RETRIES ? new Date(Date.now() + (WEBHOOK_RETRY_DELAYS_MS[attemptNumber] ?? 16000)) : null,
        ],
      );
    }
  });

  // Reschedule if not success and under max retries
  if (!success && attemptNumber < WEBHOOK_MAX_RETRIES) {
    const delayMs = WEBHOOK_RETRY_DELAYS_MS[attemptNumber] ?? 16000;
    await sleep(delayMs);

    const retryEvent: WebhookDeliverEvent = {
      topic: KAFKA_TOPICS.WEBHOOK_DELIVER,
      tenantId,
      webhookEndpointId,
      eventType,
      payload: webhookPayload,
      attemptNumber: attemptNumber + 1,
      requestId,
      timestamp: new Date().toISOString(),
    };
    await publishEvent(KAFKA_TOPICS.WEBHOOK_DELIVER, retryEvent);
  }
}

// ─── Start consumers ──────────────────────────────────────────────────────────

export async function startConsumers(): Promise<void> {
  await createConsumer(
    {
      groupId: 'flowdesk-notifications',
      topics: [
        KAFKA_TOPICS.TICKET_CREATED,
        KAFKA_TOPICS.TICKET_ASSIGNED,
        KAFKA_TOPICS.TICKET_RESOLVED,
        KAFKA_TOPICS.MESSAGE_SENT,
        KAFKA_TOPICS.NOTIFICATION_SEND,
        KAFKA_TOPICS.WEBHOOK_DELIVER,
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
        topic: KAFKA_TOPICS.TICKET_ASSIGNED,
        handler: async (payload) => {
          await handleTicketAssigned(payload as TicketAssignedEvent);
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
        topic: KAFKA_TOPICS.NOTIFICATION_SEND,
        handler: async (payload) => {
          await handleNotificationSend(payload as NotificationSendEvent);
        },
      },
      {
        topic: KAFKA_TOPICS.WEBHOOK_DELIVER,
        handler: async (payload) => {
          await handleWebhookDeliver(payload as WebhookDeliverEvent);
        },
      },
    ],
  );

  console.info('[notifications] Consumers started');
}
