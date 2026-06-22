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

import NotificationOverlay from './renderer/screens/NotificationOverlay';

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
            <Route path="/overlay" element={<NotificationOverlay />} />
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
        {/* Animated Background Blobs */}
        <div className="blob bg-emerald-500/20 w-[600px] h-[600px] top-[-10%] left-[-10%] fixed"></div>
        <div className="blob bg-cyan-500/20 w-[500px] h-[500px] bottom-[-20%] right-[-10%] fixed" style={{ animationDelay: '2s' }}></div>
        <div className="blob bg-purple-500/10 w-[400px] h-[400px] top-[20%] right-[20%] fixed" style={{ animationDelay: '4s' }}></div>

        {/* Main Content Area */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-8 pt-24 pb-32 flex flex-col items-center">
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/web-scraper" element={<WebScraper />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/confirmation" element={<Confirmation />} />
            <Route path="/override" element={<ManualOverride />} />
            <Route path="/setup" element={<StorefrontSetup />} />
            <Route path="/guest-auth" element={<GuestAuth />} />
            <Route path="/done" element={<Done />} />
          </Routes>
        </div>
      </div>
  );
}

export default App;
