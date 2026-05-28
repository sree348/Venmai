import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

export default function DashboardModal({ show, onClose, clients, activeClientId, onSave }: any) {
  const [formData, setFormData] = useState({ name: '', description: '', clientId: activeClientId || clients[0]?.id, widgets: 6, schedule: null, updated: 'Just now', recipients: 0, favorite: false });
  
  useEffect(() => {
    if (!show) {
      setFormData({ name: '', description: '', clientId: activeClientId || clients[0]?.id, widgets: 6, schedule: null, updated: 'Just now', recipients: 0, favorite: false });
    } else {
      setFormData(prev => ({ ...prev, clientId: activeClientId || clients[0]?.id }));
    }
  }, [show, activeClientId, clients]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">Create Dashboard</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3.5">
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Client *</label>
            <select value={formData.clientId} onChange={e => setFormData({ ...formData, clientId: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white">
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Dashboard Name *</label>
            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20" placeholder="e.g. Weekly Executive Summary" />
          </div>
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Description</label>
            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full h-16 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 resize-none" placeholder="What does this dashboard track?" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={() => { if (!formData.name.trim()) { toast.error('Please enter a name'); return; } onSave({ ...formData, color: 'from-slate-50 to-slate-100' }); }} className="flex-1 h-10 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800">Create Dashboard</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
