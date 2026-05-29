const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres:123@localhost:5432/MIP",
});

async function main() {
  console.log("=== CHECKING PLATFORM CONNECTIONS ===");
  const connectionsResult = await pool.query('SELECT * FROM platform_connections');
  console.log(`Found ${connectionsResult.rows.length} connection records:`);
  console.log(JSON.stringify(connectionsResult.rows, null, 2));

  console.log("\n=== CHECKING GOOGLE CAMPAIGN DATA ===");
  const campaignsResult = await pool.query("SELECT * FROM campaign_data WHERE platform ILIKE '%google%'");
  console.log(`Found ${campaignsResult.rows.length} Google Campaign records:`);
  campaignsResult.rows.forEach(c => {
    console.log(`- Name: ${c.campaign_name} | ID: ${c.campaign_id} | Client: ${c.client_id} | Tenant: ${c.tenant_id} | Status: ${c.status} | Date: ${c.date}`);
  });
}

main()
  .catch(e => {
    console.error("Error executing database queries:", e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
