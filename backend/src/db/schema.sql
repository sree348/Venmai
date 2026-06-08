CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'healthy',
  monthly_budget_inr NUMERIC(18, 2) NOT NULL DEFAULT 0,
  account_manager TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  account_name TEXT,
  account_id TEXT,
  encrypted_credentials TEXT NOT NULL,
  credential_iv TEXT NOT NULL,
  credential_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_daily (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'active',
  health_status TEXT NOT NULL DEFAULT 'healthy',
  spend NUMERIC(18, 2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  revenue NUMERIC(18, 2) NOT NULL DEFAULT 0,
  cpc NUMERIC(18, 2) GENERATED ALWAYS AS (CASE WHEN clicks = 0 THEN NULL ELSE spend / clicks END) STORED,
  ctr NUMERIC(10, 4) GENERATED ALWAYS AS (CASE WHEN impressions = 0 THEN NULL ELSE clicks::NUMERIC / impressions END) STORED,
  frequency NUMERIC(10, 2),
  roas NUMERIC(10, 4) GENERATED ALWAYS AS (CASE WHEN conversions = 0 OR spend = 0 THEN NULL ELSE revenue / spend END) STORED,
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, date, platform, campaign_id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_connection_id UUID REFERENCES platform_connections(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE OR REPLACE VIEW GOLD_CAMPAIGN_DAILY AS
SELECT
  tenant_id,
  date,
  client_id,
  client_name,
  campaign_id,
  campaign_name,
  platform,
  delivery_status AS status,
  spend,
  impressions,
  clicks,
  conversions,
  revenue,
  cpc,
  ctr,
  frequency,
  roas,
  currency
FROM campaign_daily;

CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_daily_tenant_date ON campaign_daily(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_daily_client ON campaign_daily(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_platform_connections_tenant ON platform_connections(tenant_id);

CREATE TABLE IF NOT EXISTS conversation_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_history_tenant ON conversation_history(tenant_id);

CREATE TABLE IF NOT EXISTS meta_connections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  meta_user_id TEXT NOT NULL,
  ad_account_id TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_data (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  client_id TEXT,
  date TIMESTAMPTZ NOT NULL,
  platform TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  spend DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  frequency DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  cpc DOUBLE PRECISION NOT NULL DEFAULT 0,
  cpm DOUBLE PRECISION NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  action_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  roas DOUBLE PRECISION,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT campaign_data_tenant_date_campaign_id_key UNIQUE (tenant_id, date, campaign_id)
);

CREATE INDEX IF NOT EXISTS campaign_data_tenant_date_idx ON campaign_data(tenant_id, date);

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

CREATE INDEX IF NOT EXISTS campaign_demographic_breakdowns_tenant_date_idx ON campaign_demographic_breakdowns(tenant_id, date);

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

CREATE INDEX IF NOT EXISTS campaign_location_breakdowns_tenant_date_idx ON campaign_location_breakdowns(tenant_id, date);

CREATE TABLE IF NOT EXISTS campaign_scores (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  trend TEXT NOT NULL DEFAULT 'stable',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT campaign_scores_tenant_campaign_key UNIQUE (tenant_id, campaign_name)
);

CREATE TABLE IF NOT EXISTS brain_insights (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  metric TEXT NOT NULL,
  current_value DOUBLE PRECISION NOT NULL,
  threshold DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  suggested_action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
