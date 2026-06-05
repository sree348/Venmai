const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:123@localhost:5432/MIP',
});

async function main() {
  const res = await pool.query("SELECT campaign_name, platform, SUM(spend)::FLOAT as spend, SUM(impressions)::INTEGER as impressions, SUM(clicks)::INTEGER as clicks, SUM(conversions)::INTEGER as conversions, SUM(reach)::INTEGER as reach FROM campaign_data WHERE client_id = 'cai_mahindra' GROUP BY campaign_name, platform ORDER BY spend DESC");
  console.log("=== CAI MAHINDRA CAMPAIGNS ===");
  console.log(JSON.stringify(res.rows, null, 2));
}

main().catch(console.error).finally(() => pool.end());
