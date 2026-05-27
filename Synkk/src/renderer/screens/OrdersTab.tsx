import React, { useEffect, useState } from 'react';
import { Package, CheckCircle2, XCircle, Clock } from 'lucide-react';

export default function OrdersTab({ slug }: { slug: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const res = await fetch(`https://pharmastackx.com/api/orders/pending?slug=${slug}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    
    // Listen for live pushes to refresh immediately
    ipcRenderer.on('refresh-orders-list', () => {
      fetchOrders();
    });

    return () => {
      ipcRenderer.removeAllListeners('refresh-orders-list');
    };
  }, [slug]);

  const updateStatus = async (orderId: string, status: string) => {
    // Optimistic UI
    setOrders(prev => prev.filter(o => o._id !== orderId || status === 'Accepted'));
    if (status !== 'Accepted') {
      setOrders(prev => prev.filter(o => o._id !== orderId));
    } else {
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status: 'Accepted' } : o));
    }
    
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('update-order-status', orderId, status);
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

  return (
    <div className="flex flex-col w-full space-y-4 pb-10">
      {orders.map((order) => (
        <div key={order._id} className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col relative overflow-hidden group">
          {/* Status Indicator */}
          <div className={`absolute top-0 left-0 w-1 h-full ${order.status === 'Accepted' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          
          <div className="flex justify-between items-start mb-3">
            <div>
              <h4 className="text-white font-semibold text-lg">{order.user?.name || 'Guest'}</h4>
              <p className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {new Date(order.createdAt).toLocaleTimeString()}
              </p>
            </div>
            <span className="text-emerald-400 font-bold">₦{order.totalAmount?.toLocaleString()}</span>
          </div>

          <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
            {order.items?.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between text-sm py-1 border-b border-slate-800/50 last:border-0">
                <span className="text-slate-300"><span className="text-emerald-500 font-medium mr-1">{item.qty}x</span> {item.name}</span>
                <span className="text-slate-400">₦{(Number(item.price) * Number(item.qty)).toLocaleString()}</span>
              </div>
            ))}
          </div>

          {order.status === 'Pending' ? (
            <div className="flex gap-3 mt-auto">
              <button 
                onClick={() => updateStatus(order._id, 'Declined')}
                className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> Decline
              </button>
              <button 
                onClick={() => updateStatus(order._id, 'Accepted')}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                <CheckCircle2 className="w-4 h-4" /> Accept Order
              </button>
            </div>
          ) : (
             <div className="flex items-center justify-center w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 py-2 rounded-lg text-sm">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Accepted (Waiting for Rider)
             </div>
          )}
          
          {order.status === 'Pending' && (
            <p className="text-[10px] text-slate-500 mt-3 text-center">
              *If accepted, remember to ring these up in your POS to balance local stock.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
