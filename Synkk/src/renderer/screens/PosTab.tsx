import React, { useRef, useEffect } from 'react';

export default function PosTab() {
  const posUrl = 'https://pos.psx.ng';
  const webviewRef = useRef<any>(null);
  const isFailedRef = useRef<boolean>(false);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const checkCookiesOnMount = async () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const verify = await ipcRenderer.invoke('verify-session-cookie');
        console.log('[WebviewTrace:POS] Cookie state at mount:', verify);
      } catch (err) {
        console.error('[WebviewTrace:POS] Cookie check error:', err);
      }
    };
    checkCookiesOnMount();

    const handleStartLoading = () => {
      console.log(`[WebviewTrace:POS] did-start-loading -> ${posUrl}`);
    };

    const handleDomReady = () => {
      console.log('[WebviewTrace:POS] dom-ready -> setting zoom factor 0.85');
      webview.setZoomFactor(0.85);
      isFailedRef.current = false;
    };

    const handleFailLoad = (e: any) => {
      console.warn('[WebviewTrace:POS] did-fail-load:', {
        errorCode: e.errorCode,
        errorDescription: e.errorDescription,
        validatedURL: e.validatedURL,
        isMainFrame: e.isMainFrame
      });
      if (e.isMainFrame && e.errorCode !== -3) {
        isFailedRef.current = true;
      }
    };

    const handleConsoleMessage = (e: any) => {
      console.log(`[WebviewTrace:POS Console] [Level ${e.level}] ${e.message} (Line ${e.line})`);
    };

    const handleDidNavigate = (e: any) => {
      console.log(`[WebviewTrace:POS] did-navigate -> ${e.url}`);
    };

    const handleOnline = () => {
      console.log('[WebviewTrace:POS] Network online event detected');
      if (webviewRef.current) {
        isFailedRef.current = false;
        try {
          console.log('[WebviewTrace:POS] Reloading POS webview...');
          webviewRef.current.reload();
        } catch (err) {
          console.error("[WebviewTrace:POS] Failed to reload webview on online:", err);
        }
      }
    };

    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-fail-load', handleFailLoad);
    webview.addEventListener('console-message', handleConsoleMessage);
    webview.addEventListener('did-navigate', handleDidNavigate);
    window.addEventListener('online', handleOnline);

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading);
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-fail-load', handleFailLoad);
      webview.removeEventListener('console-message', handleConsoleMessage);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      window.removeEventListener('online', handleOnline);
    };
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
