import { v4 as uuidv4 } from 'uuid';
import { query } from '@flowdesk/database';
import { publishEvent } from '@flowdesk/kafka';
import { KAFKA_TOPICS } from '@flowdesk/shared';
import type { WebhookEvent, WebhookDeliverEvent } from '@flowdesk/shared';

/**
 * Fans a business event out to every active webhook endpoint in the tenant that
 * is subscribed to that event type. For each matching endpoint we enqueue a
 * WEBHOOK_DELIVER event on Kafka; the notifications service consumes it, signs
 * the payload with the endpoint's secret (HMAC-SHA256), delivers it over HTTP,
 * and handles retries/backoff.
 *
 * Fire-and-forget by design — webhook fan-out must never block or fail the
 * originating API request. Errors are logged, not thrown.
 */
export async function dispatchWebhooks(
  tenantId: string,
  eventType: WebhookEvent,
  data: Record<string, unknown>,
  requestId: string,
): Promise<void> {
  try {
    const endpoints = await query<{ id: string }>(
      `SELECT id FROM webhook_endpoints
       WHERE tenant_id = $1 AND is_active = true AND $2 = ANY(events)`,
      [tenantId, eventType],
    );

    if (endpoints.rows.length === 0) return;

    const payload = {
      event: eventType,
      tenantId,
      data,
      timestamp: new Date().toISOString(),
    };

    await Promise.all(
      endpoints.rows.map((endpoint) => {
        const event: WebhookDeliverEvent = {
          topic: KAFKA_TOPICS.WEBHOOK_DELIVER,
          tenantId,
          webhookEndpointId: endpoint.id,
          eventType,
          payload,
          attemptNumber: 1,
          requestId,
          timestamp: new Date().toISOString(),
        };
        return publishEvent(KAFKA_TOPICS.WEBHOOK_DELIVER, event, uuidv4());
      }),
    );
  } catch (err) {
    console.error(`[tickets] Failed to dispatch webhooks for ${eventType}:`, err);
  }
}
