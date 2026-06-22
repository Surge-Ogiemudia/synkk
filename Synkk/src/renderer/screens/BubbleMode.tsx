import React, { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────
type BubblePhase =
  | 'watching'       // Initial state — instructing the user
  | 'observing'      // Actively monitoring silently
  | 'found'          // Data captured — confirm with user
  | 'confirmed';     // Locked in — method saved

interface ObservationResult {
  method: 'network' | 'screen' | 'process';
  itemCount: number;
  posName: string;
  items: any[];
}

interface Props {
  posNameHint?: string; // Optional name the user typed in POSTypeSelector
  onConfirmed: (items: any[], posName: string) => void;
  onCancel: () => void;
  onPivotToWeb?: () => void;
  onPivotToLocal?: (dbPath: string) => void;
}

// ── Bubble Mode Widget ────────────────────────────────────────────────
export default function BubbleMode({ posNameHint, onConfirmed, onCancel, onPivotToWeb, onPivotToLocal }: Props) {
  const [phase, setPhase] = useState<BubblePhase>('watching');
  const [result, setResult] = useState<ObservationResult | null>(null);
  const [dots, setDots] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [position, setPosition] = useState({ x: 24, y: 24 }); // distance from bottom-right
  const [isDragging, setIsDragging] = useState(false);
  const [scannedApp, setScannedApp] = useState<string>('');
  const dragStart = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);
  const observingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate dots
  useEffect(() => {
    if (phase !== 'observing') return;
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  // Listen for process watch status
  useEffect(() => {
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    const handleScanStatus = (_e: any, appName: string) => {
      setScannedApp(appName);
    };
    ipcRenderer.on('process-watch-status', handleScanStatus);
    return () => ipcRenderer.removeListener('process-watch-status', handleScanStatus);
  }, []);

  // When user clicks "Start Observing", shrink and begin silent observation
  const startObserving = async () => {
    // @ts-ignore
    const { ipcRenderer } = window.require('electron');
    
    // First, take a baseline snapshot of running processes
    try {
      await ipcRenderer.invoke('take-process-snapshot');
    } catch (e) {
      console.error('[BubbleMode] Failed to take process snapshot:', e);
    }

    setPhase('observing');
    setIsExpanded(false);

    let isPivoting = false;

    // 1. Kick off Network Observation
    ipcRenderer.invoke('start-silent-observation', { posNameHint }).then((result: any) => {
      if (isPivoting) return;
      if (result && result.itemCount > 0) {
        setResult(result);
        setPhase('found');
        setIsExpanded(true);
      }
    }).catch((err: any) => {
      console.error('[BubbleMode] Network observation failed:', err);
    });

    // 2. Concurrently kick off Process Watcher
    ipcRenderer.invoke('start-process-watch').then((result: any) => {
      if (isPivoting) return;
      
      if (result.type === 'browser') {
        isPivoting = true;
        if (onPivotToWeb) onPivotToWeb();
      } else if (result.type === 'local-app' && result.details?.dbPath) {
        isPivoting = true;
        if (onPivotToLocal) onPivotToLocal(result.details.dbPath);
      }
    }).catch((err: any) => {
      console.error('[BubbleMode] Process watch failed:', err);
    });

    // Safety timeout — if nothing found in 10 minutes, re-expand and prompt
    observingTimerRef.current = setTimeout(() => {
      if (phase === 'observing' && !isPivoting) {
        setPhase('watching');
        setIsExpanded(true);
      }
    }, 10 * 60 * 1000);
  };

  const handleConfirm = () => {
    if (result) {
      setPhase('confirmed');
      onConfirmed(result.items, result.posName || posNameHint || 'Unknown POS');
    }
  };

  // ── Drag Logic ──
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    setIsDragging(true);
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, posX: position.x, posY: position.y };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging || !dragStart.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      setPosition({
        x: Math.max(8, dragStart.current.posX - dx),
        y: Math.max(8, dragStart.current.posY - dy),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  // ── Render ──
  const G = '#0F6E56';
  const TEAL = '#3BBFA0';
  const AMBER = '#F59E0B';

  // Pulse ring color by phase
  const ringColor = phase === 'found' ? G : phase === 'observing' ? TEAL : AMBER;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: position.y,
        right: position.x,
        zIndex: 9999,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onMouseDown={onMouseDown}
    >
      {/* ── Collapsed Bubble ─────────────────── */}
      {!isExpanded ? (
        <div
          style={{ position: 'relative', width: 56, height: 56 }}
          onClick={() => setIsExpanded(true)}
        >
          {/* Outer pulse ring */}
          <div style={{
            position: 'absolute', inset: -6,
            borderRadius: '50%',
            border: `2px solid ${ringColor}`,
            opacity: 0.4,
            animation: 'bubblePulse 2s infinite ease-out',
          }} />
          {/* Inner bubble */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: `linear-gradient(135deg, ${G}, ${TEAL})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 20px ${G}66`,
            fontSize: 22,
          }}>
            {phase === 'observing' ? '👁' : phase === 'found' ? '✓' : '◉'}
          </div>
          <style>{`
            @keyframes bubblePulse {
              0% { transform: scale(1); opacity: 0.4; }
              70% { transform: scale(1.4); opacity: 0; }
              100% { transform: scale(1.4); opacity: 0; }
            }
          `}</style>
        </div>
      ) : (
        /* ── Expanded Panel ─────────────────────── */
        <div
          style={{
            background: 'rgba(13, 21, 18, 0.97)',
            backdropFilter: 'blur(20px)',
            border: `1.5px solid ${ringColor}33`,
            borderRadius: 18,
            padding: 20,
            width: 300,
            boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px ${ringColor}1A`,
            animation: 'expandIn 0.25s ease',
          }}
        >
          <style>{`
            @keyframes expandIn {
              from { opacity: 0; transform: scale(0.9) translateY(8px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: `linear-gradient(135deg, ${G}, ${TEAL})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}>
                {phase === 'found' ? '✓' : phase === 'observing' ? '👁' : '◉'}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Synkk Agent</div>
                <div style={{ fontSize: 10, color: ringColor, fontWeight: 600 }}>
                  {phase === 'watching' && 'Ready to observe'}
                  {phase === 'observing' && `Watching${dots}`}
                  {phase === 'found' && 'Inventory Found!'}
                  {phase === 'confirmed' && 'Method Locked ✓'}
                </div>
              </div>
            </div>
            <button
              data-no-drag
              onClick={() => setIsExpanded(false)}
              style={{ background: 'none', border: 'none', color: '#7A9490', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
            >−</button>
          </div>

          {/* ── Phase: Watching ── */}
          {phase === 'watching' && (
            <div style={{ animation: 'expandIn 0.3s ease' }}>
              <div style={{
                background: 'rgba(59,191,160,0.08)', border: '1px solid rgba(59,191,160,0.2)',
                borderRadius: 12, padding: '12px 14px', marginBottom: 14,
              }}>
                <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                  <strong style={{ color: TEAL }}>Go to your pharmacy software</strong> like you normally would. Navigate to your stock or inventory screen. Synkk will silently watch and figure out how to sync your data automatically.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }} data-no-drag>
                <button
                  onClick={onCancel}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#7A9490', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >Cancel</button>
                <button
                  onClick={startObserving}
                  style={{
                    flex: 2, padding: '10px 0', borderRadius: 10,
                    background: G, border: 'none',
                    color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: `0 4px 14px ${G}55`,
                  }}
                >Start Observing →</button>
              </div>
            </div>
          )}

          {/* ── Phase: Observing ── */}
          {phase === 'observing' && (
            <div style={{ animation: 'expandIn 0.3s ease' }}>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 12 }}>
                Synkk is quietly monitoring in the background. Open your POS software and navigate to your inventory list.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 4 }}>
                {['Network', 'Screen', 'Processes'].map(label => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: TEAL,
                      boxShadow: `0 0 8px ${TEAL}`,
                      animation: 'bubblePulse 1.5s infinite ease-out',
                    }} />
                    <span style={{ fontSize: 9, color: '#7A9490', fontWeight: 600 }}>{label}</span>
                  </div>
                ))}
              </div>
              
              {/* Live Scanner Feed */}
              <div style={{ 
                marginTop: 12, padding: '6px 10px', 
                background: '#0D1512', borderRadius: 6, border: '1px solid #1E293B',
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'monospace', fontSize: 10, color: TEAL 
              }}>
                <span style={{ opacity: 0.5 }}>$</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {scannedApp ? `Scanning ${scannedApp}...` : 'Initializing scanner...'}
                </span>
              </div>

              <button
                data-no-drag
                onClick={() => { setPhase('watching'); setIsExpanded(true); }}
                style={{
                  width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#7A9490', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                }}
              >Cancel Observation</button>
            </div>
          )}

          {/* ── Phase: Found ── */}
          {phase === 'found' && result && (
            <div style={{ animation: 'expandIn 0.3s ease' }}>
              <div style={{
                background: 'rgba(15,110,86,0.12)', border: `1px solid ${G}44`,
                borderRadius: 12, padding: '12px 14px', marginBottom: 14, textAlign: 'center',
              }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>🎯</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                  Found {result.itemCount} medicines!
                </div>
                <div style={{ fontSize: 11, color: '#7A9490' }}>
                  via {result.method === 'network' ? 'Network Intercept' : result.method === 'screen' ? 'Screen Capture' : 'Process Monitor'}
                  {result.posName && ` · ${result.posName}`}
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12, textAlign: 'center' }}>
                Is this your full inventory? Confirm to lock in this method.
              </p>
              <div style={{ display: 'flex', gap: 8 }} data-no-drag>
                <button
                  onClick={() => { setPhase('observing'); setIsExpanded(false); }}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#7A9490', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >Keep Looking</button>
                <button
                  onClick={handleConfirm}
                  style={{
                    flex: 2, padding: '10px 0', borderRadius: 10,
                    background: G, border: 'none',
                    color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: `0 4px 14px ${G}55`,
                  }}
                >Yes, that's it! ✓</button>
              </div>
            </div>
          )}

          {/* ── Phase: Confirmed ── */}
          {phase === 'confirmed' && (
            <div style={{ textAlign: 'center', padding: '8px 0', animation: 'expandIn 0.3s ease' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Method Locked!</div>
              <div style={{ fontSize: 11, color: '#7A9490' }}>Synkk will use this approach for all future syncs automatically.</div>
            </div>
          )}

          {/* Drag hint */}
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 9, color: '#374151', fontWeight: 500 }}>⠿ drag to move</span>
          </div>
        </div>
      )}
    </div>
  );
}
