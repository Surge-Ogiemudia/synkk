import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Globe, ShoppingCart, Activity, Settings, Box, Search, Users, Database, Sparkles } from 'lucide-react';
import PosTab from './PosTab';
import DispensaryTab from './DispensaryTab';
import EmrTab from './EmrTab';

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [showSettings, setShowSettings] = useState(false);
  const [modules, setModules] = useState({
    psxWeb: true,
    pos: true,
    dispensary: true,
    orders: true,
    source: true,
    staff: false,
    emr: false,
    synkk: true,
    socialAi: true,
  });
  const [pharmacyName, setPharmacyName] = useState('PharmaStackX');
  const [staffName, setStaffName] = useState('Pro Terminal');
  const [staffRole, setStaffRole] = useState('');
  const [staffPhone, setStaffPhone] = useState('');

  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('get-app-modules').then((backendModules: any) => {
      if (backendModules) {
        setModules(backendModules);
        localStorage.setItem('psx-app-modules', JSON.stringify(backendModules));
      } else {
        const saved = localStorage.getItem('psx-app-modules');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setModules(parsed);
            ipcRenderer.invoke('save-app-modules', parsed);
          } catch (e) {}
        } else {
          // Sync defaults to backend
          ipcRenderer.invoke('save-app-modules', modules);
        }
      }
    });

    ipcRenderer.invoke('get-storefront-data').then((data: any) => {
      if (data && data.slug) {
        if (data.name) setPharmacyName(data.name);
        if (data.staffName) setStaffName(data.staffName);
        if (data.role) setStaffRole(data.role);
        if (data.phone) setStaffPhone(data.phone);
      } else {
        navigate('/');
      }
    });
  }, []);

  const saveModules = (newModules: typeof modules) => {
    setModules(newModules);
    localStorage.setItem('psx-app-modules', JSON.stringify(newModules));
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('save-app-modules', newModules);
  };

  useEffect(() => {
    const current = allNavItems.find((item) =>
      item.path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(item.path)
    );
    if (current && !current.show) {
      const firstEnabled = allNavItems.find(item => item.show);
      if (firstEnabled && firstEnabled.path !== location.pathname) {
        navigate(firstEnabled.path);
      }
    }
  }, [modules, location.pathname, navigate]);

  const allNavItems = [
    { name: 'PSX Web', path: '/dashboard', icon: Globe, show: modules.psxWeb !== false },
    { name: 'Subdomain & Social AI', path: '/dashboard/social', icon: Sparkles, show: modules.socialAi !== false },
    { name: 'POS Register', path: '/dashboard/pos', icon: ShoppingCart, show: modules.pos },
    { name: 'Synkk Engine', path: '/dashboard/synkk', icon: Settings, show: modules.synkk },
    { name: 'EMR Terminal', path: '/dashboard/emr', icon: Database, show: modules.emr },
    { name: 'Dispensary', path: '/dashboard/dispensary', icon: Activity, show: modules.dispensary },
    { name: 'Online Orders & Leads', path: '/dashboard/orders', icon: Box, show: modules.orders },
    { name: 'Source', path: '/dashboard/source', icon: Search, show: modules.source },
    { name: 'Staff Management', path: '/dashboard/staff', icon: Users, show: modules.staff },
  ];

  const visibleNavItems = allNavItems.filter(item => item.show);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-slate-100 overflow-hidden">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl flex flex-col z-20 shadow-2xl relative">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/20 flex items-center justify-center font-bold text-white text-xs uppercase overflow-hidden">
            {pharmacyName.substring(0, 2)}
          </div>
          <div className="overflow-hidden">
            <h2 className="font-bold text-[15px] leading-tight tracking-tight truncate" title={pharmacyName}>{pharmacyName}</h2>
            <div className="flex flex-col gap-0.5 mt-0.5">
              <p className="text-[10px] text-emerald-400 font-medium truncate" title={staffName}>
                {staffName} {staffRole ? `(${staffRole})` : ''}
              </p>
              {staffPhone && (
                <p className="text-[10px] text-slate-400 font-medium truncate" title={staffPhone}>
                  {staffPhone}
                </p>
              )}
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scroll">
          {visibleNavItems.map((item) => {
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
                <item.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="font-semibold text-sm">{item.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 flex flex-col gap-2">
          <button
            onClick={() => {
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              ipcRenderer.invoke('set-view-mode', 'mini');
              navigate('/mini-widget');
            }}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <Box className="w-4 h-4" /> Switch to Mini View
          </button>
          <div className="flex items-center gap-2">
            <button 
            onClick={async () => {
              try {
                // @ts-ignore
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('logout-completely');
              } catch (e) {
                console.error('Failed to clear session:', e);
              }
              navigate('/');
            }} 
            className="flex-1 text-xs text-slate-500 hover:text-red-400 transition-colors py-3 px-2 text-center rounded-xl hover:bg-slate-800/50"
          >
            Log Out / Switch Account
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-x-hidden overflow-y-auto custom-scroll bg-[#050505]">
        {/* Animated Background Blobs */}
        <div className="blob bg-emerald-500/10 w-[600px] h-[600px] top-[-10%] left-[-10%] fixed pointer-events-none"></div>
        <div className="blob bg-cyan-500/10 w-[500px] h-[500px] bottom-[-20%] right-[-10%] fixed pointer-events-none" style={{ animationDelay: '2s' }}></div>
        
        <div className="relative z-10 w-full h-full flex flex-col">
          {/* Webview routes are persisted in the background */}
          <div className={location.pathname === '/dashboard/pos' ? 'w-full h-full flex flex-col flex-1' : 'hidden'}>
            <PosTab />
          </div>
          <div className={location.pathname === '/dashboard/dispensary' ? 'w-full h-full flex flex-col flex-1' : 'hidden'}>
            <DispensaryTab />
          </div>
          <div className={location.pathname === '/dashboard/emr' ? 'w-full h-full flex flex-col flex-1' : 'hidden'}>
            <EmrTab />
          </div>
          
          <div className={['/dashboard/pos', '/dashboard/dispensary', '/dashboard/emr'].includes(location.pathname) ? 'hidden' : 'w-full h-full flex flex-col flex-1'}>
            <Outlet />
          </div>
        </div>
      </div>

      {/* Modules Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">App Modules Configuration</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-400 mb-6">Enable or disable modules to customize this terminal for your workflow.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries({
                  psxWeb: 'PSX Web',
                  socialAi: 'Subdomain & Social AI',
                  pos: 'Point of Sale',
                  dispensary: 'Dispensary',
                  orders: 'Online Orders & Leads',
                  source: 'Patient Sourcing',
                  staff: 'Staff Management',
                  emr: 'EMR Terminal',
                  synkk: 'Synkk Engine'
                }).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 cursor-pointer hover:bg-slate-800/80 hover:border-emerald-500/50 transition-all group">
                    <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{label}</span>
                    <div className="relative inline-block w-10 h-6 flex-shrink-0">
                      <input 
                        type="checkbox" 
                        className="peer sr-only" 
                        checked={modules[key as keyof typeof modules]}
                        onChange={(e) => saveModules({ ...modules, [key]: e.target.checked })}
                      />
                      <div className="w-10 h-6 bg-slate-700 rounded-full peer-checked:bg-emerald-500 transition-colors"></div>
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
