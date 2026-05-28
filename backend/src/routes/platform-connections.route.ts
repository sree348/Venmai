import { Router } from 'express';
import {
  listPlatformConnections,
  upsertPlatformConnection,
} from '../repositories/platform-connections.repository.js';
import { syncPlatformConnection } from '../services/platform-sync.service.js';
import { getTenantId, requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

export const platformConnectionsRouter = Router();

platformConnectionsRouter.get('/platform-connections', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const connections = await listPlatformConnections(getTenantId(req));
    return res.json(connections);
  } catch (error) {
    return next(error);
  }
});

platformConnectionsRouter.post('/platform-connections', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { platform, clientId, accountName, accountId, credentials = {} } = req.body || {};

    if (!platform) {
      return res.status(400).json({ error: 'platform is required.' });
    }

    if (platform !== 'Meta Ads') {
      return res.status(501).json({
        error: `${platform} persistence is not implemented yet. Connectors other than Meta Ads are local demo configuration only.`,
      });
    }

    const connection = await upsertPlatformConnection({
      tenantId: getTenantId(req),
      clientId,
      platform,
      accountName,
      accountId,
      credentials,
    });

    return res.status(201).json(connection);
  } catch (error) {
    return next(error);
  }
});

platformConnectionsRouter.post('/platform-connections/:id/sync', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await syncPlatformConnection(String(req.params.id), getTenantId(req));
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});
