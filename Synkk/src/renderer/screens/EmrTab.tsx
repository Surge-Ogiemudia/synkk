import React, { useRef, useEffect } from 'react';

export default function EmrTab() {
  const emrUrl = import.meta.env.DEV ? 'http://localhost:3000' : 'https://emr.psx.ng';
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (webview) {
      const handleDomReady = () => {
        webview.setZoomFactor(0.9);
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
        src={emrUrl}
        title="PharmaStackX EMR Terminal"
        className="w-full h-full border-0"
        allowpopups={true}
      />
    </div>
  );
}
