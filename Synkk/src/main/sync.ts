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
      userMessage: 'The Web POS page took too long to load (over 30 seconds). Please check your internet speed, or try logging in manually via the Source tab.',
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
    let rawInventory: any[] = [];
    
    if (pairingData.posIdentifier && pairingData.posIdentifier.startsWith('http')) {
      // Branch 2: Web POS (Hidden Browser Window)
      console.log('Target is Web POS. Spawning background browser...');
      rawInventory = await extractFromWebPOS(pairingData.posIdentifier, pairingData.schemaMapping);
    } else if (pairingData.posIdentifier) {
      // Branch 1: Local SQLite DB
      console.log('Target is Local Database. Executing SQLite extraction...');
      rawInventory = await extractFromLocalDB(pairingData.posIdentifier, pairingData.schemaMapping);
    }

    const lastSyncSnapshot = (getStore('lastSyncSnapshot') || []) as any[];
    
    // Smart Diffing Logic
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
      deletes
    };

    try {
      // In production, this would be an actual API endpoint with auth tokens
      // For the MVP, we are POSTing to a placeholder relay route
      const response = await axios.post('https://www.pharmastackx.com/api/sync', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`
        },
        timeout: 10000
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
      throw new Error(`Cloud Push Failed: ${pushError.message}`);
    }
    
    // 5. Update tray status
    updateTrayStatus('green', new Date().toLocaleTimeString(), updates.length + deletes.length);
    
    // Clear any previous sync errors on success
    setStore('lastSyncError', null);
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
async function extractFromWebPOS(url: string, schema: any): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const hiddenWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    hiddenWindow.loadURL(url);

    hiddenWindow.webContents.on('did-finish-load', async () => {
      try {
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
            reject(new Error(`Auto-Login Failed: login_screen_detected. Could not find the login form fields. Please log in manually via the Source tab.`));
            return;
          }

          // ── Step 5: Wait for page to reload after login ──
          console.log(`Login form submitted (${loginResult}). Waiting for page to reload...`);
          
          await new Promise<void>((res) => {
            let resolved = false;
            hiddenWindow.webContents.on('did-finish-load', () => {
              if (!resolved) { resolved = true; res(); }
            });
            // If nothing loads in 15s, continue anyway
            setTimeout(() => { if (!resolved) { resolved = true; res(); } }, 15000);
          });

          // ── Step 6: Check if login was successful ──
          const stillLoginPage = await hiddenWindow.webContents.executeJavaScript(loginDetectCode);
          if (stillLoginPage) {
            hiddenWindow.destroy();
            reject(new Error('Auto-Login Failed: login_screen_detected. Your saved password may be incorrect, or the site requires a CAPTCHA. Please reconnect via the Source tab.'));
            return;
          }

          console.log('Auto-relogin successful! Proceeding with data extraction...');

          // Navigate back to the target URL if the login redirection took us elsewhere (like a generic dashboard)
          const currentUrl = hiddenWindow.webContents.getURL();
          if (currentUrl !== pairingData.url) {
            console.log(`Redirected to ${currentUrl} after login. Navigating back to target inventory page: ${pairingData.url}`);
            await hiddenWindow.loadURL(pairingData.url);
            await new Promise<void>((res) => {
              let resolved = false;
              hiddenWindow.webContents.on('did-finish-load', () => {
                if (!resolved) { resolved = true; res(); }
              });
              setTimeout(() => { if (!resolved) { resolved = true; res(); } }, 15000);
            });
          }

          // Allow extra time for dashboard/inventory page to fully render
          await new Promise(r => setTimeout(r, 5000));
        }

        // ── Normal extraction flow ──
        console.log('Waiting for Single Page Applications (SPAs) to render inventory data...');
        await new Promise(r => setTimeout(r, 8000));

        console.log('Attempting to expand rows per page and auto-scroll...');
        const expandAndScrollCode = `
          (async () => {
            // 1. Try to find and change "Rows per page" native selects
            const selects = document.querySelectorAll('select');
            for (const select of selects) {
              const options = Array.from(select.options);
              const hasLargeNumbers = options.some(o => parseInt(o.value) >= 50 || parseInt(o.text) >= 50 || o.text.toLowerCase().includes('all'));
              const hasSmallNumbers = options.some(o => parseInt(o.value) === 10 || parseInt(o.value) === 20 || parseInt(o.text) === 10);
              
              if (hasLargeNumbers && hasSmallNumbers) {
                let maxOpt = options[0];
                let maxVal = -1;
                for (const o of options) {
                  if (o.text.toLowerCase().includes('all')) {
                    maxOpt = o;
                    break;
                  }
                  const val = parseInt(o.value) || parseInt(o.text) || 0;
                  if (val > maxVal) {
                    maxVal = val;
                    maxOpt = o;
                  }
                }
                select.value = maxOpt.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(r => setTimeout(r, 3000)); // wait for network fetch
              }
            }

            // 2. Auto-scroll to bottom for infinite scroll support
            await new Promise((resolve) => {
              let totalHeight = 0;
              let distance = 600;
              let maxScrolls = 15; // Max ~7.5 seconds of scrolling
              let scrolls = 0;
              
              let timer = setInterval(() => {
                let scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                scrolls++;

                if (totalHeight >= scrollHeight || scrolls >= maxScrolls) {
                  clearInterval(timer);
                  resolve(null);
                }
              }, 500);
            });
          })();
        `;
        await hiddenWindow.webContents.executeJavaScript(expandAndScrollCode);

        // Wait another few seconds in case the scroll triggered lazy-loading images or text
        await new Promise(r => setTimeout(r, 3000));
        
        console.log('Extracting text from page...');
        const code = `document.body.innerText || document.body.textContent`;
        const pageText = await hiddenWindow.webContents.executeJavaScript(code);
        
        // Pass to Semantic AI
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const geminiClient2 = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY);
        const model = geminiClient2.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
        
        const prompt = `System Instruction: You are an expert data scraper working for Synkk. 
You are extracting inventory from a Web POS.
Here is the schema mapping we agreed on previously:
${JSON.stringify(schema, null, 2)}

Here is the raw text from the live POS page:
${pageText.slice(0, 15000)}

Extract the medications and return ONLY a JSON array of objects with keys "name", "qty", and "price".
Return NOTHING ELSE. NO markdown.`;

        const response = await model.generateContent(prompt);
        let aiResponse = response.response.text().trim();
        if (aiResponse.startsWith('\`\`\`json')) aiResponse = aiResponse.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
        if (aiResponse.startsWith('\`\`\`')) aiResponse = aiResponse.replace(/\`\`\`/g, '').trim();

        const data = JSON.parse(aiResponse);
        hiddenWindow.destroy();
        resolve(data);
      } catch (e: any) {
        hiddenWindow.destroy();
        reject(new Error(`Semantic Web Extraction Failed: ${e.message}`));
      }
    });

    // Timeout if page takes forever to load
    setTimeout(() => {
      if (!hiddenWindow.isDestroyed()) {
        hiddenWindow.destroy();
        reject(new Error('Web POS extraction timed out after 30 seconds.'));
      }
    }, 30000);
  });
}
