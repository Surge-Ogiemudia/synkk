import React, { useRef, useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

const sendTrace = (msg: string) => {
  console.log(msg);
  try {
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('log-trace', msg);
  } catch (e) {}
};

export default function PosTab() {
  const posUrl = 'https://pos.psx.ng/pos';
  const webviewRef = useRef<any>(null);
  const [isFailed, setIsFailed] = useState<boolean>(false);
  const [isReloading, setIsReloading] = useState<boolean>(false);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    sendTrace('[WebviewTrace:POS] PosTab component mounted (target: https://pos.psx.ng/pos)');

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
      setIsFailed(false);
      setIsReloading(false);
    };

    const handleFailLoad = (e: any) => {
      sendTrace(`[WebviewTrace:POS] did-fail-load: ${JSON.stringify({
        errorCode: e.errorCode,
        errorDescription: e.errorDescription,
        validatedURL: e.validatedURL,
        isMainFrame: e.isMainFrame
      })}`);
      if (e.isMainFrame && e.errorCode !== -3) {
        setIsFailed(true);
        setIsReloading(false);
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
        setIsFailed(false);
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

  const handleManualRetry = () => {
    setIsReloading(true);
    sendTrace('[WebviewTrace:POS] Manual retry clicked by user');
    if (webviewRef.current) {
      try {
        webviewRef.current.loadURL(posUrl);
      } catch (err: any) {
        sendTrace(`[WebviewTrace:POS] Manual retry loadURL error: ${err.message}`);
        setIsReloading(false);
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] relative">
      {isFailed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0a0c] text-slate-200 p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-lg">
            <WifiOff className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">POS Register Offline Connection</h2>
          <p className="text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
            The register is loading in offline mode. If the web cache is still syncing, click retry or reconnect Wi-Fi to load online.
          </p>
          <button
            onClick={handleManualRetry}
            disabled={isReloading}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
            {isReloading ? 'Reloading Register...' : 'Retry Register Load'}
          </button>
        </div>
      )}

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
