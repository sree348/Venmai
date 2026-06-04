import axios from 'axios';
import { prisma } from './prisma.service.js';
import { emitDataReady } from './realtime.service.js';
import { runBrainAnalysis } from '../jobs/brain.job.js';
import { AI_BRAIN_DATE_WINDOW } from './ai-brain.service.js';

const GRAPH_BASE_URL = 'https://graph.facebook.com/v19.0';

type MetaAction = {
  action_type: string;
  value: string;
};

type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  objective?: string;
};

type MetaInsight = {
  date_start: string;
  campaign_id: string;
  campaign_name: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  frequency?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value: unknown) {
  const parsed = Number.parseInt(String(value || '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function getDateRange() {
  return {
    since: AI_BRAIN_DATE_WINDOW.from,
    until: AI_BRAIN_DATE_WINDOW.to,
  };
}

function extractConversions(actions: MetaAction[] = []) {
  return actions
    .filter(action => action.action_type === 'purchase' || action.action_type === 'lead')
    .reduce((sum, action) => sum + toInt(action.value), 0);
}

function extractPurchaseValue(actionValues: MetaAction[] = []) {
  return actionValues
    .filter(action => action.action_type === 'purchase')
    .reduce((sum, action) => sum + toNumber(action.value), 0);
}

async function graphGet<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const { data } = await axios.get(`${GRAPH_BASE_URL}/${path}`, { params });
  return data as T;
}

function getClientIdFromCampaignName(name: string): string | null {
  return 'cai_mahindra';
}

function normalizeAdAccountId(value?: string | null) {
  if (!value) return null;
  return value.startsWith('act_') ? value : `act_${value}`;
}

export async function fetchAndStoreCampaigns(tenantId: string) {
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId },
  });

  if (!connection) {
    throw new Error(`Meta Ads is not connected for tenant ${tenantId}.`);
  }

  const adAccountsResponse = await graphGet<{ data: Array<{ id: string; name: string; account_status: number }> }>('me/adaccounts', {
    fields: 'id,name,account_status',
    access_token: connection.accessToken,
  });

  const preferredAdAccountId = normalizeAdAccountId(connection.adAccountId || process.env.META_AD_ACCOUNT_ID);
  const activeAdAccounts = adAccountsResponse.data
    .filter(account => Number(account.account_status) === 1)
    .filter(account => !preferredAdAccountId || account.id === preferredAdAccountId);

  if (preferredAdAccountId && activeAdAccounts.length === 0) {
    throw new Error(`Preferred Meta ad account ${preferredAdAccountId} was not found or is not active for this token.`);
  }

  let upsertCount = 0;
  const range = getDateRange();

  for (const adAccount of activeAdAccounts) {
    await prisma.metaConnection.update({
      where: { tenantId },
      data: { adAccountId: adAccount.id },
    });

    const campaignsResponse = await graphGet<{ data: MetaCampaign[] }>(`${adAccount.id}/campaigns`, {
      fields: 'id,name,status,objective',
      filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
      access_token: connection.accessToken,
    });

    for (const campaign of campaignsResponse.data) {
      const insightsResponse = await graphGet<{ data: MetaInsight[] }>(`${campaign.id}/insights`, {
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,actions,action_values',
        time_range: JSON.stringify(range),
        time_increment: 1,
        access_token: connection.accessToken,
      });

      for (const insight of insightsResponse.data) {
        const spend = toNumber(insight.spend);
        const conversions = extractConversions(insight.actions);
        const purchaseValue = extractPurchaseValue(insight.action_values);
        const roas = conversions === 0 ? null : spend > 0 ? purchaseValue / spend : null;

        const campaignName = insight.campaign_name || campaign.name;
        const clientId = getClientIdFromCampaignName(campaignName);

        await prisma.campaignData.upsert({
          where: {
            tenantId_date_campaignId: {
              tenantId,
              date: dateOnly(insight.date_start),
              campaignId: insight.campaign_id || campaign.id,
            },
          },
          update: {
            clientId,
            platform: 'meta',
            campaignName,
            spend,
            impressions: toInt(insight.impressions),
            clicks: toInt(insight.clicks),
            reach: toInt(insight.reach),
            frequency: toNumber(insight.frequency),
            ctr: toNumber(insight.ctr),
            cpc: toNumber(insight.cpc),
            cpm: toNumber(insight.cpm),
            conversions,
            actionValue: purchaseValue,
            roas,
            status: campaign.status.toLowerCase(),
          },
          create: {
            tenantId,
            clientId,
            date: dateOnly(insight.date_start),
            platform: 'meta',
            campaignId: insight.campaign_id || campaign.id,
            campaignName,
            spend,
            impressions: toInt(insight.impressions),
            clicks: toInt(insight.clicks),
            reach: toInt(insight.reach),
            frequency: toNumber(insight.frequency),
            ctr: toNumber(insight.ctr),
            cpc: toNumber(insight.cpc),
            cpm: toNumber(insight.cpm),
            conversions,
            actionValue: purchaseValue,
            roas,
            status: campaign.status.toLowerCase(),
          },
        });

        upsertCount += 1;
      }
    }
  }

  try {
    await runBrainAnalysis('cai_mahindra', tenantId);
  } catch (brainErr) {
    console.error(`AI Brain background analysis failed for tenant ${tenantId}:`, brainErr);
  }

  emitDataReady(tenantId, upsertCount);
  return { tenantId, count: upsertCount };
}

