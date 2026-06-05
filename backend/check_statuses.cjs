const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:123@localhost:5432/MIP',
});

async function main() {
  const query = `
    SELECT
      status,
      COUNT(DISTINCT campaign_id) AS "unique_campaigns",
      COUNT(*) AS "total_rows"
    FROM campaign_data
    WHERE client_id = 'cai_mahindra'
    GROUP BY status
  `;
  const res = await pool.query(query);
  console.log("=== CAMPAIGN STATUS COUNTS ===");
  console.log(res.rows);
}

main().catch(console.error).finally(() => pool.end());
