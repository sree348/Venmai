import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { prisma } from '../services/prisma.service.js';

export const dashboardRouter = Router();

function dateRange(req: AuthenticatedRequest) {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return { from, to };
}

function baseWhere(req: AuthenticatedRequest, defaultActive = true) {
  const { from, to } = dateRange(req);
  const status = req.query.status ? String(req.query.status).toLowerCase() : defaultActive ? 'active' : undefined;
  const clientId = req.query.clientId ? String(req.query.clientId) : undefined;

  return Prisma.sql`
    tenant_id = ${req.auth!.tenantId}
    AND date >= ${from}
    AND date <= ${to}
    ${clientId ? Prisma.sql`AND client_id = ${clientId}` : Prisma.empty}
    ${status ? Prisma.sql`AND LOWER(status) = ${status}` : Prisma.empty}
  `;
}

function frequencyFlag(frequency: number | null) {
  const value = Number(frequency || 0);
  if (value >= 4) return 'critical';
  if (value >= 3) return 'warning';
  return 'healthy';
}

dashboardRouter.get('/dashboard/summary', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const rows = await prisma.$queryRaw<Array<{
      totalSpend: number | null;
      cpc: number | null;
      totalClicks: number | null;
      avgFrequency: number | null;
      totalConversions: number | null;
      blendedRoas: number | null;
    }>>`
      SELECT
        COALESCE(SUM(spend), 0)::float AS "totalSpend",
        CASE WHEN SUM(clicks) = 0 THEN NULL ELSE (SUM(spend) / SUM(clicks))::float END AS "cpc",
        COALESCE(SUM(clicks), 0)::int AS "totalClicks",
        COALESCE(AVG(frequency), 0)::float AS "avgFrequency",
        COALESCE(SUM(conversions), 0)::int AS "totalConversions",
        CASE WHEN SUM(conversions) = 0 THEN NULL ELSE (SUM(action_value) / NULLIF(SUM(spend), 0))::float END AS "blendedRoas"
      FROM campaign_data
      WHERE ${baseWhere(req, false)}
    `;
    const summary = rows[0] || {};

    return res.json({
      ...summary,
      frequencyFlag: frequencyFlag(summary.avgFrequency || 0),
      currency: 'INR',
    });
  } catch (error) {
    return next(error);
  }
});

