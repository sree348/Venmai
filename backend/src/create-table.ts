import 'dotenv/config';
import { query } from './services/db.service.js';

async function main() {
  console.log('Creating agency_reports table...');
  await query(`
    CREATE TABLE IF NOT EXISTS agency_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      share_token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('agency_reports table created successfully!');

  console.log('Creating platform_connections table...');
  await query(`
    CREATE TABLE IF NOT EXISTS platform_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      customer_id TEXT,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS platform_connections_tenant_id_platform_key 
    ON platform_connections(tenant_id, platform);
  `);
  console.log('platform_connections table created successfully!');
}

main().catch(console.error);
