const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:123@localhost:5432/MIP',
});

async function main() {
  const res = await pool.query("SELECT * FROM meta_connections");
  console.log("=== META CONNECTIONS ===");
  console.log(res.rows);
}

main().catch(console.error).finally(() => pool.end());
