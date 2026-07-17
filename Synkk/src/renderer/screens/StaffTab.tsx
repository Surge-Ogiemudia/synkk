import React, { useRef, useEffect } from 'react';

export default function StaffTab() {
  const staffUrl = 'https://pos.psx.ng/staff';
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (webview) {
      const handleDomReady = () => {
        webview.setZoomFactor(0.9);
        webview.insertCSS('header.sticky { display: none !important; }');
      };
      webview.addEventListener('dom-ready', handleDomReady);
      return () => {
        webview.removeEventListener('dom-ready', handleDomReady);
      };
    }
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] animate-in fade-in duration-500">
      {/* @ts-ignore */}
      <webview 
        ref={webviewRef}
        src={staffUrl}
        title="PharmaStackX Staff Management"
        className="w-full h-full border-0"
        allowpopups={true}
        partition="persist:pos"
      />
    </div>
  );
}
