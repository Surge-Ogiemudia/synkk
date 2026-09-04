import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Activity, Package, Search, Download, AlertTriangle, RefreshCw, WifiOff, LogOut } from 'lucide-react';
import confetti from 'canvas-confetti';
import QRCode from 'react-qr-code';
import Pusher from 'pusher-js';

let globalPusher: Pusher | null = null;
let currentChannel: any = null;

export default function Done() {
  const location = useLocation();
  const navigate = useNavigate();
  const [slug, setSlug] = React.useState(location.state?.slug || 'my-pharmacy');
  const [name, setName] = React.useState(location.state?.name || 'My Pharmacy');
  const coordinates = location.state?.coordinates || null;
  
  const [syncFreq, setSyncFreq] = React.useState('15m');
  const [isWebPos, setIsWebPos] = React.useState(false);
  const [dbPath, setDbPath] = React.useState<string | null>(null);
  const [lastSync, setLastSync] = React.useState<string | null>(null);
  const [syncError, setSyncError] = React.useState<{ code: string; userMessage: string; severity: string; timestamp?: string } | null>(null);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [streamLogs, setStreamLogs] = React.useState<string[]>([]);
  const [csvStatus, setCsvStatus] = React.useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const streamEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamLogs]);
  const [syncProgress, setSyncProgress] = React.useState<{ percent: number, message: string } | null>(null);
  const [notifyOutOfStock, setNotifyOutOfStock] = React.useState(true);
  const [alarmDuration, setAlarmDuration] = React.useState('infinite');
  const [pendingAlert, setPendingAlert] = React.useState<any>(null);
  const [isGlobalRefreshing, setIsGlobalRefreshing] = React.useState(false);
  const [updateStatus, setUpdateStatus] = React.useState<any>(null);

  useEffect(() => {
    // Save storefront data to backend
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('save-storefront-data', { slug, name, coordinates }).then(async () => {
      // Only trigger initial sync if we just came from setup (have location state)
      // and there are pre-processed items waiting. Don't blindly re-sync on every visit.
      if (location.state?.slug) {
        const pairing = await ipcRenderer.invoke('get-pairing-data');
        if (pairing?.initialSyncItems?.length > 0) {
          ipcRenderer.invoke('trigger-sync');
        }
      }
    });

    // Load initial settings
    ipcRenderer.invoke('get-sync-frequency').then((freq: string) => {
      if (freq) setSyncFreq(freq);
    });
    ipcRenderer.invoke('get-settings').then((settings: any) => {
      if (settings && typeof settings.notifyOutOfStock !== 'undefined') {
        setNotifyOutOfStock(settings.notifyOutOfStock);
      }
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
        navigate('/dashboard/orders');
        
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
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      const storefront = await ipcRenderer.invoke('get-storefront-data');
      if (storefront?.slug) setSlug(storefront.slug);
      if (storefront?.name) setName(storefront.name);

      const freq = await ipcRenderer.invoke('get-sync-frequency');
      const settings = await ipcRenderer.invoke('get-settings');
      const pairing = await ipcRenderer.invoke('get-pairing-data');

      if (freq) setSyncFreq(freq);
      if (settings && settings.notifyOutOfStock !== undefined) {
        setNotifyOutOfStock(settings.notifyOutOfStock);
      }
      if (settings && settings.alarmDuration !== undefined) {
        setAlarmDuration(settings.alarmDuration);
      }

      if (pairing?.connectionType === 'web-pos' || pairing?.posIdentifier === 'web-extension') {
        setIsWebPos(true);
        setDbPath(null);
        try {
          const res = await fetch(`https://www.psx.ng/api/extension/dashboard-data?pharmacyId=${encodeURIComponent(storefront?.slug || "")}`);
          if (res.ok) {
            const data = await res.json();
            if (data.inventory && data.inventory.length > 0) {
              setLastSync(data.inventory[0].lastSynced);
            }
          }
        } catch(e) {}
      } else {
        setIsWebPos(false);
        setDbPath(pairing?.posIdentifier || null);
        const time = await ipcRenderer.invoke('get-last-sync-time');
        if (time) setLastSync(time);
      }
      
      const lastError = await ipcRenderer.invoke('get-last-sync-error');
      if (lastError) setSyncError(lastError);
    };
    loadSettings();
    
    // Refresh last sync time every minute
    const interval = setInterval(loadSettings, 60000);
    
    // Listen for real-time sync error/success events from the main process
    ipcRenderer.on('sync-progress', (_event: any, data: { progress: number, message: string }) => {
      setSyncProgress({ percent: data.progress, message: data.message });
      if (data.progress === 10) setStreamLogs([]); // Clear logs on new sync
    });
    ipcRenderer.on('sync-stream', (_event: any, logLine: string) => {
      setStreamLogs(prev => {
        const newLogs = [...prev, logLine];
        return newLogs.length > 200 ? newLogs.slice(newLogs.length - 200) : newLogs;
      });
    });
    ipcRenderer.on('sync-error', (_event: any, error: any) => {
      setSyncError(error);
      setIsRetrying(false);
      setSyncProgress(null);
    });
    ipcRenderer.on('sync-success', () => {
      setSyncError(null);
      setIsRetrying(false);
      setSyncProgress({ percent: 100, message: 'Complete' });
      setTimeout(() => {
        setSyncProgress(null);
        setStreamLogs([]);
      }, 4000);
    });
    
    // Listen for push notifications to open Orders tab
    ipcRenderer.on('navigate-to-orders', () => navigate('/dashboard/orders'));
    ipcRenderer.on('navigate-to-leads', () => navigate('/dashboard/leads'));
    
    ipcRenderer.on('refresh-orders-list', () => window.dispatchEvent(new Event('refresh-orders-list')));
    ipcRenderer.on('refresh-leads-list', () => window.dispatchEvent(new Event('refresh-leads-list')));
    
    ipcRenderer.on('show-notification-modal', (_e: any, alertData: any) => {
      setPendingAlert(alertData);
    });
    
    ipcRenderer.on('update-status', (_e: any, statusData: any) => {
      setUpdateStatus(statusData);
    });

    return () => {
      clearInterval(interval);
      ipcRenderer.removeAllListeners('navigate-to-orders');
      ipcRenderer.removeAllListeners('navigate-to-leads');
      ipcRenderer.removeAllListeners('refresh-orders-list');
      ipcRenderer.removeAllListeners('refresh-leads-list');
      ipcRenderer.removeAllListeners('show-notification-modal');
      ipcRenderer.removeAllListeners('update-status');
      ipcRenderer.removeAllListeners('sync-stream');
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

  const handleAlarmChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setAlarmDuration(val);
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    const settings = await ipcRenderer.invoke('get-settings') || {};
    settings.alarmDuration = val;
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
    <div className="flex flex-col items-center w-full max-w-6xl px-6 pt-4 pb-8 relative mx-auto">
      
      {/* Persistent Full-Screen Modal */}
      {pendingAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-2xl w-full max-w-md p-8 shadow-2xl flex flex-col items-center text-center">
            {pendingAlert.type === 'order' ? (
              <Package className="w-16 h-16 text-emerald-400 mb-4 animate-bounce" />
            ) : (
              <div className="relative mb-4 animate-bounce">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <div className="absolute -top-1 -right-2 w-4 h-4 bg-emerald-500 rounded-full animate-pulse" />
              </div>
            )}
            <h2 className="text-3xl font-bold text-white mb-2">
              {pendingAlert.type === 'order' ? 'New Order!' : 'New Lead Alert!'}
            </h2>
            <p className="text-lg text-slate-300 mb-8">
              {pendingAlert.type === 'order' 
                ? `${pendingAlert.data.patientName || 'A customer'} ordered ${pendingAlert.data.itemsCount} items for ₦${pendingAlert.data.totalAmount}.`
                : `A patient in ${pendingAlert.data.location} is looking for ${pendingAlert.data.medicines?.map((m:any) => m.name).join(', ')}.`
              }
            </p>
            <button 
              onClick={() => {
                navigate(pendingAlert.type === 'order' ? '/dashboard/orders' : '/dashboard/orders');
                setPendingAlert(null);
                // @ts-ignore
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('clear-notifications');
              }}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-lg font-bold shadow-lg shadow-emerald-900/50 transition flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-6 h-6" /> View Details
            </button>
          </div>
        </div>
      )}



      <div className="w-full flex flex-col items-center">
          {/* ── Sync Error Banner ── */}
          {syncError && (
            <div className={`w-full max-w-3xl rounded-xl p-4 mb-6 flex items-start gap-3 animate-in slide-in-from-top duration-300 ${
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
                  setSyncError(null);
                  setIsRetrying(true);
                  setSyncProgress({ percent: 5, message: 'Waking up engine...' });
                  // @ts-ignore
                  const { ipcRenderer } = window.require('electron');
                  await ipcRenderer.invoke('trigger-sync');
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

          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            
            {/* Left Column - Sync Settings */}
            <div className="flex flex-col w-full order-2 md:order-1 pt-0 md:pt-14">
              <div className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 mb-6 relative">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Sync Settings</h3>
                
                {isWebPos && (
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-slate-400">Connection Type</span>
                    <span className="text-xs text-emerald-400 font-medium">🌐 Web POS Extension</span>
                  </div>
                )}

                {!isWebPos && (
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-slate-400">Sync Status</span>
                    {dbPath ? (
                      <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Active
                      </span>
                    ) : (
                      <span className="text-xs text-rose-400 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span> Disconnected
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-400">Sync Frequency</span>
                  {isWebPos ? (
                    <span className="text-xs text-slate-300 bg-slate-800 border border-slate-700 px-2 py-1 rounded-md min-w-[120px] text-center opacity-70">
                      Daily (Midnight)
                    </span>
                  ) : (
                    <select 
                      value={syncFreq} 
                      onChange={handleFreqChange}
                      disabled={!dbPath}
                      className="bg-slate-800 border border-slate-600 text-white text-xs rounded-md px-2 py-1 outline-none focus:border-emerald-500 min-w-[120px] disabled:opacity-50"
                    >
                      <option value="15m">Every 15 mins</option>
                      <option value="1h">Hourly</option>
                      <option value="12h">Every 12 hours</option>
                      <option value="24h">Daily (Midnight)</option>
                    </select>
                  )}
                </div>

                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm text-slate-400">Last Synced</span>
                  <span className="text-sm text-slate-300 font-mono">
                    {lastSync ? new Date(lastSync).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Pending...'}
                  </span>
                </div>

                <div className="border-t border-slate-800 pt-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Force Sync</span>
                    
                    {!isWebPos && !dbPath ? (
                      <button 
                        onClick={async () => {
                          // @ts-ignore
                          const { ipcRenderer } = window.require('electron');
                          const newPath = await ipcRenderer.invoke('update-csv-path');
                          if (newPath) {
                            setDbPath(newPath);
                            // Trigger a manual sync right away to confirm connection
                            setIsSyncing(true);
                            try {
                              await ipcRenderer.invoke('trigger-sync');
                              const time = await ipcRenderer.invoke('get-last-sync-time');
                              if (time) setLastSync(time);
                            } catch (err) {
                              console.error('Manual sync failed', err);
                            } finally {
                              setIsSyncing(false);
                            }
                          }
                        }}
                        className="text-xs text-amber-500 hover:text-white font-medium px-4 py-2 bg-amber-500/10 hover:bg-amber-500 rounded-lg transition-colors flex items-center gap-2"
                      >
                        Reconnect Database
                      </button>
                    ) : (
                      <button 
                        onClick={async () => {
                          if (isWebPos) return;
                          setIsSyncing(true);
                          setSyncProgress({ percent: 0, message: 'Starting sync...' });
                          try {
                            await new Promise(resolve => setTimeout(resolve, 500));
                            // @ts-ignore
                            const { ipcRenderer } = window.require('electron');
                            await ipcRenderer.invoke('trigger-sync');
                          } catch (err) {
                            console.error('Manual sync failed', err);
                          } finally {
                            setIsSyncing(false);
                          }
                        }}
                        disabled={isSyncing || isWebPos}
                        className="text-xs text-emerald-500 hover:text-white font-medium px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                        {isSyncing ? 'Syncing...' : (isWebPos ? 'Auto (Web)' : 'Run Manual Sync')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-3 mt-3">
                  {/* CSV Upload Drop Zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('border-emerald-500', 'bg-emerald-500/10'); }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-emerald-500', 'bg-emerald-500/10'); }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-emerald-500', 'bg-emerald-500/10');
                      const file = e.dataTransfer.files[0];
                      if (!file || !file.name.toLowerCase().endsWith('.csv')) return;
                      // @ts-ignore
                      const { ipcRenderer } = window.require('electron');
                      setCsvStatus('uploading');
                      try {
                        const text = await file.text();
                        const result = await ipcRenderer.invoke('process-csv-upload', { csvText: text, fileName: file.name, slug, pharmacyName: name });
                        setCsvStatus(result.success ? 'success' : 'error');
                        setTimeout(() => setCsvStatus('idle'), 4000);
                      } catch (err) {
                        setCsvStatus('error');
                        setTimeout(() => setCsvStatus('idle'), 4000);
                      }
                    }}
                    onClick={async () => {
                      // @ts-ignore
                      const { ipcRenderer } = window.require('electron');
                      const filePath = await ipcRenderer.invoke('pick-csv-file');
                      if (!filePath) return;
                      setCsvStatus('uploading');
                      try {
                        const result = await ipcRenderer.invoke('process-csv-upload-from-path', { filePath, slug, pharmacyName: name });
                        setCsvStatus(result.success ? 'success' : 'error');
                        setTimeout(() => setCsvStatus('idle'), 4000);
                      } catch (err) {
                        setCsvStatus('error');
                        setTimeout(() => setCsvStatus('idle'), 4000);
                      }
                    }}
                    className={`w-full mt-0 mb-0 border-2 border-dashed rounded-xl p-2 text-center cursor-pointer transition-all ${
                      csvStatus === 'uploading' ? 'border-amber-500/50 bg-amber-500/5' :
                      csvStatus === 'success' ? 'border-emerald-500/50 bg-emerald-500/5' :
                      csvStatus === 'error' ? 'border-red-500/50 bg-red-500/5' :
                      'border-slate-700/50 hover:border-emerald-500/30 hover:bg-emerald-500/5'
                    }`}
                  >
                    {csvStatus === 'uploading' ? (
                      <p className="text-sm text-amber-400 font-semibold">Uploading and syncing...</p>
                    ) : csvStatus === 'success' ? (
                      <p className="text-sm text-emerald-400 font-semibold">✓ CSV uploaded and synced!</p>
                    ) : csvStatus === 'error' ? (
                      <p className="text-sm text-red-400 font-semibold">Upload failed. Try again.</p>
                    ) : (
                        <p className="text-xs text-slate-400 font-medium">Click or drop CSV to manually sync</p>
                    )}
                  </div>
                </div>
                
                
                {/* Absolute Floating Overlay to prevent layout shift */}
                {syncProgress && (
                  <div className="absolute top-[calc(100%+8px)] left-0 w-full z-50 bg-slate-900/95 border border-emerald-900/50 shadow-2xl backdrop-blur-md rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-slate-300 font-medium">{syncProgress.message}</span>
                      <span className="text-xs text-emerald-400 font-bold">{syncProgress.percent}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-500 ease-out rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                        style={{ width: `${syncProgress.percent}%` }}
                      />
                    </div>

                    {/* Blazing Fast Stream Visualizer */}
                    {streamLogs.length > 0 && (
                      <div className="mt-4 bg-black/80 border border-emerald-900/40 rounded-lg p-2.5 h-32 overflow-y-auto text-[10px] font-mono text-emerald-400/90 shadow-inner scrollbar-hide relative">
                        <div className="sticky top-0 bg-black/90 px-1 pb-1.5 mb-1.5 border-b border-emerald-900/50 flex justify-between z-10">
                          <span className="text-emerald-400 font-semibold text-[9px] uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                            Live Extraction
                          </span>
                          <span className="text-emerald-600 font-bold">[{streamLogs.length} logs]</span>
                        </div>
                        <div className="space-y-0.5">
                          {streamLogs.map((log, idx) => (
                            <div key={idx} className="truncate tracking-tight leading-relaxed opacity-90 hover:opacity-100 transition-opacity">
                              <span className="text-emerald-700/60 mr-1.5">{'>'}</span>{log}
                            </div>
                          ))}
                          <div ref={streamEndRef} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Middle Column - QR Code */}
            <div className="flex flex-col items-center w-full order-1 md:order-2">
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
                className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col items-center mb-6 cursor-pointer hover:bg-slate-700/50 transition-colors group mx-auto"
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
            </div>

            {/* Right Column - Notification Settings */}
            <div className="flex flex-col w-full order-3 md:order-3 pt-0 md:pt-14">
              <div className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 mb-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Notification Settings</h3>
                
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-400 text-left mr-4">Receive out-of-stock notifications</span>
                  <button 
                    onClick={handleNotifyToggle}
                    className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${notifyOutOfStock ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${notifyOutOfStock ? 'left-5.5' : 'left-0.5'}`} style={{ left: notifyOutOfStock ? '20px' : '2px' }} />
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-sm text-slate-400">Alarm Beep Duration</span>
                  <select 
                    value={alarmDuration} 
                    onChange={handleAlarmChange}
                    className="bg-slate-800 border border-slate-600 text-white text-xs rounded-md px-2 py-1 outline-none focus:border-emerald-500 min-w-[120px] max-w-[140px]"
                  >
                    <option value="infinite">Continuous Ring</option>
                    <option value="1">1 Beep</option>
                    <option value="5">5 Beeps</option>
                    <option value="off">Off (Silent)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={async () => {
                  // @ts-ignore
                  const { ipcRenderer } = window.require('electron');
                  await ipcRenderer.invoke('open-store-management', slug);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg mb-2"
              >
                Manage Store
              </button>
              <button
                onClick={() => {
                  // @ts-ignore
                  const { shell } = window.require('electron');
                  const baseUrl = 'https://www.psx.ng';
                  const targetUrl = slug.startsWith('guest-')
                    ? `${baseUrl}/auth?claim_slug=${slug}&view=storeManagement`
                    : `${baseUrl}/?view=storeManagement`;
                  shell.openExternal(targetUrl);
                }}
                className="w-full bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg mb-4"
              >
                Open in Browser
                <ExternalLink className="w-5 h-5" />
              </button>


            </div>
          </div>
            </div>


      {/* Subtle Footer Links */}
      <div className="flex items-center justify-center gap-4 mt-6 text-xs font-medium text-slate-500">
        <button 
          onClick={async () => {
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('check-for-updates');
          }}
          disabled={updateStatus?.status === 'downloading'}
          className="hover:text-slate-300 transition-colors disabled:opacity-50"
        >
          {updateStatus?.status === 'downloading' ? `Downloading... ${updateStatus.percent}%` : updateStatus?.status === 'ready' ? 'Restart to Update' : 'Check Updates'}
        </button>
        <span className="opacity-30">•</span>
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

