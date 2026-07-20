import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Globe, ShoppingCart, Database, Activity, Box, Search, Users, LogOut, Settings, Menu, X } from 'lucide-react';
import { auth } from '@/lib/auth';
import { ensurePusherConnected } from '@/lib/pusher';
import { getTerminalModules, type TerminalModules } from '@/lib/api';
import SettingsModal from '@/components/SettingsModal';

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
  { name: 'PSX Web', path: '/dashboard', icon: Globe },
  { name: 'POS Register', path: '/dashboard/pos', icon: ShoppingCart, moduleKey: 'pos' },
  { name: 'EMR Terminal', path: '/dashboard/emr', icon: Database, moduleKey: 'emr' },
  { name: 'Dispensary', path: '/dashboard/dispensary', icon: Activity, moduleKey: 'dispensary' },
  { name: 'Online Orders & Leads', path: '/dashboard/orders', icon: Box, moduleKey: 'orders' },
  { name: 'Source', path: '/dashboard/source', icon: Search, moduleKey: 'source' },
  { name: 'Staff Management', path: '/dashboard/staff', icon: Users, moduleKey: 'staff' },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = auth.getProfile();
  const [modules, setModules] = useState<TerminalModules>({});
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
    getTerminalModules().then(setModules);
  }, []);

  // If the tab someone's currently on gets switched off (from this device or
  // another one, since it's synced), don't leave them stranded on a hidden page.
  useEffect(() => {
    const current = NAV_ITEMS.find((item) =>
      item.path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(item.path)
    );
    if (current?.moduleKey && modules[current.moduleKey] === false) {
      navigate('/dashboard');
    }
  }, [modules, location.pathname, navigate]);

  const handleLogout = () => {
    auth.clearSession();
    navigate('/');
  };

  return (
    <div className="flex h-screen w-full bg-[#050505] text-slate-100 overflow-hidden">
      <div className={`transition-all duration-300 ease-in-out border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl flex flex-col z-20 shadow-2xl shrink-0 ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-none'}`}>
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
          <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-white shrink-0 ml-2">
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
                onClick={() => navigate(item.path)}
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
            onClick={() => setShowSettings(true)}
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

      <div className="flex-1 relative overflow-hidden bg-[#050505]">
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-4 left-4 z-40 p-2.5 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 shadow-xl transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <Outlet />
      </div>

      {showSettings && (
        <SettingsModal modules={modules} onChange={setModules} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
