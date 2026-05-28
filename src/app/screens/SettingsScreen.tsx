import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Building2, Bell, Briefcase, CreditCard, Settings, Plus, RefreshCw, Link2, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import PageWrapper from '../components/shared/PageWrapper';
import ClientAvatar from '../components/shared/ClientAvatar';
import { apiService } from '../../services/api.service';

export default function SettingsScreen() {
  const { CLIENTS: clients } = useApp() as any;

  const [emailAlerts, setEmailAlerts] = useState(true);
  const [slackAlerts, setSlackAlerts] = useState(false);
  const [metaStatus, setMetaStatus] = useState<any>({ connected: false });
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [syncingMeta, setSyncingMeta] = useState(false);

  const loadMetaStatus = async () => {
    setLoadingMeta(true);
    try {
      setMetaStatus(await apiService.getMetaStatus());
    } catch {
      setMetaStatus({ connected: false, error: true });
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    loadMetaStatus();
  }, []);

  const syncMetaNow = async () => {
    setSyncingMeta(true);
    try {
      await apiService.triggerMetaSync();
      toast.success('Meta Ads sync started. Dashboard will update when data is ready.');
      setTimeout(loadMetaStatus, 1500);
    } catch {
      toast.error('Unable to start Meta Ads sync. Check backend auth and Meta connection.');
    } finally {
      setSyncingMeta(false);
    }
  };

  return (
    <PageWrapper>
      <div><h1 className="text-2xl font-bold text-slate-900">Workspace Settings</h1><p className="text-sm text-slate-500 mt-0.5">Venpep Agency workspace configuration</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <SettingsCard title="Agency Details" subtitle="Name, industry, and preferences" icon={<Building2 className="w-4 h-4 text-slate-500" />}>
            <div className="space-y-3">
              <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Agency Name</label><input type="text" defaultValue="Venpep Agency" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20" /></div>
              <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Industry</label><select className="w-full h-9 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white"><option>Digital Marketing Agency</option><option>Growth Agency</option><option>Performance Marketing</option></select></div>
              <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Timezone</label><select className="w-full h-9 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white"><option>UTC+5:30 — India</option><option>UTC+0 — London</option><option>UTC-5 — New York</option></select></div>
              <button onClick={() => toast.success('Agency settings saved!')} className="w-full h-9 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer border-0">Save Changes</button>
            </div>
          </SettingsCard>

          <SettingsCard title="Notifications" subtitle="Alert preferences and delivery" icon={<Bell className="w-4 h-4 text-slate-500" />}>
            {[
              { k: 'email', label: 'Email alerts', sub: 'Campaign performance notifications', val: emailAlerts, set: setEmailAlerts },
              { k: 'slack', label: 'Slack integration', sub: 'Push alerts to Slack', val: slackAlerts, set: setSlackAlerts },
            ].map(item => (
              <div key={item.k} className="flex items-center justify-between py-2.5">
                <div><p className="text-sm font-semibold text-slate-900">{item.label}</p><p className="text-xs text-slate-400">{item.sub}</p></div>
                <div onClick={() => { item.set(!item.val); toast.success(`${item.label} ${!item.val ? 'enabled' : 'disabled'}`); }}
                  className={`w-10 h-6 rounded-full cursor-pointer transition-colors relative ${item.val ? 'bg-slate-900' : 'bg-slate-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${item.val ? 'left-[18px]' : 'left-0.5'}`}></div>
                </div>
              </div>
            ))}
          </SettingsCard>

          <SettingsCard title="Meta Ads Connection" subtitle="OAuth connection and live campaign sync" icon={<Link2 className="w-4 h-4 text-blue-500" />}>
            {loadingMeta ? (
              <div className="h-20 rounded-xl bg-slate-50 border border-slate-100 animate-pulse" />
            ) : metaStatus.connected ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-sm font-bold text-emerald-800">Meta Ads connected</p>
                  <p className="text-xs text-emerald-700 mt-1">Ad accounts: {metaStatus.adAccountCount || 0}</p>
                  <p className="text-xs text-emerald-700">Connected: {metaStatus.connectedAt ? new Date(metaStatus.connectedAt).toLocaleString() : 'Unknown'}</p>
                  <p className="text-xs text-emerald-700">Token expires: {metaStatus.expiresAt ? new Date(metaStatus.expiresAt).toLocaleString() : 'Unknown'}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={syncMetaNow} disabled={syncingMeta} className="flex-1 h-9 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer border-0">
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingMeta ? 'animate-spin' : ''}`} />
                    {syncingMeta ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button onClick={() => toast.info('Disconnect is available through the backend DELETE /auth/meta/disconnect endpoint.')} className="h-9 px-3 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 flex items-center gap-2 cursor-pointer bg-white">
                    <Unplug className="w-3.5 h-3.5" /> Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <p className="text-sm font-bold text-blue-900">Connect Meta Ads to fetch live campaign data</p>
                  <p className="text-xs text-blue-700 mt-1">After OAuth, the backend fetches campaigns immediately and pushes a live dashboard update.</p>
                </div>
                <button onClick={() => apiService.connectMetaAds()} className="w-full h-9 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer border-0">
                  Connect Meta Ads
                </button>
              </div>
            )}
          </SettingsCard>
        </div>

        <div className="space-y-4">
          <SettingsCard title="Client Management" subtitle="Manage client accounts and access" icon={<Briefcase className="w-4 h-4 text-slate-500" />}>
            {clients.map((client: any) => (
              <div key={client.id} className={`flex items-center gap-3 p-3 rounded-xl border ${client.lightBg} ${client.lightBorder}`}>
                <ClientAvatar client={client} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${client.textColor} truncate`}>{client.name}</p>
                  <p className="text-[10px] text-slate-400">{client.retainer} · {client.accountManager}</p>
                </div>
                <button className="w-7 h-7 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 flex items-center justify-center cursor-pointer"><Settings className="w-3 h-3 text-slate-500" /></button>
              </div>
            ))}
            <button className="w-full h-8 border-2 border-dashed border-slate-200 rounded-xl text-xs font-semibold text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-white">
              <Plus className="w-3.5 h-3.5" /> Add New Client
            </button>
          </SettingsCard>

          <SettingsCard title="Billing" subtitle="Plan and subscription" icon={<CreditCard className="w-4 h-4 text-slate-500" />}>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 mb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-slate-900">Agency Plan</p>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-200">Free</span>
              </div>
              <p className="text-xs text-slate-500">{clients.length} clients · All core features</p>
            </div>
            <button onClick={() => toast.info('Upgrade page coming soon!')} className="w-full h-9 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer border-0">
              Upgrade to Pro Agency
            </button>
          </SettingsCard>
        </div>
      </div>
    </PageWrapper>
  );
}

function SettingsCard({ title, subtitle, icon, children }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">{icon}</div>
        <div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="text-[11px] text-slate-400">{subtitle}</p></div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
