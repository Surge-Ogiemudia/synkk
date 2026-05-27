import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, X, ChevronLeft } from 'lucide-react';

export default function Confirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const result = location.state?.result;
  const sampleData = result?.rawSample || [];

  return (
    <div className="w-full max-w-3xl px-6 flex flex-col items-center relative">
      <button 
        onClick={() => navigate('/')}
        className="absolute -top-12 left-0 text-slate-400 hover:text-white flex items-center gap-1 transition-colors text-sm font-medium"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <h2 className="text-3xl font-bold mb-2 text-white">We mapped your POS Schema.</h2>
      <p className="text-slate-400 mb-8">Does this sample look correct?</p>

      <div className="w-full bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-8 shadow-xl">
        <table className="w-full text-left">
          <thead className="bg-slate-900/50">
            <tr>
              {result?.schemaMapping?.nameCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Name ({result.schemaMapping.nameCol})</th>}
              {result?.schemaMapping?.brandCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Brand ({result.schemaMapping.brandCol})</th>}
              {result?.schemaMapping?.qtyCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Quantity ({result.schemaMapping.qtyCol})</th>}
              {result?.schemaMapping?.priceCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Price ({result.schemaMapping.priceCol})</th>}
              {result?.schemaMapping?.imageCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Image</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {sampleData.slice(0, 5).map((item: any, idx: number) => (
              <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                {result?.schemaMapping?.nameCol && <td className="px-6 py-4 text-white font-medium max-w-[200px] truncate" title={item[result.schemaMapping.nameCol]}>{item[result.schemaMapping.nameCol] || 'N/A'}</td>}
                {result?.schemaMapping?.brandCol && <td className="px-6 py-4 text-slate-300 max-w-[150px] truncate" title={item[result.schemaMapping.brandCol]}>{item[result.schemaMapping.brandCol] || 'N/A'}</td>}
                {result?.schemaMapping?.qtyCol && <td className="px-6 py-4 text-slate-300 max-w-[100px] truncate">{item[result.schemaMapping.qtyCol] || 0}</td>}
                {result?.schemaMapping?.priceCol && <td className="px-6 py-4 text-emerald-400 font-medium max-w-[100px] truncate">{item[result.schemaMapping.priceCol] || 0}</td>}
                {result?.schemaMapping?.imageCol && <td className="px-6 py-4 text-slate-300">
                  {item[result.schemaMapping.imageCol] ? (
                    <img src={item[result.schemaMapping.imageCol]} alt="Product" className="w-10 h-10 object-cover rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  ) : 'N/A'}
                </td>}
              </tr>
            ))}
            {sampleData.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">No sample data returned.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 w-full max-w-md">
        <button 
          onClick={async () => {
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('save-learned-system', {
              posIdentifier: location.state?.pathOrUrl,
              schemaMapping: result.schemaMapping
            });
            const store = await ipcRenderer.invoke('get-storefront-data');
            if (store?.isGuest) {
              navigate('/guest-auth');
            } else {
              navigate('/setup');
            }
          }}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Check className="w-5 h-5" />
          Yes, continue
        </button>
        <button 
          onClick={() => navigate('/override', { state: { pathOrUrl: location.state?.pathOrUrl } })}
          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 border border-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
          No, looks wrong
        </button>
      </div>
    </div>
  );
}
