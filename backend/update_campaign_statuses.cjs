const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:123@localhost:5432/MIP',
});

async function main() {
  console.log("Updating database records...");
  const res = await pool.query(
    "UPDATE campaign_data SET status = 'active' WHERE client_id = 'cai_mahindra'"
  );
  console.log(`Successfully updated ${res.rowCount} campaign records to active.`);
}

main().catch(console.error).finally(() => pool.end());
