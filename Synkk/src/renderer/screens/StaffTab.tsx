import React, { useRef, useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function StaffTab() {
  const staffUrl = 'https://pos.psx.ng/staff';
  const webviewRef = useRef<any>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const webview = webviewRef.current;
    if (webview) {
      const handleDomReady = () => {
        webview.setZoomFactor(0.9);
        webview.insertCSS('header.sticky { display: none !important; }');
        setLoadError(false);
      };
      const handleFailLoad = (e: any) => {
        if (e.errorCode !== -3) {
          setLoadError(true);
        }
      };

      webview.addEventListener('dom-ready', handleDomReady);
      webview.addEventListener('did-fail-load', handleFailLoad);
      return () => {
        webview.removeEventListener('dom-ready', handleDomReady);
        webview.removeEventListener('did-fail-load', handleFailLoad);
      };
    }
  }, []);

  const handleRetry = () => {
    setLoadError(false);
    if (webviewRef.current) {
      webviewRef.current.reload();
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] relative animate-in fade-in duration-500">
      {loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#090D16] p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-400">
            <WifiOff className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Staff Module Unreachable</h3>
          <p className="text-slate-400 text-sm max-w-md mb-6">
            Unable to connect to <span className="text-emerald-400 font-mono">pos.psx.ng</span>. Please check your network connection or verify that the web app has been loaded at least once online to cache assets.
          </p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-900/20"
          >
            <RefreshCw className="w-4 h-4" /> Retry Connection
          </button>
        </div>
      )}
      {/* @ts-ignore */}
      <webview 
        ref={webviewRef}
        src={staffUrl}
        title="PharmaStackX Staff Management"
        className="w-full h-full border-0"
        allowpopups={true}
        partition="persist:pos"
      />
    </div>
  );
}
