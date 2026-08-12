import React, { useRef, useEffect } from 'react';

export default function GeneralDashboardTab() {
  const url = 'https://www.psx.ng';
  const webviewRef = useRef<any>(null);
  const isFailedRef = useRef<boolean>(false);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDomReady = () => {
      isFailedRef.current = false;
    };

    const handleFailLoad = (e: any) => {
      if (e.isMainFrame && e.errorCode !== -3) {
        isFailedRef.current = true;
      }
    };

    const handleOnline = () => {
      if (webviewRef.current) {
        isFailedRef.current = false;
        try {
          webviewRef.current.reload();
        } catch (err) {
          console.error("Failed to reload webview on online:", err);
        }
      }
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-fail-load', handleFailLoad);
    window.addEventListener('online', handleOnline);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-fail-load', handleFailLoad);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] animate-in fade-in duration-500">
      {/* @ts-ignore */}
      <webview 
        ref={webviewRef}
        src={url}
        title="PharmaStackX Dashboard"
        className="w-full h-full border-0"
        allowpopups={true}
        partition="persist:pos"
      />
    </div>
  );
}
