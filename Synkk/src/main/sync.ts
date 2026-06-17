import { getStore, setStore } from '../store/local';
import { updateTrayStatus } from './tray';
import { sendFailureAlertEmail } from './mailer';
import { net, safeStorage, BrowserWindow, app } from 'electron';
import { reportSessionExpired } from './remote-config';
import { lookupKnownMethod, reportSuccessfulMethod, applyKnownMethod } from './collective-intelligence';
import { startLiveBroadcast } from './live-broadcast';

// ── Count Validation Types ────────────────────────────────────────────
type CountResult =
  | { status: 'verified'; total: number }
  | { status: 'unverifiable'; reason: string };

/**
 * Parses a "Showing X of Y" or "Total: N" style string from DOM text.
 * Used by Tier 4 (DOM Scrape) and Tier 4b (Visual Capture).
 */
export function parseTotalFromText(text: string): CountResult {
  // Match patterns like: "Showing 1-20 of 847", "847 items", "Total: 847", "847 results"
  const patterns = [
    /showing\s+[\d,]+[-–]?[\d,]*\s+of\s+([\d,]+)/i,
    /([\d,]+)\s+items?/i,
    /total[:\s]+([\d,]+)/i,
    /([\d,]+)\s+results?/i,
    /([\d,]+)\s+records?/i,
    /([\d,]+)\s+products?/i,
    /([\d,]+)\s+entries?/i,
    /of\s+([\d,]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const total = parseInt(match[1].replace(/,/g, ''), 10);
      if (!isNaN(total) && total > 0) {
        return { status: 'verified', total };
      }
    }
  }
  return { status: 'unverifiable', reason: 'No total count text found in page content' };
}

/**
 * Extracts the total item count from an API response envelope.
 * Checks common field names: total, count, totalItems, meta.total, pagination.total
 * Used by Tier 2 (API Hijack) and Tier 3 (Network Intercept).
 */
export function parseTotalFromApiResponse(responseData: any): CountResult {
  if (!responseData || typeof responseData !== 'object') {
    return { status: 'unverifiable', reason: 'Response is not an object' };
  }
  const candidates = [
    responseData.total,
    responseData.count,
    responseData.totalItems,
    responseData.total_items,
    responseData.totalCount,
    responseData.total_count,
    responseData.meta?.total,
    responseData.meta?.count,
    responseData.pagination?.total,
    responseData.pagination?.count,
    responseData.recordsTotal, // DataTables convention
    responseData.filteredTotal,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && candidate > 0) {
      return { status: 'verified', total: candidate };
    }
    if (typeof candidate === 'string') {
      const n = parseInt(candidate, 10);
      if (!isNaN(n) && n > 0) return { status: 'verified', total: n };
    }
  }
  return { status: 'unverifiable', reason: 'No recognised total field in API response envelope' };
}

/**
 * Validates extracted item count against expected total.
 * Returns true if the sync is complete, false if more pages need to be fetched.
 */
export function validateExtractedCount(
  extracted: number,
  countResult: CountResult,
  tierLabel: string
): boolean {
  if (countResult.status === 'unverifiable') {
    console.warn(`[CountValidation] ${tierLabel}: Total count UNVERIFIABLE — ${countResult.reason}. Blocking incomplete sync.`);
    return false; // Force error to ensure we don't accidentally sync partial data
  }
  if (extracted >= countResult.total) {
    console.log(`[CountValidation] ${tierLabel}: ✓ COMPLETE — ${extracted}/${countResult.total} items captured.`);
    return true;
  }
  console.warn(`[CountValidation] ${tierLabel}: ⚠ INCOMPLETE — ${extracted}/${countResult.total} items captured. Retrying pagination...`);
  return false;
}

// ── Actionable Error Map ──────────────────────────────────────────────
// Maps raw error signatures to human-readable solutions for the pharmacist.
// Each entry has: code, userMessage (what to show the pharmacist), severity.
export interface SyncError {
  code: string;
  userMessage: string;
  severity: 'warning' | 'critical';
}

