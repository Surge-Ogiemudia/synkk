import React from 'react';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Welcome from './renderer/screens/Welcome';
import WebScraper from './renderer/screens/WebScraper';
import Analysis from './renderer/screens/Analysis';
import Confirmation from './renderer/screens/Confirmation';
import ManualOverride from './renderer/screens/ManualOverride';
import StorefrontSetup from './renderer/screens/StorefrontSetup';
import GuestAuth from './renderer/screens/GuestAuth';
import Done from './renderer/screens/Done';
import BubbleMode from './renderer/screens/BubbleMode';
import SynkkEngineTab from './renderer/screens/SynkkEngineTab';
import ExtensionInstall from './renderer/screens/ExtensionInstall';

import DashboardLayout from './renderer/screens/DashboardLayout';
import GeneralDashboardTab from './renderer/screens/GeneralDashboardTab';
import PosTab from './renderer/screens/PosTab';
import DispensaryTab from './renderer/screens/DispensaryTab';
import MiniWidget from './renderer/screens/MiniWidget';
import OrdersAndLeadsTab from './renderer/screens/OrdersAndLeadsTab';
import SourceTab from './renderer/screens/SourceTab';
import StaffTab from './renderer/screens/StaffTab';
import EmrTab from './renderer/screens/EmrTab';
import SocialMediaTab from './renderer/screens/SocialMediaTab';

function App() {
  React.useEffect(() => {
    const handleOnline = () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('network-changed', 'online');
      } catch (e) {}
    };
    
    const handleOffline = () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('network-changed', 'offline');
      } catch (e) {}
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Clear notifications on window focus
    const handleFocus = () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('clear-notifications');
      } catch (e) {}
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const isOverlay = window.location.hash.includes('overlay');
  const isBubbleWidget = window.location.hash.includes('bubble-widget');

  if (isOverlay) {
    return (
      <MemoryRouter initialEntries={['/overlay']}>
        <div className="w-full h-screen overflow-hidden bg-transparent">
          <Routes>
          </Routes>
        </div>
      </MemoryRouter>
    );
  }

  if (isBubbleWidget) {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const posNameHint = params.get('hint') || '';
    
    return (
      <div className="w-full h-screen overflow-hidden bg-transparent flex items-end justify-end p-2">
        <BubbleMode
          posNameHint={posNameHint}
          onConfirmed={(items, posName) => {
            try {
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              ipcRenderer.send('bubble-completed', { items, posName });
            } catch (e) {}
          }}
          onCancel={() => {
            try {
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              ipcRenderer.send('bubble-cancelled');
            } catch (e) {}
          }}
          onPivotToLocal={(dbPath) => {
            try {
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              ipcRenderer.send('bubble-pivot-local', dbPath);
            } catch (e) {}
          }}
          onPivotToWeb={() => {
            try {
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              ipcRenderer.send('bubble-pivot-web');
            } catch (e) {}
          }}
        />
      </div>
    );
  }

  return (
    <MemoryRouter initialEntries={['/']}>
      <GlobalNavigator />
    </MemoryRouter>
  );
}

function GlobalNavigator() {
  React.useEffect(() => {
    try {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      
      const handleNavigate = (_event: any, data: { path: string, state?: any }) => {
        const evt = new CustomEvent('app-navigate', { detail: data });
        window.dispatchEvent(evt);
      };

      ipcRenderer.on('navigate-to', handleNavigate);
      return () => {
        ipcRenderer.removeListener('navigate-to', handleNavigate);
      };
    } catch (e) {}
  }, []);

  return <AppContent />;
}

