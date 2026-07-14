import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { toast } from 'sonner';
import { apiService } from '../../services/api.service';
import { mockCampaigns, mockClients, parseTargetingFromName } from '../../services/mock-data';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANT CLIENT DATA
// ═══════════════════════════════════════════════════════════════════════════════
export const CLIENTS = mockClients;

const INITIAL_CAMPAIGNS = mockCampaigns;

const INITIAL_DASHBOARDS = [
  { id: 1, clientId: 'cai_mahindra', name: 'CAI Mahindra – Real-Time Performance', description: 'Complete 14-tile dashboard for the modern performance marketer', platform: 'Meta Ads', widgets: 14, updated: 'Just now', schedule: 'Daily 9am', recipients: 4, favorite: true, color: 'from-blue-50 to-indigo-100/60' },
  { id: 2, clientId: 'cai_mahindra', name: 'CAI Mahindra — Google Ads Performance Dashboard', description: 'Real-time search and Performance Max tracking for Google Ads campaigns', platform: 'Google Ads', widgets: 14, updated: 'Just now', schedule: 'Daily 9am', recipients: 4, favorite: true, color: 'from-emerald-50 to-teal-100/60' },
  { id: 3, clientId: 'cai_mahindra', name: 'CAI Mahindra — Budget & Efficiency Overview', description: 'Multi-channel spend tracking, CPA benchmarks and CPA scaling indices', widgets: 10, updated: '2 hours ago', schedule: 'Mon-Fri 8am', recipients: 2, favorite: false, color: 'from-slate-50 to-slate-100' }
];

// Context Type definition
interface AppContextType {
  CLIENTS: any[];
  activeView: string;
  setActiveView: (view: string) => void;
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
  activeClient: any;
  campaigns: any[];
  setCampaigns: (c: any[]) => void;
  dashboards: any[];
  setDashboards: (d: any[]) => void;
  selectedCampaign: number | null;
  setSelectedCampaign: (id: number | null) => void;
  selectedDashboard: number | null;
  setSelectedDashboard: (id: number | null) => void;
  
  showCampaignModal: boolean;
  setShowCampaignModal: (show: boolean) => void;
  showDashboardModal: boolean;
  setShowDashboardModal: (show: boolean) => void;
  showReportModal: boolean;
  setShowReportModal: (show: boolean) => void;
  showInviteModal: boolean;
  setShowInviteModal: (show: boolean) => void;
  showConnectorModal: boolean;
  setShowConnectorModal: (show: boolean) => void;
  showDataSourceModal: boolean;
  setShowDataSourceModal: (show: boolean) => void;
  
  editingCampaign: any;
  setEditingCampaign: (c: any) => void;
  selectedConnector: any;
  setSelectedConnector: (c: any) => void;
  selectedDataSource: any;
  setSelectedDataSource: (d: any) => void;
  
