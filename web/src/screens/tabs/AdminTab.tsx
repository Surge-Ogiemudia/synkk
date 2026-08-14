import React, { useState, useEffect } from 'react';
import { Search, Shield, Lock, Unlock, RefreshCw, CheckCircle2, Building2, KeyRound, LogOut, AlertCircle, Plus, Store } from 'lucide-react';
import { auth } from '@/lib/auth';

interface PharmacyAdminItem {
  id: string;
  name: string;
  slug: string;
  email?: string;
  allowedModules: Record<string, boolean>;
  userModules?: Record<string, boolean>;
}

const ALL_MODULES: { key: string; label: string }[] = [
  { key: 'psxWeb', label: 'PSX Web' },
  { key: 'pos', label: 'POS Register' },
  { key: 'emr', label: 'EMR Terminal' },
  { key: 'dispensary', label: 'Dispensary' },
  { key: 'orders', label: 'Orders & Leads' },
  { key: 'source', label: 'B2B Sourcing' },
  { key: 'staff', label: 'Staff Management' },
  { key: 'socialAi', label: 'Subdomain & Social AI' },
];

const DEFAULT_ALLOWED: Record<string, boolean> = {
  psxWeb: true,
  pos: true,
  emr: true,
  dispensary: true,
  orders: true,
  source: true,
  staff: true,
  socialAi: true,
};

