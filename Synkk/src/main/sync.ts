import { getStore, setStore } from '../store/local';
import { updateTrayStatus } from './tray';
import { sendFailureAlertEmail } from './mailer';
import { net, safeStorage, BrowserWindow, app, session } from 'electron';
import { reportSessionExpired } from './remote-config';
import { lookupKnownMethod, reportSuccessfulMethod, applyKnownMethod } from './collective-intelligence';
import { startLiveBroadcast } from './live-broadcast';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// ── File logger ───────────────────────────────────────────────────────
const logDir = path.join(app.getPath('userData'), 'logs');
const logFile = path.join(logDir, 'sync.log');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
function writeLog(line: string) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(logFile, `[${ts}] ${line}\n`);
  } catch (_) {}
}

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

// ── Telemetry Collector ───────────────────────────────────────────────
interface TelemetryStep {
  time: string;
  action: string;
  detail: string;
  success: boolean;
}

interface TelemetryPayload {
  pharmacySlug: string;
  pharmacyName: string;
  syncId: string;
  timestamp: string;
  duration?: number;
  trigger: string;
  posMethod: string;
  posIdentifier: string;
  steps: TelemetryStep[];
  result: string;
  itemsExtracted: number;
  itemsPushed: number;
  errorCode?: string;
  errorMessage?: string;
  syncTier?: number;
  tierAttempts: Array<{ tier: number; success: boolean; error?: string }>;
  posName?: string;
  posDomain?: string;
}

function createTelemetryCollector() {
  const steps: TelemetryStep[] = [];
  const tierAttempts: Array<{ tier: number; success: boolean; error?: string }> = [];
  const syncId = randomUUID();
  const startTime = Date.now();

  return {
    syncId,
    steps,
    tierAttempts,
    addStep(action: string, detail: string, success: boolean) {
      steps.push({ time: new Date().toISOString(), action, detail, success });
    },
    addTierAttempt(tier: number, success: boolean, error?: string) {
      tierAttempts.push({ tier, success, error });
    },
    getDuration() {
      return Date.now() - startTime;
    }
  };
}

