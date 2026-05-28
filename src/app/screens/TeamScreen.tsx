import { useApp } from '../context/AppContext';
import { UserPlus, Users, MoreVertical } from 'lucide-react';
import PageWrapper from '../components/shared/PageWrapper';

export default function TeamScreen() {
  const { setShowInviteModal } = useApp();
  const { CLIENTS: clients } = useApp() as any;

  const members = [
    { id: 1, name: 'Product Manager', email: 'pm@venpep.com', role: 'Owner', avatar: 'PM', status: 'online', clients: ['All Clients'], joined: 'Jan 2023' },
    { id: 2, name: 'Rohan Patel', email: 'rohan@venpep.com', role: 'Account Manager', avatar: 'RP', status: 'online', clients: ['CAI Mahindra'], joined: 'Feb 2023' },
    { id: 3, name: 'Anitha Singh', email: 'anitha@venpep.com', role: 'Account Manager', avatar: 'AS', status: 'away', clients: ['CAI Mahindra'], joined: 'Jun 2023' },
    { id: 4, name: 'Dev Team Lead', email: 'dev@venpep.com', role: 'Analyst', avatar: 'DT', status: 'offline', clients: ['CAI Mahindra'], joined: 'Sep 2022' },
  ];
  const statusCfg: any = { online: 'bg-emerald-500', away: 'bg-amber-500', offline: 'bg-slate-300' };

  return (
    <PageWrapper>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-sm text-slate-500 mt-0.5">{members.length} team members managing {clients.length} clients</p>
        </div>
        <button onClick={() => setShowInviteModal(true)} className="h-9 px-4 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm cursor-pointer border-0"><UserPlus className="w-4 h-4" />Invite</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/60">
          <div className="grid grid-cols-12 gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <div className="col-span-4">Member</div>
            <div className="col-span-3 hidden sm:block">Role</div>
            <div className="col-span-4 hidden md:block">Assigned Clients</div>
            <div className="col-span-1"></div>
          </div>
        </div>
        {members.map(m => (
          <div key={m.id} className="p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
            <div className="grid grid-cols-12 gap-4 items-center">
              <div className="col-span-4 flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white text-xs font-bold">{m.avatar}</div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusCfg[m.status]}`}></div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{m.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{m.email}</p>
                </div>
              </div>
              <div className="col-span-3 hidden sm:block">
                <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">{m.role}</span>
              </div>
              <div className="col-span-4 hidden md:flex items-center gap-1.5 flex-wrap">
                {m.clients.map(clientName => {
                  if (clientName === 'All Clients') return <span key={clientName} className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">All Clients</span>;
                  const client = clients.find((c: any) => c.name === clientName);
                  return client ? (
                    <span key={clientName} className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${client.lightBg} ${client.textColor} ${client.lightBorder} border`}>
                      {clientName}
                    </span>
                  ) : null;
                })}
              </div>
              <div className="col-span-1 flex justify-end">
                <button className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center cursor-pointer bg-white">
                  <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageWrapper>
  );
}
