import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Database, ArrowRight, HardDrive, Radio, LogOut } from 'lucide-react';
import POSTypeSelector from './POSTypeSelector';
import ProcessWatcherOverlay from '../components/ProcessWatcherOverlay';

interface DiscoveredPOS {
  name: string;
  executablePath: string;
  type: string;
}

export default function SynkkEngineTab() {
  const navigate = useNavigate();
  const location = useLocation();
  const autoFocusWebPos = location.state?.autoFocusWebPos;

  // Scanner State
  const [discoveredPOS, setDiscoveredPOS] = useState<DiscoveredPOS[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [isRequestingSupport, setIsRequestingSupport] = useState(false);

  // Onboarding flow state
  const [showPOSTypeSelector, setShowPOSTypeSelector] = useState(!!autoFocusWebPos);
  const [posNameHint, setPosNameHint] = useState('');
  const [showBubble, setShowBubble] = useState(false);
  const [showProcessWatcher, setShowProcessWatcher] = useState(false);

  // Check if user has already completed setup — if so, show Done screen
  const [hasCompletedSetup, setHasCompletedSetup] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const pairing = await ipcRenderer.invoke('get-pairing-data');
        if (pairing && pairing.posIdentifier) {
          setHasCompletedSetup(true);
          // Navigate to the Done/sync screen within the synkk engine
          navigate('/dashboard/synkk/done', { 
            state: { 
              slug: (await ipcRenderer.invoke('get-storefront-data'))?.slug,
              name: (await ipcRenderer.invoke('get-storefront-data'))?.name,
              coordinates: (await ipcRenderer.invoke('get-storefront-data'))?.coordinates
            },
            replace: true 
          });
        } else {
          setHasCompletedSetup(false);
        }
      } catch (e) {
        console.error(e);
        setHasCompletedSetup(false);
      }
    };
    checkSetup();
  }, []);

  useEffect(() => {
    if (hasCompletedSetup !== false) return;
    if (autoFocusWebPos) {
      setIsScanning(false);
      return;
    }

    const scan = async () => {
      setIsScanning(true);
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const results = await ipcRenderer.invoke('scan-local-pos');
        setDiscoveredPOS(results);
      } catch (err) {
        console.error("Failed to scan for POS", err);
      } finally {
        setIsScanning(false);
      }
    };
    scan();
  }, [hasCompletedSetup]);

  // Show loading while checking setup status
  if (hasCompletedSetup === null) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // If setup is complete, we already navigated to /dashboard/synkk/done
  if (hasCompletedSetup) return null;

  return (
    <div className="flex flex-col items-center justify-center w-full animate-in fade-in zoom-in duration-500 pb-10 pt-10 px-4 relative">

      <div className="mb-14 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
          <Database className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-6xl font-extrabold mb-4 tracking-tight">
          Welcome to <span className="gradient-text">Synkk</span>
        </h1>
        <p className="text-xl text-slate-400 font-light max-w-lg mx-auto">
          The silent catalog sync for modern pharmacies. No manual entry, no API configs. Just magic.
        </p>
      </div>

      {isScanning ? (
        <div className="w-full max-w-3xl mb-12 flex flex-col items-center justify-center py-6 animate-pulse">
           <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
           <p className="text-sm text-emerald-400/80">Synkk is scanning your system for POS software...</p>
        </div>
      ) : discoveredPOS.length > 0 && (
        <div className="w-full max-w-3xl mb-12 animate-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-xl font-medium text-white mb-4 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-emerald-400" />
            Auto-Discovered Systems
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            {discoveredPOS.map((pos, idx) => (
              <div 
                key={idx}
                onClick={() => navigate('/dashboard/synkk/analysis', { state: { method: 'drop', filePath: pos.executablePath } })}
                className="glass-panel glass-panel-hover flex items-center p-6 rounded-2xl cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mr-4 shrink-0">
                  <Database className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <h3 className="text-lg font-medium text-white group-hover:text-emerald-400 transition-colors truncate">{pos.name}</h3>
                  <p className="text-xs text-slate-400 truncate w-full">{pos.executablePath}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all shrink-0 ml-2" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* When scan finds nothing — show POS Type Selector */}
      {!isScanning && discoveredPOS.length === 0 && !showPOSTypeSelector && (
        <div className="w-full max-w-3xl mb-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="w-full bg-amber-500/8 border border-amber-500/20 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-400 mb-1">No POS detected automatically</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                Synkk scanned your system but couldn't find a local database. Let's connect a different way.
              </p>
              <button
                onClick={() => setShowPOSTypeSelector(true)}
                className="text-xs font-semibold px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded-lg transition-colors border border-amber-500/20 flex items-center gap-2"
              >
                Help Synkk find my POS <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS Type Selector screen */}
      {(showPOSTypeSelector || autoFocusWebPos) && !showBubble && (
        <div className="w-full max-w-3xl mb-8 animate-in slide-in-from-bottom-4 duration-500">
          <POSTypeSelector
            initialWebPos={autoFocusWebPos}
            posName={posNameHint}
            setPosName={setPosNameHint}
            onBack={() => setShowPOSTypeSelector(false)}
            onSelect={async (type, webUrl) => {
              if (type === 'web-pos') {
                if (webUrl?.trim()) {
                  let finalUrl = webUrl.trim();
                  if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
                  navigate('/dashboard/synkk/web-scraper', { state: { url: finalUrl } });
                }
              } else if (type === 'local-app') {
                // Trigger a deeper re-scan
                setShowPOSTypeSelector(false);
                setIsScanning(true);
                try {
                  // @ts-ignore
                  const { ipcRenderer } = window.require('electron');
                  const results = await ipcRenderer.invoke('scan-local-pos');
                  setDiscoveredPOS(results);
                  if (results.length === 0) {
                    // Start the process watcher!
                    setShowProcessWatcher(true);
                  }
                } catch (err) {
                  console.error(err);
                } finally {
                  setIsScanning(false);
                }
              } else {
                // 'unknown' — launch Bubble Mode Widget
                setShowPOSTypeSelector(false);
                // @ts-ignore
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.invoke('launch-bubble-widget', posNameHint);
              }
            }}
          />
        </div>
      )}

      {/* Support Section */}
      <div className="mt-12 mb-8 flex flex-col items-center w-full max-w-3xl">
        {isRequestingSupport ? (
          <div className="flex flex-col items-center justify-center p-5 bg-slate-800/80 rounded-2xl border border-emerald-500/30 w-full max-w-sm animate-in fade-in zoom-in duration-500">
            <div className="relative flex items-center justify-center mb-4 mt-1">
              {/* Radar waves */}
              <div className="absolute w-16 h-16 bg-emerald-500/20 rounded-full animate-ping"></div>
              <div className="absolute w-12 h-12 bg-emerald-500/40 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
              {/* Core Icon */}
              <div className="relative z-10 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                <Radio className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-emerald-400 font-bold text-base mb-1">Request Sent!</h3>
            <p className="text-slate-300 text-center text-xs leading-relaxed">
              You have sent a request to admin about finding your POS and will be contacted shortly.
            </p>
          </div>
        ) : (
          <button 
            onClick={async () => {
              setIsRequestingSupport(true);
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              await ipcRenderer.invoke('request-support', { screen: 'Welcome' });
            }}
            className="text-slate-400 hover:text-emerald-400 transition-colors text-sm font-medium flex items-center gap-2 py-2 px-4 rounded-lg hover:bg-slate-800/50"
          >
            <Radio className="w-4 h-4" />
            Can't find your POS? Request Live Support
          </button>
        )}
      </div>

      {/* Process Watcher Overlay */}
      {showProcessWatcher && (
        <ProcessWatcherOverlay
          onCancel={() => {
            setShowProcessWatcher(false);
            setShowPOSTypeSelector(true);
          }}
          onSuccess={(dbPath) => {
            setShowProcessWatcher(false);
            navigate('/dashboard/synkk/analysis', { state: { method: 'drop', filePath: dbPath } });
          }}
          onPivotToWeb={() => {
            setShowProcessWatcher(false);
            setShowPOSTypeSelector(true);
          }}
        />
      )}

    </div>
  );
}
