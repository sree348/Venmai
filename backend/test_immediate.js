import 'dotenv/config';
import { runAgentWorkflow } from './src/services/agent.service.js';

async function main() {
  console.log('=== RUNNING TEST FOR IMMEDIATE CAMPAIGN ===');
  const prompt = 'which campaign has to be addressed immediately';
  const tenantId = 'agency';
  try {
    const result = await runAgentWorkflow(prompt, tenantId, 'cai_mahindra', []);
    console.log('Result insight:', result.insight);
    console.log('Result widget:', JSON.stringify(result.widget, null, 2));
  } catch (err) {
    console.error('Error running agent:', err);
  }
}

main();
