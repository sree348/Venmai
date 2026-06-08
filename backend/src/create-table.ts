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

  console.log('Creating report breakdown tables...');
  await query(`
    CREATE TABLE IF NOT EXISTS campaign_demographic_breakdowns (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      tenant_id TEXT NOT NULL,
      client_id TEXT,
      date TIMESTAMPTZ NOT NULL,
      platform TEXT NOT NULL DEFAULT 'meta',
      campaign_id TEXT NOT NULL,
      campaign_name TEXT NOT NULL,
      age TEXT NOT NULL,
      gender TEXT NOT NULL,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      reach INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      spend DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT campaign_demographic_breakdowns_unique UNIQUE (tenant_id, date, campaign_id, age, gender)
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS campaign_demographic_breakdowns_tenant_date_idx 
    ON campaign_demographic_breakdowns(tenant_id, date);
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS campaign_location_breakdowns (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      tenant_id TEXT NOT NULL,
      client_id TEXT,
      date TIMESTAMPTZ NOT NULL,
      platform TEXT NOT NULL DEFAULT 'meta',
      campaign_id TEXT NOT NULL,
      campaign_name TEXT NOT NULL,
      region TEXT NOT NULL,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      reach INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      spend DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT campaign_location_breakdowns_unique UNIQUE (tenant_id, date, campaign_id, region)
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS campaign_location_breakdowns_tenant_date_idx 
    ON campaign_location_breakdowns(tenant_id, date);
  `);
  console.log('report breakdown tables created successfully!');
}

main().catch(console.error);
