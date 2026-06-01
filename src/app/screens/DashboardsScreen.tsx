import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAgentStore } from '../../stores/agentStore';
import { X, Plus, ChevronRight, Star, LayoutDashboard, Clock, Mail } from 'lucide-react';
import PageWrapper from '../components/shared/PageWrapper';
import ClientBadge from '../components/shared/ClientBadge';
import ClientAvatar from '../components/shared/ClientAvatar';
import PlatformDot from '../components/shared/PlatformDot';

export default function DashboardsScreen() {
  const {
    scopedDashboards: dashboards,
    dashboards: allDashboards,
    setDashboards,
    activeClient,
    selectedClientId,
    setSelectedClientId,
    setShowDashboardModal,
    setSelectedDashboard: onViewDashboard,
  } = useApp();

  const { setPageContext } = useAgentStore();

  useEffect(() => {
    setPageContext({
      page: 'dashboards',
      data: {
        totalDashboards: dashboards.length,
        dashboards: dashboards.map((d: any) => ({
          name: d.name,
          description: d.description,
          platform: d.platform || 'Multi-platform',
          widgets: d.widgets,
          schedule: d.schedule,
        }))
      }
    });
  }, [dashboards, setPageContext]);

  // Get CLIENTS from context constant
  const { CLIENTS: clients } = useApp() as any;

  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDashboards(allDashboards.map((d: any) => d.id === id ? { ...d, favorite: !d.favorite } : d));
  };

  // Group dashboards by client
  const dashboardsByClient = clients.map((client: any) => ({
    client,
    items: dashboards.filter((d: any) => d.clientId === client.id),
  })).filter((g: any) => g.items.length > 0);

  const totalDashboards = dashboards.length;
  const showClientGrouping = dashboardsByClient.length > 1 || !!selectedClientId;

  return (
    <PageWrapper>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboards</h1>
          <div className="text-sm text-slate-500 mt-0.5">
            {selectedClientId && activeClient ? (
              <span className="flex items-center gap-1">
                Showing <ClientBadge client={activeClient} /> dashboards
              </span>
            ) : (
              `${totalDashboards} dashboard${totalDashboards !== 1 ? 's' : ''}${dashboardsByClient.length > 1 ? ` across ${dashboardsByClient.length} clients` : ''}`
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedClientId && (
            <button onClick={() => setSelectedClientId(null)} className="h-9 px-3 border border-slate-200 bg-white rounded-xl text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm cursor-pointer">
              <X className="w-3 h-3" /> Clear Filter
            </button>
          )}
          <button onClick={() => setShowDashboardModal(true)} className="h-9 px-4 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm cursor-pointer">
            <Plus className="w-4 h-4" /> New Dashboard
          </button>
        </div>
      </div>

      {/* Client Filter Pills */}
      {!selectedClientId && clients.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 font-semibold">Filter by client:</span>
          {clients.map((client: any) => {
            const count = allDashboards.filter((d: any) => d.clientId === client.id).length;
            return (
              <button key={client.id} onClick={() => setSelectedClientId(client.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all hover:shadow-sm cursor-pointer ${client.lightBg} ${client.lightBorder} ${client.textColor}`}>
                <span className={`w-2 h-2 rounded-full ${client.dotColor}`}></span>
                {client.name}
                <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {dashboards.length === 0 && (
        <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-slate-100 bg-white rounded-3xl shadow-sm max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-[#6366F1] mb-5 animate-pulse shadow-inner">
            <LayoutDashboard className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">No Dashboards Created</h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mb-6">
            {selectedClientId && activeClient 
              ? `There are no ad performance dashboards created for ${activeClient.name} yet. Create one to track conversions, spend, and CPC trends.`
              : 'There are no dashboards configured in this workspace. Create your first dashboard to get started.'}
          </p>
          <button
            onClick={() => setShowDashboardModal(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-xl text-xs font-bold hover:scale-[1.03] active:scale-[0.98] transition-transform shadow-md cursor-pointer border-0"
          >
            Create First Dashboard
          </button>
        </div>
      )}

      {/* Dashboards grouped by client */}
      {dashboardsByClient.map(({ client, items }: any) => (
        <div key={client.id} className="space-y-3">
          {/* Client Section Header */}
          {showClientGrouping && <div className={`flex items-center justify-between p-3.5 rounded-xl border mb-3 ${client.lightBg} ${client.lightBorder}`}>
            <div className="flex items-center gap-3">
              <ClientAvatar client={client} size="sm" />
              <div>
                <p className={`text-sm font-bold ${client.textColor}`}>{client.name}</p>
                <p className="text-[11px] text-slate-500">{client.industry} · {items.length} dashboard{items.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                {client.platforms.map((p: string) => <PlatformDot key={p} platform={p} />)}
              </div>
              <button
                onClick={() => setSelectedClientId(selectedClientId === client.id ? null : client.id)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1 cursor-pointer"
              >
                {selectedClientId === client.id ? 'Show all' : 'Filter'} <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
            {items.map((d: any) => (
              <DashboardCard key={d.id} dashboard={d} client={client} onView={() => onViewDashboard(d.id)} onToggleFav={toggleFavorite} />
            ))}
            {/* Add dashboard for this client */}
            <button onClick={() => { setSelectedClientId(client.id); setShowDashboardModal(true); }}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl p-6 hover:border-slate-300 hover:bg-slate-50 transition-all text-slate-400 hover:text-slate-600 min-h-[120px] cursor-pointer">
              <Plus className="w-5 h-5" />
              <p className="text-xs font-semibold">Add Dashboard</p>
            </button>
          </div>
        </div>
      ))}
    </PageWrapper>
  );
}

function DashboardCard({ dashboard: d, client, onView, onToggleFav }: any) {
  return (
    <div onClick={onView} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-slate-300 hover:shadow-md transition-all cursor-pointer group">
      <div className={`h-24 bg-gradient-to-br ${d.color} flex items-end justify-between p-3 relative`}>
        <LayoutDashboard className="absolute top-3 left-3 w-8 h-8 text-slate-300/60" />
        {d.schedule && (
          <div className="flex items-center gap-1 px-2 py-1 bg-white/80 text-slate-700 rounded-lg text-[9px] font-bold">
            <Clock className="w-2 h-2" />{d.schedule}
          </div>
        )}
        <button onClick={e => onToggleFav(d.id, e)} className="ml-auto w-6 h-6 bg-white/80 rounded-md flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
          <Star className={`w-3 h-3 ${d.favorite ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
        </button>
      </div>
      <div className="p-3.5">
        {client && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`w-2 h-2 rounded-full ${client.dotColor}`}></span>
            <span className={`text-[10px] font-bold ${client.textColor}`}>{client.name}</span>
          </div>
        )}
        <p className="text-xs font-bold text-slate-900 mb-0.5 group-hover:text-slate-700 transition-colors">{d.name}</p>
        <p className="text-[11px] text-slate-400 mb-2.5">{d.description}</p>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><LayoutDashboard className="w-2.5 h-2.5" />{d.widgets} widgets</span>
          {d.recipients > 0 && <span className="flex items-center gap-1"><Mail className="w-2.5 h-2.5" />{d.recipients}</span>}
          <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{d.updated}</span>
        </div>
      </div>
    </div>
  );
}