export async function fetchMetaAdSets(tenantId: string, campaignId: string) {
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId },
  });
  if (!connection) {
    throw new Error('Meta Connection not found');
  }

  const adsetsResponse = await axios.get(`https://graph.facebook.com/v19.0/${campaignId}/adsets`, {
    params: {
      fields: 'id,name,status,daily_budget,lifetime_budget',
      access_token: connection.accessToken,
    }
  });

  const adsets = adsetsResponse.data.data || [];
  const range = getDateRange();

  const result = await Promise.all(adsets.map(async (adset: any) => {
    try {
      const insightsResponse = await axios.get(`https://graph.facebook.com/v19.0/${adset.id}/insights`, {
        params: {
          fields: 'spend,impressions,clicks,actions,action_values',
          time_range: JSON.stringify(range),
          access_token: connection.accessToken,
        }
      });

      const insights = insightsResponse.data.data?.[0] || {};
      const spend = toNumber(insights.spend);
      const conversions = extractConversions(insights.actions);
      const purchaseValue = extractPurchaseValue(insights.action_values);
      const roas = conversions === 0 ? null : spend > 0 ? purchaseValue / spend : null;

      return {
        id: adset.id,
        name: adset.name,
        status: adset.status.toLowerCase(),
        active: adset.status === 'ACTIVE',
        spend,
        clicks: toInt(insights.clicks),
        impressions: toInt(insights.impressions),
        conv: conversions,
        roas: roas ? Number(roas.toFixed(2)) : null,
        budget: toNumber(adset.daily_budget || adset.lifetime_budget || 0),
        campaignId,
      };
    } catch (e) {
      return {
        id: adset.id,
        name: adset.name,
        status: adset.status.toLowerCase(),
        active: adset.status === 'ACTIVE',
        spend: 0,
        clicks: 0,
        impressions: 0,
        conv: 0,
        roas: null,
        budget: toNumber(adset.daily_budget || adset.lifetime_budget || 0),
        campaignId,
      };
    }
  }));

  return result;
}

export async function fetchMetaAds(tenantId: string, adsetId: string) {
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId },
  });
  if (!connection) {
    throw new Error('Meta Connection not found');
  }

  const adsResponse = await axios.get(`https://graph.facebook.com/v19.0/${adsetId}/ads`, {
    params: {
      fields: 'id,name,status,creative{id,title,body,image_url,thumbnail_url,object_story_spec,asset_feed_spec}',
      access_token: connection.accessToken,
    }
  });

  const ads = adsResponse.data.data || [];
  const range = getDateRange();

  const result = await Promise.all(ads.map(async (ad: any) => {
    try {
      const insightsResponse = await axios.get(`https://graph.facebook.com/v19.0/${ad.id}/insights`, {
        params: {
          fields: 'spend,impressions,clicks,ctr,actions,action_values',
          time_range: JSON.stringify(range),
          access_token: connection.accessToken,
        }
      });

      const insights = insightsResponse.data.data?.[0] || {};
      const spend = toNumber(insights.spend);
      const conversions = extractConversions(insights.actions);
      const purchaseValue = extractPurchaseValue(insights.action_values);
      const roas = conversions === 0 ? null : spend > 0 ? purchaseValue / spend : null;

      const creative = ad.creative || {};
      const objectStory = creative.object_story_spec || {};
      const linkData = objectStory.link_data || {};
      const videoData = objectStory.video_data || {};
      const assetFeed = creative.asset_feed_spec || {};

      const headline = 
        creative.title || 
        linkData.title || 
        videoData.title || 
        (assetFeed.ad_formats?.[0]?.title) ||
        'Meta Ad Title';

      const copy = 
        creative.body || 
        linkData.message || 
        videoData.message || 
        (assetFeed.bodies?.[0]?.text) || 
        'Meta Ad creative copy description.';

      const imageUrl = 
        creative.image_url || 
        creative.thumbnail_url || 
        videoData.image_url || 
        (assetFeed.images?.[0]?.url) ||
        linkData.picture || 
        null;

      return {
        id: ad.id,
        name: ad.name,
        headline,
        copy,
        imageUrl,
        status: ad.status.toLowerCase(),
        active: ad.status === 'ACTIVE',
        spend,
        clicks: toInt(insights.clicks),
        impressions: toInt(insights.impressions),
        conv: conversions,
        roas: roas ? Number(roas.toFixed(2)) : null,
        ctr: toNumber(insights.ctr || 0),
        adsetId,
      };
    } catch (e) {
      const creative = ad.creative || {};
      const objectStory = creative.object_story_spec || {};
      const linkData = objectStory.link_data || {};
      const videoData = objectStory.video_data || {};
      const assetFeed = creative.asset_feed_spec || {};

      const headline = 
        creative.title || 
        linkData.title || 
        videoData.title || 
        (assetFeed.ad_formats?.[0]?.title) ||
        'Meta Ad Title';

      const copy = 
        creative.body || 
        linkData.message || 
        videoData.message || 
        (assetFeed.bodies?.[0]?.text) || 
        'Meta Ad creative copy description.';

      const imageUrl = 
        creative.image_url || 
        creative.thumbnail_url || 
        videoData.image_url || 
        (assetFeed.images?.[0]?.url) ||
        linkData.picture || 
        null;

      return {
        id: ad.id,
        name: ad.name,
        headline,
        copy,
        imageUrl,
        status: ad.status.toLowerCase(),
        active: ad.status === 'ACTIVE',
        spend: 0,
        clicks: 0,
        impressions: 0,
        conv: 0,
        roas: null,
        ctr: 0,
        adsetId,
      };
    }
  }));

  return result;
}

