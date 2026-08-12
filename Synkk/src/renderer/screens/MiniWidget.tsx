import React, { useRef, useState, useEffect } from 'react';

const getIpcRenderer = () => {
  if (typeof window !== 'undefined' && (window as any).require) {
    try {
      return (window as any).require('electron').ipcRenderer;
    } catch (e) {
      return null;
    }
  }
  return null;
};

export default function MiniWidget() {
  const [syncStatus, setSyncStatus] = useState<'green' | 'amber' | 'red'>('green');
  const [syncText, setSyncText] = useState('Checking sync...');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [notification, setNotification] = useState<{ type: 'order' | 'lead', data: any } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [appModules, setAppModules] = useState<any>(null);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.invoke('get-app-modules').then((modules: any) => {
        setAppModules(modules || { synkk: true, orders: true });
      });
    }
  }, []);

  useEffect(() => {
    const updateSyncStatus = async () => {
      const ipc = getIpcRenderer();
      if (!ipc) return;
      try {
        const lastSyncError = await ipc.invoke('get-last-sync-error');
        if (lastSyncError) {
          setSyncStatus('red');
          setSyncText('Sync Error');
          return;
        }

        const lastSyncTime = await ipc.invoke('get-last-sync-time');
        if (!lastSyncTime) {
          setSyncStatus('red');
          setSyncText('Never synced');
          return;
        }

        const diffMs = Date.now() - new Date(lastSyncTime).getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 60) {
          setSyncStatus('green');
          setSyncText(`Synced (${diffMins}m)`);
        } else if (diffMins < 1440) {
          setSyncStatus('amber');
          const hours = Math.floor(diffMins / 60);
          setSyncText(`Synced (${hours}h ago)`);
        } else {
          setSyncStatus('red');
          const days = Math.floor(diffMins / 1440);
          setSyncText(`Synced (${days}d ago)`);
        }
      } catch (e) {
        console.error('Failed to get sync status', e);
      }
    };

    updateSyncStatus();
    const interval = setInterval(updateSyncStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (notification) {
      if (!audioRef.current) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.loop = true;
        audioRef.current = audio;
      }
      audioRef.current.play().catch(console.error);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [notification]);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;
    const handleNotification = (_event: any, payload: { type: 'order' | 'lead', data: any }) => {
      setNotification(payload);
    };
    ipc.on('show-notification-modal', handleNotification);

    return () => {
      ipc.removeListener('show-notification-modal', handleNotification);
    };
  }, []);

  const handleMaximize = (tab?: string) => {
    let targetRoute: string | undefined = undefined;
    if (tab === 'synkk') {
      targetRoute = '/dashboard/synkk';
    } else if (tab === 'leads') {
      targetRoute = '/dashboard/orders?tab=leads';
    } else if (tab === 'orders') {
      targetRoute = '/dashboard/orders';
    } else if (tab) {
      targetRoute = `/dashboard/${tab}`;
    }
    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.invoke('set-view-mode', 'full', targetRoute);
    }
  };

  const handleNotificationClick = () => {
    if (!notification) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const tab = notification.type === 'order' ? 'orders' : 'leads';
    handleMaximize(tab);
    setNotification(null);
  };

  return (
    <div className="h-screen w-screen bg-white flex flex-col overflow-hidden font-['Outfit',sans-serif]">
      {/* Main EMR Frame taking ~90% */}
      <div className="flex-1 overflow-hidden relative">
        {/* @ts-ignore */}
        <webview 
          ref={iframeRef as any}
          src="https://emr.psx.ng/embed/dispensary?widget=true"
          className="w-full h-full border-0"
          title="EMR Dispensary"
          allowpopups={true as any}
        />

        {/* Notification Overlay */}
        {notification && (
          <div 
            onClick={handleNotificationClick}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-rose-500/90 backdrop-blur-sm cursor-pointer animate-pulse"
          >
            <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center mx-4 transform transition-transform hover:scale-105">
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mb-3">
                {notification.type === 'order' ? (
                  <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-1">
                New {notification.type === 'order' ? 'Online Order' : 'Patient Lead'}!
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                Click anywhere to respond
              </p>
              <div className="text-xs font-semibold text-rose-600 animate-bounce">
                Tap to open
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Status Bar (last ~10%) */}
      <div className="h-10 bg-slate-50 border-t border-slate-200 flex items-center justify-between px-3 shrink-0 select-none">
        
        {/* Sync Status Left */}
        {appModules?.synkk !== false && (
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleMaximize('synkk')}
              className="flex items-center gap-1.5 hover:bg-slate-100 p-1.5 rounded-md transition-colors cursor-pointer"
            >
              {/* Synkk SVG Logo placeholder (Zap) */}
              <svg className={`w-4 h-4 ${syncStatus === 'green' ? 'text-teal-600' : syncStatus === 'amber' ? 'text-amber-500' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[10px] font-semibold text-slate-600">
                {syncText}
              </span>
            </button>
          </div>
        )}

        {/* Orders & Leads Right */}
        {appModules?.orders !== false && (
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleMaximize('orders')}
              className="flex items-center gap-1.5 hover:bg-slate-100 p-1.5 rounded-md transition-colors relative cursor-pointer"
            >
              {/* Shopping Bag SVG */}
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <span className="text-[10px] font-semibold text-slate-600">Orders</span>
              {/* Notification Badge */}
              <div className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white"></div>
            </button>
            
            <button 
              onClick={() => handleMaximize('leads')}
              className="flex items-center gap-1.5 hover:bg-slate-100 p-1.5 rounded-md transition-colors relative cursor-pointer"
            >
              {/* Users SVG */}
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="text-[10px] font-semibold text-slate-600">Leads</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
