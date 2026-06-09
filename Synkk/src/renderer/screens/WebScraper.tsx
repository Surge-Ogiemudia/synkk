import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ScanText, Loader2, FileDown, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function WebScraper() {
  const navigate = useNavigate();
  const location = useLocation();
  const url = location.state?.url;
  
  const webviewRef = useRef<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [accumulatedText, setAccumulatedText] = useState('');
  const [scanCount, setScanCount] = useState(0);
  const [showScanMoreDialog, setShowScanMoreDialog] = useState(false);

  useEffect(() => {
    if (!url) {
      navigate('/');
      return;
    }

    // Once the webview is ready, inject silent credential capture on every page load
    const webview = webviewRef.current;
    if (!webview) return;

    const injectCredentialCapture = () => {
      // This script silently monitors login forms inside the webview.
      // When the user logs in naturally, it captures their credentials
      // and stores them in sessionStorage for Synkk to pick up later.
      const captureScript = `
        (() => {
          if (window.__synkkCapture) return; // Already injected
          window.__synkkCapture = true;

          function captureFromPage() {
            const passInputs = document.querySelectorAll('input[type="password"]');
            if (passInputs.length === 0) return;

            passInputs.forEach(passInput => {
              const form = passInput.closest('form');
              const container = form || document;

              // Listen for form submit
              if (form) {
                form.addEventListener('submit', () => {
                  grabAndStore(container, passInput);
                }, true);
              }

              // Listen for button clicks (some SPAs don't use form submit)
              container.addEventListener('click', (e) => {
                const btn = e.target.closest('button, input[type="submit"], a');
                if (!btn) return;
                const text = (btn.textContent || btn.value || '').toLowerCase();
                if (text.includes('log in') || text.includes('login') || text.includes('sign in') || text.includes('submit') || text.includes('continue') || btn.type === 'submit') {
                  setTimeout(() => grabAndStore(container, passInput), 50);
                }
              }, true);

              // Listen for Enter key in password field
              passInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                  setTimeout(() => grabAndStore(container, passInput), 50);
                }
              }, true);
            });
          }

          function grabAndStore(container, passInput) {
            const password = passInput.value;
            if (!password) return;

            let username = '';
            const inputs = container.querySelectorAll('input');
            for (const inp of inputs) {
              if (inp === passInput) continue;
              if (inp.type === 'hidden' || inp.type === 'checkbox' || inp.type === 'radio') continue;
              if (inp.type === 'email' || inp.type === 'text' || inp.type === 'tel') {
                if (inp.value && inp.value.trim()) {
                  username = inp.value.trim();
                  break;
                }
              }
            }

            if (username && password) {
              try {
                sessionStorage.setItem('__synkk_creds', JSON.stringify({ u: username, p: password }));
              } catch(e) {}
            }
          }

          captureFromPage();

          // Re-run on DOM mutations (for SPAs that render login forms dynamically)
          const observer = new MutationObserver(() => {
            if (document.querySelector('input[type="password"]')) {
              captureFromPage();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        })()
      `;

      webview.executeJavaScript(captureScript).catch(() => {});
    };

    webview.addEventListener('did-finish-load', injectCredentialCapture);
    // Also inject on navigation within SPAs
    webview.addEventListener('did-navigate-in-page', injectCredentialCapture);

    return () => {
      webview.removeEventListener('did-finish-load', injectCredentialCapture);
      webview.removeEventListener('did-navigate-in-page', injectCredentialCapture);
    };
  }, [url, navigate]);

  const handleScan = async () => {
    if (!webviewRef.current) return;
    setIsScanning(true);
    setErrorMsg('');
    
    try {
      // ── Silently harvest any captured credentials before scanning ──
      try {
        const credsJson = await webviewRef.current.executeJavaScript(
          `sessionStorage.getItem('__synkk_creds')`
        );
        if (credsJson) {
          const creds = JSON.parse(credsJson);
          if (creds.u && creds.p) {
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('save-web-pos-credentials', {
              username: creds.u,
              password: creds.p
            });
            console.log('Silently stored Web POS credentials for auto-relogin.');
          }
          // Clean up
          await webviewRef.current.executeJavaScript(
            `sessionStorage.removeItem('__synkk_creds')`
          );
        }
      } catch (credErr) {
        // Non-critical — just skip silently
        console.log('Credential capture skipped:', credErr);
      }

      // ── Attempt to expand pagination & auto-scroll ──
      const expandAndScrollCode = `
        (async () => {
          // 1. Smart Dropdown Hunter (Combobox heuristic)
          const dropdowns = Array.from(document.querySelectorAll('select, div[role="combobox"], div[role="button"], span[role="button"], div[class*="select"], div[class*="dropdown"]'));
          for (const el of dropdowns) {
            const text = (el.textContent || '').toLowerCase();
            if (text.includes('rows') || text.includes('per page') || text.includes('view') || text.match(/^(10|20|25|50)$/)) {
              if (el.tagName.toLowerCase() === 'select') {
                const options = Array.from(el.options);
                let maxOpt = options[0];
                let maxVal = -1;
                for (const o of options) {
                  if (o.text.toLowerCase().includes('all')) { maxOpt = o; break; }
                  const val = parseInt(o.value) || parseInt(o.text) || 0;
                  if (val > maxVal) { maxVal = val; maxOpt = o; }
                }
                if (maxVal > 25 || maxOpt.text.toLowerCase().includes('all')) {
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
                  if (nativeInputValueSetter) nativeInputValueSetter.call(el, maxOpt.value);
                  else el.value = maxOpt.value;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  await new Promise(r => setTimeout(r, 3000));
                }
              } else {
                el.click();
                await new Promise(r => setTimeout(r, 1000));
                const menuItems = Array.from(document.querySelectorAll('li, div[role="option"], span[class*="option"], div[class*="item"]'));
                let maxOpt = null;
                let maxVal = -1;
                for (const item of menuItems) {
                  const txt = (item.textContent || '').toLowerCase().trim();
                  if (txt === 'all') { maxOpt = item; break; }
                  const val = parseInt(txt);
                  if (val > maxVal && val >= 50 && val <= 5000) { maxVal = val; maxOpt = item; }
                }
                if (maxOpt) {
                  maxOpt.click();
                  await new Promise(r => setTimeout(r, 4000));
                } else {
                  el.click(); // close if not found
                }
              }
            }
          }

          // 2. Auto-scroll to bottom for infinite scroll support
          await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 600;
            let maxScrolls = 15; // Max ~7.5 seconds of scrolling
            let scrolls = 0;
            
            let timer = setInterval(() => {
              let scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;
              scrolls++;

              if (totalHeight >= scrollHeight || scrolls >= maxScrolls) {
                clearInterval(timer);
                resolve(null);
              }
            }, 500);
          });
        })();
      `;
      await webviewRef.current.executeJavaScript(expandAndScrollCode);
      // Wait a moment for any final lazily-loaded text
      await new Promise(r => setTimeout(r, 2000));

      // Execute JS inside the webview to extract all text content
      const code = `document.body.innerText || document.body.textContent`;
      const pageText = await webviewRef.current.executeJavaScript(code);
      
      setAccumulatedText(prev => prev + '\\n\\n' + pageText);
      setScanCount(c => c + 1);
      setShowScanMoreDialog(true);
      setIsScanning(false);
      
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to scan page: ' + err.message);
      setIsScanning(false);
    }
  };

  const handleFinishScan = async () => {
    setShowScanMoreDialog(false);
    setIsScanning(true);
    try {
      const actualUrl = webviewRef.current.getURL() || url;
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      const response = await ipcRenderer.invoke('semantic-scrape', { text: accumulatedText, url: actualUrl });
      
      if (response.success && response.result) {
        navigate('/confirmation', { state: { result: response.result, pathOrUrl: actualUrl, initialPayloadText: accumulatedText } });
      } else {
        setErrorMsg(response.error || 'Synkk could not identify inventory data on these pages. Please make sure you are on the correct page.');
        setIsScanning(false);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to process aggregated pages: ' + err.message);
      setIsScanning(false);
    }
  };

  return (
    <div className="w-full h-[85vh] flex flex-col relative pt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ScanText className="w-5 h-5 text-cyan-400" />
              Connect Web POS
            </h2>
            <p className="text-slate-400 text-xs">Navigate to your inventory and maximize items per view (e.g. 500).</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => {
               // Fallback: manually trigger file dialog for CSV export
               navigate('/analysis', { state: { method: 'drop', filePath: '' } }); // Will fail and user can try again or we can have a better fallback. Wait, just tell them to use the main screen drop.
               alert("Please export your inventory as a CSV from your POS, and drag it into the 'Click or Drop database' box on the home screen.");
               navigate('/');
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-slate-700"
          >
            <FileDown className="w-4 h-4" />
            Fallback to CSV
          </button>
          
          <button 
            onClick={handleScan}
            disabled={isScanning}
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-cyan-500/20"
          >
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanText className="w-4 h-4" />}
            {isScanning ? 'Analyzing...' : 'Scan This Page'}
          </button>
        </div>
      </div>

      {showScanMoreDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              Page {scanCount} Scanned!
            </h3>
            <p className="text-slate-400 mb-6">
              We've captured the inventory data from this page. If you have more items, navigate to the next page and scan again.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setShowScanMoreDialog(false)}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium border border-slate-700 transition-colors"
              >
                Let me navigate to the next page
              </button>
              <button 
                onClick={handleFinishScan}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium shadow-lg hover:shadow-emerald-500/25 transition-all"
              >
                No, all done! Process {scanCount} page{scanCount > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 mb-4 flex items-start gap-3">
        <div className="bg-cyan-500/20 p-2 rounded-lg mt-0.5">
          <ScanText className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-cyan-400 font-bold text-sm mb-1">Action Required</h3>
          <p className="text-slate-300 text-sm leading-relaxed">
            Please log in securely and go to your inventory/stock/product list that has all your products, and click <strong>"Scan This Page"</strong>.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex-1 w-full bg-white rounded-xl overflow-hidden border border-slate-700 shadow-2xl relative">
        {/* @ts-ignore - Webview is a custom element in Electron */}
        <webview 
          ref={webviewRef}
          src={url}
          className="w-full h-full"
          allowpopups={true as any}
        />
        {isScanning && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="bg-slate-800 p-6 rounded-2xl border border-cyan-500/30 flex flex-col items-center max-w-sm text-center shadow-2xl animate-in zoom-in duration-300">
              <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
              <h3 className="text-white font-bold text-lg mb-2">Synkk Semantic Scan in Progress</h3>
              <p className="text-slate-400 text-sm">
                Synkk is currently reading the page structure to extract your medication inventory. This usually takes 5-10 seconds.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
