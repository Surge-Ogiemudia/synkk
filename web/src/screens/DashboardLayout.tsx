import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Globe, ShoppingCart, Database, Activity, Box, Search, Users, LogOut, Settings, Menu, X, Loader2, Sparkles, Shield, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { ensurePusherConnected } from '@/lib/pusher';
import { getTerminalModules, type TerminalModules } from '@/lib/api';
import SettingsModal from '@/components/SettingsModal';
import { bridgeLogout } from '@/lib/sso';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleKey?: keyof TerminalModules;
  isAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'PSX Web', path: '/dashboard', icon: Globe, moduleKey: 'psxWeb' },
  { name: 'POS Register', path: '/dashboard/pos', icon: ShoppingCart, moduleKey: 'pos' },
  { name: 'EMR Terminal', path: '/dashboard/emr', icon: Database, moduleKey: 'emr' },
  { name: 'Dispensary', path: '/dashboard/dispensary', icon: Activity, moduleKey: 'dispensary' },
  { name: 'Online Orders & Leads', path: '/dashboard/orders', icon: Box, moduleKey: 'orders' },
  { name: 'Source', path: '/dashboard/source', icon: Search, moduleKey: 'source' },
  { name: 'Staff Management', path: '/dashboard/staff', icon: Users, moduleKey: 'staff' },
  { name: 'Subdomain & Social AI', path: '/dashboard/social', icon: Sparkles, moduleKey: 'socialAi' },
  { name: 'Admin Control Panel', path: '/dashboard/admin', icon: Shield, isAdminOnly: true },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(auth.getProfile());
  const [modules, setModules] = useState<TerminalModules>({});
  const [allowedModules, setAllowedModules] = useState<TerminalModules | undefined>(undefined);
  const [modulesFetched, setModulesFetched] = useState(false);
  const [loadingModules, setLoadingModules] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!profile) {
      auth.restoreSession().then((restored) => {
        if (restored) setProfile(auth.getProfile());
      });
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.slug) {
      ensurePusherConnected(profile.slug);
    }
  }, [profile?.slug]);

  useEffect(() => {
    getTerminalModules().then((res) => {
      setModules(res.modules);
      setAllowedModules(res.allowedModules);
      setModulesFetched(true);
    });
  }, []);

  const isModulePermitted = (key?: keyof TerminalModules) => {
    if (!key) return true;
    if (allowedModules && allowedModules[key] === false) return false;
    return modules[key] !== false;
  };

  const currentNavItem = NAV_ITEMS.find((item) =>
    item.path === '/dashboard'
      ? location.pathname === '/dashboard'
      : location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  );

  useEffect(() => {
    if (!modulesFetched) return;

    if (currentNavItem?.moduleKey && !isModulePermitted(currentNavItem.moduleKey)) {
      const firstEnabled = NAV_ITEMS.find((item) => isModulePermitted(item.moduleKey));
      if (firstEnabled && firstEnabled.path !== location.pathname) {
        navigate(firstEnabled.path, { replace: true });
        return;
      }
    }

    if (loadingModules) {
      const timer = setTimeout(() => {
        setLoadingModules(false);
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [modulesFetched, modules, allowedModules, location.pathname, navigate, loadingModules, currentNavItem]);

  const handleLogout = async () => {
    setSigningOut(true);
    const servicesToConnect: ('pos' | 'emr')[] = [];
    if (modules.pos !== false || modules.staff !== false) servicesToConnect.push('pos');
    if (modules.emr !== false || modules.dispensary !== false) servicesToConnect.push('emr');

    if (servicesToConnect.length > 0) {
      await bridgeLogout(servicesToConnect, () => {});
    }
    await auth.clearSession();
    navigate('/');
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setIsSidebarOpen(false);
  };

  const isCurrentPermitted = !currentNavItem?.moduleKey || isModulePermitted(currentNavItem.moduleKey);

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
      <div className="flex-1 relative overflow-x-hidden overflow-y-auto custom-scroll bg-[#050505]">
        {!isCurrentPermitted ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Module Restricted by Admin</h2>
            <p className="text-sm text-slate-400 max-w-md mb-6">
              Access to this module has been restricted for your terminal by Super Admin. Contact your administrator to adjust module permissions.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </div>

      {/* Sidebar Overlay Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Panel */}
      <div 
        className={`fixed top-0 left-0 bottom-0 w-72 bg-slate-900 border-r border-slate-800 z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="overflow-hidden">
            <h3 className="font-bold text-slate-100 text-sm truncate">{profile?.businessName || 'Pharmacy'}</h3>
            <p className="text-xs text-slate-400 truncate">{profile?.staffName || 'Staff'}</p>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Items */}
        <div className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.filter((item) => isModulePermitted(item.moduleKey)).map((item) => {
            const isActive = item.path === '/dashboard' 
              ? location.pathname === '/dashboard' 
              : location.pathname.startsWith(item.path);
            const Icon = item.icon;

            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.name}</span>
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-800 flex flex-col gap-2">
          <button
            onClick={() => {
              setIsSidebarOpen(false);
              setShowSettings(true);
            }}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <Settings className="w-5 h-5 shrink-0" />
            <span>Terminal Settings</span>
          </button>

          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {signingOut ? (
              <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
            ) : (
              <LogOut className="w-5 h-5 shrink-0" />
            )}
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal 
          modules={modules}
          allowedModules={allowedModules}
          onChange={(updated: TerminalModules) => setModules(updated)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
