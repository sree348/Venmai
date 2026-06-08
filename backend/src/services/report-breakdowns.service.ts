import { query } from './db.service.js';

let ensurePromise: Promise<void> | null = null;

export function ensureReportBreakdownTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
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
    })().catch(error => {
      ensurePromise = null;
      throw error;
    });
  }

  return ensurePromise;
}
