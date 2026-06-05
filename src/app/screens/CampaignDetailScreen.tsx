import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ChevronRight, Edit, Download, Sparkles, X, Image, Eye } from 'lucide-react';
import { motion } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { toast } from 'sonner';
import ClientBadge from '../components/shared/ClientBadge';
import PlatformDot from '../components/shared/PlatformDot';
import StatusBadge from '../components/shared/StatusBadge';

// Shared trend mock data (same as in App)
const performanceTrend = [
  { date: 'Apr 1', spend: 8200, roas: 4.1, conv: 142 },
  { date: 'Apr 3', spend: 7800, roas: 4.3, conv: 138 },
  { date: 'Apr 5', spend: 9100, roas: 4.5, conv: 161 },
  { date: 'Apr 7', spend: 8600, roas: 4.2, conv: 155 },
  { date: 'Apr 9', spend: 10200, roas: 4.8, conv: 188 },
  { date: 'Apr 11', spend: 9800, roas: 4.6, conv: 179 },
  { date: 'Apr 13', spend: 11400, roas: 5.1, conv: 210 },
  { date: 'Apr 15', spend: 10900, roas: 4.9, conv: 203 },
  { date: 'Apr 17', spend: 12100, roas: 5.3, conv: 228 },
  { date: 'Apr 19', spend: 11800, roas: 5.0, conv: 218 },
  { date: 'Apr 20', spend: 12600, roas: 5.2, conv: 235 },
];

