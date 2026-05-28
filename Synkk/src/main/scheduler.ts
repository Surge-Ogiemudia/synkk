import { executeSync } from './sync';
import { getStore, setStore } from '../store/local';

let syncInterval: NodeJS.Timeout | null = null;

// Track consecutive failures for 3-strike escalation
let consecutiveFailures = 0;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [60_000, 180_000, 300_000]; // 1min, 3min, 5min

export function startScheduler() {
  updateScheduler();
}

export function stopScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export function updateScheduler() {
  stopScheduler();

  const freq = getStore('syncFrequency') || '15m';
  let ms = 15 * 60 * 1000; // default 15m

  if (freq === '15m') ms = 15 * 60 * 1000;
  else if (freq === '1h') ms = 60 * 60 * 1000;
  else if (freq === '12h') ms = 12 * 60 * 60 * 1000;
  else if (freq === '24h') ms = 24 * 60 * 60 * 1000;

  console.log(`Starting sync scheduler with interval: ${freq}`);
  
  syncInterval = setInterval(async () => {
    console.log(`[Scheduler] Triggering sync...`);
    await attemptSyncWithRetries();
  }, ms);
}

async function attemptSyncWithRetries() {
  try {
    await executeSync();
    // Reset failure counter on success
    consecutiveFailures = 0;
    console.log('[Scheduler] Sync completed successfully.');
  } catch (e: any) {
    consecutiveFailures++;
    console.error(`[Scheduler] Sync failed (attempt ${consecutiveFailures}/${MAX_RETRIES}):`, e.message);
    
    if (consecutiveFailures < MAX_RETRIES) {
      const delay = RETRY_DELAYS[consecutiveFailures - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      console.log(`[Scheduler] Retrying in ${delay / 1000} seconds...`);
      
      // Store retry info so the UI can show "Retrying in X minutes..."
      setStore('syncRetryInfo', {
        attempt: consecutiveFailures,
        maxRetries: MAX_RETRIES,
        nextRetryAt: new Date(Date.now() + delay).toISOString()
      });

      setTimeout(async () => {
        await attemptSyncWithRetries();
      }, delay);
    } else {
      console.error(`[Scheduler] All ${MAX_RETRIES} retry attempts exhausted. Waiting for next scheduled cycle.`);
      
      // Clear retry info - we've given up until next cycle
      setStore('syncRetryInfo', null);
      consecutiveFailures = 0;
    }
  }
}
