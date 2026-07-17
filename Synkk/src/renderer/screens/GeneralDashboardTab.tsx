import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Activity, Box, Search, Settings, TrendingUp, Clock, Database, ChevronRight, CheckCircle2 } from 'lucide-react';

export default function GeneralDashboardTab() {
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState('Pharmacy');
  const [isSynced, setIsSynced] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const storefront = await ipcRenderer.invoke('get-storefront-data');
        if (storefront?.name) setStoreName(storefront.name);
        
        const pairing = await ipcRenderer.invoke('get-pairing-data');
        setIsSynced(!!pairing?.posIdentifier);
      } catch (e) {
        console.error(e);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="w-full h-full p-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1">
            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">{storeName}</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {isSynced && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isSynced ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            {isSynced ? 'System Online & Synced' : 'Action Required: Connect POS'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Today's Date</p>
            <p className="text-sm font-medium text-slate-300">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* Metric 1 */}
        <div className="relative group bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.1)] hover:-translate-y-1">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ShoppingCart className="w-16 h-16 text-emerald-400" />
          </div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Box className="w-5 h-5" />
            </div>
            <span className="flex items-center text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
              <TrendingUp className="w-3 h-3 mr-1" /> +12%
            </span>
          </div>
          <div className="relative z-10">
            <h3 className="text-slate-400 text-sm font-medium mb-1">Online Orders (Today)</h3>
            <p className="text-3xl font-bold text-white">0</p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="relative group bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 transition-all duration-300 hover:border-cyan-500/30 hover:shadow-[0_0_30px_rgba(6,182,212,0.1)] hover:-translate-y-1">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Search className="w-16 h-16 text-cyan-400" />
          </div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Activity className="w-5 h-5" />
            </div>
            <span className="flex items-center text-xs font-semibold text-cyan-400 bg-cyan-400/10 px-2 py-1 rounded-full">
              Live
            </span>
          </div>
          <div className="relative z-10">
            <h3 className="text-slate-400 text-sm font-medium mb-1">Active Leads</h3>
            <p className="text-3xl font-bold text-white">0</p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="relative group bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 transition-all duration-300 hover:border-purple-500/30 hover:shadow-[0_0_30px_rgba(168,85,247,0.1)] hover:-translate-y-1">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Database className="w-16 h-16 text-purple-400" />
          </div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="relative z-10">
            <h3 className="text-slate-400 text-sm font-medium mb-1">Synced Catalog Items</h3>
            <p className="text-3xl font-bold text-white">{isSynced ? '10,245' : '0'}</p>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* System Health / Main Actions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-400" />
              Quick Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <button onClick={() => navigate('/dashboard/orders')} className="group flex items-start gap-4 p-4 rounded-xl border border-slate-800 bg-slate-800/20 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors shrink-0">
                  <ShoppingCart className="w-5 h-5 text-slate-400 group-hover:text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">Process Orders</h4>
                  <p className="text-xs text-slate-500 mt-1">Review and fulfill online purchases.</p>
                </div>
              </button>

              <button onClick={() => navigate('/dashboard/source')} className="group flex items-start gap-4 p-4 rounded-xl border border-slate-800 bg-slate-800/20 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors shrink-0">
                  <Search className="w-5 h-5 text-slate-400 group-hover:text-cyan-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors">Patient Sourcing</h4>
                  <p className="text-xs text-slate-500 mt-1">Respond to nearby medicine requests.</p>
                </div>
              </button>

              <button onClick={() => navigate('/dashboard/dispensary')} className="group flex items-start gap-4 p-4 rounded-xl border border-slate-800 bg-slate-800/20 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors shrink-0">
                  <Activity className="w-5 h-5 text-slate-400 group-hover:text-blue-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-200 group-hover:text-blue-400 transition-colors">Dispensary</h4>
                  <p className="text-xs text-slate-500 mt-1">Manage and audit your inventory.</p>
                </div>
              </button>

              <button onClick={() => navigate('/dashboard/synkk')} className="group flex items-start gap-4 p-4 rounded-xl border border-slate-800 bg-slate-800/20 hover:bg-purple-500/10 hover:border-purple-500/30 transition-all text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors shrink-0">
                  <Settings className="w-5 h-5 text-slate-400 group-hover:text-purple-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-200 group-hover:text-purple-400 transition-colors">Synkk Engine</h4>
                  <p className="text-xs text-slate-500 mt-1">Configure sync tools and POS connection.</p>
                </div>
              </button>

            </div>
          </div>
        </div>

        {/* Recent Activity Sidebar */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              Recent Activity
            </h2>
          </div>
          
          <div className="flex-1 flex flex-col justify-center items-center text-center opacity-50 py-10">
            <div className="w-12 h-12 rounded-full border border-dashed border-slate-600 flex items-center justify-center mb-3">
              <Activity className="w-5 h-5 text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-400 mb-1">No recent activity</p>
            <p className="text-xs text-slate-500 max-w-[200px]">New orders, leads, and system events will appear here.</p>
          </div>

          <button onClick={() => navigate('/dashboard/orders')} className="mt-auto w-full py-3 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors border border-transparent hover:border-slate-700">
            View All Activity <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>

    </div>
  );
}
