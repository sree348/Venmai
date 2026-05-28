import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../services/db.service.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

async function runSqlFile(filename: string) {
  const sql = await readFile(join(currentDir, filename), 'utf8');
  await query(sql);
}

await runSqlFile('schema.sql');
await runSqlFile('seed.sql');

console.log('Database schema and seed data applied.');
