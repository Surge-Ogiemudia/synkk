import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Globe, ArrowRight, MapPin, Check, ChevronLeft } from 'lucide-react';

export default function StorefrontSetup() {
  const navigate = useNavigate();
  const [name, setName] = useState('My Pharmacy');
  const [slug, setSlug] = useState('my-pharmacy');
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  const handleSyncLocation = () => {
    setIsLocating(true);
    setLocationError('');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoordinates({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setIsLocating(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setLocationError("Failed to get location. Please allow location access.");
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationError("Geolocation is not supported by your browser.");
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
          <label className="block text-sm font-medium text-slate-300 mb-2">What is your pharmacy name?</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Choose your storefront link:</label>
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500/50">
            <span className="pl-4 pr-2 py-3 bg-slate-900/50 text-slate-500 text-sm flex items-center">
              <Globe className="w-4 h-4 mr-2" />
              https://
            </span>
            <input 
              type="text" 
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="flex-1 bg-transparent py-3 px-2 text-emerald-400 focus:outline-none text-left"
            />
            <span className="pr-4 py-3 bg-transparent text-slate-500 text-sm">
              .psx.ng
            </span>
          </div>
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
        onClick={() => navigate('/done', { state: { slug, name, coordinates } })}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
      >
        Confirm & Launch
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}
