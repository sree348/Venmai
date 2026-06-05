import 'dotenv/config';
import { prisma } from './src/services/prisma.service.js';

async function main() {
  // Query 1: Raw Campaign data
  const rawCampaigns = await prisma.campaignData.findMany({
    where: {
      tenantId: 'agency',
      clientId: 'cai_mahindra',
    },
    orderBy: { date: 'asc' },
  });

  console.log(`Total raw campaign data rows: ${rawCampaigns.length}`);

  // Query 2: Grouped by campaign name
  const groupedCampaigns = await prisma.$queryRaw`
    SELECT
      campaign_name,
      platform,
      MIN(date)::text AS min_date,
      MAX(date)::text AS max_date,
      ARRAY_AGG(DISTINCT status) AS statuses,
      SUM(spend)::FLOAT AS spend,
      BOOL_OR(status = 'active') AS active
    FROM campaign_data
    WHERE tenant_id = 'agency' AND client_id = 'cai_mahindra'
    GROUP BY campaign_name, platform
    ORDER BY min_date ASC
  `;

  console.log("\n=== GROUPED CAMPAIGNS FOR CAI MAHINDRA ===");
  console.log(JSON.stringify(groupedCampaigns, null, 2));

  // Query 3: Distinct status count across all rows
  const statusCounts = await prisma.$queryRaw`
    SELECT status, count(*)
    FROM campaign_data
    WHERE tenant_id = 'agency' AND client_id = 'cai_mahindra'
    GROUP BY status
  `;
  console.log("\n=== STATUS COUNTS FOR CAI MAHINDRA ===");
  console.log(statusCounts);
}

main().catch(console.error).finally(() => prisma.$disconnect());
