import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { AppProvider, useApp, CLIENTS } from './context/AppContext';
import { BrowserRouter, useLocation, useNavigate } from 'react-router';
import FloatingAIAgent from './components/FloatingAIAgent';

// Icons
import {
  ChevronDown, Bell, Search, ChevronRight, ArrowRight, Building2, Briefcase, LogOut, Mail, ShieldCheck, User, Zap
} from 'lucide-react';

// Sidebar
import Sidebar from './components/Sidebar';

// Modals
import CampaignModal from './components/modals/CampaignModal';
import DashboardModal from './components/modals/DashboardModal';
import ReportModal from './components/modals/ReportModal';
import InviteModal from './components/modals/InviteModal';
import ConnectorModal from './components/modals/ConnectorModal';
import DataSourceModal from './components/modals/DataSourceModal';
import { apiService } from '../services/api.service';

// Screens
import AgencyOverviewScreen from './screens/AgencyOverviewScreen';
import ClientsScreen from './screens/ClientsScreen';
import AIScreen from './screens/AIScreen';
import CampaignsScreen from './screens/CampaignsScreen';
import CampaignDetailScreen from './screens/CampaignDetailScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import AudiencesScreen from './screens/AudiencesScreen';
import IntegrationsScreen from './screens/IntegrationsScreen';
import DashboardsScreen from './screens/DashboardsScreen';
import DashboardViewerScreen from './screens/DashboardViewerScreen';
import DataSourcesScreen from './screens/DataSourcesScreen';
import ReportsScreen from './screens/ReportsScreen';
import TeamScreen from './screens/TeamScreen';
import SettingsScreen from './screens/SettingsScreen';
import NotificationsScreen from './screens/NotificationsScreen';

// Shared atoms
import PlatformDot from './components/shared/PlatformDot';
import MIPLogo from './components/shared/MIPLogo';

