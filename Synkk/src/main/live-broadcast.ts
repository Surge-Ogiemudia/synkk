/**
 * live-broadcast.ts
 *
 * Epic 5: Live Chromium Broadcast
 * Intercepts the headless BrowserWindow frames during a Web POS sync,
 * compresses them heavily, and streams them via PharmastackX's Pusher backend
 * so the founder can watch the sync live on the dashboard.
 */

import { BrowserWindow, nativeImage } from 'electron';
import { getStore } from '../store/local';

let broadcastIntervalId: NodeJS.Timeout | null = null;
const PSX_BASE = 'https://www.pharmastackx.com';
const FRAMERATE_MS = 2000; // 1 frame every 2 seconds to respect Pusher limits
const MAX_WIDTH = 800; // compress heavily
const JPEG_QUALITY = 30; // 0-100

/**
 * Starts capturing and broadcasting the window's visual state.
 */
export function startLiveBroadcast(win: BrowserWindow) {
  if (broadcastIntervalId) return; // already running

  const storefrontData = getStore('storefront') as any;
  const slug = storefrontData?.slug || 'anonymous';
  const settings = getStore('settings') as any;

  // We only broadcast if the remote-config or local settings explicitly enable it,
  // or we default it to true for this Epic 5 showcase. Let's default it to true if missing.
  if (settings?.enableLiveBroadcast === false) {
    console.log('[LiveBroadcast] Disabled by local settings.');
    return;
  }

  console.log(`[LiveBroadcast] Starting frame interception for slug: ${slug} at 1 frame per ${FRAMERATE_MS}ms`);

  broadcastIntervalId = setInterval(async () => {
    if (win.isDestroyed()) {
      stopLiveBroadcast();
      return;
    }

    try {
      // 1. Capture the exact visible page (headless renders fine)
      const image = await win.webContents.capturePage();
      
      // 2. Heavy Compression for Pusher limits (Pusher max msg size is 10KB usually,
      // but for Vercel/Pusher Pro it can be higher. We compress to be safe).
      const resized = image.resize({ width: MAX_WIDTH });
      const jpegBuffer = resized.toJPEG(JPEG_QUALITY);
      const base64Str = jpegBuffer.toString('base64');
      const payloadSize = Buffer.byteLength(base64Str, 'utf8');

      // If it's too huge, warn locally (in reality, chunking would be needed for true 10KB limits, 
      // but we POST to PSX, and PSX handles the Pusher trigger, which might use a larger cluster tier).
      if (payloadSize > 50000) {
        console.warn(`[LiveBroadcast] Warning: Frame payload is large (${Math.round(payloadSize/1024)}KB)`);
      }

      // 3. POST to PharmastackX
      await fetch(`${PSX_BASE}/api/synkk-ai/live-broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          frameBase64: `data:image/jpeg;base64,${base64Str}`,
          timestamp: Date.now()
        }),
        signal: AbortSignal.timeout(4000) // Don't let fetch pile up
      });

    } catch (e: any) {
      if (e.name === 'AbortError') {
         // Silently ignore timeout drops (network too slow for live stream)
      } else {
         console.error('[LiveBroadcast] Frame capture failed:', e.message);
      }
    }
  }, FRAMERATE_MS);
}

/**
 * Stops the live broadcast interval.
 */
export function stopLiveBroadcast() {
  if (broadcastIntervalId) {
    clearInterval(broadcastIntervalId);
    broadcastIntervalId = null;
    console.log('[LiveBroadcast] Stopped.');
  }
}
