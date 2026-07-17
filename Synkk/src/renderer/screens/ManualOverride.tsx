import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Database, Check, Radio } from 'lucide-react';

export default function ManualOverride() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathOrUrl = location.state?.pathOrUrl;

  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [columns, setColumns] = useState<string[]>([]);
  const [rawSample, setRawSample] = useState<any[]>([]);
  const [isRequestingSupport, setIsRequestingSupport] = useState(false);

  const [mapping, setMapping] = useState({
    nameCol: '',
    brandCol: '',
    qtyCol: '',
    priceCol: '',
    imageCol: ''
  });

  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!pathOrUrl) {
      setErrorMsg("Missing database path. Please restart the analysis.");
      return;
    }
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('get-database-tables', pathOrUrl).then((res: any) => {
      if (res.success && Array.isArray(res.tables)) {
        setTables(res.tables);
      } else {
        setErrorMsg("Failed to load tables: " + (res.error || 'Unknown error'));
        console.error("get-database-tables failed", res);
      }
    }).catch((err: any) => {
      setErrorMsg("IPC Error: " + err.message);
      console.error(err);
    });
  }, [pathOrUrl]);

  useEffect(() => {
    if (!selectedTable) return;
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('get-table-columns', pathOrUrl, selectedTable).then((res: any) => {
      if (res.success) setColumns(res.columns);
    });
    ipcRenderer.invoke('get-table-sample', pathOrUrl, selectedTable).then((res: any) => {
      if (res.success) setRawSample(res.rawSample);
    });
  }, [selectedTable, pathOrUrl]);

  const handleSave = async () => {
    if (!selectedTable || !mapping.nameCol || !mapping.qtyCol || !mapping.priceCol) {
      alert("Please select a table, name, quantity, and price column at minimum.");
      return;
    }
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    const finalMapping = {
      tableName: selectedTable,
      nameCol: mapping.nameCol,
      qtyCol: mapping.qtyCol,
      priceCol: mapping.priceCol,
      brandCol: mapping.brandCol || null,
      imageCol: mapping.imageCol || null,
      expiryCol: null
    };

    await ipcRenderer.invoke('save-learned-system', {
      posIdentifier: pathOrUrl,
      schemaMapping: finalMapping
    });
    navigate('/dashboard/synkk/setup', { state: { pathOrUrl } });
  };

  return (
    <div className={`w-full max-w-5xl px-6 flex flex-col relative pt-8 ${!selectedTable ? 'min-h-[90vh] pb-64' : 'pb-12'}`}>
      <button 
        onClick={() => navigate(-1)}
        className="absolute -top-6 left-6 text-slate-400 hover:text-white flex items-center gap-1 transition-colors text-sm font-medium"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex items-center gap-4 mb-8 mt-8">
        <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
          <Database className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Manual Override</h2>
          <p className="text-slate-400 text-sm">Select the correct table and columns for your inventory</p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl mb-6 flex items-center justify-between">
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-8 shadow-xl flex-shrink-0">
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">Inventory Table</label>
          <select 
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="">Select a table...</option>
            {tables.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {selectedTable && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {['nameCol', 'brandCol', 'qtyCol', 'priceCol', 'imageCol'].map((colKey) => (
              <div key={colKey}>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {colKey.replace('Col', '').toUpperCase()} {['nameCol', 'qtyCol', 'priceCol'].includes(colKey) && <span className="text-red-400">*</span>}
                </label>
                <select 
                  value={(mapping as any)[colKey]}
                  onChange={(e) => setMapping({...mapping, [colKey]: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="">None</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTable && rawSample.length > 0 && (
        <div className="w-full bg-slate-800 border border-slate-700 rounded-xl overflow-x-auto overscroll-x-none mb-8 shadow-xl flex-shrink-0">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-900/50">
              <tr>
                {mapping.nameCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Name ({mapping.nameCol})</th>}
                {mapping.brandCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Brand ({mapping.brandCol})</th>}
                {mapping.qtyCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Quantity ({mapping.qtyCol})</th>}
                {mapping.priceCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Price ({mapping.priceCol})</th>}
                {mapping.imageCol && <th className="px-6 py-4 text-sm font-semibold text-slate-300">Image ({mapping.imageCol})</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {rawSample.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                  {mapping.nameCol && <td className="px-6 py-4 text-white font-medium max-w-[200px] truncate">{item[mapping.nameCol] || 'N/A'}</td>}
                  {mapping.brandCol && <td className="px-6 py-4 text-slate-300 max-w-[150px] truncate">{item[mapping.brandCol] || 'N/A'}</td>}
                  {mapping.qtyCol && <td className="px-6 py-4 text-slate-300 max-w-[100px] truncate">{item[mapping.qtyCol] || 0}</td>}
                  {mapping.priceCol && <td className="px-6 py-4 text-emerald-400 font-medium max-w-[100px] truncate">{item[mapping.priceCol] || 0}</td>}
                  {mapping.imageCol && <td className="px-6 py-4 text-slate-300">
                    {item[mapping.imageCol] ? <img src={item[mapping.imageCol]} alt="Product" className="w-10 h-10 object-cover rounded" onError={(e) => (e.currentTarget.style.display = 'none')} /> : 'N/A'}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTable && (
        <button 
          onClick={handleSave}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors mt-8 mb-4 flex-shrink-0 shadow-lg shadow-emerald-500/20"
        >
          <Check className="w-5 h-5" />
          Confirm Mapping & Launch
        </button>
      )}

      {/* Support Section */}
      <div className="mt-4 mb-12 flex flex-col items-center flex-shrink-0">
        {isRequestingSupport ? (
          <div className="flex flex-col items-center justify-center p-5 bg-slate-800/80 rounded-2xl border border-emerald-500/30 w-full max-w-sm animate-in fade-in zoom-in duration-500">
            <div className="relative flex items-center justify-center mb-4 mt-1">
              {/* Radar waves */}
              <div className="absolute w-16 h-16 bg-emerald-500/20 rounded-full animate-ping"></div>
              <div className="absolute w-12 h-12 bg-emerald-500/40 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
              {/* Core Icon */}
              <div className="relative z-10 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                <Radio className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-emerald-400 font-bold text-base mb-1">Request Sent!</h3>
            <p className="text-slate-300 text-center text-xs leading-relaxed">
              You have sent a request to admin about your POS schema and will be contacted shortly.
            </p>
          </div>
        ) : (
          <button 
            onClick={async () => {
              setIsRequestingSupport(true);
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              await ipcRenderer.invoke('request-support', pathOrUrl);
            }}
            className="text-slate-400 hover:text-emerald-400 transition-colors text-sm font-medium flex items-center gap-2 py-2 px-4 rounded-lg hover:bg-slate-800/50"
          >
            <Radio className="w-4 h-4" />
            Confused? Request Live Support
          </button>
        )}
      </div>
    </div>
  );
}
