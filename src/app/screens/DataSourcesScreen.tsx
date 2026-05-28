import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { RefreshCw, Settings, Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import PageWrapper from '../components/shared/PageWrapper';

export default function DataSourcesScreen() {
  const {
    dataSources,
    setDataSources,
    setSelectedDataSource,
    setShowDataSourceModal
  } = useApp();

  const [syncing, setSyncing] = useState<number | null>(null);

  const onConnect = (ds: any) => {
    setSelectedDataSource(ds);
    setShowDataSourceModal(true);
  };

  const onConfigure = (ds: any) => {
    setSelectedDataSource(ds);
    setShowDataSourceModal(true);
  };

  const onAddSource = () => {
    setSelectedDataSource(null);
    setShowDataSourceModal(true);
  };

  const handleSync = (dsId: number, dsName: string) => {
    setSyncing(dsId);
    setTimeout(() => {
      setSyncing(null);
      setDataSources((prev: any) =>
        prev.map((ds: any) => (ds.id === dsId ? { ...ds, lastSync: 'Just now', status: 'synced' } : ds))
      );
      toast.success(`${dsName} refreshed!`);
    }, 2000);
  };

  const sc: any = {
    synced: { label: 'Synced', bg: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' },
    warning: { label: 'Stale', bg: 'bg-amber-50 text-amber-700 border-amber-100', dot: 'bg-amber-500' },
    error: { label: 'Error', bg: 'bg-red-50 text-red-700 border-red-100', dot: 'bg-red-500' },
  };

  return (
    <PageWrapper>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Sources</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage connected sources and sync schedules</p>
        </div>
        <button
          onClick={onAddSource}
          className="h-9 px-4 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm transition-all cursor-pointer border-0"
        >
          <Plus className="w-4 h-4" /> Add Source
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dataSources.map((ds: any) => {
          const cfg = sc[ds.status] || sc.synced;
          return (
            <div key={ds.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow relative">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-xl shadow-sm">
                    {ds.emoji}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{ds.name}</p>
                    <p className="text-xs text-slate-400">
                      {ds.type} • {ds.records} records
                    </p>
                  </div>
                </div>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 ${cfg.bg} border rounded-xl text-xs font-bold`}>
                  <span className={`w-1.5 h-1.5 ${cfg.dot} rounded-full`}></span>
                  {cfg.label}
                </span>
              </div>

              {ds.status === 'error' && (
                <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-xl mb-3 text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  Check credentials, token expiry, or API rate limits.
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-4 px-1">
                <span>Last Synced: <strong>{ds.lastSync}</strong></span>
                <span>Active Sync Schedule: <strong>Hourly</strong></span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSync(ds.id, ds.name)}
                  disabled={syncing === ds.id}
                  className="flex-1 h-8 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm transition-all cursor-pointer bg-transparent"
                >
                  <RefreshCw className={`w-3 h-3 ${syncing === ds.id ? 'animate-spin text-indigo-500' : 'text-slate-400'}`} />
                  {syncing === ds.id ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={() => onConfigure(ds)}
                  className="flex-1 h-8 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer bg-transparent"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  Configure
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </PageWrapper>
  );
}
