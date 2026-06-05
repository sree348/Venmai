import { prisma } from './services/prisma.service.js';

async function main() {
  const result = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT 
      client_id, 
      campaign_name, 
      platform, 
      status
    FROM campaign_data;
  `;
  
  console.log(`Found ${result.length} distinct campaign combinations in database:`);
  result.forEach((c, idx) => {
    console.log(`${idx + 1}. Client: ${c.client_id} | Name: ${c.campaign_name} | Platform: ${c.platform} | Status: ${c.status}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
