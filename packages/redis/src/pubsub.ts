import type Redis from 'ioredis';
import { getRedis } from './client.js';
import { REDIS_KEYS } from '@flowdesk/shared';

export type PubSubChannel =
  | ReturnType<typeof REDIS_KEYS.PUBSUB_MESSAGES>
  | ReturnType<typeof REDIS_KEYS.PUBSUB_TICKETS>
  | ReturnType<typeof REDIS_KEYS.PUBSUB_PRESENCE>
  | ReturnType<typeof REDIS_KEYS.PUBSUB_ANALYTICS>;

export interface PubSubMessage<T = unknown> {
  event: string;
  data: T;
  tenantId: string;
  timestamp: string;
}

/**
 * Publishes an event to a Redis pub/sub channel.
 * Used to propagate WebSocket events across multiple server instances.
 */
export async function publish<T>(
  channel: string,
  event: string,
  data: T,
  tenantId: string,
): Promise<void> {
  const message: PubSubMessage<T> = {
    event,
    data,
    tenantId,
    timestamp: new Date().toISOString(),
  };
  await getRedis().publish(channel, JSON.stringify(message));
}

/**
 * Subscribes to a Redis channel and invokes the callback on each message.
 * The subscriber client must be a separate Redis connection (not the main client).
 */
export function subscribe<T>(
  subscriberClient: Redis,
  channel: string,
  callback: (message: PubSubMessage<T>) => void,
): void {
  subscriberClient.subscribe(channel, (err) => {
    if (err) {
      console.error(`[pubsub] Failed to subscribe to channel "${channel}":`, err.message);
    }
  });

  subscriberClient.on('message', (receivedChannel: string, rawMessage: string) => {
    if (receivedChannel !== channel) return;
    try {
      const parsed = JSON.parse(rawMessage) as PubSubMessage<T>;
      callback(parsed);
    } catch (err) {
      console.error('[pubsub] Failed to parse message:', err);
    }
  });
}

/**
 * Subscribes to a pattern of Redis channels.
 */
export function psubscribe<T>(
  subscriberClient: Redis,
  pattern: string,
  callback: (channel: string, message: PubSubMessage<T>) => void,
): void {
  subscriberClient.psubscribe(pattern, (err) => {
    if (err) {
      console.error(`[pubsub] Failed to psubscribe to pattern "${pattern}":`, err.message);
    }
  });

  subscriberClient.on(
    'pmessage',
    (_pattern: string, channel: string, rawMessage: string) => {
      try {
        const parsed = JSON.parse(rawMessage) as PubSubMessage<T>;
        callback(channel, parsed);
      } catch (err) {
        console.error('[pubsub] Failed to parse pmessage:', err);
      }
    },
  );
}
