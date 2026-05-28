import 'dotenv/config';
import { queryWithGroq } from './services/groq.service.js';
import { executeReadOnlySql } from './services/db.service.js';
import { prepareAiSql } from './services/sql-safety.service.js';

async function main() {
  console.log('--- MULTI-QUERY CHAT DIAGNOSTIC ---');
  const prompts = [
    'What is our total spend?',
    'Which campaigns have the highest ROAS?',
    'hi'
  ];
  const tenantId = 'agency';

  for (const prompt of prompts) {
    console.log('\n----------------------------------------');
    console.log(`Testing Prompt: "${prompt}"`);
    try {
      const spec = await queryWithGroq(prompt, tenantId, []);
      const sql = prepareAiSql(spec.sql, tenantId);
      console.log('Generated SQL Query:\n', sql);
      console.log('AI Insight:\n', spec.insight);

      console.log('Executing SQL...');
      const rows = await executeReadOnlySql(sql);
      console.log(`Success! Received ${rows.length} rows.`);
      console.log('Sample Data:', rows.slice(0, 1));
    } catch (error: any) {
      console.error('Failed for prompt:', prompt);
      console.error(error.message || error);
    }
  }
  console.log('\n--- DIAGNOSTIC COMPLETE ---');
}

main();
