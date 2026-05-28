import { TrendingUp, TrendingDown } from 'lucide-react';

export default function MetricCard({ icon, label, sublabel, sub, value, change, pos, subtext, color }: any) {
  const colorMap: any = { blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', violet: 'bg-violet-50 text-violet-600', amber: 'bg-amber-50 text-amber-600' };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 hover:shadow-md transition-all shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${colorMap[color] || 'bg-slate-50 text-slate-500'} flex items-center justify-center`}>{icon}</div>
        {change && <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${pos !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{pos !== false ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{change}</div>}
      </div>
      <p className="text-2xl font-bold font-['JetBrains_Mono'] text-slate-900 mb-0.5">{value}</p>
      <p className="text-xs font-bold text-slate-700">{label}</p>
      {(sublabel || sub || subtext) && <p className="text-[11px] text-slate-400 mt-0.5">{sublabel || sub || subtext}</p>}
    </div>
  );
}
