import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AlertTriangle, AlertCircle, TrendingUp, Zap, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import PageWrapper from '../components/shared/PageWrapper';
import ClientBadge from '../components/shared/ClientBadge';

export default function NotificationsScreen() {
  const { CLIENTS: clients } = useApp() as any;

  const [items, setItems] = useState([
    { id: 1, type: 'alert', clientId: 'cai_mahindra', title: 'CAI Mahindra — Critical fatigue alert', message: 'XEV 9S Launch campaign CTR dropped below 1%. Creative fatigue is at 4.1× frequency.', time: '2 hours ago', read: false },
    { id: 2, type: 'warning', clientId: 'cai_mahindra', title: 'CAI Mahindra — Budget threshold reached', message: 'CAI March Benefits 2026 reached 80% of daily spend budget (₹10.6k of ₹13.3k).', time: '3 hours ago', read: false },
    { id: 3, type: 'success', clientId: 'cai_mahindra', title: 'CAI Mahindra — Scale opportunity', message: 'XUV 7XO March campaign hitting 6.2× ROAS — 42% above target. Ready to scale.', time: '5 hours ago', read: false },
    { id: 4, type: 'info', clientId: null, title: 'Agency — Weekly report ready', message: 'Your weekly CAI Mahindra performance summary is ready. Total spend: ₹54.4k across all ad groups.', time: '2 days ago', read: true }
  ]);

  const markAll = () => { setItems(items.map(i => ({ ...i, read: true }))); toast.success('All marked as read'); };
  const typeIcon: any = { alert: <AlertTriangle className="w-4 h-4 text-red-600" />, warning: <AlertCircle className="w-4 h-4 text-amber-600" />, success: <TrendingUp className="w-4 h-4 text-emerald-600" />, info: <Zap className="w-4 h-4 text-blue-600" /> };
  const typeBg: any = { alert: 'bg-red-50', warning: 'bg-amber-50', success: 'bg-emerald-50', info: 'bg-blue-50' };
  const typeBar: any = { alert: 'border-l-red-500', warning: 'border-l-amber-500', success: 'border-l-emerald-500', info: 'border-l-blue-500' };

  return (
    <PageWrapper>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Notifications</h1><p className="text-sm text-slate-500 mt-0.5">{items.filter(n => !n.read).length} unread</p></div>
        {items.some(n => !n.read) && <button onClick={markAll} className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer border-0 bg-transparent"><CheckCircle className="w-4 h-4" />Mark all read</button>}
      </div>
      <div className="space-y-3">
        {items.map(n => {
          const client = n.clientId ? clients.find((c: any) => c.id === n.clientId) : null;
          return (
            <div key={n.id} onClick={() => setItems(items.map(i => i.id === n.id ? { ...i, read: true } : i))}
              className={`bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer hover:border-slate-300 transition-all shadow-sm ${!n.read ? `border-l-4 ${typeBar[n.type]}` : 'opacity-60'}`}>
              <div className="flex gap-4">
                <div className={`w-9 h-9 rounded-xl ${typeBg[n.type]} flex items-center justify-center flex-shrink-0`}>{typeIcon[n.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {client && <ClientBadge client={client} />}
                      <h3 className="text-sm font-bold text-slate-900">{n.title}</h3>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">{n.time}</span>
                  </div>
                  <p className="text-sm text-slate-500">{n.message}</p>
                </div>
                {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>}
              </div>
            </div>
          );
        })}
      </div>
    </PageWrapper>
  );
}
