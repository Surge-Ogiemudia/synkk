import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Activity, Package, Search, Download, AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import confetti from 'canvas-confetti';
import QRCode from 'react-qr-code';
import Pusher from 'pusher-js';
import OrdersTab from './OrdersTab';
import SourceTab from './SourceTab';

let globalPusher: Pusher | null = null;
let currentChannel: any = null;

export default function Done() {
  const location = useLocation();
  const slug = location.state?.slug || 'my-pharmacy';
  const name = location.state?.name || 'My Pharmacy';
  const coordinates = location.state?.coordinates || null;
  
  const [syncFreq, setSyncFreq] = React.useState('15m');
  const [lastSync, setLastSync] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'orders' | 'source'>('dashboard');
  const [syncError, setSyncError] = React.useState<{ code: string; userMessage: string; severity: string; timestamp?: string } | null>(null);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [notifyOutOfStock, setNotifyOutOfStock] = React.useState(true);

  useEffect(() => {
    // Save storefront data to backend
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('save-storefront-data', { slug, name, coordinates }).then(() => {
      // Trigger an immediate initial sync to push products to the cloud instantly
      ipcRenderer.invoke('trigger-sync');
    });

    // Initialize global Pusher natively in the browser process where WebSockets work flawlessly
    if (!globalPusher && slug !== 'my-pharmacy') {
      console.log('Initializing Native Web Pusher for:', slug);
      globalPusher = new Pusher('097f7e40113bef06b815', { cluster: 'eu' });
      currentChannel = globalPusher.subscribe(`pharmacy-${slug}`);
      
      currentChannel.bind('new-order', (data: any) => {
        console.log('[Native Pusher] Received new order!', data);
        
        // Play an immediate bell sound to grab attention
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.log('Audio autoplay blocked', e));
        } catch(e) {}
        
        const notify = () => {
          new Notification('🚨 New Online Order!', {
            body: `${data.patientName} just ordered ${data.itemsCount} items. (₦${data.totalAmount})`
          });
          ipcRenderer.send('bring-window-to-front');
        };

        if (Notification.permission === 'granted') {
          notify();
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => p === 'granted' && notify());
        }
        
        // Instantly switch the UI to the Orders tab
        setActiveTab('orders');
        
        // Refresh Orders tab globally
        window.dispatchEvent(new Event('refresh-orders-list'));
      });
    }

    // Trigger confetti animation
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#10b981', '#34d399', '#059669']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#10b981', '#34d399', '#059669']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    
    // Only throw confetti if we just finished setup (came with state)
    if (location.state?.slug) {
      frame();
    }

    const loadSettings = async () => {
      const freq = await ipcRenderer.invoke('get-sync-frequency');
      const time = await ipcRenderer.invoke('get-last-sync-time');
      const settings = await ipcRenderer.invoke('get-settings');
      
      if (freq) setSyncFreq(freq);
      if (time) setLastSync(time);
      if (settings && settings.notifyOutOfStock !== undefined) {
        setNotifyOutOfStock(settings.notifyOutOfStock);
      }
      
      // Load persisted sync error (if any)
      const lastError = await ipcRenderer.invoke('get-last-sync-error');
      if (lastError) {
        setSyncError(lastError);
      }
    };
    loadSettings();
    
    // Refresh last sync time every minute
    const interval = setInterval(loadSettings, 60000);
    
    // Listen for real-time sync error/success events from the main process
    ipcRenderer.on('sync-error', (_event: any, error: any) => {
      setSyncError(error);
      setIsRetrying(false);
    });
    ipcRenderer.on('sync-success', () => {
      setSyncError(null);
      setIsRetrying(false);
    });
    
    // Listen for push notifications to open Orders tab
    ipcRenderer.on('navigate-to-orders', () => setActiveTab('orders'));

    return () => {
      clearInterval(interval);
      ipcRenderer.removeAllListeners('navigate-to-orders');
      ipcRenderer.removeAllListeners('sync-error');
      ipcRenderer.removeAllListeners('sync-success');
    };
  }, []);

  const handleFreqChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSyncFreq(val);
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('set-sync-frequency', val);
  };

  const handleNotifyToggle = async () => {
    const newVal = !notifyOutOfStock;
    setNotifyOutOfStock(newVal);
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    const settings = await ipcRenderer.invoke('get-settings') || {};
    settings.notifyOutOfStock = newVal;
    await ipcRenderer.invoke('save-settings', settings);
  };

  const downloadQR = (e: React.MouseEvent) => {
    e.stopPropagation();
    const svg = document.getElementById("StorefrontQRCode");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = 1080;
      canvas.height = 1280;
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.drawImage(img, 140, 140, 800, 800);
        
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 64px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`https://${slug}.psx.ng`, canvas.width / 2, 1100);
        
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `${slug}-storefront-qr.png`;
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
      }
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md px-6 py-8">
      
      {/* Tab Navigation */}
      <div className="flex w-full bg-slate-900 rounded-xl p-1 mb-6 border border-slate-800">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Activity className="w-4 h-4" /> Dashboard
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'orders' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Package className="w-4 h-4" /> Orders
        </button>
        <button 
          onClick={() => setActiveTab('source')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'source' ? 'bg-emerald-600/20 text-emerald-400 shadow-sm border border-emerald-500/20' : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/5'}`}
        >
          <Search className="w-4 h-4" /> Source
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          {/* ── Sync Error Banner ── */}
          {syncError && (
            <div className={`w-full rounded-xl p-4 mb-4 flex items-start gap-3 animate-in slide-in-from-top duration-300 ${
              syncError.severity === 'critical' 
                ? 'bg-red-500/10 border border-red-500/30' 
                : 'bg-amber-500/10 border border-amber-500/30'
            }`}>
              <div className={`p-2 rounded-lg mt-0.5 ${
                syncError.severity === 'critical' ? 'bg-red-500/20' : 'bg-amber-500/20'
              }`}>
                {syncError.code === 'NETWORK_OFFLINE' 
                  ? <WifiOff className={`w-5 h-5 ${syncError.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                  : <AlertTriangle className={`w-5 h-5 ${syncError.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                }
              </div>
              <div className="flex-1">
                <h3 className={`font-bold text-sm mb-1 ${syncError.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>
                  Sync {syncError.severity === 'critical' ? 'Failed' : 'Warning'}
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {syncError.userMessage}
                </p>
                {syncError.timestamp && (
                  <p className="text-slate-500 text-xs mt-1">
                    {new Date(syncError.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={async () => {
                  setIsRetrying(true);
                  // @ts-ignore
                  const { ipcRenderer } = window.require('electron');
                  const result = await ipcRenderer.invoke('trigger-sync');
                  if (result.success) {
                    setSyncError(null);
                  }
                  setIsRetrying(false);
                }}
                disabled={isRetrying}
                className="text-xs font-medium px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying...' : 'Retry Now'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <h2 className="text-2xl font-bold text-white">Storefront Live</h2>
          </div>

          <div 
            onClick={() => {
              // @ts-ignore
              const { shell } = window.require('electron');
              shell.openExternal(`https://${slug}.psx.ng`);
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col items-center mb-6 cursor-pointer hover:bg-slate-700/50 transition-colors group"
          >
            <div className="w-40 h-40 bg-white rounded-xl mb-4 flex items-center justify-center p-2 group-hover:scale-105 transition-transform">
              <QRCode 
                id="StorefrontQRCode"
                value={`https://${slug}.psx.ng`} 
                size={144}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox={`0 0 144 144`}
              />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-emerald-400 font-mono text-lg tracking-wide font-bold flex items-center gap-2">
                {slug}.psx.ng
                <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
              <button 
                onClick={downloadQR}
                className="p-2 bg-emerald-500/10 hover:bg-emerald-500/30 text-emerald-400 rounded-full transition-colors"
                title="Download Storefront Poster"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Sync Settings</h3>
            
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-slate-400">Sync Frequency</span>
              <select 
                value={syncFreq} 
                onChange={handleFreqChange}
                className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500"
              >
                <option value="15m">Every 15 mins</option>
                <option value="1h">Hourly</option>
                <option value="12h">Every 12 hours</option>
                <option value="24h">Daily (Midnight)</option>
              </select>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-slate-400">Receive out-of-stock notifications</span>
              <button 
                onClick={handleNotifyToggle}
                className={`w-10 h-5 rounded-full relative transition-colors ${notifyOutOfStock ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${notifyOutOfStock ? 'left-5.5' : 'left-0.5'}`} style={{ left: notifyOutOfStock ? '20px' : '2px' }} />
              </button>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-slate-400">Last Synced</span>
              <span className="text-sm text-slate-300 font-mono">
                {lastSync ? new Date(lastSync).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Pending...'}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-2">
              <span className="text-sm text-slate-400">Force Sync</span>
              <button
                onClick={async () => {
                  setIsSyncing(true);
                  // @ts-ignore
                  const { ipcRenderer } = window.require('electron');
                  const pairingData = await ipcRenderer.invoke('get-pairing-data');
                  if (pairingData?.posIdentifier?.endsWith('.csv')) {
                    const newPath = await ipcRenderer.invoke('update-csv-path');
                    if (!newPath) {
                      setIsSyncing(false);
                      return; // User canceled the file dialog
                    }
                  }
                  await ipcRenderer.invoke('trigger-sync');
                  setIsSyncing(false);
                }}
                disabled={isSyncing}
                className="text-xs text-emerald-500 hover:text-white font-medium px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                {isSyncing ? 'Syncing...' : 'Run Manual Sync'}
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              // @ts-ignore
              const { shell } = window.require('electron');
              const baseUrl = import.meta.env.DEV ? 'http://localhost:3000' : 'https://www.psx.ng';
              const targetUrl = slug.startsWith('guest-') 
                ? `${baseUrl}/auth?claim_slug=${slug}&view=storeManagement` 
                : `${baseUrl}/?view=storeManagement`;
              shell.openExternal(targetUrl);
            }}
            className="w-full bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg mb-4"
          >
            Open Web Storefront
            <ExternalLink className="w-5 h-5" />
          </button>
        </>
      ) : activeTab === 'orders' ? (
        <OrdersTab slug={slug} />
      ) : (
        <SourceTab slug={slug} />
      )}

      {/* Subtle Footer Links */}
      <div className="flex items-center justify-center gap-4 mt-6 text-xs font-medium text-slate-500">
        <button 
          onClick={() => {
            // @ts-ignore
            const { shell } = window.require('electron');
            shell.openExternal('https://psx.ng/about');
          }}
          className="hover:text-slate-300 transition-colors"
        >
          About Us
        </button>
        <span className="opacity-30">•</span>
        <button 
          onClick={() => {
            // @ts-ignore
            const { shell } = window.require('electron');
            shell.openExternal('https://psx.ng/privacy-policy');
          }}
          className="hover:text-slate-300 transition-colors"
        >
          Privacy Policy
        </button>
        <span className="opacity-30">•</span>
        <button 
          onClick={() => {
            // @ts-ignore
            const { shell } = window.require('electron');
            shell.openExternal('https://wa.me/2349050066638');
          }}
          className="hover:text-slate-300 transition-colors"
        >
          Contact Us
        </button>
      </div>
    </div>
  );
}
