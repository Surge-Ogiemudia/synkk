import React, { useRef, useEffect } from 'react';

const sendTrace = (msg: string) => {
  console.log(msg);
  try {
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('log-trace', msg);
  } catch (e) {}
};

export default function PosTab() {
  const posUrl = 'https://pos.psx.ng';
  const webviewRef = useRef<any>(null);
  const isFailedRef = useRef<boolean>(false);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    sendTrace('[WebviewTrace:POS] PosTab component mounted');

    const checkCookiesOnMount = async () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const verify = await ipcRenderer.invoke('verify-session-cookie');
        sendTrace(`[WebviewTrace:POS] Cookie state at mount: ${JSON.stringify(verify)}`);
      } catch (err: any) {
        sendTrace(`[WebviewTrace:POS] Cookie check error: ${err.message}`);
      }
    };
    checkCookiesOnMount();

    const handleStartLoading = () => {
      sendTrace(`[WebviewTrace:POS] did-start-loading -> ${posUrl}`);
    };

    const handleDomReady = () => {
      sendTrace('[WebviewTrace:POS] dom-ready -> setting zoom factor 0.85');
      webview.setZoomFactor(0.85);
      isFailedRef.current = false;
    };

    const handleFailLoad = (e: any) => {
      sendTrace(`[WebviewTrace:POS] did-fail-load: ${JSON.stringify({
        errorCode: e.errorCode,
        errorDescription: e.errorDescription,
        validatedURL: e.validatedURL,
        isMainFrame: e.isMainFrame
      })}`);
      if (e.isMainFrame && e.errorCode !== -3) {
        isFailedRef.current = true;
      }
    };

    const handleConsoleMessage = (e: any) => {
      sendTrace(`[WebviewTrace:POS Console] [Level ${e.level}] ${e.message} (Line ${e.line})`);
    };

    const handleDidNavigate = (e: any) => {
      sendTrace(`[WebviewTrace:POS] did-navigate -> ${e.url}`);
    };

    const handleOnline = () => {
      sendTrace('[WebviewTrace:POS] Network online event detected');
      if (webviewRef.current) {
        isFailedRef.current = false;
        try {
          sendTrace('[WebviewTrace:POS] Reloading POS webview...');
          webviewRef.current.reload();
        } catch (err: any) {
          sendTrace(`[WebviewTrace:POS] Failed to reload webview on online: ${err.message}`);
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
        className="w-full h-full border-0 flex-1"
        allowpopups={true}
        partition="persist:pos"
      />
    </div>
  );
}
