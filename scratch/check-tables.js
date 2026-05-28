import pg from 'pg';
const pool = new pg.Pool({ connectionString: "postgresql://postgres:123@localhost:5432/MIP" });
try {
  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log('Tables:', res.rows.map(r => r.table_name));
  
  const viewRes = await pool.query("SELECT viewname FROM pg_catalog.pg_views WHERE schemaname='public'");
  console.log('Views:', viewRes.rows.map(r => r.viewname));
} catch (e) {
  console.error(e);
} finally {
  await pool.end();
}
