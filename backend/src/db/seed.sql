INSERT INTO tenants (id, name)
VALUES ('agency', 'Venpep Agency')
ON CONFLICT (id) DO NOTHING;

INSERT INTO clients (id, tenant_id, name, industry, status, monthly_budget_inr, account_manager, metadata)
VALUES
  ('nova', 'agency', 'Nova Sportswear', 'eCommerce · Apparel', 'healthy', 4550000, 'Rohan Patel', '{"platforms":["Meta","Google","TikTok"],"avatar":"NS"}'),
  ('finedge', 'agency', 'FinEdge Capital', 'FinTech · B2B', 'at_risk', 2320000, 'Anitha Singh', '{"platforms":["Google","LinkedIn"],"avatar":"FE"}'),
  ('bloombox', 'agency', 'BloomBox', 'DTC · Subscription', 'healthy', 1490000, 'Rohan Patel', '{"platforms":["Meta","TikTok"],"avatar":"BB"}'),
  ('orbit', 'agency', 'Orbit SaaS', 'Software · B2B', 'critical', 3480000, 'Dev Team Lead', '{"platforms":["Google","LinkedIn"],"avatar":"OR"}')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  monthly_budget_inr = EXCLUDED.monthly_budget_inr,
  updated_at = NOW();

INSERT INTO campaign_daily (
  tenant_id, date, client_id, client_name, campaign_id, campaign_name, platform,
  delivery_status, health_status, spend, impressions, clicks, conversions, revenue,
  frequency, currency
)
VALUES
  ('agency', CURRENT_DATE, 'nova', 'Nova Sportswear', 'nova-meta-1', 'Summer Sale - Lookalike', 'Meta', 'active', 'healthy', 1536000, 1480000, 35555, 342, 8908800, 2.8, 'INR'),
  ('agency', CURRENT_DATE, 'nova', 'Nova Sportswear', 'nova-google-1', 'Shopping - Top SKUs', 'Google', 'active', 'healthy', 1860000, 2590000, 82300, 489, 11532000, 0, 'INR'),
  ('agency', CURRENT_DATE, 'nova', 'Nova Sportswear', 'nova-tiktok-1', 'GenZ Awareness', 'TikTok', 'active', 'healthy', 785000, 1740000, 33404, 201, 3768000, 4.1, 'INR'),
  ('agency', CURRENT_DATE, 'finedge', 'FinEdge Capital', 'finedge-google-1', 'Brand Search - Branded KW', 'Google', 'active', 'at_risk', 1010000, 1950000, 94020, 156, 3131000, 0, 'INR'),
  ('agency', CURRENT_DATE, 'finedge', 'FinEdge Capital', 'finedge-linkedin-1', 'B2B Lead Gen - APAC', 'LinkedIn', 'active', 'at_risk', 518000, 217000, 1389, 89, 2123800, 3.2, 'INR'),
  ('agency', CURRENT_DATE, 'bloombox', 'BloomBox', 'bloombox-meta-1', 'Retargeting - Website Visitors', 'Meta', 'active', 'healthy', 730000, 620000, 11718, 167, 3139000, 3.1, 'INR'),
  ('agency', CURRENT_DATE, 'bloombox', 'BloomBox', 'bloombox-tiktok-1', 'Unboxing UGC - TikTok', 'TikTok', 'active', 'healthy', 410000, 1020000, 24888, 138, 2132000, 3.8, 'INR'),
  ('agency', CURRENT_DATE, 'orbit', 'Orbit SaaS', 'orbit-meta-1', 'Retargeting - APAC', 'Meta', 'active', 'critical', 731000, 478000, 4254, 0, 0, 6.8, 'INR'),
  ('agency', CURRENT_DATE, 'orbit', 'Orbit SaaS', 'orbit-google-1', 'Google Search - Trial Signup', 'Google', 'active', 'at_risk', 1186000, 1540000, 52514, 210, 4506800, 0, 'INR'),
  ('agency', CURRENT_DATE, 'orbit', 'Orbit SaaS', 'orbit-linkedin-1', 'LinkedIn Demand Gen', 'LinkedIn', 'active', 'critical', 818000, 314000, 2261, 74, 2372200, 2.9, 'INR')
ON CONFLICT (tenant_id, date, platform, campaign_id) DO UPDATE SET
  spend = EXCLUDED.spend,
  impressions = EXCLUDED.impressions,
  clicks = EXCLUDED.clicks,
  conversions = EXCLUDED.conversions,
  revenue = EXCLUDED.revenue,
  health_status = EXCLUDED.health_status,
  updated_at = NOW();

INSERT INTO campaign_data (
  tenant_id, client_id, date, platform, campaign_id, campaign_name, spend,
  impressions, clicks, reach, frequency, ctr, cpc, cpm, conversions,
  action_value, roas, status
)
SELECT
  tenant_id,
  client_id,
  date,
  platform,
  campaign_id,
  campaign_name,
  spend::DOUBLE PRECISION,
  impressions::INTEGER,
  clicks::INTEGER,
  impressions::INTEGER AS reach,
  COALESCE(frequency, 0)::DOUBLE PRECISION,
  COALESCE(ctr, 0)::DOUBLE PRECISION,
  COALESCE(cpc, 0)::DOUBLE PRECISION,
  CASE WHEN impressions = 0 THEN 0 ELSE ((spend / impressions) * 1000)::DOUBLE PRECISION END,
  conversions::INTEGER,
  revenue::DOUBLE PRECISION,
  roas::DOUBLE PRECISION,
  delivery_status
FROM campaign_daily
ON CONFLICT (tenant_id, date, campaign_id) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  platform = EXCLUDED.platform,
  campaign_name = EXCLUDED.campaign_name,
  spend = EXCLUDED.spend,
  impressions = EXCLUDED.impressions,
  clicks = EXCLUDED.clicks,
  reach = EXCLUDED.reach,
  frequency = EXCLUDED.frequency,
  ctr = EXCLUDED.ctr,
  cpc = EXCLUDED.cpc,
  cpm = EXCLUDED.cpm,
  conversions = EXCLUDED.conversions,
  action_value = EXCLUDED.action_value,
  roas = EXCLUDED.roas,
  status = EXCLUDED.status,
  updated_at = NOW();
