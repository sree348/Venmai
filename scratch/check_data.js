import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.campaignData.count();
  console.log('Total campaign_data rows:', count);

  const campaigns = await prisma.campaignData.groupBy({
    by: ['campaignId', 'campaignName', 'platform', 'status', 'tenantId', 'clientId'],
    _sum: {
      spend: true,
      conversions: true,
    }
  });

  console.log('Campaigns count:', campaigns.length);
  for (const c of campaigns) {
    console.log(`- ${c.campaignName} (Platform: ${c.platform}, Status: ${c.status}) | Tenant: ${c.tenantId}, Client: ${c.clientId} | Spend: ${c._sum.spend}, Conversions: ${c._sum.conversions}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
