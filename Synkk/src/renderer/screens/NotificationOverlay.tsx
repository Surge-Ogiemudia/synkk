import React, { useEffect, useState, useRef } from 'react';
import { Package, Pill, XCircle, CheckCircle2 } from 'lucide-react';

export default function NotificationOverlay() {
  const [data, setData] = useState<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    
    const handler = (_e: any, incoming: any) => {
      setData(incoming);
      
      const durationSetting = incoming.alarmDuration || 'infinite';

      if (durationSetting !== 'off') {
        if (!audioRef.current) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          
          if (durationSetting === 'infinite') {
            audio.loop = true;
          } else {
            const maxBeeps = parseInt(durationSetting, 10);
            let beeps = 0;
            audio.onended = () => {
              beeps++;
              if (beeps < maxBeeps) {
                audio.play().catch(console.error);
              }
            };
          }
          audioRef.current = audio;
        }
        audioRef.current.play().catch(console.error);
      }
    };

    ipcRenderer.on('show-overlay-data', handler);
    ipcRenderer.send('overlay-ready');

    return () => {
      ipcRenderer.removeListener('show-overlay-data', handler);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('close-overlay');
  };

  const handleAccept = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    
    if (data?.type === 'lead') {
      const leadId = data.data.id;
      await ipcRenderer.invoke('update-lead-status', leadId, 'accepted');
      ipcRenderer.send('close-overlay');
      ipcRenderer.send('bring-window-to-front');
    }
  };

  if (!data) return <div className="w-full h-full bg-slate-900 rounded-2xl animate-pulse"></div>;

  const isOrder = data.type === 'order';

  return (
    <div className="w-full h-full bg-slate-900/95 border border-slate-700 shadow-2xl rounded-2xl flex flex-col overflow-hidden text-slate-100 p-4 select-none relative">
      <div className="flex items-center gap-2 mb-3 relative z-10">
        {isOrder ? (
          <Package className="w-5 h-5 text-emerald-400" />
        ) : (
          <Pill className="w-5 h-5 text-amber-400" />
        )}
        <h3 className="font-bold text-lg">
          {isOrder ? 'New Order!' : 'New Lead Alert!'}
        </h3>
      </div>
      
      <p className="text-sm text-slate-300 flex-1 leading-relaxed relative z-10">
        {isOrder 
          ? `${data.data.patientName || 'A customer'} ordered ${data.data.itemsCount} items for ₦${data.data.totalAmount}.`
          : `A patient in ${data.data.location} is looking for ${data.data.medicines?.map((m:any) => m.name).join(', ')}.`
        }
      </p>

      <div className="flex gap-2 mt-4 relative z-10">
        <button 
          onClick={handleClose}
          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded-lg text-sm transition font-medium flex items-center justify-center gap-1.5"
        >
          <XCircle className="w-4 h-4" /> Ignore
        </button>
        <button 
          onClick={handleAccept}
          className={`flex-1 text-white py-1.5 rounded-lg text-sm transition font-medium flex items-center justify-center gap-1.5 ${isOrder ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
        >
          <CheckCircle2 className="w-4 h-4" /> View in App
        </button>
      </div>
      
      {/* Background breathing effect to make it noticeable */}
      <div className={`absolute inset-0 opacity-10 pointer-events-none animate-pulse ${isOrder ? 'bg-emerald-500' : 'bg-amber-500'}`} />
    </div>
  );
}
