import { Router } from 'express';
import { getSpendTrend, listCampaigns, listClients } from '../repositories/analytics.repository.js';
import { fetchMetaAdSets, fetchMetaAds } from '../services/meta.fetch.js';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

export const analyticsRouter = Router();

function getTenantId(req: { query: any; headers: any; body?: any }) {
  return String(req.headers['x-tenant-id'] || req.query.tenantId || req.body?.tenantId || 'agency');
}

analyticsRouter.get('/clients', async (req, res, next) => {
  try {
    const clients = await listClients(getTenantId(req));
    return res.json(clients);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get('/campaigns', async (req, res, next) => {
  try {
    const campaigns = await listCampaigns(getTenantId(req), req.query.clientId as string | undefined);
    return res.json(campaigns);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get('/analytics/spend-trend', async (req, res, next) => {
  try {
    const range = String(req.query.range || '30d');
    const days = Number(range.replace('d', '')) || 30;
    const trend = await getSpendTrend(getTenantId(req), days, req.query.clientId as string | undefined);
    return res.json(trend);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get('/adsets', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const campaignId = req.query.campaignId as string;
    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId query parameter is required' });
    }
    const adsets = await fetchMetaAdSets(tenantId, campaignId);
    return res.json(adsets);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get('/ads', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const adsetId = req.query.adsetId as string;
    if (!adsetId) {
      return res.status(400).json({ error: 'adsetId query parameter is required' });
    }
    const ads = await fetchMetaAds(tenantId, adsetId);
    return res.json(ads);
  } catch (error) {
    return next(error);
  }
});
