import { prisma } from '../services/prisma.service.js';

type PlatformConnectionInput = {
  tenantId: string;
  clientId?: string | null;
  platform: string;
  accountName?: string | null;
  accountId?: string | null;
  credentials: Record<string, unknown>;
};

export async function listPlatformConnections(tenantId: string) {
  const meta = await prisma.metaConnection.findUnique({ where: { tenantId } });

  return meta
    ? [{
        id: meta.id,
        tenantId: meta.tenantId,
        clientId: null,
        platform: 'Meta Ads',
        accountName: 'Meta Ads',
        accountId: meta.adAccountId,
        status: 'connected',
        lastSyncAt: meta.updatedAt,
        createdAt: meta.connectedAt,
        updatedAt: meta.updatedAt,
      }]
    : [];
}

export async function getPlatformConnection(id: string, tenantId: string) {
  return prisma.metaConnection.findFirst({ where: { id, tenantId } });
}

export async function upsertPlatformConnection(input: PlatformConnectionInput) {
  return {
    id: input.accountId || input.platform,
    tenantId: input.tenantId,
    clientId: input.clientId || null,
    platform: input.platform,
    accountName: input.accountName || input.platform,
    accountId: input.accountId || null,
    status: 'connected',
    lastSyncAt: null,
  };
}

export async function markConnectionSync(id: string, tenantId: string) {
  return prisma.metaConnection.update({
    where: { id, tenantId },
    data: { updatedAt: new Date() },
  });
}
