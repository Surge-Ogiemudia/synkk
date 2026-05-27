import { executeSync } from './sync';
import { getStore } from '../store/local';

let syncInterval: NodeJS.Timeout | null = null;

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
    try {
      await executeSync();
    } catch (e) {
      console.error('Scheduled sync failed:', e);
    }
  }, ms);
}
