import { Router } from 'express';
import { prisma } from '../services/prisma.service.js';
import {
  buildGoogleOAuthUrl,
  exchangeCodeForTokens,
  getGoogleCustomerAccount,
} from '../services/google.oauth.js';
import { getTenantId, requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { fetchAndStoreGoogleCampaigns } from '../services/google.fetch.js';

export const googleRouter = Router();

googleRouter.get('/auth/google/connect', (req, res, next) => {
  try {
    const tenantId = String(req.query.tenantId || req.headers['x-tenant-id'] || 'agency');
    return res.redirect(buildGoogleOAuthUrl(tenantId));
  } catch (error) {
    return next(error);
  }
});

googleRouter.get('/auth/google/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    const tenantId = String(req.query.state || '');

    if (!code || !tenantId) {
      return res.status(400).json({ error: 'Google callback requires code and state.' });
    }

    const tokens = await exchangeCodeForTokens(code);
    const customerId = await getGoogleCustomerAccount(tokens.access_token);

    // Save or update platform connections
    await prisma.platformConnection.upsert({
      where: {
        tenantId_platform: { tenantId, platform: 'Google Ads' }
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        customerId,
        connectedAt: new Date(),
      },
      create: {
        tenantId,
        platform: 'Google Ads',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        customerId,
      },
    });

    // Run initial sync in the background
    fetchAndStoreGoogleCampaigns(tenantId).catch(error => {
      console.error(`Google Ads initial sync failed for tenant ${tenantId}:`, error);
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/integrations?success=google`);
  } catch (error) {
    return next(error);
  }
});

googleRouter.get('/auth/google/status', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const connection = await prisma.platformConnection.findUnique({
      where: {
        tenantId_platform: { tenantId, platform: 'Google Ads' }
      },
    });

    return res.json({
      connected: Boolean(connection),
      connectedAt: connection?.connectedAt || null,
      expiresAt: connection?.expiresAt || null,
      customerId: connection?.customerId || null,
    });
  } catch (error) {
    return next(error);
  }
});

googleRouter.delete('/auth/google/disconnect', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = getTenantId(req);
    await prisma.platformConnection.deleteMany({
      where: { tenantId, platform: 'Google Ads' },
    });

    return res.json({ connected: false });
  } catch (error) {
    return next(error);
  }
});
