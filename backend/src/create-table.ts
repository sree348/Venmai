import 'dotenv/config';
import { query } from './services/db.service.js';

async function main() {
  console.log('Creating agency_reports table...');
  await query(`
    CREATE TABLE IF NOT EXISTS agency_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      share_token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('agency_reports table created successfully!');
}

main().catch(console.error);
