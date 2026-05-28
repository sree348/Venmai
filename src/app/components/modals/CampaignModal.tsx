import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

export default function CampaignModal({ show, onClose, campaign, clients, activeClientId, onSave }: any) {
  const [formData, setFormData] = useState({ name: '', clientId: activeClientId || clients[0]?.id, channel: 'Meta', budget: 10000, status: 'healthy', active: true });
  
  useEffect(() => {
    setFormData(campaign ? campaign : { name: '', clientId: activeClientId || clients[0]?.id, channel: 'Meta', budget: 10000, status: 'healthy', active: true });
  }, [campaign, show, activeClientId, clients]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div><h2 className="text-base font-bold">{campaign ? 'Edit Campaign' : 'New Campaign'}</h2><p className="text-xs text-slate-400 mt-0.5">Configure campaign settings</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3.5">
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Client *</label>
            <select value={formData.clientId} onChange={e => setFormData({ ...formData, clientId: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white">
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Campaign Name *</label>
            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20" placeholder="e.g. Summer Sale — Lookalike" />
          </div>
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Platform</label>
            <select value={formData.channel} onChange={e => setFormData({ ...formData, channel: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white">
              <option value="Meta">📘 Meta Ads</option><option value="Google">🔍 Google Ads</option><option value="LinkedIn">💼 LinkedIn Ads</option><option value="TikTok">🎵 TikTok Ads</option>
            </select>
          </div>
          <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Budget (USD)</label>
            <div className="relative"><span className="absolute left-3 top-2.5 text-sm text-slate-400">$</span>
              <input type="number" value={formData.budget} onChange={e => setFormData({ ...formData, budget: parseInt(e.target.value) })} className="w-full h-10 pl-7 pr-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={() => { if (!formData.name.trim()) { toast.error('Please enter a campaign name'); return; } onSave(campaign ? formData : { ...formData, spend: 0, roas: 0, ctr: 0, cpm: 0, conv: 0, change: 0, impressions: 0, clicks: 0, frequency: 0 }); }} className="flex-1 h-10 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800">
              {campaign ? 'Update' : 'Create Campaign'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
