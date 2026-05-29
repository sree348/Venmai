import { fetchAndStoreCampaigns } from './meta.fetch.js';
import { fetchAndStoreGoogleCampaigns } from './google.fetch.js';
import { getPlatformConnection } from '../repositories/platform-connections.repository.js';

type SyncResult = {
  rowsUpserted: number;
  message: string;
};

export async function syncPlatformConnection(connectionId: string, tenantId: string): Promise<SyncResult> {
  const connection = await getPlatformConnection(connectionId, tenantId);
  if (!connection) {
    throw new Error('Platform connection was not found for this tenant.');
  }

  if ('platform' in connection && connection.platform === 'Google Ads') {
    const result = await fetchAndStoreGoogleCampaigns(tenantId);
    return {
      rowsUpserted: result.count,
      message: `Google Ads sync completed for ${connectionId}.`,
    };
  } else {
    const result = await fetchAndStoreCampaigns(tenantId);
    return {
      rowsUpserted: result.count,
      message: `Meta Ads sync completed for ${connectionId}.`,
    };
  }
}