export default function CampaignDetailScreen() {
  const {
    selectedCampaign,
    campaigns,
    setViewMode,
    setSelectedCampaign,
    setEditingCampaign,
    setShowCampaignModal,
  } = useApp();

  const { CLIENTS: clients } = useApp() as any;

  const [showOptimizations, setShowOptimizations] = useState(true);

  const campaign = campaigns.find(c => c.id === selectedCampaign);

  const onBack = () => {
    setViewMode('list');
    setSelectedCampaign(null);
  };

  const onEdit = (c: any) => {
    setEditingCampaign(c);
    setShowCampaignModal(true);
  };

  if (!campaign) return null;
  const client = clients?.find((cl: any) => cl.id === campaign.clientId);
  const budgetPct = (campaign.spend / campaign.budget) * 100;
  const cpc = campaign.clicks > 0 ? campaign.spend / campaign.clicks : campaign.cpc || 0;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 mb-4 font-semibold transition-colors group cursor-pointer border-0 bg-transparent">
        <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back to Campaigns
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
            {client && <ClientBadge client={client} />}
            <PlatformDot platform={campaign.channel} />
            <h1 className="text-xl font-bold text-slate-900">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-sm text-slate-500">{campaign.channel} Ads · Updated 2 hours ago</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEdit(campaign)} className="h-9 px-3 border border-slate-200 bg-white rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm cursor-pointer"><Edit className="w-3.5 h-3.5 text-slate-400" />Edit</button>
          <button className="h-9 px-4 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm cursor-pointer"><Download className="w-3.5 h-3.5" />Export</button>
        </div>
      </div>

      {/* Budget bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-700">Budget Utilization</p>
          <p className="text-xs font-bold font-['JetBrains_Mono'] text-slate-900">₹{(campaign.spend / 1000).toFixed(1)}k / ₹{(campaign.budget / 1000).toFixed(0)}k</p>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${budgetPct}%` }} transition={{ duration: 0.7 }} className={`h-full rounded-full ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        </div>
        <p className={`text-[10px] mt-1 font-semibold ${budgetPct > 90 ? 'text-red-600' : budgetPct > 70 ? 'text-amber-600' : 'text-emerald-600'}`}>{budgetPct.toFixed(0)}% of budget used</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Spend', value: `₹${(campaign.spend / 1000).toFixed(1)}k`, sub: `Budget: ₹${(campaign.budget / 1000).toFixed(0)}k`, color: 'text-slate-900' },
          { label: 'CPC', value: cpc > 0 ? `₹${cpc.toFixed(2)}` : 'N/A', sub: `CTR: ${Number(campaign.ctr || 0).toFixed(2)}%`, color: 'text-slate-900' },
          { label: 'Conversions', value: campaign.conv.toLocaleString(), sub: `₹${(campaign.spend / campaign.conv).toFixed(0)} CPA`, color: 'text-slate-900' },
          { label: 'CTR', value: `${Number(campaign.ctr || 0).toFixed(2)}%`, sub: `Avg: ${(Number(campaign.ctr || 0) - 0.2).toFixed(2)}%`, color: 'text-slate-900' },
          { label: 'Impressions', value: `${(campaign.impressions / 1000).toFixed(0)}k`, sub: `${campaign.clicks.toLocaleString()} clicks`, color: 'text-slate-900' },
          { label: 'Frequency', value: `${campaign.frequency || 0}×`, sub: campaign.frequency > 5 ? '⚠ Too high' : 'Healthy', color: campaign.frequency > 5 ? 'text-red-600' : 'text-slate-900' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] text-slate-400 font-semibold mb-1.5">{kpi.label}</p>
            <p className={`text-lg font-bold font-['JetBrains_Mono'] ${kpi.color}`}>{kpi.value}</p>
            <p className="text-[10px] text-slate-400 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* AI Reco */}
      {showOptimizations && campaign.status !== 'healthy' && (
        <div className={`border rounded-2xl p-5 mb-5 ${campaign.status === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${campaign.status === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
              <h3 className={`text-sm font-bold ${campaign.status === 'critical' ? 'text-red-900' : 'text-amber-900'}`}>AI Recommendations</h3>
            </div>
            <button onClick={() => setShowOptimizations(false)} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="space-y-2 mb-4">
            {(
              campaign.status === 'critical' ? [
                { t: 'Creative fatigue detected', d: `Frequency at ${campaign.frequency}× (target ≤3×). Refresh ad creatives immediately.` },
                { t: 'Pause underperforming ad sets', d: 'Remove ad sets with CTR below 0.5% to cut wasteful spend.' },
              ] : [
                { t: 'Bid strategy adjustment needed', d: 'Switch from manual CPC to Target CPA to improve conversion efficiency.' },
              ]
            ).map((rec, i) => (
              <div key={i} className={`flex gap-2.5 p-3 rounded-xl ${campaign.status === 'critical' ? 'bg-white/60 border border-red-100' : 'bg-white/60 border border-amber-100'}`}>
                <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${campaign.status === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{i + 1}</span>
                <div>
                  <p className={`text-xs font-bold ${campaign.status === 'critical' ? 'text-red-900' : 'text-amber-900'}`}>{rec.t}</p>
                  <p className={`text-xs mt-0.5 ${campaign.status === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>{rec.d}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => toast.success('Optimization applied!')} className={`h-9 px-4 rounded-xl text-xs font-bold text-white cursor-pointer ${campaign.status === 'critical' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'} transition-colors`}>
            Apply Recommendations
          </button>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Performance Over Time</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={performanceTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="cdGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1} /><stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11 }} />
            <Area type="monotone" dataKey="spend" stroke="#0f172a" strokeWidth={2} fill="url(#cdGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Top Ad Sets</h3>
          <div className="space-y-2.5">
            {['Lookalike 1–2%', 'Website Retargeting', 'Interest – Broad'].map((adset, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-xs font-semibold">{adset}</p>
                  <p className="text-[10px] text-slate-400">₹{(campaign.spend / 3 * (1 - i * 0.2)).toFixed(0)} spend</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-emerald-600 font-['JetBrains_Mono']">₹{(cpc * (1 + (i - 1) * 0.15)).toFixed(2)} CPC</p>
                  <p className="text-[10px] text-slate-400">{(campaign.conv / 3 * (1 - i * 0.2)).toFixed(0)} conv.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Active Creatives</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="relative group cursor-pointer">
                <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center border border-slate-200">
                  <Image className="w-6 h-6 text-slate-300" />
                </div>
                <div className="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Eye className="w-4 h-4 text-white" />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 text-center">{(campaign.ctr + (4 - i) * 0.3).toFixed(2)}% CTR</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
