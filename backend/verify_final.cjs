const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:123@localhost:5432/MIP' });

pool.query(`
  SELECT
    MIN(campaign_id) AS id,
    COALESCE(client_id, 'meta') AS client_id,
    campaign_name AS name,
    platform AS channel,
    MIN(date)::text AS start_date,
    SUM(spend)::float AS spend,
    MAX(status) AS status,
    BOOL_OR(status = 'active') AS active
  FROM campaign_data
  WHERE tenant_id = 'agency' AND client_id = 'cai_mahindra'
  GROUP BY client_id, campaign_name, platform
  ORDER BY spend DESC
`).then(r => {
  console.log('=== FINAL CAMPAIGN LIST (grouped by name) ===');
  console.log('Total count:', r.rows.length);
  r.rows.forEach((row, i) => {
    console.log(i+1, '|', row.name, '| active:', row.active, '| status:', row.status, '| launch:', row.start_date);
  });
  pool.end();
}).catch(err => {
  console.error(err);
  pool.end();
});
