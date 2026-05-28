import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service.js';

const STATIC_CLIENTS = [
  {
    id: 'cai_mahindra',
    name: 'CAI Mahindra',
    industry: 'Automotive · Retail',
    avatar: 'CM',
    color: 'from-red-500 to-red-700',
    dotColor: 'bg-red-500',
    lightBg: 'bg-red-50',
    lightBorder: 'border-red-200',
    textColor: 'text-red-700',
    monthlyBudget: 5000000,
    platforms: ['Meta'],
    accountManager: 'CAI Mahindra Team',
    status: 'healthy',
    retainer: '₹10.0L/mo',
    since: 'Jan 2026',
  },
];

export async function listClients(tenantId: string) {
  const campaignClients = await prisma.campaignData.findMany({
    where: { tenantId },
    select: { clientId: true },
    distinct: ['clientId'],
  });
  const ids = new Set(campaignClients.map(item => item.clientId).filter(Boolean));

  if (ids.size === 0) return STATIC_CLIENTS;

  return STATIC_CLIENTS.filter(client => ids.has(client.id));
}

export async function listCampaigns(tenantId: string, clientId?: string) {
  return prisma.$queryRaw`
      SELECT
        MIN(campaign_id)::text AS id,
        COALESCE(client_id, 'meta') AS "clientId",
        campaign_name AS "name",
        platform AS channel,
        SUM(spend)::FLOAT AS spend,
        SUM(spend)::FLOAT AS budget,
        CASE WHEN SUM(conversions) = 0 THEN NULL ELSE (SUM(action_value) / NULLIF(SUM(spend), 0))::FLOAT END AS roas,
        CASE WHEN SUM(impressions) = 0 THEN 0 ELSE ((SUM(clicks)::NUMERIC / SUM(impressions)) * 100)::FLOAT END AS ctr,
        CASE WHEN SUM(impressions) = 0 THEN 0 ELSE ((SUM(spend)::NUMERIC / SUM(impressions)) * 1000)::FLOAT END AS cpm,
        SUM(conversions)::INTEGER AS conv,
        MAX(status) AS status,
        0 AS change,
        SUM(impressions)::INTEGER AS impressions,
        SUM(clicks)::INTEGER AS clicks,
        AVG(frequency)::FLOAT AS frequency,
        BOOL_OR(status = 'active') AS active
      FROM campaign_data
      WHERE tenant_id = ${tenantId}
        ${clientId ? Prisma.sql`AND client_id = ${clientId}` : Prisma.empty}
      GROUP BY client_id, campaign_name, platform
      ORDER BY spend DESC
    `;
}

export async function getSpendTrend(tenantId: string, days = 30, clientId?: string) {
  return prisma.$queryRaw`
      SELECT
        date::TEXT,
        SUM(spend)::FLOAT AS spend,
        SUM(clicks)::INTEGER AS clicks,
        SUM(conversions)::INTEGER AS conversions,
        CASE WHEN SUM(conversions) = 0 THEN NULL ELSE (SUM(action_value) / NULLIF(SUM(spend), 0))::FLOAT END AS roas
      FROM campaign_data
      WHERE tenant_id = ${tenantId}
        AND date >= CURRENT_DATE - (${days}::INTEGER - 1)
        ${clientId ? Prisma.sql`AND client_id = ${clientId}` : Prisma.empty}
      GROUP BY date
      ORDER BY date ASC
    `;
}
