import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Lock, User, Check, Eye, EyeOff, Database, Loader2, AlertCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getTerminalModules } from '@/lib/api';
import { bridgeLogin } from '@/lib/sso';

type Stage = 'identifier' | 'login' | 'register' | 'register_success' | 'connecting';

export default function Login() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pharmacyName, setPharmacyName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ssoProgress, setSsoProgress] = useState<Record<string, 'connecting' | 'success' | 'failed'>>({});

  useEffect(() => {
    if (auth.hasSession()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleCheckIdentifier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) return;
    setLoading(true);
    setError('');
    try {
      const { exists } = await auth.checkIdentifier(identifier);
      setStage(exists ? 'login' : 'register');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    const result = await auth.login(identifier, password);
    if (result.ok) {
      const modules = await getTerminalModules();
      
      const servicesToConnect: ('pos' | 'emr')[] = [];
      if (modules.pos !== false || modules.staff !== false) servicesToConnect.push('pos');
      if (modules.emr !== false || modules.dispensary !== false) servicesToConnect.push('emr');

      if (servicesToConnect.length > 0) {
        setStage('connecting');
        const token = auth.getSessionToken() || '';
        await bridgeLogin(token, servicesToConnect, (service, status) => {
          setSsoProgress(prev => ({ ...prev, [service]: status }));
        });
      }
      
      let targetPath = '/dashboard';
      if (modules.psxWeb === false) {
        if (modules.pos !== false) targetPath = '/dashboard/pos';
        else if (modules.emr !== false) targetPath = '/dashboard/emr';
        else if (modules.dispensary !== false) targetPath = '/dashboard/dispensary';
        else if (modules.orders !== false) targetPath = '/dashboard/orders';
        else if (modules.source !== false) targetPath = '/dashboard/source';
        else if (modules.staff !== false) targetPath = '/dashboard/staff';
      }
      setLoading(false);
      navigate(targetPath);
    } else {
      setLoading(false);
      setError(result.error || 'Login failed.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !pharmacyName || !phone) return;
    setLoading(true);
    setError('');
    const result = await auth.register(identifier, password, pharmacyName, phone);
    setLoading(false);
    if (result.ok) {
      setStage('register_success');
    } else {
      setError(result.error || 'Registration failed.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen animate-in fade-in zoom-in duration-500 px-4 relative overflow-hidden">
      <div className="blob bg-emerald-500/20 w-[600px] h-[600px] top-[-10%] left-[-10%] fixed pointer-events-none"></div>
      <div className="blob bg-cyan-500/20 w-[500px] h-[500px] bottom-[-20%] right-[-10%] fixed pointer-events-none" style={{ animationDelay: '2s' }}></div>

      <div className="relative z-10 mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
          <Database className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold mb-3 tracking-tight text-white">
          Connect to <span className="gradient-text">PharmaStackX</span>
        </h1>
        <p className="text-slate-400 font-light max-w-sm mx-auto">Sign in to access your terminal.</p>
      </div>

      <div className="relative z-10 w-full max-w-md glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-50"></div>

        <div className="relative z-10">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
              {error}
            </div>
          )}

          {stage === 'identifier' && (
            <form onSubmit={handleCheckIdentifier} className="flex flex-col gap-4 animate-in slide-in-from-bottom-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email or Phone Number</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="pharmacy@example.com or 080..."
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors mt-2 disabled:opacity-50"
              >
                {loading ? 'Checking...' : 'Continue'} <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {stage === 'login' && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4 animate-in slide-in-from-right-4">
              <button
                type="button"
                onClick={() => { setStage('identifier'); setError(''); }}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-12 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors mt-2 disabled:opacity-50"
              >
                {loading ? 'Logging in...' : 'Log In'} <Check className="w-4 h-4" />
              </button>
            </form>
          )}

          {stage === 'register' && (
            <form onSubmit={handleRegister} className="flex flex-col gap-4 animate-in slide-in-from-right-4">
              <div className="flex items-center mb-4">
                <button
                  type="button"
                  onClick={() => { setStage('identifier'); setError(''); }}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Email
                </button>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">Create your account</span>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Pharmacy Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={pharmacyName}
                    onChange={(e) => setPharmacyName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="e.g. HealthPlus Pharmacy"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="+234..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Create Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-12 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors mt-2 disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Create Account & Connect'} <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {stage === 'register_success' && (
            <div className="flex flex-col gap-6 animate-in zoom-in-95 duration-500 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <Check className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white">Account Created!</h2>
              <p className="text-slate-300 text-sm leading-relaxed max-w-[280px] mx-auto">
                We've sent a verification link to <span className="text-white font-medium">{identifier}</span>. 
                Please check your inbox and verify your email before logging in.
              </p>
              <button
                onClick={() => { setStage('identifier'); setIdentifier(''); setPassword(''); }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center transition-colors border border-slate-700 mt-2"
              >
                Return to Login
              </button>
            </div>
          )}

          {stage === 'connecting' && (
            <div className="flex flex-col gap-6 animate-in zoom-in-95 duration-500 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <Database className="w-8 h-8 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-white">Connecting Services</h2>
              <p className="text-slate-300 text-sm leading-relaxed max-w-[280px] mx-auto">
                Logging you in across your terminal modules...
              </p>
              
              <div className="flex flex-col gap-3 mt-4 text-left bg-black/40 p-4 rounded-xl border border-white/10">
                {/* PSX Web is always instantly connected on successful login */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">PSX Web</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Check className="w-4 h-4" /> Connected
                  </span>
                </div>

                {Object.keys(ssoProgress).includes('pos') && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">POS Register</span>
                    {ssoProgress['pos'] === 'connecting' && (
                      <span className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Connecting...
                      </span>
                    )}
                    {ssoProgress['pos'] === 'success' && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Check className="w-4 h-4" /> Connected
                      </span>
                    )}
                    {ssoProgress['pos'] === 'failed' && (
                      <span className="flex items-center gap-1 text-red-400">
                        <AlertCircle className="w-4 h-4" /> Failed
                      </span>
                    )}
                  </div>
                )}

                {Object.keys(ssoProgress).includes('emr') && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">EMR Terminal</span>
                    {ssoProgress['emr'] === 'connecting' && (
                      <span className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Connecting...
                      </span>
                    )}
                    {ssoProgress['emr'] === 'success' && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Check className="w-4 h-4" /> Connected
                      </span>
                    )}
                    {ssoProgress['emr'] === 'failed' && (
                      <span className="flex items-center gap-1 text-red-400">
                        <AlertCircle className="w-4 h-4" /> Failed
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
