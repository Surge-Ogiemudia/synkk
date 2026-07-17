import React, { useRef, useEffect } from 'react';

export default function DispensaryTab() {
  // Use local if you are testing EMR locally on 3001, else production
  const emrDispensaryUrl = import.meta.env.DEV ? 'http://localhost:3000/dispensary' : 'https://emr.psx.ng/dispensary'; 
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
        src={emrDispensaryUrl}
        title="PharmaStackX Dispensary"
        className="w-full h-full border-0"
        allowpopups={true}
      />
    </div>
  );
}
