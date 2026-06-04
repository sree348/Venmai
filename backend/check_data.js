import 'dotenv/config';
import { prisma } from './src/services/prisma.service.js';

async function main() {
  const history = await prisma.conversationHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  console.log('Conversation History count:', history.length);
  for (const h of history) {
    console.log(`[${h.createdAt}] Role: ${h.role} | Tenant: ${h.tenantId}`);
    console.log('Content:', h.content);
    console.log('---');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
