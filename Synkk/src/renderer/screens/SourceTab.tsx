import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, Box, AlertCircle, ShoppingCart } from 'lucide-react';

export default function SourceTab({ slug }: { slug?: string }) {
  const [activeSlug, setActiveSlug] = useState(slug || '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [checkoutItem, setCheckoutItem] = useState<any | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const webviewRef = React.useRef<any>(null);

  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !checkoutUrl) return;

    const injectCleanStyleAndBehavior = () => {
      const customCss = `
        /* Hide top global header / appbar */
        header, 
        .MuiAppBar-root, 
        [class*="MuiAppBar"], 
        .MuiToolbar-root { 
          display: none !important; 
        }

        /* Hide back button to keep drawer locked on checkout */
        .co-back-btn, 
        button[aria-label="back"], 
        [class*="back-btn"] { 
          display: none !important; 
        }
        
        /* Hide floating consumer bottom navigation */
        .MuiBottomNavigation-root, 
        [class*="BottomNavigation"], 
        nav.bottom-nav, 
        div[class*="bottom-nav"],
        div[style*="position: fixed"][style*="z-index: 9999"],
        div[style*="position: fixed"][style*="zIndex: 9999"],
        div[style*="bottom: 20px"],
        div[style*="bottom: 32px"] { 
          display: none !important; 
        }

        /* Center the Confirm Order header title */
        .co-header { 
          justify-content: center !important; 
          padding-top: 20px !important;
        }
        .co-header-title { 
          text-align: center !important; 
        }

        /* Ensure post-payment buttons and summaries are padded nicely */
        .co-container {
          padding-bottom: 40px !important;
        }
      `;
      try {
        webview.insertCSS(customCss);
      } catch (e) {}

      // Inject listener for completion buttons
      const completionScript = `
        (function() {
          if (window.__psxCompletionHooked) return;
          window.__psxCompletionHooked = true;
          document.addEventListener('click', function(e) {
            var btn = e.target.closest('button');
            if (btn) {
              var text = (btn.innerText || '').toLowerCase();
              if (text.includes('view my orders') || text.includes('go to my orders') || text.includes('go to orders')) {
                console.log('PSX_CHECKOUT_COMPLETED');
              }
            }
          }, true);
        })();
      `;
      try {
        webview.executeJavaScript(completionScript);
      } catch (e) {}
    };

    const handleConsoleMessage = (e: any) => {
      if (e.message && e.message.includes('PSX_CHECKOUT_COMPLETED')) {
        setCheckoutUrl(null);
        setCheckoutItem(null);
        setOrderSuccessMsg('Order placed successfully! Track its real-time status in Online Orders & Leads.');
        setTimeout(() => setOrderSuccessMsg(null), 8000);
      }
    };

    webview.addEventListener('dom-ready', injectCleanStyleAndBehavior);
    webview.addEventListener('did-finish-load', injectCleanStyleAndBehavior);
    webview.addEventListener('console-message', handleConsoleMessage);

    return () => {
      try {
        webview.removeEventListener('dom-ready', injectCleanStyleAndBehavior);
        webview.removeEventListener('did-finish-load', injectCleanStyleAndBehavior);
        webview.removeEventListener('console-message', handleConsoleMessage);
      } catch (e) {}
    };
  }, [checkoutUrl]);

  useEffect(() => {
    if (!activeSlug) {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('get-storefront-data').then((data: any) => {
          if (data && data.slug) setActiveSlug(data.slug);
        });
      } catch (e) {}
    }
  }, [activeSlug]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2 && !hasSearched) {
        try {
          // @ts-ignore
          const { ipcRenderer } = window.require('electron');
          const data = await ipcRenderer.invoke('autocomplete-source', { query });
          if (data.success) {
            setSuggestions(data.suggestions);
            setShowSuggestions(true);
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        setShowSuggestions(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, hasSearched]);

  const handleSearch = async (e: React.FormEvent | string) => {
    if (typeof e !== 'string') e.preventDefault();
    const searchQuery = typeof e === 'string' ? e : query;
    if (searchQuery.trim().length < 3) return;
    
    setQuery(searchQuery);
    setShowSuggestions(false);
    setLoading(true);
    setHasSearched(true);
    try {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      const data = await ipcRenderer.invoke('search-source', { query: searchQuery, exclude: activeSlug });
      
      if (data.success) {
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error('Failed to search', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCheckout = (item: any) => {
    const seller = item.pharmacy.slug || item.pharmacy.name;
    const url = `https://www.psx.ng/?view=confirmOrder&action=checkout&item=${encodeURIComponent(item.itemName)}&price=${item.price || 0}&seller=${encodeURIComponent(seller)}&buyer=${encodeURIComponent(activeSlug)}`;
    setCheckoutItem(item);
    setCheckoutUrl(url);
  };

  return (
    <div className="flex flex-col w-full h-full relative">
      
      {/* Descriptive Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white mb-2">B2B Sourcing</h2>
        <p className="text-slate-400 text-sm">
          Check neighboring pharmacy stock in real-time and source out-of-stock medicines instantly.
        </p>
      </div>

      {/* Success Notification Banner */}
      {orderSuccessMsg && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-emerald-300 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{orderSuccessMsg}</span>
          </div>
          <button 
            onClick={() => setOrderSuccessMsg(null)}
            className="text-emerald-400 hover:text-white text-xs font-semibold px-2 py-1 rounded bg-emerald-900/40"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search Header */}
      <form onSubmit={handleSearch} className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl leading-5 bg-slate-900/50 text-slate-200 placeholder-slate-400 focus:outline-none focus:bg-slate-900 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors sm:text-sm"
          placeholder="Search for out-of-stock medicine..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHasSearched(false);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        />
        <button 
          type="submit" 
          disabled={loading || query.length < 3}
          className="absolute inset-y-1.5 right-1.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Searching...' : 'Find'}
        </button>

        {/* Autocomplete Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((suggestion, idx) => (
              <div 
                key={idx}
                className="px-4 py-3 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 transition-colors flex items-center"
                onClick={() => {
                  handleSearch(suggestion);
                }}
              >
                <Search className="w-4 h-4 mr-3 text-slate-500" />
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </form>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto pr-2 pb-10 space-y-4 custom-scrollbar">
        
        {!hasSearched && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-3">
            <Search className="w-12 h-12 opacity-20" />
            <p className="text-sm text-center px-4">Type a medicine name to see who has it in stock nearby.</p>
          </div>
        )}

        {hasSearched && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-amber-500/80 space-y-3">
            <AlertCircle className="w-12 h-12 opacity-50" />
            <p className="text-sm text-center px-4">No pharmacies found with this item currently in stock.</p>
          </div>
        )}

        {hasSearched && !loading && results.map((item, idx) => (
          <div key={idx} className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
            
            <div className="flex justify-between items-start mb-2">
              <h4 className="text-white font-medium text-base truncate pr-2">{item.itemName}</h4>
              <span className="text-emerald-400 font-bold whitespace-nowrap">₦{item.price?.toLocaleString() || 'N/A'}</span>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
              <span className="flex items-center gap-1 bg-slate-900/50 px-2 py-1 rounded-md text-emerald-500/90 font-medium">
                <Box className="w-3 h-3" /> {item.qty} in stock
              </span>
              {item.pharmacy.distanceText && (
                <span className="flex items-center gap-1 bg-slate-900/50 px-2 py-1 rounded-md text-blue-400/90 font-medium">
                  <MapPin className="w-3 h-3" /> {item.pharmacy.distanceText}
                </span>
              )}
            </div>
            
            <div className="bg-slate-900/50 rounded-lg p-3 mt-auto">
              <p className="text-sm text-slate-200 font-medium mb-1">{item.pharmacy.name}</p>
              <div className="flex justify-between items-end gap-2 mt-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-2 text-xs text-slate-400">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
                    <span className="leading-tight max-w-[280px]">{item.pharmacy.businessAddress || item.pharmacy.state || 'Address not listed'}</span>
                  </div>
                  
                  <a 
                    href={`tel:+${item.pharmacy.phoneNumber}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    <Phone className="w-3.5 h-3.5" /> 
                    {item.pharmacy.phoneNumber ? `+${item.pharmacy.phoneNumber}` : 'Contact hidden'}
                  </a>
                </div>
                
                <button
                  onClick={() => handleOpenCheckout(item)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-900/20"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Get It
                </button>
              </div>
            </div>
            
          </div>
        ))}
      </div>

      {/* In-App B2B Checkout Drawer */}
      {checkoutUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight truncate max-w-[340px]">{checkoutItem?.itemName}</h3>
                  <p className="text-xs text-slate-400">
                    Sourcing from <span className="text-emerald-400 font-semibold">{checkoutItem?.pharmacy?.name}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    // Optional pop-out fallback
                    try {
                      // @ts-ignore
                      const { ipcRenderer } = window.require('electron');
                      ipcRenderer.send('open-checkout-window', checkoutUrl);
                    } catch (e) {}
                  }}
                  title="Open in separate window"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs"
                >
                  ↗
                </button>
                <button 
                  onClick={() => {
                    setCheckoutUrl(null);
                    setCheckoutItem(null);
                  }}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* In-App Authenticated Webview with persist:pos */}
            <div className="flex-1 w-full bg-white relative">
              {/* @ts-ignore */}
              <webview
                ref={webviewRef}
                src={checkoutUrl}
                className="w-full h-full border-0"
                partition="persist:pos"
                allowpopups={true}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
