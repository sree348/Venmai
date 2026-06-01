import { useEffect } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useApp } from '../context/AppContext';
import { Download, IndianRupee, TrendingUp, CheckCircle, Activity } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import PageWrapper from '../components/shared/PageWrapper';
import MetricCard from '../components/shared/MetricCard';

// Shared trend mock data
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

const platformBarData = [
  { platform: 'Meta', spend: 35920, roas: 4.2, conv: 576, color: '#3b82f6' },
  { platform: 'Google', spend: 48600, roas: 4.5, conv: 855, color: '#22c55e' },
  { platform: 'LinkedIn', spend: 16000, roas: 3.5, conv: 163, color: '#6366f1' },
  { platform: 'TikTok', spend: 14300, roas: 5.0, conv: 339, color: '#ec4899' },
];

const conversionPieData = [
  { name: 'Meta', value: 576, color: '#3b82f6' },
  { name: 'Google', value: 855, color: '#22c55e' },
  { name: 'LinkedIn', value: 163, color: '#6366f1' },
  { name: 'TikTok', value: 339, color: '#ec4899' },
];

export default function AnalyticsScreen() {
  const { scopedCampaigns: campaigns, activeClient } = useApp();

  const totalSpend = campaigns.reduce((s: number, c: any) => s + c.spend, 0);
  const totalConv = campaigns.reduce((s: number, c: any) => s + c.conv, 0);
  const avgRoas = campaigns.reduce((s: number, c: any) => s + c.roas, 0) / (campaigns.length || 1);

  const { setPageContext } = useAgentStore();
  const platformBreakdown = platformBarData;
  const spendTrend = performanceTrend;
  const conversionShare = conversionPieData;

  useEffect(() => {
    setPageContext({
      page: 'analytics',
      data: { platformBreakdown, spendTrend, conversionShare }
    });
  }, [platformBreakdown, spendTrend, conversionShare, setPageContext]);

  return (
    <PageWrapper>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">{activeClient ? <span>Performance insights for <strong>{activeClient.name}</strong></span> : 'Aggregate performance across all client accounts'}</p>
        </div>
        <button className="h-9 px-4 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm cursor-pointer"><Download className="w-4 h-4" />Export</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: <IndianRupee className="w-4 h-4" />, label: 'Total Spend', value: `₹${(totalSpend/1000).toFixed(1)}k`, change: '+12.4%', pos: true, color: 'blue' },
          { icon: <TrendingUp className="w-4 h-4" />, label: 'Avg ROAS', value: `${avgRoas.toFixed(1)}×`, change: '+8.2%', pos: true, color: 'emerald' },
          { icon: <CheckCircle className="w-4 h-4" />, label: 'Conversions', value: totalConv.toLocaleString(), change: '+18.3%', pos: true, color: 'violet' },
          { icon: <Activity className="w-4 h-4" />, label: 'Active Campaigns', value: campaigns.filter((c: any) => c.active).length, color: 'amber' },
        ].map(m => <MetricCard key={m.label} {...m} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Spend by Platform</h3>
          <p className="text-xs text-slate-400 mb-4">Budget allocation across channels</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={platformBarData} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="platform" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11 }} formatter={(v: any) => [`₹${(v/1000).toFixed(1)}k`, 'Spend']} />
              <Bar dataKey="spend" radius={[6, 6, 0, 0]}>
                {platformBarData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Conversion Share</h3>
          <p className="text-xs text-slate-400 mb-4">Distribution across platforms</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie data={conversionPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {conversionPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 flex-1">
              {conversionPieData.map(item => {
                const total = conversionPieData.reduce((s, x) => s + x.value, 0);
                return (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }}></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700">{item.name}</p>
                      <p className="text-[10px] text-slate-400">{item.value} conv.</p>
                    </div>
                    <p className="text-xs font-bold">{((item.value / total) * 100).toFixed(0)}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Spend & ROAS Trend</h3>
        <p className="text-xs text-slate-400 mb-4">Daily performance over the last 20 days</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={performanceTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1} /><stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11 }} />
            <Area type="monotone" dataKey="spend" stroke="#0f172a" strokeWidth={2} fill="url(#aGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </PageWrapper>
  );
}
