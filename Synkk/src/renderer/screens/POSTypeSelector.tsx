import React, { useState } from 'react';
import { Monitor, Globe, HelpCircle, ArrowRight, ChevronLeft } from 'lucide-react';

interface Props {
  posName: string;
  setPosName: (name: string) => void;
  onSelect: (type: 'local-app' | 'web-pos' | 'unknown', webUrl?: string) => void;
  onBack: () => void;
  initialWebPos?: boolean;
}

const OPTIONS = [
  {
    id: 'local-app' as const,
    icon: Monitor,
    title: 'App on my computer',
    description: 'A software installed on this PC — like Sage, QuickMeds, Healthware or a custom ERP.',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.35)',
  },
  {
    id: 'web-pos' as const,
    icon: Globe,
    title: 'Web POS — I use a browser',
    description: 'You open a website to manage your stock — like Kendor, DispensaPlus or any browser-based system.',
    color: '#3BBFA0',
    bg: 'rgba(59, 191, 160, 0.08)',
    border: 'rgba(59, 191, 160, 0.35)',
  },
  {
    id: 'unknown' as const,
    icon: HelpCircle,
    title: "I don't know",
    description: "That's fine. Synkk will quietly watch while you use your software normally and figure it out.",
    color: '#7A9490',
    bg: 'rgba(122, 148, 144, 0.06)',
    border: 'rgba(122, 148, 144, 0.25)',
  },
];

export default function POSTypeSelector({ posName, setPosName, onSelect, onBack, initialWebPos }: Props) {
  const [selected, setSelected] = useState<'local-app' | 'web-pos' | 'unknown' | null>(initialWebPos ? 'web-pos' : null);
  const [hovering, setHovering] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(!!initialWebPos);
  const [url, setUrl] = useState('');

  const handleContinue = () => {
    if (selected === 'web-pos') {
      setShowUrlInput(true);
    } else if (selected) {
      onSelect(selected);
    }
  };

  const handleSubmitUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
    onSelect('web-pos', finalUrl);
  };

  if (showUrlInput) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 560, margin: '0 auto', padding: '0 16px', animation: 'fadeSlideUp 0.4s ease' }}>
        <button onClick={() => setShowUrlInput(false)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, color: '#7A9490', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, marginBottom: 24, padding: '4px 0', fontFamily: 'inherit' }}>
          <ChevronLeft size={16} /> Back
        </button>

        <div className="glass-panel flex flex-col justify-center p-10 rounded-3xl relative overflow-hidden w-full border border-emerald-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-50"></div>
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center mb-6 border border-white/5 shadow-lg">
              <Globe className="w-6 h-6 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 font-sans">Connect web software</h2>
            <p className="text-sm text-slate-400 mb-8 font-sans">Paste your web POS link. You'll log in on the next screen.</p>

            <form onSubmit={handleSubmitUrl} className="flex flex-col gap-3 w-full">
              <input
                type="text"
                placeholder="https://mypharmacy.pos.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-5 pr-5 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all font-sans text-base"
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="w-full py-4 bg-cyan-500/20 hover:bg-cyan-500/40 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center justify-center gap-2 font-semibold"
              >
                <ArrowRight className="w-5 h-5" /> Continue
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: 560,
        margin: '0 auto',
        padding: '0 16px',
        animation: 'fadeSlideUp 0.4s ease',
      }}
    >
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Back */}
      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#7A9490',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 24,
          padding: '4px 0',
          fontFamily: 'inherit',
        }}
      >
        <ChevronLeft size={16} /> Back
      </button>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 8px', fontFamily: 'inherit' }}>
          Let's find your POS
        </h2>
        <p style={{ fontSize: 14, color: '#7A9490', margin: 0, lineHeight: 1.6, fontFamily: 'inherit' }}>
          Synkk couldn't auto-detect a local database. Tell us a bit more so we can connect properly.
        </p>
      </div>

      {/* POS Name Input */}
      <div style={{ width: '100%', marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7A9490', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'inherit' }}>
          What is your POS called? <span style={{ color: '#7A9490', fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          type="text"
          value={posName}
          onChange={e => setPosName(e.target.value)}
          placeholder="e.g. Smapp, Healthware, QuickMeds..."
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.35)',
            border: '1.5px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '12px 16px',
            color: '#fff',
            fontSize: 14,
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(59,191,160,0.5)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
      </div>

      {/* Connection Type Options */}
      <div style={{ width: '100%', marginBottom: 8 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7A9490', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'inherit' }}>
          How do you manage your stock?
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {OPTIONS.map(opt => {
            const Icon = opt.icon;
            const isSelected = selected === opt.id;
            const isHover = hovering === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => setSelected(opt.id)}
                onMouseEnter={() => setHovering(opt.id)}
                onMouseLeave={() => setHovering(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 18px',
                  borderRadius: 14,
                  background: isSelected ? opt.bg : isHover ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)',
                  border: `1.5px solid ${isSelected ? opt.border : isHover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                  boxShadow: isSelected ? `0 4px 20px ${opt.color}18` : 'none',
                }}
              >
                {/* Radio dot */}
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `2px solid ${isSelected ? opt.color : 'rgba(255,255,255,0.2)'}`,
                  background: isSelected ? opt.color : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.2s',
                }}>
                  {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>

                {/* Icon */}
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: isSelected ? `${opt.color}20` : 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}>
                  <Icon size={20} color={isSelected ? opt.color : '#7A9490'} />
                </div>

                {/* Text */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? '#fff' : '#cbd5e1', marginBottom: 3, fontFamily: 'inherit' }}>
                    {opt.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#7A9490', lineHeight: 1.5, fontFamily: 'inherit' }}>
                    {opt.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Continue Button */}
      <button
        onClick={handleContinue}
        disabled={!selected}
        style={{
          width: '100%',
          marginTop: 24,
          padding: '14px 24px',
          background: selected ? '#0F6E56' : 'rgba(255,255,255,0.05)',
          border: `1.5px solid ${selected ? '#0F6E56' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 14,
          color: selected ? '#fff' : '#4B5563',
          fontSize: 15,
          fontWeight: 700,
          cursor: selected ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transition: 'all 0.2s',
          fontFamily: 'inherit',
          boxShadow: selected ? '0 4px 20px rgba(15,110,86,0.3)' : 'none',
        }}
        onMouseEnter={e => { if (selected) (e.target as HTMLButtonElement).style.background = '#0a5c47'; }}
        onMouseLeave={e => { if (selected) (e.target as HTMLButtonElement).style.background = '#0F6E56'; }}
      >
        Continue <ArrowRight size={16} />
      </button>
    </div>
  );
}
