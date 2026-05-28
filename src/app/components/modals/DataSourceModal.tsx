import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

export default function DataSourceModal({ show, onClose, source, onSave, onDelete }: any) {
  const [name, setName] = useState('');
  const [type, setType] = useState('Ad Platform');
  const [emoji, setEmoji] = useState('📊');
  const [syncFreq, setSyncFreq] = useState('synced');

  useEffect(() => {
    if (source) {
      setName(source.name);
      setType(source.type);
      setEmoji(source.emoji);
      setSyncFreq(source.status);
    } else {
      setName('');
      setType('Ad Platform');
      setEmoji('📊');
      setSyncFreq('synced');
    }
  }, [source, show]);

  if (!show) return null;

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Source name is required');
      return;
    }
    onSave({
      id: source ? source.id : Date.now(),
      name,
      type,
      emoji,
      status: syncFreq,
      lastSync: 'Just now',
      records: source ? source.records : '0',
      connected: true
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold">{source ? `Configure Source` : `Add Data Source`}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Integrate transactional or custom analytics data</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1.5 block">Source Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20"
              placeholder="e.g. Klaviyo Customer Leads"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1.5 block">Category</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white"
              >
                <option value="Ad Platform">Ad Platform</option>
                <option value="Web Analytics">Web Analytics</option>
                <option value="eCommerce">eCommerce</option>
                <option value="CRM">CRM</option>
                <option value="Payments">Payments</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1.5 block">Icon Emoji</label>
              <input
                type="text"
                value={emoji}
                onChange={e => setEmoji(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                maxLength={2}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1.5 block">Initial Status</label>
            <select
              value={syncFreq}
              onChange={e => setSyncFreq(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white"
            >
              <option value="synced">Synced (Healthy)</option>
              <option value="warning">Stale (Warning)</option>
              <option value="error">Failed (Error)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            {source && (
              <button
                onClick={() => onDelete(source.id)}
                className="h-10 px-4 border border-red-200 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 flex items-center justify-center font-bold"
              >
                Disconnect
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 h-10 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800"
            >
              {source ? 'Save' : 'Add Source'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
