import React, { useEffect, useState } from 'react';
import { Activity, X, Search, Database } from 'lucide-react';

interface Props {
  onCancel: () => void;
  onSuccess: (result: any) => void;
  onPivotToWeb: () => void;
}

export default function ProcessWatcherOverlay({ onCancel, onSuccess, onPivotToWeb }: Props) {
  const [status, setStatus] = useState<'preparing' | 'waiting' | 'found' | 'error'>('preparing');
  const [details, setDetails] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const startWatching = async () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        
        // 1. Take snapshot
        await ipcRenderer.invoke('take-process-snapshot');
        if (isCancelled) return;
        
        setStatus('waiting');
        setDetails('Please open your POS software normally right now.');
        
        // 2. Start polling
        const result = await ipcRenderer.invoke('start-process-watch');
        if (isCancelled) return;

        if (result.type === 'browser') {
          // It's a web POS
          onPivotToWeb();
        } else if (result.type === 'local-app') {
          if (result.details?.dbPath) {
            setStatus('found');
            setDetails(`Found database at: ${result.details.dbPath}`);
            setTimeout(() => {
              if (!isCancelled) onSuccess(result.details.dbPath);
            }, 1500);
          } else {
            setStatus('error');
            setDetails(`Found app at ${result.details?.path}, but couldn't locate a database file.`);
          }
        } else {
          setStatus('error');
          setDetails('Could not detect any new applications opening.');
        }

      } catch (err: any) {
        if (!isCancelled) {
          setStatus('error');
          setDetails(err.message || 'An error occurred while watching processes.');
        }
      }
    };

    startWatching();

    return () => {
      isCancelled = true;
      // @ts-ignore
      window.require('electron').ipcRenderer.invoke('stop-process-watch');
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#0A1210] border border-emerald-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          
          <div className="relative mb-6">
            {status === 'preparing' && (
              <div className="w-16 h-16 rounded-full border-t-2 border-emerald-500 animate-spin flex items-center justify-center">
                <Activity className="text-emerald-500" size={24} />
              </div>
            )}
            
            {status === 'waiting' && (
              <div className="relative flex items-center justify-center w-20 h-20">
                <div className="absolute inset-0 rounded-full border border-emerald-500/50 animate-ping"></div>
                <div className="absolute inset-2 rounded-full border border-emerald-400/50 animate-ping" style={{ animationDelay: '0.3s' }}></div>
                <div className="bg-emerald-500/20 rounded-full p-4">
                  <Search className="text-emerald-400" size={32} />
                </div>
              </div>
            )}

            {status === 'found' && (
              <div className="bg-emerald-500 rounded-full p-4">
                <Database className="text-white" size={32} />
              </div>
            )}

            {status === 'error' && (
              <div className="bg-amber-500/20 rounded-full p-4 border border-amber-500/50">
                <Activity className="text-amber-400" size={32} />
              </div>
            )}
          </div>

          <h3 className="text-xl font-bold text-white mb-2">
            {status === 'preparing' && 'Preparing System...'}
            {status === 'waiting' && 'We are ready!'}
            {status === 'found' && 'Database Captured!'}
            {status === 'error' && 'Scan Failed'}
          </h3>
          
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            {details || (status === 'preparing' ? 'Taking a snapshot of running processes...' : '')}
          </p>

          {status === 'error' && (
            <button 
              onClick={onCancel}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Go Back
            </button>
          )}

          {status === 'waiting' && (
            <p className="text-xs text-emerald-400/70 font-medium">
              Click your POS icon on your desktop or taskbar to launch it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
