import { Router } from 'express';
import { prisma } from '../services/prisma.service.js';
import {
  buildMetaOAuthUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getMetaUserId,
  getTokenExpiry,
} from '../services/meta.oauth.js';
import { fetchAndStoreCampaigns } from '../services/meta.fetch.js';
import { getTenantId, requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

export const metaRouter = Router();

metaRouter.get('/auth/meta/connect', (req, res, next) => {
  try {
    const tenantId = String(req.query.tenantId || req.headers['x-tenant-id'] || 'agency');
    return res.redirect(buildMetaOAuthUrl(tenantId));
  } catch (error) {
    return next(error);
  }
});

metaRouter.get('/auth/meta/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    const tenantId = String(req.query.state || '');

    if (!code || !tenantId) {
      return res.status(400).json({ error: 'Meta callback requires code and state.' });
    }

    const shortLived = await exchangeCodeForShortLivedToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const metaUserId = await getMetaUserId(longLived.access_token);

    await prisma.metaConnection.upsert({
      where: { tenantId },
      update: {
        accessToken: longLived.access_token,
        expiresAt: getTokenExpiry(longLived.expires_in),
        metaUserId,
        connectedAt: new Date(),
      },
      create: {
        tenantId,
        accessToken: longLived.access_token,
        expiresAt: getTokenExpiry(longLived.expires_in),
        metaUserId,
      },
    });

    fetchAndStoreCampaigns(tenantId).catch(error => {
      console.error(`Meta initial sync failed for tenant ${tenantId}`, error);
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/dashboard?connected=true`);
  } catch (error) {
    return next(error);
  }
});

metaRouter.get('/auth/meta/status', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const connection = await prisma.metaConnection.findUnique({
      where: { tenantId },
    });
    const adAccountCount = connection?.adAccountId ? 1 : 0;

    return res.json({
      connected: Boolean(connection),
      connectedAt: connection?.connectedAt || null,
      expiresAt: connection?.expiresAt || null,
      adAccountCount,
      adAccountId: connection?.adAccountId || null,
    });
  } catch (error) {
    return next(error);
  }
});

metaRouter.delete('/auth/meta/disconnect', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = getTenantId(req);
    await prisma.metaConnection.deleteMany({
      where: { tenantId },
    });

    return res.json({ connected: false });
  } catch (error) {
    return next(error);
  }
});
