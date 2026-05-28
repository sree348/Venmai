import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

export type AuthenticatedRequest = Request & {
  auth?: {
    tenantId: string;
    userId?: string;
  };
};

export function requireJwtAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization bearer token.' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const payload = jwt.verify(token, secret) as jwt.JwtPayload & { tenantId?: string; sub?: string };
    const tenantId = payload.tenantId || String(payload.sub || '');

    if (!tenantId) {
      return res.status(401).json({ error: 'JWT must include tenantId or sub.' });
    }

    req.auth = {
      tenantId,
      userId: payload.sub,
    };

    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid Authorization token.' });
  }
}

export function getTenantId(req: AuthenticatedRequest) {
  return req.auth?.tenantId || String(req.headers['x-tenant-id'] || req.query.tenantId || req.body?.tenantId || 'agency');
}
