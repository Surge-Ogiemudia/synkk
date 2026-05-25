import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Welcome from './renderer/screens/Welcome';
import Analysis from './renderer/screens/Analysis';
import Confirmation from './renderer/screens/Confirmation';
import StorefrontSetup from './renderer/screens/StorefrontSetup';
import Done from './renderer/screens/Done';
import ManualOverride from './renderer/screens/ManualOverride';
import WebScraper from './renderer/screens/WebScraper';

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

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <MemoryRouter>
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
            <Route path="/done" element={<Done />} />
          </Routes>
        </div>
      </div>
    </MemoryRouter>
  );
}

export default App;