dashboardRouter.get('/dashboard/top-campaigns', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const limit = Number(req.query.limit || 5);
    const rows = await prisma.$queryRaw`
      SELECT
        campaign_id AS "campaignId",
        campaign_name AS "campaignName",
        SUM(spend)::float AS spend,
        SUM(clicks)::int AS clicks,
        CASE WHEN SUM(clicks) = 0 THEN NULL ELSE (SUM(spend) / SUM(clicks))::float END AS cpc,
        SUM(conversions)::int AS conversions,
        CASE WHEN SUM(conversions) = 0 THEN NULL ELSE (SUM(action_value) / NULLIF(SUM(spend), 0))::float END AS roas,
        AVG(frequency)::float AS frequency
      FROM campaign_data
      WHERE ${baseWhere(req, false)}
      GROUP BY campaign_id, campaign_name
      ORDER BY SUM(spend) DESC
      LIMIT ${limit}
    `;

    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

dashboardRouter.get('/dashboard/spend-trend', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT date::date AS date, SUM(spend)::float AS spend
      FROM campaign_data
      WHERE ${baseWhere(req, false)}
      GROUP BY date
      ORDER BY date ASC
    `;

    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

dashboardRouter.get('/dashboard/campaigns', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { frequency: number }>>`
      SELECT
        campaign_id AS "campaignId",
        campaign_name AS "campaignName",
        platform,
        status,
        SUM(spend)::float AS spend,
        SUM(impressions)::int AS impressions,
        SUM(clicks)::int AS clicks,
        SUM(reach)::int AS reach,
        AVG(frequency)::float AS frequency,
        CASE WHEN SUM(impressions) = 0 THEN 0 ELSE ((SUM(clicks)::numeric / SUM(impressions)) * 100)::float END AS ctr,
        CASE WHEN SUM(clicks) = 0 THEN NULL ELSE (SUM(spend) / SUM(clicks))::float END AS cpc,
        CASE WHEN SUM(impressions) = 0 THEN 0 ELSE ((SUM(spend) / SUM(impressions)) * 1000)::float END AS cpm,
        SUM(conversions)::int AS conversions,
        CASE WHEN SUM(conversions) = 0 THEN NULL ELSE (SUM(action_value) / NULLIF(SUM(spend), 0))::float END AS roas
      FROM campaign_data
      WHERE ${baseWhere(req, true)}
      GROUP BY campaign_id, campaign_name, platform, status
      ORDER BY spend DESC
    `;

    return res.json(rows.map(row => ({
      ...row,
      frequencyFlag: frequencyFlag(row.frequency),
      currency: 'INR',
    })));
  } catch (error) {
    return next(error);
  }
});

dashboardRouter.get('/dashboard/last-synced', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const rows = await prisma.$queryRaw<Array<{
      lastSyncedAt: Date | null;
      campaignCount: number;
      dataFrom: Date | null;
      dataTo: Date | null;
    }>>`
      SELECT
        MAX(updated_at) AS "lastSyncedAt",
        COUNT(DISTINCT campaign_id)::int AS "campaignCount",
        MIN(date) AS "dataFrom",
        MAX(date) AS "dataTo"
      FROM campaign_data
      WHERE tenant_id = ${req.auth!.tenantId}
      ${req.query.clientId ? Prisma.sql`AND client_id = ${String(req.query.clientId)}` : Prisma.empty}
    `;

    return res.json(rows[0] || { lastSyncedAt: null, campaignCount: 0, dataFrom: null, dataTo: null });
  } catch (error) {
    return next(error);
  }
});

dashboardRouter.get('/dashboard/monthly-trend', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;

    // Find the earliest date available for this tenant (ignore request date range)
    const earliestRows = await prisma.$queryRaw<Array<{ earliest: Date | null }>>`
      SELECT MIN(date) AS earliest
      FROM campaign_data
      WHERE tenant_id = ${tenantId}
      ${clientId ? Prisma.sql`AND client_id = ${clientId}` : Prisma.empty}
    `;
    const earliest = earliestRows[0]?.earliest ?? new Date('2024-01-01');
    const now = new Date();

    const rows = await prisma.$queryRaw<Array<{
      month_bucket: Date;
      spend: number;
      clicks: number;
      impressions: number;
      ctr: number;
      cpc: number;
    }>>`
      SELECT
        DATE_TRUNC('month', date)                                           AS month_bucket,
        SUM(spend)::float                                                   AS spend,
        SUM(clicks)::bigint                                                 AS clicks,
        SUM(impressions)::bigint                                            AS impressions,
        CASE WHEN SUM(impressions) = 0 THEN 0
             ELSE (SUM(clicks)::numeric / NULLIF(SUM(impressions), 0) * 100)::float
        END                                                                 AS ctr,
        CASE WHEN SUM(clicks) = 0 THEN 0
             ELSE (SUM(spend) / NULLIF(SUM(clicks), 0))::float
        END                                                                 AS cpc
      FROM campaign_data
      WHERE tenant_id = ${tenantId}
        AND date >= ${earliest}
        AND date <= ${now}
        ${clientId ? Prisma.sql`AND client_id = ${clientId}` : Prisma.empty}
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY DATE_TRUNC('month', date) ASC
    `;

    // Format month_bucket → "Jan 26", "Feb 26", etc.
    const result = rows.map(row => ({
      month_label: new Date(row.month_bucket).toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      spend:       Math.round(Number(row.spend) || 0),
      clicks:      Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      ctr:         Number((Number(row.ctr) || 0).toFixed(3)),
      cpc:         Number((Number(row.cpc) || 0).toFixed(2)),
    }));

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});
