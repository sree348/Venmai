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
    monthlyBudget: 50000,
    platforms: ['Meta'],
    accountManager: 'CAI Mahindra Team',
    status: 'healthy',
    retainer: '₹10.0k/mo',
    since: 'Jan 2026',
  },
  {
    id: 'tata_motors',
    name: 'Tata Motors',
    industry: 'Automotive',
    avatar: 'TM',
    color: 'from-blue-500 to-blue-700',
    dotColor: 'bg-blue-500',
    lightBg: 'bg-blue-50',
    lightBorder: 'border-blue-200',
    textColor: 'text-blue-700',
    monthlyBudget: 75000,
    platforms: ['Meta', 'Google'],
    accountManager: 'Agency Team',
    status: 'healthy',
    retainer: '₹25.0k/mo',
    since: 'Jan 2026',
  },
  {
    id: 'zoomcar',
    name: 'Zoomcar',
    industry: 'Mobility · Marketplace',
    avatar: 'ZC',
    color: 'from-emerald-500 to-emerald-700',
    dotColor: 'bg-emerald-500',
    lightBg: 'bg-emerald-50',
    lightBorder: 'border-emerald-200',
    textColor: 'text-emerald-700',
    monthlyBudget: 40000,
    platforms: ['Meta'],
    accountManager: 'Agency Team',
    status: 'healthy',
    retainer: '₹15.0k/mo',
    since: 'Jan 2026',
  },
  {
    id: 'sbi_card',
    name: 'SBI Card',
    industry: 'Finance · Cards',
    avatar: 'SC',
    color: 'from-violet-500 to-violet-700',
    dotColor: 'bg-violet-500',
    lightBg: 'bg-violet-50',
    lightBorder: 'border-violet-200',
    textColor: 'text-violet-700',
    monthlyBudget: 60000,
    platforms: ['Meta', 'Google'],
    accountManager: 'Agency Team',
    status: 'healthy',
    retainer: '₹20.0k/mo',
    since: 'Jan 2026',
  },
];

function titleCaseClient(id: string) {
  return id
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function listClients(tenantId: string) {
  const campaignClients = await prisma.campaignData.findMany({
    where: { tenantId },
    select: { clientId: true },
    distinct: ['clientId'],
  });
  const ids = [...new Set(campaignClients.map(item => item.clientId).filter(Boolean))] as string[];

  if (ids.length === 0) return STATIC_CLIENTS;

  const byId = new Map(STATIC_CLIENTS.map(client => [client.id, client]));
  return ids.map(id => {
    const known = byId.get(id);
    if (known) return known;
    const initials = titleCaseClient(id)
      .split(' ')
      .map(part => part[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
    return {
      id,
      name: titleCaseClient(id),
      industry: 'Marketing',
      avatar: initials || 'CL',
      color: 'from-slate-500 to-slate-700',
      dotColor: 'bg-slate-500',
      lightBg: 'bg-slate-50',
      lightBorder: 'border-slate-200',
      textColor: 'text-slate-700',
      monthlyBudget: 0,
      platforms: ['Meta'],
      accountManager: 'Agency Team',
      status: 'healthy',
      retainer: '—',
      since: '2026',
    };
  });
}

export async function listCampaigns(tenantId: string, clientId?: string) {
  return prisma.$queryRaw`
      SELECT
        MIN(campaign_id)::text AS id,
        COALESCE(client_id, 'meta') AS "clientId",
        campaign_name AS "name",
        platform AS channel,
        MIN(date)::text AS "start_date",
        MAX(date)::text AS "end_date",
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
