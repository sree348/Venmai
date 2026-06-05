import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

export default function CampaignModal({ show, onClose, campaign, clients, activeClientId, onSave }: any) {
  const [formData, setFormData] = useState({
    name: '',
    clientId: activeClientId || clients[0]?.id,
    channel: 'Meta',
    budget: 10000,
    status: 'healthy',
    active: true,
    campaign_target: 'Lead Generation',
    audience_type: 'Cold',
    ad_format: 'Single Image',
    product_category: 'EV'
  });
  
  useEffect(() => {
    setFormData(campaign ? {
      ...campaign,
      campaign_target: campaign.campaign_target || 'Lead Generation',
      audience_type: campaign.audience_type || 'Cold',
      ad_format: campaign.ad_format || 'Single Image',
      product_category: campaign.product_category || 'EV'
    } : {
      name: '',
      clientId: activeClientId || clients[0]?.id,
      channel: 'Meta',
      budget: 10000,
      status: 'healthy',
      active: true,
      campaign_target: 'Lead Generation',
      audience_type: 'Cold',
      ad_format: 'Single Image',
      product_category: 'EV'
    });
  }, [campaign, show, activeClientId, clients]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div><h2 className="text-base font-bold">{campaign ? 'Edit Campaign' : 'New Campaign'}</h2><p className="text-xs text-slate-400 mt-0.5">Configure campaign settings</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center border-0 bg-transparent cursor-pointer"><X className="w-4 h-4 text-slate-500" /></button>
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
          <div className="grid grid-cols-2 gap-3.5">
            <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Platform</label>
              <select value={formData.channel} onChange={e => setFormData({ ...formData, channel: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white">
                <option value="Meta">📘 Meta Ads</option><option value="Google">🔍 Google Ads</option><option value="LinkedIn">💼 LinkedIn Ads</option><option value="TikTok">🎵 TikTok Ads</option>
              </select>
            </div>
            <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Budget (USD)</label>
              <div className="relative"><span className="absolute left-3 top-2.5 text-sm text-slate-400">$</span>
                <input type="number" value={formData.budget} onChange={e => setFormData({ ...formData, budget: parseInt(e.target.value) || 0 })} className="w-full h-10 pl-7 pr-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Optimization Goal</label>
              <select value={formData.campaign_target} onChange={e => setFormData({ ...formData, campaign_target: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white">
                <option value="Lead Generation">Lead Generation</option>
                <option value="Traffic">Traffic</option>
                <option value="Conversions">Conversions</option>
                <option value="Brand Awareness">Brand Awareness</option>
              </select>
            </div>
            <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Audience Type</label>
              <select value={formData.audience_type} onChange={e => setFormData({ ...formData, audience_type: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white">
                <option value="Cold">Cold</option>
                <option value="Lookalike">Lookalike</option>
                <option value="Broad">Broad</option>
                <option value="Retargeting">Retargeting</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Ad Format</label>
              <select value={formData.ad_format} onChange={e => setFormData({ ...formData, ad_format: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white">
                <option value="Single Image">Single Image</option>
                <option value="Video">Video</option>
                <option value="Carousel">Carousel</option>
              </select>
            </div>
            <div><label className="text-xs font-bold text-slate-700 mb-1.5 block">Product Category</label>
              <select value={formData.product_category} onChange={e => setFormData({ ...formData, product_category: e.target.value })} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-white">
                <option value="EV">EV</option>
                <option value="XUV 3XO">XUV 3XO</option>
                <option value="XUV 7XO">XUV 7XO</option>
                <option value="Thar">Thar</option>
                <option value="XEV 9S">XEV 9S</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 cursor-pointer bg-white">Cancel</button>
            <button onClick={() => { if (!formData.name.trim()) { toast.error('Please enter a campaign name'); return; } onSave(campaign ? formData : { ...formData, spend: 0, roas: 0, ctr: 0, cpm: 0, conv: 0, change: 0, impressions: 0, clicks: 0, frequency: 0 }); }} className="flex-1 h-10 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 cursor-pointer border-0">
              {campaign ? 'Update' : 'Create Campaign'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
