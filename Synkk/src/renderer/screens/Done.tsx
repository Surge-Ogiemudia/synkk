import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, ExternalLink, QrCode } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function Done() {
  const location = useLocation();
  const slug = location.state?.slug || 'my-pharmacy';
  const name = location.state?.name || 'My Pharmacy';
  const coordinates = location.state?.coordinates || null;

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
    frame();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center w-full max-w-md px-6">
      <CheckCircle2 className="w-20 h-20 text-emerald-400 mb-6" />
      <h2 className="text-3xl font-bold text-white mb-2">You're all set!</h2>
      <p className="text-slate-400 mb-8">Your pharmacy is now live on PharmaStackX. We will silently sync your inventory in the background.</p>

      <div className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col items-center mb-8">
        <div className="w-48 h-48 bg-white rounded-xl mb-4 flex items-center justify-center">
          <QrCode className="w-32 h-32 text-slate-900" />
        </div>
        <p className="text-emerald-400 font-mono text-sm tracking-wide">{slug}.psx.ng</p>
        <p className="text-slate-500 font-mono text-xs mt-1 tracking-wide">{slug}.pharmastackx.com</p>
      </div>

      <button
        onClick={() => {
          // @ts-ignore
          const { shell } = window.require('electron');
          const baseUrl = import.meta.env.DEV ? 'http://localhost:3000' : 'https://psx.ng';
          const authUrl = slug.startsWith('guest-') ? `${baseUrl}/auth?claim_slug=${slug}` : `${baseUrl}/auth`;
          shell.openExternal(authUrl);
        }}
        className="w-full bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg"
      >
        Open Web Dashboard
        <ExternalLink className="w-5 h-5" />
      </button>
      
      <p className="mt-6 text-xs text-slate-500">You can safely close this window. Synkk is running in your system tray.</p>
    </div>
  );
}
