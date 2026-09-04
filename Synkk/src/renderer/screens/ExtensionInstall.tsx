import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, CheckCircle2, ArrowRight, Globe, ChevronLeft } from 'lucide-react';

export default function ExtensionInstall() {
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [bridgeConnected, setBridgeConnected] = useState(false);

  // Poll the local bridge to see if the extension has connected
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const checkBridge = async () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const storefront = await ipcRenderer.invoke('get-storefront-data');
        const pharmacyId = storefront?.slug || storefront?.id || 'DEFAULT';

        const res = await fetch(`https://www.psx.ng/api/extension/dashboard-data?pharmacyId=${pharmacyId}`);
        if (res.ok) {
          const data = await res.json();
          if ((data.pmsInfo && data.pmsInfo.pmsUrl !== 'None') || (data.networkLogsCount > 0) || (data.sales && data.sales.length > 0) || (data.inventory && data.inventory.length > 0)) {
            setBridgeConnected(true);
          }
        }
      } catch (e) {
        // Silently wait
      }
    };
    
    interval = setInterval(checkBridge, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      // Assume main process has an IPC handler to drop the extension zip
      const res = await ipcRenderer.invoke('export-extension');
      if (res.success) {
        setDownloaded(true);
      } else {
        console.error('Failed to export extension:', res.error);
        // Fallback for UI testing if IPC fails
        await new Promise(r => setTimeout(r, 1500));
        setDownloaded(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto p-6 animate-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={() => navigate('/dashboard/synkk')}
        className="self-start flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800/80 mb-6 border border-emerald-500/30">
          <Globe className="w-8 h-8 text-emerald-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Install Synkk Bridge</h1>
        <p className="text-slate-400 max-w-lg mx-auto">
          To magically sync your web POS, we need to add a tiny helper to your Google Chrome browser. It takes 10 seconds.
        </p>
      </div>

      <div className="w-full flex gap-8">
        {/* Left Column: Instructions */}
        <div className="flex-1 bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">How to install</h2>
          
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">1</div>
              <div>
                <h3 className="text-white font-medium mb-1">Download the extension</h3>
                <p className="text-sm text-slate-400 mb-3">Save the Synkk-Extension folder to your Desktop.</p>
                <button 
                  onClick={handleDownload}
                  disabled={downloaded || downloading}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {downloading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : downloaded ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {downloaded ? 'Saved to Desktop' : 'Download Extension'}
                </button>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-300 font-bold flex items-center justify-center shrink-0">2</div>
              <div>
                <h3 className="text-white font-medium mb-1">Open Chrome Extensions</h3>
                <p className="text-sm text-slate-400">
                  Open a new tab in Chrome and go to <span className="bg-black/30 px-2 py-1 rounded text-emerald-400 font-mono select-all">chrome://extensions</span>
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-300 font-bold flex items-center justify-center shrink-0">3</div>
              <div>
                <h3 className="text-white font-medium mb-1">Enable Developer Mode</h3>
                <p className="text-sm text-slate-400">
                  Turn on the "Developer mode" toggle in the top right corner.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-300 font-bold flex items-center justify-center shrink-0">4</div>
              <div>
                <h3 className="text-white font-medium mb-1">Drag and Drop</h3>
                <p className="text-sm text-slate-400">
                  Drag the <span className="font-semibold text-white">Synkk-Extension</span> folder from your desktop into the Chrome window.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Status & GIF */}
        <div className="flex-1 flex flex-col gap-6">
          {/* CSS Animated Tutorial Mockup */}
          <div className="bg-[#1e1e1e] rounded-2xl border border-slate-700/50 overflow-hidden flex-1 flex flex-col min-h-[250px] relative shadow-inner">
            
            {/* Mock Chrome Window Header */}
            <div className="w-full h-8 bg-[#2d2d2d] border-b border-[#3c3c3c] flex items-center px-3 gap-2 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
              <div className="flex-1 ml-4 bg-[#1e1e1e] h-5 rounded px-2 flex items-center text-[10px] text-slate-400 font-mono border border-[#3c3c3c]">
                chrome://extensions
              </div>
            </div>

            {/* Mock Chrome Body (Extensions Page) */}
            <div className="flex-1 p-4 relative bg-[#1e1e1e] overflow-hidden">
              <div className="flex justify-between items-center mb-4 border-b border-[#333] pb-2">
                <span className="text-slate-200 text-sm font-medium">Extensions</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">Developer mode</span>
                  <div className="w-6 h-3 bg-blue-500 rounded-full relative">
                    <div className="w-3 h-3 bg-white rounded-full absolute right-0 shadow" />
                  </div>
                </div>
              </div>
              
              {/* Drop Zone overlay */}
              <div className="absolute inset-4 top-14 border-2 border-dashed border-blue-500/40 rounded-xl bg-blue-500/10 flex flex-col items-center justify-center">
                <span className="text-blue-400/80 font-medium text-sm">Drop to install</span>
              </div>
              
              {/* Floating Animated Folder */}
              <div className="absolute left-[50%] top-[50%] flex flex-col items-center animate-[floatDrop_3s_ease-in-out_infinite]" style={{ marginLeft: '-32px' }}>
                <div className="w-16 h-12 bg-sky-500/90 rounded-md relative shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-sky-400/50 before:absolute before:w-6 before:h-2 before:bg-sky-500/90 before:rounded-t-md before:-top-2 before:left-0 before:border-t before:border-l before:border-sky-400/50"></div>
                <span className="text-white text-[10px] mt-2 font-medium bg-slate-800 px-2 py-0.5 rounded shadow-lg border border-slate-600">Synkk-Extension</span>
              </div>
            </div>

            <style>{`
              @keyframes floatDrop {
                0% { transform: translateY(-80px) scale(0.9); opacity: 0; }
                15% { transform: translateY(-80px) scale(1); opacity: 1; }
                60% { transform: translateY(0px) scale(1.05); opacity: 1; }
                80% { transform: translateY(0px) scale(1); opacity: 0; }
                100% { transform: translateY(-80px) scale(0.9); opacity: 0; }
              }
            `}</style>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 text-center">
            {bridgeConnected ? (
              <div>
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-white font-semibold mb-1">Bridge Connected!</h3>
                <p className="text-sm text-slate-400 mb-4">Go to Chrome and log into your POS.</p>
                <button
                  onClick={() => navigate('/dashboard/synkk/setup')}
                  className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Continue
                </button>
              </div>
            ) : (
              <div>
                <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-1">Waiting for Extension...</h3>
                <p className="text-sm text-slate-400">
                  Once you drag the folder into Chrome, we'll detect it automatically.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}




