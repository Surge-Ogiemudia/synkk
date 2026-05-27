import React, { useState } from 'react';
import { Search, MapPin, Phone, Box, AlertCircle } from 'lucide-react';

export default function SourceTab({ slug }: { slug: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`https://pharmastackx.com/api/source?query=${encodeURIComponent(query)}&exclude=${encodeURIComponent(slug)}`);
      const data = await res.json();
      
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
          onChange={(e) => setQuery(e.target.value)}
        />
        <button 
          type="submit" 
          disabled={loading || query.length < 3}
          className="absolute inset-y-1.5 right-1.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Searching...' : 'Find'}
        </button>
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
            {/* Future Feature: Broadcast Button */}
            <button className="mt-4 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-sm transition-colors">
              Broadcast Request to WhatsApp Group (Coming Soon)
            </button>
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
            </div>
            
            <div className="bg-slate-900/50 rounded-lg p-3 mt-auto">
              <p className="text-sm text-slate-200 font-medium mb-1">{item.pharmacy.name}</p>
              
              <div className="flex items-start gap-2 text-xs text-slate-400 mb-2">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
                <span className="leading-tight">{item.pharmacy.address || item.pharmacy.state || 'Address hidden'}</span>
              </div>
              
              <a 
                href={`tel:+${item.pharmacy.phone}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 mt-1"
              >
                <Phone className="w-3.5 h-3.5" /> 
                {item.pharmacy.phone ? `+${item.pharmacy.phone}` : 'Contact hidden'}
              </a>
            </div>
            
          </div>
        ))}
      </div>
    </div>
  );
}
