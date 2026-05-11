import { Pool, type PoolClient } from 'pg';
import { TEST_PG_URL } from '../config';

// One Pool per test process — keeps connection setup cheap across many
// withTransaction() calls. Closed by setup.ts in afterAll().
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: TEST_PG_URL, max: 4 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Run `fn` inside a Postgres transaction that is ALWAYS rolled back.
 *
 * Why: tests need to write rows, trigger triggers, and observe constraint
 * behaviour without persisting anything. Rollback gives full isolation
 * without truncate/reseed gymnastics. Note: DDL also rolls back, but
 * row-level locks and trigger SECURITY DEFINER functions run as if real.
 *
 * Caveat: nothing committed inside `fn` is visible to other connections
 * (including a parallel supabase-js HTTP client) — keep all reads inside
 * the same client. For tests that must hit the REST/Auth gateway with
 * data visible to it, use truncate-based fixtures instead (TBD).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('ROLLBACK');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // If the connection is poisoned the next release() will discard it;
      // surfacing the rollback error here would mask the real cause.
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Quick liveness probe — used by setup.ts to fail fast with a helpful message. */
export async function pingDatabase(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
