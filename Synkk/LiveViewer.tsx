'use client';

/**
 * LiveViewer.tsx
 * 
 * Epic 5: Live Chromium Broadcast (Dashboard UI Component)
 * 
 * Drop this component into the PharmastackX admin dashboard.
 * It subscribes to the private pusher channel for a specific pharmacy
 * and renders the live visual stream of the Synkk headless extraction process.
 */

import React, { useEffect, useState } from 'react';
// import Pusher from 'pusher-js';

interface LiveViewerProps {
  slug: string;
}

export default function LiveViewer({ slug }: LiveViewerProps) {
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastFrameTime, setLastFrameTime] = useState<number>(0);

  useEffect(() => {
    // const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    //   cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    //   authEndpoint: '/api/pusher/auth', // standard private channel auth
    // });

    // const channel = pusher.subscribe(`private-admin-${slug}`);

    // channel.bind('pusher:subscription_succeeded', () => setIsConnected(true));
    
    // channel.bind('live-frame', (data: { frame: string, timestamp: number }) => {
    //   setLiveFrame(data.frame);
    //   setLastFrameTime(data.timestamp);
    // });

    // return () => {
    //   channel.unbind_all();
    //   channel.unsubscribe();
    //   pusher.disconnect();
    // };
  }, [slug]);

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
          <h3 className="text-sm font-semibold text-slate-800">
            Live Extractor Feed <span className="font-normal text-slate-500 ml-1">({slug})</span>
          </h3>
        </div>
        
        {lastFrameTime > 0 && (
          <div className="text-xs text-slate-500 font-mono">
            Last frame: {new Date(lastFrameTime).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Video / Frame Player */}
      <div className="relative w-full aspect-video bg-slate-900 flex items-center justify-center">
        {liveFrame ? (
          <img 
            src={liveFrame} 
            alt="Live Sync Frame" 
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500">
            <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">Waiting for live broadcast to start...</p>
          </div>
        )}
      </div>
    </div>
  );
}
