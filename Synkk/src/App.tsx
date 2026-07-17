import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Welcome from './renderer/screens/Welcome';
import Analysis from './renderer/screens/Analysis';
import Confirmation from './renderer/screens/Confirmation';
import StorefrontSetup from './renderer/screens/StorefrontSetup';
import GuestAuth from './renderer/screens/GuestAuth';
import Done from './renderer/screens/Done';
import ManualOverride from './renderer/screens/ManualOverride';
import WebScraper from './renderer/screens/WebScraper';
import BubbleMode from './renderer/screens/BubbleMode';
import SynkkEngineTab from './renderer/screens/SynkkEngineTab';

import DashboardLayout from './renderer/screens/DashboardLayout';
import GeneralDashboardTab from './renderer/screens/GeneralDashboardTab';
import PosTab from './renderer/screens/PosTab';
import DispensaryTab from './renderer/screens/DispensaryTab';
import MiniWidget from './renderer/screens/MiniWidget';
import OrdersTab from './renderer/screens/OrdersTab';
import LeadsTab from './renderer/screens/LeadsTab';
import OrdersAndLeadsTab from './renderer/screens/OrdersAndLeadsTab';
import SourceTab from './renderer/screens/SourceTab';
import StaffTab from './renderer/screens/StaffTab';
import EmrTab from './renderer/screens/EmrTab';


function App() {
  React.useEffect(() => {
    const handleOnline = () => {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('network-changed', 'online');
    };
    
    const handleOffline = () => {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('network-changed', 'offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Clear notifications on window focus
    const handleFocus = () => {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('clear-notifications');
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
    // Parse hint from hash URL if present
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const posNameHint = params.get('hint') || '';
    
    return (
      <div className="w-full h-screen overflow-hidden bg-transparent flex items-end justify-end p-2">
        <BubbleMode
          posNameHint={posNameHint}
          onConfirmed={(items, posName) => {
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('bubble-completed', { items, posName });
          }}
          onCancel={() => {
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('bubble-cancelled');
          }}
          onPivotToLocal={(dbPath) => {
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('bubble-pivot-local', dbPath);
          }}
          onPivotToWeb={() => {
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('bubble-pivot-web');
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

// GlobalNavigator component intercepts IPC commands to navigate the react router
function GlobalNavigator() {
  React.useEffect(() => {
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    
    const handleNavigate = (_event: any, data: { path: string, state?: any }) => {
      // Need to be inside a router context to use navigate. 
      // We'll use a hacky way since this is inside MemoryRouter
      const evt = new CustomEvent('app-navigate', { detail: data });
      window.dispatchEvent(evt);
    };

    ipcRenderer.on('navigate-to', handleNavigate);
    return () => {
      ipcRenderer.removeListener('navigate-to', handleNavigate);
    };
  }, []);

  return <AppContent />;
}

// Split out AppContent so it can use useNavigate
function AppContent() {
  return <AppRoutes />;
}

import { useNavigate } from 'react-router-dom';

function AppRoutes() {
  const navigate = useNavigate();

  React.useEffect(() => {
    const handleAppNavigate = (e: any) => {
      navigate(e.detail.path, { state: e.detail.state });
    };
    window.addEventListener('app-navigate', handleAppNavigate);
    return () => window.removeEventListener('app-navigate', handleAppNavigate);
  }, [navigate]);

  return (
    <div className="relative w-full h-screen overflow-x-hidden overflow-y-auto overscroll-none bg-[#050505] text-slate-100 font-sans custom-scroll">
        {/* Animated Background Blobs are now in DashboardLayout for the dashboard routes, 
            so we only show them here for non-dashboard routes if needed, but since AppRoutes wraps everything, 
            we can conditionally render them or just leave them. We'll let the layout handle its own background. */}
        <Routes>
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
          <Route path="/mini-widget" element={<MiniWidget />} />
          
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<GeneralDashboardTab />} />
            <Route path="pos" element={<PosTab />} />
            <Route path="dispensary" element={<DispensaryTab />} />
            <Route path="orders" element={<div className="w-full max-w-4xl mx-auto p-4 h-full"><OrdersAndLeadsTab slug="main" /></div>} />
            <Route path="source" element={<div className="w-full max-w-4xl mx-auto p-8"><SourceTab slug="main" /></div>} />
            <Route path="staff" element={<StaffTab />} />
            <Route path="emr" element={<EmrTab />} />
            
            {/* Synkk Engine — entire setup flow lives here */}
            <Route path="synkk" element={<div className="w-full max-w-4xl mx-auto p-8"><SynkkEngineTab /></div>} />
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
  );
}

export default App;
