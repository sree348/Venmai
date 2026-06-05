import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useApp } from '../context/AppContext';
import { 
  Download, 
  IndianRupee, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  ChevronDown, 
  Check, 
  MousePointer, 
  Activity, 
  Users, 
  Target, 
  Percent, 
  HelpCircle, 
  Info,
  ChevronRight,
  Sparkles,
  Smartphone,
  Monitor,
  Tablet
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import PageWrapper from '../components/shared/PageWrapper';
import StatusBadge from '../components/shared/StatusBadge';
import PlatformDot from '../components/shared/PlatformDot';

// Presets standard in Shopify
const DATE_PRESETS = [
  { id: 'today', label: 'Today', sub: 'vs yesterday' },
  { id: 'yesterday', label: 'Yesterday', sub: 'vs same day last week' },
  { id: '7d', label: 'Last 7 days', sub: 'vs previous 7 days' },
  { id: '30d', label: 'Last 30 days', sub: 'vs previous 30 days' },
  { id: '90d', label: 'Last 90 days', sub: 'vs previous 90 days' },
  { id: 'ytd', label: 'Year to date', sub: 'vs previous year' },
  { id: 'all', label: 'All time', sub: 'vs previous period' },
];

export default function AnalyticsScreen() {
  const { scopedCampaigns: campaigns, activeClient } = useApp();
  const { setPageContext } = useAgentStore();

  // Shopify States
  const [datePreset, setDatePreset] = useState<string>('30d');
  const [compareEnabled, setCompareEnabled] = useState<boolean>(true);
  const [openDropdown, setOpenDropdown] = useState<boolean>(false);
  const [activeMetricId, setActiveMetricId] = useState<string>('sales'); // Sales, sessions, cvr, orders, aov, cpa
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activePreset = DATE_PRESETS.find(p => p.id === datePreset) || DATE_PRESETS[3];

  // ── 1. Calculate Core Totals from Scoped Campaigns ──────────────────────────
  const baseMetrics = useMemo(() => {
    // If no campaigns, use realistic fallback data matching client scope
    const items = campaigns.length > 0 ? campaigns : [
      { spend: 180000, conv: 412, clicks: 12000, impressions: 450000, roas: 4.2, active: true },
      { spend: 120000, conv: 320, clicks: 9500, impressions: 320000, roas: 3.8, active: true },
      { spend: 65000, conv: 145, clicks: 4200, impressions: 180000, roas: 4.5, active: false }
    ];

    const totalSpend = items.reduce((s: number, c: any) => s + (c.spend || 0), 0);
    const totalConv = items.reduce((s: number, c: any) => s + (c.conv || 0), 0);
    const totalClicks = items.reduce((s: number, c: any) => s + (c.clicks || 0), 0);
    const totalImpressions = items.reduce((s: number, c: any) => s + (c.impressions || 0), 0);
    
    // Average ROAS weighted by spend
    const weightedRoasSum = items.reduce((s: number, c: any) => s + ((c.spend || 0) * (c.roas || 3.8)), 0);
    const avgRoas = totalSpend > 0 ? weightedRoasSum / totalSpend : 4.1;

    // Derived Sales
    const totalSales = totalSpend > 0 ? totalSpend * avgRoas : totalConv * 2100;
    
    // Derived sessions
    const sessions = totalClicks > 0 ? Math.round(totalClicks * 1.45) : 38250;
    const cvr = sessions > 0 ? (totalConv / sessions) * 100 : 2.85;
    const aov = totalConv > 0 ? totalSales / totalConv : 2070.60;
    const cpa = totalConv > 0 ? totalSpend / totalConv : 450.00;

    return {
      spend: totalSpend,
      conversions: totalConv,
      clicks: totalClicks,
      impressions: totalImpressions,
      roas: avgRoas,
      sales: totalSales,
      sessions,
      cvr,
      aov,
      cpa
    };
  }, [campaigns]);

  // ── 2. Preset Multipliers & Trend Percentages ──────────────────────────────
  // Adapt data depending on selected range (Shopify style)
  const rangeDetails = useMemo(() => {
    let multiplier = 1;
    let daysCount = 30;
    let label = 'Last 30 days';

    switch (datePreset) {
      case 'today':
        multiplier = 0.08;
        daysCount = 12; // 12 double-hour points
        label = 'Today';
        break;
      case 'yesterday':
        multiplier = 0.075;
        daysCount = 12;
        label = 'Yesterday';
        break;
      case '7d':
        multiplier = 0.25;
        daysCount = 7;
        label = 'Last 7 days';
        break;
      case '30d':
        multiplier = 1;
        daysCount = 15; // 15 points representing 2-day intervals
        label = 'Last 30 days';
        break;
      case '90d':
        multiplier = 2.8;
        daysCount = 12; // 12 points representing weekly intervals
        label = 'Last 90 days';
        break;
      case 'ytd':
        multiplier = 4.2;
        daysCount = 8; // 8 points representing monthly intervals
        label = 'Year to date';
        break;
      case 'all':
        multiplier = 6.5;
        daysCount = 12;
        label = 'All time';
        break;
    }

    // Dynamic mock trends based on hash of client ID or standard variations
    const clientHash = activeClient ? activeClient.id.charCodeAt(0) % 5 : 2;
    const trends = {
      sales: { pct: 12.4 + clientHash * 1.5, pos: true },
      sessions: { pct: 8.2 + clientHash * 0.8, pos: true },
      cvr: { pct: -1.2 + clientHash * 0.5, pos: clientHash > 2 },
      orders: { pct: 14.5 + clientHash * 1.2, pos: true },
      aov: { pct: 2.1 + clientHash * 0.4, pos: true },
      cpa: { pct: -5.4 - clientHash * 0.6, pos: true }, // CPA falling is positive!
    };

    return { multiplier, daysCount, label, trends };
  }, [datePreset, activeClient]);

  // ── 3. Time Series Generator (Main Chart & Sparklines) ────────────────────
  const timeSeriesData = useMemo(() => {
    const data: any[] = [];
    const N = rangeDetails.daysCount;
    const mult = rangeDetails.multiplier;
    const base = baseMetrics;

    // Distribute core values across date points with random variance
    let accumulatedSales = 0;
    let accumulatedSessions = 0;
    let accumulatedOrders = 0;

    const seedRandom = (i: number) => {
      const x = Math.sin(i * 12345.67) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < N; i++) {
      // Date label formatting
      let dateLabel = '';
      if (datePreset === 'today' || datePreset === 'yesterday') {
        dateLabel = `${i * 2}:00`;
      } else if (datePreset === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - (N - 1 - i));
        dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      } else if (datePreset === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - (N - 1 - i) * 2);
        dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      } else if (datePreset === '90d') {
        dateLabel = `Week ${i + 1}`;
      } else if (datePreset === 'ytd' || datePreset === 'all') {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        dateLabel = months[i % 12];
      }

      // Variation factor
      const varFactor = 0.7 + seedRandom(i) * 0.6;
      const compVarFactor = 0.65 + seedRandom(i + 50) * 0.55;

      const salesVal = ((base.sales * mult) / N) * varFactor;
      const sessionsVal = Math.round(((base.sessions * mult) / N) * varFactor);
      const ordersVal = Math.max(1, Math.round(((base.conversions * mult) / N) * varFactor));
      const cvrVal = sessionsVal > 0 ? (ordersVal / sessionsVal) * 100 : 2.85;
      const aovVal = ordersVal > 0 ? salesVal / ordersVal : 2070.60;
      const cpaVal = ordersVal > 0 ? (((base.spend * mult) / N) * varFactor) / ordersVal : 450.00;

      // Comparison period
      const compSalesVal = ((base.sales * mult * 0.88) / N) * compVarFactor;
      const compSessionsVal = Math.round(((base.sessions * mult * 0.92) / N) * compVarFactor);
      const compOrdersVal = Math.max(1, Math.round(((base.conversions * mult * 0.85) / N) * compVarFactor));
      const compCvrVal = compSessionsVal > 0 ? (compOrdersVal / compSessionsVal) * 100 : 2.80;
      const compAovVal = compOrdersVal > 0 ? compSalesVal / compOrdersVal : 2000;
      const compCpaVal = compOrdersVal > 0 ? (((base.spend * mult * 0.9) / N) * compVarFactor) / compOrdersVal : 470.00;

      data.push({
        date: dateLabel,
        sales: Math.round(salesVal),
        sessions: sessionsVal,
        orders: ordersVal,
        cvr: Number(cvrVal.toFixed(2)),
        aov: Math.round(aovVal),
        cpa: Math.round(cpaVal),
        // Comparison period fields
        compSales: Math.round(compSalesVal),
        compSessions: compSessionsVal,
        compOrders: compOrdersVal,
        compCvr: Number(compCvrVal.toFixed(2)),
        compAov: Math.round(compAovVal),
        compCpa: Math.round(compCpaVal)
      });
    }

    return data;
  }, [baseMetrics, rangeDetails, datePreset]);

  // ── 4. Build Shopify Bento Metrics ──────────────────────────────────────────
  const bentoMetrics = useMemo(() => {
    const base = baseMetrics;
    const mult = rangeDetails.multiplier;
    const trends = rangeDetails.trends;

    return [
      {
        id: 'sales',
        label: 'Total sales',
        value: `₹${Math.round(base.sales * mult).toLocaleString('en-IN')}`,
        subtext: trends.sales.pct > 0 ? `+${trends.sales.pct.toFixed(1)}%` : `${trends.sales.pct.toFixed(1)}%`,
        pos: trends.sales.pos,
        icon: <IndianRupee className="w-4 h-4" />,
        sparkKey: 'sales',
        compSparkKey: 'compSales',
        tooltip: 'The total value of orders placed. Includes shipping, taxes, and discounts.'
      },
      {
        id: 'sessions',
        label: 'Online store sessions',
        value: Math.round(base.sessions * mult).toLocaleString('en-IN'),
        subtext: trends.sessions.pct > 0 ? `+${trends.sessions.pct.toFixed(1)}%` : `${trends.sessions.pct.toFixed(1)}%`,
        pos: trends.sessions.pos,
        icon: <Users className="w-4 h-4" />,
        sparkKey: 'sessions',
        compSparkKey: 'compSessions',
        tooltip: 'A session is a period of active interaction by a unique visitor. Multiple visits count as one session.'
      },
      {
        id: 'cvr',
        label: 'Online store conversion rate',
        value: `${base.cvr.toFixed(2)}%`,
        subtext: trends.cvr.pct > 0 ? `+${trends.cvr.pct.toFixed(1)}%` : `${trends.cvr.pct.toFixed(1)}%`,
        pos: trends.cvr.pos,
        icon: <Percent className="w-4 h-4" />,
        sparkKey: 'cvr',
        compSparkKey: 'compCvr',
        tooltip: 'The percentage of sessions that resulted in an order.'
      },
      {
        id: 'orders',
        label: 'Total orders',
        value: Math.round(base.conversions * mult).toLocaleString('en-IN'),
        subtext: trends.orders.pct > 0 ? `+${trends.orders.pct.toFixed(1)}%` : `${trends.orders.pct.toFixed(1)}%`,
        pos: trends.orders.pos,
        icon: <Target className="w-4 h-4" />,
        sparkKey: 'orders',
        compSparkKey: 'compOrders',
        tooltip: 'The total number of conversion orders generated from ad channels.'
      },
      {
        id: 'aov',
        label: 'Average order value',
        value: `₹${Math.round(base.aov).toLocaleString('en-IN')}`,
        subtext: trends.aov.pct > 0 ? `+${trends.aov.pct.toFixed(1)}%` : `${trends.aov.pct.toFixed(1)}%`,
        pos: trends.aov.pos,
        icon: <MousePointer className="w-4 h-4" />,
        sparkKey: 'aov',
        compSparkKey: 'compAov',
        tooltip: 'Average spend per order (Total sales divided by total orders).'
      },
      {
        id: 'cpa',
        label: 'Cost Per Acquisition (CPA)',
        value: `₹${Math.round(base.cpa).toLocaleString('en-IN')}`,
        subtext: trends.cpa.pct > 0 ? `${trends.cpa.pct.toFixed(1)}%` : `+${trends.cpa.pct.toFixed(1)}%`,
        pos: trends.cpa.pos, // CPA falling is positive
        icon: <Activity className="w-4 h-4" />,
        sparkKey: 'cpa',
        compSparkKey: 'compCpa',
        tooltip: 'The average marketing cost required to generate one acquisition lead/order.'
      }
    ];
  }, [baseMetrics, rangeDetails]);

  // ── 5. Attributing Channels & Devices ──────────────────────────────────────
  const channelBreakdown = useMemo(() => {
    const totalSales = baseMetrics.sales * rangeDetails.multiplier;
    const totalSessions = baseMetrics.sessions * rangeDetails.multiplier;
    
    // Extrapolate Meta, Google from actual campaigns, inject standard Organic/Direct/Email ratios
    let metaSpend = 0;
    let googleSpend = 0;
    campaigns.forEach((c: any) => {
      const plat = String(c.platform || c.channel || '').toLowerCase();
      if (plat.includes('meta') || plat.includes('facebook') || plat.includes('instagram')) {
        metaSpend += c.spend || 0;
      } else if (plat.includes('google') || plat.includes('youtube')) {
        googleSpend += c.spend || 0;
      }
    });

    const metaRatio = metaSpend > 0 ? metaSpend / (metaSpend + googleSpend || 1) : 0.55;
    const googleRatio = 1 - metaRatio;

    // Shopify-style sales channels data
    const channels = [
      { name: 'Meta Ads', sales: totalSales * 0.42 * metaRatio, sessions: totalSessions * 0.38, color: 'bg-indigo-650' },
      { name: 'Google Ads', sales: totalSales * 0.35 * googleRatio, sessions: totalSessions * 0.32, color: 'bg-emerald-600' },
      { name: 'Organic Search', sales: totalSales * 0.12, sessions: totalSessions * 0.18, color: 'bg-slate-400' },
      { name: 'Direct Traffic', sales: totalSales * 0.08, sessions: totalSessions * 0.09, color: 'bg-amber-500' },
      { name: 'Email Marketing', sales: totalSales * 0.03, sessions: totalSessions * 0.03, color: 'bg-violet-500' },
    ];

    const sumSales = channels.reduce((s, c) => s + c.sales, 0);
    return channels.map(c => ({
      ...c,
      pct: (c.sales / (sumSales || 1)) * 100
    })).sort((a, b) => b.sales - a.sales);
  }, [baseMetrics, rangeDetails, campaigns]);

  const deviceBreakdown = useMemo(() => {
    return [
      { name: 'Mobile Devices', pct: 72, sessions: Math.round(baseMetrics.sessions * rangeDetails.multiplier * 0.72), icon: <Smartphone className="w-3.5 h-3.5 text-slate-500" /> },
      { name: 'Desktop/Laptop', pct: 24, sessions: Math.round(baseMetrics.sessions * rangeDetails.multiplier * 0.24), icon: <Monitor className="w-3.5 h-3.5 text-slate-500" /> },
      { name: 'Tablets', pct: 4, sessions: Math.round(baseMetrics.sessions * rangeDetails.multiplier * 0.04), icon: <Tablet className="w-3.5 h-3.5 text-slate-500" /> }
    ];
  }, [baseMetrics, rangeDetails]);

  // Indian States Sessions Mock data (adapted to Client totals)
  const locationBreakdown = useMemo(() => {
    const totalSessions = baseMetrics.sessions * rangeDetails.multiplier;
    const states = [
      { name: 'Maharashtra', sessions: Math.round(totalSessions * 0.28), change: '+14.2%', pos: true },
      { name: 'Delhi NCR', sessions: Math.round(totalSessions * 0.22), change: '+8.4%', pos: true },
      { name: 'Karnataka', sessions: Math.round(totalSessions * 0.16), change: '+11.5%', pos: true },
      { name: 'Tamil Nadu', sessions: Math.round(totalSessions * 0.12), change: '-2.1%', pos: false },
      { name: 'Telangana', sessions: Math.round(totalSessions * 0.09), change: '+5.7%', pos: true },
      { name: 'Gujarat', sessions: Math.round(totalSessions * 0.07), change: '+1.4%', pos: true },
      { name: 'Uttar Pradesh', sessions: Math.round(totalSessions * 0.06), change: '-4.6%', pos: false },
    ];
    return states;
  }, [baseMetrics, rangeDetails]);

  // Main chart configs based on clicked bento card
  const mainChartConfig = useMemo(() => {
    const item = bentoMetrics.find(m => m.id === activeMetricId) || bentoMetrics[0];
    return {
      title: `${item.label} over time`,
      dataKey: item.sparkKey,
      compDataKey: item.compSparkKey,
      yFormatter: (v: number) => {
        if (item.id === 'sales' || item.id === 'aov' || item.id === 'cpa') return `₹${v.toLocaleString('en-IN')}`;
        if (item.id === 'cvr') return `${v}%`;
        return v.toLocaleString('en-IN');
      }
    };
  }, [activeMetricId, bentoMetrics]);

  // Top campaigns list directly showing CTRs formatted to 2 decimals
  const topCampaignsList = useMemo(() => {
    return campaigns.slice(0, 5).sort((a: any, b: any) => (b.spend || 0) - (a.spend || 0));
  }, [campaigns]);

  // Register page context for AI Brain service
  useEffect(() => {
    setPageContext({
      page: 'analytics',
      data: {
        datePreset,
        compareEnabled,
        sales: Math.round(baseMetrics.sales * rangeDetails.multiplier),
        sessions: Math.round(baseMetrics.sessions * rangeDetails.multiplier),
        orders: Math.round(baseMetrics.conversions * rangeDetails.multiplier),
        cvr: Number(baseMetrics.cvr.toFixed(2)),
        aov: Math.round(baseMetrics.aov),
        cpa: Math.round(baseMetrics.cpa),
        topChannels: channelBreakdown.map(c => ({ name: c.name, sales: Math.round(c.sales), pct: Number(c.pct.toFixed(1)) }))
      }
    });
  }, [baseMetrics, datePreset, compareEnabled, rangeDetails, channelBreakdown, setPageContext]);

  return (
    <PageWrapper>
      {/* ─── Header & Date Preset Picker ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Analytics</h1>
          <p className="text-xs text-slate-500 mt-1">
            {activeClient ? (
              <span>Performance and business intelligence for <strong>{activeClient.name}</strong></span>
            ) : (
              'Store performance metrics compiled from integrated tracking endpoints'
            )}
          </p>
        </div>

        {/* Date Range Selector Dropdown (Shopify Style) */}
        <div className="flex flex-wrap items-center gap-2.5 self-stretch sm:self-auto">
          {/* Comparison checkbox */}
          <label className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl h-9 px-3.5 text-xs font-bold text-slate-650 cursor-pointer shadow-sm select-none hover:bg-slate-50 transition-colors">
            <input 
              type="checkbox" 
              checked={compareEnabled} 
              onChange={(e) => setCompareEnabled(e.target.checked)}
              className="accent-indigo-650 rounded border-slate-350 cursor-pointer"
            />
            Compare: previous period
          </label>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setOpenDropdown(!openDropdown)}
              className="flex items-center justify-between gap-2.5 h-9 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-md cursor-pointer select-none"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{activePreset.label}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {openDropdown && (
              <div className="absolute right-0 top-11 z-50 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 mt-1 select-none">
                {DATE_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setDatePreset(preset.id);
                      setOpenDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors cursor-pointer border-0 bg-transparent`}
                  >
                    <div>
                      <p className="font-bold">{preset.label}</p>
                      <p className="text-[9px] text-slate-400 font-medium">{preset.sub}</p>
                    </div>
                    {datePreset === preset.id && <Check className="w-3.5 h-3.5 text-indigo-650" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Bento Grid of Metric Cards (Shopify Style) ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {bentoMetrics.map(card => {
          const isActive = activeMetricId === card.id;
          return (
            <div 
              key={card.id}
              onClick={() => setActiveMetricId(card.id)}
              className={`bg-white rounded-2xl border p-4 sm:p-5 cursor-pointer relative overflow-hidden transition-all select-none hover:shadow-md
                ${isActive ? 'border-indigo-600 ring-1 ring-indigo-600 shadow-sm' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-2.5 mb-2">
                <div className="flex items-center gap-1.5 text-slate-405 group">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{card.label}</span>
                  <Info className="w-3.5 h-3.5 text-slate-350 cursor-help" title={card.tooltip} />
                </div>
                <div className={`p-1.5 rounded-lg ${isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-400'}`}>
                  {card.icon}
                </div>
              </div>

              <div className="flex items-baseline gap-2.5">
                <p className="text-2xl font-black text-slate-900 tracking-tight font-['JetBrains_Mono']">{card.value}</p>
                <span className={`inline-flex items-center gap-0.5 text-xs font-extrabold px-2 py-0.5 rounded-full
                  ${card.pos ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}
                >
                  {card.pos ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {card.subtext}
                </span>
              </div>

              {/* Sparkline trend inside the card */}
              <div className="h-11 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeriesData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <defs>
                      <linearGradient id={`grad-${card.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isActive ? "#4f46e5" : "#94a3b8"} stopOpacity={0.12} />
                        <stop offset="95%" stopColor={isActive ? "#4f46e5" : "#94a3b8"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    {compareEnabled && (
                      <Area 
                        type="monotone" 
                        dataKey={card.compSparkKey} 
                        stroke="#cbd5e1" 
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        fill="none" 
                        dot={false}
                      />
                    )}
                    <Area 
                      type="monotone" 
                      dataKey={card.sparkKey} 
                      stroke={isActive ? "#4f46e5" : "#64748b"} 
                      strokeWidth={1.8} 
                      fill={`url(#grad-${card.id})`}
                      dot={false} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between border-t border-slate-50 mt-3 pt-2 text-[10px] text-slate-400 font-semibold">
                <span>{rangeDetails.label}</span>
                <span className={`flex items-center gap-0.5 ${isActive ? 'text-indigo-650' : 'text-slate-400'} group-hover:text-indigo-600`}>
                  View report <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Main Trend Chart (Shopify Style Comparison Overlay) ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main interactive chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 capitalize">{mainChartConfig.title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Current range: <span className="font-semibold text-slate-650">{rangeDetails.label}</span>
                {compareEnabled && (
                  <span> vs <span className="font-semibold text-slate-650">previous period (dashed line)</span></span>
                )}
              </p>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest select-none">
              Interactive
            </span>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="mainAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} 
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={mainChartConfig.yFormatter} 
              />
              <Tooltip 
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, color: '#fff', fontSize: 11 }}
                formatter={(v: any, name: any) => {
                  const label = name === mainChartConfig.dataKey ? 'Current' : 'Previous';
                  return [mainChartConfig.yFormatter(Number(v)), label];
                }}
              />
              {compareEnabled && (
                <Area 
                  type="monotone" 
                  dataKey={mainChartConfig.compDataKey} 
                  stroke="#cbd5e1" 
                  strokeWidth={2} 
                  strokeDasharray="4 4" 
                  fill="none" 
                  dot={false} 
                />
              )}
              <Area 
                type="monotone" 
                dataKey={mainChartConfig.dataKey} 
                stroke="#4f46e5" 
                strokeWidth={2.5} 
                fill="url(#mainAreaGrad)" 
                dot={{ r: 3, fill: '#fff', stroke: '#4f46e5', strokeWidth: 1.5 }}
                activeDot={{ r: 5, stroke: '#4f46e5', strokeWidth: 2, fill: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Sales by Channel progress list (Shopify Style) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Sales by sales channel</h3>
            <p className="text-xs text-slate-400 mt-0.5">Orders routed per ad and organic referrers</p>
          </div>

          <div className="space-y-4 flex-1">
            {channelBreakdown.map(channel => (
              <div key={channel.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-700">{channel.name}</span>
                  <div className="text-right">
                    <span className="text-slate-900 font-bold">₹{Math.round(channel.sales).toLocaleString('en-IN')}</span>
                    <span className="text-slate-400 font-medium ml-1.5">{channel.pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${channel.color}`} style={{ width: `${channel.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          <button className="w-full h-9 border border-slate-200 hover:bg-slate-50 transition-colors text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1 mt-4">
            View channel report <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Location & Devices Breakdown Card ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sessions by Location Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Sessions by location</h3>
            <p className="text-xs text-slate-400 mt-0.5">Top Indian regions driving storefront visits</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="pb-2.5">Region</th>
                  <th className="pb-2.5 text-right">Sessions</th>
                  <th className="pb-2.5 text-right w-[150px]">Distribution</th>
                  <th className="pb-2.5 text-right">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {locationBreakdown.map((loc, idx) => {
                  const maxSessions = locationBreakdown[0].sessions;
                  const pctWidth = (loc.sessions / (maxSessions || 1)) * 100;
                  return (
                    <tr key={loc.name} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 font-semibold text-slate-700">{loc.name}</td>
                      <td className="py-3 text-right font-bold text-slate-900 font-['JetBrains_Mono']">{loc.sessions.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-full">
                          <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${pctWidth}%` }} />
                        </div>
                      </td>
                      <td className={`py-3 text-right font-extrabold ${loc.pos ? 'text-emerald-600' : 'text-red-500'}`}>
                        {loc.change}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sessions by Device Type (Polaris Style) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-900">Sessions by device type</h3>
              <p className="text-xs text-slate-400 mt-0.5">Visits parsed by user agent layouts</p>
            </div>

            <div className="space-y-4">
              {deviceBreakdown.map(device => (
                <div key={device.name} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                    {device.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-700 truncate">{device.name}</span>
                      <span className="text-slate-900 font-bold font-['JetBrains_Mono']">{device.pct}%</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium mt-0.5">
                      <span>{device.sessions.toLocaleString()} sessions</span>
                      <div className="h-1.5 bg-slate-100 rounded-full w-24 overflow-hidden">
                        <div className="h-full bg-slate-500 rounded-full" style={{ width: `${device.pct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4 text-[11px] text-slate-400 font-semibold flex items-center gap-1.5 justify-center">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Optimised for Mobile conversion loops
          </div>
        </div>
      </div>

      {/* ─── Top Campaigns table with 2 decimal CTRs ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Marketing campaign referrers</h3>
            <p className="text-xs text-slate-400 mt-0.5">Conversion ledger for top ad sets</p>
          </div>
          <button className="h-8 px-3 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-650 hover:bg-slate-50 flex items-center gap-1.5 shadow-sm cursor-pointer select-none">
            <Download className="w-3.5 h-3.5" /> Export ledger
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-150 text-slate-450 font-bold uppercase tracking-wider text-[10px]">
                <th className="pb-3">Campaign</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 text-center">Source</th>
                <th className="pb-3 text-right">Spend</th>
                <th className="pb-3 text-right">Conversions</th>
                <th className="pb-3 text-right">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {topCampaignsList.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 font-semibold text-slate-700 max-w-[200px] truncate">{c.name}</td>
                  <td className="py-3 text-center">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-3 text-center">
                    <PlatformDot platform={c.channel} />
                  </td>
                  <td className="py-3 text-right font-bold text-slate-900 font-['JetBrains_Mono']">
                    ₹{(c.spend || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 text-right font-semibold text-slate-700 font-['JetBrains_Mono']">
                    {(c.conv || 0).toLocaleString()}
                  </td>
                  <td className="py-3 text-right font-black text-indigo-650 font-['JetBrains_Mono']">
                    {Number(c.ctr || 0).toFixed(2)}%
                  </td>
                </tr>
              ))}
              {topCampaignsList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                    No campaigns linked to active store metrics
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageWrapper>
  );
}
