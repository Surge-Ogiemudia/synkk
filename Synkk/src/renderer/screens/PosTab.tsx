import React, { useRef, useEffect } from 'react';

export default function PosTab() {
  // Using a placeholder URL until the actual production URL is provided
  const posUrl = 'https://pos.psx.ng'; // You can change this to the actual POS URL
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (webview) {
      const handleDomReady = () => {
        // Zoom out to 85% to trick the POS into showing the side-by-side layout
        webview.setZoomFactor(0.85);
      };
      webview.addEventListener('dom-ready', handleDomReady);
      return () => {
        webview.removeEventListener('dom-ready', handleDomReady);
      };
    }
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-[#050505]">
      {/* @ts-ignore */}
      <webview 
        ref={webviewRef}
        src={posUrl}
        title="PharmaStackX POS"
        className="w-full h-full border-0"
        allowpopups={true}
        partition="persist:pos"
      />
    </div>
  );
}
