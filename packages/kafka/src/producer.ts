import type { Producer, RecordMetadata } from 'kafkajs';
import { getKafka } from './client.js';
import type { KafkaEventPayload, KafkaTopic } from '@flowdesk/shared';

let producer: Producer | null = null;

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = getKafka().producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30_000,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    await producer.connect();
    console.info('[kafka] Producer connected');

    producer.on('producer.disconnect', () => {
      console.warn('[kafka] Producer disconnected');
    });
  }
  return producer;
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}

/**
 * Publishes a typed event to a Kafka topic.
 * Key is set to tenantId for partition affinity (all tenant events to same partition).
 */
export async function publishEvent<T extends KafkaEventPayload>(
  topic: KafkaTopic,
  event: T,
  key?: string,
): Promise<RecordMetadata[]> {
  const prod = await getProducer();

  const partitionKey = key ?? ('tenantId' in event ? String(event.tenantId) : undefined);

  return prod.send({
    topic,
    messages: [
      {
        key: partitionKey ?? null,
        value: JSON.stringify(event),
        headers: {
          'content-type': 'application/json',
          'event-type': topic,
          timestamp: new Date().toISOString(),
        },
      },
    ],
  });
}

/**
 * Publishes multiple events in a single batch for efficiency.
 */
export async function publishBatch(
  events: Array<{ topic: KafkaTopic; payload: KafkaEventPayload; key?: string }>,
): Promise<void> {
  const prod = await getProducer();

  const topicMessages = events.reduce<
    Map<KafkaTopic, Array<{ key: string | null; value: string; headers: Record<string, string> }>>
  >((acc, { topic, payload, key }) => {
    if (!acc.has(topic)) acc.set(topic, []);
    acc.get(topic)!.push({
      key: key ?? ('tenantId' in payload ? String(payload.tenantId) : null),
      value: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
        'event-type': topic,
        timestamp: new Date().toISOString(),
      },
    });
    return acc;
  }, new Map());

  await prod.sendBatch({
    topicMessages: Array.from(topicMessages.entries()).map(([topic, messages]) => ({
      topic,
      messages,
    })),
  });
}
