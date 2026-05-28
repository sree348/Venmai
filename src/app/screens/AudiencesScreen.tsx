import { useApp } from '../context/AppContext';
import { Plus, Target } from 'lucide-react';
import PageWrapper from '../components/shared/PageWrapper';
import ClientAvatar from '../components/shared/ClientAvatar';

export default function AudiencesScreen() {
  const { activeClient } = useApp();
  const { CLIENTS: clients } = useApp() as any;

  const allAudiences = [
    { id: 1, clientId: 'cai_mahindra', name: 'Lookalike — XUV 7XO Buyers 1–2%', size: 2400000, platform: 'Meta', type: 'Lookalike', campaigns: 3, growth: '+12%' },
    { id: 2, clientId: 'cai_mahindra', name: 'Website Visitors – Test Drive Bookers 30d', size: 156000, platform: 'Meta', type: 'Custom', campaigns: 2, growth: '+5%' },
    { id: 3, clientId: 'cai_mahindra', name: 'In-Market: SUV & Automotive Enthusiasts', size: 3200000, platform: 'Meta', type: 'In-Market', campaigns: 2, growth: '+3%' },
    { id: 4, clientId: 'cai_mahindra', name: 'Commercial Vehicle Fleet Owners', size: 480000, platform: 'Meta', type: 'Job Title', campaigns: 2, growth: '+8%' },
    { id: 5, clientId: 'cai_mahindra', name: 'Custom Retargeting — Video Viewers (UGC)', size: 1100000, platform: 'Meta', type: 'Custom', campaigns: 1, growth: '-2%' },
    { id: 6, clientId: 'cai_mahindra', name: 'Lead Form Submitters – High Intent', size: 38000, platform: 'Meta', type: 'Retargeting', campaigns: 1, growth: '+18%' },
    { id: 7, clientId: 'cai_mahindra', name: 'XEV 9S Launch RSVP Registrants', size: 890000, platform: 'Meta', type: 'Interest', campaigns: 1, growth: '+31%' }
  ];

  const audiences = activeClient ? allAudiences.filter(a => a.clientId === activeClient.id) : allAudiences;
  const groupedByClient = clients.map((client: any) => ({
    client,
    items: audiences.filter(a => a.clientId === client.id),
  })).filter((g: any) => g.items.length > 0);

  const platformColors: any = { Meta: 'bg-blue-50 text-blue-700 border-blue-100', Google: 'bg-emerald-50 text-emerald-700 border-emerald-100', LinkedIn: 'bg-indigo-50 text-indigo-700 border-indigo-100', TikTok: 'bg-pink-50 text-pink-700 border-pink-100' };

  return (
    <PageWrapper>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audiences</h1>
          <p className="text-sm text-slate-500 mt-0.5">{audiences.length} audience segments{activeClient ? ` for ${activeClient.name}` : ' across all clients'}</p>
        </div>
        <button className="h-9 px-4 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm cursor-pointer"><Plus className="w-4 h-4" />Create Audience</button>
      </div>

      {groupedByClient.map(({ client, items }: any) => (
        <div key={client.id} className="space-y-3">
          {!activeClient && (
            <div className={`flex items-center gap-3 p-3 rounded-xl border mb-3 ${client.lightBg} ${client.lightBorder}`}>
              <ClientAvatar client={client} size="sm" />
              <div>
                <p className={`text-sm font-bold ${client.textColor}`}>{client.name}</p>
                <p className="text-[11px] text-slate-500">{items.length} audience segments</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
            {items.map((audience: any) => (
              <div key={audience.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-bold text-slate-900 mb-1">{audience.name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 border rounded-lg text-[10px] font-bold ${platformColors[audience.platform]}`}>{audience.platform}</span>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{audience.type}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold font-['JetBrains_Mono'] text-slate-900">
                      {audience.size >= 1000000 ? `${(audience.size / 1000000).toFixed(1)}M` : `${(audience.size / 1000).toFixed(0)}K`}
                    </p>
                    <p className={`text-[10px] font-bold ${audience.growth.startsWith('+') ? 'text-emerald-600' : 'text-red-600'}`}>{audience.growth}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><Target className="w-2.5 h-2.5" />{audience.campaigns} active campaign{audience.campaigns !== 1 ? 's' : ''}</span>
                  <button className="font-semibold text-slate-600 hover:text-slate-900 cursor-pointer border-0 bg-transparent">View details →</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </PageWrapper>
  );
}
