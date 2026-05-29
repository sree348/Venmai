import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { RefreshCw, Settings, Plus } from 'lucide-react';
import { toast } from 'sonner';
import PageWrapper from '../components/shared/PageWrapper';
import { apiService } from '../../services/api.service';

export default function IntegrationsScreen() {
  const {
    integrations,
    setIntegrations,
    setSelectedConnector,
    setShowConnectorModal
  } = useApp();

  const { CLIENTS: clients } = useApp() as any;

  const [syncing, setSyncing] = useState<number | null>(null);

  const categories = [
    { id: 'social', name: 'Social Advertising', icon: '📱' },
    { id: 'search', name: 'Search Advertising', icon: '🔍' },
    { id: 'analytics', name: 'Analytics & Attribution', icon: '📊' },
    { id: 'ecommerce', name: 'E-Commerce & CRM', icon: '🛍️' },
  ];

  const connectedCount = integrations.filter((ig: any) => ig.connected).length;
  const totalCount = integrations.length;
  const pct = Math.round((connectedCount / totalCount) * 100);

  const onConnect = (ig: any) => {
    if (ig.name === 'Meta Ads' && !ig.connected && !apiService.isMockMode) {
      apiService.connectMetaAds();
      return;
    }
    if (ig.name === 'Google Ads' && !ig.connected && !apiService.isMockMode) {
      apiService.connectGoogleAds();
      return;
    }

    setSelectedConnector(ig);
    setShowConnectorModal(true);
  };

  const onConfigure = (ig: any) => {
    setSelectedConnector(ig);
    setShowConnectorModal(true);
  };

  const handleSync = async (igId: number, igName: string) => {
    const integration = integrations.find((ig: any) => ig.id === igId);
    setSyncing(igId);

    try {
      if (integration?.backendConnectionId) {
        await apiService.syncPlatformConnection(integration.backendConnectionId);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }

      setSyncing(null);
      setIntegrations((prev: any) =>
        prev.map((ig: any) => (ig.id === igId ? { ...ig, lastSync: 'Just now', connected: true } : ig))
      );
      toast.success(`${igName} sync complete. Dashboards, AI, and reports are refreshed.`);
    } catch (error) {
      setSyncing(null);
      toast.error(`${igName} sync failed. Check backend logs or credentials.`);
    }
  };

  return (
    <PageWrapper>
      {/* Header with progress */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {connectedCount} connected platforms · 100+ available in next phase
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm min-w-56">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-slate-700">Scope Connected</span>
              <span className="font-bold text-slate-900">{connectedCount} / {totalCount}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 p-1 px-1.5 rounded-lg">{pct}%</span>
        </div>
      </div>

      {categories.map(cat => {
        const catItems = integrations.filter((ig: any) => ig.category === cat.name);
        const catConnected = catItems.filter((ig: any) => ig.connected).length;

        return (
          <div key={cat.id} className="space-y-3 mb-8">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-200/60">
              <span className="text-lg">{cat.icon}</span>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{cat.name}</h2>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md ml-1">
                {catConnected} connected
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {catItems.map((ig: any) => (
                <div
                  key={ig.id}
                  onClick={() => onConnect(ig)}
                  className={`bg-white rounded-2xl border transition-all hover:shadow-md p-4 relative cursor-pointer ${
                    ig.connected ? 'border-slate-300' : 'border-slate-200 opacity-90'
                  }`}
                >
                  <span className={`absolute top-3 right-3 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    ig.connected
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}>
                    {ig.connected ? 'Connected' : 'Not Connected'}
                  </span>

                  <div className="flex items-start gap-3.5 mb-3.5">
                    <div className="text-2xl w-11 h-11 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center shadow-sm">
                      {ig.emoji}
                    </div>
                    <div className="min-w-0 flex-1 pr-24">
                      <h3 className="font-bold text-slate-900 text-sm truncate">{ig.name}</h3>
                      <p className="text-xs text-slate-400 truncate">{ig.desc}</p>
                    </div>
                  </div>

                  {/* Configured Clients */}
                  {ig.connected && ig.clients && ig.clients.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {ig.clients.map((name: string) => {
                        const client = clients.find((c: any) => c.name === name);
                        return client ? (
                          <span
                            key={name}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-bold ${client.lightBg} ${client.textColor} ${client.lightBorder} border`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${client.dotColor}`}></span>
                            {name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}

                  {/* Integrations Metrics */}
                  {ig.connected && (
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-100 rounded-xl p-2.5 mb-4 text-center">
                      <div>
                        <p className="text-[9px] text-slate-400 font-semibold mb-0.5">Campaigns</p>
                        <p className="text-xs font-bold text-slate-800 font-['JetBrains_Mono']">
                          {ig.campaigns || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 font-semibold mb-0.5">Spend</p>
                        <p className="text-xs font-bold text-slate-800 font-['JetBrains_Mono']">
                          {ig.spend ? `₹${(ig.spend / 1000).toFixed(1)}k` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 font-semibold mb-0.5">Last Sync</p>
                        <p className="text-xs font-bold text-slate-800 truncate">{ig.lastSync}</p>
                      </div>
                    </div>
                  )}

                  {!ig.connected && (
                    <div className="flex flex-wrap gap-1 mb-4 h-16 items-center">
                      {ig.points && ig.points.map((pt: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-[9px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 p-1 px-1.5 rounded-lg"
                        >
                          • {pt}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {ig.connected ? (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); handleSync(ig.id, ig.name); }}
                          disabled={syncing === ig.id}
                          className="flex-1 h-8 bg-white border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm transition-all cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${syncing === ig.id ? 'animate-spin text-indigo-500' : 'text-slate-400'}`} />
                          {syncing === ig.id ? 'Syncing...' : 'Sync'}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onConfigure(ig); }}
                          className="h-8 w-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center hover:bg-slate-50 shadow-sm transition-all text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); onConnect(ig); }}
                        className="w-full h-8 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 shadow-sm transition-all flex items-center justify-center gap-1 cursor-pointer border-0"
                      >
                        <Plus className="w-3 h-3 stroke-[3px]" /> Connect Platform
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </PageWrapper>
  );
}
