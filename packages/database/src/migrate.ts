import fs from 'fs';
import path from 'path';
import { getPool, query } from './connection.js';

const MIGRATIONS_TABLE = 'schema_migrations';

interface MigrationRow {
  filename: string;
  applied_at: Date;
}

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      filename   VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await query<MigrationRow>(
    `SELECT filename FROM ${MIGRATIONS_TABLE} ORDER BY filename`,
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function applyMigration(filename: string, sql: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES ($1)`, [filename]);
    await client.query('COMMIT');
    console.info(`[migrate] ✓ Applied: ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[migrate] ✗ Failed: ${filename}`, (err as Error).message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Runs all pending SQL migration files in lexicographic order.
 * Migration files must be in ./migrations/ and end in .sql.
 */
export async function runMigrations(migrationsDir?: string): Promise<void> {
  const dir = migrationsDir ?? path.join(__dirname, 'migrations');

  console.info('[migrate] Starting migration runner...');
  console.info(`[migrate] Migrations directory: ${dir}`);

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Lexicographic order — files named 001_, 002_, etc.

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.info('[migrate] No pending migrations. Database is up to date.');
    return;
  }

  console.info(`[migrate] Found ${pending.length} pending migration(s).`);

  for (const filename of pending) {
    const filepath = path.join(dir, filename);
    const sql = fs.readFileSync(filepath, 'utf8');
    await applyMigration(filename, sql);
  }

  console.info(`[migrate] Done. Applied ${pending.length} migration(s).`);
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────
// Run with: node dist/migrate.js

if (require.main === module) {
  const { initPool, closePool } = require('./connection');

  const dbConfig = {
    host: process.env['DB_HOST'] ?? 'localhost',
    port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
    database: process.env['DB_NAME'] ?? 'flowdesk',
    user: process.env['DB_USER'] ?? 'flowdesk',
    password: process.env['DB_PASSWORD'] ?? '',
    ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  };

  initPool(dbConfig);

  runMigrations()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] Fatal error:', err);
      closePool().finally(() => process.exit(1));
    });
}
