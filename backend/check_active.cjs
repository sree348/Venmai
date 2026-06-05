const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:123@localhost:5432/MIP',
});

async function main() {
  const query = `
    SELECT
      campaign_id AS "campaignId",
      campaign_name AS "campaignName",
      platform,
      status,
      SUM(spend)::float AS spend,
      SUM(impressions)::int AS impressions,
      SUM(clicks)::int AS clicks
    FROM campaign_data
    WHERE tenant_id = 'agency'
      AND client_id = 'cai_mahindra'
      AND date >= '2025-12-07'
      AND date <= '2026-06-04'
      AND LOWER(status) = 'active'
    GROUP BY campaign_id, campaign_name, platform, status
    ORDER BY spend DESC
  `;
  const res = await pool.query(query);
  console.log("=== ACTIVE CAMPAIGNS RETURNED FOR DASHBOARD ===");
  console.log(res.rows);
  console.log("Count:", res.rows.length);
}

main().catch(console.error).finally(() => pool.end());