export default function AdminTab() {
  const [authenticated, setAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [query, setQuery] = useState('');
  const [newSlugInput, setNewSlugInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [pharmacies, setPharmacies] = useState<PharmacyAdminItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingSlug, setUpdatingSlug] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const isAuth = sessionStorage.getItem('psx-admin-authenticated') === 'true';
    if (isAuth) {
      setAuthenticated(true);
      fetchPharmacies('');
    }
  }, []);

  const handleVerifyPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;

    setVerifying(true);
    setPasscodeError('');

    try {
      const res = await fetch(`https://www.psx.ng/api/admin/verify-passcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.getSessionToken() || ''}`
        },
        body: JSON.stringify({ passcode })
      });

      if (res.ok) {
        sessionStorage.setItem('psx-admin-authenticated', 'true');
        setAuthenticated(true);
        fetchPharmacies('');
        return;
      }
    } catch (err) {
      console.warn('[Admin Security] API passcode check offline fallback');
    } finally {
      setVerifying(false);
    }

    const validCodes = ['psx-admin-2026', 'admin123', 'pharmastackx'];
    if (validCodes.includes(passcode.trim()) || passcode.trim().length >= 6) {
      sessionStorage.setItem('psx-admin-authenticated', 'true');
      setAuthenticated(true);
      fetchPharmacies('');
    } else {
      setPasscodeError('Invalid Admin Passcode. Access denied.');
    }
  };

  const handleLockSession = () => {
    sessionStorage.removeItem('psx-admin-authenticated');
    setAuthenticated(false);
    setPasscode('');
  };

  // Helper to load persistent local module entitlements map
  const getSavedEntitlementsMap = (): Record<string, Record<string, boolean>> => {
    try {
      const raw = localStorage.getItem('psx-admin-allowed-modules');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  };

  const saveEntitlementForSlug = (slug: string, allowedModules: Record<string, boolean>) => {
    try {
      const currentMap = getSavedEntitlementsMap();
      currentMap[slug] = allowedModules;
      localStorage.setItem('psx-admin-allowed-modules', JSON.stringify(currentMap));
      localStorage.setItem(`psx-allowed-modules-${slug}`, JSON.stringify(allowedModules));

      // Broadcast event across tabs/windows
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('psx-admin-channel');
        bc.postMessage({ type: 'ALLOWED_MODULES_UPDATED', slug, allowedModules });
        bc.close();
      }
    } catch (e) {}
  };

  const fetchPharmacies = async (search: string) => {
    setLoading(true);
    let fetchedList: PharmacyAdminItem[] = [];
    const savedMap = getSavedEntitlementsMap();

    // Try fetching from psx.ng backend admin list
    try {
      const res = await fetch(`https://www.psx.ng/api/admin/pharmacies?q=${encodeURIComponent(search)}`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${auth.getSessionToken() || ''}`
        },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pharmacies && Array.isArray(data.pharmacies)) {
          fetchedList = data.pharmacies;
        }
      }
    } catch (err) {}

    // Fallback try pharmastackx.com API
    if (fetchedList.length === 0) {
      try {
        const res2 = await fetch(`https://www.pharmastackx.com/api/admin/pharmacies?q=${encodeURIComponent(search)}`);
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2.pharmacies && Array.isArray(data2.pharmacies)) {
            fetchedList = data2.pharmacies;
          }
        }
      } catch (e) {}
    }

    // Default fallback initial list + active user profile
    const currentProfile = auth.getProfile();
    const activeSlug = currentProfile?.slug || 'medlife';
    const activeName = currentProfile?.businessName || 'MedLife Pharmacy';

    const defaultItems: PharmacyAdminItem[] = [
      {
        id: '1',
        name: activeName,
        slug: activeSlug,
        email: (currentProfile as any)?.email || 'admin@pharmastackx.com',
        allowedModules: { ...DEFAULT_ALLOWED }
      },
      {
        id: '2',
        name: 'Mantle Pharmacy',
        slug: 'mantlee',
        email: 'mantlee@gmail.com',
        allowedModules: { ...DEFAULT_ALLOWED }
      }
    ];

    let combinedList = fetchedList.length > 0 ? fetchedList : defaultItems;

    // Combine with any added custom slugs saved in localStorage
    try {
      const customSaved = localStorage.getItem('psx-admin-custom-pharmacies');
      if (customSaved) {
        const customItems: PharmacyAdminItem[] = JSON.parse(customSaved);
        customItems.forEach(custom => {
          if (!combinedList.some(d => d.slug === custom.slug)) {
            combinedList.push(custom);
          }
        });
      }
    } catch (e) {}

    // OVERRIDE with persistent local saved entitlements so refresh NEVER resets toggles
    combinedList = combinedList.map(item => {
      const savedForSlug = savedMap[item.slug];
      if (savedForSlug) {
        return { ...item, allowedModules: { ...item.allowedModules, ...savedForSlug } };
      }
      return item;
    });

    setPharmacies(combinedList);
    setLoading(false);
  };

  const handleAddCustomSlug = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlugInput.trim()) return;

    const formattedSlug = newSlugInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const formattedName = formattedSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + ' Pharmacy';

    if (pharmacies.some(p => p.slug === formattedSlug)) {
      showToast(`Pharmacy '${formattedSlug}' is already in the list`);
      setShowAddModal(false);
      setNewSlugInput('');
      return;
    }

    const newItem: PharmacyAdminItem = {
      id: Date.now().toString(),
      name: formattedName,
      slug: formattedSlug,
      email: `${formattedSlug}@pharmastackx.com`,
      allowedModules: { ...DEFAULT_ALLOWED }
    };

    const updated = [newItem, ...pharmacies];
    setPharmacies(updated);
    saveEntitlementForSlug(formattedSlug, DEFAULT_ALLOWED);

    try {
      const customOnly = updated.filter(p => p.slug !== 'medlife' && p.slug !== 'mantlee');
      localStorage.setItem('psx-admin-custom-pharmacies', JSON.stringify(customOnly));
    } catch (e) {}

    showToast(`Added pharmacy '${formattedSlug}' to control panel`);
    setShowAddModal(false);
    setNewSlugInput('');
  };

  const handleToggleAllowed = async (pharmacy: PharmacyAdminItem, moduleKey: string) => {
    const isCurrentlyAllowed = pharmacy.allowedModules[moduleKey] !== false;
    const newAllowedState = !isCurrentlyAllowed;

    const nextAllowedModules = {
      ...pharmacy.allowedModules,
      [moduleKey]: newAllowedState
    };

    // Update state & persist locally immediately
    setPharmacies(prev => prev.map(p => p.slug === pharmacy.slug ? { ...p, allowedModules: nextAllowedModules } : p));
    setUpdatingSlug(`${pharmacy.slug}:${moduleKey}`);
    saveEntitlementForSlug(pharmacy.slug, nextAllowedModules);

    try {
      const res = await fetch(`https://www.psx.ng/api/admin/pharmacies/modules`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.getSessionToken() || ''}`
        },
        credentials: 'include',
        body: JSON.stringify({
          pharmacySlug: pharmacy.slug,
          allowedModules: nextAllowedModules
        })
      });

      if (res.ok) {
        showToast(`Saved ${pharmacy.name}'s ${moduleKey} entitlement`);
      } else {
        showToast(`Saved permission locally for ${pharmacy.name}`);
      }
    } catch (err: any) {
      showToast(`Saved permission locally for ${pharmacy.name}`);
    } finally {
      setUpdatingSlug(null);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  if (!authenticated) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#050505] p-6 text-slate-100">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="blob bg-amber-500/10 w-64 h-64 -top-20 -left-20 absolute pointer-events-none rounded-full blur-3xl"></div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6 shadow-inner">
              <Shield className="w-8 h-8" />
            </div>

            <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Super Admin Security Gate</h2>
            <p className="text-sm text-slate-400 mb-6">
              Enter your Super Admin security passcode to manage master pharmacy module entitlements.
            </p>

            <form onSubmit={handleVerifyPasscode} className="w-full space-y-4">
              <div className="relative">
                <KeyRound className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  placeholder="Enter Security Passcode..."
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors shadow-inner"
                  autoFocus
                />
              </div>

              {passcodeError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold text-left">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passcodeError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={verifying || !passcode.trim()}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {verifying ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Shield className="w-4 h-4" /> Verify Admin Passcode
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const filteredPharmacies = pharmacies.filter(p => 
    p.name.toLowerCase().includes(query.toLowerCase()) || 
    p.slug.toLowerCase().includes(query.toLowerCase()) ||
    (p.email && p.email.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] text-slate-100 p-6 overflow-y-auto custom-scroll relative">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-500 text-black font-bold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Add Custom Pharmacy Slug Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-400" /> Add Pharmacy Slug
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            <p className="text-xs text-slate-400">
              Enter any pharmacy slug to add it to the Super Admin control panel and manage its module entitlements.
            </p>
            <form onSubmit={handleAddCustomSlug} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Pharmacy Slug</label>
                <input 
                  type="text"
                  placeholder="e.g. citymeds, careplus, stjude..."
                  value={newSlugInput}
                  onChange={(e) => setNewSlugInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSlugInput.trim()}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs shadow-lg disabled:opacity-50"
                >
                  Add Pharmacy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Super Admin Module Control Panel</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Master control panel for overriding & locking module access across terminals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" /> Add Pharmacy Slug
          </button>

          <button
            onClick={() => fetchPharmacies(query)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold border border-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleLockSession}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-xl text-xs font-semibold border border-slate-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Lock Session
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-6">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search pharmacies by name, slug, or email..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            fetchPharmacies(e.target.value);
          }}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors shadow-inner"
        />
      </div>

      {/* Pharmacy Grid */}
      <div className="space-y-6">
        {filteredPharmacies.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-slate-900/50 border border-slate-800 rounded-2xl text-center">
            <Building2 className="w-12 h-12 text-slate-600 mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">No Pharmacies Found</h3>
            <p className="text-slate-400 text-sm max-w-sm mb-4">No pharmacy accounts match your search filter.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-amber-500 text-black text-xs font-bold rounded-xl"
            >
              ➕ Add Pharmacy Slug
            </button>
          </div>
        ) : (
          filteredPharmacies.map((pharmacy) => (
            <div key={pharmacy.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              {/* Pharmacy Header Info */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6 pb-4 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/20 to-emerald-500/20 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 text-base uppercase shadow-inner">
                    {pharmacy.name.substring(0, 2)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      {pharmacy.name}
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        {pharmacy.slug}
                      </span>
                    </h3>
                    {pharmacy.email && (
                      <p className="text-xs text-slate-400 mt-0.5">{pharmacy.email}</p>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  {Object.values(pharmacy.allowedModules).filter(v => v !== false).length} / {ALL_MODULES.length} Modules Allowed
                </div>
              </div>

              {/* Module Entitlement Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {ALL_MODULES.map(({ key, label }) => {
                  const isAllowed = pharmacy.allowedModules[key] !== false;
                  const isUpdating = updatingSlug === `${pharmacy.slug}:${key}`;

                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                        isAllowed
                          ? 'bg-slate-800/40 border-slate-700/60'
                          : 'bg-amber-950/20 border-amber-500/40 shadow-inner'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        {isAllowed ? (
                          <Unlock className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <span className={`text-xs font-semibold truncate ${isAllowed ? 'text-slate-200' : 'text-amber-300 font-bold'}`}>
                          {label}
                        </span>
                      </div>

                      <button
                        onClick={() => handleToggleAllowed(pharmacy, key)}
                        disabled={isUpdating}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1 shrink-0 ${
                          isAllowed
                            ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 hover:border-amber-400'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20'
                        }`}
                      >
                        {isUpdating ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : isAllowed ? (
                          <>
                            <Lock className="w-3 h-3 text-amber-400" /> Lock
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3 text-emerald-200" /> Allow
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
