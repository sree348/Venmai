const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:123@localhost:5432/MIP',
});

async function main() {
  const googleMarch = await pool.query("SELECT count(*), sum(spend) FROM campaign_data WHERE client_id = 'cai_mahindra' AND platform ILIKE '%google%' AND date >= '2026-03-01' AND date <= '2026-03-31'");
  console.log("=== GOOGLE MARCH 2026 ===");
  console.log(googleMarch.rows);

  const googleMay = await pool.query("SELECT count(*), sum(spend) FROM campaign_data WHERE client_id = 'cai_mahindra' AND platform ILIKE '%google%' AND date >= '2026-05-01' AND date <= '2026-05-31'");
  console.log("=== GOOGLE MAY 2026 ===");
  console.log(googleMay.rows);
}

main().catch(console.error).finally(() => pool.end());
