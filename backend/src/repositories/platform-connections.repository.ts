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
  const generic = await prisma.platformConnection.findMany({ where: { tenantId } });

  const list = [];
  if (meta) {
    list.push({
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
    });
  }

  for (const conn of generic) {
    list.push({
      id: conn.id,
      tenantId: conn.tenantId,
      clientId: null,
      platform: conn.platform,
      accountName: conn.platform,
      accountId: conn.customerId,
      status: 'connected',
      lastSyncAt: conn.updatedAt,
      createdAt: conn.connectedAt,
      updatedAt: conn.updatedAt,
    });
  }

  return list;
}

export async function getPlatformConnection(id: string, tenantId: string) {
  const meta = await prisma.metaConnection.findFirst({ where: { id, tenantId } });
  if (meta) return meta;
  return prisma.platformConnection.findFirst({ where: { id, tenantId } });
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
  const metaCount = await prisma.metaConnection.count({ where: { id, tenantId } });
  if (metaCount > 0) {
    return prisma.metaConnection.update({
      where: { id, tenantId },
      data: { updatedAt: new Date() },
    });
  }
  return prisma.platformConnection.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
}
