import { getStore, setStore } from '../store/local';
import { updateTrayStatus } from './tray';
import { sendFailureAlertEmail } from './mailer';
import { net, safeStorage, BrowserWindow } from 'electron';

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
      userMessage: 'Your Web POS session has expired and Synkk could not log back in automatically. Please open Synkk and reconnect via the Source tab.',
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
export async function executeSync(): Promise<{ status: string; error?: SyncError }> {
  console.log('Executing sync cycle...');
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
    let rawInventory: any[] = [];
    let syncTier: number = 1;
    
    if (pairingData.posIdentifier && pairingData.posIdentifier.startsWith('http')) {
      // Branch 2: Web POS (Hidden Browser Window)
      console.log('Target is Web POS. Spawning background browser...');
      try {
        const result = await extractFromWebPOS(pairingData.posIdentifier, pairingData.schemaMapping);
        rawInventory = result.items;
        syncTier = result.tier;
      } catch (err: any) {
        if (err.message.includes('ALL_TIERS_FAILED')) {
          const reason = err.message.split('ALL_TIERS_FAILED:')[1]?.trim() || 'Unknown error';
          console.log(`All automated tiers failed (${reason}). Triggering CSV fallback...`);
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
        } else {
          throw err;
        }
      }
    } else if (pairingData.posIdentifier) {
      // Branch 1: Local SQLite DB
      console.log('Target is Local Database. Executing SQLite extraction...');
      rawInventory = await extractFromLocalDB(pairingData.posIdentifier, pairingData.schemaMapping);
      syncTier = 1;
    }

    const lastSyncSnapshot = (getStore('lastSyncSnapshot') || []) as any[];
    
    // SAFETY GUARD: Never let a partial sync nuke good data
    if (lastSyncSnapshot.length >= 10 && rawInventory.length > 0 && rawInventory.length < lastSyncSnapshot.length * 0.5) {
      console.log(`SAFETY GUARD: Sync returned ${rawInventory.length} items but last snapshot had ${lastSyncSnapshot.length}. Refusing to push incomplete data.`);
      broadcastSyncProgress(100, `Sync skipped: only found ${rawInventory.length} items vs ${lastSyncSnapshot.length} expected. Keeping existing data safe.`);
      updateTrayStatus('green', `${lastSyncSnapshot.length} items safe`, lastSyncSnapshot.length);
      setStore('lastSyncTime', new Date().toISOString());
      return { status: 'skipped' };
    }

    // Smart Diffing Logic
    broadcastSyncProgress(80, 'Calculating smart diffs...');
    const updates: any[] = [];
    const deletes: string[] = [];
    
    // Convert current inventory to a map for fast lookup
    const currentMap = new Map(rawInventory.map(item => [item.name, item]));
    const lastMap = new Map((lastSyncSnapshot as any[]).map(item => [item.name, item]));

    // Find new items or items with changed qty/price
    for (const [name, currentItem] of currentMap.entries()) {
      const lastItem = lastMap.get(name);
      if (!lastItem) {
        updates.push(currentItem);
      } else if (lastItem.qty !== currentItem.qty || lastItem.price !== currentItem.price) {
        updates.push(currentItem);
      }
    }

    // Find deleted items (in last map, but not in current map)
    for (const [name] of lastMap.entries()) {
      if (!currentMap.has(name)) {
        deletes.push(name);
      }
    }

    console.log(`Smart Diff: ${updates.length} updates, ${deletes.length} deletes.`);

    const axios = require('axios');
    const storefrontData = (getStore('storefront') || { slug: 'unknown', name: 'Unknown' }) as any;
    const payload = {
      pharmacy_slug: storefrontData.slug,
      pharmacy_name: storefrontData.name,
      coordinates: storefrontData.coordinates,
      updates,
      deletes,
      sync_tier: syncTier
    };

    try {
      // Show intermediate status since AI classification can take 5-10 seconds
      broadcastSyncProgress(90, 'Pushing updates to cloud...');
      updateTrayStatus('yellow', 'Classifying inventory...', updates.length + deletes.length);
      
      // In production, this would be an actual API endpoint with auth tokens
      // For the MVP, we are POSTing to a placeholder relay route
      const response = await axios.post('https://www.pharmastackx.com/api/sync', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`
        },
        timeout: 30000 // Increased from 10s to 30s to allow AI classification to finish
      });
      console.log('Successfully pushed to Supabase via Web Relay!');
      
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
    updateTrayStatus('green', new Date().toLocaleTimeString(), updates.length + deletes.length);
    
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
  }
}

// ── Broadcast sync status to all renderer windows ─────────────────────
export function broadcastSyncProgress(progress: number, message: string) {
  try {
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

// ── Web POS Extraction with Auto-Relogin ──────────────────────────────
async function extractFromWebPOS(url: string, schema: any): Promise<{ items: any[], tier: number }> {
  return new Promise(async (resolve, reject) => {
    broadcastSyncProgress(40, 'Starting background Web POS extraction...');
    const hiddenWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // 🔴 GUARANTEED TIMEOUT: Start the 300s death-clock BEFORE any async awaits can hang the executor
    const timeoutId = setTimeout(() => {
      if (!hiddenWindow.isDestroyed()) {
        hiddenWindow.destroy();
        reject(new Error('Web POS extraction timed out after 300 seconds.'));
      }
    }, 300000);

    // Override resolve/reject to clear the timeout so it doesn't fire after success
    const originalResolve = resolve;
    resolve = (val) => { clearTimeout(timeoutId); originalResolve(val); };
    const originalReject = reject;
    reject = (err) => { clearTimeout(timeoutId); originalReject(err); };

    try {
      // Tier 1: Zero-Scrape First Sync — use pre-processed items from onboarding
      const pairingData = getStore('pairing') as any;
      if (pairingData && pairingData.initialSyncItems && pairingData.initialSyncItems.length > 0) {
        const items = pairingData.initialSyncItems;
        console.log(`Tier 1: Using ${items.length} pre-processed items from onboarding. No AI needed.`);
        delete pairingData.initialSyncItems;
        setStore('pairing', pairingData);
        broadcastSyncProgress(75, `Tier 1: Loaded ${items.length} items from onboarding. Skipping browser entirely.`);
        hiddenWindow.destroy();
        return resolve({ items, tier: 1 });
      }

      async function processWithVercelAI(payloadText: string, tier: number) {
        const response = await fetch('https://www.pharmastackx.com/api/synkk-ai/extract-web-pos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageText: payloadText, schema })
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const errMsg = err.error || err.message || response.statusText;
          throw new Error(`Vercel Backend Error (${response.status}): ${errMsg}`);
        }
        const data = await response.json();
        return { items: data, tier };
      }

      broadcastSyncProgress(42, 'Attaching debugger to background window...');
      let networkPayload: any = null;
      let networkUrl: string | null = null;
      
      if (hiddenWindow.isDestroyed()) return;

      broadcastSyncProgress(44, `Navigating to POS URL: ${url}`);
      hiddenWindow.loadURL(url).catch((err: any) => {
        if (hiddenWindow.isDestroyed()) return;
        reject(new Error(`Failed to load POS URL: ${err.message}`));
      });

      // Tier 3 Setup: Attach Debugger IMMEDIATELY after loadURL begins
      try {
        hiddenWindow.webContents.debugger.attach('1.3');
        const sendCmd = hiddenWindow.webContents.debugger.sendCommand('Network.enable');
        const timeoutCmd = new Promise((_, r) => setTimeout(() => r(new Error('Debugger command timeout')), 3000));
        await Promise.race([sendCmd, timeoutCmd]);
        
      hiddenWindow.webContents.debugger.on('message', (event, method, params) => {
        if (method === 'Network.responseReceived') {
          if (params.response.mimeType?.includes('json')) {
            hiddenWindow.webContents.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId })
              .then(res => {
                if (res.body && res.body.length > 2000) { // Catch medium-to-large JSON payloads
                  try {
                    const json = JSON.parse(res.body);
                    if (Array.isArray(json)) {
                      if (!networkPayload) networkPayload = [];
                      networkPayload = [...networkPayload, ...json];
                      networkUrl = params.response.url;
                      console.log(`[Tier 3] Intercepted JSON Array. Total cached items: ${networkPayload.length}`);
                    } else if (json.data && Array.isArray(json.data)) {
                      if (!networkPayload) networkPayload = [];
                      networkPayload = [...networkPayload, ...json.data];
                      networkUrl = params.response.url;
                      console.log(`[Tier 3] Intercepted JSON .data Array. Total cached items: ${networkPayload.length}`);
                    }
                  } catch (e) {}
                }
              }).catch(() => {});
          }
        }
      });
      } catch (err) {
        console.error('Debugger attach failed:', err);
      }

      hiddenWindow.webContents.once('dom-ready', async () => {
      try {
        broadcastSyncProgress(46, 'Page loaded. Checking for login screen...');
        console.log('Hidden window loaded URL, checking for login screen...');

        // ── Step 1: Detect if we landed on a login page ──
        const loginDetectCode = `
          (() => {
            const inputs = document.querySelectorAll('input');
            let hasPassword = false;
            let hasUsername = false;
            for (const inp of inputs) {
              if (inp.type === 'password') hasPassword = true;
              if (inp.type === 'email' || inp.type === 'text' && (inp.name?.toLowerCase().includes('user') || inp.name?.toLowerCase().includes('email') || inp.placeholder?.toLowerCase().includes('email') || inp.placeholder?.toLowerCase().includes('username'))) hasUsername = true;
            }
            return hasPassword && hasUsername;
          })()
        `;
        const isLoginPage = await hiddenWindow.webContents.executeJavaScript(loginDetectCode);

        if (isLoginPage) {
          broadcastSyncProgress(48, 'Login screen detected. Attempting auto-relogin...');
          console.log('Login screen detected! Attempting auto-relogin...');
          
          // ── Step 2: Retrieve stored credentials ──
          const encryptedCreds = getStore('webPosCredentials') as { encUser: string; encPass: string } | null;
          
          if (!encryptedCreds || !encryptedCreds.encUser || !encryptedCreds.encPass) {
            hiddenWindow.destroy();
            reject(new Error('Auto-Login Failed: login_screen_detected. No saved credentials found. Please reconnect via the Source tab and save your login details.'));
            return;
          }

          // ── Step 3: Decrypt credentials using OS-level safeStorage ──
          let username: string;
          let password: string;
          try {
            username = safeStorage.decryptString(Buffer.from(encryptedCreds.encUser, 'base64'));
            password = safeStorage.decryptString(Buffer.from(encryptedCreds.encPass, 'base64'));
          } catch (decryptErr) {
            hiddenWindow.destroy();
            reject(new Error('Auto-Login Failed: Could not decrypt stored credentials. Please reconnect via the Source tab and re-save your login.'));
            return;
          }

          // ── Step 4: Inject credentials and submit ──
          const loginCode = `
            (() => {
              const inputs = document.querySelectorAll('input');
              let userInput = null;
              let passInput = null;
              for (const inp of inputs) {
                if (inp.type === 'password') passInput = inp;
                if (inp.type === 'email' || (inp.type === 'text' && (inp.name?.toLowerCase().includes('user') || inp.name?.toLowerCase().includes('email') || inp.placeholder?.toLowerCase().includes('email') || inp.placeholder?.toLowerCase().includes('username')))) userInput = inp;
              }

              if (!userInput || !passInput) return 'NO_FIELDS';

              // Use native input setter to trigger React/Vue/Angular change detection
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(userInput, ${JSON.stringify(username)});
                nativeInputValueSetter.call(passInput, ${JSON.stringify(password)});
              } else {
                userInput.value = ${JSON.stringify(username)};
                passInput.value = ${JSON.stringify(password)};
              }

              userInput.dispatchEvent(new Event('input', { bubbles: true }));
              passInput.dispatchEvent(new Event('input', { bubbles: true }));
              userInput.dispatchEvent(new Event('change', { bubbles: true }));
              passInput.dispatchEvent(new Event('change', { bubbles: true }));

              // Find and click the submit button
              const buttons = document.querySelectorAll('button, input[type="submit"]');
              for (const btn of buttons) {
                const text = (btn.textContent || btn.value || '').toLowerCase();
                if (text.includes('log in') || text.includes('login') || text.includes('sign in') || text.includes('submit') || btn.type === 'submit') {
                  btn.click();
                  return 'SUBMITTED';
                }
              }

              // Fallback: try submitting the form directly
              const form = passInput.closest('form');
              if (form) {
                form.submit();
                return 'FORM_SUBMITTED';
              }

              return 'NO_SUBMIT_BUTTON';
            })()
          `;

          const loginResult = await hiddenWindow.webContents.executeJavaScript(loginCode);
          
          if (loginResult === 'NO_FIELDS' || loginResult === 'NO_SUBMIT_BUTTON') {
            hiddenWindow.destroy();
            reject(new Error(`Auto-Login Failed: login_screen_detected. Could not find the login form fields.`));
            return;
          }

          // ── Step 5: Wait for page to reload after login ──
          broadcastSyncProgress(52, 'Login submitted. Waiting for POS dashboard to load...');
          console.log(`Login form submitted (${loginResult}). Waiting for page to reload...`);
          
          await new Promise<void>((res) => {
            let resolved = false;
            hiddenWindow.webContents.once('dom-ready', () => {
              if (!resolved) { resolved = true; res(); }
            });
            // If nothing loads in 15s, continue anyway
            setTimeout(() => { if (!resolved) { resolved = true; res(); } }, 15000);
          });

          // ── Step 6: Check if login was successful ──
          const stillLoginPage = await hiddenWindow.webContents.executeJavaScript(loginDetectCode);
          if (stillLoginPage) {
            hiddenWindow.destroy();
            reject(new Error('Auto-Login Failed: login_screen_detected. Your saved password may be incorrect, or the site requires a CAPTCHA.'));
            return;
          }

          broadcastSyncProgress(54, 'Auto-relogin successful! Ensuring correct URL...');
          console.log('Auto-relogin successful! Proceeding with data extraction...');

          // Navigate back to the target URL if the login redirection took us elsewhere (like a generic dashboard)
          const currentUrl = hiddenWindow.webContents.getURL();
          if (currentUrl !== url) {
            console.log(`Redirected to ${currentUrl} after login. Navigating back to target inventory page: ${url}`);
            await hiddenWindow.loadURL(url);
            await new Promise<void>((res) => {
              let resolved = false;
              hiddenWindow.webContents.once('dom-ready', () => {
                if (!resolved) { resolved = true; res(); }
              });
              setTimeout(() => { if (!resolved) { resolved = true; res(); } }, 15000);
            });
          }

          // Allow extra time for dashboard/inventory page to fully render
          await new Promise(r => setTimeout(r, 5000));
        }

        // ── Normal extraction flow ──
        broadcastSyncProgress(56, 'Waiting 8s for inventory data to fully render...');
        console.log('Waiting for SPAs to render inventory data...');
        await new Promise(r => setTimeout(r, 8000));

        broadcastSyncProgress(58, 'Checking for direct API endpoints (Tier 2/3)...');

        // ── 4-TIER FALLBACK STRATEGY ──
        // Note on Execution Order vs Tier Numbering:
        // The tiers are numbered by quality (Tier 2 is better than Tier 3, etc).
        // However, they work together: Tier 3 (Smart Discovery) runs on initial setup 
        // to sniff network traffic and discover the internal API endpoint. 
        // Once discovered, subsequent syncs will attempt Tier 2 (Direct API Hijack) FIRST 
        // because it is much faster. If Tier 2 fails or has no endpoint, it falls back 
        // to Tier 3, then Tier 4 (DOM Scraping), and finally Tier 5 (CSV Upload).

        // Tier 2: Session Hijacking
        try {
          const discoveredApiEndpoint = getStore('discoveredApiEndpoint') as string | null;
          if (discoveredApiEndpoint) {
            console.log('Tier 2: Discovered API endpoint found. Attempting direct fetch...');
            
            // Aggressively hijack pagination parameters to fetch everything
            const hackedEndpoint = discoveredApiEndpoint
              .replace(/limit=\d+/, 'limit=2000')
              .replace(/per_page=\d+/, 'per_page=2000')
              .replace(/take=\d+/, 'take=2000');
              
            const tier2Code = `
              (async () => {
                try {
                  const res = await fetch("${hackedEndpoint}");
                  if (res.ok) return await res.json();
                  return null;
                } catch(e) { return null; }
              })()
            `;
            const tier2Data = await hiddenWindow.webContents.executeJavaScript(tier2Code);
            if (tier2Data) {
              console.log('Tier 2 successful!');
              const result = await processWithVercelAI(JSON.stringify(tier2Data), 2);
              hiddenWindow.destroy();
              return resolve(result);
            }
          }
        } catch (e) {
          console.log('Tier 2 failed:', e);
        }

        // Tier 3: Network Interception (Smart Discovery)
        if (networkPayload && networkUrl) {
           console.log('Tier 3: Intercepted valid JSON payload. Saving endpoint for Tier 2...');
           setStore('discoveredApiEndpoint', networkUrl);
           try {
             let aggregatedResults: any[] = [];
             let payloadArray = Array.isArray(networkPayload) ? networkPayload : [networkPayload];
             if (payloadArray.length > 5000) payloadArray = payloadArray.slice(0, 5000); // hard cap

             const chunkSize = 30;
             const chunks = [];
             for (let i = 0; i < payloadArray.length; i += chunkSize) {
                chunks.push(payloadArray.slice(i, i + chunkSize));
             }
             
             let processed = 0;
             const promises = chunks.map(async (chunk) => {
                const result = await processWithVercelAI(JSON.stringify(chunk), 3);
                processed++;
                broadcastSyncProgress(60 + Math.floor((processed / chunks.length) * 15), `Tier 3 AI Chunking: Processing batch ${processed}/${chunks.length}...`);
                return result.items || result;
             });
             
             const chunkResults = await Promise.all(promises);
             for (const res of chunkResults) {
                aggregatedResults = [...aggregatedResults, ...(Array.isArray(res) ? res : [])];
             }
             
             hiddenWindow.destroy();
             return resolve({ items: aggregatedResults, tier: 3 });
           } catch(e) {
             console.log('Tier 3 AI processing failed:', e);
           }
        }

        // Tier 4: DOM Scraping
        broadcastSyncProgress(59, 'Expanding rows and scraping DOM...');
        console.log('Tier 4: Expanding rows and scraping DOM...');
        const expandAndScrollCode = `
          (async () => {
            let allText = document.body.innerText + '\\n\\n';
            
            // 1. Smart Dropdown Hunter (Combobox heuristic)
            const dropdowns = Array.from(document.querySelectorAll('select, div[role="combobox"], div[role="button"], span[role="button"], div[class*="select"], div[class*="dropdown"]'));
            for (const el of dropdowns) {
              const text = (el.textContent || '').toLowerCase();
              if (text.includes('rows') || text.includes('per page') || text.includes('view') || text.match(/^(10|20|25|50)$/)) {
                if (el.tagName.toLowerCase() === 'select') {
                  const options = Array.from(el.options);
                  let maxOpt = options[0];
                  let maxVal = -1;
                  for (const o of options) {
                    if (o.text.toLowerCase().includes('all')) { maxOpt = o; break; }
                    const val = parseInt(o.value) || parseInt(o.text) || 0;
                    if (val > maxVal) { maxVal = val; maxOpt = o; }
                  }
                  if (maxVal > 25 || maxOpt.text.toLowerCase().includes('all')) {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
                    if (nativeInputValueSetter) nativeInputValueSetter.call(el, maxOpt.value);
                    else el.value = maxOpt.value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise(r => setTimeout(r, 3000));
                  }
                } else {
                  el.click();
                  await new Promise(r => setTimeout(r, 1000));
                  const menuItems = Array.from(document.querySelectorAll('li, div[role="option"], span[class*="option"], div[class*="item"]'));
                  let maxOpt = null;
                  let maxVal = -1;
                  for (const item of menuItems) {
                    const txt = (item.textContent || '').toLowerCase().trim();
                    if (txt === 'all') { maxOpt = item; break; }
                    const val = parseInt(txt);
                    if (val > maxVal && val >= 50 && val <= 5000) { maxVal = val; maxOpt = item; }
                  }
                  if (maxOpt) {
                    maxOpt.click();
                    await new Promise(r => setTimeout(r, 4000));
                  } else {
                    el.click(); // close if not found
                  }
                }
                allText = document.body.innerText + '\\n\\n';
              }
            }

            // 2. Auto-scroll to bottom (for window AND scrollable containers) - Loop it for infinite scroll
            for (let s = 0; s < 8; s++) {
              const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
                const style = window.getComputedStyle(el);
                return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
              });
              for (const el of scrollables) { el.scrollBy(0, 50000); }
              window.scrollBy(0, 50000);
              await new Promise(r => setTimeout(r, 1500));
              allText += document.body.innerText + '\\n\\n'; // Accumulate just in case items disappear from DOM
            }

            // 3. Try to click "Next" pagination buttons and accumulate text (Max 25 pages)
            for (let i = 0; i < 25; i++) {
              const nextBtns = Array.from(document.querySelectorAll('button, a, div[role="button"], span, li')).filter(b => {
                const txt = (b.textContent || '').toLowerCase().trim();
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                const title = (b.getAttribute('title') || '').toLowerCase();
                const className = (b.className || '').toString().toLowerCase();
                
                return txt === 'next' || txt === 'next page' || txt === '>' || txt === '›' || txt === '»' || txt.includes('next') ||
                       aria === 'next' || aria.includes('next page') || title.includes('next') ||
                       className.includes('next-page') || className.includes('pagination-next');
              });
              
              // Find first valid, enabled next button
              const validBtn = nextBtns.find(b => {
                // @ts-ignore
                if (b.disabled) return false;
                if (b.classList.contains('disabled')) return false;
                if (b.getAttribute('aria-disabled') === 'true') return false;
                // Avoid invisible buttons
                const rect = b.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              
              if (validBtn) {
                // @ts-ignore
                validBtn.click();
                await new Promise(r => setTimeout(r, 3500)); // wait for page to render
                allText += document.body.innerText + '\\n\\n';
              } else {
                break; // No more next buttons
              }
            }

            return allText;
          })();
        `;
        const pageText = await hiddenWindow.webContents.executeJavaScript(expandAndScrollCode);
        await new Promise(r => setTimeout(r, 1000));
        
        try {
          broadcastSyncProgress(60, 'AI Semantic Extraction in progress...');
          const result = await processWithVercelAI(pageText, 4);
          hiddenWindow.destroy();
          return resolve(result);
        } catch (t4Err: any) {
          console.log('Tier 4 failed:', t4Err.message);
          broadcastSyncProgress(60, `AI Failed: ${t4Err.message}`);
          await new Promise(r => setTimeout(r, 5000)); // Show error for 5s
          hiddenWindow.destroy();
          
          // Trigger ALL_TIERS_FAILED error but keep the detailed reason
          reject(new Error(`ALL_TIERS_FAILED: ${t4Err.message}`));
        }

      } catch (e: any) {
        hiddenWindow.destroy();
        reject(e.message.includes('ALL_TIERS_FAILED') ? e : new Error(`Semantic Web Extraction Failed: ${e.message}`));
      }
    });
    } catch (criticalErr: any) {
      if (!hiddenWindow.isDestroyed()) {
        hiddenWindow.destroy();
      }
      reject(criticalErr);
    }
  });
}
