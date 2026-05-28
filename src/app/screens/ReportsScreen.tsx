import { useApp } from '../context/AppContext';
import { Plus, FileText, RefreshCw, Users, Clock, Download, Edit } from 'lucide-react';
import PageWrapper from '../components/shared/PageWrapper';
import ClientAvatar from '../components/shared/ClientAvatar';
import { downloadReportDocx } from '../../services/report-docx.service';
import { formatInr, getAlerts, getCampaignScope, getPerformanceSummary, getRecommendations } from '../../services/insights.service';

export default function ReportsScreen() {
  const { setShowReportModal, campaigns, integrations } = useApp();
  const { CLIENTS: clients } = useApp() as any;

  const reports = [
    { id: 1, clientId: 'cai_mahindra', name: 'CAI Mahindra — Weekly Lead Gen digest', frequency: 'Weekly', lastSent: '3 days ago', recipients: 3, status: 'active' },
    { id: 2, clientId: 'cai_mahindra', name: 'CAI Mahindra — Monthly Spend & CPC Summary', frequency: 'Monthly', lastSent: '12 days ago', recipients: 4, status: 'active' },
    { id: 3, clientId: 'cai_mahindra', name: 'CAI Mahindra — Creative fatigue audit', frequency: 'Weekly', lastSent: '1 day ago', recipients: 2, status: 'active' },
    { id: 4, clientId: 'cai_mahindra', name: 'CAI Mahindra — Daily Performance Alert', frequency: 'Daily', lastSent: 'Today 9am', recipients: 5, status: 'paused' }
  ];

  const groupedReports = clients.map((client: any) => ({
    client,
    items: reports.filter(r => r.clientId === client.id),
  })).filter((g: any) => g.items.length > 0);
  const allSummary = getPerformanceSummary(campaigns);
  const allAlerts = getAlerts(campaigns, clients);
  const allRecommendations = getRecommendations(campaigns, clients, integrations);

  const handleDownload = (report: any, client: any) => {
    const reportCampaigns = getCampaignScope(campaigns, client?.id);
    downloadReportDocx({ report, client, campaigns: reportCampaigns, integrations });
  };

  return (
    <PageWrapper>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">{reports.filter(r => r.status === 'active').length} active scheduled reports across all clients</p>
        </div>
        <button onClick={() => setShowReportModal(true)} className="h-9 px-4 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm cursor-pointer border-0"><Plus className="w-4 h-4" />Create Report</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Reportable Spend', value: formatInr(allSummary.totalSpend), sub: `${campaigns.length} campaigns` },
          { label: 'Avg CPC', value: allSummary.avgCpc === null ? 'N/A' : `₹${allSummary.avgCpc.toFixed(2)}`, sub: 'Across connected data' },
          { label: 'Alerts', value: allAlerts.length, sub: `${allSummary.criticalCampaigns} critical` },
          { label: 'Recommendations', value: allRecommendations.length, sub: 'Ready for DOCX' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="text-xl font-bold font-['JetBrains_Mono'] text-slate-900 mt-1">{item.value}</p>
            <p className="text-[11px] text-slate-400">{item.sub}</p>
          </div>
        ))}
      </div>

      {groupedReports.map(({ client, items }: any) => (
        <div key={client.id} className="space-y-3">
          <div className={`flex items-center gap-3 p-3 rounded-xl border mb-3 ${client.lightBg} ${client.lightBorder}`}>
            <ClientAvatar client={client} size="sm" />
            <div>
              <p className={`text-sm font-bold ${client.textColor}`}>{client.name}</p>
              <p className="text-[11px] text-slate-500">{items.length} report{items.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-6">
            {items.map((r: any, idx: number) => (
              <div key={r.id} className={`p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors ${idx < items.length - 1 ? 'border-b border-slate-50' : ''}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${r.status === 'active' ? 'bg-blue-50' : 'bg-slate-100'}`}>
                  <FileText className={`w-4 h-4 ${r.status === 'active' ? 'text-blue-600' : 'text-slate-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{r.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5" />{r.frequency}</span>
                    <span className="flex items-center gap-1"><Users className="w-2.5 h-2.5" />{r.recipients} recipients</span>
                    <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{r.lastSent}</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${r.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : r.status === 'paused' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleDownload(r, client)} className="w-7 h-7 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center cursor-pointer bg-white" title="Download DOCX"><Download className="w-3 h-3 text-slate-500" /></button>
                  <button className="w-7 h-7 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center cursor-pointer bg-white"><Edit className="w-3 h-3 text-slate-500" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Alerts included in reports</h3>
          <div className="space-y-2">
            {(allAlerts.length ? allAlerts.slice(0, 4) : [{ title: 'No active alerts', message: 'Reports will state that performance is within threshold.' }]).map((alert: any, index: number) => (
              <div key={index} className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-900">{alert.title}</p>
                <p className="text-[11px] text-amber-700 mt-0.5">{alert.message}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Recommendations included in reports</h3>
          <div className="space-y-2">
            {allRecommendations.slice(0, 4).map((rec: any, index: number) => (
              <div key={index} className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                <p className="text-xs font-bold text-indigo-900">{rec.title}</p>
                <p className="text-[11px] text-indigo-700 mt-0.5">{rec.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
