import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Globe, Copy, ExternalLink, Coins, RefreshCw, 
  Leaf, BookOpen, Layers, Target, Edit3, Image as ImageIcon,
  Check, ArrowRight, Download, Calendar, Layers3, Settings,
  Lock, Sliders, Upload, Plus, Trash2, Megaphone, X, MessageSquare
} from 'lucide-react';
import { auth } from '@/lib/auth';

interface SocialPostItem {
  id: string;
  pillar: 'wellness' | 'education' | 'pairs' | 'spotlight' | 'custom';
  title?: string;
  caption: string;
  imageUrls: string[];
  hashtags: string[];
  productLink?: string;
  featuredProducts?: Array<{ name: string; price: number; image?: string }>;
  tokenCost: number;
  createdAt: string;
  isSpecialRequest?: boolean;
}

export default function SocialMediaTab() {
  const [slug, setSlug] = useState('medlife');
  const [businessName, setBusinessName] = useState('Medlife Pharmacy');
  const [tokenInfo, setTokenInfo] = useState({
    weeklyTokens: 4,
    extraTokens: 0,
    totalAvailable: 4
  });
  const [posts, setPosts] = useState<SocialPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Daily Briefing state
  const [briefingData, setBriefingData] = useState<any>(null);
  const [showManualOverride, setShowManualOverride] = useState(false);

  // Brand Settings Modal state
  const [showBrandSettings, setShowBrandSettings] = useState(false);
  const [brandTone, setBrandTone] = useState('warm');
  const [showPrices, setShowPrices] = useState(true);
  const [targetAudience, setTargetAudience] = useState('');
  const [visualStyle, setVisualStyle] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Special Request Modal state
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const [specialBrief, setSpecialBrief] = useState('');
  const [specialImages, setSpecialImages] = useState<Array<{ data: string; mimeType: string; preview: string }>>([]);
  const [generatingSpecial, setGeneratingSpecial] = useState(false);

  // Regenerate Modal state
  const [regenPostId, setRegenPostId] = useState<string | null>(null);
  const [regenReason, setRegenReason] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  // Generation Modal state
  const [selectedPillar, setSelectedPillar] = useState<'wellness' | 'education' | 'pairs' | 'spotlight' | 'custom'>('wellness');
  const [customPrompt, setCustomPrompt] = useState('');
  const [activeGeneratedPost, setActiveGeneratedPost] = useState<SocialPostItem | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    // Fetch stored pharmacy slug
    const profile = auth.getProfile();
    if (profile?.slug) {
      setSlug(profile.slug);
      if (profile.businessName) setBusinessName(profile.businessName);
      fetchData(profile.slug);
    } else {
      fetchData('medlife');
    }
  }, []);

  const getApiUrl = (endpoint: string) => {
    return `http://localhost:3000${endpoint}`;
  };

  const fetchData = async (pharmacySlug: string) => {
    setLoading(true);
    try {
      let res;
      try {
        res = await fetch(`http://localhost:3000/api/social/posts?slug=${pharmacySlug}`);
        if (!res.ok) throw new Error('Local server not found');
      } catch (e) {
        res = await fetch(`https://www.psx.ng/api/social/posts?slug=${pharmacySlug}`);
      }

      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch(e) {}

      if (data.success) {
        setTokenInfo(data.socialTokens);
        setPosts(data.posts || []);
      }

      // Fetch Briefing
      let briefRes;
      try {
        briefRes = await fetch(`http://localhost:3000/api/social/briefing?pharmacy_slug=${pharmacySlug}`);
        if (!briefRes.ok) throw new Error('Local server not found');
      } catch (e) {
        briefRes = await fetch(`https://www.psx.ng/api/social/briefing?pharmacy_slug=${pharmacySlug}`);
      }
      const briefText = await briefRes.text();
      try {
        const briefData = JSON.parse(briefText);
        if (briefData.success) {
          setBriefingData(briefData);
          if (briefData.recommendedPillar) {
            setSelectedPillar(briefData.recommendedPillar);
          }
        }
      } catch(e) {}
    } catch (err) {
      console.error('Failed to fetch social posts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBrandSettings = async () => {
    setSavingSettings(true);
    try {
      let res;
      const body = JSON.stringify({
        pharmacy_slug: slug,
        brandContext: {
          tone: brandTone,
          showPrices,
          audience: targetAudience,
          visualStyle
        }
      });
      try {
        res = await fetch('http://localhost:3000/api/account', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body
        });
      } catch(e) {
        res = await fetch('https://www.psx.ng/api/account', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body
        });
      }
      setShowBrandSettings(false);
      fetchData(slug); // Refresh briefing with new brand context
    } catch(err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      let res;
      try {
        res = await fetch('http://localhost:3000/api/social/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pharmacy_slug: slug,
            pillar: selectedPillar,
            customPrompt: selectedPillar === 'custom' ? customPrompt : undefined
          })
        });
        if (!res.ok && res.status === 404) throw new Error('Local route 404');
      } catch (e) {
        res = await fetch('https://www.psx.ng/api/social/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pharmacy_slug: slug,
            pillar: selectedPillar,
            customPrompt: selectedPillar === 'custom' ? customPrompt : undefined
          })
        });
      }

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('API server is compiling. Please try again in a moment.');
      }

      if (data.success) {
        setActiveGeneratedPost(data.post);
        setTokenInfo({
          weeklyTokens: data.socialTokens.weeklyTokens,
          extraTokens: data.socialTokens.extraTokens,
          totalAvailable: data.remainingTokens
        });
        setPosts(prev => [data.post, ...prev]);
        setActiveSlide(0);
      } else {
        alert(data.error || 'Failed to generate content.');
      }
    } catch (err: any) {
      alert('Generation error: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3 - specialImages.length);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const base64 = dataUrl.split(',')[1];
        setSpecialImages(prev => [...prev, { data: base64, mimeType: file.type, preview: dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGenerateSpecial = async () => {
    if (!specialBrief.trim()) return;
    setGeneratingSpecial(true);
    try {
      let res;
      const payload = {
        pharmacy_slug: slug,
        customPrompt: specialBrief.trim(),
        attachments: specialImages.map(img => ({ data: img.data, mimeType: img.mimeType }))
      };

      try {
        res = await fetch('http://localhost:3000/api/social/generate-special-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch(e) {
        res = await fetch('https://www.psx.ng/api/social/generate-special-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (data.post || data.success) {
        const newPost = data.post || data;
        setActiveGeneratedPost(newPost);
        setPosts(prev => [newPost, ...prev]);
        setShowSpecialModal(false);
        setSpecialBrief('');
        setSpecialImages([]);
      } else {
        alert(data.message || 'Failed to generate custom post.');
      }
    } catch (err: any) {
      alert('Error generating custom post: ' + err.message);
    } finally {
      setGeneratingSpecial(false);
    }
  };

  const handleRegeneratePost = async () => {
    if (!regenPostId || !regenReason.trim()) return;
    setRegenerating(true);
    try {
      let res;
      try {
        res = await fetch('http://localhost:3000/api/social/regenerate-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: regenPostId, reason: regenReason })
        });
      } catch(e) {
        res = await fetch('https://www.psx.ng/api/social/regenerate-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: regenPostId, reason: regenReason })
        });
      }
      const data = await res.json();
      if (data.post) {
        setPosts(prev => prev.map(p => p.id === regenPostId ? data.post : p));
        if (activeGeneratedPost?.id === regenPostId) setActiveGeneratedPost(data.post);
        setRegenPostId(null);
        setRegenReason('');
      }
    } catch(err: any) {
      alert('Regeneration error: ' + err.message);
    } finally {
      setRegenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const pillarsList = [
    {
      id: 'wellness',
      title: '🌿 Wellness & Lifestyle',
      cost: 1,
      badge: '1 Token',
      desc: 'Skincare, dietary supplements, and daily energy advice.'
    },
    {
      id: 'education',
      title: '📚 Health Educator Carousel',
      cost: 3,
      badge: '3 Tokens (3 Slides)',
      desc: '3-slide myth-busting carousel with expert advice.'
    },
    {
      id: 'pairs',
      title: '🤝 Perfect Pairs Combo',
      cost: 2,
      badge: '2 Tokens',
      desc: 'Cross-sell two complementary drugs/supplements together.'
    },
    {
      id: 'spotlight',
      title: '🎯 Product Spotlight',
      cost: 1,
      badge: '1 Token',
      desc: 'Feature high-stock in-store medicines with live price.'
    },
    {
      id: 'custom',
      title: '✍️ Custom Announcement',
      cost: 1,
      badge: '1 Token',
      desc: 'Describe any custom promo, holiday schedule, or news.'
    }
  ];

  const proFeatures = [
    { icon: '🎥', title: 'Video Reels', desc: 'Auto-scripted 15s Instagram Reels with voiceover notes.' },
    { icon: '🎠', title: 'Multi-Slide Carousels', desc: '5-slide educational series formatted for Instagram.' },
    { icon: '⚡', title: 'Auto-Publishing', desc: 'Direct scheduling & auto-posting to Meta Graph API.' },
    { icon: '📊', title: 'Reach & ROI Analytics', desc: 'Track sales conversions directly from posted links.' }
  ];

  return (
    <div className="w-full max-w-5xl mx-auto p-6 space-y-8 text-slate-100 pb-24">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Synkk Social AI Engine
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{businessName} Content Hub</h1>
          <p className="text-sm text-slate-400">
            Manage your brand voice, store photos, and generate high-converting social media posts.
          </p>
        </div>

        {/* Brand Settings & Subdomain Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBrandSettings(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition"
          >
            <Settings className="w-4 h-4 text-emerald-400" /> Brand Tone & Rules
          </button>

          <button
            onClick={() => setShowSpecialModal(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition"
          >
            <Megaphone className="w-4 h-4" /> Custom Brief + Photos
          </button>
        </div>
      </div>

      {/* Token Balance Counter Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Weekly Token Balance</p>
            <p className="text-3xl font-extrabold text-white mt-1 flex items-center gap-2">
              <Coins className="w-6 h-6 text-amber-400" />
              {tokenInfo.totalAvailable} <span className="text-xs text-slate-400 font-normal">/ 4 Free Tokens</span>
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
            Resets Mondays
          </span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Generated Posts</p>
            <p className="text-3xl font-extrabold text-emerald-400 mt-1">{posts.length}</p>
          </div>
          <ImageIcon className="w-6 h-6 text-emerald-400/50" />
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Live Storefront</p>
            <p className="text-sm font-semibold text-emerald-300 mt-1 font-mono">{slug}.psx.ng</p>
          </div>
          <button
            onClick={() => fetchData(slug)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh Tokens & Posts"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Daily Briefing Section */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950/20 border border-emerald-500/30 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" /> Today's Briefing
            </h2>
            <p className="text-xs text-slate-400 mt-1">Your AI teammate has analyzed your inventory, calendar, and past posts.</p>
          </div>
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-500/40">
            {new Date().toLocaleDateString('en-US', { weekday: 'long' })} Strategy
          </span>
        </div>

        {briefingData ? (
          <div className="p-5 rounded-xl bg-slate-950/50 border border-slate-800/80 shadow-inner">
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {briefingData.briefing}
            </p>
            
            {(briefingData.recommendedProducts?.length > 0 || briefingData.upcomingEvents?.length > 0) && (
              <div className="mt-4 pt-4 border-t border-slate-800/50 grid grid-cols-1 md:grid-cols-2 gap-4">
                {briefingData.recommendedProducts?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">🔥 Inventory Insight</span>
                    <ul className="text-xs text-slate-300 space-y-1">
                      {briefingData.recommendedProducts.map((p: any) => (
                        <li key={p._id || p.itemName} className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-emerald-400" /> {p.itemName} (High Stock)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {briefingData.upcomingEvents?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">🗓️ Upcoming Health Dates</span>
                    <ul className="text-xs text-amber-200/80 space-y-1">
                      {briefingData.upcomingEvents.map((e: any) => (
                        <li key={e.name} className="flex items-center gap-2">
                          <Calendar className="w-3 h-3" /> {e.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 flex justify-center items-center">
            <RefreshCw className="w-5 h-5 text-emerald-500 animate-spin" />
            <span className="ml-3 text-sm text-slate-400">Analyzing inventory and planning strategy...</span>
          </div>
        )}

        {/* Generate Button (Briefing) */}
        <div className="flex justify-between items-center pt-2">
          <button 
            onClick={() => setShowManualOverride(!showManualOverride)}
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            {showManualOverride ? "Hide Manual Override" : "Want to post something else? (Manual Override)"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || tokenInfo.totalAvailable <= 0 || !briefingData}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            {generating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Generating AI Post...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Generate Recommended Post
              </>
            )}
          </button>
        </div>
      </div>

      {/* Manual Override Section */}
      {showManualOverride && (
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-300">Manual Pillar Selection</h3>
            <p className="text-xs text-slate-500">Override the AI's daily recommendation and force a specific post type.</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pillarsList.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPillar(p.id as any)}
                className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 ${
                  selectedPillar === p.id
                    ? 'bg-emerald-950/40 border-emerald-500/80 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm text-white">{p.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      selectedPillar === p.id ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {p.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{p.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {selectedPillar === 'custom' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Custom Announcement Details</label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. We will be offering free blood pressure checks this Friday from 9 AM to 4 PM!"
                className="w-full h-24 p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}
        </div>
      )}

      {/* Active Generated Post Preview Banner */}
      {activeGeneratedPost && (
        <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/40 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              ✨ Newly Generated Post
            </span>
            <span className="text-xs text-slate-400">Just now</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Image Preview / Carousel */}
            <div className="space-y-3">
              <div className="aspect-square rounded-xl overflow-hidden bg-slate-950 border border-slate-800 relative group">
                <img
                  src={activeGeneratedPost.imageUrls[activeSlide] || activeGeneratedPost.imageUrls[0]}
                  alt="AI Generated Post"
                  className="w-full h-full object-cover"
                />
                {activeGeneratedPost.imageUrls.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-800">
                    {activeGeneratedPost.imageUrls.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveSlide(idx)}
                        className={`w-2 h-2 rounded-full transition-all ${activeSlide === idx ? 'w-5 bg-emerald-400' : 'bg-slate-600'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              {activeGeneratedPost.imageUrls.length > 1 && (
                <p className="text-center text-xs text-slate-400">Slide {activeSlide + 1} of {activeGeneratedPost.imageUrls.length}</p>
              )}
            </div>

            {/* Caption & Actions */}
            <div className="flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <h3 className="font-bold text-white text-base">{activeGeneratedPost.title}</h3>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto custom-scroll">
                  {activeGeneratedPost.caption}
                  {'\n\n' + activeGeneratedPost.hashtags.join(' ')}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => copyToClipboard(`${activeGeneratedPost.caption}\n\n${activeGeneratedPost.hashtags.join(' ')}`, 'active-caption')}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition"
                >
                  {copiedId === 'active-caption' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copiedId === 'active-caption' ? 'Copied Caption!' : 'Copy Caption'}
                </button>

                <button
                  onClick={() => setRegenPostId(activeGeneratedPost.id)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition"
                  title="Regenerate with custom feedback"
                >
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </button>

                <a
                  href={activeGeneratedPost.imageUrls[activeSlide] || activeGeneratedPost.imageUrls[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition"
                >
                  <Download className="w-4 h-4" /> Download
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pro Features Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" /> Pro Automation Features
          </h3>
          <span className="text-xs text-amber-400 font-semibold">Available in Synkk Pro</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {proFeatures.map((f, i) => (
            <div key={i} className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{f.icon}</span>
                <Lock className="w-3.5 h-3.5 text-slate-600" />
              </div>
              <h4 className="font-bold text-xs text-white">{f.title}</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* History Grid */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" /> Content History
        </h3>

        {posts.length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-sm text-slate-400">
            No posts generated yet. Generate your first post using the Briefing above!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {posts.map((post) => (
              <div key={post.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 hover:border-slate-700 transition">
                <div className="aspect-square rounded-lg overflow-hidden bg-slate-950 relative">
                  <img src={post.imageUrls[0]} alt="Post thumb" className="w-full h-full object-cover" />
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-950/80 text-emerald-400 border border-slate-800 backdrop-blur-md uppercase">
                    {post.pillar}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="font-semibold text-xs text-white truncate">{post.title || 'Social Post'}</p>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{post.caption}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(`${post.caption}\n\n${post.hashtags?.join(' ') || ''}`, post.id)}
                    className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition"
                  >
                    {copiedId === post.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedId === post.id ? 'Copied!' : 'Copy'}
                  </button>

                  <button
                    onClick={() => setRegenPostId(post.id)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    title="Regenerate post"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Brand Settings Modal */}
      {showBrandSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-400" /> Brand Identity Settings
              </h3>
              <button onClick={() => setShowBrandSettings(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">Preferred Brand Tone</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'warm', label: 'Warm & Friendly' },
                    { id: 'professional', label: 'Clinical & Pro' },
                    { id: 'bold', label: 'Bold & Energetic' }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setBrandTone(t.id)}
                      className={`p-2.5 rounded-xl border text-xs font-medium transition ${
                        brandTone === t.id
                          ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">Show Prices on Graphics?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowPrices(true)}
                    className={`p-2.5 rounded-xl border text-xs font-medium transition ${
                      showPrices ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Yes, include pricing
                  </button>
                  <button
                    onClick={() => setShowPrices(false)}
                    className={`p-2.5 rounded-xl border text-xs font-medium transition ${
                      !showPrices ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    No, keep general
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Target Audience</label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Young mothers & busy corporate workers"
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Visual Style Preference</label>
                <input
                  type="text"
                  value={visualStyle}
                  onChange={(e) => setVisualStyle(e.target.value)}
                  placeholder="e.g. Minimalist flat-lay photography, deep green aesthetics"
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowBrandSettings(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBrandSettings}
                disabled={savingSettings}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2"
              >
                {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save Brand Rules
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Special Request / Custom Brief Modal */}
      {showSpecialModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-emerald-400" /> Custom Post Brief & Photos
              </h3>
              <button onClick={() => setShowSpecialModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">What is this custom post about?</label>
                <textarea
                  value={specialBrief}
                  onChange={(e) => setSpecialBrief(e.target.value)}
                  placeholder="e.g. Announcing our new 24/7 night delivery service in Ikeja! Highlight quick delivery times and emergency medications."
                  className="w-full h-24 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Attach Reference Photos (Up to 3)</label>
                <p className="text-[11px] text-slate-500 mb-2">Upload real pharmacy photos to include in the visual generation.</p>
                
                <div className="grid grid-cols-4 gap-3">
                  {specialImages.map((img, i) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden bg-slate-950 border border-slate-800 relative group">
                      <img src={img.preview} alt="Upload preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setSpecialImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {specialImages.length < 3 && (
                    <label className="aspect-square rounded-xl border border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-950/50 flex flex-col items-center justify-center cursor-pointer transition">
                      <Upload className="w-5 h-5 text-slate-500 mb-1" />
                      <span className="text-[10px] text-slate-400">Add Photo</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowSpecialModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateSpecial}
                disabled={generatingSpecial || !specialBrief.trim()}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                {generatingSpecial ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate Custom Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regeneration Modal */}
      {regenPostId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-400" /> Regenerate Post
              </h3>
              <button onClick={() => setRegenPostId(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300 block">Why regenerate? Give feedback to the AI:</label>
              <textarea
                value={regenReason}
                onChange={(e) => setRegenReason(e.target.value)}
                placeholder="e.g. Make the caption punchier and shorter, and focus the image on skincare instead of pills."
                className="w-full h-24 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRegenPostId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleRegeneratePost}
                disabled={regenerating || !regenReason.trim()}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                {regenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Regenerate Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
