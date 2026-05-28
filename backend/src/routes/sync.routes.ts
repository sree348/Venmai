import { Router } from 'express';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { fetchAndStoreCampaigns } from '../services/meta.fetch.js';

export const syncRouter = Router();

syncRouter.post('/sync/trigger', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.auth!.tenantId;

    fetchAndStoreCampaigns(tenantId).catch(error => {
      console.error(`Manual Meta sync failed for tenant ${tenantId}`, error);
    });

    return res.json({ status: 'started' });
  } catch (error) {
    return next(error);
  }
});
