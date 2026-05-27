import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Globe, ArrowRight, MapPin, Check, ChevronLeft } from 'lucide-react';

export default function StorefrontSetup() {
  const navigate = useNavigate();
  const [name, setName] = useState('My Pharmacy');
  const [slug, setSlug] = useState('my-pharmacy');
  const [slugEdited, setSlugEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [originalSlug, setOriginalSlug] = useState('');

  React.useEffect(() => {
    const fetchStorefront = async () => {
      try {
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        const savedStorefront = await ipcRenderer.invoke('get-storefront-data');
        if (savedStorefront) {
          if (savedStorefront.name) setName(savedStorefront.name);
          if (savedStorefront.slug) {
             setSlug(savedStorefront.slug);
             setOriginalSlug(savedStorefront.slug);
          }
        }
      } catch (e) {
        console.error("Failed to load storefront data", e);
      }
    };
    fetchStorefront();
  }, []);
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  const handleSyncLocation = () => {
    setIsLocating(true);
    setLocationError('');
    
    // First try HTML5 Geolocation (more accurate but might be blocked)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoordinates({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setIsLocating(false);
        },
        async (error) => {
          console.log("HTML5 Geolocation failed, falling back to IP location", error);
          await fallbackToIpLocation();
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      fallbackToIpLocation();
    }
  };

  const fallbackToIpLocation = async () => {
    try {
      const response = await fetch('https://get.geojs.io/v1/ip/geo.json');
      const data = await response.json();
      if (data && data.latitude && data.longitude) {
        setCoordinates({
          lat: parseFloat(data.latitude),
          lng: parseFloat(data.longitude)
        });
      } else {
        throw new Error('Invalid IP location data');
      }
    } catch (e) {
      setLocationError("Failed to detect location. Please check your network or disable adblock.");
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <div className="w-full max-w-md px-6 flex flex-col relative">
      <button 
        onClick={() => navigate(-1)}
        className="absolute -top-12 left-6 text-slate-400 hover:text-white flex items-center gap-1 transition-colors text-sm font-medium"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex items-center gap-4 mb-8 mt-2">
        <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
          <Store className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Storefront Setup</h2>
          <p className="text-slate-400 text-sm">Configure your public facing presence</p>
        </div>
      </div>

      <div className="space-y-6 mb-8">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Pharmacy Name:</label>
          <input 
            type="text"
            value={name}
            onChange={(e) => {
              const newName = e.target.value;
              setName(newName);
              if (!slugEdited) {
                setSlug(newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
              }
            }}
            className="w-full bg-slate-900/50 border border-slate-700 focus:border-emerald-500 rounded-xl py-3 px-4 text-white outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Storefront Link:</label>
          <div className="flex items-center w-full bg-slate-900/50 border border-slate-700 focus-within:border-emerald-500 rounded-xl py-3 px-4 text-white transition-colors">
            <span className="text-emerald-500 mr-1">https://</span>
            <input 
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                setSlugEdited(true);
                setSetupError('');
              }}
              className="bg-transparent border-none outline-none w-full text-white placeholder-slate-500"
            />
            <span className="text-slate-400 ml-1">.psx.ng</span>
          </div>
          {setupError && <p className="text-red-400 text-xs mt-2">{setupError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Store Coordinates:</label>
          {coordinates ? (
            <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-3 px-4">
              <div className="flex items-center text-emerald-400 text-sm font-mono">
                <Check className="w-4 h-4 mr-2" />
                {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
              </div>
              <button onClick={() => setCoordinates(null)} className="text-xs text-slate-400 hover:text-white">Clear</button>
            </div>
          ) : (
            <button 
              onClick={handleSyncLocation}
              disabled={isLocating}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {isLocating ? (
                <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <MapPin className="w-5 h-5 text-emerald-400" />
              )}
              {isLocating ? "Getting Location..." : "Sync Pharmacy Coordinates"}
            </button>
          )}
          {locationError && <p className="text-red-400 text-xs mt-2">{locationError}</p>}
          <p className="text-slate-500 text-xs mt-2 italic">
            * Please ensure you are doing this action from your actual pharmacy site to ensure accurate delivery routing.
          </p>
        </div>
      </div>

      <button 
        onClick={async () => {
          if (!slug) {
            setSetupError("Storefront link cannot be empty.");
            return;
          }
          setIsSaving(true);
          setSetupError('');
          try {
            if (originalSlug.startsWith('guest-')) {
              const response = await fetch('https://pharmastackx.com/api/auth-desktop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update-guest', oldSlug: originalSlug, newSlug: slug, pharmacyName: name })
              });
              const data = await response.json();
              if (!data.success) {
                setSetupError(data.error || 'Failed to update storefront settings.');
                setIsSaving(false);
                return;
              }
            }
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('save-storefront-data', { slug, name, coordinates });
            navigate('/done', { state: { slug, name, coordinates } });
          } catch (err) {
            console.error(err);
            setSetupError("Network error. Please try again.");
            setIsSaving(false);
          }
        }}
        disabled={isSaving}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Confirm & Launch"}
        {!isSaving && <ArrowRight className="w-5 h-5" />}
      </button>
    </div>
  );
}
