import { useApp } from '../context/AppContext';
import {
  ChevronLeft, ChevronRight, Share2, Download, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, Calendar, X, Check, Link2,
  ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  ScatterChart, Scatter, ZAxis,
  PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip,
  ReferenceLine, Legend,
  ComposedChart,
} from 'recharts';
import ClientBadge from '../components/shared/ClientBadge';
import PlatformDot from '../components/shared/PlatformDot';
import StatusBadge from '../components/shared/StatusBadge';
import WidgetRenderer from '../components/shared/WidgetRenderer';
import {
  formatInr, getAlerts, getConnectedPlatforms,
  getPerformanceSummary, getRecommendations,
} from '../../services/insights.service';
import { apiService, SOCKET_URL } from '../../services/api.service';
import { mockMonthlyTrend } from '../../services/mock-data';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const PLATFORM_COLOR: Record<string,string> = {
  Meta: '#1877F2', Google: '#34A853', TikTok: '#FF004F',
  LinkedIn: '#0A66C2', YouTube: '#FF0000', Other: '#94a3b8',
};
const PALETTE = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#3b82f6'];

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtInr(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
}
function fmtInrDec(v: number, d = 2) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0);
}
function fmtK(v: number) {
  if (!v) return '0';
  if (v >= 1e7) return `${(v/1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `${(v/1e5).toFixed(1)}L`;
  if (v >= 1000) return `${(v/1000).toFixed(1)}k`;
  return v.toLocaleString('en-IN');
}
function fmtNum(v: number) { return v.toLocaleString('en-IN'); }
function daysBetween(s: string, e: string) {
  const ms = new Date(e).getTime() - new Date(s).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-[11px] rounded-xl px-3 py-2 shadow-2xl border border-slate-700 max-w-[220px]">
      {label && <p className="font-bold text-slate-300 mb-1.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color ?? p.fill }} className="font-semibold">{p.name}</span>
          <span className="font-black text-white">{typeof p.value === 'number' ? fmtK(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────
function Panel({ children, className = '', title, subtitle }: {
  children: React.ReactNode; className?: string; title?: string; subtitle?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden ${className}`}>
      {title && (
        <div className="px-5 pt-5 pb-0">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 mb-3">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Month Picker ─────────────────────────────────────────────────────────────
function MonthPicker({ value, onChange }: {
  value: { month: number; year: number };
  onChange: (v: { month: number; year: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(value.year);
  const ref = useRef<HTMLDivElement>(null);
  const now = new Date();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function isFuture(m: number) {
    return pickerYear > now.getFullYear() || (pickerYear === now.getFullYear() && m > now.getMonth());
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); setPickerYear(value.year); }}
        className="flex items-center gap-2 h-9 px-4 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer border-0 select-none"
      >
        <Calendar className="w-3.5 h-3.5" />
        {MONTHS_FULL[value.month]} {value.year}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute top-11 left-0 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 select-none"
          >
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerYear(y => y - 1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center cursor-pointer border-0 bg-transparent">
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <span className="text-sm font-bold text-slate-900">{pickerYear}</span>
              <button onClick={() => setPickerYear(y => y + 1)} disabled={pickerYear >= now.getFullYear()} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center cursor-pointer border-0 bg-transparent disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MONTHS_SHORT.map((m, i) => {
                const sel = i === value.month && pickerYear === value.year;
                const cur = i === now.getMonth() && pickerYear === now.getFullYear();
                const dis = isFuture(i);
                return (
                  <button key={m} disabled={dis}
                    onClick={() => { onChange({ month: i, year: pickerYear }); setOpen(false); }}
                    className={`h-10 rounded-xl text-xs font-bold transition-all cursor-pointer border-0
                      ${dis ? 'opacity-20 cursor-not-allowed bg-transparent text-slate-400' :
                        sel ? 'bg-indigo-600 text-white shadow-md' :
                        cur ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' :
                        'text-slate-700 bg-transparent hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                  >{m}</button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
              {[
                { label: 'This month', m: now.getMonth(), y: now.getFullYear() },
                { label: 'Last month', m: now.getMonth() === 0 ? 11 : now.getMonth() - 1, y: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear() },
              ].map(s => (
                <button key={s.label} onClick={() => { onChange({ month: s.m, year: s.y }); setOpen(false); }}
                  className="flex-1 h-8 rounded-lg text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 cursor-pointer border-0">
                  {s.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─── Multi-select dropdown ────────────────────────────────────────────────────
function MultiSelect({ label, options, value, onChange }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(x => x !== opt) : [...value, opt]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-bold transition-all cursor-pointer
          ${value.length > 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
      >
        {label}{value.length > 0 && <span className="bg-white/25 rounded-full px-1.5 py-0.5 text-[10px]">{value.length}</span>}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-10 left-0 z-50 min-w-[180px] bg-white rounded-xl shadow-xl border border-slate-100 py-2"
          >
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer border-0 bg-transparent text-left"
              >
                <div className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 transition-all
                  ${value.includes(opt) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                  {value.includes(opt) && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                {opt}
              </button>
            ))}
            {value.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="w-full text-[11px] font-bold text-red-500 hover:text-red-700 px-3 py-1.5 mt-1 border-t border-slate-100 cursor-pointer bg-transparent border-0 text-left"
              >
                Clear all
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, accent }: {
  label: string; value: string; sub: string;
  trend: 'up' | 'down' | 'neutral'; accent: string;
}) {
  return (
    <motion.div whileHover={{ y: -2 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent}`} />
      <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-2xl font-black text-slate-900 leading-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </p>
      <div className="flex items-center gap-1 mt-2">
        {trend === 'up'   && <TrendingUp   className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
        {trend === 'down' && <TrendingDown className="w-3 h-3 text-red-500 flex-shrink-0" />}
        {trend === 'neutral' && <Minus     className="w-3 h-3 text-slate-400 flex-shrink-0" />}
        <p className={`text-[11px] font-semibold truncate ${
          trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-400'
        }`}>{sub}</p>
      </div>
    </motion.div>
  );
}

// ─── Share modal ──────────────────────────────────────────────────────────────
function ShareModal({ onClose, name }: { onClose: () => void; name: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${window.location.pathname}?shared=1&dash=${encodeURIComponent(name)}`;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.16 }}
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Share Dashboard</h2>
            <p className="text-xs text-slate-400 mt-0.5">Read-only snapshot link — anyone can view</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center cursor-pointer border-0 bg-transparent">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-600 font-mono truncate">{link}</div>
          <button
            onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
            className={`h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border-0 transition-all
              ${copied ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 text-center">For PowerPoint export, upgrade to MIP Pro</p>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function DashboardViewerScreen() {
  const now = new Date();
  
  useEffect(() => {
    console.log("MIP Dashboard Viewer loaded with Chronological months!");
  }, []);

  // Default to March 2026 — where mock campaign data lives
  const [monthYear, setMonthYear]   = useState({ month: 2, year: 2026 });
  const [showShare, setShowShare]   = useState(false);
  const [sortCol, setSortCol]       = useState('amount_spent');
  const [sortDir, setSortDir]       = useState<'asc'|'desc'>('desc');

  // Advanced Meta-style Date Range Picker States
  const [startDate, setStartDate] = useState<string>('2026-05-01');
  const [endDate, setEndDate] = useState<string>('2026-05-25');
  const [tempStartDate, setTempStartDate] = useState<string>('2026-05-01');
  const [tempEndDate, setTempEndDate] = useState<string>('2026-05-25');
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [compareEnabled, setCompareEnabled] = useState<boolean>(false);
  const [comparePreset, setComparePreset] = useState<string>('previous_period');
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const [selectedRangeLabel, setSelectedRangeLabel] = useState('1 May 2026 - 25 May 2026');

  // Calendar month/year navigation state (Left month is indexed 4 = May 2026)
  const [leftMonth, setLeftMonth] = useState<number>(4);
  const [leftYear, setLeftYear] = useState<number>(2026);

  const rightMonth = (leftMonth + 1) % 12;
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear;

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getCalendarDays = (month: number, year: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();
    const days: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  };

  const handlePrevMonth = () => {
    setLeftMonth(prev => {
      if (prev === 0) {
        setLeftYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    setLeftMonth(prev => {
      if (prev === 11) {
        setLeftYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  // ── Filters ──────────────────────────────────────────────────────────────
  const [fPlatform,  setFPlatform]  = useState<string[]>([]);
  const [fProduct,   setFProduct]   = useState<string[]>([]);
  const [fFormat,    setFFormat]    = useState<string[]>([]);
  const [fAudience,  setFAudience]  = useState<string[]>([]);
  const [fTarget,    setFTarget]    = useState<string[]>([]);

  const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const { selectedDashboard, setSelectedDashboard, dashboards, campaigns, integrations, pinnedWidgets = [], removePinnedWidget, reorderPinnedWidgets } = useApp();
  const { CLIENTS: clients } = useApp() as any;
  const queryClient = useQueryClient();

  const [draggedWidgetId, setDraggedWidgetId] = useState<number | null>(null);

  const dashboard = dashboards.find((d: any) => d.id === selectedDashboard);
  if (!dashboard) return null;
  const client = clients?.find((c: any) => c.id === dashboard.clientId);

  const currentPinnedWidgets = useMemo(() => pinnedWidgets.filter((w: any) => w.dashboardId === selectedDashboard), [pinnedWidgets, selectedDashboard]);

  const from = useMemo(() => new Date(startDate), [startDate]);
  const to   = useMemo(() => new Date(`${endDate}T23:59:59.999Z`), [endDate]);
  const querySuffix = [dashboard.clientId, monthYear.month, monthYear.year];

  const { data: liveCampaignRows = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns', dashboard.clientId, startDate, endDate],
    queryFn: () => apiService.getDashboardCampaigns({ clientId: dashboard.clientId, from: from.toISOString(), to: to.toISOString(), status: 'active' }),
  });
  const { data: lastSynced } = useQuery({
    queryKey: ['last-synced', dashboard.clientId],
    queryFn: () => apiService.getLastSynced(dashboard.clientId),
  });
  const { data: apiMonthlyTrend = [] } = useQuery({
    queryKey: ['monthly-trend', dashboard.clientId, startDate, endDate],
    queryFn: () => apiService.getMonthlyTrend({ clientId: dashboard.clientId, from: from.toISOString(), to: to.toISOString() }),
  });

  useEffect(() => {
    const socket = io(SOCKET_URL, { query: { tenantId: apiService.tenantId } });
    socket.on('data:ready', () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Dashboard updated with latest data');
    });
    return () => { socket.disconnect(); };
  }, [queryClient]);

  // ── Raw campaign list — live data OR mock fallback ──────────────────────────
  const allRawCampaigns: any[] = ((liveCampaignRows as any[]).length || !apiService.isMockMode)
    ? (liveCampaignRows as any[]).map((c: any) => ({
        ...c,
        ad_name: c.ad_name || c.name || c.campaignName,
        product_category: c.product_category || 'Unknown',
        campaign_target: c.campaign_target || 'Traffic',
        audience_type: c.audience_type || 'Cold',
        ad_format: c.ad_format || 'Single Image',
        platform: c.platform || c.channel,
        amount_spent: c.amount_spent || c.spend || 0,
        reach: c.reach || Math.round((c.impressions || 0) / Math.max(c.frequency || 1, 1)),
      }))
    : campaigns
        .filter((c: any) => c.clientId === dashboard.clientId)
        .map((c: any) => ({
          ...c,
          ad_name: c.ad_name || c.name,
          product_category: c.product_category || 'Unknown',
          campaign_target: c.campaign_target || 'Traffic',
          audience_type: c.audience_type || 'Cold',
          ad_format: c.ad_format || 'Single Image',
          platform: c.platform || c.channel,
          amount_spent: c.amount_spent || c.spend || 0,
          reach: c.reach || Math.round((c.impressions || 0) / Math.max(c.frequency || 1, 1)),
        }));

  // Dynamically filter campaigns to isolate Meta Ads vs Google Ads per dashboard
  const rawCampaigns = dashboard.platform
    ? allRawCampaigns.filter((c: any) => {
        const plat = String(c.platform || c.channel || '').toLowerCase();
        const targetPlat = String(dashboard.platform).toLowerCase();
        return plat.includes(targetPlat.replace(/ ads$/i, '')) || targetPlat.includes(plat.replace(/ ads$/i, ''));
      })
    : allRawCampaigns;

  // ── Filter options ──────────────────────────────────────────────────────────
  const uniq = (key: string) => [...new Set(rawCampaigns.map((c: any) => c[key]).filter(Boolean))] as string[];
  const platforms  = uniq('platform');
  const products   = uniq('product_category');
  const formats    = uniq('ad_format');
  const audiences  = uniq('audience_type');
  const targets    = uniq('campaign_target');

  // ── Apply filters ──────────────────────────────────────────────────────────
  const ads: any[] = rawCampaigns.filter((c: any) => {
    if (fPlatform.length  && !fPlatform.includes(c.platform))          return false;
    if (fProduct.length   && !fProduct.includes(c.product_category))   return false;
    if (fFormat.length    && !fFormat.includes(c.ad_format))           return false;
    if (fAudience.length  && !fAudience.includes(c.audience_type))     return false;
    if (fTarget.length    && !fTarget.includes(c.campaign_target))     return false;
    return true;
  });

  const hasFilters = fPlatform.length || fProduct.length || fFormat.length || fAudience.length || fTarget.length;

  // ── Aggregate KPIs ─────────────────────────────────────────────────────────
  const totalSpend       = ads.reduce((s, c) => s + (c.amount_spent || 0), 0);
  const totalImpressions = ads.reduce((s, c) => s + (c.impressions || 0), 0);
  const totalReach       = ads.reduce((s, c) => s + (c.reach || 0), 0);
  const totalClicks      = ads.reduce((s, c) => s + (c.clicks || 0), 0);
  const avgCtr           = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc           = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCpm           = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgFreq          = totalReach > 0 ? totalImpressions / totalReach : 0;

  const connectedPlatforms = getConnectedPlatforms(integrations);

  // ── Trend arrows (vs previous period — mocked ±) ───────────────────────────
  function trendOf(curr: number, pct: number): 'up'|'down'|'neutral' {
    return pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral';
  }
  const spendTrend = ads.reduce((s, c) => s + (c.change || 0), 0) / Math.max(ads.length, 1);

  // ── Chart datasets ─────────────────────────────────────────────────────────

  // Platform spend donut
  const byPlatformSpend = Object.entries(
    ads.reduce((acc: any, c) => { acc[c.platform] = (acc[c.platform]||0) + c.amount_spent; return acc; }, {})
  ).map(([name, spend]) => ({ name, spend: spend as number }));

  // CPC by platform
  const byPlatformCpc = Object.entries(
    ads.reduce((acc: any, c) => {
      if (!acc[c.platform]) acc[c.platform] = { spend: 0, clicks: 0 };
      acc[c.platform].spend  += c.amount_spent || 0;
      acc[c.platform].clicks += c.clicks || 0;
      return acc;
    }, {})
  ).map(([name, v]: any) => ({ name, cpc: v.clicks > 0 ? v.spend / v.clicks : 0 }))
   .sort((a, b) => b.cpc - a.cpc);

  // CTR by ad format
  const byFormat = Object.entries(
    ads.reduce((acc: any, c) => {
      if (!acc[c.ad_format]) acc[c.ad_format] = { clicks: 0, impressions: 0 };
      acc[c.ad_format].clicks      += c.clicks || 0;
      acc[c.ad_format].impressions += c.impressions || 0;
      return acc;
    }, {})
  ).map(([name, v]: any) => ({ name, ctr: v.impressions > 0 ? Number(((v.clicks / v.impressions) * 100).toFixed(2)) : 0 }))
   .sort((a, b) => b.ctr - a.ctr);

  // Spend vs Reach by audience
  const byAudience = Object.entries(
    ads.reduce((acc: any, c) => {
      if (!acc[c.audience_type]) acc[c.audience_type] = { spend: 0, reach: 0 };
      acc[c.audience_type].spend += c.amount_spent || 0;
      acc[c.audience_type].reach += c.reach || 0;
      return acc;
    }, {})
  ).map(([name, v]: any) => ({ name, spend: Math.round(v.spend / 1000), reach: Math.round(v.reach / 1000) }));

  // Spend by product
  const byProductSpend = Object.entries(
    ads.reduce((acc: any, c) => { acc[c.product_category] = (acc[c.product_category]||0) + c.amount_spent; return acc; }, {})
  ).map(([name, spend]) => ({ name, spend: spend as number })).sort((a, b) => b.spend - a.spend);

  // CPC by product
  const byProductCpc = Object.entries(
    ads.reduce((acc: any, c) => {
      if (!acc[c.product_category]) acc[c.product_category] = { spend: 0, clicks: 0 };
      acc[c.product_category].spend  += c.amount_spent || 0;
      acc[c.product_category].clicks += c.clicks || 0;
      return acc;
    }, {})
  ).map(([name, v]: any) => ({ name, cpc: v.clicks > 0 ? v.spend / v.clicks : 0 }))
   .sort((a, b) => b.cpc - a.cpc);

  // Frequency by ad name
  const freqByAd = [...ads]
    .filter(c => (c.frequency || 0) > 0)
    .map(c => ({ name: c.ad_name?.substring(0, 22) + (c.ad_name?.length > 22 ? '…' : ''), freq: Number((c.frequency||0).toFixed(1)) }))
    .sort((a, b) => b.freq - a.freq);

  // Reach vs Impressions by platform
  const reachVsImpr = Object.entries(
    ads.reduce((acc: any, c) => {
      if (!acc[c.platform]) acc[c.platform] = { reach: 0, impressions: 0 };
      acc[c.platform].reach       += c.reach || 0;
      acc[c.platform].impressions += c.impressions || 0;
      return acc;
    }, {})
  ).map(([name, v]: any) => ({ name, reach: Math.round(v.reach/1000), impressions: Math.round(v.impressions/1000) }));

  // CTR by campaign target
  const byCampaignTarget = Object.entries(
    ads.reduce((acc: any, c) => {
      if (!acc[c.campaign_target]) acc[c.campaign_target] = { clicks: 0, impressions: 0 };
      acc[c.campaign_target].clicks      += c.clicks || 0;
      acc[c.campaign_target].impressions += c.impressions || 0;
      return acc;
    }, {})
  ).map(([name, v]: any) => ({ name, ctr: v.impressions > 0 ? Number(((v.clicks / v.impressions)*100).toFixed(2)) : 0 }))
   .sort((a, b) => b.ctr - a.ctr);

  // CPC by audience type
  const byAudienceCpc = Object.entries(
    ads.reduce((acc: any, c) => {
      if (!acc[c.audience_type]) acc[c.audience_type] = { spend: 0, clicks: 0 };
      acc[c.audience_type].spend  += c.amount_spent || 0;
      acc[c.audience_type].clicks += c.clicks || 0;
      return acc;
    }, {})
  ).map(([name, v]: any) => ({ name, cpc: v.clicks > 0 ? v.spend / v.clicks : 0 }))
   .sort((a, b) => b.cpc - a.cpc);

  // Bubble chart data: spend vs CTR, size = impressions
  const bubbleData = ads.map(c => ({
    name: c.ad_name?.substring(0, 16) + '…',
    x: c.amount_spent || 0,
    y: c.ctr || 0,
    z: Math.round((c.impressions || 0) / 1000),
  }));

  // ── Live Monthly Trend (from actual campaign dates) ─────────────────────────
  // Groups all campaigns by month — fetched directly from DB via /dashboard/monthly-trend.
  // Falls back to mock data only when no live data is returned.
  const liveMonthlyTrend = useMemo(() => {
    const api = (apiMonthlyTrend as any[]);
    if (api.length > 0) {
      // Backend already returns month_label as "Jan 26", "Feb 26", etc.
      return api.map((row: any) => ({
        month_label: row.month_label ?? row.month ?? '',
        spend:       Math.round(Number(row.spend) || 0),
        clicks:      Number(row.clicks) || 0,
        ctr:         Number((Number(row.ctr  || 0)).toFixed(3)),
        cpc:         Number((Number(row.cpc  || 0)).toFixed(2)),
      }));
    }
    // Fallback: mock data sorted in calendar order — use month as label
    return [...mockMonthlyTrend]
      .sort((a, b) => MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month))
      .map(r => ({ ...r, month_label: r.month }));
  }, [apiMonthlyTrend]);

  // ── Sortable table ──────────────────────────────────────────────────────────
  const sortedAds = useMemo(() => {
    return [...ads].sort((a, b) => {
      const av = a[sortCol] ?? 0;
      const bv = b[sortCol] ?? 0;
      return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });
  }, [ads, sortCol, sortDir]);

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortDir === 'desc' ? <ArrowDown className="w-3 h-3 text-indigo-500" /> : <ArrowUp className="w-3 h-3 text-indigo-500" />;
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  function handleExport() {
    const rows = [
      ['Ad Name','Product','Platform','Format','Audience','Target','Spend','Impressions','Reach','Clicks','CTR','CPC','CPM','Frequency','Days Running'],
      ...sortedAds.map(c => [
        c.ad_name, c.product_category, c.platform, c.ad_format, c.audience_type, c.campaign_target,
        c.amount_spent, c.impressions, c.reach, c.clicks,
        `${(c.ctr||0).toFixed(2)}%`, (c.cpc||0).toFixed(2), (c.cpm||0).toFixed(2),
        (c.frequency||0).toFixed(1),
        c.start_date && c.end_date ? daysBetween(c.start_date, c.end_date) : 'N/A',
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `MIP_${dashboard.name}_${MONTHS_FULL[monthYear.month]}_${monthYear.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Dashboard exported as CSV');
  }

  // ── Quadrant helpers (bubble chart) ────────────────────────────────────────
  const medSpend = ads.length ? ads.reduce((s,c)=>s+(c.amount_spent||0),0)/ads.length : 0;
  const medCtr   = ads.length ? ads.reduce((s,c)=>s+(c.ctr||0),0)/ads.length : 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={{ duration:0.2 }} className="pb-12">

      {/* Share modal */}
      <AnimatePresence>{showShare && <ShareModal onClose={() => setShowShare(false)} name={dashboard.name} />}</AnimatePresence>

      {/* ── Back ── */}
      <button onClick={() => setSelectedDashboard(null)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 mb-5 font-semibold transition-colors cursor-pointer border-0 bg-transparent">
        <ChevronLeft className="w-3.5 h-3.5" /> Back to Dashboards
      </button>

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          {client && <div className="mb-2"><ClientBadge client={client} /></div>}
          <h1 className="text-2xl font-bold text-slate-900">{dashboard.name}</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {dashboard.description}
            {lastSynced?.lastSyncedAt
              ? ` · Synced ${new Date(lastSynced.lastSyncedAt).toLocaleString('en-IN')}`
              : ` · ${dashboard.updated}`}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {connectedPlatforms.length > 0
              ? connectedPlatforms.slice(0,5).map((s: any) => (
                  <span key={s.id} className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold">{s.name} connected</span>
                ))
              : <span className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-[10px] font-bold">Connect a source to sync live data</span>
            }
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Right: Calendar Date Range Selector */}
          <div className="relative flex items-center justify-end select-none">
            <button
              onClick={() => setShowCalendarDropdown(!showCalendarDropdown)}
              className="flex items-center gap-2 h-9 px-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer w-full sm:w-auto justify-center sm:justify-start"
            >
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>{selectedRangeLabel}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showCalendarDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Calendar Dropdown Popover */}
            <AnimatePresence>
              {showCalendarDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCalendarDropdown(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute right-0 top-11 bg-white border border-slate-200 rounded-2xl shadow-2xl p-0 w-[720px] z-50 flex font-sans overflow-hidden text-slate-800"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Left Sidebar: Presets */}
                    <div className="w-[180px] border-r border-slate-100 flex flex-col p-3 bg-slate-50/50 justify-between select-none">
                      <div className="flex flex-col gap-1">
                        {[
                          { id: 'today', label: 'Today', start: '2026-05-29', end: '2026-05-29' },
                          { id: 'yesterday', label: 'Yesterday', start: '2026-05-28', end: '2026-05-28' },
                          { id: 'today_yesterday', label: 'Today and yesterday', start: '2026-05-28', end: '2026-05-29' },
                          { id: 'last_7_days', label: 'Last 7 days', start: '2026-05-22', end: '2026-05-28' },
                          { id: 'last_14_days', label: 'Last 14 days', start: '2026-05-15', end: '2026-05-28' },
                          { id: 'last_28_days', label: 'Last 28 days', start: '2026-05-01', end: '2026-05-28' },
                          { id: 'last_30_days', label: 'Last 30 days', start: '2026-04-29', end: '2026-05-28' },
                          { id: 'this_week', label: 'This week', start: '2026-05-24', end: '2026-05-29' },
                          { id: 'last_week', label: 'Last week', start: '2026-05-17', end: '2026-05-23' },
                          { id: 'this_month', label: 'This month', start: '2026-05-01', end: '2026-05-31' },
                          { id: 'last_month', label: 'Last month', start: '2026-04-01', end: '2026-04-30' },
                          { id: 'maximum', label: 'Maximum', start: '2026-01-01', end: '2026-05-29' },
                          { id: 'custom', label: 'Custom' },
                        ].map(preset => (
                          <button
                            key={preset.id}
                            onClick={() => {
                              setSelectedPreset(preset.id);
                              if (preset.id !== 'custom' && preset.start && preset.end) {
                                setTempStartDate(preset.start);
                                setTempEndDate(preset.end);
                              }
                            }}
                            className="flex items-center gap-2 py-1 px-1.5 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors border-0 bg-transparent cursor-pointer text-left w-full"
                          >
                            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${selectedPreset === preset.id ? 'border-blue-500 bg-white' : 'border-slate-350 bg-white'}`}>
                              {selectedPreset === preset.id && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                            </span>
                            <span className={`${selectedPreset === preset.id ? 'font-bold text-blue-600' : ''}`}>{preset.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Right Content: Dual Calendars + Footer */}
                    <div className="flex-1 flex flex-col p-4">
                      {/* Calendars header */}
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-1.5">
                          <ChevronRight onClick={handlePrevMonth} className="w-3.5 h-3.5 rotate-180 text-slate-400 cursor-pointer hover:text-slate-700 animate-none bg-transparent border-0" />
                          <span>{MONTH_NAMES[leftMonth]} {leftYear}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span>{MONTH_NAMES[rightMonth]} {rightYear}</span>
                          <ChevronRight onClick={handleNextMonth} className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-slate-700 animate-none bg-transparent border-0" />
                        </div>
                      </div>

                      {/* Dual Grids */}
                      <div className="grid grid-cols-2 gap-6 select-none">
                        {/* Left Month Calendar */}
                        <div>
                          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 mb-1">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}
                          </div>
                          <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-bold">
                            {getCalendarDays(leftMonth, leftYear).map((day, idx) => {
                              if (day === null) return <span key={`empty-left-${idx}`} />;
                              const dateStr = `${leftYear}-${String(leftMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                              const isSelectedStart = tempStartDate === dateStr;
                              const isSelectedEnd = tempEndDate === dateStr;
                              const isInRange = tempStartDate && tempEndDate && dateStr >= tempStartDate && dateStr <= tempEndDate;

                              return (
                                <button
                                  key={`left-${day}`}
                                  onClick={() => {
                                    setSelectedPreset('custom');
                                    if (!tempStartDate || (tempStartDate && tempEndDate)) {
                                      setTempStartDate(dateStr);
                                      setTempEndDate('');
                                    } else {
                                      if (dateStr >= tempStartDate) {
                                        setTempEndDate(dateStr);
                                      } else {
                                        setTempStartDate(dateStr);
                                      }
                                    }
                                  }}
                                  className={`h-6 w-full rounded-md flex items-center justify-center font-bold relative border-0 cursor-pointer ${
                                    isSelectedStart || isSelectedEnd
                                      ? 'bg-blue-600 text-white z-10'
                                      : isInRange
                                      ? 'bg-blue-50 text-blue-700 rounded-none first:rounded-l-md last:rounded-r-md'
                                      : 'text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Right Month Calendar */}
                        <div>
                          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 mb-1">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}
                          </div>
                          <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-bold">
                            {getCalendarDays(rightMonth, rightYear).map((day, idx) => {
                              if (day === null) return <span key={`empty-right-${idx}`} />;
                              const dateStr = `${rightYear}-${String(rightMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                              const isSelectedStart = tempStartDate === dateStr;
                              const isSelectedEnd = tempEndDate === dateStr;
                              const isInRange = tempStartDate && tempEndDate && dateStr >= tempStartDate && dateStr <= tempEndDate;

                              return (
                                <button
                                  key={`right-${day}`}
                                  onClick={() => {
                                    setSelectedPreset('custom');
                                    if (!tempStartDate || (tempStartDate && tempEndDate)) {
                                      setTempStartDate(dateStr);
                                      setTempEndDate('');
                                    } else {
                                      if (dateStr >= tempStartDate) {
                                        setTempEndDate(dateStr);
                                      } else {
                                        setTempStartDate(dateStr);
                                      }
                                    }
                                  }}
                                  className={`h-6 w-full rounded-md flex items-center justify-center font-bold relative border-0 cursor-pointer ${
                                    isSelectedStart || isSelectedEnd
                                      ? 'bg-blue-600 text-white z-10'
                                      : isInRange
                                      ? 'bg-blue-50 text-blue-700 rounded-none'
                                      : 'text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Comparison checkbox & select */}
                      <div className="flex flex-wrap items-center gap-3 mt-4 pt-3.5 border-t border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                          <input
                            type="checkbox"
                            checked={compareEnabled}
                            onChange={(e) => setCompareEnabled(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-350"
                          />
                          <span>Compare</span>
                        </label>
                        <select
                          disabled={!compareEnabled}
                          value={comparePreset}
                          onChange={(e) => setComparePreset(e.target.value)}
                          className="h-8 border border-slate-200 rounded-lg px-2 text-[11px] font-bold text-slate-600 bg-white focus:outline-none disabled:opacity-40 disabled:bg-slate-50 cursor-pointer"
                        >
                          <option value="previous_period">Previous period</option>
                          <option value="previous_year">Previous year</option>
                        </select>

                        {/* Display Date Range in Inputs box style */}
                        <div className="ml-auto flex items-center gap-1.5">
                          <div className="h-8 px-3 border border-slate-200 rounded-lg flex items-center justify-center text-[11px] font-bold text-slate-700 bg-slate-50">
                            {tempStartDate ? new Date(tempStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                          </div>
                          <span className="text-slate-400 font-bold">-</span>
                          <div className="h-8 px-3 border border-slate-200 rounded-lg flex items-center justify-center text-[11px] font-bold text-slate-700 bg-slate-50">
                            {tempEndDate ? new Date(tempEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                          </div>
                        </div>
                      </div>

                      {/* Footer Row */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400 italic font-semibold">
                          Dates are shown in Kolkata Time
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setTempStartDate(startDate);
                              setTempEndDate(endDate);
                              setShowCalendarDropdown(false);
                            }}
                            className="h-8 px-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-750 font-bold text-xs rounded-xl transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              if (tempStartDate && tempEndDate) {
                                setStartDate(tempStartDate);
                                setEndDate(tempEndDate);
                                
                                const labelStart = new Date(tempStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                                const labelEnd = new Date(tempEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                                setSelectedRangeLabel(`${labelStart} - ${labelEnd}`);
                                
                                // Keep monthYear in sync for dynamic queries
                                const endD = new Date(tempEndDate);
                                setMonthYear({ month: endD.getMonth(), year: endD.getFullYear() });
                                
                                setShowCalendarDropdown(false);
                                toast.success(`Date filter updated: ${labelStart} - ${labelEnd}`);
                              } else {
                                toast.error('Please select both start and end dates.');
                              }
                            }}
                            className="h-8 px-5 bg-blue-600 hover:bg-blue-700 text-white border-0 font-bold text-xs rounded-xl transition-all shadow-sm cursor-pointer"
                          >
                            Update
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button onClick={() => setShowShare(true)}
            className="h-9 px-3.5 border border-slate-200 bg-white rounded-xl text-sm font-semibold hover:bg-slate-50 flex items-center gap-2 shadow-sm cursor-pointer transition-colors">
            <Share2 className="w-3.5 h-3.5 text-slate-500" /> Share
          </button>
          <button onClick={handleExport}
            className="h-9 px-4 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm cursor-pointer border-0 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FILTER BAR
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm px-4 py-3 mb-6 flex items-center gap-2.5 flex-wrap">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Filters</span>
        <MultiSelect label="Platform"        options={platforms} value={fPlatform} onChange={setFPlatform} />
        <MultiSelect label="Product"         options={products}  value={fProduct}  onChange={setFProduct}  />
        <MultiSelect label="Ad Format"       options={formats}   value={fFormat}   onChange={setFFormat}   />
        <MultiSelect label="Audience"        options={audiences} value={fAudience} onChange={setFAudience} />
        <MultiSelect label="Campaign Target" options={targets}   value={fTarget}   onChange={setFTarget}   />
        {!!hasFilters && (
          <button onClick={() => { setFPlatform([]); setFProduct([]); setFFormat([]); setFAudience([]); setFTarget([]); }}
            className="ml-auto h-8 px-3 rounded-lg text-[11px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer border-0 bg-transparent transition-colors">
            Clear all filters
          </button>
        )}
      </div>



      {/* No data banner */}
      {!campaignsLoading && ads.length === 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-6">
          <p className="text-sm font-bold text-blue-900">No data for {MONTHS_FULL[monthYear.month]} {monthYear.year}{hasFilters ? ' matching your filters' : ''}</p>
          <p className="text-xs text-blue-700 mt-1">Try a different month or clear filters.</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 1 — 7 KPI Cards
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        <KpiCard label="Total Spend"       value={fmtInr(totalSpend)}           sub={`vs prev: ${spendTrend > 0 ? '+' : ''}${spendTrend.toFixed(1)}%`}    trend={trendOf(totalSpend, spendTrend)}   accent="bg-gradient-to-r from-indigo-500 to-violet-500" />
        <KpiCard label="Total Impressions" value={fmtK(totalImpressions)}       sub="Total eyeballs"                                                          trend="up"                                 accent="bg-gradient-to-r from-sky-500 to-blue-500" />
        <KpiCard label="Total Reach"       value={fmtK(totalReach)}             sub={`Avg freq ${avgFreq.toFixed(1)}×`}                                      trend={avgFreq > 3.5 ? 'down' : 'up'}     accent="bg-gradient-to-r from-cyan-500 to-teal-500" />
        <KpiCard label="Total Clicks"      value={fmtK(totalClicks)}            sub="Total actions taken"                                                     trend="up"                                 accent="bg-gradient-to-r from-violet-500 to-purple-600" />
        <KpiCard label="Avg CTR"           value={`${avgCtr.toFixed(2)}%`}      sub={avgCtr > 1 ? 'Above 1% benchmark ✓' : 'Below 1% benchmark'}             trend={avgCtr > 1 ? 'up' : 'down'}        accent="bg-gradient-to-r from-amber-500 to-orange-500" />
        <KpiCard label="Avg CPC"           value={fmtInrDec(avgCpc)}            sub="Cost per click"                                                          trend={avgCpc < 20 ? 'up' : 'down'}       accent="bg-gradient-to-r from-rose-500 to-pink-500" />
        <KpiCard label="Avg CPM"           value={fmtInrDec(avgCpm)}            sub="Cost per 1k impressions"                                                 trend="neutral"                            accent="bg-gradient-to-r from-emerald-500 to-green-600" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 2 — Monthly Trend Charts
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Tile 1 — Monthly Spend + Clicks */}
        <Panel title="Monthly Spend vs Clicks" subtitle="Is spend growth driving click growth?">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={liveMonthlyTrend} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month_label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '₹0' : `₹${fmtK(v)}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => fmtK(v)} />
                <Tooltip content={<DarkTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar    yAxisId="left"  dataKey="spend"  name="Spend (₹)"  fill="#6366f1" radius={[3,3,0,0]} maxBarSize={18} opacity={0.85} />
                <Line  yAxisId="right" dataKey="clicks" name="Clicks"      stroke="#f59e0b" strokeWidth={2.5} dot={{ r:3, fill:'#f59e0b' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Tile 2 — Monthly CTR + CPC */}
        <Panel title="Monthly CTR vs CPC Trend" subtitle="CTR rising + CPC falling = healthy performance">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={liveMonthlyTrend} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month_label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 5]}   tickFormatter={v => `${v}%`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `₹${v}`} />
                <Tooltip content={<DarkTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left"  dataKey="ctr" name="CTR (%)"  stroke="#10b981" strokeWidth={2.5} dot={{ r:3, fill:'#10b981' }} />
                <Line yAxisId="right" dataKey="cpc" name="CPC (₹)"  stroke="#ef4444" strokeWidth={2.5} dot={{ r:3, fill:'#ef4444' }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 3 — Platform Comparison
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Tile 3 — Spend by Platform (donut) */}
        <Panel title="Spend by Platform" subtitle="Which channel consumes the most budget">
          <div className="px-5 pb-5 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={byPlatformSpend} dataKey="spend" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {byPlatformSpend.map((e, i) => <Cell key={i} fill={PLATFORM_COLOR[e.name] || PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtInr(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full space-y-2 mt-1">
              {byPlatformSpend.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: PLATFORM_COLOR[p.name] || PALETTE[i % PALETTE.length] }} />
                    <span className="text-xs font-semibold text-slate-700">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400">{totalSpend > 0 ? Math.round((p.spend/totalSpend)*100) : 0}%</span>
                    <span className="text-xs font-bold text-slate-900" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{fmtInr(p.spend)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Tile 4 — CPC by Platform */}
        <Panel title="CPC by Platform" subtitle="Which platform delivers cheapest clicks — sorted worst first">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byPlatformCpc} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v.toFixed(0)}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v: any) => fmtInrDec(v)} />
                <Bar dataKey="cpc" name="CPC" radius={[0,4,4,0]} maxBarSize={24}>
                  {byPlatformCpc.map((e, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 4 — Ad Format + Audience
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Tile 5 — CTR by Ad Format */}
        <Panel title="CTR by Ad Format" subtitle="Which creative format drives the most engagement">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byFormat} layout="vertical" margin={{ top: 4, right: 50, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Bar dataKey="ctr" name="CTR (%)" radius={[0,4,4,0]} maxBarSize={22}>
                  {byFormat.map((e, i) => <Cell key={i} fill={e.ctr >= 1 ? '#10b981' : '#f59e0b'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Tile 6 — Spend vs Reach by Audience */}
        <Panel title="Spend vs Reach by Audience Type" subtitle="Are you spending proportionally to reach? (values in thousands)">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byAudience} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => fmtK(v)} />
                <Tooltip formatter={(v: any, name: any) => [fmtK(v), name]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="spend" name="Spend (₹)" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={28} />
                <Bar dataKey="reach" name="Reach"      fill="#06b6d4" radius={[4,4,0,0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 5 — Product Category
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Tile 7 — Spend by Product */}
        <Panel title="Spend by Product Category" subtitle="Which products consume the most budget — sorted DESC">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byProductSpend} layout="vertical" margin={{ top: 4, right: 60, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${fmtK(v)}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip formatter={(v: any) => fmtInr(v)} />
                <Bar dataKey="spend" name="Spend" radius={[0,4,4,0]} maxBarSize={22}>
                  {byProductSpend.map((e, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Tile 8 — CPC by Product (worst first) */}
        <Panel title="CPC by Product Category" subtitle="Which product has the most expensive clicks — worst first">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byProductCpc} layout="vertical" margin={{ top: 4, right: 60, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v.toFixed(0)}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip formatter={(v: any) => fmtInrDec(v)} />
                <Bar dataKey="cpc" name="CPC" radius={[0,4,4,0]} maxBarSize={22}>
                  {byProductCpc.map((e, i) => <Cell key={i} fill={e.cpc > avgCpc ? '#ef4444' : '#10b981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500" /><span className="text-[10px] text-slate-400 font-semibold">Above avg CPC</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span className="text-[10px] text-slate-400 font-semibold">Below avg CPC</span></div>
            </div>
          </div>
        </Panel>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 6 — Frequency + Reach Gap
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Tile 9 — Frequency by Ad (reference line at 3.0) */}
        <Panel title="Frequency by Ad" subtitle="Ads above 3.0× need a creative refresh — red line = fatigue threshold">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={Math.max(220, freqByAd.length * 36 + 40)}>
              <BarChart data={freqByAd} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" domain={[0, Math.max(5, ...freqByAd.map(d => d.freq) || [5])]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} width={120} />
                <Tooltip formatter={(v: any) => `${v}×`} />
                <ReferenceLine x={3.0} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" label={{ value: '3.0× threshold', position: 'top', fontSize: 10, fill: '#ef4444', fontWeight: 700 }} />
                <Bar dataKey="freq" name="Frequency" radius={[0,4,4,0]} maxBarSize={20}>
                  {freqByAd.map((e, i) => <Cell key={i} fill={e.freq >= 3 ? '#ef4444' : e.freq >= 2 ? '#f59e0b' : '#10b981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span className="text-[10px] text-slate-400 font-semibold">&lt;2× healthy</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500" /><span className="text-[10px] text-slate-400 font-semibold">2–3× watch</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500" /><span className="text-[10px] text-slate-400 font-semibold">3×+ fatigue</span></div>
            </div>
          </div>
        </Panel>

        {/* Tile 10 — Reach vs Impressions gap by Platform */}
        <Panel title="Reach vs Impressions by Platform" subtitle="Gap = frequency. Large gap = you're hammering the same people (values in k)">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={reachVsImpr} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => fmtK(v)} />
                <Tooltip formatter={(v: any, name: any) => [fmtK(v), name]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="impressions" name="Impressions" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={32} />
                <Bar dataKey="reach"       name="Reach"       fill="#06b6d4" radius={[4,4,0,0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 7 — Ad Performance Table (full width, sortable)
      ══════════════════════════════════════════════════════════════════════ */}
      <Panel className="mb-5" title="Ad Performance Table" subtitle={`${sortedAds.length} ads · sorted by ${sortCol} · click column headers to sort`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1200px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {[
                  { key: 'ad_name',          label: 'Ad Name',       w: 'min-w-[160px]' },
                  { key: 'product_category', label: 'Product',       w: 'min-w-[90px]' },
                  { key: 'platform',         label: 'Platform',      w: 'min-w-[80px]' },
                  { key: 'ad_format',        label: 'Format',        w: 'min-w-[90px]' },
                  { key: 'audience_type',    label: 'Audience',      w: 'min-w-[90px]' },
                  { key: 'campaign_target',  label: 'Target',        w: 'min-w-[100px]' },
                  { key: 'amount_spent',     label: 'Spend',         w: 'min-w-[90px]' },
                  { key: 'impressions',      label: 'Impressions',   w: 'min-w-[90px]' },
                  { key: 'reach',            label: 'Reach',         w: 'min-w-[80px]' },
                  { key: 'clicks',           label: 'Clicks',        w: 'min-w-[70px]' },
                  { key: 'ctr',              label: 'CTR',           w: 'min-w-[70px]' },
                  { key: 'cpc',              label: 'CPC',           w: 'min-w-[70px]' },
                  { key: 'cpm',              label: 'CPM',           w: 'min-w-[70px]' },
                  { key: 'frequency',        label: 'Freq',          w: 'min-w-[60px]' },
                  { key: '_days',            label: 'Days',          w: 'min-w-[60px]' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => col.key !== '_days' && handleSort(col.key)}
                    className={`px-4 py-3 text-left text-[10px] font-extrabold text-slate-400 uppercase tracking-widest whitespace-nowrap ${col.w} ${col.key !== '_days' ? 'cursor-pointer hover:text-slate-700 hover:bg-slate-100 transition-colors' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.key !== '_days' && <SortIcon col={col.key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedAds.map((c: any) => {
                const ctrLow  = (c.ctr || 0) < 1;
                const freqHigh = (c.frequency || 0) > 3;
                const cpcHigh  = (c.cpc || 0) > avgCpc;
                const cpcLow   = (c.cpc || 0) < avgCpc && (c.cpc || 0) > 0;
                const days     = c.start_date && c.end_date ? daysBetween(c.start_date, c.end_date) : '—';
                return (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800 max-w-[180px]">
                      <p className="truncate">{c.ad_name || c.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold whitespace-nowrap">{c.product_category}</span>
                    </td>
                    <td className="px-4 py-3"><PlatformDot platform={c.platform || c.channel} /></td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold whitespace-nowrap">{c.ad_format}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-semibold text-[11px]">{c.audience_type}</td>
                    <td className="px-4 py-3 text-slate-600 font-semibold text-[11px]">{c.campaign_target}</td>
                    <td className="px-4 py-3 font-bold text-slate-900" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{fmtInr(c.amount_spent||0)}</td>
                    <td className="px-4 py-3 text-slate-600" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{fmtNum(c.impressions||0)}</td>
                    <td className="px-4 py-3 text-slate-600" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{fmtNum(c.reach||0)}</td>
                    <td className="px-4 py-3 text-slate-600" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{fmtNum(c.clicks||0)}</td>
                    <td className={`px-4 py-3 font-bold rounded-sm ${ctrLow ? 'text-red-600 bg-red-50' : 'text-emerald-600'}`} style={{ fontFamily:"'JetBrains Mono',monospace" }}>
                      {(c.ctr||0).toFixed(2)}%
                    </td>
                    <td className={`px-4 py-3 font-bold ${cpcHigh ? 'text-red-600' : cpcLow ? 'text-emerald-600' : 'text-slate-600'}`} style={{ fontFamily:"'JetBrains Mono',monospace" }}>
                      {fmtInrDec(c.cpc||0)}
                    </td>
                    <td className="px-4 py-3 text-slate-600" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{fmtInrDec(c.cpm||0)}</td>
                    <td className={`px-4 py-3 font-bold ${freqHigh ? 'text-amber-600 bg-amber-50' : 'text-slate-600'}`} style={{ fontFamily:"'JetBrains Mono',monospace" }}>
                      {(c.frequency||0).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-semibold">{days === '—' ? '—' : `${days}d`}</td>
                  </tr>
                );
              })}
              {sortedAds.length === 0 && (
                <tr><td colSpan={15} className="px-4 py-12 text-center text-slate-400 text-xs">No ads match the selected filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-5 px-5 py-3 border-t border-slate-50 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conditional formatting</span>
          <div className="flex items-center gap-1.5"><div className="w-10 h-4 rounded bg-red-50 border border-red-100 flex items-center justify-center"><span className="text-[9px] font-bold text-red-600">1.23%</span></div><span className="text-[10px] text-slate-400">CTR &lt;1%</span></div>
          <div className="flex items-center gap-1.5"><div className="w-10 h-4 rounded bg-amber-50 border border-amber-100 flex items-center justify-center"><span className="text-[9px] font-bold text-amber-600">3.4</span></div><span className="text-[10px] text-slate-400">Freq &gt;3.0</span></div>
          <div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-red-600">₹xx</span><span className="text-[10px] text-slate-400">CPC above avg</span></div>
          <div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-emerald-600">₹xx</span><span className="text-[10px] text-slate-400">CPC below avg</span></div>
        </div>
      </Panel>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 8 — Campaign Target + Audience CPC
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Tile 12 — CTR by Campaign Target */}
        <Panel title="CTR by Campaign Target" subtitle="Which objective drives the best engagement rate">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byCampaignTarget} layout="vertical" margin={{ top: 4, right: 50, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Bar dataKey="ctr" name="CTR (%)" radius={[0,4,4,0]} maxBarSize={22}>
                  {byCampaignTarget.map((e, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Tile 13 — CPC by Audience Type (worst first) */}
        <Panel title="CPC by Audience Type" subtitle="Is your audience mix optimised? — worst CPC first">
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byAudienceCpc} layout="vertical" margin={{ top: 4, right: 60, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v.toFixed(0)}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip formatter={(v: any) => fmtInrDec(v)} />
                <Bar dataKey="cpc" name="CPC" radius={[0,4,4,0]} maxBarSize={22}>
                  {byAudienceCpc.map((e, i) => <Cell key={i} fill={e.cpc > avgCpc ? '#ef4444' : '#10b981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 9 — Spend vs CTR Bubble Chart (Tile 14, full width)
      ══════════════════════════════════════════════════════════════════════ */}
      <Panel title="Spend vs CTR Efficiency Map" subtitle="Bubble size = impressions · Move budget from bottom-right → top-left">
        <div className="px-5 pb-3">
          {/* Quadrant labels */}
          <div className="relative">
            <div className="absolute top-2 left-[8%] text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full z-10">
              ↑ Scale now
            </div>
            <div className="absolute top-2 right-4 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full z-10">
              ✓ Protect winners
            </div>
            <div className="absolute bottom-8 left-[8%] text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full z-10">
              Test / Pause
            </div>
            <div className="absolute bottom-8 right-4 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full z-10">
              ⚠ Wasting budget
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 24, right: 16, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  type="number" dataKey="x" name="Spend"
                  tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₹${fmtK(v)}`}
                  label={{ value: 'Amount Spent (₹)', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }}
                />
                <YAxis
                  type="number" dataKey="y" name="CTR"
                  tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`}
                  label={{ value: 'CTR (%)', angle: -90, position: 'insideLeft', offset: 16, fontSize: 11, fill: '#94a3b8' }}
                />
                <ZAxis type="number" dataKey="z" range={[60, 600]} name="Impressions (k)" />
                <ReferenceLine x={medSpend} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 2" />
                <ReferenceLine y={medCtr}   stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 2" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-slate-900 text-white text-[11px] rounded-xl px-3 py-2 shadow-2xl border border-slate-700">
                        <p className="font-bold text-slate-300 mb-1">{d?.name}</p>
                        <p>Spend: <strong>₹{fmtK(d?.x)}</strong></p>
                        <p>CTR: <strong>{d?.y}%</strong></p>
                        <p>Impressions: <strong>{fmtK((d?.z||0)*1000)}</strong></p>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={bubbleData}
                  fill="#6366f1"
                  fillOpacity={0.75}
                  shape={(props: any) => {
                    const { cx, cy, payload } = props;
                    const isWinner = payload.y >= medCtr && payload.x >= medSpend;
                    const isScale  = payload.y >= medCtr && payload.x <  medSpend;
                    const isWaste  = payload.y <  medCtr && payload.x >= medSpend;
                    const fill = isWinner ? '#3b82f6' : isScale ? '#10b981' : isWaste ? '#ef4444' : '#94a3b8';
                    const r = Math.max(8, Math.min(36, Math.sqrt(payload.z || 1) * 2.2));
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.7} stroke={fill} strokeWidth={1.5} />
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="white" fontWeight={700}>
                          {payload.name?.split('…')[0]?.substring(0,6)}
                        </text>
                      </g>
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="flex items-center gap-5 px-5 pb-4 flex-wrap">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-[10px] text-slate-400 font-semibold">Scale now (high CTR, low spend)</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-[10px] text-slate-400 font-semibold">Winners (high CTR, high spend)</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-[10px] text-slate-400 font-semibold">Wasting budget (low CTR, high spend)</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-400" /><span className="text-[10px] text-slate-400 font-semibold">Test / Pause</span></div>
        </div>
      </Panel>

      {/* ══════════════════════════════════════════════════════════════════════
          PINNED AI BRAIN CHARTS (DRAG AND DROP RE-ORDERABLE)
      ══════════════════════════════════════════════════════════════════════ */}
      {currentPinnedWidgets.length > 0 && (
        <div className="mt-8 border-t border-slate-100 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="size-2 bg-indigo-600 rounded-full animate-pulse" />
                Pinned AI Brain Insights
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Drag and drop charts to re-order them inside your dashboard</p>
            </div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded">
              {currentPinnedWidgets.length} Pinned Chart{currentPinnedWidgets.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {currentPinnedWidgets.map((w: any) => (
              <div
                key={w.id}
                draggable
                onDragStart={(e) => {
                  setDraggedWidgetId(w.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedWidgetId !== null && draggedWidgetId !== w.id) {
                    reorderPinnedWidgets(draggedWidgetId, w.id);
                  }
                }}
                onDragEnd={() => setDraggedWidgetId(null)}
                className={`relative group bg-white rounded-2xl border border-slate-100 shadow-sm p-1 cursor-grab active:cursor-grabbing hover:shadow-md transition-all duration-200 ${
                  draggedWidgetId === w.id ? 'opacity-40 scale-[0.98] border-indigo-200 bg-indigo-50/5' : ''
                }`}
              >
                {/* Unpin button overlay on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePinnedWidget(w.id);
                  }}
                  className="absolute top-4 right-4 z-10 size-7 bg-red-50 text-red-600 border-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer hover:bg-red-100 shadow-sm"
                  title="Unpin Chart"
                >
                  <X className="size-3.5" />
                </button>
                <div className="p-1 pointer-events-none">
                  <WidgetRenderer widget={w} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </motion.div>
  );
}
