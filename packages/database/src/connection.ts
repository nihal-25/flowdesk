import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

let pool: Pool | null = null;

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

export function createPool(config: DatabaseConfig): Pool {
  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl,
    max: config.maxConnections ?? 20,
    idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: config.connectionTimeoutMs ?? 5_000,
  };

  const newPool = new Pool(poolConfig);

  newPool.on('error', (err) => {
    console.error('[database] Unexpected pool error:', err.message);
  });

  newPool.on('connect', () => {
    console.debug('[database] New client connected to pool');
  });

  return newPool;
}

export function initPool(config: DatabaseConfig): void {
  if (pool) {
    throw new Error('Database pool already initialized. Call getPool() to reuse it.');
  }
  pool = createPool(config);
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initPool() first.');
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Execute a parameterized query and return all rows.
 * Uses the global pool — call initPool() first.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await getPool().query<T>(text, values);
    const durationMs = Date.now() - start;
    if (durationMs > 1000) {
      console.warn(`[database] Slow query (${durationMs}ms):`, text.slice(0, 120));
    }
    return result;
  } catch (err) {
    const error = err as Error;
    console.error('[database] Query error:', error.message, '\nQuery:', text.slice(0, 200));
    throw err;
  }
}

/**
 * Execute a parameterized query and return the first row, or null if not found.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<T | null> {
  const result = await query<T>(text, values);
  return result.rows[0] ?? null;
}

/**
 * Execute multiple queries inside a single transaction.
 * Automatically rolls back on error.
 */
export async function withTransaction<T>(
  callback: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test the database connection.
 */
export async function testConnection(): Promise<void> {
  const result = await query<{ now: string }>('SELECT NOW() as now');
  const row = result.rows[0];
  if (!row) throw new Error('Database connection test returned no result');
  console.info(`[database] Connection verified. Server time: ${row.now}`);
}
