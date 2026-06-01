import { useApp } from '../context/AppContext';
import { 
  Building2, Download, Sparkles, Wallet, TrendingUp, CheckCircle, Briefcase, 
  ArrowRight, AlertTriangle, ArrowUpRight, ArrowDownRight, Lightbulb, MousePointer,
  X, Brain, FileText, Check, Copy, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { apiService } from '../../services/api.service';
import { 
  ResponsiveContainer, AreaChart, Area, CartesianGrid, 
  XAxis, YAxis, Tooltip, BarChart, Bar, Cell, PieChart, Pie,
  RadialBarChart, RadialBar, Legend
} from 'recharts';
import PageWrapper from '../components/shared/PageWrapper';
import { useState, useEffect } from 'react';
import { useAgentStore } from '../../stores/agentStore';

// Spend vs Conversions Trend Mock Data mapped to screenshot trajectory
const spendConversionsTrend = [
  { day: 'Mon', spend: 8.2, conv: 92 },
  { day: 'Tue', spend: 9.4, conv: 108 },
  { day: 'Wed', spend: 10.1, conv: 121 },
  { day: 'Thu', spend: 11.6, conv: 138 },
  { day: 'Fri', spend: 12.8, conv: 150 },
  { day: 'Sat', spend: 14.1, conv: 162 },
  { day: 'Sun', spend: 17.4, conv: 179 },
];

export default function AgencyOverviewScreen() {
  const { campaigns, dashboards, setSelectedClientId, setActiveView } = useApp();
  const { CLIENTS: clients } = useApp() as any;

  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportData, setReportData] = useState<{ downloadUrl: string; shareLink: string; reportId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [trendData, setTrendData] = useState<any[]>([]);
  const [loadingTrend, setLoadingTrend] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadTrend = async () => {
      try {
        setLoadingTrend(true);
        const data = await apiService.getSpendTrend(null);
        if (Array.isArray(data)) {
          const mapped = data.map((item: any) => {
            const d = new Date(item.date);
            const label = timeRange === '7d'
              ? d.toLocaleDateString('en-IN', { weekday: 'short' })
              : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            return {
              day: label,
              spend: Number((Number(item.spend || 0) / 1000).toFixed(2)),
              conv: Number(item.conversions || 0),
            };
          });
          const limit = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
          const sliced = mapped.slice(-limit);
          if (!cancelled) {
            setTrendData(sliced);
          }
        }
      } catch (err) {
        console.error('Failed to load spend trend:', err);
      } finally {
        if (!cancelled) {
          setLoadingTrend(false);
        }
      }
    };

    loadTrend();

    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  const activeTrendData = trendData.length > 0 ? trendData : spendConversionsTrend;

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const res = await apiService.generateAgencyReport();
      setReportData(res);
      
      const response = await fetch(res.downloadUrl, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_AUTH_TOKEN || ''}`,
          'x-tenant-id': apiService.tenantId,
        }
      });
      
      if (!response.ok) throw new Error('File download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'MarketIQ-Agency-Report-May2026.docx';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
      
      setShowReportModal(true);
    } catch (err) {
      console.error(err);
      toast.error('Report generation failed. Try again.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownloadAgain = async () => {
    if (!reportData) return;
    try {
      const response = await fetch(reportData.downloadUrl, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_AUTH_TOKEN || ''}`,
          'x-tenant-id': apiService.tenantId,
        }
      });
      if (!response.ok) throw new Error('File download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'MarketIQ-Agency-Report-May2026.docx';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error('Failed to download file.');
    }
  };

  const handleCopyLink = () => {
    if (!reportData) return;
    navigator.clipboard.writeText(reportData.shareLink);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const handleFetchAiSummary = async () => {
    setShowSummaryPanel(true);
    setLoadingSummary(true);
    setSummaryData(null);
    try {
      const data = await apiService.getAgencyAiSummary(null);
      setSummaryData(data);
    } catch (err) {
      console.error('Failed to generate agency summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Dynamic calculations from live campaigns
  const totalSpend = campaigns
    .filter((c: any) => {
      const plat = String(c.platform || c.channel || '').toLowerCase();
      return plat.includes('meta') || plat.includes('facebook') || plat.includes('instagram');
    })
    .reduce((s: number, c: any) => s + c.spend, 0);
  const totalConv = campaigns.reduce((s: number, c: any) => s + c.conv, 0);
  const totalClicks = campaigns.reduce((s: number, c: any) => s + Number(c.clicks || 0), 0);
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const criticalCount = campaigns.filter((c: any) => c.status === 'critical').length;

  const { setPageContext } = useAgentStore();
  const avgCPC = avgCpc;
  const totalConversions = totalConv;
  const activeClients = clients.length;

  useEffect(() => {
    setPageContext({
      page: 'agency_overview',
      data: { totalSpend, avgCPC, totalConversions, activeClients }
    });
  }, [totalSpend, avgCPC, totalConversions, activeClients, setPageContext]);

  const clientStats = clients.map((client: any) => {
    const cc = campaigns.filter((c: any) => c.clientId === client.id);
    const cd = dashboards.filter((d: any) => d.clientId === client.id);
    const spend = cc
      .filter((c: any) => {
        const plat = String(c.platform || c.channel || '').toLowerCase();
        return plat.includes('meta') || plat.includes('facebook') || plat.includes('instagram');
      })
      .reduce((s: number, c: any) => s + c.spend, 0);
    const clicks = cc.reduce((s: number, c: any) => s + Number(c.clicks || 0), 0);
    const cpc = clicks > 0 ? spend / clicks : 0;
    return {
      ...client,
      spend,
      cpc,
      conv: cc.reduce((s: number, c: any) => s + c.conv, 0),
      activeCampaigns: cc.filter((c: any) => c.active).length,
      totalCampaigns: cc.length,
      dashboardCount: cd.length,
      criticals: cc.filter((c: any) => c.status === 'critical').length,
      warnings: cc.filter((c: any) => c.status === 'at_risk' || c.status === 'warning').length,
    };
  });

  const onSelectClient = (id: string) => {
    setSelectedClientId(id);
    setActiveView('campaigns');
  };

  // 1. Dynamic calculation of Platform Mix (PieData)
  const platformGroups = campaigns.reduce((acc: Record<string, number>, c: any) => {
    const plat = c.platform || c.channel || 'Meta';
    const spend = Number(c.spend || 0);
    acc[plat] = (acc[plat] || 0) + spend;
    return acc;
  }, {});

  const totalCampaignSpend = Object.values(platformGroups).reduce((s: number, v: any) => s + v, 0) as number;
  const platformColors: Record<string, string> = {
    'meta': 'var(--indigo)',
    'google': 'var(--emerald)',
    'linkedin': 'var(--violet)',
    'tiktok': 'var(--pink)',
    'other': 'var(--amber)',
  };

  const dynamicPieData = Object.entries(platformGroups).map(([name, value], index) => {
    const valNum = value as number;
    const share = totalCampaignSpend > 0 ? Math.round((valNum / totalCampaignSpend) * 100) : 0;
    const key = name.toLowerCase();
    const color = platformColors[key] || Object.values(platformColors)[index % 5];
    return {
      name: name.charAt(0).toUpperCase() + name.slice(1) + (name.toLowerCase().endsWith('ads') ? '' : ' Ads'),
      value: Number((valNum / 1000).toFixed(1)), // in K
      share,
      color,
    };
  }).sort((a, b) => b.value - a.value);

  const pieData = dynamicPieData.length ? dynamicPieData : [
    { name: 'Meta Ads', value: 0, share: 0, color: 'var(--indigo)' },
    { name: 'Google Ads', value: 0, share: 0, color: 'var(--emerald)' }
  ];

  // 2. Dynamic channel CPC breakdown
  const platformCpc = campaigns.reduce((acc: any, c: any) => {
    const plat = c.platform || c.channel || 'Meta';
    const spend = Number(c.spend || 0);
    const clicks = Number(c.clicks || 0);
    if (!acc[plat]) {
      acc[plat] = { spend: 0, clicks: 0 };
    }
    acc[plat].spend += spend;
    acc[plat].clicks += clicks;
    return acc;
  }, {});

  const dynamicChannels = Object.entries(platformCpc).map(([name, stat]: [string, any], index) => {
    const avg = stat.clicks > 0 ? stat.spend / stat.clicks : 0;
    const fills = ["var(--violet)", "var(--sky)", "var(--amber)", "var(--emerald)", "var(--rose)"];
    return {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      cpc: Number(avg.toFixed(2)),
      fill: fills[index % 5],
    };
  }).sort((a, b) => b.cpc - a.cpc);

  const channels = dynamicChannels.length ? dynamicChannels : [
    { name: "Meta", cpc: 0, fill: "var(--violet)" },
    { name: "Google", cpc: 0, fill: "var(--sky)" }
  ];

  // 3. Dynamic Goal Completion progress
  const campaignsWithConversions = campaigns.filter((c: any) => c.conv > 0 || c.conversions > 0).length;
  const convProgress = campaigns.length > 0 ? Math.round((campaignsWithConversions / campaigns.length) * 100) : 0;

  const totalReach = campaigns.reduce((s: number, c: any) => s + Number(c.reach || 0), 0);
  const reachProgress = Math.min(100, Math.round((totalReach / 100000) * 100)) || 85; 

  const totalImpressions = campaigns.reduce((s: number, c: any) => s + Number(c.impressions || 0), 0);
  const blendedCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const ctrProgress = Math.min(100, Math.round((blendedCtr / 2.0) * 100)) || 72; 

  const goals = [
    { name: "Reach Goal",       value: reachProgress, fill: "var(--violet)" },
    { name: "CTR Efficiency",   value: ctrProgress, fill: "var(--sky)" },
    { name: "Conversion Rate",  value: convProgress || 64, fill: "var(--emerald)" },
  ];

  const criticalCampaigns = campaigns.filter((c: any) => c.status === 'critical' || c.status === 'error');
  const criticalText = criticalCampaigns.length > 0 
    ? `${criticalCampaigns.slice(0, 2).map((c: any) => c.name).join(', ')} require(s) immediate attention.`
    : 'CAI Mahindra has campaigns with creative fatigue detected (frequency above 3.0).';

  return (
    <PageWrapper>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Agency Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Venpep Agency · {clients.length} active client{clients.length === 1 ? '' : 's'} · May 26, 2026
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleGenerateReport} 
            disabled={isGeneratingReport}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-2 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingReport ? (
              <>
                <Loader2 className="size-4 animate-spin text-primary" /> Generating...
              </>
            ) : (
              <>
                <Download className="size-4 text-muted-foreground" /> Agency Report
              </>
            )}
          </button>
          <button onClick={handleFetchAiSummary} className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5 cursor-pointer border-0">
            <Sparkles className="size-4" /> AI Summary
          </button>
        </div>
      </div>

      {/* Critical alert bar (if any) */}
      {criticalCount > 0 && (
        <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 flex items-start gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gradient-rose flex items-center justify-center flex-shrink-0 shadow-sm">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-950">{criticalCount} campaigns need immediate attention</p>
            <p className="text-xs text-rose-700/80 mt-0.5">{criticalText}</p>
          </div>
          <button onClick={() => { setSelectedClientId(criticalCampaigns[0]?.clientId || 'cai_mahindra'); setActiveView('campaigns'); }} className="flex-shrink-0 h-8 px-3 bg-rose-650 hover:bg-rose-700 text-white border-0 rounded-lg text-xs font-semibold transition-colors cursor-pointer">View Issues</button>
        </div>
      )}

      {/* Bento KPIs (Matching the lovable structure) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Wallet} variant="violet" value={formatCurrency(totalSpend)} label="Total Agency Spend" detail="All campaigns combined" delta="+14.2%" />
        <KpiCard icon={MousePointer} variant="sky" value={formatCpc(avgCpc)} label="Average CPC" detail="Across all accounts" delta="-4.2%" />
        <KpiCard icon={CheckCircle} variant="emerald" value={String(totalConv)} label="Total Conversions" detail="All campaigns" delta="+19.1%" />
        <KpiCard icon={Building2} variant="amber" value={String(clients.length)} label="Active Clients" detail={`${clients.length} account managed`} delta="Active" />
      </div>

      {/* Main charts row */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* Spend vs Conversions Area Graph */}
        <Panel
          title="Spend vs Conversions Trend"
          subtitle="Weekly performance overview"
          action={
            <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 select-none">
              {(['7d', '30d', '90d'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => setTimeRange(preset)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all cursor-pointer border-0 ${
                    timeRange === preset ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground bg-transparent'
                  }`}
                >
                  {preset.toUpperCase()}
                </button>
              ))}
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={activeTrendData} margin={{ top: 10, right: 8, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSpend" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--violet)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--violet)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gConv" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--emerald)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--emerald)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<TooltipCard />} cursor={{ stroke: "var(--violet)", strokeOpacity: 0.2 }} />
                <Area type="monotone" dataKey="spend" name="Spend (₹K)" stroke="var(--violet)" strokeWidth={2.5} fill="url(#gSpend)" />
                <Area type="monotone" dataKey="conv" name="Conversions" stroke="var(--emerald)" strokeWidth={2.5} fill="url(#gConv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-5 pt-3 text-xs text-muted-foreground border-t border-border mt-3">
            <span className="flex items-center gap-2"><span className="h-1.5 w-3.5 rounded-full" style={{ background: "var(--violet)" }} /> Amount Spent</span>
            <span className="flex items-center gap-2"><span className="h-1.5 w-3.5 rounded-full" style={{ background: "var(--emerald)" }} /> Conversions</span>
          </div>
        </Panel>

        {/* Platform Mix Donut Card */}
        <Panel title="Platform Mix" subtitle="Spend distribution">
          <div className="grid grid-cols-1 gap-4">
            <div className="h-40 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="share"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={68}
                    paddingAngle={3}
                    stroke="var(--card)"
                    strokeWidth={3}
                  >
                    {pieData.map((p, i) => <Cell key={i} fill={p.color} />)}
                  </Pie>
                  <Tooltip content={<TooltipCard />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 pt-2">
              {pieData.map((p) => (
                <div key={p.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: p.color }} />
                      <span className="font-semibold text-foreground/80">{p.name}</span>
                    </span>
                    <span className="font-num text-xs tabular-nums text-foreground/90">
                      <span className="font-bold">₹{p.value}K</span>{" "}
                      <span className="text-muted-foreground font-normal">({p.share}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${p.share}%`, background: p.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* Secondary row */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Channel CPC */}
        <Panel title="CPC by Channel" subtitle="Cost per click per channel">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={channels} margin={{ top: 10, right: 8, left: -25, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}`} />
                <Tooltip content={<TooltipCard />} cursor={{ fill: "var(--surface-2)" }} />
                <Bar dataKey="cpc" radius={[6, 6, 0, 0]}>
                  {channels.map((c, i) => <Cell key={i} fill={c.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Goal Completion Radial */}
        <Panel title="Goal Completion" subtitle="Progress across key objectives">
          <div className="h-64">
            <ResponsiveContainer>
              <RadialBarChart innerRadius="25%" outerRadius="100%" data={goals} startAngle={90} endAngle={-270}>
                <RadialBar background={{ fill: "var(--surface-2)" }} dataKey="value" cornerRadius={6} />
                <Legend
                  iconSize={8}
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  wrapperStyle={{ fontSize: 11, fontWeight: 'bold' }}
                />
                <Tooltip content={<TooltipCard />} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Client Accounts Directory */}
      <div className="mt-6">
        <Panel
          title="Client Accounts"
          subtitle={`${clients.length} active client${clients.length === 1 ? '' : 's'}`}
          action={
            <button onClick={() => setActiveView('clients')} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline bg-transparent border-0 cursor-pointer">
              View all <ArrowRight className="size-3.5" />
            </button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {clientStats.map((clientItem: any) => (
              <div 
                key={clientItem.id}
                onClick={() => onSelectClient(clientItem.id)}
                className="block rounded-2xl border border-border bg-surface-2/40 p-5 transition-all hover:border-primary/40 hover:shadow-card cursor-pointer group"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className={`grid size-11 place-items-center rounded-xl bg-gradient-to-br ${clientItem.color || 'bg-gradient-rose'} text-sm font-bold text-white shadow-md`}>
                    {clientItem.avatar || clientItem.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">{clientItem.name}</div>
                    <div className="text-xs text-muted-foreground">{clientItem.industry}</div>
                  </div>
                  <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                    clientItem.status === 'healthy' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                      : 'bg-rose-50 text-rose-700 border-rose-100'
                  }`}>
                    <span className={`size-1.5 rounded-full ${clientItem.status === 'healthy' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    {clientItem.status === 'healthy' ? 'Healthy' : 'Needs attention'}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4 select-none">
                  <Stat label="Spend" value={formatCurrency(clientItem.spend)} />
                  <Stat label="Avg CPC" value={formatCpc(clientItem.cpc)} accent="amber" />
                  <Stat label="Conversions" value={clientItem.conv} />
                  <Stat label="Campaigns" value={`${clientItem.activeCampaigns}/${clientItem.totalCampaigns}`} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground border-t border-border/40 pt-3">
                  <span>✓ {clientItem.accountManager}</span>
                  <span>·</span>
                  <span>{clientItem.dashboardCount} dashboard{clientItem.dashboardCount === 1 ? '' : 's'}</span>
                  <span className="ml-auto font-semibold text-primary group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Manage <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Slide-In AI Summary Panel */}
      <AnimatePresence>
        {showSummaryPanel && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSummaryPanel(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed right-0 top-0 bottom-0 w-[480px] bg-slate-900 text-slate-100 z-50 shadow-2xl flex flex-col font-sans select-none border-l border-slate-800"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-xl bg-gradient-primary text-white shadow-glow">
                    <Brain className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100 leading-none">AI Executive Summary</h2>
                    <p className="text-[11px] text-slate-500 mt-1">Real-time performance strategist insights</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSummaryPanel(false)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors bg-transparent border-0 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {loadingSummary && (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <div className="relative">
                      <div className="size-16 rounded-full bg-gradient-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
                        <Brain className="size-8 text-primary animate-bounce" />
                      </div>
                      <div className="absolute inset-0 size-16 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-200">Generating your agency summary...</p>
                      <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
                        Analyzing metrics <span className="flex gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0s' }} /><span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.15s' }} /><span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.3s' }} /></span>
                      </div>
                    </div>
                  </div>
                )}

                {!loadingSummary && summaryData && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Headline */}
                    <h3 className="text-lg font-black text-slate-100 leading-tight">
                      {summaryData.headline}
                    </h3>

                    {/* Overview */}
                    <p className="text-xs text-slate-450 leading-relaxed font-medium">
                      {summaryData.overview}
                    </p>

                    {/* Three Cards Side-by-Side */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-3 flex flex-col">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-400">Top Win</span>
                        <p className="text-[10px] text-emerald-200 mt-1 font-semibold leading-relaxed line-clamp-6">
                          {summaryData.topWin}
                        </p>
                      </div>
                      <div className="bg-rose-950/20 border border-rose-900/30 rounded-xl p-3 flex flex-col">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-rose-400">Risk</span>
                        <p className="text-[10px] text-rose-200 mt-1 font-semibold leading-relaxed line-clamp-6">
                          {summaryData.biggestRisk}
                        </p>
                      </div>
                      <div className="bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-3 flex flex-col">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-indigo-400">Reco</span>
                        <p className="text-[10px] text-indigo-200 mt-1 font-semibold leading-relaxed line-clamp-6">
                          {summaryData.recommendation}
                        </p>
                      </div>
                    </div>

                    {/* Budget Health Card */}
                    {summaryData.budgetHealth && (
                      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3.5 flex flex-col">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Budget Pacing & Health</span>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-semibold">
                          {summaryData.budgetHealth}
                        </p>
                      </div>
                    )}

                    {/* Key Metrics List with Status Badges */}
                    <div className="space-y-2.5">
                      <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Key Metrics Performance</h4>
                      <div className="bg-slate-950/40 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
                        {summaryData.keyMetrics?.map((metric: any, i: number) => {
                          const isDanger = metric.status === 'danger';
                          const isWarning = metric.status === 'warning';
                          const badgeClass = isDanger 
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                            : isWarning 
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
                          
                          return (
                            <div key={i} className="flex items-center justify-between p-3">
                              <span className="text-xs text-slate-400 font-semibold">{metric.label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-100 font-['JetBrains_Mono']">{metric.value}</span>
                                <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeClass}`}>
                                  {metric.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              {!loadingSummary && summaryData && (
                <div className="border-t border-slate-800 p-4 bg-slate-950/40">
                  <button
                    onClick={() => {
                      setShowSummaryPanel(false);
                      setActiveView('ai');
                    }}
                    className="w-full h-11 rounded-xl bg-gradient-primary hover:shadow-glow flex items-center justify-center gap-1.5 text-xs font-bold text-white transition-all cursor-pointer border-0"
                  >
                    View Full AI Analysis <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {showReportModal && reportData && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReportModal(false)}
              className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm"
            />
            {/* Modal Card */}
            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 select-none">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                className="relative bg-white w-full max-w-[400px] rounded-2xl p-6 shadow-2xl flex flex-col font-sans border border-slate-100"
              >
                {/* Close Button top right */}
                <button
                  onClick={() => setShowReportModal(false)}
                  className="absolute top-4 right-4 w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors bg-transparent border-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Green checkmark drawing animation */}
                <div className="flex justify-center mb-5">
                  <div className="size-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center relative">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: 0.1 }}
                      className="size-10 rounded-full bg-emerald-500 flex items-center justify-center text-white"
                    >
                      <Check className="size-5 stroke-[3px]" />
                    </motion.div>
                    <div className="absolute inset-0 size-16 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin opacity-30 pointer-events-none" />
                  </div>
                </div>

                {/* Heading */}
                <h3 className="text-center font-display text-lg font-black text-slate-900 leading-tight">
                  Report ready
                </h3>

                {/* File item preview widget */}
                <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-850 truncate leading-tight">
                      MarketIQ-Agency-Report-May2026.docx
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                      Microsoft Word Document
                    </p>
                  </div>
                </div>

                {/* Two buttons side-by-side */}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    onClick={handleDownloadAgain}
                    className="h-11 rounded-xl border border-slate-250 bg-white text-slate-750 hover:bg-slate-50 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="size-3.5 text-slate-550" /> Download again
                  </button>
                  <button
                    onClick={handleCopyLink}
                    className={`h-11 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border-0 cursor-pointer ${
                      copied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-750 shadow-glow'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5" /> Link copied!
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" /> Copy shareable link
                      </>
                    )}
                  </button>
                </div>

                {/* Small text footer */}
                <p className="text-center text-[10px] text-slate-400 mt-4 font-semibold uppercase tracking-wider">
                  Link expires in 7 days
                </p>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </PageWrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPER COMPONENTS AIGNED TO LOVABLE STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════
function KpiCard({
  icon: Icon, value, label, detail, delta, variant = "violet", positive = true,
}: {
  icon: any;
  value: string;
  label: string;
  detail: string;
  delta: string;
  variant?: "violet" | "emerald" | "sky" | "amber" | "rose";
  positive?: boolean;
}) {
  const variantStyles = {
    violet:  { bg: "bg-gradient-primary",  chip: "bg-violet-50 text-violet-700" },
    emerald: { bg: "bg-gradient-emerald", chip: "bg-emerald-50 text-emerald-700" },
    sky:     { bg: "bg-gradient-sky",     chip: "bg-sky-50 text-sky-700" },
    amber:   { bg: "bg-gradient-amber",   chip: "bg-amber-50 text-amber-700" },
    rose:    { bg: "bg-gradient-rose",    chip: "bg-rose-50 text-rose-700" },
  };
  const v = variantStyles[variant];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg select-none">
      <div className="absolute -right-12 -top-12 size-36 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-20 pointer-events-none" >
        <div className={`size-full rounded-full ${v.bg}`} />
      </div>
      <div className="relative flex items-start justify-between">
        <div className={`grid size-11 place-items-center rounded-xl text-white shadow-md ${v.bg}`}>
          <Icon className="size-5" strokeWidth={2.4} />
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
        }`}>
          {positive ? <ArrowUpRight className="size-3 stroke-[2.5px]" /> : <ArrowDownRight className="size-3 stroke-[2.5px]" />}
          {delta}
        </span>
      </div>
      <div className="relative mt-5 font-num text-[1.95rem] font-semibold tracking-tight leading-none tabular-nums text-foreground">{value}</div>
      <div className="relative mt-2 text-sm font-medium text-foreground/80">{label}</div>
      <div className="relative mt-0.5 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function Panel({
  title, subtitle, action, children, className = "",
}: {
  title: string;
  subtitle?: string;
  action?: any;
  children: any;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-border bg-card shadow-card ${className}`}>
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, suffix, accent }: { label: string; value: string; suffix?: string; accent?: "amber" }) {
  return (
    <div className="bg-card p-4">
      <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="font-num text-lg font-semibold tabular-nums text-foreground" style={accent === "amber" ? { color: "var(--orange)" } : undefined}>
        {value}
        {suffix && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function TooltipCard({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg z-50">
      {label && <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{label}</div>}
      {payload.map((p: any, i: number) => {
        const isSpend = p.name.toLowerCase().includes('spend');
        const isCpc = p.name.toLowerCase().includes('cpc');
        let displayValue = p.value;
        if (typeof p.value === 'number') {
          if (isSpend) displayValue = `₹${p.value.toFixed(1)}K`;
          else if (isCpc) displayValue = `₹${p.value.toFixed(2)}`;
        }
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="size-2 rounded-full" style={{ background: p.color || p.fill }} />
            <span className="font-medium text-foreground">{p.name}:</span>
            <span className="font-semibold font-num tabular-nums text-foreground">{displayValue}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);
}

function formatCpc(val: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(val || 0);
}
