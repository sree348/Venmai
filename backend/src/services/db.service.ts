import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

const pool =
  databaseUrl && databaseUrl !== 'placeholder'
    ? new Pool({ connectionString: databaseUrl })
    : null;

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Set a real connection string before running database queries.');
  }

  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function executeSql(sql: string) {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Set a real connection string before running AI SQL.');
  }

  const result = await pool.query(sql);
  return result.rows;
}

export async function executeReadOnlySql(sql: string) {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Set a real connection string before running AI SQL.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL statement_timeout = 5000');
    await client.query('SET LOCAL idle_in_transaction_session_timeout = 5000');
    const result = await client.query(sql);
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
