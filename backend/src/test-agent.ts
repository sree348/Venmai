import 'dotenv/config';
import { runAgentWorkflow } from './services/agent.service.js';

async function main() {
  console.log('=== TESTING AGENTIC WORKFLOW REACT LOOP ===');
  const prompts = [
    'Good morning! I want to check my account.',
    'What was our total spend from April 20 to May 31?',
    'List campaigns that have frequency above 3.0',
  ];
  const tenantId = 'agency';

  for (const prompt of prompts) {
    console.log('\n----------------------------------------');
    console.log(`Testing Agent Prompt: "${prompt}"`);
    try {
      const result = await runAgentWorkflow(prompt, tenantId, 'cai_mahindra', []);
      console.log('Agent final widget:', JSON.stringify(result.widget, null, 2));
      console.log('Agent final insight/answer:', result.insight);
    } catch (err: any) {
      console.error('Agent execution failed for prompt:', prompt, err);
    }
  }
  console.log('\n=== AGENT DIAGNOSTIC COMPLETE ===');
}

main();
