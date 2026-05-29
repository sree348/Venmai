import axios from 'axios';
import { prisma } from './prisma.service.js';
import { refreshGoogleAccessToken } from './google.oauth.js';

export async function fetchAndStoreGoogleCampaigns(tenantId: string) {
  const connection = await prisma.platformConnection.findUnique({
    where: {
      tenantId_platform: { tenantId, platform: 'Google Ads' }
    }
  });

  if (!connection) {
    console.warn(`[Google Fetch] No platform connection found for tenant ${tenantId}`);
    return { count: 0 };
  }

  // 1. Sandbox Sync Bypass (Mock Mode or Sandbox connection detection)
  if (connection.accessToken.startsWith('mock_google_access_token') || !process.env.GOOGLE_DEVELOPER_TOKEN) {
    console.log(`[Google Fetch] Sandbox mode active. Generating realistic Google Ads campaign records.`);
    
    // Generate campaign data for clients
    const mockCampaigns = [
      {
        clientId: 'cai_mahindra',
        campaignId: 'g_camp_mahindra_search',
        campaignName: 'Mahindra XUV700 - Google Search Brand',
        spend: 42000,
        impressions: 480000,
        clicks: 38400,
        reach: 220000,
        frequency: 2.18,
        conversions: 2450,
        roas: 4.8,
        status: 'active',
        date: new Date('2026-05-15T00:00:00Z'),
      },
      {
        clientId: 'cai_mahindra',
        campaignId: 'g_camp_mahindra_pmax',
        campaignName: 'Mahindra Thar - Google Performance Max',
        spend: 38000,
        impressions: 550000,
        clicks: 22000,
        reach: 290000,
        frequency: 1.9,
        conversions: 1840,
        roas: 5.2,
        status: 'active',
        date: new Date('2026-05-15T00:00:00Z'),
      },
      {
        clientId: 'sbi_card',
        campaignId: 'g_camp_sbi_search',
        campaignName: 'SBI Cashback Card - Search high-intent',
        spend: 25000,
        impressions: 320000,
        clicks: 28800,
        reach: 180000,
        frequency: 1.78,
        conversions: 1420,
        roas: 3.8,
        status: 'active',
        date: new Date('2026-05-15T00:00:00Z'),
      },
      {
        clientId: 'tata_motors',
        campaignId: 'g_camp_tata_pmax',
        campaignName: 'Tata Nexon EV - Google PMax electro',
        spend: 48000,
        impressions: 620000,
        clicks: 34100,
        reach: 350000,
        frequency: 1.77,
        conversions: 2180,
        roas: 4.5,
        status: 'active',
        date: new Date('2026-05-15T00:00:00Z'),
      },
      {
        clientId: 'zoomcar',
        campaignId: 'g_camp_zoom_search',
        campaignName: 'Zoomcar Rentals - Google Search Weekend',
        spend: 18000,
        impressions: 210000,
        clicks: 14700,
        reach: 120000,
        frequency: 1.75,
        conversions: 890,
        roas: 4.1,
        status: 'active',
        date: new Date('2026-05-15T00:00:00Z'),
      }
    ];

    let upsertedCount = 0;
    for (const item of mockCampaigns) {
      const cpc = item.clicks > 0 ? item.spend / item.clicks : 0;
      const cpm = item.impressions > 0 ? (item.spend / item.impressions) * 1000 : 0;
      const ctr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0;

      await prisma.campaignData.upsert({
        where: {
          tenantId_date_campaignId: {
            tenantId,
            date: item.date,
            campaignId: item.campaignId,
          }
        },
        update: {
          clientId: item.clientId,
          campaignName: item.campaignName,
          platform: 'Google Ads',
          spend: item.spend,
          impressions: item.impressions,
          clicks: item.clicks,
          reach: item.reach,
          frequency: item.frequency,
          conversions: item.conversions,
          roas: item.roas,
          ctr,
          cpc,
          cpm,
          status: item.status,
        },
        create: {
          tenantId,
          clientId: item.clientId,
          campaignId: item.campaignId,
          campaignName: item.campaignName,
          platform: 'Google Ads',
          date: item.date,
          spend: item.spend,
          impressions: item.impressions,
          clicks: item.clicks,
          reach: item.reach,
          frequency: item.frequency,
          conversions: item.conversions,
          roas: item.roas,
          ctr,
          cpc,
          cpm,
          status: item.status,
        }
      });
      upsertedCount++;
    }

    return { count: upsertedCount };
  }

  // 2. Production Live Mode Sync Loop
  let accessToken = connection.accessToken;
  if (connection.refreshToken && connection.expiresAt < new Date()) {
    accessToken = await refreshGoogleAccessToken(connection.refreshToken);
    await prisma.platformConnection.update({
      where: { id: connection.id },
      data: {
        accessToken,
        expiresAt: new Date(Date.now() + 3600 * 1000), // Refresh sets to 1 hour expiration
      }
    });
  }

  const customerId = connection.customerId || '';
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;

  if (!customerId || !developerToken) {
    throw new Error('Google connection is missing customerId or developer token.');
  }

  try {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.historical_creative_quality_score,
        segments.date
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    `;

    const { data } = await axios.post(
      `https://googleads.googleapis.com/v17/customers/${customerId.replace(/-/g, '')}/googleAds:search`,
      { query },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
        }
      }
    );

    let count = 0;
    if (data.results && data.results.length > 0) {
      for (const row of data.results) {
        const campaign = row.campaign;
        const metrics = row.metrics || {};
        const segments = row.segments || {};

        const campaignId = String(campaign.id);
        const campaignName = String(campaign.name);
        const dateStr = segments.date ? new Date(segments.date) : new Date();

        // Convert micro-cents to main currency units (Google Ads uses micros)
        const spend = Number(metrics.costMicros || 0) / 1000000;
        const clicks = Number(metrics.clicks || 0);
        const impressions = Number(metrics.impressions || 0);
        const conversions = Number(metrics.conversions || 0);

        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

        // Auto-assign to client by name indicators
        let clientId = 'cai_mahindra';
        const nameLower = campaignName.toLowerCase();
        if (nameLower.includes('sbi')) clientId = 'sbi_card';
        else if (nameLower.includes('tata')) clientId = 'tata_motors';
        else if (nameLower.includes('zoom')) clientId = 'zoomcar';

        await prisma.campaignData.upsert({
          where: {
            tenantId_date_campaignId: {
              tenantId,
              date: dateStr,
              campaignId,
            }
          },
          update: {
            clientId,
            campaignName,
            platform: 'Google Ads',
            spend,
            impressions,
            clicks,
            conversions,
            ctr,
            cpc,
            cpm,
            status: campaign.status === 'ENABLED' ? 'active' : 'paused',
          },
          create: {
            tenantId,
            clientId,
            campaignId,
            campaignName,
            platform: 'Google Ads',
            date: dateStr,
            spend,
            impressions,
            clicks,
            conversions,
            ctr,
            cpc,
            cpm,
            status: campaign.status === 'ENABLED' ? 'active' : 'paused',
          }
        });
        count++;
      }
    }

    return { count };
  } catch (err) {
    console.error('[Google Ads Sync Engine] Failed to fetch campaign statistics:', err);
    throw err;
  }
}
