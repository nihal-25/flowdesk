import type { Consumer, EachMessagePayload } from 'kafkajs';
import { getKafka } from './client.js';
import type { KafkaTopic } from '@flowdesk/shared';
import { sleep, exponentialBackoff } from '@flowdesk/shared';

export interface ConsumerConfig {
  groupId: string;
  topics: KafkaTopic[];
  fromBeginning?: boolean;
  sessionTimeoutMs?: number;
  heartbeatIntervalMs?: number;
}

export type MessageHandler<T = unknown> = (
  payload: T,
  raw: EachMessagePayload,
) => Promise<void>;

export interface ConsumerHandler {
  topic: KafkaTopic;
  handler: MessageHandler;
}

/**
 * Creates and starts a typed Kafka consumer with automatic error handling
 * and exponential backoff retry on processing failures.
 */
export async function createConsumer(
  config: ConsumerConfig,
  handlers: ConsumerHandler[],
): Promise<Consumer> {
  const consumer = getKafka().consumer({
    groupId: config.groupId,
    sessionTimeout: config.sessionTimeoutMs ?? 30_000,
    heartbeatInterval: config.heartbeatIntervalMs ?? 3_000,
    retry: {
      initialRetryTime: 300,
      retries: 10,
    },
  });

  await consumer.connect();
  console.info(`[kafka] Consumer "${config.groupId}" connected`);

  for (const topic of config.topics) {
    await consumer.subscribe({ topic, fromBeginning: config.fromBeginning ?? false });
    console.info(`[kafka] Consumer subscribed to topic: ${topic}`);
  }

  const handlerMap = new Map<string, MessageHandler>(
    handlers.map(({ topic, handler }) => [topic, handler]),
  );

  await consumer.run({
    eachMessage: async (payload: EachMessagePayload) => {
      const { topic, message } = payload;
      const handler = handlerMap.get(topic);

      if (!handler) {
        console.warn(`[kafka] No handler registered for topic: ${topic}`);
        return;
      }

      const rawValue = message.value?.toString();
      if (!rawValue) {
        console.warn(`[kafka] Received empty message on topic: ${topic}`);
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawValue);
      } catch {
        console.error(`[kafka] Failed to parse message on topic ${topic}:`, rawValue.slice(0, 200));
        return; // Don't retry parse failures — they're not transient
      }

      // Retry with exponential backoff on handler failures
      const MAX_ATTEMPTS = 5;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          await handler(parsed, payload);
          return; // Success
        } catch (err) {
          const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
          const errorMessage = err instanceof Error ? err.message : String(err);

          if (isLastAttempt) {
            console.error(
              `[kafka] Handler failed after ${MAX_ATTEMPTS} attempts on topic ${topic}:`,
              errorMessage,
            );
            // Dead-letter: log and move on (don't block the consumer)
            // In production, you'd publish to a DLQ topic here
            return;
          }

          const delayMs = exponentialBackoff(attempt, 500, 10_000);
          console.warn(
            `[kafka] Handler error on topic ${topic} (attempt ${attempt + 1}/${MAX_ATTEMPTS}). Retrying in ${delayMs}ms:`,
            errorMessage,
          );
          await sleep(delayMs);
        }
      }
    },
  });

  consumer.on('consumer.crash', async ({ payload: { error, restart } }) => {
    console.error('[kafka] Consumer crashed:', error.message);
    if (restart) {
      console.info('[kafka] Consumer restarting...');
    }
  });

  consumer.on('consumer.disconnect', () => {
    console.warn(`[kafka] Consumer "${config.groupId}" disconnected`);
  });

  return consumer;
}

/**
 * Gracefully shuts down a consumer.
 */
export async function disconnectConsumer(consumer: Consumer): Promise<void> {
  await consumer.disconnect();
}