type LoginProfile = {
  name: string;
  email: string;
  role: string;
  workspace: string;
};

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AppProvider>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState<LoginProfile | null>(() => {
    try {
      const saved = window.localStorage.getItem('marketiq.profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const {
    activeView, setActiveView,
    selectedClientId,
    activeClient,
    campaigns, setCampaigns,
    dashboards, setDashboards,
    selectedCampaign,
    selectedDashboard,
    
    showCampaignModal, setShowCampaignModal,
    showDashboardModal, setShowDashboardModal,
    showReportModal, setShowReportModal,
    showInviteModal, setShowInviteModal,
    showConnectorModal, setShowConnectorModal,
    showDataSourceModal, setShowDataSourceModal,
    
    editingCampaign, setEditingCampaign,
    selectedConnector, setSelectedConnector,
    selectedDataSource, setSelectedDataSource,
    
    searchQuery, setSearchQuery,
    notifications, setNotifications,
    viewMode,
    showMobileMenu, setShowMobileMenu,
    showClientSwitcher,
    
    integrations, setIntegrations,
    dataSources, setDataSources,
  } = useApp();

  const initials = useMemo(() => {
    const source = profile?.name || 'Product Manager';
    return source
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || 'PM';
  }, [profile]);

  const logout = () => {
    window.localStorage.removeItem('marketiq.profile');
    setProfile(null);
    toast.success('Signed out.');
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      setActiveView('dashboards');
      toast.success('Meta Ads connected! Fetching your data...');
      params.delete('connected');
      const nextSearch = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
    }
  }, [setActiveView]);


  // Ensure dashboard loads on root path
  useEffect(() => {
    if (location.pathname === '/' && activeView !== 'dashboards') {
      navigate('/dashboards', { replace: true });
    }
  }, [location.pathname, activeView, navigate]);

  const activeViewRef = useRef(activeView);
  const locationPathnameRef = useRef(location.pathname);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    locationPathnameRef.current = location.pathname;
  }, [location.pathname]);

  // Sync activeView changes to browser URL path (runs ONLY when activeView changes)
  useEffect(() => {
    const currentPath = locationPathnameRef.current;
    let targetPath = '';
    switch (activeView) {
      case 'agency':
        targetPath = '/dashboard';
        break;
      case 'campaigns':
        targetPath = '/campaigns';
        break;
      case 'ai-analysis':
        targetPath = '/brain';
        break;
      case 'analytics':
        targetPath = '/analytics';
        break;
      case 'ai':
        targetPath = '/ai-analysis';
        break;
      default:
        targetPath = `/${activeView}`;
        break;
    }
    if (currentPath !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [activeView, navigate]);

  // Sync browser URL path changes to activeView view state (runs ONLY when path changes)
  useEffect(() => {
    const path = location.pathname;
    let targetView = '';
    switch (path) {
      case '/dashboard':
        targetView = 'agency';
        break;
      case '/campaigns':
        targetView = 'campaigns';
        break;
      case '/brain':
        targetView = 'ai-analysis';
        break;
      case '/analytics':
        targetView = 'analytics';
        break;
      case '/ai-analysis':
        targetView = 'ai';
        break;
      case '/':
        targetView = 'dashboards';
        break;
      default:
        if (path.length > 1) {
          targetView = path.substring(1);
        }
        break;
    }
    if (targetView && targetView !== activeViewRef.current) {
      setActiveView(targetView);
    }
  }, [location.pathname, setActiveView]);

  if (!profile) {
    return <LoginScreen onContinue={setProfile} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <Toaster position="top-right" richColors closeButton />

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-4 top-4 bottom-4 w-60 bg-sidebar border border-sidebar-border rounded-3xl flex-col z-50 shadow-xl shadow-slate-900/5 backdrop-blur-xl">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {showMobileMenu && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setShowMobileMenu(false)}>
            <motion.aside
              initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 h-screen w-60 bg-sidebar border-r border-sidebar-border flex flex-col shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <Sidebar onClose={() => setShowMobileMenu(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="lg:ml-68">
        {/* Header */}
        <header className="h-16 bg-card/75 backdrop-blur-lg border-b border-border flex items-center justify-between px-6 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowMobileMenu(true)} className="lg:hidden w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center cursor-pointer border-0 bg-transparent">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>

            {/* Breadcrumb */}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-bold">
              <span className="text-slate-400">{profile.workspace}</span>
              <span className="text-slate-350 font-normal">›</span>
              {activeClient && (
                <>
                  <span className={`${activeClient.textColor}`}>{activeClient.name}</span>
                  <span className="text-slate-350 font-normal">›</span>
                </>
              )}
              <span className="text-slate-700 capitalize">{activeView === 'agency' ? 'Agency Overview' : activeView === 'ai' ? 'AI Analysis' : activeView === 'ai-analysis' ? 'AI Brain' : activeView.charAt(0).toUpperCase() + activeView.slice(1)}</span>
            </div>

            {/* Client badge on mobile */}
            {activeClient && (
              <span className={`lg:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${activeClient.lightBg} ${activeClient.textColor} ${activeClient.lightBorder} border`}>
                <PlatformDot platform={activeClient.platforms[0] || 'Meta'} />
                {activeClient.name}
              </span>
            )}
          </div>

          {/* Centralized Search Bar with Keyboard Shortcuts */}
          <div className="relative hidden sm:block mx-auto max-w-sm w-full">
            <Search className="absolute left-3.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="search"
              placeholder="Search campaigns, dashboards..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-10 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white transition-all placeholder-slate-400 font-bold"
            />
            <kbd className="absolute right-2.5 top-2 h-5 px-1.5 bg-white border border-slate-200 rounded text-[9px] font-bold text-slate-400 flex items-center gap-0.5 pointer-events-none select-none shadow-sm">
              <span>⌘</span><span>K</span>
            </kbd>
          </div>

          <div className="flex items-center gap-1.5 ml-4">
            <button
              onClick={() => { setActiveView('notifications'); setNotifications(0); }}
              className="relative w-8 h-8 rounded-lg hover:bg-slate-50 flex items-center justify-center transition-colors cursor-pointer border-0 bg-transparent"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {notifications > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-1.5 ring-white"></span>}
            </button>
            <div className="w-px h-4 bg-slate-200 mx-0.5" />
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl cursor-pointer hover:bg-slate-50 border border-transparent hover:border-slate-150 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-xs font-bold">{initials}</div>
              <div className="hidden md:block">
                <p className="text-[11px] font-bold text-slate-850 leading-tight">{profile.name}</p>
                <p className="text-[9px] text-slate-400 font-semibold">{profile.role} - {profile.workspace}</p>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400 hidden md:block" />
            </div>
            <button
              onClick={logout}
              className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg border border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className={`${(activeView === 'ai' || activeView === 'ai-analysis') ? 'h-[calc(100vh-3.5rem)] flex flex-col p-4 sm:p-6' : 'p-4 sm:p-6 lg:p-8'}`}>
          <AnimatePresence mode="wait">
            {activeView === 'agency' && <AgencyOverviewScreen key="agency" />}
            {activeView === 'clients' && <ClientsScreen key="clients" />}
            {(activeView === 'ai' || activeView === 'ai-analysis') && <AIScreen key="ai" />}
            {activeView === 'campaigns' && viewMode === 'list' && <CampaignsScreen key="campaigns" />}
            {activeView === 'campaigns' && viewMode === 'detail' && <CampaignDetailScreen key="campaign-detail" />}
            {activeView === 'analytics' && <AnalyticsScreen key="analytics" />}
            {activeView === 'audiences' && <AudiencesScreen key="audiences" />}
            {activeView === 'integrations' && <IntegrationsScreen key="integrations" />}
            {activeView === 'dashboards' && (
              selectedDashboard ? <DashboardViewerScreen key="dashboard-viewer" /> : <DashboardsScreen key="dashboards" />
            )}
            {activeView === 'data' && <DataSourcesScreen key="data" />}
            {activeView === 'reports' && <ReportsScreen key="reports" />}
            {activeView === 'team' && <TeamScreen key="team" />}
            {activeView === 'settings' && <SettingsScreen key="settings" />}
            {activeView === 'notifications' && <NotificationsScreen key="notifications" />}
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <CampaignModal show={showCampaignModal} onClose={() => { setShowCampaignModal(false); setEditingCampaign(null); }}
        campaign={editingCampaign} clients={CLIENTS} activeClientId={selectedClientId}
        onSave={(c: any) => {
          if (editingCampaign) { setCampaigns(campaigns.map((x: any) => x.id === c.id ? c : x)); toast.success('Campaign updated!'); }
          else { setCampaigns([...campaigns, { ...c, id: Date.now() }]); toast.success('Campaign created!'); }
          setShowCampaignModal(false); setEditingCampaign(null);
        }}
      />
      <DashboardModal show={showDashboardModal} onClose={() => setShowDashboardModal(false)} clients={CLIENTS} activeClientId={selectedClientId}
        onSave={(d: any) => { setDashboards([...dashboards, { ...d, id: Date.now() }]); setShowDashboardModal(false); toast.success('Dashboard created!'); }}
      />
      <ReportModal
        show={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSave={(report: any) => {
          setShowReportModal(false);
          toast.success(`Report "${report.name}" is ready to generate and download.`);
        }}
      />
      <InviteModal show={showInviteModal} onClose={() => setShowInviteModal(false)} />
      <ConnectorModal
        show={showConnectorModal}
        onClose={() => { setShowConnectorModal(false); setSelectedConnector(null); }}
        connector={selectedConnector}
        clients={CLIENTS}
        onSave={async (updated: any) => {
          if (!apiService.isMockMode && updated.name !== 'Meta Ads') {
            try {
              await apiService.savePlatformConnection(updated);
            } catch (error) {
              toast.error('Connection saved locally, but backend storage failed.');
            }
          }

          const { credentials, ...safeUpdated } = updated;
          setIntegrations(integrations.map((ig: any) => ig.id === safeUpdated.id ? safeUpdated : ig));
          setShowConnectorModal(false);
          setSelectedConnector(null);
          toast.success(`${safeUpdated.name} configuration saved!`);
        }}
        onDelete={(id: number) => {
          const ig = integrations.find((x: any) => x.id === id);
          setIntegrations(integrations.map((x: any) => x.id === id ? { ...x, connected: false, clients: [], campaigns: 0, spend: 0 } : x));
          setShowConnectorModal(false);
          setSelectedConnector(null);
          toast.success(`${ig?.name || 'Integration'} disconnected!`);
        }}
      />
      <DataSourceModal
        show={showDataSourceModal}
        onClose={() => { setShowDataSourceModal(false); setSelectedDataSource(null); }}
        source={selectedDataSource}
        onSave={(updated: any) => {
          if (dataSources.some((ds: any) => ds.id === updated.id)) {
            setDataSources(dataSources.map((ds: any) => ds.id === updated.id ? updated : ds));
            toast.success(`Data source "${updated.name}" updated!`);
          } else {
            setDataSources([...dataSources, updated]);
            toast.success(`Data source "${updated.name}" added successfully!`);
          }
          setShowDataSourceModal(false);
          setSelectedDataSource(null);
        }}
        onDelete={(id: number) => {
          const ds = dataSources.find((x: any) => x.id === id);
          setDataSources(dataSources.filter((x: any) => x.id !== id));
          setShowDataSourceModal(false);
          setSelectedDataSource(null);
          toast.success(`Data source "${ds?.name || 'Source'}" removed!`);
        }}
      />
      <FloatingAIAgent />
    </div>
  );
}

function LoginScreen({ onContinue }: { onContinue: (profile: LoginProfile) => void }) {
  const [form, setForm] = useState<LoginProfile>({
    name: '',
    email: '',
    role: 'Product Manager',
    workspace: 'Venpep',
  });
  const [error, setError] = useState('');

  const updateField = (field: keyof LoginProfile, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

    if (!form.name.trim()) {
      setError('Enter your full name.');
      return;
    }

    if (!emailOk) {
      setError('Enter a valid work email.');
      return;
    }

    const profile = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role.trim() || 'Product Manager',
      workspace: form.workspace.trim() || 'Venpep',
    };

    window.localStorage.setItem('marketiq.profile', JSON.stringify(profile));
    onContinue(profile);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <Toaster position="top-right" richColors closeButton />
      <main className="min-h-screen grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:flex flex-col justify-between border-r border-slate-200 bg-white px-12 py-10">
          <div className="flex items-center">
            <MIPLogo className="h-10 text-slate-950" />
          </div>

          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {apiService.isMockMode ? 'Demo workspace' : 'Live backend workspace'}
            </div>
            <h1 className="font-display text-5xl font-extrabold leading-tight tracking-normal text-slate-950">
              Command your campaigns.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-500">
              Review campaign health, sync ad platforms, ask AI analysis questions, and prepare client-ready reports from one operating workspace.
            </p>
          </div>

          <div className="grid max-w-xl grid-cols-3 gap-3">
            {[
              { label: 'Campaign checks', value: '16' },
              { label: 'AI insights', value: '7' },
              { label: 'Report exports', value: 'DOCX' },
            ].map(item => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-num text-xl font-bold text-slate-950">{item.value}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden flex items-center">
              <MIPLogo className="h-10 text-slate-950" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
              <div className="mb-7">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-bold tracking-normal text-slate-950">Sign in to workspace</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Use your work details to open the agency dashboard.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <Field
                  icon={<User className="h-4 w-4" />}
                  label="Full name"
                  value={form.name}
                  placeholder="Priya Menon"
                  onChange={value => updateField('name', value)}
                  autoComplete="name"
                />
                <Field
                  icon={<Mail className="h-4 w-4" />}
                  label="Work email"
                  type="email"
                  value={form.email}
                  placeholder="priya@venpep.com"
                  onChange={value => updateField('email', value)}
                  autoComplete="email"
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    icon={<Briefcase className="h-4 w-4" />}
                    label="Role"
                    value={form.role}
                    placeholder="Product Manager"
                    onChange={value => updateField('role', value)}
                    autoComplete="organization-title"
                  />
                  <Field
                    icon={<Building2 className="h-4 w-4" />}
                    label="Workspace"
                    value={form.workspace}
                    placeholder="Venpep"
                    onChange={value => updateField('workspace', value)}
                    autoComplete="organization"
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-0 bg-slate-900 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
                >
                  Continue to MarketIQ
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-5 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                <p className="text-xs leading-5 text-slate-500">
                  This creates a local UI session. Production login should exchange credentials for the backend JWT used by protected API routes.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  placeholder,
  onChange,
  type = 'text',
  autoComplete,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">{label}</span>
      <span className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition-colors focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
        <span className="text-slate-400">{icon}</span>
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={event => onChange(event.target.value)}
          autoComplete={autoComplete}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
        />
      </span>
    </label>
  );
}
