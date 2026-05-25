import React from 'react';
import { 
  Activity, 
  Store, 
  Package, 
  Eye, 
  ShoppingCart, 
  DollarSign, 
  AlertTriangle 
} from 'lucide-react';
import clientPromise from '@/lib/mongodb';

// Ensure this page is dynamically rendered on every request to fetch fresh data
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  // Connect to DB and fetch knowledge_base collection
  const client = await clientPromise;
  const db = client.db('synkk_db');
  
  // In our architecture, the knowledge_base collection stores the paired pharmacies
  const rawPharmacies = await db.collection('knowledge_base').find({}).toArray();
  
  // Transform DB docs into UI-friendly shapes
  // Fallback to defaults if a pharmacy's sync data is missing (e.g. newly paired)
  const pharmacies = rawPharmacies.map((doc, idx) => ({
    id: doc._id.toString(),
    name: doc.pharmacyName || \`Pharmacy #\${idx + 1}\`,
    location: doc.location || 'Unknown Location',
    pos: doc.posIdentifier || 'Unknown POS',
    date: doc.installDate ? new Date(doc.installDate).toLocaleDateString() : 'Recent',
    lastSync: doc.lastUpdated ? new Date(doc.lastUpdated).toLocaleString() : 'Never',
    status: doc.status || 'green', // Should be 'green', 'amber', or 'red'
    medicines: doc.medicinesCount || 0,
    views: doc.storefrontViews || 0,
    orders: doc.totalOrders || 0,
    rev: doc.revenueShare || '₦0'
  }));

  // Aggregate stats based on real data
  const totalPharmacies = pharmacies.length;
  const totalMedicines = pharmacies.reduce((acc, curr) => acc + curr.medicines, 0);
  const totalViews = pharmacies.reduce((acc, curr) => acc + curr.views, 0);
  const totalOrders = pharmacies.reduce((acc, curr) => acc + curr.orders, 0);
  
  // Number of offline/failing systems
  const systemsDown = pharmacies.filter(p => p.status === 'red').length;

  const stats = [
    { label: 'Total Pharmacies', value: totalPharmacies.toString(), icon: Store, color: 'text-blue-400' },
    { label: 'Total Medicines', value: totalMedicines.toLocaleString(), icon: Package, color: 'text-emerald-400' },
    { label: 'Storefront Views', value: totalViews.toLocaleString(), icon: Eye, color: 'text-purple-400' },
    { label: 'Total Orders', value: totalOrders.toLocaleString(), icon: ShoppingCart, color: 'text-pink-400' },
    { label: 'Revenue Share', value: '₦' + (totalOrders * 500).toLocaleString(), icon: DollarSign, color: 'text-amber-400' }, // Mock calculation
    { label: 'Avg Sync Freq', value: 'Real-time', icon: Activity, color: 'text-sky-400' },
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Synkk Founder Dashboard</h1>
            <p className="text-slate-400">Monitor all connected pharmacies and sync health across the network.</p>
          </div>
          {systemsDown > 0 && (
            <div className="flex items-center gap-4 bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl shadow-sm">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className="text-sm font-medium text-slate-300">{systemsDown} System{systemsDown > 1 ? 's' : ''} Down</span>
              </div>
            </div>
          )}
        </header>

        {/* Analytics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 flex items-center justify-between hover:bg-slate-800 transition-colors">
                <div>
                  <p className="text-slate-400 text-sm font-medium mb-1">{stat.label}</p>
                  <h3 className="text-3xl font-bold text-white">{stat.value}</h3>
                </div>
                <div className={`p-4 rounded-xl bg-slate-900/50 ${stat.color}`}>
                  <Icon className="w-8 h-8" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Pharmacy Table */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Connected Pharmacies</h2>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Search pharmacies..." 
                className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              <button className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Filter
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {pharmacies.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <p>No pharmacies found in the database. When a pharmacy completes the pairing flow in the Synkk app, they will appear here.</p>
              </div>
            ) : (
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pharmacy</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">POS Software</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Sync</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Medicines</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {pharmacies.map((pharm) => (
                    <tr key={pharm.id} className="hover:bg-slate-700/30 transition-colors cursor-pointer">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full ${
                            pharm.status === 'green' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 
                            pharm.status === 'amber' ? 'bg-amber-500' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                          }`}></div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{pharm.name}</div>
                        <div className="text-xs text-slate-400">{pharm.location} • Joined {pharm.date}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-900 text-slate-300 border border-slate-700">
                          {pharm.pos}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300">
                        {pharm.lastSync}
                        {pharm.status === 'red' && <AlertTriangle className="w-4 h-4 inline ml-2 text-red-400" />}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-200 text-right">
                        {pharm.medicines.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-emerald-400 text-right">
                        {pharm.rev}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}
