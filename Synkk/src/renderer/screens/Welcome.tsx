import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, Link as LinkIcon, Database, ArrowRight, HardDrive, Radio } from 'lucide-react';

interface DiscoveredPOS {
  name: string;
  executablePath: string;
  type: string;
}

export default function Welcome() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [discoveredPOS, setDiscoveredPOS] = useState<DiscoveredPOS[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [isRequestingSupport, setIsRequestingSupport] = useState(false);

  useEffect(() => {
    const scan = async () => {
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
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0] as any;
      let filePath = file.path;
      
      if (!filePath) {
         // Some .lnk shortcuts don't expose their full path in the browser drop event.
         // That's fine! Our backend will use just the file name to do a smart system-wide search.
         filePath = file.name;
      }
      
      navigate('/analysis', { state: { method: 'drop', filePath } });
    } else {
      alert("No valid files were detected in that drop.");
    }
  };

  const handlePaste = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) {
      let finalUrl = url.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
      }
      navigate('/web-scraper', { state: { url: finalUrl } });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full animate-in fade-in zoom-in duration-500 pb-10 pt-10 px-4">
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
                onClick={() => navigate('/analysis', { state: { method: 'drop', filePath: pos.executablePath } })}
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

      <div className="w-full max-w-3xl mb-4 text-left">
        <h2 className="text-lg font-medium text-slate-400">Manual Fallback Options</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
        {/* Drop Zone / File Picker */}
        <div 
          onClick={async () => {
            try {
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              const filePath = await ipcRenderer.invoke('open-file-dialog');
              if (filePath) {
                navigate('/analysis', { state: { method: 'drop', filePath } });
              }
            } catch (err) {
              console.error(err);
              alert("Error launching file picker.");
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`glass-panel glass-panel-hover flex flex-col items-center justify-center p-10 rounded-3xl cursor-pointer relative overflow-hidden group ${isDragging ? 'border-emerald-500/50 bg-emerald-500/10 scale-[1.02]' : ''}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <UploadCloud className={`w-14 h-14 mb-4 transition-colors duration-300 ${isDragging ? 'text-emerald-400' : 'text-slate-400 group-hover:text-emerald-400'}`} />
          <h2 className="text-xl font-semibold text-white mb-2 text-center">Click or Drop database</h2>
          <p className="text-sm text-slate-400 text-center">Select your POS SQLite, MySQL backup, or CSV export.</p>
        </div>

        {/* URL Input */}
        <div className="glass-panel flex flex-col justify-center p-10 rounded-3xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-50"></div>
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center mb-6 border border-white/5">
              <LinkIcon className="w-6 h-6 text-cyan-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Connect web software</h2>
            <p className="text-sm text-slate-400 mb-6">Paste your web POS link to sync directly via API polling.</p>
            
            <form onSubmit={handlePaste} className="relative group">
              <input 
                type="text" 
                placeholder="https://mypharmacy.pos.com" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-cyan-500/20 text-white rounded-lg transition-colors">
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

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

    </div>
  );
}
