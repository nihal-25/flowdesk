/**
 * Creates all required Kafka topics on a Confluent Cloud cluster.
 * Usage: node scripts/create-kafka-topics.mjs
 * Reads KAFKA_BROKERS, KAFKA_SASL_USERNAME, KAFKA_SASL_PASSWORD from environment.
 */

import { Kafka, logLevel } from 'kafkajs';

const brokers = process.env.KAFKA_BROKERS?.split(',').map((b) => b.trim());
const username = process.env.KAFKA_SASL_USERNAME;
const password = process.env.KAFKA_SASL_PASSWORD;

if (!brokers?.length || !username || !password) {
  console.error('Missing required env vars: KAFKA_BROKERS, KAFKA_SASL_USERNAME, KAFKA_SASL_PASSWORD');
  process.exit(1);
}

const kafka = new Kafka({
  clientId: 'flowdesk-topic-admin',
  brokers,
  ssl: true,
  sasl: { mechanism: 'plain', username, password },
  logLevel: logLevel.ERROR,
  connectionTimeout: 30000,
  requestTimeout: 30000,
  retry: {
    initialRetryTime: 1000,
    retries: 5,
    maxRetryTime: 15000,
  },
});

const admin = kafka.admin();

const TOPICS = [
  'ticket.created',
  'ticket.updated',
  'ticket.assigned',
  'ticket.resolved',
  'message.sent',
  'notification.send',
  'webhook.deliver',
  'audit.log',
];

async function main() {
  await admin.connect();
  console.log('[kafka-admin] Connected to Confluent Cloud');

  // createTopics returns true if topics were created, false if they already existed.
  // It does NOT call listTopics internally — safe for fresh clusters.
  const created = await admin.createTopics({
    validateOnly: false,
    waitForLeaders: false,
    topics: TOPICS.map((topic) => ({
      topic,
      numPartitions: 3,
      replicationFactor: 3,
    })),
  });

  if (created) {
    console.log(`[kafka-admin] Created all ${TOPICS.length} topics: ${TOPICS.join(', ')}`);
  } else {
    console.log('[kafka-admin] Topics already existed — no changes needed');
  }

  await admin.disconnect();
  console.log('[kafka-admin] Done');
}

main().catch((err) => {
  console.error('[kafka-admin] Failed:', err.message);
  process.exit(1);
});
