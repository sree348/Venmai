import { useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportModal({ show, onClose, onSave }: any) {
  const [name, setName] = useState('');
  const [freq, setFreq] = useState('Weekly');
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5"><h2 className="text-base font-bold">Create Report</h2><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button></div>
        <div className="space-y-3.5">
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Report Name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20" placeholder="e.g. Nova Weekly Summary" /></div>
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Frequency</label><select value={freq} onChange={e => setFreq(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none bg-white"><option>Daily</option><option>Weekly</option><option>Monthly</option></select></div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={() => { if (!name.trim()) { toast.error('Enter report name'); return; } onSave({ name, frequency: freq }); setName(''); }} className="flex-1 h-10 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800">Create</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
