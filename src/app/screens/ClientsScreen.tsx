import { useApp } from '../context/AppContext';
import {
  ChevronRight, ArrowRight, LayoutDashboard, Clock, Plus
} from 'lucide-react';
import PageWrapper from '../components/shared/PageWrapper';
import ClientBadge from '../components/shared/ClientBadge';
import ClientAvatar from '../components/shared/ClientAvatar';
import StatusBadge from '../components/shared/StatusBadge';
import PlatformDot from '../components/shared/PlatformDot';

export default function ClientsScreen() {
  const {
    campaigns, dashboards, selectedClientId, setSelectedClientId, setActiveView, setViewMode, setSelectedDashboard
  } = useApp();

  const { CLIENTS: clients } = useApp() as any; // Loaded from context constants

  const activeClient = selectedClientId ? clients.find((c: any) => c.id === selectedClientId) : null;

  const onViewDashboards = (clientId: string) => {
    setSelectedClientId(clientId);
    setActiveView('dashboards');
    setSelectedDashboard(null);
  };

  const onViewCampaigns = (clientId: string) => {
    setSelectedClientId(clientId);
    setActiveView('campaigns');
    setViewMode('list');
  };

  if (activeClient) {
    const cc = campaigns.filter((c: any) => c.clientId === activeClient.id);
    const cd = dashboards.filter((d: any) => d.clientId === activeClient.id);
    const spend = cc.reduce((s: number, c: any) => s + c.spend, 0);
    const clicks = cc.reduce((s: number, c: any) => s + Number(c.clicks || 0), 0);
    const avgCpc = clicks > 0 ? spend / clicks : (cc.filter((c: any) => typeof c.cpc === 'number').reduce((sum, c) => sum + Number(c.cpc), 0) / (cc.filter((c: any) => typeof c.cpc === 'number').length || 1));
    const conv = cc.reduce((s: number, c: any) => s + c.conv, 0);

    return (
      <PageWrapper>
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => setSelectedClientId(null)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-semibold transition-colors">
            <ChevronRight className="w-3.5 h-3.5 rotate-180" /> All Clients
          </button>
          <span className="text-slate-300">/</span>
          <ClientBadge client={activeClient} />
        </div>

        {/* Client Header */}
        <div className={`bg-gradient-to-br ${activeClient.color} rounded-2xl p-6 text-white relative overflow-hidden`}>
          <div className="absolute right-0 top-0 w-48 h-48 bg-white/5 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute right-12 bottom-0 w-24 h-24 bg-white/5 rounded-full translate-y-8"></div>
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white text-xl font-black border border-white/20">
                  {activeClient.avatar}
                </div>
                <div>
                  <h1 className="text-2xl font-black">{activeClient.name}</h1>
                  <p className="text-white/70 text-sm">{activeClient.industry}</p>
                  <p className="text-white/60 text-xs mt-0.5">Client since {activeClient.since}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white/70 text-xs font-semibold">Monthly Retainer</p>
                <p className="text-xl font-black">{activeClient.retainer}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { k: 'Ad Spend', v: `$${(spend / 1000).toFixed(1)}k` },
                { k: 'Avg CPC', v: `₹${avgCpc.toFixed(2)}` },
                { k: 'Conversions', v: conv },
                { k: 'Campaigns', v: cc.length },
              ].map(m => (
                <div key={m.k} className="bg-white/15 backdrop-blur rounded-xl p-3 border border-white/20">
                  <p className="text-white/60 text-[10px] font-semibold">{m.k}</p>
                  <p className="text-white font-black text-lg font-['JetBrains_Mono']">{m.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Account Details</h3>
            {[
              { k: 'Account Manager', v: activeClient.accountManager },
              { k: 'Industry', v: activeClient.industry },
              { k: 'Monthly Budget', v: `$${(activeClient.monthlyBudget / 1000).toFixed(0)}k` },
              { k: 'Retainer', v: activeClient.retainer },
              { k: 'Client Since', v: activeClient.since },
              { k: 'Status', v: activeClient.status.charAt(0).toUpperCase() + activeClient.status.slice(1) },
            ].map(row => (
              <div key={row.k} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-xs text-slate-500">{row.k}</span>
                <span className="text-xs font-bold text-slate-900">{row.v}</span>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Campaigns</h3>
            <div className="space-y-2.5">
              {cc.map((campaign: any) => (
                <div key={campaign.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <PlatformDot platform={campaign.channel} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{campaign.name}</p>
                    <p className="text-[10px] text-slate-400">{campaign.channel}</p>
                  </div>
                  <StatusBadge status={campaign.status} small />
                </div>
              ))}
            </div>
            <button onClick={() => onViewCampaigns(activeClient.id)} className="w-full mt-3 h-8 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
              View All Campaigns <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Dashboards</h3>
            <div className="space-y-2.5">
              {cd.map((d: any) => (
                <div key={d.id} className={`p-2.5 rounded-xl border bg-gradient-to-r ${d.color} border-slate-200`}>
                  <p className="text-xs font-bold text-slate-900">{d.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><LayoutDashboard className="w-2.5 h-2.5" />{d.widgets} widgets</span>
                    {d.schedule && <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{d.schedule}</span>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => onViewDashboards(activeClient.id)} className="w-full mt-3 h-8 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
              View Dashboards <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  // All clients list
  return (
    <PageWrapper>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Accounts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Venpep manages {clients.length} active client accounts</p>
        </div>
        <button onClick={() => setActiveView('settings')} className="h-9 px-4 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {clients.map((client: any) => {
          const cc = campaigns.filter((c: any) => c.clientId === client.id);
          const cd = dashboards.filter((d: any) => d.clientId === client.id);
          const spend = cc.reduce((s: number, c: any) => s + c.spend, 0);
          const clicks = cc.reduce((s: number, c: any) => s + Number(c.clicks || 0), 0);
          const avgCpc = clicks > 0 ? spend / clicks : (cc.filter((c: any) => typeof c.cpc === 'number').reduce((sum, c) => sum + Number(c.cpc), 0) / (cc.filter((c: any) => typeof c.cpc === 'number').length || 1));
          return (
            <div key={client.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-all cursor-pointer group" onClick={() => setSelectedClientId(client.id)}>
              <div className={`h-1 bg-gradient-to-r ${client.color}`}></div>
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <ClientAvatar client={client} size="md" />
                    <div>
                      <p className="text-base font-bold text-slate-900">{client.name}</p>
                      <p className="text-xs text-slate-400">{client.industry}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={client.status} small />
                    <p className="text-[10px] text-slate-400 mt-1">Since {client.since}</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2.5 mb-4">
                  {[
                    { k: 'Spend', v: `$${(spend / 1000).toFixed(1)}k` },
                    { k: 'Avg CPC', v: `₹${avgCpc.toFixed(2)}` },
                    { k: 'Campaigns', v: cc.length },
                    { k: 'Dashboards', v: cd.length },
                  ].map(m => (
                    <div key={m.k} className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-[9px] text-slate-400 font-semibold mb-0.5">{m.k}</p>
                      <p className={`text-sm font-bold font-['JetBrains_Mono'] ${(m as any).color || 'text-slate-900'}`}>{m.v}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-600">
                      {client.accountManager.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <span className="text-[11px] text-slate-500">{client.accountManager}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {client.platforms.map((p: string) => <PlatformDot key={p} platform={p} />)}
                    <span className="text-[10px] text-slate-400 ml-1">{client.retainer}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 ml-1 transition-colors" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PageWrapper>
  );
}
