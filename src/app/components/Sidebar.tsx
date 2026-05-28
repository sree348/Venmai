import { useApp, CLIENTS } from '../context/AppContext';
import { 
  Building2, Briefcase, Sparkles, LayoutDashboard, Target, Link2, Database, 
  FileText, Users, Settings, Zap, X, ChevronDown, Check, Cpu
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import NavLink from './shared/NavLink';
import MIPLogo from './shared/MIPLogo';

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const {
    activeView,
    setActiveView,
    selectedClientId,
    setSelectedClientId,
    activeClient,
    setSelectedCampaign,
    setSelectedDashboard,
    setViewMode,
    showClientSwitcher,
    setShowClientSwitcher,
    setShowMobileMenu,
    integrations = [],
  } = useApp();

  const navItems = [
    { id: 'agency', icon: <LayoutDashboard className="w-4 h-4" />, label: 'Agency Overview' },
    { id: 'clients', icon: <Users className="w-4 h-4" />, label: 'Clients', count: 1 },
    { id: 'ai', icon: <Cpu className="w-4 h-4" />, label: 'AI Analysis', badge: 'New' },
    { id: 'ai-analysis', icon: <Sparkles className="w-4 h-4" />, label: 'AI Brain', badge: integrations.some((i: any) => i.connected) ? '● Live' : undefined },
    { id: 'dashboards', icon: <BarChart3 className="w-4 h-4" />, label: 'Dashboards' },
    { id: 'campaigns', icon: <Target className="w-4 h-4" />, label: 'Campaigns', count: 13 },
    { id: 'analytics', icon: <BarChart3 className="w-4 h-4" />, label: 'Analytics' },
    { id: 'audiences', icon: <Users className="w-4 h-4" />, label: 'Audiences' },
  ];

  const connectItems = [
    { id: 'integrations', icon: <Link2 className="w-4 h-4" />, label: 'Integrations' },
    { id: 'data', icon: <Database className="w-4 h-4" />, label: 'Data Sources' },
    { id: 'reports', icon: <FileText className="w-4 h-4" />, label: 'Reports' },
  ];

  const settingsItems = [
    { id: 'team', icon: <Users className="w-4 h-4" />, label: 'Team' },
    { id: 'settings', icon: <Settings className="w-4 h-4" />, label: 'Workspace' },
  ];

  const goToView = (id: string, closeMenu = false) => {
    setActiveView(id);
    if (id === 'campaigns') { setViewMode('list'); setSelectedCampaign(null); }
    if (id === 'dashboards') setSelectedDashboard(1);
    if (closeMenu) setShowMobileMenu(false);
  };

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4 flex-shrink-0">
        <div className="flex items-center">
          <MIPLogo className="h-9 text-slate-900 dark:text-white" />
        </div>
        {onClose && (
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center cursor-pointer border-0 bg-transparent">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Client Context Selector */}
      <div className="px-3 pt-3 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => setShowClientSwitcher(!showClientSwitcher)}
            className="w-full flex items-center gap-3 rounded-xl border border-border bg-gradient-to-br from-violet-50 to-pink-50/40 p-3 transition-all hover:shadow-card text-left cursor-pointer"
          >
            {activeClient ? (
              <div className={`flex size-9 items-center justify-center rounded-lg bg-gradient-to-br ${activeClient.color} text-xs font-bold text-white shadow-sm flex-shrink-0`}>
                {activeClient.avatar || activeClient.name.slice(0, 2).toUpperCase()}
              </div>
            ) : (
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-xs font-bold text-muted-foreground flex-shrink-0 border border-border">
                <Building2 className="w-4 h-4" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate text-foreground">
                {activeClient ? activeClient.name : 'All Clients'}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {activeClient ? activeClient.industry : 'Agency-wide view'}
              </div>
            </div>
            <ChevronDown className={`size-4 text-muted-foreground flex-shrink-0 transition-transform ${showClientSwitcher ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showClientSwitcher && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowClientSwitcher(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
                >
                  <div className="p-1">
                    <button
                      onClick={() => { setSelectedClientId(null); setShowClientSwitcher(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left cursor-pointer border-0 ${!selectedClientId ? 'bg-gradient-primary text-white' : 'hover:bg-secondary bg-transparent text-foreground'}`}
                    >
                      <div className="w-6 h-6 rounded-md bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold">All Clients</p>
                        <p className={`text-[10px] ${!selectedClientId ? 'text-white/80' : 'text-muted-foreground'}`}>Agency-wide view</p>
                      </div>
                      {!selectedClientId && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <div className="my-1 border-t border-border" />
                    {CLIENTS.map(client => (
                      <button
                        key={client.id}
                        onClick={() => { setSelectedClientId(client.id); setShowClientSwitcher(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left cursor-pointer border-0 ${selectedClientId === client.id ? 'bg-gradient-primary text-white' : 'hover:bg-secondary bg-transparent text-foreground'}`}
                      >
                        <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${client.color} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
                          {client.avatar || client.name.slice(0,2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{client.name}</p>
                          <p className={`text-[10px] truncate ${selectedClientId === client.id ? 'text-white/80' : 'text-muted-foreground'}`}>{client.industry}</p>
                        </div>
                        {selectedClientId === client.id && <Check className="w-3 h-3 flex-shrink-0 text-white" />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav List grouped by lovable sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <Section label="Workspace">
          {navItems.map(item => (
            <NavLink
              key={item.id}
              icon={item.icon}
              label={item.label}
              badge={item.badge}
              count={item.count}
              active={activeView === item.id}
              onClick={() => { goToView(item.id, !!onClose); onClose?.(); }}
            />
          ))}
        </Section>

        <Section label="Connect">
          {connectItems.map(item => (
            <NavLink 
              key={item.id} 
              icon={item.icon} 
              label={item.label} 
              active={activeView === item.id} 
              onClick={() => { goToView(item.id, !!onClose); onClose?.(); }} 
            />
          ))}
        </Section>

        <Section label="Settings">
          {settingsItems.map(item => (
            <NavLink 
              key={item.id} 
              icon={item.icon} 
              label={item.label} 
              active={activeView === item.id} 
              onClick={() => { goToView(item.id, !!onClose); onClose?.(); }} 
            />
          ))}
        </Section>
      </nav>

      {/* Profile Footer */}
      <div className="border-t border-border p-3 flex-shrink-0">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-sky text-xs font-bold text-white shadow-sm">
            PM
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">Product Manager</div>
            <div className="truncate text-[10px] text-muted-foreground">Owner · Venpep</div>
          </div>
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full flex-shrink-0 animate-pulse shadow-sm"></div>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/75">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

// Inline duplicate to resolve build imports if needed
function BarChart3(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
