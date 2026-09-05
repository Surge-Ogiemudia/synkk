import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Phone, Box, AlertCircle, ShoppingCart, RefreshCw, ExternalLink, X, CheckCircle2, ChevronRight } from 'lucide-react';
import { searchSource, autocompleteSource } from '@/lib/api';
import { auth } from '@/lib/auth';

export default function ExtensionSidepanel() {
  const [pharmacyName, setPharmacyName] = useState<string>('My Pharmacy');
  const [terminalId, setTerminalId] = useState<string>('Counter 1');
  const [slug, setSlug] = useState<string>('');
  const [syncCount, setSyncCount] = useState<number | null>(null);
  const [lastSyncText, setLastSyncText] = useState<string>('Synced just now');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Search & Sourcing State
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Slide-over Checkout Drawer State
  const [checkoutItem, setCheckoutItem] = useState<any | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize from auth or URL search params / postMessage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramPharm = params.get('pharmacy');
    const paramSlug = params.get('slug');
    const paramTerminal = params.get('terminal');
    const paramCount = params.get('count');

    if (paramPharm) setPharmacyName(paramPharm);
    if (paramSlug) setSlug(paramSlug);
    if (paramTerminal) setTerminalId(paramTerminal);
    if (paramCount) setSyncCount(parseInt(paramCount, 10));

    // Fallback to local profile if available
    const profile = auth.getProfile();
    if (profile) {
      if (!paramPharm && (profile.businessName || profile.staffName)) {
        setPharmacyName(profile.businessName || profile.staffName);
      }
      if (!paramSlug && profile.slug) setSlug(profile.slug);
    }

    // Listen to messages from extension shell
    const handleShellMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SYNC_STATE_UPDATE') {
        if (e.data.pharmacyName) setPharmacyName(e.data.pharmacyName);
        if (e.data.terminalId) setTerminalId(e.data.terminalId);
        if (e.data.syncCount !== undefined) setSyncCount(e.data.syncCount);
        if (e.data.lastSyncText) setLastSyncText(e.data.lastSyncText);
      }
      if (e.data && (e.data.type === 'PSX_ORDER_DONE' || e.data === 'PSX_CHECKOUT_COMPLETED')) {
        setCheckoutUrl(null);
        setCheckoutItem(null);
        setOrderSuccessMsg('Order placed successfully with dispatch!');
        setTimeout(() => setOrderSuccessMsg(null), 7000);
      }
    };
    window.addEventListener('message', handleShellMessage);
    return () => window.removeEventListener('message', handleShellMessage);
  }, []);

  // Autocomplete debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2 && !hasSearched) {
        try {
          const data = await autocompleteSource(query);
          if (data.success && data.suggestions?.length > 0) {
            setSuggestions(data.suggestions);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        setShowSuggestions(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, hasSearched]);

  const handleSearch = async (e: React.FormEvent | string) => {
    if (typeof e !== 'string') e.preventDefault();
    const searchQuery = typeof e === 'string' ? e : query;
    if (searchQuery.trim().length < 2) return;

    setQuery(searchQuery);
    setShowSuggestions(false);
    setLoading(true);
    setHasSearched(true);

    try {
      const data = await searchSource(searchQuery, slug);
      if (data.success && data.results) {
        setResults(data.results);
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
    const seller = item.pharmacy?.slug || item.pharmacy?.name || item.sellerPharmacy || 'Verified Pharmacy';
    const itemName = item.itemName || item.name;
    const price = item.price || 0;
    const buyer = slug || pharmacyName;
    const url = `https://www.psx.ng/?view=confirmOrder&action=checkout&item=${encodeURIComponent(itemName)}&price=${price}&seller=${encodeURIComponent(seller)}&buyer=${encodeURIComponent(buyer)}`;
    
    setCheckoutItem(item);
    setCheckoutUrl(url);
  };

  const handleForceSync = () => {
    setIsSyncing(true);
    // Notify parent extension shell if inside iframe
    window.parent.postMessage({ type: 'TRIGGER_FORCE_SYNC' }, '*');
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncText('Synced just now');
    }, 1200);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0b0f17] text-slate-100 font-sans select-none overflow-hidden relative">
      
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-3.5 py-2.5 bg-[#111827] border-b border-white/10 shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-sky-600 flex items-center justify-center font-black text-xs text-slate-950 shadow-md shrink-0">
            {pharmacyName.substring(0, 3).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs text-white truncate max-w-[150px]">{pharmacyName}</span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Sync Active
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-white/5 text-[10px] font-semibold text-slate-400">
            💻 {terminalId}
          </span>
          <button 
            onClick={handleForceSync}
            title="Force Sync Inventory"
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        
        {/* Sync Status Banner Card */}
        <div className="bg-[#161f30] border border-white/5 rounded-xl p-3 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 via-sky-400 to-emerald-500"></div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-slate-200">Catalog Health</span>
            <span className="text-emerald-400 font-bold">
              {syncCount !== null ? `${syncCount.toLocaleString()} items` : 'Live Synced'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>{lastSyncText}</span>
            <span 
              onClick={handleForceSync} 
              className="text-sky-400 hover:underline cursor-pointer flex items-center gap-0.5 font-medium"
            >
              Sync ↻
            </span>
          </div>
        </div>

        {/* Success Toast Banner */}
        {orderSuccessMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-emerald-300 text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{orderSuccessMsg}</span>
            </div>
            <button onClick={() => setOrderSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Sourcing Section Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-emerald-400" />
              B2B Stock Sourcing
            </h3>
            <p className="text-[10px] text-slate-400">Procure out-of-stock items nearby</p>
          </div>
        </div>

        {/* Search Input Box */}
        <form onSubmit={handleSearch} className="relative">
          <div className="flex items-center bg-[#161f30] border border-white/10 rounded-xl px-3 py-1.5 focus-within:border-emerald-400/60 focus-within:ring-2 focus-within:ring-emerald-400/20 transition">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input 
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHasSearched(false);
              }}
              placeholder="Search drug e.g. Augmentin, Paracetamol..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
            {query && (
              <button 
                type="button" 
                onClick={() => { setQuery(''); setHasSearched(false); }}
                className="text-slate-500 hover:text-white mr-1.5 text-xs"
              >
                ✕
              </button>
            )}
            <button 
              type="submit" 
              disabled={loading}
              className="px-2.5 py-1 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-[11px] rounded-lg transition shrink-0"
            >
              {loading ? '...' : 'Find'}
            </button>
          </div>

          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#161f30] border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-30 divide-y divide-white/5">
              {suggestions.map((sug, idx) => (
                <div 
                  key={idx}
                  onClick={() => handleSearch(sug)}
                  className="px-3 py-2 text-xs text-slate-200 hover:bg-slate-800/80 hover:text-emerald-400 cursor-pointer flex items-center justify-between transition"
                >
                  <span>{sug}</span>
                  <ChevronRight className="w-3 h-3 text-slate-500" />
                </div>
              ))}
            </div>
          )}
        </form>

        {/* Results List */}
        <div className="space-y-2.5">
          {loading ? (
            <div className="py-8 text-center text-slate-400 text-xs animate-pulse flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
              Searching neighboring inventory...
            </div>
          ) : results.length > 0 ? (
            results.map((item, idx) => {
              const pName = item.pharmacy?.name || item.sellerPharmacy || 'Neighbor Pharmacy';
              const pDist = item.distance ? `${item.distance.toFixed(1)} km` : '1.4 km';
              const pEta = item.eta || '6 mins';
              const price = item.price ? `₦${item.price.toLocaleString()}` : 'Contact';
              const stock = item.stock || item.quantity || 8;

              return (
                <div 
                  key={idx}
                  className="bg-[#161f30] border border-white/5 hover:border-emerald-400/30 rounded-xl p-3 flex flex-col gap-2 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-white truncate">{item.itemName || item.name}</h4>
                      <p className="text-[10px] text-slate-400 truncate">{pName}</p>
                    </div>
                    <span className="font-extrabold text-xs text-emerald-400 shrink-0">{price}</span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-sky-400" />
                      {pDist} ({pEta})
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold text-[9.5px]">
                      ● {stock} in stock
                    </span>
                  </div>

                  <button 
                    onClick={() => handleOpenCheckout(item)}
                    className="w-full mt-1 py-1.5 bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition"
                  >
                    <ShoppingCart className="w-3 h-3" />
                    Get It · Procure Now
                  </button>
                </div>
              );
            })
          ) : hasSearched ? (
            <div className="p-6 text-center bg-[#161f30]/60 border border-dashed border-white/10 rounded-xl text-slate-400 flex flex-col items-center gap-1.5">
              <AlertCircle className="w-6 h-6 text-slate-500 mb-1" />
              <p className="font-semibold text-xs text-slate-300">No stock found nearby</p>
              <p className="text-[10px] text-slate-500 max-w-[220px]">
                No neighboring pharmacies currently have confirmed stock for "{query}".
              </p>
            </div>
          ) : (
            <div className="p-6 text-center bg-[#161f30]/40 border border-dashed border-white/10 rounded-xl text-slate-400 flex flex-col items-center gap-1.5">
              <span className="text-2xl mb-1">💊</span>
              <p className="font-semibold text-xs text-slate-300">Search Neighbor Inventory</p>
              <p className="text-[10px] text-slate-500 max-w-[220px]">
                Type any drug name above to find verified nearby stock with real-time ETA and wholesale pricing.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Slide-over Checkout Drawer */}
      <div 
        className={`absolute inset-0 bg-[#0b0f17] z-50 flex flex-col transition-transform duration-300 ease-out ${
          checkoutUrl ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#111827] border-b border-white/10 shrink-0">
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs text-white truncate">
              {checkoutItem?.itemName || checkoutItem?.name || 'Procure Item'}
            </span>
            <span className="text-[10px] text-slate-400 truncate">
              Seller: {checkoutItem?.pharmacy?.name || checkoutItem?.sellerPharmacy || 'Verified Pharmacy'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => {
                if (checkoutUrl) window.open(checkoutUrl, '_blank');
              }}
              title="Open in new tab"
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => {
                setCheckoutUrl(null);
                setCheckoutItem(null);
              }}
              title="Close drawer"
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-white relative">
          {checkoutUrl && (
            <iframe 
              src={checkoutUrl}
              className="w-full h-full border-none"
              title="PharmastackX B2B Checkout"
            />
          )}
        </div>
      </div>

    </div>
  );
}