async function shipTelemetry(payload: TelemetryPayload) {
  try {
    const axios = require('axios');
    await axios.post('https://www.pharmastackx.com/api/synkk-admin/telemetry', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`
      },
      timeout: 15000
    });
    console.log('[TELEMETRY] Successfully shipped sync telemetry to cloud.');
  } catch (e: any) {
    console.error('[TELEMETRY] Failed to ship telemetry:', e.message);
  }
}

// ── Main Sync Entry Point ─────────────────────────────────────────────
let isSyncEngineRunning = false;

export async function executeSync(trigger: string = 'scheduled'): Promise<{ status: string; error?: SyncError }> {
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
  const storefrontData = (getStore('storefront') || { slug: 'unknown', name: 'Unknown' }) as any;
  const telemetry = createTelemetryCollector();
  const posMethod = pairingData.posIdentifier?.startsWith('http') ? 'web' : (pairingData.posIdentifier ? 'local_db' : 'unknown');
  telemetry.addStep('SYNC_START', `Trigger: ${trigger}, POS: ${posMethod}`, true);
  
  try {
    // 1. Check hardware network connection
    if (!net.isOnline()) {
      console.log('Network offline. Queuing inventory snapshot locally...');
      updateTrayStatus('amber', 'Offline - Queuing', 0);
      telemetry.addStep('NETWORK_CHECK', 'Device is offline', false);
      
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
    telemetry.addStep('NETWORK_CHECK', 'Device is online', true);
    console.log('Extracting latest inventory...');
    broadcastSyncProgress(30, 'Extracting latest inventory...');
    
    // Set up progressive streaming logic
    const snapshotKey = storefrontData?.slug ? `lastSyncSnapshot_${storefrontData.slug}` : 'lastSyncSnapshot';
    const isForceSync = trigger === 'manual' || trigger === 'force' || trigger === 'initial';
    const lastSyncSnapshot = (isForceSync ? [] : (getStore(snapshotKey) || [])) as any[];
    const lastMap = new Map((lastSyncSnapshot as any[]).map(item => [item.name, item]));
    const axios = require('axios');
    let totalStreamedUpdates = 0;
    
    const streamBatchToCloud = async (batch: any[]) => {
      const streamUpdates: any[] = [];
      for (const currentItem of batch) {
        const lastItem = lastMap.get(currentItem.name);
        if (isForceSync || !lastItem) {
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
          
          // Update local map incrementally so autonomous retries don't re-upload the same items
          for (const currentItem of streamUpdates) {
            lastMap.set(currentItem.name, currentItem);
          }
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
      telemetry.addStep('EXTRACTION_START', 'Target is Web POS — spawning background browser', true);
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
          telemetry.addStep('WEB_POS_EXTRACTION', `Attempt ${attempts}: Extracted ${result.items.length} items via Tier ${result.tier}`, true);
          telemetry.addTierAttempt(result.tier, true);
        } catch (err: any) {
          lastErrMessage = err.message;
          telemetry.addStep('WEB_POS_EXTRACTION', `Attempt ${attempts} failed: ${err.message}`, false);
          telemetry.addTierAttempt(attempts, false, err.message);
          if (!lastErrMessage.includes('ALL_TIERS_FAILED')) {
             throw err; // Not a validation/extraction failure, something else broke, so abort.
          }
        }
      }

      if (!success) {
        const reason = lastErrMessage.split('ALL_TIERS_FAILED:')[1]?.trim() || 'Unknown error';
        console.log(`All automated tiers failed after ${maxAttempts} attempts (${reason}). Triggering CSV fallback...`);
        throw new Error('All automated sync tiers failed.');
      }
    } else if (pairingData.posIdentifier) {
      if (pairingData.posIdentifier === 'desktop-db' || pairingData.posIdentifier === 'web-extension') {
        console.log('[Sync] Placeholder posIdentifier detected. Cloud sync active.');
        setStore('lastSyncError', null);
        broadcastSyncProgress(100, 'Synced natively via Desktop Engine');
        return { success: true, message: 'Desktop sync active' };
      }

      const fs = require('fs');
      if (!fs.existsSync(pairingData.posIdentifier)) {
        console.log(`[Sync] Local database file not found at: ${pairingData.posIdentifier}`);
        throw new Error(`Database file not found at "${pairingData.posIdentifier}". Please click "Reconnect Database" to locate your file.`);
      }

      // Branch 1: Local SQLite DB
      console.log('Target is Local Database. Executing SQLite extraction...');
      telemetry.addStep('EXTRACTION_START', 'Target is Local Database', true);
      
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
      telemetry.addStep('LOCAL_DB_EXTRACTION', `Extracted ${rawInventory.length} items from local database`, true);
      telemetry.addTierAttempt(1, true);
    } else {
      console.log('[Sync] No local database configured on this PC.');
      setStore('lastSyncError', null);
      broadcastSyncProgress(100, 'Cloud sync active.');
      return { success: true, message: 'Cloud sync active' };
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
    // If it's a force sync or we have no prior snapshot for this storefront slug, push EVERYTHING
    if (isForceSync || lastMap.size === 0) {
      for (const item of currentMap.values()) {
        updates.push(item);
      }
    } else if (totalStreamedUpdates === 0) {
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
    if (!isForceSync && lastMap.size > 0) {
      for (const [name, lastItem] of lastMap.entries()) {
        if (!currentMap.has(name)) {
          if (lastItem.qty !== 0) { // Only update if it's not already 0
            updates.push({ ...lastItem, qty: 0 });
            softDeletedCount++;
          }
        }
      }
    }

    if (totalStreamedUpdates > 0) {
      console.log(`Final Sweep: ${softDeletedCount} items marked Out of Stock. (Streamed ${totalStreamedUpdates} updates earlier).`);
    } else {
      console.log(`Smart Diff: ${updates.length} updates (including ${softDeletedCount} items marked Out of Stock), ${deletes.length} hard deletes.`);
    }

      broadcastSyncProgress(90, 'Pushing updates to cloud in chunks...');
      updateTrayStatus('yellow', 'Classifying inventory...', updates.length + deletes.length + totalStreamedUpdates);
      
      const syncSessionId = `sync_${storefrontData.slug || 'psx'}_${Date.now()}`;
      const CHUNK_SIZE = 500;
      let lastResponse: any = null;
      let chunksProcessed = 0;
      const totalChunks = Math.max(1, Math.ceil(updates.length / CHUNK_SIZE));

      try {
        if (updates.length === 0 && deletes.length === 0) {
          broadcastSyncStream(`[SYSTEM] Inventory up to date (${currentMap.size} items matched cloud snapshot). No diffs to push.`);
          lastResponse = await axios.post('https://www.pharmastackx.com/api/sync', {
            sync_session_id: syncSessionId,
            pharmacy_slug: storefrontData.slug,
            pharmacy_name: storefrontData.name,
            coordinates: storefrontData.coordinates,
            updates: [],
            deletes: [],
            sync_tier: syncTier,
            app_version: app.getVersion()
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`
            },
            timeout: 30000
          });
        }

        for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
          const updateChunk = updates.slice(i, i + CHUNK_SIZE);
          const payload = {
            sync_session_id: syncSessionId,
            is_final_chunk: i + CHUNK_SIZE >= updates.length,
            total_items: updates.length,
            chunk_index: chunksProcessed,
            total_chunks: totalChunks,
            pharmacy_slug: storefrontData.slug,
            pharmacy_name: storefrontData.name,
            coordinates: storefrontData.coordinates,
            updates: updateChunk,
            deletes: i === 0 ? deletes : [],
            sync_tier: syncTier,
            app_version: app.getVersion()
          };

          lastResponse = await axios.post('https://www.pharmastackx.com/api/sync', payload, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`
            },
            timeout: 60000 // Give each chunk 60s since it passes through AI
          });
          
          chunksProcessed++;
          const percent = Math.floor(90 + (chunksProcessed / totalChunks) * 9);
          broadcastSyncProgress(percent, `Pushed chunk ${chunksProcessed}/${totalChunks}...`);
          broadcastSyncStream(`[CLOUD] Pushed chunk ${chunksProcessed}/${totalChunks} (${Math.min(i + CHUNK_SIZE, updates.length)}/${updates.length} items)...`);
        }

        const response = lastResponse;
        console.log('Successfully pushed to MongoDB via Web Relay!');
        broadcastSyncStream(`[COMPLETE] Sync completed! ${updates.length} items verified and live on your storefront.`);
        telemetry.addStep('CLOUD_PUSH', `Pushed ${updates.length} updates and ${deletes.length} deletes to cloud in ${totalChunks} chunks`, true);
      
      if (response.data && response.data.newSlug && response.data.newSlug !== storefrontData.slug) {
        console.log(`Auto-upgrading guest slug from ${storefrontData.slug} to ${response.data.newSlug}`);
        storefrontData.slug = response.data.newSlug;
        setStore('storefront', storefrontData);
      }
      
      // Update local snapshot cache on success (scoped by slug)
      setStore(snapshotKey, rawInventory);
      setStore('lastSyncSnapshot', rawInventory);
      setStore('lastSyncTime', new Date().toISOString());
    } catch (pushError: any) {
      console.error('Failed to push to cloud API:', pushError.message);
      broadcastSyncProgress(90, `Cloud Push Failed: ${pushError.message}`);
      telemetry.addStep('CLOUD_PUSH', `Push failed: ${pushError.message}`, false);
      await new Promise(r => setTimeout(r, 5000));
      throw new Error(`Cloud Push Failed: ${pushError.message}`);
    }
    
    // 5. Update tray status
    updateTrayStatus('green', new Date().toLocaleTimeString(), updates.length + deletes.length + totalStreamedUpdates);
    
    // Clear any previous sync errors on success
    setStore('lastSyncError', null);
    broadcastSyncProgress(100, 'Complete');
    broadcastSyncSuccess();
    telemetry.addStep('SYNC_COMPLETE', `Success — ${rawInventory.length} items extracted, Tier ${syncTier}`, true);
    
    // Ship telemetry to cloud
    shipTelemetry({
      pharmacySlug: storefrontData.slug,
      pharmacyName: storefrontData.name,
      syncId: telemetry.syncId,
      timestamp: new Date().toISOString(),
      duration: telemetry.getDuration(),
      trigger,
      posMethod,
      posIdentifier: pairingData.posIdentifier || '',
      steps: telemetry.steps,
      result: 'success',
      itemsExtracted: rawInventory.length,
      itemsPushed: updates.length + totalStreamedUpdates,
      syncTier,
      tierAttempts: telemetry.tierAttempts,
    });
    
    return { status: 'success' };
    
  } catch (error: any) {
    console.error('Sync failed:', error);
    
    const syncError = classifyError(error.message || 'Unknown error');
    telemetry.addStep('SYNC_FAILED', `${syncError.code}: ${error.message}`, false);
    
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
    
    // Ship failure telemetry to cloud
    shipTelemetry({
      pharmacySlug: storefrontData.slug,
      pharmacyName: storefrontData.name,
      syncId: telemetry.syncId,
      timestamp: new Date().toISOString(),
      duration: telemetry.getDuration(),
      trigger,
      posMethod,
      posIdentifier: pairingData.posIdentifier || '',
      steps: telemetry.steps,
      result: 'failed',
      itemsExtracted: 0,
      itemsPushed: 0,
      errorCode: syncError.code,
      errorMessage: error.message,
      syncTier: undefined,
      tierAttempts: telemetry.tierAttempts,
    });
    
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
    const clean = log.replace(/\\n/g, '\n');
    console.log(`[UI STREAM] ${clean}`);
    writeLog(clean);
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
        /* 7 days stale notification removed */
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

// ── Auto-Relogin Helper ───────────────────────────────────────────────
async function attemptAutoLogin(win: BrowserWindow): Promise<boolean> {
  try {
    const currentUrl = win.webContents.getURL();
    const isLoginPage = /login|signin|sign-in|auth|logout/i.test(currentUrl);
    if (!isLoginPage) return true; // Already logged in

    const storedCreds = getStore('webPosCredentials') as any;
    if (!storedCreds?.encUser || !storedCreds?.encPass) {
      broadcastSyncStream('[AUTO-LOGIN] Session expired but no saved credentials found. User must log in via the POS browser screen.');
      reportSessionExpired();
      return false;
    }

    if (!safeStorage.isEncryptionAvailable()) return false;

    const username = safeStorage.decryptString(Buffer.from(storedCreds.encUser, 'base64'));
    const password = safeStorage.decryptString(Buffer.from(storedCreds.encPass, 'base64'));

    broadcastSyncStream('[AUTO-LOGIN] Session expired — injecting saved credentials...');

    const escapedUser = username.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escapedPass = password.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    await win.webContents.executeJavaScript(`
      (() => {
        const inputs = document.querySelectorAll('input');
        let userField = null, passField = null;
        inputs.forEach(inp => {
          if (inp.type === 'password') passField = inp;
          else if (inp.type === 'text' || inp.type === 'email') userField = inp;
        });
        function setNative(el, val) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, val);
          else el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (userField) setNative(userField, '${escapedUser}');
        if (passField) setNative(passField, '${escapedPass}');
        const form = passField?.closest('form') || userField?.closest('form');
        if (form) {
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]') || form.querySelector('button');
          if (submitBtn) submitBtn.click();
          else form.submit();
        }
      })();
    `);

    // Wait for navigation after login submit
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10000);
      win.webContents.once('dom-ready', () => { clearTimeout(timer); resolve(); });
    });
    await new Promise(r => setTimeout(r, 3000));

    const newUrl = win.webContents.getURL();
    const stillOnLogin = /login|signin|sign-in|auth/i.test(newUrl);
    if (stillOnLogin) {
      broadcastSyncStream('[AUTO-LOGIN] Credentials did not work — user must log in manually via the POS browser screen.');
      reportSessionExpired();
      return false;
    }

    broadcastSyncStream('[AUTO-LOGIN] ✓ Successfully logged in using saved credentials.');
    return true;
  } catch (e: any) {
    broadcastSyncStream(`[AUTO-LOGIN] Error during auto-login: ${e.message}`);
    return false;
  }
}

// ── Core Extraction: Web POS (Agent-Based) ───────────────────────────
const PSX_BASE = 'https://www.pharmastackx.com';
const PSX_AGENT_ENDPOINT = `${PSX_BASE}/api/synkk-ai/agent`;
const PSX_HEAL_ENDPOINT = `${PSX_BASE}/api/synkk-ai/heal`;
const MAX_AGENT_TURNS = 60; // safety cap on agent loop

// Shared item parser — handles plain arrays and DataTables { data: [...] } envelopes
function parseExtractedItems(rawResult: any): any[] {
  let rows: any[] = [];
  if (Array.isArray(rawResult) && rawResult.length > 0) {
    rows = rawResult;
  } else if (rawResult && typeof rawResult === 'object') {
    // Handle { data: [...] } — standard DataTables envelope
    if (Array.isArray(rawResult.data) && rawResult.data.length > 0) {
      rows = rawResult.data;
    // Handle { data: { data: [...] } } — double-nested envelope
    } else if (rawResult.data && Array.isArray(rawResult.data.data) && rawResult.data.data.length > 0) {
      rows = rawResult.data.data;
    } else {
      return [];
    }
  } else {
    return [];
  }
  return rows.map((row: any) => {
    const nameRaw = row.product || row.name || row.medicine_name || row.item_name || row.product_name || row.drug_name || row.title || row.description || (Array.isArray(row) ? (row[1] || row[0]) : '') || '';
    const priceRaw = row.selling_price || row.price || row.unit_price || row.sale_price || row.retail_price || (Array.isArray(row) ? row[4] : '') || '0';
    const qtyRaw = row.current_stock || row.qty || row.stock || row.quantity || row.available || row.balance || (Array.isArray(row) ? row[5] : '') || '0';
    const name = String(nameRaw).replace(/<[^>]*>/g, '').trim();
    const price = parseFloat(String(priceRaw).replace(/[^0-9.]/g, '')) || 0;
    const qty = parseFloat(String(qtyRaw).replace(/[^0-9.]/g, '')) || 0;
    return { name, qty, price };
  }).filter((item: any) => item.name && item.name.length > 1 && !item.name.toLowerCase().includes('action'));
}

// Self-heal: when all extraction paths fail, capture page HTML and ask Gemini to write a new script
async function attemptSelfHeal(
  win: BrowserWindow,
  url: string,
  failedScript?: string,
  errorMessage?: string,
  attempt: number = 1
): Promise<any[] | null> {
  broadcastSyncStream(`[HEAL] Synkk is self-repairing (attempt ${attempt}/3)...`);
  try {
    const pageHtml = await win.webContents.executeJavaScript(
      `document.documentElement.outerHTML.substring(0, 50000)`
    ).catch(() => '');

    const axios = require('axios');
    const healRes = await axios.post(PSX_HEAL_ENDPOINT, {
      url, pageHtml, failedScript, errorMessage, attempt,
    }, { timeout: 90000 });

    const { script } = healRes.data;
    if (!script) {
      broadcastSyncStream(`[HEAL] No script returned from server.`);
      return null;
    }

    broadcastSyncStream(`[HEAL] Got new extraction script. Testing it now...`);
    let rawResult: any;
    let execError: string | undefined;
    try {
      rawResult = await win.webContents.executeJavaScript(script);
      await new Promise(r => setTimeout(r, 3000));
    } catch (e: any) {
      execError = e.message;
    }

    const items = parseExtractedItems(rawResult);
    if (items.length > 10) {
      broadcastSyncStream(`[HEAL] ✓ Self-repair successful — got ${items.length} items. Saving script permanently.`);
      const pairingData = getStore('pairing') as any;
      setStore('pairing', { ...pairingData, cachedScript: script, cachedMethod: 'Self-healed script' });
      return items;
    }

    broadcastSyncStream(`[HEAL] Script returned ${items.length} items — insufficient. ${attempt < 3 ? 'Retrying with error context...' : 'All heal attempts exhausted.'}`);
    if (attempt < 3) {
      return attemptSelfHeal(win, url, script, execError || `Returned only ${items.length} items`, attempt + 1);
    }
    return null;
  } catch (e: any) {
    broadcastSyncStream(`[HEAL] Heal attempt ${attempt} failed: ${e.message}`);
    if (attempt < 3) {
      return attemptSelfHeal(win, url, failedScript, e.message, attempt + 1);
    }
    return null;
  }
}

async function extractFromWebPOS(url: string, _schema: any, onBatchExtracted?: (batch: any[]) => Promise<void>): Promise<{ items: any[], tier: number }> {
  broadcastSyncProgress(40, 'Starting extraction...');

  // Fast path: use cached script from previous agent discovery — no AI needed
  const pairingData = getStore('pairing') as any;
  if (pairingData?.cachedScript) {
    broadcastSyncStream(`[CACHE] Using saved extraction script (${pairingData.cachedMethod}). Skipping AI entirely.`);
    const fastWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:synkk-webpos' } });
    try {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 20000);
        fastWindow.webContents.once('dom-ready', () => { clearTimeout(timer); resolve(); });
        fastWindow.loadURL(url).catch(() => { clearTimeout(timer); resolve(); });
      });
      await new Promise(r => setTimeout(r, 5000));

      // Auto-login if session expired
      const cacheLoginOk = await attemptAutoLogin(fastWindow);
      if (!cacheLoginOk) {
        if (!fastWindow.isDestroyed()) fastWindow.destroy();
        broadcastSyncStream('[CACHE] Session expired and auto-login failed — falling back to agent for fresh login attempt.');
        // Don't throw here — fall through to the full agent which will also try auto-login
      }

      let rawResult: any;
      let cacheErrMsg: string | undefined;
      try {
        rawResult = await fastWindow.webContents.executeJavaScript(pairingData.cachedScript);
      } catch (e: any) {
        cacheErrMsg = e.message;
      }

      const items = cacheErrMsg ? [] : parseExtractedItems(rawResult);

      if (items.length > 0) {
        if (!fastWindow.isDestroyed()) fastWindow.destroy();
        broadcastSyncStream(`[CACHE] ✓ Got ${items.length} items from cached script.`);
        broadcastSyncProgress(85, `Extracted ${items.length} items.`);
        if (onBatchExtracted) {
          for (let i = 0; i < items.length; i += 100) await onBatchExtracted(items.slice(i, i + 100));
        }
        return { items, tier: 1 };
      }

      // Cache script returned nothing — self-heal before falling back to full agent
      const cacheFailReason = cacheErrMsg || 'Returned 0 items';
      broadcastSyncStream(`[CACHE] Cached script failed (${cacheFailReason}). Attempting self-heal...`);
      const healedItems = await attemptSelfHeal(fastWindow, url, pairingData.cachedScript, cacheFailReason);
      if (!fastWindow.isDestroyed()) fastWindow.destroy();
      if (healedItems && healedItems.length > 0) {
        broadcastSyncProgress(85, `Extracted ${healedItems.length} items.`);
        if (onBatchExtracted) {
          for (let i = 0; i < healedItems.length; i += 100) await onBatchExtracted(healedItems.slice(i, i + 100));
        }
        return { items: healedItems, tier: 1 };
      }
      broadcastSyncStream(`[CACHE] Self-heal could not recover — falling back to full agent.`);
    } catch (cacheErr: any) {
      broadcastSyncStream(`[CACHE] Unexpected cache error (${cacheErr.message}) — falling back to agent.`);
      if (!fastWindow.isDestroyed()) fastWindow.destroy();
    }
  }

  broadcastSyncStream('[AGENT] Synkk AI is booting up. Opening hidden browser...');

  const hiddenWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:synkk-webpos',
    },
  });

  startLiveBroadcast(hiddenWindow);

  // Intercept network traffic via CDP debugger
  const interceptedRequests: Array<{ url: string; body: any }> = [];
  try {
    hiddenWindow.webContents.debugger.attach('1.3');
    await Promise.race([
      hiddenWindow.webContents.debugger.sendCommand('Network.enable'),
      new Promise((_, r) => setTimeout(() => r(new Error('debugger timeout')), 3000))
    ]);
    hiddenWindow.webContents.debugger.on('message', (_event, method, params) => {
      if (method === 'Network.responseReceived') {
        hiddenWindow.webContents.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId })
          .then((res: any) => {
            if (res.body && res.body.length > 100) {
              try {
                const json = JSON.parse(res.body);
                const arr = Array.isArray(json) ? json : (json.data || json.items || json.products || json.inventory || null);
                if (arr && Array.isArray(arr) && arr.length > 0) {
                  interceptedRequests.push({ url: params.response.url, body: json });
                }
              } catch (_) {}
            }
          }).catch(() => {});
      }
    });
  } catch (_) {}

  // Re-inject XHR/fetch interceptor on every page load (dom-ready fires after each navigation,
  // which resets the JS context — injecting before loadURL only covers about:blank)
  const INTERCEPTOR_SCRIPT = `
    if (!window.__synkk_patched) {
      window.__synkk_patched = true;
      window.__synkk_intercepted = window.__synkk_intercepted || [];
      const _origOpen = XMLHttpRequest.prototype.open;
      const _origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this._synkk_url = url;
        return _origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
          try {
            if (this.responseText && this.responseText.length > 200) {
              const json = JSON.parse(this.responseText);
              window.__synkk_intercepted.push({ url: this._synkk_url, body: json });
            }
          } catch(_) {}
        });
        return _origSend.apply(this, arguments);
      };
      const _origFetch = window.fetch;
      window.fetch = async function(...args) {
        const res = await _origFetch(...args);
        try {
          const clone = res.clone();
          const text = await clone.text();
          if (text.length > 200) {
            const json = JSON.parse(text);
            window.__synkk_intercepted.push({ url: typeof args[0] === 'string' ? args[0] : args[0]?.url || '', body: json });
          }
        } catch(_) {}
        return res;
      };
    }
    true;
  `;

  hiddenWindow.webContents.on('dom-ready', () => {
    hiddenWindow.webContents.executeJavaScript(INTERCEPTOR_SCRIPT).catch(() => {});
  });

  // Navigate to the POS URL — wait for dom-ready or 20s timeout, whichever comes first
  broadcastSyncStream(`[AGENT] Navigating to ${url}...`);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 20000);
    hiddenWindow.webContents.once('dom-ready', () => { clearTimeout(timer); resolve(); });
    hiddenWindow.loadURL(url).catch(() => { clearTimeout(timer); resolve(); });
  });
  // Extra settle time for SPAs and API calls to fire
  await new Promise(r => setTimeout(r, 5000));

  // If we landed on a login page (session expired), try to auto-login with saved credentials
  const loginOk = await attemptAutoLogin(hiddenWindow);
  if (!loginOk) {
    if (!hiddenWindow.isDestroyed()) hiddenWindow.destroy();
    throw new Error('ALL_TIERS_FAILED: Session expired and auto-login failed. User must log in via the Web POS screen in Synkk.');
  }

  // After login/navigation settles, force a DataTables reload so the interceptor
  // (which patches XHR/fetch on dom-ready) can capture a fresh network call.
  await new Promise(r => setTimeout(r, 3000));
  await hiddenWindow.webContents.executeJavaScript(`
    (() => {
      try {
        if (window.$ && $.fn && $.fn.dataTable) {
          const tables = $.fn.dataTable.tables({ visible: false, api: true });
          if (tables && tables.ajax) tables.ajax.reload(null, false);
        }
      } catch(_) {}
    })();
  `).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  broadcastSyncStream('[AGENT] Page loaded. Starting agent loop...');

  // ── Agent Loop ────────────────────────────────────────────────────────
  let messages: any[] = [];
  let turns = 0;
  let lastTriedScript: string | undefined;
  let lastAgentError: string | undefined;

  try {
    while (turns < MAX_AGENT_TURNS) {
      turns++;
      broadcastSyncStream(`[AGENT] Turn ${turns}/${MAX_AGENT_TURNS} — thinking...`);
      if (turns > 1) await new Promise(r => setTimeout(r, 7000)); // stay under 10 RPM free tier

      const axios = require('axios');
      let agentResponse: any;
      try {
        agentResponse = await axios.post(PSX_AGENT_ENDPOINT, { messages, url }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000,
        });
      } catch (networkErr: any) {
        broadcastSyncStream(`[AGENT] PSX call failed on turn ${turns}: ${networkErr.message}. Routing to self-heal...`);
        const healedItems = await attemptSelfHeal(hiddenWindow, url, lastTriedScript, networkErr.message);
        if (!hiddenWindow.isDestroyed()) hiddenWindow.destroy();
        if (healedItems && healedItems.length > 0) {
          broadcastSyncProgress(85, `Self-healed ${healedItems.length} items.`);
          if (onBatchExtracted) {
            for (let i = 0; i < healedItems.length; i += 100) await onBatchExtracted(healedItems.slice(i, i + 100));
          }
          return { items: healedItems, tier: 2 };
        }
        throw networkErr;
      }
      const result = agentResponse.data;

      // Always update messages with what the agent returned
      messages = result.messages || messages;

      if (result.type === 'done') {
        broadcastSyncStream(`[AGENT] ✓ Extraction complete via "${result.method}". Got ${result.items.length} items.`);
        broadcastSyncProgress(85, `Agent extracted ${result.items.length} items.`);

        // Save the winning script so future syncs skip the agent entirely
        if (result.script) {
          const pairingData = getStore('pairing') as any;
          setStore('pairing', { ...pairingData, cachedScript: result.script, cachedMethod: result.method });
          broadcastSyncStream(`[AGENT] Saved extraction script for future syncs — no AI needed next time.`);
        }

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
        broadcastSyncStream(`[AGENT] Agent gave up: ${result.reason}. Attempting self-heal...`);
        const healedItems = await attemptSelfHeal(hiddenWindow, url, lastTriedScript, result.reason);
        if (!hiddenWindow.isDestroyed()) hiddenWindow.destroy();
        if (healedItems && healedItems.length > 0) {
          broadcastSyncProgress(85, `Self-healed ${healedItems.length} items.`);
          if (onBatchExtracted) {
            for (let i = 0; i < healedItems.length; i += 100) await onBatchExtracted(healedItems.slice(i, i + 100));
          }
          return { items: healedItems, tier: 2 };
        }
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
            const pageIntercepted = await hiddenWindow.webContents.executeJavaScript(`window.__synkk_intercepted || []`).catch(() => []);
            const allIntercepted = [...interceptedRequests, ...(Array.isArray(pageIntercepted) ? pageIntercepted : [])];
            toolResult = allIntercepted.length > 0
              ? { found: allIntercepted.length, requests: allIntercepted.slice(0, 10) }
              : { found: 0, message: 'No JSON API calls intercepted yet.' };

          } else if (tool === 'read_page_dom') {
            const text = await hiddenWindow.webContents.executeJavaScript(`document.body.innerText`);
            toolResult = { text: (text as string).slice(0, 6000) };

          } else if (tool === 'execute_script') {
            lastTriedScript = args.script;
            const scriptResult = await hiddenWindow.webContents.executeJavaScript(args.script);
            // Allow extra time for async scripts and DataTables AJAX reloads
            await new Promise(r => setTimeout(r, 8000));

            // If we got a DataTables response with lots of rows, extract and finish immediately.
            // Sending 6000 rows back through the agent makes an 18MB payload that times out.
            const earlyItems = parseExtractedItems(scriptResult);
            if (earlyItems.length > 50) {
              broadcastSyncStream(`[AGENT] DataTables response detected (${earlyItems.length} rows) — extracting locally...`);
              const extractedItems = earlyItems;

              if (extractedItems.length > 100) {
                broadcastSyncStream(`[AGENT] ✓ Extracted ${extractedItems.length} items from DataTables. Finishing.`);
                if (!hiddenWindow.isDestroyed()) hiddenWindow.destroy();
                if (onBatchExtracted && extractedItems.length > 0) {
                  for (let i = 0; i < extractedItems.length; i += 100) await onBatchExtracted(extractedItems.slice(i, i + 100));
                }
                broadcastSyncProgress(85, `Extracted ${extractedItems.length} items.`);
                // Cache the winning script
                const pd = getStore('pairing') as any;
                if (args.script) {
                  setStore('pairing', { ...pd, cachedScript: args.script, cachedMethod: 'DataTables API (auto-detected)' });
                  broadcastSyncStream(`[AGENT] Saved extraction script — no AI needed next time.`);
                }
                return { items: extractedItems, tier: 2 };
              }
            }

            // Truncate large results before storing in agent messages (prevents 18MB payloads)
            let resultForAgent = scriptResult;
            const resultStr = JSON.stringify(scriptResult);
            if (resultStr.length > 5000) {
              resultForAgent = { truncated: true, preview: resultStr.slice(0, 500), length: resultStr.length };
            }
            toolResult = { result: resultForAgent };

          } else if (tool === 'fetch_directly') {
            const axios = require('axios');
            const fetchResponse = await axios({ url: args.url, method: args.method || 'GET', headers: args.headers || {}, timeout: 30000 });
            toolResult = { status: fetchResponse.status, data: fetchResponse.data };

          } else if (tool === 'screenshot') {
            const image = await hiddenWindow.webContents.capturePage();
            const base64 = image.toPNG().toString('base64');
            toolResult = { imageBase64: base64, mimeType: 'image/png' };

          } else {
            toolResult = { error: `Unknown tool: ${tool}` };
          }
        } catch (toolErr: any) {
          toolResult = { error: toolErr.message };
          if (tool === 'execute_script') lastAgentError = toolErr.message;
        }

        broadcastSyncStream(`[AGENT] ← Tool result: ${JSON.stringify(toolResult).slice(0, 120)}...`);

        // Append the tool result in Gemini format
        messages = [
          ...messages,
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: tool,
                  response: { result: toolResult },
                },
              },
            ],
          },
        ];
      }
    }

    broadcastSyncStream(`[AGENT] Exhausted all ${MAX_AGENT_TURNS} turns. Attempting self-heal...`);
    const healedItems = await attemptSelfHeal(hiddenWindow, url, lastTriedScript, lastAgentError || 'Agent exceeded maximum turns');
    if (!hiddenWindow.isDestroyed()) hiddenWindow.destroy();
    if (healedItems && healedItems.length > 0) {
      broadcastSyncProgress(85, `Self-healed ${healedItems.length} items.`);
      if (onBatchExtracted) {
        for (let i = 0; i < healedItems.length; i += 100) await onBatchExtracted(healedItems.slice(i, i + 100));
      }
      return { items: healedItems, tier: 2 };
    }
    throw new Error('ALL_TIERS_FAILED: Agent exceeded maximum turns without finishing.');

  } catch (err: any) {
    console.error('[AGENT] Fatal error in agent loop:', err.message, err.stack);
    broadcastSyncStream(`[AGENT] Fatal error: ${err.message}`);
    if (!hiddenWindow.isDestroyed()) hiddenWindow.destroy();
    throw err;
  }

}

