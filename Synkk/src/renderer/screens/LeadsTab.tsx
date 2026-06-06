import React, { useEffect, useState } from 'react';
import { UserPlus, CheckCircle2, XCircle, Clock, MapPin, Phone, Search, Calendar } from 'lucide-react';

export default function LeadsTab({ slug }: { slug: string }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Accepted' | 'Ignored'>('All');
  const [dateFilter, setDateFilter] = useState('');

  const fetchLeads = async () => {
    try {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      const data = await ipcRenderer.invoke('get-leads');
      setLeads(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();

    const handleRefresh = () => {
      fetchLeads();
    };

    window.addEventListener('refresh-leads-list', handleRefresh);

    return () => {
      window.removeEventListener('refresh-leads-list', handleRefresh);
    };
  }, []);

  const updateLeadStatus = async (leadId: string, status: string, items: any[]) => {
    // Optimistic UI update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
    
    if (status === 'accepted' || status === 'ignored') {
      setExpandedLeadId(leadId);
    }
    
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('update-lead-status', leadId, status);
    
    if (status === 'accepted') {
      try {
        await fetch('https://www.pharmastackx.com/api/synkk/requests/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pharmacySlug: slug,
            platformRequestId: leadId,
            items: items || []
          })
        });
      } catch (err) {
        console.error('Failed to send Accept response:', err);
      }
    }
  };

  if (loading) {
    return <div className="text-slate-400 py-10 text-center text-sm animate-pulse">Loading leads...</div>;
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <UserPlus className="w-12 h-12 mb-4 opacity-50" />
        <p>No WhatsApp leads yet.</p>
        <p className="text-xs mt-2 text-slate-600">Waiting for live requests...</p>
      </div>
    );
  }

  const renderLead = (lead: any) => {
    const isPending = lead.status === 'pending';
    const isAccepted = lead.status === 'accepted';
    const isExpanded = isPending || expandedLeadId === lead.id;
    
    // Mask phone number if pending or ignored
    let displayPhone = 'No phone number provided';
    if (lead.patientPhone) {
      if (isAccepted) {
        displayPhone = lead.patientPhone;
      } else {
        const p = lead.patientPhone;
        displayPhone = p.length > 6 ? `${p.substring(0, 4)}***${p.substring(p.length - 3)}` : '***';
      }
    }

    return (
      <div 
        key={lead.id} 
        onClick={() => {
          if (!isPending) {
            setExpandedLeadId(isExpanded ? null : lead.id);
          }
        }}
        className={`bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col relative overflow-hidden group ${!isPending ? 'opacity-90 cursor-pointer hover:border-slate-500 transition-colors' : ''}`}
      >
        <div className={`absolute top-0 left-0 w-1 h-full ${isAccepted ? 'bg-emerald-500' : lead.status === 'ignored' ? 'bg-slate-600' : 'bg-emerald-400 animate-pulse'}`} />
        
        <div className={`flex justify-between items-start ${isExpanded ? 'mb-3' : 'mb-0'}`}>
          <div>
            <h4 className="text-white font-semibold text-lg flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              WhatsApp Lead
            </h4>
            <div className="flex flex-col gap-1 mt-1">
              <p className="text-slate-400 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(lead.timestamp).toLocaleString()}
              </p>
              <p className="text-slate-400 text-xs flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {lead.location}
              </p>
            </div>
            {!isExpanded && !isPending && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider mt-2 inline-block ${isAccepted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {lead.status}
              </span>
            )}
          </div>
          {lead.hasStock ? (
             <span className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 uppercase tracking-wider">In Stock</span>
          ) : (
             <span className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500/20 text-amber-400 uppercase tracking-wider">Out of Stock</span>
          )}
        </div>

        {isExpanded && (
          <>
            <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-semibold">Requested Items</p>
          {lead.medicines?.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between text-sm py-1 border-b border-slate-800/50 last:border-0">
              <span className="text-slate-300">{item.name}</span>
            </div>
          ))}
        </div>

        {isPending ? (
          <div className="mt-auto space-y-3">
            <div className="flex items-center justify-center p-2 bg-slate-900/50 rounded border border-slate-700/50">
              <Phone className="w-4 h-4 text-slate-500 mr-2" />
              <span className="text-sm text-slate-400 tracking-widest">{displayPhone}</span>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={(e) => { e.stopPropagation(); updateLeadStatus(lead.id, 'ignored', lead.medicines); }}
                className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> Ignore
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); updateLeadStatus(lead.id, 'accepted', lead.medicines); }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                <CheckCircle2 className="w-4 h-4" /> Accept Lead
              </button>
            </div>
          </div>
        ) : isAccepted ? (
          <div className="flex flex-col w-full bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mt-auto">
            <div className="flex items-center text-emerald-400 font-bold mb-3">
              <CheckCircle2 className="w-5 h-5 mr-2" /> 
              Lead Accepted!
            </div>
            <p className="text-sm text-emerald-100 mb-4 leading-relaxed">
              Our sales team is connecting the two users. Here is the patient's phone number:
            </p>
            <div className="flex items-center justify-center p-3 bg-slate-900/80 rounded border border-emerald-500/30">
              <Phone className="w-5 h-5 text-emerald-400 mr-3" />
              <span className="text-lg text-white font-mono tracking-widest font-bold">{displayPhone}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col w-full bg-slate-800/50 rounded-lg p-3 mt-auto items-center justify-center">
            <p className="text-xs text-slate-500 font-medium">Ignored</p>
          </div>
        )}
          </>
        )}
      </div>
    );
  };

  const pendingLeads = leads.filter(l => l.status === 'pending');
  
  // Apply Filters to Processed Leads
  let processedLeads = leads.filter(l => l.status === 'accepted' || l.status === 'ignored');
  
  if (statusFilter !== 'All') {
    processedLeads = processedLeads.filter(l => l.status === statusFilter.toLowerCase());
  }
  
  if (dateFilter) {
    processedLeads = processedLeads.filter(l => {
      const leadDate = new Date(l.timestamp).toISOString().split('T')[0];
      return leadDate === dateFilter;
    });
  }

  if (searchQuery.trim() !== '') {
    const q = searchQuery.toLowerCase();
    processedLeads = processedLeads.filter(l => {
      const phone = (l.patientPhone || '').toLowerCase();
      const loc = (l.location || '').toLowerCase();
      const itemsMatch = l.medicines?.some((i: any) => i.name.toLowerCase().includes(q));
      return phone.includes(q) || loc.includes(q) || itemsMatch;
    });
  }

  const visibleProcessedLeads = processedLeads.slice(0, visibleCount);

  return (
    <div className="flex flex-col w-full space-y-8 pb-10">
      {/* Pending Leads Section */}
      <div className="space-y-4">
        {pendingLeads.map(renderLead)}
      </div>

      {/* Processed / Recent Leads Section */}
      {leads.some(l => l.status === 'accepted' || l.status === 'ignored') && (
        <div className="pt-6 border-t border-slate-700/50 space-y-4 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider pl-2">Recent Leads</h3>
          
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>
            <button 
              onClick={() => setStatusFilter(prev => prev === 'Accepted' ? 'All' : 'Accepted')}
              className={`flex items-center justify-center px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium whitespace-nowrap ${statusFilter === 'Accepted' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/20'}`}
              title="Filter Accepted"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Accepted
            </button>
            <button 
              onClick={() => setStatusFilter(prev => prev === 'Ignored' ? 'All' : 'Ignored')}
              className={`flex items-center justify-center px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium whitespace-nowrap ${statusFilter === 'Ignored' ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/20'}`}
              title="Filter Ignored"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" /> Ignored
            </button>
            <div className="relative shrink-0">
              <input 
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                style={{ colorScheme: 'dark' }}
              />
              <div className={`p-1.5 rounded-lg border flex items-center justify-center transition-colors ${dateFilter ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}>
                <Calendar className="w-4 h-4" />
              </div>
            </div>
          </div>
          
          {processedLeads.length === 0 ? (
            <p className="text-slate-500 text-center text-sm py-4">No results found for your filters.</p>
          ) : (
            visibleProcessedLeads.map(renderLead)
          )}
          
          {visibleCount < processedLeads.length && (
            <button 
              onClick={() => setVisibleCount(prev => prev + 3)}
              className="mt-4 py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors border border-slate-700 self-center"
            >
              Show More
            </button>
          )}
        </div>
      )}
    </div>
  );
}
