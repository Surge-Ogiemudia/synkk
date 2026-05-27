import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { QrCode, CheckCircle2, ExternalLink, Activity, Package } from 'lucide-react';
import confetti from 'canvas-confetti';
import OrdersTab from './OrdersTab';

export default function Done() {
  const location = useLocation();
  const slug = location.state?.slug || 'my-pharmacy';
  const name = location.state?.name || 'My Pharmacy';
  const coordinates = location.state?.coordinates || null;
  
  const [syncFreq, setSyncFreq] = React.useState('15m');
  const [lastSync, setLastSync] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'orders'>('dashboard');

  useEffect(() => {
    // Save storefront data to backend
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('save-storefront-data', { slug, name, coordinates }).then(() => {
      // Trigger an immediate initial sync to push products to the cloud instantly
      ipcRenderer.invoke('trigger-sync');
    });

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
      const freq = await ipcRenderer.invoke('get-sync-frequency');
      const time = await ipcRenderer.invoke('get-last-sync-time');
      if (freq) setSyncFreq(freq);
      if (time) setLastSync(time);
    };
    loadSettings();
    
    // Refresh last sync time every minute
    const interval = setInterval(loadSettings, 60000);
    
    // Listen for push notifications to open Orders tab
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.on('navigate-to-orders', () => setActiveTab('orders'));

    return () => {
      clearInterval(interval);
      ipcRenderer.removeAllListeners('navigate-to-orders');
    };
  }, []);

  const handleFreqChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSyncFreq(val);
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('set-sync-frequency', val);
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
      </div>

      {activeTab === 'dashboard' ? (
        <>
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <h2 className="text-2xl font-bold text-white">Storefront Live</h2>
          </div>

          <div className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col items-center mb-6">
            <div className="w-40 h-40 bg-white rounded-xl mb-4 flex items-center justify-center p-2">
              <QrCode className="w-full h-full text-slate-900" />
            </div>
            <p className="text-emerald-400 font-mono text-lg tracking-wide font-bold">{slug}.psx.ng</p>
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

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Last Synced</span>
              <span className="text-sm text-slate-300 font-mono">
                {lastSync ? new Date(lastSync).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Pending...'}
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              // @ts-ignore
              const { shell } = window.require('electron');
              const baseUrl = import.meta.env.DEV ? 'http://localhost:3000' : 'https://psx.ng';
              const authUrl = slug.startsWith('guest-') ? `${baseUrl}/auth?claim_slug=${slug}` : `${baseUrl}/auth`;
              shell.openExternal(authUrl);
            }}
            className="w-full bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg mb-4"
          >
            Open Web Storefront
            <ExternalLink className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => {
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              ipcRenderer.invoke('trigger-sync');
            }}
            className="text-xs text-emerald-500 hover:text-emerald-400 font-medium underline"
          >
            Force Manual Sync Now
          </button>
        </>
      ) : (
        <OrdersTab slug={slug} />
      )}
    </div>
  );
}