  campaignFilter: string;
  setCampaignFilter: (f: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  notifications: number;
  setNotifications: (n: number) => void;
  viewMode: 'list' | 'detail';
  setViewMode: (m: 'list' | 'detail') => void;
  showMobileMenu: boolean;
  setShowMobileMenu: (show: boolean) => void;
  showClientSwitcher: boolean;
  setShowClientSwitcher: (show: boolean) => void;
  
  integrations: any[];
  setIntegrations: any;
  dataSources: any[];
  setDataSources: any;
  
  scopedCampaigns: any[];
  scopedDashboards: any[];
  savedConfigs: any[];
  setSavedConfigs: (c: any[]) => void;
  pinnedWidgets: any[];
  addPinnedWidget: (dashboardId: number, widget: any) => void;
  removePinnedWidget: (widgetId: number) => void;
  reorderPinnedWidgets: (draggedId: number, targetId: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState(CLIENTS);
  const [activeView, setActiveView] = useState('dashboards');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState(INITIAL_CAMPAIGNS);
  const [dashboards, setDashboards] = useState(INITIAL_DASHBOARDS);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [selectedDashboard, setSelectedDashboardState] = useState<number | null>(() => {
    try {
      const saved = window.localStorage.getItem('marketiq.selected_dashboard');
      const dashboardId = saved ? Number(saved) : 1;
      return [1, 2, 3].includes(dashboardId) ? dashboardId : 1;
    } catch {
      return 1;
    }
  });
  const setSelectedDashboard = (id: number | null) => {
    setSelectedDashboardState(id);
    try {
      if (id === null) {
        window.localStorage.removeItem('marketiq.selected_dashboard');
      } else {
        window.localStorage.setItem('marketiq.selected_dashboard', String(id));
      }
    } catch {
      // Local storage can be unavailable in privacy-restricted browsers.
    }
  };
  const [savedConfigs, setSavedConfigs] = useState<any[]>([
    { id: 1, name: 'CAI Mahindra — April 2026 Review', monthYear: '2026-04', filters: { platforms: ['Meta'], products: [], formats: [], audiences: [], targets: [] } }
  ]);

  const [pinnedWidgets, setPinnedWidgets] = useState<any[]>(() => {
    try {
      const saved = window.localStorage.getItem('marketiq.pinned_widgets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addPinnedWidget = (dashboardId: number, widget: any) => {
    setPinnedWidgets(prev => {
      const updated = [...prev, { ...widget, dashboardId, pinnedAt: new Date().toISOString(), id: Date.now() }];
      window.localStorage.setItem('marketiq.pinned_widgets', JSON.stringify(updated));
      return updated;
    });
    toast.success('Chart pinned successfully!', {
      description: `"${widget.title}" is now pinned to your dashboard.`,
    });
  };

  const removePinnedWidget = (widgetId: number) => {
    setPinnedWidgets(prev => {
      const updated = prev.filter(w => w.id !== widgetId);
      window.localStorage.setItem('marketiq.pinned_widgets', JSON.stringify(updated));
      return updated;
    });
    toast.success('Chart unpinned.');
  };

  const reorderPinnedWidgets = (draggedId: number, targetId: number) => {
    setPinnedWidgets(prev => {
      const copy = [...prev];
      const draggedIndex = copy.findIndex(w => w.id === draggedId);
      const targetIndex = copy.findIndex(w => w.id === targetId);
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [removed] = copy.splice(draggedIndex, 1);
        copy.splice(targetIndex, 0, removed);
      }
      window.localStorage.setItem('marketiq.pinned_widgets', JSON.stringify(copy));
      return copy;
    });
  };
  
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showConnectorModal, setShowConnectorModal] = useState(false);
  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
  
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const [selectedConnector, setSelectedConnector] = useState<any>(null);
  const [selectedDataSource, setSelectedDataSource] = useState<any>(null);
  
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState(4);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showClientSwitcher, setShowClientSwitcher] = useState(false);

  const [integrations, setIntegrations] = useState([
    { id: 1, name: 'Meta Ads', category: 'Social Advertising', desc: 'Facebook + Instagram', emoji: '📘', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-blue-50 to-blue-100/50', border: 'border-blue-200', badge: 'bg-blue-50 text-blue-700 border-blue-200', points: ['Campaigns', 'Ad Sets', 'Creatives', 'Insights'], connected: false },
    { id: 2, name: 'TikTok Ads', category: 'Social Advertising', desc: 'TikTok for Business', emoji: '🎵', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-pink-50 to-pink-100/50', border: 'border-pink-200', badge: 'bg-pink-50 text-pink-700 border-pink-200', points: ['Campaigns', 'Videos', 'Analytics'], connected: false },
    { id: 3, name: 'LinkedIn Ads', category: 'Social Advertising', desc: 'Campaign Manager', emoji: '💼', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-indigo-50 to-indigo-100/50', border: 'border-indigo-200', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', points: ['Campaigns', 'Sponsored Content', 'Audience'], connected: false },
    { id: 4, name: 'X / Twitter', category: 'Social Advertising', desc: 'Twitter Ads', emoji: '🕳️', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-slate-50 to-slate-100', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700 border-slate-200', points: ['Tweets', 'Campaigns', 'Followers'], connected: false },
    { id: 5, name: 'Pinterest', category: 'Social Advertising', desc: 'Pinterest Ads', emoji: '📌', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-slate-50 to-slate-100', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700 border-slate-200', points: ['Pins', 'Campaigns', 'Boards'], connected: false },
    { id: 6, name: 'Snapchat', category: 'Social Advertising', desc: 'Snap Ads Manager', emoji: '👻', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-slate-50 to-slate-100', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700 border-slate-200', points: ['Snaps', 'Campaigns', 'Lenses'], connected: false },
    { id: 7, name: 'Google Ads', category: 'Search Advertising', desc: 'Search, Shopping, Display', emoji: '🔍', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-emerald-50 to-emerald-100/50', border: 'border-emerald-200', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', points: ['Search', 'Shopping', 'Keywords', 'Quality Score'], connected: false },
    { id: 8, name: 'Microsoft Ads', category: 'Search Advertising', desc: 'Bing Ads', emoji: '🪟', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-slate-50 to-slate-100', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700 border-slate-200', points: ['Bing Search', 'Campaigns', 'Keywords'], connected: false },
    { id: 9, name: 'Amazon Ads', category: 'Search Advertising', desc: 'Sponsored Products', emoji: '🛒', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-slate-50 to-slate-100', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700 border-slate-200', points: ['Products', 'Sponsored Ads', 'Sales'], connected: false },
    { id: 10, name: 'Google Analytics 4', category: 'Analytics & Attribution', desc: 'GA4 Web Analytics', emoji: '📈', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-cyan-50 to-cyan-100/50', border: 'border-cyan-200', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', points: ['Web Traffic', 'User Journeys', 'Conversions'], connected: false },
    { id: 11, name: 'AppsFlyer', category: 'Analytics & Attribution', desc: 'Mobile Attribution', emoji: '📡', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-slate-50 to-slate-100', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700 border-slate-200', points: ['Installs', 'Cohorts', 'Attribution'], connected: false },
    { id: 12, name: 'HubSpot', category: 'E-Commerce & CRM', desc: 'CRM & Marketing', emoji: '🧡', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-slate-50 to-slate-100', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700 border-slate-200', points: ['Contacts', 'Leads', 'Deals'], connected: false },
    { id: 13, name: 'Shopify', category: 'E-Commerce & CRM', desc: 'E-Commerce Store', emoji: '🛒', clients: [], campaigns: 0, spend: 0, lastSync: 'Never', color: 'from-slate-50 to-slate-100', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700 border-slate-200', points: ['Orders', 'Products', 'Customers'], connected: false },
  ]);

  const [dataSources, setDataSources] = useState([
    { id: 1, name: 'Meta Business Suite', type: 'Ad Platform', status: 'synced', lastSync: '2 min ago', records: '1.2M', emoji: '📘', connected: true },
    { id: 2, name: 'Google Analytics 4', type: 'Web Analytics', status: 'synced', lastSync: '5 min ago', records: '850k', emoji: '📊', connected: true },
    { id: 3, name: 'Shopify Store', type: 'eCommerce', status: 'synced', lastSync: '15 min ago', records: '320k', emoji: '🛒', connected: false },
    { id: 4, name: 'HubSpot CRM', type: 'CRM', status: 'warning', lastSync: '2 hr ago', records: '45k', emoji: '🧡', connected: false },
    { id: 5, name: 'LinkedIn Campaign Manager', type: 'Ad Platform', status: 'synced', lastSync: '10 min ago', records: '280k', emoji: '💼', connected: true },
    { id: 6, name: 'Stripe Payments', type: 'Payments', status: 'error', lastSync: 'Failed', records: '—', emoji: '💳', connected: false },
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadRealtimeData = () => {
      Promise.all([
        apiService.getClients(),
        apiService.getCampaigns(),
        apiService.getPlatformConnections().catch(() => []),
      ])
      .then(([nextClients, nextCampaigns, platformConnections]: any) => {
        if (cancelled) return;
        setClients(nextClients);
        setCampaigns(nextCampaigns);

        if (!apiService.isMockMode) {
          setIntegrations(prev => prev.map((integration: any) => {
            const connection = platformConnections.find((item: any) => item.platform === integration.name);

            return connection
              ? { ...integration, connected: true, lastSync: connection.lastSyncAt || 'Not synced', backendConnectionId: connection.id }
              : integration;
          }));
        }
      })
      .catch(() => {
        if (!apiService.isMockMode) {
          toast.error('Unable to load backend data. Check API server connection.');
        }
      });
    };

    loadRealtimeData();
    const intervalId = apiService.isMockMode ? null : window.setInterval(loadRealtimeData, 30000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  const activeClient = selectedClientId ? clients.find(c => c.id === selectedClientId) : null;

  // Scope data to selected client (or all)
  const scopedCampaigns = useMemo(() => {
    return campaigns
      .map((c: any) => {
        if (c.campaign_target && c.audience_type && c.ad_format && c.product_category) return c;
        const parsed = parseTargetingFromName(c.name || c.campaignName, c.channel || c.platform);
        return {
          ...c,
          campaign_target: c.campaign_target || parsed.campaign_target,
          audience_type: c.audience_type || parsed.audience_type,
          ad_format: c.ad_format || parsed.ad_format,
          product_category: c.product_category || parsed.product_category,
        };
      })
      .filter((c: any) => {
        const clientMatch = !selectedClientId || c.clientId === selectedClientId;
        const statusMatch = campaignFilter === 'all' || c.status === campaignFilter || (campaignFilter === 'at_risk' && c.status === 'warning');
        
        const q = searchQuery.toLowerCase();
        const searchMatch = !searchQuery ||
          String(c.name || '').toLowerCase().includes(q) ||
          String(c.channel || c.platform || '').toLowerCase().includes(q) ||
          (c.campaign_target && String(c.campaign_target).toLowerCase().includes(q)) ||
          (c.audience_type && String(c.audience_type).toLowerCase().includes(q)) ||
          (c.ad_format && String(c.ad_format).toLowerCase().includes(q)) ||
          (c.product_category && String(c.product_category).toLowerCase().includes(q));
          
        return clientMatch && statusMatch && searchMatch;
      });
  }, [campaigns, selectedClientId, campaignFilter, searchQuery]);

  const scopedDashboards = dashboards.filter(d => !selectedClientId || d.clientId === selectedClientId);

  return (
    <AppContext.Provider value={{
      CLIENTS: clients,
      activeView, setActiveView,
      selectedClientId, setSelectedClientId,
      activeClient,
      campaigns, setCampaigns,
      dashboards, setDashboards,
      selectedCampaign, setSelectedCampaign,
      selectedDashboard, setSelectedDashboard,
      
      showCampaignModal, setShowCampaignModal,
      showDashboardModal, setShowDashboardModal,
      showReportModal, setShowReportModal,
      showInviteModal, setShowInviteModal,
      showConnectorModal, setShowConnectorModal,
      showDataSourceModal, setShowDataSourceModal,
      
      editingCampaign, setEditingCampaign,
      selectedConnector, setSelectedConnector,
      selectedDataSource, setSelectedDataSource,
      
      campaignFilter, setCampaignFilter,
      searchQuery, setSearchQuery,
      notifications, setNotifications,
      viewMode, setViewMode,
      showMobileMenu, setShowMobileMenu,
      showClientSwitcher, setShowClientSwitcher,
      
      integrations, setIntegrations,
      dataSources, setDataSources,
      
      scopedCampaigns,
      scopedDashboards,
      savedConfigs,
      setSavedConfigs,
      pinnedWidgets,
      addPinnedWidget,
      removePinnedWidget,
      reorderPinnedWidgets
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
