import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { TrendingUp, Users, Target, MousePointer, Percent, HelpCircle } from 'lucide-react';

// Indian Currency Formatter (Spend, CPC, CPM)
export const formatInr = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return '—';
  const num = Number(val);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
};

// General number formatter
export const formatNumber = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return '—';
  const num = Number(val);
  if (num >= 10000000) return `${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(2)}L`;
  return new Intl.NumberFormat('en-IN').format(num);
};

// ROAS Formatter
export const formatRoas = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val)) || Number(val) === 0) return '—';
  return `${Number(val).toFixed(2)}x`;
};

// CPC / CPM Formatter with dec
export const formatCpcCpm = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(val));
};

export type WidgetData = {
  chart_type: 'bar_chart' | 'line_chart' | 'table' | 'kpi_card' | 'pie_chart' | 'bubble_chart' | 'scatter_chart';
  title: string;
  data: any[];
  config: {
    x_axis?: string | null;
    y_axis?: string | null;
    z_axis?: string | null;
    sort?: string | null;
    columns?: string[];
    format?: 'money' | 'number' | 'percent' | string;
  };
  sql?: string | null;
  insight?: string | null;
};

interface WidgetRendererProps {
  widget: WidgetData;
}

export default function WidgetRenderer({ widget }: WidgetRendererProps) {
  const { chart_type, title, data = [], config } = widget;

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 rounded-xl border border-dashed border-border bg-muted/20 text-center">
        <HelpCircle className="size-8 text-muted-foreground animate-pulse" />
        <h4 className="mt-2 text-sm font-semibold text-foreground">{title || 'Data Visualisation'}</h4>
        <p className="mt-1 text-xs text-muted-foreground">No matching campaign metrics found for this query.</p>
      </div>
    );
  }

  // Detect platform colors dynamically for visual consistency
  const getPlatformColors = (platformName: string) => {
    const plat = String(platformName).toLowerCase();
    if (plat.includes('meta') || plat.includes('facebook')) {
      return { fill: 'url(#gradient-meta)', border: '#4f46e5' };
    }
    if (plat.includes('google')) {
      return { fill: 'url(#gradient-google)', border: '#ea580c' };
    }
    if (plat.includes('tiktok')) {
      return { fill: 'url(#gradient-tiktok)', border: '#db2777' };
    }
    return { fill: 'url(#gradient-general)', border: '#8b5cf6' };
  };

  const getMetricIcon = (metricName: string) => {
    const m = metricName.toLowerCase();
    if (m.includes('spend') || m.includes('budget')) return <TrendingUp className="size-4 text-emerald-500" />;
    if (m.includes('impression') || m.includes('reach')) return <Users className="size-4 text-indigo-500" />;
    if (m.includes('click') || m.includes('ctr')) return <MousePointer className="size-4 text-amber-500" />;
    if (m.includes('conversion') || m.includes('roas')) return <Target className="size-4 text-rose-500" />;
    return <Percent className="size-4 text-blue-500" />;
  };

  const formatValue = (key: string, val: any) => {
    const k = key.toLowerCase();
    if (k.includes('spend') || k.includes('revenue')) return formatInr(val);
    if (k.includes('cpc') || k.includes('cpm')) return formatCpcCpm(val);
    if (k.includes('roas')) return formatRoas(val);
    if (k.includes('ctr')) {
      const numVal = Number(val);
      if (!isNaN(numVal)) {
        return `${numVal.toFixed(2)}%`;
      }
      return val === null || val === undefined ? '—' : `${val}%`;
    }
    if (k.includes('frequency') || k.includes('freq')) {
      return typeof val === 'number' ? val.toFixed(2) : String(val);
    }
    if (k.includes('clicks') || k.includes('impressions') || k.includes('conversions') || k.includes('reach')) {
      return formatNumber(val);
    }
    return String(val);
  };

  const renderGradients = () => (
    <defs>
      <linearGradient id="gradient-meta" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.85} />
        <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.95} />
      </linearGradient>
      <linearGradient id="gradient-google" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fb923c" stopOpacity={0.85} />
        <stop offset="100%" stopColor="#ea580c" stopOpacity={0.95} />
      </linearGradient>
      <linearGradient id="gradient-tiktok" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f472b6" stopOpacity={0.85} />
        <stop offset="100%" stopColor="#db2777" stopOpacity={0.95} />
      </linearGradient>
      <linearGradient id="gradient-general" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#c084fc" stopOpacity={0.85} />
        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.95} />
      </linearGradient>
    </defs>
  );

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="rounded-xl border border-border bg-card p-3 shadow-md text-xs select-none">
          <div className="font-bold text-foreground mb-1.5">{dataPoint[config.x_axis || 'name'] || dataPoint.campaign_name || dataPoint.platform}</div>
          <div className="space-y-1.5">
            {payload.map((p: any, idx: number) => (
              <div key={idx} className="flex items-center gap-4 justify-between">
                <span className="text-muted-foreground font-semibold">{p.name}:</span>
                <span className="font-mono font-bold text-foreground">
                  {formatValue(p.name, p.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  switch (chart_type) {
    case 'bar_chart': {
      const xAxisKey = config.x_axis || 'campaign_name';
      const yAxisKey = config.y_axis || 'spend';
      
      // Sort data strictly by config.sort ('ASC' or 'DESC')
      let sortedData = [...data];
      if (config.sort) {
        const isAsc = String(config.sort).toLowerCase() === 'asc';
        sortedData.sort((a, b) => {
          const aVal = Number(a[yAxisKey] || 0);
          const bVal = Number(b[yAxisKey] || 0);
          return isAsc ? aVal - bVal : bVal - aVal;
        });
      }

      return (
        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm w-full">
          <h4 className="font-display text-sm font-bold text-foreground mb-4">{title}</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                {renderGradients()}
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis 
                  dataKey={xAxisKey} 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10, fontWeight: 500 }} 
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  dy={10}
                />
                <YAxis 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => {
                    if (yAxisKey.toLowerCase().includes('spend') || yAxisKey.toLowerCase().includes('revenue')) {
                      return val >= 100000 ? `₹${(val / 100000).toFixed(0)}L` : `₹${val}`;
                    }
                    return val >= 1000000 ? `${(val / 1000000).toFixed(0)}M` : val;
                  }}
                />
                <Tooltip content={customTooltip} cursor={{ fill: 'var(--secondary)', opacity: 0.1 }} />
                <Bar dataKey={yAxisKey} radius={[4, 4, 0, 0]}>
                  {sortedData.map((entry, index) => {
                    const colors = getPlatformColors(entry.platform || entry.channel || 'General');
                    return <Cell key={`cell-${index}`} fill={colors.fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    case 'line_chart': {
      const xAxisKey = config.x_axis || (data[0]?.date !== undefined ? 'date' : 'label');
      const yAxisKey = config.y_axis || 'spend';
      const numericKeys = Object.keys(data[0] || {}).filter((key) =>
        key !== xAxisKey && data.some((row) => row[key] !== null && row[key] !== undefined && !isNaN(Number(row[key])))
      );
      const seriesKeys = numericKeys.length > 1 ? numericKeys : [yAxisKey];
      const lineColors = ['#6366f1', '#16a34a', '#ea580c', '#db2777', '#0891b2', '#8b5cf6'];

      return (
        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm w-full">
          <h4 className="font-display text-sm font-bold text-foreground mb-4">{title}</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                {renderGradients()}
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis 
                  dataKey={xAxisKey} 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10, fontWeight: 500 }} 
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  dy={10}
                  tickFormatter={(val) => {
                    if (!val) return '';
                    if (typeof val === 'string' && !/\d{4}-\d{2}-\d{2}/.test(val)) return val;
                    try {
                      const d = new Date(val);
                      if (Number.isNaN(d.getTime())) return val;
                      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    } catch (e) {
                      return val;
                    }
                  }}
                />
                <YAxis 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => {
                    if (yAxisKey.toLowerCase().includes('spend')) {
                      return val >= 100000 ? `₹${(val / 100000).toFixed(0)}L` : `₹${val}`;
                    }
                    return val;
                  }}
                />
                <Tooltip content={customTooltip} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" iconSize={10} />
                {seriesKeys.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={lineColors[index % lineColors.length]}
                    strokeWidth={2}
                    dot={{ r: 3, stroke: lineColors[index % lineColors.length], strokeWidth: 1.5, fill: '#fff' }}
                    activeDot={{ r: 5, stroke: lineColors[index % lineColors.length], strokeWidth: 2, fill: lineColors[index % lineColors.length] }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    case 'pie_chart': {
      const xAxisKey = config.x_axis || 'platform';
      const yAxisKey = config.y_axis || 'spend';
      const pieColors = ['#6366f1', '#ea580c', '#db2777', '#8b5cf6', '#10b981'];
      return (
        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm w-full">
          <h4 className="font-display text-sm font-bold text-foreground mb-4">{title}</h4>
          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey={yAxisKey}
                  nameKey={xAxisKey}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: any) => formatValue(yAxisKey, val)} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" iconSize={10} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    case 'bubble_chart':
    case 'scatter_chart': {
      const xAxisKey = config.x_axis || 'x';
      const yAxisKey = config.y_axis || 'y';
      const zAxisKey = config.z_axis || 'z';
      const chartData = data.map((row) => ({
        ...row,
        [xAxisKey]: Number(row[xAxisKey] ?? 0),
        [yAxisKey]: Number(row[yAxisKey] ?? 0),
        [zAxisKey]: Math.max(1, Number(row[zAxisKey] ?? 1)),
      }));

      return (
        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm w-full">
          <h4 className="font-display text-sm font-bold text-foreground mb-4">{title}</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, left: 8, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  type="number"
                  dataKey={xAxisKey}
                  name={xAxisKey}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                />
                <YAxis
                  type="number"
                  dataKey={yAxisKey}
                  name={yAxisKey}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <ZAxis type="number" dataKey={zAxisKey} range={chart_type === 'bubble_chart' ? [80, 520] : [80, 80]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={customTooltip} />
                <Scatter name={title} data={chartData} fill="#6366f1" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    case 'kpi_card': {
      const firstRow = data[0] || {};
      const keys = Object.keys(firstRow).filter(
        k => !['id', 'client_id', 'tenant_id', 'created_at', 'updated_at', 'action_value', 'currency'].includes(k.toLowerCase())
      );
      return (
        <div className="w-full">
          <h4 className="font-display text-sm font-bold text-foreground mb-3">{title}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {keys.map((key) => {
              const val = firstRow[key];
              const isRoas = key.toLowerCase().includes('roas');
              
              let displayVal = formatValue(key, val);
              if (isRoas && (val === null || val === undefined)) {
                displayVal = '—';
              }

              return (
                <div key={key} className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    {getMetricIcon(key)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground truncate">{key.replace('_', ' ')}</div>
                    <div className="mt-1 font-display text-xl font-bold text-foreground truncate">
                      {displayVal}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case 'table':
    default: {
      const keys = Object.keys(data[0] || {}).filter(
        k => !['id', 'client_id', 'tenant_id', 'created_at', 'updated_at', 'action_value', 'currency'].includes(k.toLowerCase())
      );
      return (
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="px-5 py-4 border-b border-border bg-muted/10">
            <h4 className="font-display text-sm font-bold text-foreground">{title}</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-slate-50 dark:bg-slate-900/50">
                  {keys.map((k) => (
                    <th key={k} className="px-5 py-3.5 text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {k.replace('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-muted/10 transition-colors">
                    {keys.map((key) => {
                      const val = row[key];
                      const isFreq = key.toLowerCase() === 'frequency';
                      const isRoas = key.toLowerCase() === 'roas';

                      // Frequency cell styling rule (frequency >= 3.0 amber)
                      const highlightAmber = isFreq && Number(val) >= 3.0;

                      return (
                        <td key={key} className="px-5 py-3 text-sm text-foreground/90 whitespace-nowrap">
                          {highlightAmber ? (
                            <span className="inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-500">
                              {Number(val).toFixed(2)}
                            </span>
                          ) : isRoas && (val === null || val === undefined) ? (
                            <span className="text-muted-foreground font-medium">—</span>
                          ) : (
                            formatValue(key, val)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  }
}
