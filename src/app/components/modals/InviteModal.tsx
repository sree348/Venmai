import { useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

export default function InviteModal({ show, onClose, onSave }: any) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Analyst');
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5"><h2 className="text-base font-bold">Invite Team Member</h2><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button></div>
        <div className="space-y-3.5">
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Email *</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20" placeholder="colleague@venpep.com" /></div>
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ r: 'Analyst', d: 'View & export' }, { r: 'Account Manager', d: 'Manage clients' }, { r: 'Admin', d: 'Full access' }, { r: 'Viewer', d: 'Read only' }].map(item => (
                <button key={item.r} onClick={() => setRole(item.r)} className={`p-2.5 rounded-xl border text-left transition-all ${role === item.r ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <p className="text-xs font-bold text-slate-900">{item.r}</p><p className="text-[10px] text-slate-400">{item.d}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={() => { if (!email.includes('@')) { toast.error('Valid email required'); return; } onSave({ email, role }); setEmail(''); }} className="flex-1 h-10 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800">Send Invite</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
