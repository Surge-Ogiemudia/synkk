import React, { useEffect, useState } from 'react';
import { Package, CheckCircle2, XCircle, Clock, Search, Calendar } from 'lucide-react';

// Global cache to persist processed orders locally since the production API filters some out
const loadProcessedCache = () => {
  try {
    const cached = localStorage.getItem('synkk_processedOrders');
    if (cached) {
      return new Map<string, any>(Object.entries(JSON.parse(cached)));
    }
  } catch (e) {}
  return new Map<string, any>();
};

const saveProcessedCache = (map: Map<string, any>) => {
  try {
    localStorage.setItem('synkk_processedOrders', JSON.stringify(Object.fromEntries(map)));
  } catch (e) {}
};

const globalProcessedOrders = loadProcessedCache();

export default function OrdersTab({ slug }: { slug: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const res = await fetch(`https://www.pharmastackx.com/api/orders/pending?slug=${slug}`);
      const data = await res.json();
      if (data.success) {
        setOrders(prev => {
          // Keep our globally processed orders
          const processedList = Array.from(globalProcessedOrders.values());
          
          // Filter out fetched orders that we've already processed locally
          const fetchedPending = data.orders.filter((o: any) => 
            !globalProcessedOrders.has(o._id)
          );
          
          return [...fetchedPending, ...processedList].sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    const handleRefresh = () => {
      fetchOrders();
    };

    window.addEventListener('refresh-orders-list', handleRefresh);

    return () => {
      window.removeEventListener('refresh-orders-list', handleRefresh);
    };
  }, [slug]);

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Accepted' | 'Declined'>('All');
  const [dateFilter, setDateFilter] = useState('');

  const updateStatus = async (orderId: string, status: string) => {
    // Optimistic UI for instant feedback
    setOrders(prev => {
      const next = prev.map(o => o._id === orderId ? { ...o, status } : o);
      const modifiedOrder = next.find(o => o._id === orderId);
      if (modifiedOrder) {
        globalProcessedOrders.set(orderId, modifiedOrder);
        saveProcessedCache(globalProcessedOrders);
      }
      return next;
    });
    
    // Automatically expand a newly processed order so they can see the details
    if (status === 'Accepted' || status === 'Declined') {
      setExpandedOrderId(orderId);
    }
    
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    // Save to MongoDB via the Vercel API
    await ipcRenderer.invoke('update-order-status', orderId, status);
    // Fetch latest fresh data from MongoDB
    fetchOrders();
  };

  if (loading) {
    return <div className="text-slate-400 py-10 text-center text-sm animate-pulse">Loading orders...</div>;
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Package className="w-12 h-12 mb-4 opacity-50" />
        <p>No pending orders right now.</p>
        <p className="text-xs mt-2 text-slate-600">Waiting for live updates...</p>
      </div>
    );
  }

  const pendingOrders = orders.filter(o => o.status === 'Pending' || !o.status);
  
  // Apply Filters to Processed Orders
  let processedOrders = orders.filter(o => o.status === 'Accepted' || o.status === 'Declined');
  
  if (statusFilter !== 'All') {
    processedOrders = processedOrders.filter(o => o.status === statusFilter);
  }
  
  if (dateFilter) {
    processedOrders = processedOrders.filter(o => {
      const orderDate = new Date(o.createdAt).toISOString().split('T')[0];
      return orderDate === dateFilter;
    });
  }

  if (searchQuery.trim() !== '') {
    const q = searchQuery.toLowerCase();
    processedOrders = processedOrders.filter(o => {
      const name = (o.user?.name || 'Guest').toLowerCase();
      const phone = (o.phone || o.deliveryPhone || o.user?.phone || '').toLowerCase();
      const addr = (o.deliveryAddress || '').toLowerCase();
      const city = (o.deliveryCity || '').toLowerCase();
      const itemsMatch = o.items?.some((i: any) => i.name.toLowerCase().includes(q));
      
      return name.includes(q) || phone.includes(q) || addr.includes(q) || city.includes(q) || itemsMatch;
    });
  }

  const visibleProcessedOrders = processedOrders.slice(0, visibleCount);

  const renderOrder = (order: any) => {
    const isPending = order.status === 'Pending' || !order.status;
    const isExpanded = isPending || expandedOrderId === order._id;

    return (
      <div 
        key={order._id} 
        onClick={() => {
          if (!isPending) {
            setExpandedOrderId(isExpanded ? null : order._id);
          }
        }}
        className={`bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col relative overflow-hidden group ${!isPending ? 'opacity-90 cursor-pointer hover:border-slate-500 transition-colors' : ''}`}
      >
        {/* Status Indicator */}
        <div className={`absolute top-0 left-0 w-1 h-full ${order.status === 'Accepted' ? 'bg-emerald-500' : order.status === 'Declined' ? 'bg-rose-500' : 'bg-amber-500'}`} />
        
        <div className={`flex justify-between items-start ${isExpanded ? 'mb-3' : 'mb-0'}`}>
          <div>
            <h4 className="text-white font-semibold text-lg">{order.user?.name || 'Guest'}</h4>
            <div className="flex items-center gap-2">
              <p className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {new Date(order.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              {!isExpanded && !isPending && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${order.status === 'Accepted' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {order.status}
                </span>
              )}
            </div>
          </div>
          <span className="text-emerald-400 font-bold">₦{order.totalAmount?.toLocaleString()}</span>
        </div>

        {isExpanded && (
          <>
            <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
              {order.items?.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm py-1 border-b border-slate-800/50 last:border-0">
                  <span className="text-slate-300"><span className="text-emerald-500 font-medium mr-1">{item.qty}x</span> {item.name}</span>
                  <span className="text-slate-400">₦{(Number(item.price) * Number(item.qty)).toLocaleString()}</span>
                </div>
              ))}
            </div>

            {isPending ? (
              <div className="flex gap-3 mt-auto">
                <button 
                  onClick={(e) => { e.stopPropagation(); updateStatus(order._id, 'Declined'); }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> Decline
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); updateStatus(order._id, 'Accepted'); }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                  <CheckCircle2 className="w-4 h-4" /> Accept Order
                </button>
              </div>
            ) : order.status === 'Accepted' ? (
              <div className="flex flex-col w-full bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mt-auto">
                  <div className="flex items-center text-emerald-400 font-bold mb-3">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> 
                    Order Successfully Accepted
                  </div>
                  <p className="text-sm text-emerald-100 mb-4 leading-relaxed">
                    You have confirmed stock for <span className="font-bold">{order.items?.length || 0}</span> item(s). Please prepare them for pickup.
                  </p>
                  
                  <div className="bg-slate-900/50 rounded p-3 mb-4 border border-emerald-500/10">
                    <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-semibold">Customer Details</p>
                    <p className="text-sm text-slate-200 font-medium">{order.user?.name || 'Guest Customer'}</p>
                    <p className="text-sm text-slate-200 font-medium">{order.phone || order.deliveryPhone || order.user?.phone || 'No phone number provided'}</p>
                    {(order.deliveryAddress || order.deliveryCity) && (
                      <p className="text-sm text-slate-400 mt-1">
                        {order.deliveryAddress}{order.deliveryAddress && order.deliveryCity ? ', ' : ''}{order.deliveryCity}
                      </p>
                    )}
                  </div>
                  
                  <p className="text-xs text-emerald-400/80 italic text-center">
                    A Pharmastackx customer rep will contact you soon to follow through with the order.
                  </p>
              </div>
            ) : (
              <div className="flex flex-col w-full bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 mt-auto items-center justify-center">
                  <div className="flex items-center text-rose-400 font-bold mb-1">
                    <XCircle className="w-5 h-5 mr-2" /> 
                    Order Declined
                  </div>
                  <p className="text-xs text-rose-300/80 text-center mt-2">
                    You have declined this order. The customer and Pharmastackx have been notified.
                  </p>
              </div>
            )}
            
            {isPending && (
              <p className="text-[10px] text-slate-500 mt-3 text-center">
                *If accepted, remember to ring these up in your POS to balance local stock.
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full space-y-8 pb-10">
      
      {/* Pending Orders Section */}
      <div className="space-y-4">
        {pendingOrders.map(renderOrder)}
      </div>

      {/* Processed / Recent Activity Section */}
      {orders.some(o => o.status === 'Accepted' || o.status === 'Declined') && (
        <div className="pt-6 border-t border-slate-700/50 space-y-4 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider pl-2">Recent Activity</h3>
          
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text"
                placeholder="Search orders..."
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
              onClick={() => setStatusFilter(prev => prev === 'Declined' ? 'All' : 'Declined')}
              className={`flex items-center justify-center px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium whitespace-nowrap ${statusFilter === 'Declined' ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/20'}`}
              title="Filter Declined"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" /> Declined
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
          
          {processedOrders.length === 0 ? (
            <p className="text-slate-500 text-center text-sm py-4">No results found for your filters.</p>
          ) : (
            visibleProcessedOrders.map(renderOrder)
          )}
          
          {visibleCount < processedOrders.length && (
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
