const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("=== CHECKING PLATFORM CONNECTIONS ===");
  const connections = await prisma.platformConnection.findMany();
  console.log(JSON.stringify(connections, null, 2));

  console.log("\n=== CHECKING GOOGLE CAMPAIGN DATA ===");
  const googleCampaigns = await prisma.campaignData.findMany({
    where: {
      platform: {
        contains: 'google',
        mode: 'insensitive'
      }
    }
  });
  console.log(`Found ${googleCampaigns.length} Google Campaigns:`);
  googleCampaigns.forEach(c => {
    console.log(`- ${c.campaignName} (ID: ${c.campaignId}): Spend: ${c.spend}, Conversions: ${c.conversions}, Date: ${c.date}`);
  });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
