import { CheckCircle, AlertTriangle } from 'lucide-react';

export default function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const cfg: any = {
    healthy: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="w-3 h-3" />, label: 'Healthy' },
    at_risk: { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertTriangle className="w-3 h-3" />, label: 'At Risk' },
    warning: { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertTriangle className="w-3 h-3" />, label: 'At Risk' },
    critical: { cls: 'bg-red-50 text-red-700 border-red-200', icon: <AlertTriangle className="w-3 h-3" />, label: 'Critical' },
  };
  const c = cfg[status] || cfg.healthy;
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border font-bold ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}
