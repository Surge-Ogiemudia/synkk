import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, Box, AlertCircle, ShoppingCart } from 'lucide-react';

export default function SourceTab({ slug }: { slug: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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
      const data = await ipcRenderer.invoke('search-source', { query: searchQuery, exclude: slug });
      
      // Filter out their own pharmacy from the results (they can't source from themselves)
      if (data.success) {
        // Assume the backend could return their own slug, we should filter it out conceptually,
        // but the backend didn't return the slug in the result object, it just returned pharmacy info.
        // It's a minor detail, but usually they wouldn't search for something they have.
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

  return (
    <div className="flex flex-col w-full h-[500px]">
      
      {/* Descriptive Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white mb-2">B2B Sourcing</h2>
        <p className="text-slate-400 text-sm">
          To help patients check which nearest pharmacy has the medicine they need.
        </p>
      </div>

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
                    <span className="leading-tight max-w-[200px]">{item.pharmacy.businessAddress || item.pharmacy.state || 'Address hidden'}</span>
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
                  onClick={() => {
                    // @ts-ignore
                    const { ipcRenderer } = window.require('electron');
                    const url = `https://www.pharmastackx.com/?view=confirmOrder&action=checkout&item=${encodeURIComponent(item.itemName)}&price=${item.price || 0}&seller=${encodeURIComponent(item.pharmacy.slug || item.pharmacy.name)}&buyer=${encodeURIComponent(slug)}`;
                    ipcRenderer.send('open-checkout-window', url);
                  }}
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
    </div>
  );
}
