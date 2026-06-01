const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:123@localhost:5432/MIP',
});

async function main() {
  const res = await pool.query("SELECT DISTINCT platform, status, count(*) FROM campaign_data WHERE client_id = 'cai_mahindra' GROUP BY platform, status");
  console.log("=== DISTINCT CAMPAIGNS FOR CAI MAHINDRA ===");
  console.log(res.rows);

  const res2 = await pool.query("SELECT DISTINCT platform, status, count(*) FROM campaign_data GROUP BY platform, status");
  console.log("=== ALL CAMPAIGNS IN DB ===");
  console.log(res2.rows);

  const sample = await pool.query("SELECT * FROM campaign_data WHERE client_id = 'cai_mahindra' AND platform = 'meta' LIMIT 3");
  console.log("=== SAMPLE META CAMPAIGNS ===");
  console.log(sample.rows);
}

main().catch(console.error).finally(() => pool.end());
