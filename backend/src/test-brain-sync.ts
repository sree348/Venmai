import 'dotenv/config';
import { runBrainAnalysis } from './jobs/brain.job.js';
import { prisma } from './services/prisma.service.js';

async function main() {
  console.log('--- TEST BRAIN INITIATOR ---');
  
  const clientId = 'cai_mahindra';
  await runBrainAnalysis(clientId);

  console.log('\n--- BRAIN INSIGHTS ---');
  const insights = await prisma.brainInsight.findMany({
    where: { tenantId: clientId }
  });
  console.table(insights.map(i => ({
    type: i.type,
    priority: i.priority,
    title: i.title,
    body: i.body,
    campaign: i.campaignName,
    metric: i.metric,
    val: i.currentValue,
    thresh: i.threshold,
    action: i.suggestedAction
  })));

  console.log('\n--- CAMPAIGN SCORES ---');
  const scores = await prisma.campaignScore.findMany({
    where: { tenantId: clientId }
  });
  console.table(scores);

  await prisma.$disconnect();
}

main().catch(console.error);
