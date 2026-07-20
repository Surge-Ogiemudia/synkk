import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import OrdersTab from './OrdersTab';
import LeadsTab from './LeadsTab';
import { auth } from '@/lib/auth';

export default function OrdersAndLeadsTab() {
  const slug = auth.getProfile()?.slug || '';
  const [searchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'leads'>(
    searchParams.get('tab') === 'leads' ? 'leads' : 'orders'
  );

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'leads' || tabParam === 'orders') {
      setActiveSubTab(tabParam);
    }
  }, [searchParams]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col h-full p-6 overflow-y-auto">
      <div className="flex gap-4 mb-6 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('orders')}
          className={`pb-2 px-1 font-semibold text-sm transition-colors border-b-2 ${
            activeSubTab === 'orders'
              ? 'text-emerald-400 border-emerald-400'
              : 'text-slate-500 hover:text-slate-300 border-transparent'
          }`}
        >
          Online Orders
        </button>
        <button
          onClick={() => setActiveSubTab('leads')}
          className={`pb-2 px-1 font-semibold text-sm transition-colors border-b-2 ${
            activeSubTab === 'leads'
              ? 'text-emerald-400 border-emerald-400'
              : 'text-slate-500 hover:text-slate-300 border-transparent'
          }`}
        >
          Patient Leads
        </button>
      </div>

      <div className="flex-1 w-full bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6 shadow-inner overflow-hidden flex flex-col">
        {activeSubTab === 'orders' ? <OrdersTab slug={slug} /> : <LeadsTab />}
      </div>
    </div>
  );
}
