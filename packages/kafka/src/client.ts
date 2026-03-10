import { Kafka, logLevel } from 'kafkajs';
import type { KafkaConfig, SASLOptions } from 'kafkajs';

export interface KafkaClientConfig {
  brokers: string[];
  clientId: string;
  sasl?: {
    mechanism: 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  ssl?: boolean;
}

let kafkaInstance: Kafka | null = null;

function buildSaslOptions(
  sasl: NonNullable<KafkaClientConfig['sasl']>,
): SASLOptions {
  // KafkaJS uses a discriminated union for SASL options
  if (sasl.mechanism === 'scram-sha-256') {
    return { mechanism: 'scram-sha-256', username: sasl.username, password: sasl.password };
  }
  return { mechanism: 'scram-sha-512', username: sasl.username, password: sasl.password };
}

export function createKafkaClient(config: KafkaClientConfig): Kafka {
  const baseConfig = {
    clientId: config.clientId,
    brokers: config.brokers,
    ssl: config.ssl ?? true,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 10,
      maxRetryTime: 30_000,
      factor: 2,
      multiplier: 1.5,
    },
  };

  const kafkaConfig: KafkaConfig = config.sasl
    ? { ...baseConfig, sasl: buildSaslOptions(config.sasl) }
    : baseConfig;

  return new Kafka(kafkaConfig);
}

export function initKafka(config: KafkaClientConfig): void {
  if (kafkaInstance) {
    throw new Error('Kafka already initialized. Call getKafka() to reuse it.');
  }
  kafkaInstance = createKafkaClient(config);
}

export function getKafka(): Kafka {
  if (!kafkaInstance) {
    throw new Error('Kafka not initialized. Call initKafka() first.');
  }
  return kafkaInstance;
}
