import cron from 'node-cron';
import { prisma } from '../services/prisma.service.js';
import { fetchAndStoreCampaigns } from '../services/meta.fetch.js';

export async function initializeMetaConnectionFromEnv() {
  const envToken = process.env.META_ACCESS_TOKEN;
  const tenantId = 'agency';

  if (envToken && envToken !== 'placeholder') {
    try {
      console.log('Checking Meta Ads connection setup using META_ACCESS_TOKEN from .env...');
      const connection = await prisma.metaConnection.findUnique({
        where: { tenantId },
      });

      if (!connection || connection.accessToken !== envToken) {
        console.log('Upserting MetaConnection in PostgreSQL database using .env credentials...');
        await prisma.metaConnection.upsert({
          where: { tenantId },
          update: {
            accessToken: envToken,
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
            metaUserId: 'env-seeded',
            adAccountId: process.env.META_AD_ACCOUNT_ID || null,
            connectedAt: new Date(),
          },
          create: {
            tenantId,
            accessToken: envToken,
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
            metaUserId: 'env-seeded',
            adAccountId: process.env.META_AD_ACCOUNT_ID || null,
          },
        });
        console.log('Meta Ads database connection updated successfully.');
      }

      console.log('Triggering initial/startup Meta Ads sync from env token...');
      const result = await fetchAndStoreCampaigns(tenantId);
      console.log(`Initial Meta Ads sync completed: successfully synced ${result.count} campaign data rows.`);
    } catch (error) {
      console.error('Failed to initialize or auto-sync Meta connection from .env:', error);
    }
  } else {
    console.log('META_ACCESS_TOKEN is not configured or is a placeholder in .env. Skipping auto-seeding.');
  }
}

export function startMetaSyncJob() {
  cron.schedule('0 */6 * * *', async () => {
    const connections = await prisma.metaConnection.findMany({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        tenantId: true,
      },
    });

    for (const connection of connections) {
      try {
        const result = await fetchAndStoreCampaigns(connection.tenantId);
        console.log(`Meta sync success for tenant ${connection.tenantId}: ${result.count} rows`);
      } catch (error) {
        console.error(`Meta sync failed for tenant ${connection.tenantId}`, error);
      }
    }
  });
}
