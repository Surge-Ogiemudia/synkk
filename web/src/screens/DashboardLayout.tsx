import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Globe, ShoppingCart, Database, Activity, Box, Search, Users, LogOut, Settings, Menu, X, Loader2, Sparkles } from 'lucide-react';
import { auth } from '@/lib/auth';
import { ensurePusherConnected } from '@/lib/pusher';
import { getTerminalModules, type TerminalModules } from '@/lib/api';
import SettingsModal from '@/components/SettingsModal';
import { bridgeLogout } from '@/lib/sso';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  // undefined = always on, not user-configurable (matches desktop: PSX Web/home
  // isn't in its App Modules Configuration list either).
  moduleKey?: keyof TerminalModules;
}

// Synkk Engine is intentionally absent — it was the desktop-only local network
// scan / process watch / local DB read flow used to auto-connect to a pharmacy's
// existing on-machine POS. There's no web equivalent and none is planned.
const NAV_ITEMS: NavItem[] = [
  { name: 'PSX Web', path: '/dashboard', icon: Globe, moduleKey: 'psxWeb' },
  { name: 'POS Register', path: '/dashboard/pos', icon: ShoppingCart, moduleKey: 'pos' },
  { name: 'EMR Terminal', path: '/dashboard/emr', icon: Database, moduleKey: 'emr' },
  { name: 'Dispensary', path: '/dashboard/dispensary', icon: Activity, moduleKey: 'dispensary' },
  { name: 'Online Orders & Leads', path: '/dashboard/orders', icon: Box, moduleKey: 'orders' },
  { name: 'Source', path: '/dashboard/source', icon: Search, moduleKey: 'source' },
  { name: 'Staff Management', path: '/dashboard/staff', icon: Users, moduleKey: 'staff' },
  { name: 'Subdomain & Social AI', path: '/dashboard/social', icon: Sparkles, moduleKey: 'psxWeb' },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(auth.getProfile());
  const [modules, setModules] = useState<TerminalModules>({});
  const [modulesFetched, setModulesFetched] = useState(false);
  const [loadingModules, setLoadingModules] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  // Restore session data if localStorage was wiped (common in iOS PWAs) but cookies remain
  useEffect(() => {
    if (!profile) {
      auth.restoreSession().then((restored) => {
        if (restored) setProfile(auth.getProfile());
      });
    }
  }, [profile]);

  // Desktop initialized this once at app startup in the main process, independent
  // of which screen was visible, so order/lead notifications kept flowing in the
  // background. Doing it here (top of the authenticated shell) is the equivalent —
  // it stays connected across tab switches since DashboardLayout doesn't unmount.
  useEffect(() => {
    if (profile?.slug) {
      ensurePusherConnected(profile.slug);
    }
  }, [profile?.slug]);

  useEffect(() => {
    getTerminalModules().then((res) => {
      setModules(res);
      setModulesFetched(true);
    });
  }, []);

  // Handle route redirect and seamless splash overlay dismissal
  useEffect(() => {
    if (!modulesFetched) return;

    const current = NAV_ITEMS.find((item) =>
      item.path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(item.path)
    );

    // If current tab is disabled, redirect to first enabled tab
    if (current?.moduleKey && modules[current.moduleKey] === false) {
      const firstEnabled = NAV_ITEMS.find((item) => !item.moduleKey || modules[item.moduleKey] !== false);
      if (firstEnabled && firstEnabled.path !== location.pathname) {
        navigate(firstEnabled.path, { replace: true });
        return; // Keep splash overlay active while router updates the location
      }
    }

    // Hide splash overlay once we are firmly on an enabled tab
    if (loadingModules) {
      const timer = setTimeout(() => {
        setLoadingModules(false);
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [modulesFetched, modules, location.pathname, navigate, loadingModules]);

  const handleLogout = async () => {
    setSigningOut(true);
    
    const servicesToConnect: ('pos' | 'emr')[] = [];
    if (modules.pos !== false || modules.staff !== false) servicesToConnect.push('pos');
    if (modules.emr !== false || modules.dispensary !== false) servicesToConnect.push('emr');

    if (servicesToConnect.length > 0) {
      await bridgeLogout(servicesToConnect, () => {}); // ignoring progress since it's fast
    }
    
    await auth.clearSession();
    navigate('/');
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#050505] text-slate-100 overflow-hidden relative">
      {/* Top Header Bar */}
      <div className="h-14 border-b border-slate-800 flex items-center px-4 shrink-0 bg-slate-900/50 z-10">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-4 font-bold text-slate-200">Terminal</span>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden bg-[#050505]">
        <Outlet />
      </div>

      {/* Sidebar Overlay Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-800 bg-[#050505]/95 backdrop-blur-xl flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/20 flex items-center justify-center font-bold text-white text-xs uppercase shrink-0">
              {(profile?.businessName || 'PX').substring(0, 2)}
            </div>
            <div className="overflow-hidden">
              <h2 className="font-bold text-[15px] leading-tight tracking-tight truncate">
                {profile?.businessName || 'PharmaStackX'}
              </h2>
              <p className="text-[10px] text-emerald-400 font-medium truncate">
                {profile?.staffName || 'Pro Terminal'} {profile?.role ? `(${profile.role})` : ''}
              </p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-white shrink-0 ml-2 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scroll">
          {NAV_ITEMS.filter((item) => !item.moduleKey || modules[item.moduleKey] !== false).map((item) => {
            const isActive = item.path === '/dashboard'
              ? location.pathname === '/dashboard'
              : location.pathname.startsWith(item.path);

            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
                }`}
              >
                <item.icon className={`shrink-0 w-5 h-5 ${isActive ? 'text-emerald-400' : ''}`} />
                <span className="font-semibold text-sm flex-1 text-left whitespace-nowrap">{item.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button
            onClick={() => {
              setShowSettings(true);
              setIsSidebarOpen(false);
            }}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <Settings className="w-4 h-4 shrink-0" /> <span className="whitespace-nowrap">Terminal Settings</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" /> <span className="whitespace-nowrap">Log Out</span>
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsModal modules={modules} onChange={setModules} onClose={() => setShowSettings(false)} />
      )}

      {/* Initial Module Loading Splash Overlay */}
      {loadingModules && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505] animate-in fade-in duration-300">
          <div className="relative flex flex-col items-center gap-6">
            {/* Glowing background aura */}
            <div className="absolute w-36 h-36 rounded-full bg-emerald-500/20 blur-2xl animate-pulse" />

            {/* Animated PWA Logo */}
            <div className="relative w-24 h-24 rounded-3xl p-1 bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-[0_0_50px_rgba(16,185,129,0.35)] animate-pulse">
              <img 
                src="/icon-192.png" 
                alt="PharmaStackX" 
                className="w-full h-full object-cover rounded-[22px] shadow-inner"
              />
            </div>

            {/* Status Indicator */}
            <div className="flex flex-col items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-wide">PharmaStackX</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                <span>Synchronizing terminal...</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signing Out Overlay */}
      {signingOut && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center shadow-lg border border-slate-700">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Signing out</h3>
              <p className="text-sm text-slate-400">Disconnecting from all terminal modules...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