function AppContent() {
  return <AppRoutes />;
}

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastDashboardLocationRef = React.useRef(location);

  const isMiniWidget = location.pathname === '/mini-widget';

  if (!isMiniWidget && location.pathname.startsWith('/dashboard')) {
    lastDashboardLocationRef.current = location;
  }

  React.useEffect(() => {
    if (location.pathname !== '/mini-widget') {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('route-changed', location.pathname);
      } catch (e) {}
    }
  }, [location.pathname]);

  React.useEffect(() => {
    const handleAppNavigate = (e: any) => {
      navigate(e.detail.path, { state: e.detail.state });
    };
    window.addEventListener('app-navigate', handleAppNavigate);
    return () => window.removeEventListener('app-navigate', handleAppNavigate);
  }, [navigate]);

  const targetLocation = isMiniWidget ? lastDashboardLocationRef.current : location;

  return (
    <div className="relative w-full h-screen overflow-x-hidden overflow-y-auto overscroll-none bg-[#050505] text-slate-100 font-sans custom-scroll">
      {isMiniWidget && <MiniWidget />}

      <div className={isMiniWidget ? 'hidden' : 'h-full w-full flex flex-col'}>
        <Routes location={targetLocation}>
          <Route path="/" element={
            <>
              <div className="blob bg-emerald-500/20 w-[600px] h-[600px] top-[-10%] left-[-10%] fixed pointer-events-none"></div>
              <div className="blob bg-cyan-500/20 w-[500px] h-[500px] bottom-[-20%] right-[-10%] fixed pointer-events-none" style={{ animationDelay: '2s' }}></div>
              <div className="relative z-10 w-full max-w-4xl mx-auto px-8 pt-24 pb-32 flex flex-col items-center">
                <Welcome />
              </div>
            </>
          } />
          <Route path="/web-scraper" element={<div className="relative z-10 w-full max-w-4xl mx-auto px-8 pt-24 pb-32 flex flex-col items-center"><WebScraper /></div>} />
          <Route path="/analysis" element={<div className="relative z-10 w-full max-w-4xl mx-auto px-8 pt-24 pb-32 flex flex-col items-center"><Analysis /></div>} />
          <Route path="/confirmation" element={<div className="relative z-10 w-full max-w-4xl mx-auto px-8 pt-24 pb-32 flex flex-col items-center"><Confirmation /></div>} />
          <Route path="/override" element={<div className="relative z-10 w-full max-w-4xl mx-auto px-8 pt-24 pb-32 flex flex-col items-center"><ManualOverride /></div>} />
          <Route path="/setup" element={<div className="relative z-10 w-full max-w-4xl mx-auto px-8 pt-24 pb-32 flex flex-col items-center"><StorefrontSetup /></div>} />
          <Route path="/guest-auth" element={<div className="relative z-10 w-full max-w-4xl mx-auto px-8 pt-24 pb-32 flex flex-col items-center"><GuestAuth /></div>} />

          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<GeneralDashboardTab />} />
            <Route path="social" element={<SocialMediaTab />} />
            <Route path="pos" element={<div />} />
            <Route path="dispensary" element={<div />} />
            <Route path="orders" element={<div className="w-full max-w-4xl mx-auto p-4 h-full"><OrdersAndLeadsTab slug="main" /></div>} />
            <Route path="source" element={<div className="w-full max-w-4xl mx-auto p-8"><SourceTab slug="main" /></div>} />
            <Route path="staff" element={<StaffTab />} />
            <Route path="emr" element={<div />} />
            
            {/* Synkk Engine — entire setup flow lives here */}
            <Route path="synkk" element={<div className="w-full max-w-4xl mx-auto p-8"><SynkkEngineTab /></div>} />
            <Route path="synkk/extension-install" element={<div className="w-full max-w-4xl mx-auto px-8 pt-8 pb-16 flex flex-col items-center"><ExtensionInstall /></div>} />
            <Route path="synkk/analysis" element={<div className="w-full max-w-4xl mx-auto px-8 pt-8 pb-16 flex flex-col items-center"><Analysis /></div>} />
            <Route path="synkk/web-scraper" element={<div className="w-full max-w-4xl mx-auto px-8 pt-8 pb-16 flex flex-col items-center"><WebScraper /></div>} />
            <Route path="synkk/confirmation" element={<div className="w-full max-w-4xl mx-auto px-8 pt-8 pb-16 flex flex-col items-center"><Confirmation /></div>} />
            <Route path="synkk/override" element={<div className="w-full max-w-4xl mx-auto px-8 pt-8 pb-16 flex flex-col items-center"><ManualOverride /></div>} />
            <Route path="synkk/setup" element={<div className="w-full max-w-4xl mx-auto px-8 pt-8 pb-16 flex flex-col items-center"><StorefrontSetup /></div>} />
            <Route path="synkk/guest-auth" element={<div className="w-full max-w-4xl mx-auto px-8 pt-8 pb-16 flex flex-col items-center"><GuestAuth /></div>} />
            <Route path="synkk/done" element={<div className="w-full max-w-4xl mx-auto p-8"><Done /></div>} />
          </Route>
        </Routes>
      </div>
    </div>
  );
}

export default App;
