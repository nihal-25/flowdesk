import Redis, { type RedisOptions } from 'ioredis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  keyPrefix?: string;
}

let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;
let redisConfig: RedisConfig | null = null;

function buildRedisOptions(config: RedisConfig): RedisOptions {
  return {
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db ?? 0,
    tls: config.tls ? {} : undefined,
    maxRetriesPerRequest: config.maxRetriesPerRequest ?? 3,
    connectTimeout: config.connectTimeout ?? 10_000,
    keyPrefix: config.keyPrefix,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 10) {
        console.error('[redis] Max reconnection attempts reached. Giving up.');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 3000);
      console.warn(`[redis] Connection attempt ${times}. Retrying in ${delay}ms...`);
      return delay;
    },
    reconnectOnError: (err) => {
      // Reconnect on READONLY errors (Redis failover)
      return err.message.includes('READONLY');
    },
  };
}

export function createRedisClient(config: RedisConfig): Redis {
  const client = new Redis(buildRedisOptions(config));

  client.on('connect', () => console.info('[redis] Connected'));
  client.on('ready', () => console.info('[redis] Ready'));
  client.on('error', (err) => console.error('[redis] Error:', err.message));
  client.on('close', () => console.warn('[redis] Connection closed'));
  client.on('reconnecting', () => console.info('[redis] Reconnecting...'));

  return client;
}

export function initRedis(config: RedisConfig): void {
  if (redisClient) {
    throw new Error('Redis client already initialized. Call getRedis() to reuse it.');
  }
  redisConfig = config;
  redisClient = createRedisClient(config);
}

export function getRedis(): Redis {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return redisClient;
}

/**
 * A separate Redis connection for pub/sub subscriptions.
 * Redis clients in subscribe mode cannot run regular commands.
 */
export function getSubscriberClient(config?: RedisConfig): Redis {
  if (!subscriberClient) {
    const cfg = config ?? redisConfig;
    if (!cfg) {
      throw new Error('Subscriber client not initialized. Pass config on first call or call initRedis() first.');
    }
    subscriberClient = createRedisClient(cfg);
    subscriberClient.on('ready', () =>
      console.info('[redis] Subscriber client ready'),
    );
  }
  return subscriberClient;
}

export async function closeRedis(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (redisClient) {
    closePromises.push(redisClient.quit().then(() => { redisClient = null; }));
  }
  if (subscriberClient) {
    closePromises.push(subscriberClient.quit().then(() => { subscriberClient = null; }));
  }

  await Promise.all(closePromises);
}

export async function testRedisConnection(): Promise<void> {
  const pong = await getRedis().ping();
  if (pong !== 'PONG') throw new Error('Redis PING returned unexpected response');
  console.info('[redis] Connection verified (PONG received)');
}
