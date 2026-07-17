import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Lock, User, Phone, Mail, Check, Eye, EyeOff } from 'lucide-react';

export default function GuestAuth() {
  const navigate = useNavigate();
  const location = useLocation();

  const [authState, setAuthState] = useState<'email_check' | 'register' | 'login'>('email_check');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pharmacyName, setPharmacyName] = useState('');
  const [phone, setPhone] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const [city, setCity] = useState('');

  const NIGERIAN_STATES = [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
    "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja", "Gombe",
    "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
    "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
    "Taraba", "Yobe", "Zamfara"
  ];

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const isEmail = email.includes('@');
      const res = await fetch('https://www.psx.ng/api/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: isEmail ? email : undefined,
          phoneNumber: !isEmail ? email : undefined 
        })
      });
      const data = await res.json();
      if (data.exists) {
        setAuthState('login');
      } else {
        setAuthState('register');
      }
    } catch (err: any) {
      setAuthError(`Network error: ${err.message || 'Please try again'}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !email) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const isEmail = email.includes('@');
      const res = await fetch('https://www.psx.ng/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: isEmail ? email : undefined,
          phoneNumber: !isEmail ? email : undefined,
          password 
        })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('set-session-cookie', { token: data.token });
        await ipcRenderer.invoke('save-storefront-data', { 
          slug: data.user.slug || 'local', 
          name: data.user.businessName || 'My Pharmacy', 
          staffName: data.user.name || data.user.email,
          role: data.user.role,
          phone: data.user.phoneNumber || '',
          coordinates: null, 
          isNewUser: false 
        });
        await ipcRenderer.invoke('save-psx-credentials', { email, password });
        navigate('/dashboard/synkk/setup');
      } else {
        setAuthError(data.error || 'Login failed.');
      }
    } catch (err: any) {
      setAuthError(`Network error: ${err.message || 'Please try again'}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !pharmacyName || !phone || !selectedState || !city) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      let baseSlug = pharmacyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('save-storefront-data', {
        slug: baseSlug,
        name: pharmacyName,
        coordinates: null,
        isNewUser: true,
        pendingRegistration: { email: email.toLowerCase(), password, phone, state: selectedState, city }
      });
      await ipcRenderer.invoke('save-psx-credentials', { email: email.toLowerCase(), password });
      navigate('/dashboard/synkk/setup');
    } catch (err) {
      setAuthError('An error occurred. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[90vh] animate-in fade-in zoom-in duration-500 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold mb-3 text-white">
          Almost there!
        </h1>
        <p className="text-slate-400 font-light max-w-sm mx-auto">
          We found your POS data. Now let's secure your connection to build your storefront.
        </p>
      </div>

      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-50"></div>
        
        <div className="relative z-10">
          {authError && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
              {authError}
            </div>
          )}

          {authState === 'email_check' && (
            <form onSubmit={handleCheckEmail} className="flex flex-col gap-4 animate-in slide-in-from-bottom-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email or Phone Number</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input type="text" required value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="pharmacy@example.com or 080..." />
                </div>
              </div>
              <button type="submit" disabled={authLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors mt-2 disabled:opacity-50">
                {authLoading ? 'Checking...' : 'Continue'} <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {authState === 'login' && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4 animate-in slide-in-from-right-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">Welcome back!</span>
                <button type="button" onClick={() => setAuthState('email_check')} className="text-xs text-emerald-400 hover:underline">Change Email</button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-12 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 z-50 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer bg-transparent border-none outline-none flex items-center justify-center">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={authLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors mt-2 disabled:opacity-50">
                {authLoading ? 'Logging in...' : 'Log In & Connect'} <Check className="w-4 h-4" />
              </button>
            </form>
          )}

          {authState === 'register' && (
            <form onSubmit={handleRegister} className="flex flex-col gap-4 animate-in slide-in-from-right-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">Create your account</span>
                <button type="button" onClick={() => setAuthState('email_check')} className="text-xs text-emerald-400 hover:underline">Change Email</button>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Pharmacy Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input type="text" required value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="e.g. HealthPlus Pharmacy" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="+234..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">State</label>
                  <select required value={selectedState} onChange={(e) => setSelectedState(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all appearance-none">
                    <option value="" disabled>Select state</option>
                    {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">City</label>
                  <input type="text" required value={city} onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="e.g. Ikeja" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Create Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-12 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 z-50 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer bg-transparent border-none outline-none flex items-center justify-center">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={authLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors mt-2 disabled:opacity-50">
                {authLoading ? 'Creating account...' : 'Create Account & Connect'} <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
