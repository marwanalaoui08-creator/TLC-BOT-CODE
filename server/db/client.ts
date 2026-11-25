import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { Pool } from 'pg';
import * as schema from './schema.ts';

export type TlcDb = NodePgDatabase<typeof schema>;

let pool: Pool | null = null;
let dbInstance: TlcDb | null = null;

export interface DatabaseHealth {
  configured: boolean;
  connected: boolean;
  migrated: boolean;
  lastError: string | null;
}

const dbHealth: DatabaseHealth = {
  configured: Boolean(process.env.DATABASE_URL?.trim()),
  connected: false,
  migrated: false,
  lastError: null,
};

export function sanitizeDatabaseError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown database error');
  return raw.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://***@');
}

function resolveSslConfig(connectionString: string): boolean | { rejectUnauthorized: boolean } {
  const lower = connectionString.toLowerCase();
  if (
    lower.includes('sslmode=disable') ||
    lower.includes('localhost') ||
    lower.includes('127.0.0.1')
  ) {
    return false;
  }
  return { rejectUnauthorized: false };
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabaseHealth(): DatabaseHealth {
  return {
    ...dbHealth,
    configured: isDatabaseConfigured(),
  };
}

export function getDb(): TlcDb {
  if (!dbInstance) {
    throw new Error(
      dbHealth.lastError ||
        'PostgreSQL database is not initialized. Set DATABASE_URL in environment variables.'
    );
  }
  return dbInstance;
}

export function getPool(): Pool | null {
  return pool;
}

export async function initDatabase(): Promise<{ ok: boolean; error?: string }> {
  const connectionString = process.env.DATABASE_URL?.trim();
  dbHealth.configured = Boolean(connectionString);

  if (!connectionString) {
    dbHealth.connected = false;
    dbHealth.migrated = false;
    dbHealth.lastError =
      'DATABASE_URL environment variable is not configured. Add your Supabase PostgreSQL connection string in Secrets.';
    return { ok: false, error: dbHealth.lastError };
  }

  try {
    if (!pool) {
      pool = new Pool({
        connectionString,
        ssl: resolveSslConfig(connectionString),
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      pool.on('error', (err) => {
        const msg = sanitizeDatabaseError(err);
        dbHealth.lastError = msg;
        console.error('[TLC DB] Unexpected pool error:', msg);
      });
    }

    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    dbInstance = drizzle(pool, { schema });
    dbHealth.connected = true;

    const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
    await migrate(dbInstance, { migrationsFolder });
    dbHealth.migrated = true;
    dbHealth.lastError = null;

    console.log('[TLC DB] Connected to PostgreSQL and verified Drizzle migrations.');
    return { ok: true };
  } catch (err) {
    const safeMsg = sanitizeDatabaseError(err);
    dbHealth.connected = false;
    dbHealth.migrated = false;
    dbHealth.lastError = safeMsg;
    console.error('[TLC DB] Initialization failed:', safeMsg);
    return { ok: false, error: safeMsg };
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
  dbInstance = null;
  dbHealth.connected = false;
}