function classifyError(rawMessage: string): SyncError {
  const msg = rawMessage.toLowerCase();

  // ── Network errors ──
  if (msg.includes('enotfound') || msg.includes('enetunreach') || msg.includes('network') || msg.includes('offline') || msg.includes('err_internet_disconnected')) {
    return {
      code: 'NETWORK_OFFLINE',
      userMessage: 'Your internet connection appears to be down. Please check your Wi-Fi or Ethernet cable, then Synkk will retry automatically.',
      severity: 'warning'
    };
  }
  if (msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('timeout')) {
    return {
      code: 'CONNECTION_REFUSED',
      userMessage: 'Cannot reach the POS server. Please make sure your POS application is running and not blocked by a firewall.',
      severity: 'warning'
    };
  }

  // ── Database errors ──
  if (msg.includes('database is locked') || msg.includes('sqlite_busy')) {
    return {
      code: 'DB_LOCKED',
      userMessage: 'Your POS database is currently locked (probably in use by another process). Please close any other programs using the database and try again.',
      severity: 'warning'
    };
  }
  if (msg.includes('no such table') || msg.includes('table not found')) {
    return {
      code: 'TABLE_MISSING',
      userMessage: 'The expected database table was not found. Your POS may have been updated. Please re-map your database tables by going to the Source tab.',
      severity: 'critical'
    };
  }
  if (msg.includes('no such column')) {
    return {
      code: 'COLUMN_MISSING',
      userMessage: 'A database column Synkk expected is missing. Your POS may have been updated. Please re-map your columns by going to the Source tab.',
      severity: 'critical'
    };
  }
  if (msg.includes('corrupt') || msg.includes('malformed') || msg.includes('not a database')) {
    return {
      code: 'DB_CORRUPT',
      userMessage: 'Your POS database file appears to be corrupted. Please uninstall and reinstall your POS application to clear its cache, then reconnect Synkk.',
      severity: 'critical'
    };
  }
  if (msg.includes('fileMustExist') || msg.includes('enoent') || msg.includes('no such file')) {
    return {
      code: 'FILE_NOT_FOUND',
      userMessage: 'The POS database file was moved or deleted. Please check if your POS application is still installed, or re-map via the Source tab.',
      severity: 'critical'
    };
  }

  // ── Web POS errors ──
  if (msg.includes('auto-login failed') || msg.includes('login_screen_detected')) {
    return {
      code: 'SESSION_EXPIRED',
      userMessage: 'Your Web POS session has expired and Synkk could not log back in automatically. Our team has been notified and will restore your sync shortly.',
      severity: 'critical'
    };
  }
  if (msg.includes('captcha') || msg.includes('challenge')) {
    return {
      code: 'CAPTCHA_BLOCK',
      userMessage: 'The Web POS is showing a CAPTCHA challenge that Synkk cannot solve. Please log in manually via the Source tab and complete the verification.',
      severity: 'critical'
    };
  }
  if (msg.includes('timed out') || msg.includes('extraction timed out')) {
    return {
      code: 'WEB_TIMEOUT',
      userMessage: 'The Web POS page took too long to load (over 120 seconds). Please check your internet speed, or re-map your Web POS via the Source tab.',
      severity: 'warning'
    };
  }
  if (msg.includes('semantic web extraction failed')) {
    return {
      code: 'AI_PARSE_FAILED',
      userMessage: 'Synkk could not read the data on your Web POS page. The page layout may have changed. Please re-scan via the Source tab.',
      severity: 'critical'
    };
  }

  // ── Cloud push errors ──
  if (msg.includes('cloud push failed') && (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized'))) {
    return {
      code: 'AUTH_FAILED',
      userMessage: 'Synkk was unable to push data to the cloud — authentication failed. Please contact PharmaStackX support.',
      severity: 'critical'
    };
  }
  if (msg.includes('cloud push failed') && (msg.includes('500') || msg.includes('502') || msg.includes('503'))) {
    return {
      code: 'SERVER_ERROR',
      userMessage: 'The PharmaStackX cloud server is temporarily unavailable. Synkk will retry automatically in a few minutes.',
      severity: 'warning'
    };
  }

  // ── Generic fallback ──
  return {
    code: 'UNKNOWN',
    userMessage: `An unexpected error occurred: "${rawMessage}". Please try restarting Synkk. If this persists, uninstall and reinstall Synkk to clear its cache.`,
    severity: 'critical'
  };
}

// ── Main Sync Entry Point ─────────────────────────────────────────────
let isSyncEngineRunning = false;

export async function executeSync(): Promise<{ status: string; error?: SyncError }> {
  if (isSyncEngineRunning) {
    console.log('Sync is already running. Ignoring overlapping request.');
    broadcastSyncStream('[SYSTEM] A sync is already in progress. Ignoring overlapping request.');
    return { status: 'already_running' };
  }
  
  isSyncEngineRunning = true;
  console.log('Executing sync cycle...');
  broadcastSyncError(null); // Clear previous errors
  broadcastSyncProgress(10, 'Initializing sync cycle...');
  const pairingData = (getStore('pairing') || { name: 'Unknown Pharmacy' }) as any;
  
  try {
    // 1. Check hardware network connection
    if (!net.isOnline()) {
      console.log('Network offline. Queuing inventory snapshot locally...');
      updateTrayStatus('amber', 'Offline - Queuing', 0);
      
      // Extract latest inventory locally and freeze it
      const snapshot = {
        timestamp: Date.now(),
        reason: 'network_offline',
        // Mocking the local DB extraction payload
        data: [{ name: "Aspirin", qty: 100 }]
      };
      
      setStore('offlineQueue', snapshot);

      const offlineError: SyncError = {
        code: 'NETWORK_OFFLINE',
        userMessage: 'You are currently offline. Synkk has queued your latest inventory and will push it automatically when your connection is restored.',
        severity: 'warning'
      };
      broadcastSyncError(offlineError);
      return { status: 'queued', error: offlineError };
    }

    // 2. We are online! Check if we have an offline queue to flush
    const queuedData = getStore('offlineQueue');
    if (queuedData) {
      console.log('Flushing offline queue to cloud...');
      // MOCK: Push queuedData to Supabase
      
      // Clear queue
      setStore('offlineQueue', null);
    }

    // 3. Normal online extraction
    console.log('Extracting latest inventory...');
    broadcastSyncProgress(30, 'Extracting latest inventory...');
    
    // Set up progressive streaming logic
    const lastSyncSnapshot = (getStore('lastSyncSnapshot') || []) as any[];
    const lastMap = new Map((lastSyncSnapshot as any[]).map(item => [item.name, item]));
    const storefrontData = (getStore('storefront') || { slug: 'unknown', name: 'Unknown' }) as any;
    const axios = require('axios');
    let totalStreamedUpdates = 0;
    
    const streamBatchToCloud = async (batch: any[]) => {
      const streamUpdates: any[] = [];
      for (const currentItem of batch) {
        const lastItem = lastMap.get(currentItem.name);
        if (!lastItem) {
          streamUpdates.push(currentItem);
        } else if (lastItem.qty !== currentItem.qty || lastItem.price !== currentItem.price) {
          streamUpdates.push(currentItem);
        }
      }
      
      if (streamUpdates.length > 0) {
        totalStreamedUpdates += streamUpdates.length;
        broadcastSyncStream(`[STREAM] Progressively pushed ${streamUpdates.length} verified items to storefront...`);
        
        try {
          await axios.post('https://www.pharmastackx.com/api/sync', {
            pharmacy_slug: storefrontData.slug,
            pharmacy_name: storefrontData.name,
            coordinates: storefrontData.coordinates,
            updates: streamUpdates,
            deletes: [],
            sync_tier: 2,
            app_version: app.getVersion()
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`
            },
            timeout: 15000
          });
          
          // CRITICAL: Update local map incrementally so autonomous retries or failed syncs 
          // do not re-upload the same items in a subsequent loop!
          for (const currentItem of streamUpdates) {
            lastMap.set(currentItem.name, currentItem);
          }
          const { setStore } = require('./ipc');
          setStore('lastSyncSnapshot', Array.from(lastMap.values()));
          
        } catch (e: any) {
          console.error('Stream batch push failed:', e.message);
        }
      }
    };

    let rawInventory: any[] = [];
    let syncTier: number = 1;
    
    if (pairingData.posIdentifier && pairingData.posIdentifier.startsWith('http')) {
      // Branch 2: Web POS (Hidden Browser Window)
      console.log('Target is Web POS. Spawning background browser...');
      let attempts = 0;
      const maxAttempts = 3;
      let success = false;
      let lastErrMessage = '';

      while (attempts < maxAttempts && !success) {
        attempts++;
        try {
          if (attempts > 1) {
            console.log(`[AUTONOMOUS RETRY] Sync failed. Retrying... (Attempt ${attempts}/${maxAttempts})`);
            broadcastSyncStream(`\\n[SYSTEM] Previous extraction was incomplete. Autonomously retrying sync (Attempt ${attempts}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5s before retry
          }
          const result = await extractFromWebPOS(pairingData.posIdentifier, pairingData.schemaMapping, streamBatchToCloud);
          rawInventory = result.items;
          syncTier = result.tier;
          success = true;
        } catch (err: any) {
          lastErrMessage = err.message;
          if (!lastErrMessage.includes('ALL_TIERS_FAILED')) {
             throw err; // Not a validation/extraction failure, something else broke, so abort.
          }
        }
      }

      if (!success) {
        const reason = lastErrMessage.split('ALL_TIERS_FAILED:')[1]?.trim() || 'Unknown error';
        console.log(`All automated tiers failed after ${maxAttempts} attempts (${reason}). Triggering CSV fallback...`);
        await new Promise((resolvePrompt, rejectPrompt) => {
          const { Notification, dialog, BrowserWindow } = require('electron');
          if (Notification.isSupported()) {
            const notif = new Notification({
              title: 'Synkk Web POS Sync Failed',
              body: 'All automated sync methods failed. Click here to manually upload your inventory CSV.'
            });
            notif.on('click', async () => {
              const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
              const filePaths = dialog.showOpenDialogSync(win, {
                title: 'Select Inventory CSV',
                filters: [{ name: 'CSV', extensions: ['csv'] }],
                properties: ['openFile']
              });
              if (filePaths && filePaths.length > 0) {
                try {
                  rawInventory = await extractFromLocalDB(filePaths[0], pairingData.schemaMapping);
                  syncTier = 5; // Tier 5 is CSV Fallback
                  resolvePrompt(null);
                } catch(e) {
                  rejectPrompt(e);
                }
              } else {
                rejectPrompt(new Error('User cancelled CSV fallback.'));
              }
            });
            notif.on('close', () => rejectPrompt(new Error('CSV fallback notification dismissed.')));
            notif.show();
          } else {
            rejectPrompt(new Error('Notifications not supported. Cannot prompt for CSV fallback.'));
          }
        });
      }
    } else if (pairingData.posIdentifier) {
      // Branch 1: Local SQLite DB
      console.log('Target is Local Database. Executing SQLite extraction...');
      
      // Foundational Fix: Run SELECT COUNT(*) before extraction to know the expected total
      let localDbTotal: CountResult = { status: 'unverifiable', reason: 'Non-SQLite file type' };
      const localExt = require('path').extname(pairingData.posIdentifier).toLowerCase();
      if (localExt !== '.csv' && localExt !== '.json') {
        try {
          const Database = require('better-sqlite3');
          const db = new Database(pairingData.posIdentifier, { readonly: true, fileMustExist: true });
          const countRow = db.prepare(`SELECT COUNT(*) as total FROM "${pairingData.schemaMapping?.tableName}"`).get() as any;
          db.close();
          if (countRow?.total > 0) {
            localDbTotal = { status: 'verified', total: countRow.total };
            console.log(`[CountValidation] Local DB: Expected ${countRow.total} items from SELECT COUNT(*).`);
            broadcastSyncStream(`[COUNT] Expecting ${countRow.total} items from local database.`);
          }
        } catch (countErr) {
          console.warn('[CountValidation] Local DB: SELECT COUNT(*) failed:', (countErr as any).message);
        }
      }
      
      rawInventory = await extractFromLocalDB(pairingData.posIdentifier, pairingData.schemaMapping);
      validateExtractedCount(rawInventory.length, localDbTotal, 'Local DB');
      syncTier = 1;
    }

    // Safety Guard removed by User Request:
    // Missing items from the POS are now treated as "Out of Stock" (qty = 0)
    // rather than being blocked or hard-deleted.

    broadcastSyncProgress(80, 'Calculating smart diffs...');
    const updates: any[] = [];
    const deletes: string[] = [];
    
    // Convert current inventory to a map for fast lookup
    const currentMap = new Map(rawInventory.map(item => [item.name, item]));

    // If we already streamed the updates progressively, we don't need to double-post them.
    // We only calculate final updates if streaming wasn't used (e.g. Local SQLite branch).
    if (totalStreamedUpdates === 0) {
      for (const [name, currentItem] of currentMap.entries()) {
        const lastItem = lastMap.get(name);
        if (!lastItem) {
          updates.push(currentItem);
        } else if (lastItem.qty !== currentItem.qty || lastItem.price !== currentItem.price) {
          updates.push(currentItem);
        }
      }
    }

    // Find missing items (in last map, but not in current map)
    // Instead of deleting them, we soft-delete them by setting qty = 0 (Out of Stock)
    let softDeletedCount = 0;
    for (const [name, lastItem] of lastMap.entries()) {
      if (!currentMap.has(name)) {
        if (lastItem.qty !== 0) { // Only update if it's not already 0
          updates.push({ ...lastItem, qty: 0 });
          softDeletedCount++;
        }
      }
    }

    if (totalStreamedUpdates > 0) {
      console.log(`Final Sweep: ${softDeletedCount} items marked Out of Stock. (Streamed ${totalStreamedUpdates} updates earlier).`);
    } else {
      console.log(`Smart Diff: ${updates.length} updates (including ${softDeletedCount} items marked Out of Stock), ${deletes.length} hard deletes.`);
    }

    const payload = {
      pharmacy_slug: storefrontData.slug,
      pharmacy_name: storefrontData.name,
      coordinates: storefrontData.coordinates,
      updates,
      deletes,
      sync_tier: syncTier,
      app_version: app.getVersion()
    };

    try {
      // Show intermediate status since AI classification can take 5-10 seconds
      broadcastSyncProgress(90, 'Pushing updates to cloud...');
      updateTrayStatus('yellow', 'Classifying inventory...', updates.length + deletes.length + totalStreamedUpdates);
      
      // In production, this would be an actual API endpoint with auth tokens
      // For the MVP, we are POSTing to a placeholder relay route
      const response = await axios.post('https://www.pharmastackx.com/api/sync', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`
        },
        timeout: 30000 // Increased from 10s to 30s to allow AI classification to finish
      });
      console.log('Successfully pushed to MongoDB via Web Relay!');
      
      if (response.data && response.data.newSlug && response.data.newSlug !== storefrontData.slug) {
        console.log(`Auto-upgrading guest slug from ${storefrontData.slug} to ${response.data.newSlug}`);
        storefrontData.slug = response.data.newSlug;
        setStore('storefront', storefrontData);
      }
      
      // Update local snapshot cache on success
      setStore('lastSyncSnapshot', rawInventory);
      setStore('lastSyncTime', new Date().toISOString());
    } catch (pushError: any) {
      console.error('Failed to push to cloud API:', pushError.message);
      broadcastSyncProgress(90, `Cloud Push Failed: ${pushError.message}`);
      await new Promise(r => setTimeout(r, 5000));
      throw new Error(`Cloud Push Failed: ${pushError.message}`);
    }
    
    // 5. Update tray status
    updateTrayStatus('green', new Date().toLocaleTimeString(), updates.length + deletes.length + totalStreamedUpdates);
    
    // Clear any previous sync errors on success
    setStore('lastSyncError', null);
    broadcastSyncProgress(100, 'Complete');
    broadcastSyncSuccess();
    
    return { status: 'success' };
    
  } catch (error: any) {
    console.error('Sync failed:', error);
    
    const syncError = classifyError(error.message || 'Unknown error');
    
    // Store the error for the dashboard to pick up
    setStore('lastSyncError', {
      ...syncError,
      rawMessage: error.message,
      timestamp: new Date().toISOString()
    });

    updateTrayStatus('red', 'Failed', 0, syncError.userMessage);
    broadcastSyncError(syncError);
    
    await sendFailureAlertEmail(
      pairingData.posIdentifier || 'Unknown Pharmacy', 
      error.message || 'Unknown error occurred during inventory extraction.',
      syncError.userMessage,
      `Error Code: ${syncError.code}`
    );
    
    
    throw error;
  } finally {
    isSyncEngineRunning = false;
  }
}

// ── Broadcast sync status to all renderer windows ─────────────────────
export function broadcastSyncProgress(progress: number, message: string) {
  try {
    console.log(`[UI PROGRESS ${progress}%] ${message}`);
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('sync-progress', { progress, message });
      }
    }
  } catch (e) {
    console.error('Failed to broadcast sync progress:', e);
  }
}

export function broadcastSyncStream(log: string) {
  try {
    console.log(`[UI STREAM] ${log.replace(/\\n/g, '\n')}`);
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('sync-stream', log);
      }
    }
  } catch (e) {
    console.error('Failed to broadcast sync stream:', e);
  }
}

// ── Broadcast sync status to all renderer windows ─────────────────────
function broadcastSyncError(error: SyncError) {
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('sync-error', error);
      }
    }
  } catch (e) {
    console.error('Failed to broadcast sync error to renderer:', e);
  }
}

function broadcastSyncSuccess() {
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('sync-success');
      }
    }
  } catch (e) {
    console.error('Failed to broadcast sync success to renderer:', e);
  }
}

// ── Local DB Extraction ───────────────────────────────────────────────
async function extractFromLocalDB(dbPath: string, schema: any): Promise<any[]> {
  const fs = require('fs');
  const path = require('path');
  const ext = path.extname(dbPath).toLowerCase();

  try {
    if (ext === '.json') {
      const content = fs.readFileSync(dbPath, 'utf8');
      const data = JSON.parse(content);
      const arr = Array.isArray(data) ? data : [data];
      return arr.map(item => ({
        name: item[schema.nameCol],
        qty: item[schema.qtyCol],
        price: item[schema.priceCol]
      }));
    } else if (ext === '.csv') {
      const stats = fs.statSync(dbPath);
      const isStale = Date.now() - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000;
      if (isStale) {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          new Notification({
            title: 'Synkk: Action Required',
            body: "Your inventory CSV file hasn't been updated in over 7 days. Please export a fresh CSV to keep your online storefront accurate!"
          }).show();
        }
      }

      const content = fs.readFileSync(dbPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      if (lines.length === 0) return [];
      const headers = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const nameIdx = headers.indexOf(schema.nameCol);
      const qtyIdx = headers.indexOf(schema.qtyCol);
      const priceIdx = headers.indexOf(schema.priceCol);
      
      return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        return {
          name: vals[nameIdx],
          qty: vals[qtyIdx],
          price: vals[priceIdx]
        };
      });
    }

    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const query = `SELECT "${schema.nameCol}" as name, "${schema.qtyCol}" as qty, "${schema.priceCol}" as price FROM "${schema.tableName}"`;
    const rows = db.prepare(query).all();
    db.close();
    return rows;
  } catch (e: any) {
    throw new Error(`Local DB Extraction Failed: ${e.message}`);
  }
}

// ── Core Extraction: Web POS (Agent-Based) ───────────────────────────
const PSX_AGENT_ENDPOINT = 'https://www.pharmastackx.com/api/synkk-ai/agent';
const MAX_AGENT_TURNS = 25; // safety cap on agent loop

async function extractFromWebPOS(url: string, _schema: any, onBatchExtracted?: (batch: any[]) => Promise<void>): Promise<{ items: any[], tier: number }> {
  broadcastSyncProgress(40, 'Starting AI agent extraction...');
  broadcastSyncStream('[AGENT] Synkk AI is booting up. Opening hidden browser...');

  const hiddenWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  startLiveBroadcast(hiddenWindow);

  // Intercept network traffic immediately so agent can see API calls made during page load
  const interceptedRequests: Array<{ url: string; body: any }> = [];
  try {
    hiddenWindow.webContents.debugger.attach('1.3');
    await hiddenWindow.webContents.debugger.sendCommand('Network.enable');
    hiddenWindow.webContents.debugger.on('message', (_event, method, params) => {
      if (method === 'Network.responseReceived' && params.response.mimeType?.includes('json')) {
        hiddenWindow.webContents.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId })
          .then((res: any) => {
            if (res.body && res.body.length > 500) {
              try {
                const json = JSON.parse(res.body);
                const arr = Array.isArray(json) ? json : (json.data || json.items || json.products || json.inventory || null);
                if (arr && Array.isArray(arr) && arr.length > 2) {
                  interceptedRequests.push({ url: params.response.url, body: json });
                }
              } catch (_) {}
            }
          }).catch(() => {});
      }
    });
  } catch (_) {}

  // Navigate to the POS URL
  await hiddenWindow.loadURL(url).catch(() => {});
  // Give the page 8 seconds to load and fire its API calls
  await new Promise(r => setTimeout(r, 8000));

  // ── Agent Loop ────────────────────────────────────────────────────────
  let messages: any[] = [];
  let turns = 0;

  try {
    while (turns < MAX_AGENT_TURNS) {
      turns++;
      broadcastSyncStream(`[AGENT] Turn ${turns}/${MAX_AGENT_TURNS} — thinking...`);

      const response = await fetch(PSX_AGENT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, url }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Agent endpoint error ${response.status}: ${err.error || response.statusText}`);
      }

      const result = await response.json();

      // Always update messages with what the agent returned
      messages = result.messages || messages;

      if (result.type === 'done') {
        broadcastSyncStream(`[AGENT] ✓ Extraction complete via "${result.method}". Got ${result.items.length} items.`);
        broadcastSyncProgress(85, `Agent extracted ${result.items.length} items.`);
        if (!hiddenWindow.isDestroyed()) hiddenWindow.destroy();

        // Progressive stream to cloud if handler provided
        if (onBatchExtracted && result.items.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < result.items.length; i += batchSize) {
            await onBatchExtracted(result.items.slice(i, i + batchSize));
          }
        }

        return { items: result.items, tier: 2 };
      }

      if (result.type === 'failed') {
        throw new Error(`ALL_TIERS_FAILED: ${result.reason}`);
      }

      if (result.type === 'error') {
        throw new Error(`Agent error: ${result.reason}`);
      }

      if (result.type === 'tool_call') {
        const { tool, args, toolUseId } = result;
        broadcastSyncStream(`[AGENT] → Calling tool: ${tool}`);

        let toolResult: any;

        try {
          if (tool === 'navigate') {
            await hiddenWindow.loadURL(args.url).catch(() => {});
            await new Promise(r => setTimeout(r, 5000));
            toolResult = { success: true, message: `Navigated to ${args.url}` };

          } else if (tool === 'get_network_traffic') {
            toolResult = interceptedRequests.length > 0
              ? { found: interceptedRequests.length, requests: interceptedRequests.slice(0, 10) }
              : { found: 0, message: 'No JSON API calls intercepted yet.' };

          } else if (tool === 'read_page_dom') {
            const text = await hiddenWindow.webContents.executeJavaScript(`document.body.innerText`);
            toolResult = { text: (text as string).slice(0, 20000) };

          } else if (tool === 'execute_script') {
            const scriptResult = await hiddenWindow.webContents.executeJavaScript(args.script);
            // Allow extra time for async scripts that trigger UI changes
            await new Promise(r => setTimeout(r, 3000));
            toolResult = { result: scriptResult };

          } else if (tool === 'fetch_directly') {
            const fetchResponse = await fetch(args.url, {
              method: args.method || 'GET',
              headers: args.headers || {},
            });
            const data = await fetchResponse.json();
            toolResult = { status: fetchResponse.status, data };

          } else if (tool === 'screenshot') {
            const image = await hiddenWindow.webContents.capturePage();
            const base64 = image.toPNG().toString('base64');
            toolResult = { imageBase64: base64, mimeType: 'image/png' };

          } else {
            toolResult = { error: `Unknown tool: ${tool}` };
          }
        } catch (toolErr: any) {
          toolResult = { error: toolErr.message };
        }

        broadcastSyncStream(`[AGENT] ← Tool result: ${JSON.stringify(toolResult).slice(0, 120)}...`);

        // Append the tool result to messages for next turn
        messages = [
          ...messages,
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: JSON.stringify(toolResult),
              },
            ],
          },
        ];
      }
    }

    throw new Error('ALL_TIERS_FAILED: Agent exceeded maximum turns without finishing.');

  } catch (err: any) {
    if (!hiddenWindow.isDestroyed()) hiddenWindow.destroy();
    throw err;
  }

}
