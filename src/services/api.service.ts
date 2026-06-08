import { buildMockChatResponse, mockCampaigns, mockClients, mockSpendTrend30Days } from './mock-data';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';
const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';
const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'agency';
const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN || '';
export const SOCKET_URL = API_URL.replace(/\/api\/v1\/?$/, '');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
      ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function streamRequest(
  path: string,
  options: RequestInit,
  handlers: {
    onToken: (token: string) => void;
    onDone: (payload: any) => void;
    onError?: (error: Error) => void;
  },
) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
      ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok || !response.body) {
    throw new Error(`API stream failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushEvent = (rawEvent: string) => {
    const eventLine = rawEvent.split('\n').find(line => line.startsWith('event:'));
    const dataLine = rawEvent.split('\n').find(line => line.startsWith('data:'));
    if (!dataLine) return;

    const event = eventLine?.replace(/^event:\s*/, '').trim() || 'message';
    const rawData = dataLine.replace(/^data:\s*/, '').trim();

    try {
      const payload = JSON.parse(rawData);
      if (event === 'token') {
        handlers.onToken(payload.token || '');
      } else if (event === 'done') {
        handlers.onDone(payload);
      } else if (event === 'error') {
        handlers.onError?.(new Error(payload.error || 'Stream error'));
      }
    } catch (error: any) {
      handlers.onError?.(error);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    events.forEach(flushEvent);
  }

  if (buffer.trim()) {
    flushEvent(buffer);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export const apiService = {
  isMockMode: MOCK_MODE,
  tenantId: TENANT_ID,
  apiUrl: API_URL,

  async getClients() {
    if (MOCK_MODE) return clone(mockClients);
    return request(`/clients?tenantId=${encodeURIComponent(TENANT_ID)}`);
  },

  async getCampaigns(clientId?: string | null) {
    if (MOCK_MODE) return clone(mockCampaigns);
    const search = new URLSearchParams({ tenantId: TENANT_ID });
    if (clientId) search.set('clientId', clientId);
    return request(`/campaigns?${search.toString()}`);
  },

  async getSpendTrend(clientId?: string | null) {
    if (MOCK_MODE) return clone(mockSpendTrend30Days);
    const search = new URLSearchParams({ tenantId: TENANT_ID, range: '30d' });
    if (clientId) search.set('clientId', clientId);
    return request(`/analytics/spend-trend?${search.toString()}`);
  },

  async getMetaStatus() {
    if (MOCK_MODE) {
      return { connected: false, connectedAt: null, expiresAt: null, adAccountCount: 0 };
    }

    return request('/auth/meta/status');
  },

  connectMetaAds() {
    window.location.href = `${API_URL}/auth/meta/connect?tenantId=${encodeURIComponent(TENANT_ID)}`;
  },

  connectGoogleAds() {
    window.location.href = `${API_URL}/auth/google/connect?tenantId=${encodeURIComponent(TENANT_ID)}`;
  },

  async triggerMetaSync() {
    if (MOCK_MODE) return { status: 'started' };

    return request('/sync/trigger', {
      method: 'POST',
      body: JSON.stringify({ tenantId: TENANT_ID }),
    });
  },

  async getDashboardSummary(params: { clientId?: string | null; from: string; to: string }) {
    if (MOCK_MODE) {
      const campaigns = params.clientId ? mockCampaigns.filter(c => c.clientId === params.clientId) : mockCampaigns;
      const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
      const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
      const totalConversions = campaigns.reduce((sum, c) => sum + c.conv, 0);

      return {
        totalSpend,
        cpc: totalClicks === 0 ? null : totalSpend / totalClicks,
        totalClicks,
        avgFrequency: campaigns.reduce((sum, c) => sum + c.frequency, 0) / (campaigns.length || 1),
        totalConversions,
        blendedRoas: totalClicks === 0 ? null : totalSpend / totalClicks, // Return CPC
        currency: 'INR',
      };
    }

    const search = new URLSearchParams({ from: params.from, to: params.to });
    if (params.clientId) search.set('clientId', params.clientId);
    return request(`/dashboard/summary?${search.toString()}`);
  },

  async getTopCampaigns(params: { clientId?: string | null; from: string; to: string; limit?: number }) {
    if (MOCK_MODE) {
      return [...(params.clientId ? mockCampaigns.filter(c => c.clientId === params.clientId) : mockCampaigns)]
        .sort((a, b) => b.spend - a.spend)
        .slice(0, params.limit || 5);
    }

    const search = new URLSearchParams({ from: params.from, to: params.to, limit: String(params.limit || 5) });
    if (params.clientId) search.set('clientId', params.clientId);
    return request(`/dashboard/top-campaigns?${search.toString()}`);
  },

  async getDashboardCampaigns(params: { clientId?: string | null; from: string; to: string; status?: string; platform?: string }) {
    if (MOCK_MODE) {
      // In mock mode return ALL campaigns for the client regardless of date range
      const campaigns = params.clientId ? mockCampaigns.filter(c => c.clientId === params.clientId) : mockCampaigns;
      return campaigns;
    }

    const search = new URLSearchParams({ from: params.from, to: params.to });
    if (params.clientId) search.set('clientId', params.clientId);
    if (params.status) search.set('status', params.status);
    if (params.platform) search.set('platform', params.platform);
    return request(`/dashboard/campaigns?${search.toString()}`);
  },

  async getLastSynced(clientId?: string | null, platform?: string) {
    if (MOCK_MODE) {
      return { lastSyncedAt: new Date().toISOString(), campaignCount: mockCampaigns.length, dataFrom: null, dataTo: null };
    }

    const search = new URLSearchParams();
    if (clientId) search.set('clientId', clientId);
    if (platform) search.set('platform', platform);
    return request(`/dashboard/last-synced?${search.toString()}`);
  },

  async getMonthlyTrend(params: { clientId?: string | null; from: string; to: string; platform?: string }) {
    if (MOCK_MODE) return [];

    const search = new URLSearchParams({ from: params.from, to: params.to });
    if (params.clientId) search.set('clientId', params.clientId);
    if (params.platform) search.set('platform', params.platform);
    return request(`/dashboard/monthly-trend?${search.toString()}`);
  },

  async getPlatformConnections() {
    if (MOCK_MODE) return [];
    return request(`/platform-connections?tenantId=${encodeURIComponent(TENANT_ID)}`);
  },

  async savePlatformConnection(connection: any) {
    if (MOCK_MODE) return { id: connection.id, platform: connection.name, status: 'connected' };

    return request('/platform-connections', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: TENANT_ID,
        platform: connection.name,
        accountName: connection.name,
        accountId: connection.accountId,
        credentials: connection.credentials || {},
      }),
    });
  },

  async syncPlatformConnection(connectionId: string) {
    if (MOCK_MODE) return { rowsUpserted: 0, message: 'Mock sync complete.' };

    return request(`/platform-connections/${connectionId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ tenantId: TENANT_ID }),
    });
  },

  async getAdSets(campaignId: string) {
    if (MOCK_MODE) return [];
    return request<any[]>(`/adsets?campaignId=${encodeURIComponent(campaignId)}`);
  },

  async getAds(adsetId: string) {
    if (MOCK_MODE) return [];
    return request<any[]>(`/ads?adsetId=${encodeURIComponent(adsetId)}`);
  },

  async chat(prompt: string, tenantId: string, history: { role: string; content: string }[], pageContext?: any) {
    if (MOCK_MODE) return clone(buildMockChatResponse(prompt, pageContext));

    return request<{ widget: any; insight: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt, tenantId, clientId: tenantId, history, pageContext }),
    });
  },

  async streamChat(
    prompt: string,
    tenantId: string,
    history: { role: string; content: string }[],
    pageContext: any,
    handlers: {
      onToken: (token: string) => void;
      onDone: (payload: any) => void;
      onError?: (error: Error) => void;
    },
  ) {
    if (MOCK_MODE) {
      const response = clone(buildMockChatResponse(prompt, pageContext));
      handlers.onToken(response.insight);
      handlers.onDone(response);
      return;
    }

    return streamRequest('/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt, tenantId, clientId: tenantId, history, pageContext, stream: true }),
    }, handlers);
  },

  async getChatHistory(clientId: string) {
    if (MOCK_MODE) return [];
    return request<any[]>(`/chat/history?clientId=${encodeURIComponent(clientId)}`);
  },

  async clearChatHistory(clientId: string) {
    if (MOCK_MODE) return { success: true };
    return request<any>(`/chat/history?clientId=${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    });
  },

  async getBrainInsights(clientId?: string | null) {
    if (MOCK_MODE) {
      return [
        {
          id: 'mock-1',
          tenantId: clientId || 'agency',
          type: 'warning',
          priority: 'critical',
          title: 'CAI MARCH BENEFITS 2026 Frequency Warning',
          body: 'The frequency has reached 4.1. This is above the fatigue threshold of 3.0, leading to a rise in CPC to ₹372.90.',
          campaignName: 'Cai_Mahindra_March_XEV_9S_Campaign',
          metric: 'frequency',
          currentValue: 4.1,
          threshold: 3.0,
          confidence: 0.95,
          suggestedAction: 'Pause fatigue creative to rescue conversions.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'mock-2',
          tenantId: clientId || 'agency',
          type: 'opportunity',
          priority: 'warning',
          title: 'CAI March 2026 XUV 7XO Scale Budget',
          body: 'CPC is at ₹1.24, which is well below the benchmark of ₹4.00. We should scale budget to drive more high-value leads.',
          campaignName: 'CAI March 2026 XUV 7XO',
          metric: 'cpc',
          currentValue: 1.24,
          threshold: 4.0,
          confidence: 0.9,
          suggestedAction: 'Scale budget to capture higher volume.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      ];
    }
    const search = new URLSearchParams();
    if (clientId) search.set('clientId', clientId);
    return request<any[]>(`/brain/insights?${search.toString()}`);
  },

  async getBrainScores(clientId?: string | null) {
    if (MOCK_MODE) {
      return [
        { id: '1', campaignName: 'CAI MARCH BENEFITS 2026', score: 85, trend: 'up' },
        { id: '2', campaignName: 'CAI March 2026 XUV 7XO', score: 92, trend: 'up' },
        { id: '3', campaignName: 'Cai_Mahindra_March_XEV_9S_Campaign', score: 32, trend: 'down' },
        { id: '4', campaignName: 'Cai_Mahindra_XEV_9S_Mk_2026', score: 58, trend: 'stable' },
        { id: '5', campaignName: 'Cai_Mahindra_XEV_DEC_Mk_2026', score: 45, trend: 'stable' },
        { id: '6', campaignName: 'CAI 2026 Commercial JAN MK', score: 48, trend: 'stable' },
        { id: '7', campaignName: 'CAI 2026 XUV 7XO', score: 62, trend: 'up' },
        { id: '8', campaignName: 'Mahindra BE 6 Launch — Google Search', score: 78, trend: 'up' },
        { id: '9', campaignName: 'Mahindra XUV — YouTube TrueView', score: 55, trend: 'stable' },
        { id: '10', campaignName: 'CAI Bolero Retargeting — Meta DPA', score: 95, trend: 'up' },
      ];
    }
    const search = new URLSearchParams();
    if (clientId) search.set('clientId', clientId);
    return request<any[]>(`/brain/scores?${search.toString()}`);
  },

  async triggerBrainSync(clientId: string) {
    if (MOCK_MODE) return { success: true };
    return request('/brain/sync', {
      method: 'POST',
      body: JSON.stringify({ clientId }),
    });
  },

  // Notification API helpers
  async getNotifications(clientId?: string | null) {
    if (MOCK_MODE) return { notifications: [], unreadCount: 0 };
    const search = new URLSearchParams();
    if (clientId) search.set('clientId', clientId);
    return request(`/notifications?${search.toString()}`);
  },

  async markNotificationAsRead(id: string) {
    if (MOCK_MODE) return { success: true };
    return request(`/notifications/${id}/read`, { method: 'POST' });
  },

  async markAllNotificationsRead() {
    if (MOCK_MODE) return { success: true };
    return request('/notifications/read-all', { method: 'POST' });
  },

  async getAgencyAiSummary(clientId?: string | null) {
    if (MOCK_MODE) {
      return {
        headline: `Lead Generation Performance: ₹48.5k Spend yielding 453 Leads`,
        overview: `CAI Mahindra campaigns spent a combined ₹48,536 over the last 30 days, generating 453 conversions at an average Cost Per Click of ₹4.14. Meta remains the dominant channel driving lead volume.`,
        topWin: `The best-performing campaign by CPC is "CAI MARCH BENEFITS 2026" with optimized click efficiency and strong acquisition costs.`,
        biggestRisk: `The campaign "Cai_Mahindra_March_XEV_9S_Campaign" displays the highest CPC or zero conversion inefficiency, signaling potential creative fatigue or audience mismatch.`,
        recommendation: `Relocate 15-20% of budget from Cai_Mahindra_March_XEV_9S_Campaign into high-CTR broad core campaigns, and pause any creatives with frequency above 3.0.`,
        budgetHealth: `Budget health has warning signs: 1 campaign(s) are spending without conversions.`,
        keyMetrics: [
          { label: 'Spend', value: `₹48.5k`, status: 'success' },
          { label: 'Average CPC', value: `₹4.14`, status: 'success' },
          { label: 'Conversions', value: '453', status: 'success' },
          { label: 'Campaigns Count', value: '3', status: 'success' },
        ],
      };
    }
    return request('/agency/ai-summary', {
      method: 'POST',
      body: JSON.stringify({ tenantId: TENANT_ID, clientId, dateRange: 'last_30_days' }),
    });
  },

  async generateAgencyReport() {
    if (MOCK_MODE) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return {
        downloadUrl: `${API_URL}/agency/report/mock-download`,
        shareLink: `https://app.marketiq.com/report/share/mock-share-token`,
        reportId: 'mock-report-id',
      };
    }
    return request<{ downloadUrl: string; shareLink: string; reportId: string }>('/agency/report', {
      method: 'POST',
    });
  },

  async listAgencyReports() {
    if (MOCK_MODE) {
      return { reports: [] as Array<{ id: string; name: string; createdAt: string; downloadUrl: string; shareLink: string; expiresAt: string }> };
    }
    return request<{ reports: Array<{ id: string; name: string; createdAt: string; downloadUrl: string; shareLink: string; expiresAt: string }> }>('/agency/reports');
  },

  async getAgencyReportBreakdowns(params: { clientId?: string; dateFrom: string; dateTo: string }) {
    if (MOCK_MODE) {
      return { locations: [], ageGroups: [], genders: [], leadStatus: null };
    }
    const search = new URLSearchParams({
      clientId: params.clientId || 'cai_mahindra',
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });
    return request<{ locations: any[]; ageGroups: any[]; genders: any[]; leadStatus: any }>(`/agency/report-breakdowns?${search.toString()}`);
  },
};
