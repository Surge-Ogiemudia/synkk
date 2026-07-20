import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UploadCloud, Link as LinkIcon, Database, ArrowRight, ArrowLeft, HardDrive, Radio, Mail, Lock, User, Phone, Check, LogOut, Eye, EyeOff } from 'lucide-react';
import StorefrontSetup from './StorefrontSetup';
import BubbleMode from './BubbleMode';
import POSTypeSelector from './POSTypeSelector';
import ProcessWatcherOverlay from '../components/ProcessWatcherOverlay';

interface DiscoveredPOS {
  name: string;
  executablePath: string;
  type: string;
}

export default function Welcome() {
  const navigate = useNavigate();
  const location = useLocation();
  const autoFocusWebPos = location.state?.autoFocusWebPos;
  
  // Auth State
  const [authState, setAuthState] = useState<'email_check' | 'register' | 'login' | 'authenticated'>('email_check');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pharmacyName, setPharmacyName] = useState('');
  const [phone, setPhone] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Scanner State
  const [url, setUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [discoveredPOS, setDiscoveredPOS] = useState<DiscoveredPOS[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [isRequestingSupport, setIsRequestingSupport] = useState(false);

  // Epic 1: New onboarding flow state
  const [showPOSTypeSelector, setShowPOSTypeSelector] = useState(!!autoFocusWebPos);
  const [posNameHint, setPosNameHint] = useState('');
  const [showBubble, setShowBubble] = useState(false);
  const [showProcessWatcher, setShowProcessWatcher] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const existingStorefront = await ipcRenderer.invoke('get-storefront-data');
        if (existingStorefront && existingStorefront.slug && existingStorefront.slug !== 'unknown-slug') {
          const pairing = await ipcRenderer.invoke('get-pairing-data');
          if (pairing && pairing.posIdentifier) {
            navigate('/dashboard', { state: { slug: existingStorefront.slug, name: existingStorefront.name, coordinates: existingStorefront.coordinates } });
          } else {
            navigate('/dashboard');
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    if (autoFocusWebPos) {
      setIsScanning(false);
      return;
    }

    const scan = async () => {
      setIsScanning(true);
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const results = await ipcRenderer.invoke('scan-local-pos');
        setDiscoveredPOS(results);
      } catch (err) {
        console.error("Failed to scan for POS", err);
      } finally {
        setIsScanning(false);
      }
    };
    scan();
  }, [authState]);

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
    } catch (err) {
      setAuthError('Network error. Please try again.');
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
        const backendModules = await ipcRenderer.invoke('get-app-modules') || {};
        let targetPath = '/dashboard';
        if (backendModules.psxWeb === false) {
           if (backendModules.pos !== false) targetPath = '/dashboard/pos';
           else if (backendModules.emr !== false) targetPath = '/dashboard/emr';
           else if (backendModules.dispensary !== false) targetPath = '/dashboard/dispensary';
           else if (backendModules.orders !== false) targetPath = '/dashboard/orders';
           else if (backendModules.source !== false) targetPath = '/dashboard/source';
           else if (backendModules.staff !== false) targetPath = '/dashboard/staff';
           else if (backendModules.synkk !== false) targetPath = '/dashboard/synkk';
        }
        navigate(targetPath);
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
    if (!password || !pharmacyName || !phone) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      // Local slug generation (will be verified upon final launch)
      let baseSlug = pharmacyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('save-storefront-data', { 
        slug: baseSlug, 
        name: pharmacyName, 
        coordinates: null, 
        isNewUser: true,
        pendingRegistration: { email: email.toLowerCase(), password, phone }
      });
      navigate('/dashboard');
    } catch (err) {
      setAuthError('An error occurred. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGuestMode = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      // No slug or name yet, just flag as guest
      await ipcRenderer.invoke('save-storefront-data', { slug: '', name: '', coordinates: null, isGuest: true });
      navigate('/dashboard');
    } catch (err) {
      setAuthError('An error occurred. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0] as any;
      let filePath = file.path || file.name;
      navigate('/analysis', { state: { method: 'drop', filePath } });
    } else {
      alert("No valid files were detected in that drop.");
    }
  };

  const handlePaste = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) {
      let finalUrl = url.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
      }
      navigate('/web-scraper', { state: { url: finalUrl } });
    }
  };

  if (authState !== 'authenticated') {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-[90vh] animate-in fade-in zoom-in duration-500 px-4">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
            <Database className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold mb-3 tracking-tight text-white">
            Connect to <span className="gradient-text">PharmaStackX</span>
          </h1>
          <p className="text-slate-400 font-light max-w-sm mx-auto">
            Sign in to access your terminal.
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
                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-slate-700"></div>
                  <span className="flex-shrink-0 mx-4 text-slate-500 text-xs uppercase tracking-wider">Or</span>
                  <div className="flex-grow border-t border-slate-700"></div>
                </div>
                <button type="button" onClick={handleGuestMode} disabled={authLoading} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors border border-slate-700 disabled:opacity-50">
                  {authLoading ? 'Creating Guest...' : 'Continue as Guest'}
                </button>
              </form>
            )}

            {authState === 'login' && (
              <form onSubmit={handleLogin} className="flex flex-col gap-4 animate-in slide-in-from-right-4">
                <div className="flex items-center mb-4">
                  <button type="button" onClick={() => { setAuthState('email_check'); setAuthError(''); }} className="text-sm text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Email
                  </button>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-300">Welcome back!</span>
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

                <div className="relative flex items-center py-2 mt-2">
                  <div className="flex-grow border-t border-slate-700"></div>
                  <span className="flex-shrink-0 mx-4 text-slate-500 text-xs uppercase tracking-wider">Or</span>
                  <div className="flex-grow border-t border-slate-700"></div>
                </div>
                <button type="button" onClick={handleGuestMode} disabled={authLoading} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors border border-slate-700 disabled:opacity-50">
                  {authLoading ? 'Creating Guest...' : 'Continue as Guest'}
                </button>
              </form>
            )}

            {authState === 'register' && (
              <form onSubmit={handleRegister} className="flex flex-col gap-4 animate-in slide-in-from-right-4">
                <div className="flex items-center mb-4">
                  <button type="button" onClick={() => { setAuthState('email_check'); setAuthError(''); }} className="text-sm text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
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

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Create Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                      placeholder="••••••••" />
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

  return (
    <div className="flex flex-col items-center justify-center w-full animate-in fade-in zoom-in duration-500 pb-10 pt-10 px-4 relative">
      <button 
        onClick={async () => {
          // @ts-ignore
          const { ipcRenderer } = window.require('electron');
          await ipcRenderer.invoke('save-storefront-data', { slug: '', name: '', coordinates: null });
          setAuthState('email_check');
          setEmail('');
          setPassword('');
          setAuthError('');
        }}
        className="absolute top-4 right-4 text-slate-400 hover:text-white flex items-center gap-2 text-sm bg-slate-800/50 hover:bg-slate-800 px-4 py-2 rounded-xl transition-colors border border-slate-700/50"
      >
        <LogOut className="w-4 h-4" /> Sign Out
      </button>

      <div className="mb-14 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
          <Database className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-6xl font-extrabold mb-4 tracking-tight">
          Welcome to <span className="gradient-text">Synkk</span>
        </h1>
        {import.meta.env.DEV && (
          <button onClick={() => navigate('/setup')} className="bg-red-500/20 border border-red-500 hover:bg-red-500/40 text-red-100 font-bold py-3 px-6 rounded-xl mb-4 transition-colors">
            🚀 JUMP STRAIGHT TO SETUP (LOCAL DEV ONLY)
          </button>
        )}
        <p className="text-xl text-slate-400 font-light max-w-lg mx-auto">
          The silent catalog sync for modern pharmacies. No manual entry, no API configs. Just magic.
        </p>
      </div>

      {isScanning ? (
        <div className="w-full max-w-3xl mb-12 flex flex-col items-center justify-center py-6 animate-pulse">
           <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
           <p className="text-sm text-emerald-400/80">Synkk is scanning your system for POS software...</p>
        </div>
      ) : discoveredPOS.length > 0 && (
        <div className="w-full max-w-3xl mb-12 animate-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-xl font-medium text-white mb-4 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-emerald-400" />
            Auto-Discovered Systems
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            {discoveredPOS.map((pos, idx) => (
              <div 
                key={idx}
                onClick={() => navigate('/analysis', { state: { method: 'drop', filePath: pos.executablePath } })}
                className="glass-panel glass-panel-hover flex items-center p-6 rounded-2xl cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mr-4 shrink-0">
                  <Database className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <h3 className="text-lg font-medium text-white group-hover:text-emerald-400 transition-colors truncate">{pos.name}</h3>
                  <p className="text-xs text-slate-400 truncate w-full">{pos.executablePath}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all shrink-0 ml-2" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Epic 1: When scan finds nothing — show POS Type Selector */}
      {!isScanning && discoveredPOS.length === 0 && !showPOSTypeSelector && (
        <div className="w-full max-w-3xl mb-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="w-full bg-amber-500/8 border border-amber-500/20 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-400 mb-1">No POS detected automatically</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                Synkk scanned your system but couldn't find a local database. Let's connect a different way.
              </p>
              <button
                onClick={() => setShowPOSTypeSelector(true)}
                className="text-xs font-semibold px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded-lg transition-colors border border-amber-500/20 flex items-center gap-2"
              >
                Help Synkk find my POS <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Epic 1: POS Type Selector screen */}
      {(showPOSTypeSelector || autoFocusWebPos) && !showBubble && (
        <div className="w-full max-w-3xl mb-8 animate-in slide-in-from-bottom-4 duration-500">
          <POSTypeSelector
            initialWebPos={autoFocusWebPos}
            posName={posNameHint}
            setPosName={setPosNameHint}
            onBack={() => setShowPOSTypeSelector(false)}
            onSelect={async (type, webUrl) => {
              if (type === 'web-pos') {
                if (webUrl?.trim()) {
                  let finalUrl = webUrl.trim();
                  if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
                  navigate('/web-scraper', { state: { url: finalUrl } });
                }
              } else if (type === 'local-app') {
                // Trigger a deeper re-scan
                setShowPOSTypeSelector(false);
                setIsScanning(true);
                try {
                  // @ts-ignore
                  const { ipcRenderer } = window.require('electron');
                  const results = await ipcRenderer.invoke('scan-local-pos');
                  setDiscoveredPOS(results);
                  if (results.length === 0) {
                    // Start the process watcher!
                    setShowProcessWatcher(true);
                  }
                } catch (err) {
                  console.error(err);
                } finally {
                  setIsScanning(false);
                }
              } else {
                // 'unknown' — launch Bubble Mode Widget
                setShowPOSTypeSelector(false);
                // @ts-ignore
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.invoke('launch-bubble-widget', posNameHint);
              }
            }}
          />
        </div>
      )}

      {/* Support Section */}
      <div className="mt-12 mb-8 flex flex-col items-center w-full max-w-3xl">
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
              You have sent a request to admin about finding your POS and will be contacted shortly.
            </p>
          </div>
        ) : (
          <button 
            onClick={async () => {
              setIsRequestingSupport(true);
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              await ipcRenderer.invoke('request-support', { screen: 'Welcome' });
            }}
            className="text-slate-400 hover:text-emerald-400 transition-colors text-sm font-medium flex items-center gap-2 py-2 px-4 rounded-lg hover:bg-slate-800/50"
          >
            <Radio className="w-4 h-4" />
            Can't find your POS? Request Live Support
          </button>
        )}
      </div>

      {/* Epic 2: Process Watcher Overlay */}
      {showProcessWatcher && (
        <ProcessWatcherOverlay
          onCancel={() => {
            setShowProcessWatcher(false);
            setShowPOSTypeSelector(true);
          }}
          onSuccess={(dbPath) => {
            setShowProcessWatcher(false);
            navigate('/analysis', { state: { method: 'drop', filePath: dbPath } });
          }}
          onPivotToWeb={() => {
            setShowProcessWatcher(false);
            // Reopen POSTypeSelector and we could pass a prop to auto-select web-pos,
            // but for now, just reopening it is fine.
            setShowPOSTypeSelector(true);
          }}
        />
      )}

    </div>
  );
}
