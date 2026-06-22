import { ipcMain, dialog, safeStorage, BrowserWindow, app, session } from 'electron';
import { analyzePOSSystem } from '../brain/analyser';
import { executeSync } from './sync';
import { getStore, setStore } from '../store/local';

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { scanForPOS } from './scanner';

import { triggerUpdateCheck } from './updater';

export function setupIpc() {
  ipcMain.handle('check-for-updates', async () => {
    try {
      await triggerUpdateCheck();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('scan-local-pos', async () => {
    return await scanForPOS();
  });

  ipcMain.handle('start-analysis', async (event, pathOrUrl: string, sampleData: string = '') => {
    try {
      if (!sampleData || sampleData.trim() === '') {
        const ext = path.extname(pathOrUrl).toLowerCase();
        
        if (ext === '.csv' || ext === '.json' || ext === '.sql' || ext === '.txt') {
          // If they drop an export file directly, read the first few lines
          const content = fs.readFileSync(pathOrUrl, 'utf8');
          sampleData = content.split('\n').slice(0, 50).join('\n');
          console.log(`Read raw data from ${ext} file.`);
        } 
        else if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
          // If they drop a raw database file
          const buffer = fs.readFileSync(pathOrUrl);
          const content = buffer.toString('utf8');
          const createTableMatches = content.match(/CREATE TABLE.*?\([^;]*\)/gi);
          if (createTableMatches) {
            sampleData = createTableMatches.join('\n\n');
          }
        }
        else if (ext === '.exe' || ext === '.lnk') {
          // Desktop client scanner fallback - broad search based on app name
          const appName = path.basename(pathOrUrl, ext).toLowerCase();
          
          const searchPaths = [
            path.join(os.homedir(), 'AppData', 'Roaming'),
            path.join(os.homedir(), 'AppData', 'Local'),
            path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
            'C:\\ProgramData',
            path.join(os.homedir(), 'Documents')
          ];

          let foundDbPath = null;

          for (const baseDir of searchPaths) {
            if (!fs.existsSync(baseDir)) continue;
            try {
              const folders = fs.readdirSync(baseDir, { withFileTypes: true });
              for (const dirent of folders) {
                // If folder name contains the app name, look inside it
                if (dirent.isDirectory() && dirent.name.toLowerCase().includes(appName)) {
                   const appFolder = path.join(baseDir, dirent.name);
                   try {
                     const innerFiles = fs.readdirSync(appFolder);
                     
                     // 1. Check root of app folder
                     const dbFile = innerFiles.find(f => f.endsWith('.db') || f.endsWith('.sqlite'));
                     if (dbFile) {
                       foundDbPath = path.join(appFolder, dbFile);
                       break;
                     }
                     
                     // 2. Check 1 level deep (e.g., /data, /db, /database)
                     for (const inner of innerFiles) {
                       const innerPath = path.join(appFolder, inner);
                       if (fs.statSync(innerPath).isDirectory()) {
                          const deepFiles = fs.readdirSync(innerPath);
                          const deepDbFile = deepFiles.find(f => f.endsWith('.db') || f.endsWith('.sqlite'));
                          if (deepDbFile) {
                             foundDbPath = path.join(innerPath, deepDbFile);
                             break;
                          }
                       }
                     }
                   } catch (e) {}
                   if (foundDbPath) break;
                }
              }
            } catch (e) {}
            if (foundDbPath) break;
          }

          if (foundDbPath) {
            const buffer = fs.readFileSync(foundDbPath);
            const content = buffer.toString('utf8');
            const createTableMatches = content.match(/CREATE TABLE.*?\([^;]*\)/gi);
            if (createTableMatches) {
              sampleData = createTableMatches.join('\n\n');
              pathOrUrl = foundDbPath; // Point to the actual DB so we can query it later!
            }
          }
        }
        
        if (!sampleData || sampleData.trim() === '') {
          console.log(`No local database found. Initiating Terminal Auto-Discovery flow...`);
          const { startTerminalDiscovery } = require('./network-scanner');
          const terminalResult = await startTerminalDiscovery(path.dirname(pathOrUrl));

          if (terminalResult.status === 'failed') {
            throw new Error(terminalResult.message);
          }

          if (terminalResult.status === 'needs_password') {
             return { 
               success: false, 
               needsPassword: true, 
               message: terminalResult.message,
               discoveryContext: terminalResult
             };
          }

          if (terminalResult.status === 'connected') {
             const { setStore } = require('../store/local');
             setStore('remoteDbConnection', terminalResult);
             
             return { 
                success: true, 
                result: {
                   status: 'analyzed',
                   schemaMapping: { type: 'remote', engine: terminalResult.engine },
                   rawSample: [],
                   reasoning: `Connected to remote ${terminalResult.engine} database at ${terminalResult.ip}:${terminalResult.port}`
                },
                resolvedPath: `remote://${terminalResult.ip}:${terminalResult.port}` 
             };
          }
        }
      }
      const result = await analyzePOSSystem(pathOrUrl, sampleData);
      return { success: true, result, resolvedPath: pathOrUrl };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.on('network-changed', async (event, status) => {
    if (status === 'online') {
      console.log('Hardware network online event detected! Flushing queue instantly.');
      try {
        await executeSync();
      } catch (e) {
        console.error('Instant queue flush failed:', e);
      }
    }
  });

  ipcMain.on('bring-window-to-front', (event) => {
    const webContents = event.sender;
    const win = require('electron').BrowserWindow.fromWebContents(webContents);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      // Flash taskbar icon intensely (this guarantees attention on Windows!)
      win.flashFrame(true);
    }
  });

  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('semantic-scrape', async (event, { text, url }) => {
    try {
      console.log('Sending semantic-scrape request to Vercel Backend...');
      const response = await fetch('https://www.pharmastackx.com/api/synkk-ai/scrape-pos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, url })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Vercel Backend returned ${response.status}: ${err.error || response.statusText}`);
      }

      const parsedData = await response.json();
      
      if (parsedData.error) {
        return { success: false, error: parsedData.error };
      }
      
      const finalResult = {
        status: 'analyzed',
        schemaMapping: parsedData.schema,
        rawSample: parsedData.sample,
        reasoning: "Semantically scraped from web POS by Vercel Backend."
      };
      
      return { success: true, result: finalResult };
      
    } catch (e: any) {
      console.error('Semantic scrape failed via Vercel Backend:', e.message);
      return { success: false, error: `AI Scrape Failed: ${e.message}` };
    }
  });

  ipcMain.handle('trigger-sync', async () => {
    try {
      const result = await executeSync();
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-settings', () => {
    return getStore('settings');
  });

  ipcMain.handle('save-settings', (event, settings: any) => {
    setStore('settings', settings);
    return true;
  });

  ipcMain.handle('save-learned-system', async (event, payload: any) => {
    try {
      // If we have raw text from onboarding, process it NOW into structured items
      if (payload.initialPayloadText) {
        console.log('Processing initial onboarding payload into structured items...');
        try {
          const text: string = payload.initialPayloadText;
          const schema = payload.schemaMapping;

          // Split on actual newlines and chunk into groups of 100 lines
          const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
          const chunkSize = 100;
          const chunks: string[] = [];
          for (let i = 0; i < lines.length; i += chunkSize) {
            chunks.push(lines.slice(i, i + chunkSize).join('\n'));
          }

          let allItems: any[] = [];
          for (const chunk of chunks) {
            const res = await fetch('https://www.pharmastackx.com/api/synkk-ai/extract-web-pos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pageText: chunk, schema })
            });
            if (res.ok) {
              const items = await res.json();
              if (Array.isArray(items)) {
                allItems = [...allItems, ...items];
              }
            }
          }

          // Deduplicate by name
          const seen = new Set<string>();
          const unique: any[] = [];
          for (const item of allItems) {
            const key = (item.name || '').toLowerCase().trim();
            if (key && !seen.has(key)) {
              seen.add(key);
              unique.push(item);
            }
          }

          console.log(`Onboarding extraction complete: ${unique.length} unique items from ${chunks.length} chunks.`);
          payload.initialSyncItems = unique;
        } catch (e: any) {
          console.error('Onboarding extraction failed, will retry during first sync:', e.message);
        }
        delete payload.initialPayloadText; // never store raw text
      }

      setStore('pairing', payload);
      const { updateKnowledgeBase } = require('../brain/knowledge');
      const success = await updateKnowledgeBase(payload);
      return { success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('save-storefront-data', async (event, data: any) => {
    setStore('storefront', data);
    return true;
  });
  
  ipcMain.handle('update-order-status', async (_, orderId, status) => {
    try {
      const response = await fetch('https://www.pharmastackx.com/api/orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token' // TODO: implement real token if needed, or rely on session
        },
        body: JSON.stringify({ orderId, status })
      });
      return await response.json();
    } catch (e) {
      console.error(e);
      return null;
    }
  });

  ipcMain.handle('get-storefront-data', async (event) => {
    return getStore('storefront');
  });

  ipcMain.handle('get-pairing-data', async (event) => {
    return getStore('pairing');
  });

ipcMain.handle('update-csv-path', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });
    if (canceled || filePaths.length === 0) {
      return null;
    }
    const newPath = filePaths[0];
    const currentPairing = getStore('pairing') || {};
    currentPairing.posIdentifier = newPath;
    setStore('pairing', currentPairing);
    return newPath;
  });

  ipcMain.handle('request-support', async (event, payload: any) => {
    try {
      const { sendSupportEmail } = require('./mailer');
      const success = await sendSupportEmail(payload);
      return { success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-sync-frequency', () => {
    return getStore('syncFrequency') || '15m';
  });

  ipcMain.handle('set-sync-frequency', (event, freq: string) => {
    setStore('syncFrequency', freq);
    const { updateScheduler } = require('./scheduler');
    updateScheduler();
    return true;
  });

  ipcMain.handle('get-last-sync-time', () => {
    return getStore('lastSyncTime') || null;
  });
  ipcMain.handle('get-database-tables', async (event, pathOrUrl: string) => {
    try {
      if (pathOrUrl.startsWith('remote://')) {
        const remoteConfig = getStore('remoteDbConnection') as any;
        if (!remoteConfig) throw new Error("Remote config missing.");
        const { engine, ip, port, credentials } = remoteConfig;
        const { u, p } = { u: credentials.username, p: credentials.password };
        
        if (engine === 'mysql') {
          const mysql = require('mysql2/promise');
          const conn = await mysql.createConnection({ host: ip, port, user: u, password: p });
          const [rows] = await conn.query("SHOW TABLES");
          await conn.end();
          return { success: true, tables: rows.map((r: any) => Object.values(r)[0]) };
        } else if (engine === 'mssql') {
          const sql = require('mssql');
          const pool = await sql.connect({ user: u, password: p, server: ip, port, options: { encrypt: false, trustServerCertificate: true } });
          const result = await pool.request().query("SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE'");
          await sql.close();
          return { success: true, tables: result.recordset.map((r: any) => r.table_name) };
        } else if (engine === 'postgres') {
          const { Client } = require('pg');
          const client = new Client({ host: ip, port, user: u, password: p });
          await client.connect();
          const res = await client.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'");
          await client.end();
          return { success: true, tables: res.rows.map((r: any) => r.tablename) };
        }
      }

      const ext = path.extname(pathOrUrl).toLowerCase();
      if (ext === '.csv' || ext === '.json') {
        return { success: true, tables: [path.basename(pathOrUrl)] };
      }

      const Database = require('better-sqlite3');
      const db = new Database(pathOrUrl, { readonly: true });
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      return { success: true, tables: tables.map((t: any) => t.name) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-table-columns', async (event, pathOrUrl: string, tableName: string) => {
    try {
      if (pathOrUrl.startsWith('remote://')) {
        const remoteConfig = getStore('remoteDbConnection') as any;
        const { engine, ip, port, credentials } = remoteConfig;
        const { u, p } = { u: credentials.username, p: credentials.password };
        
        if (engine === 'mysql') {
          const mysql = require('mysql2/promise');
          const conn = await mysql.createConnection({ host: ip, port, user: u, password: p });
          const [rows] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
          await conn.end();
          return { success: true, columns: rows.map((r: any) => r.Field) };
        } else if (engine === 'mssql') {
          const sql = require('mssql');
          const pool = await sql.connect({ user: u, password: p, server: ip, port, options: { encrypt: false, trustServerCertificate: true } });
          const result = await pool.request().query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}'`);
          await sql.close();
          return { success: true, columns: result.recordset.map((r: any) => r.column_name) };
        } else if (engine === 'postgres') {
          const { Client } = require('pg');
          const client = new Client({ host: ip, port, user: u, password: p });
          await client.connect();
          const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}'`);
          await client.end();
          return { success: true, columns: res.rows.map((r: any) => r.column_name) };
        }
      }

      const ext = path.extname(pathOrUrl).toLowerCase();
      if (ext === '.csv') {
        const content = fs.readFileSync(pathOrUrl, 'utf8');
        const firstLine = content.split('\n')[0];
        const columns = firstLine.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        return { success: true, columns };
      } else if (ext === '.json') {
        const content = fs.readFileSync(pathOrUrl, 'utf8');
        const data = JSON.parse(content);
        const firstObj = Array.isArray(data) ? data[0] : data;
        const columns = Object.keys(firstObj || {});
        return { success: true, columns };
      }

      const Database = require('better-sqlite3');
      const db = new Database(pathOrUrl, { readonly: true });
      const columns = db.prepare(`PRAGMA table_info('${tableName}')`).all();
      return { success: true, columns: columns.map((c: any) => c.name) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-table-sample', async (event, pathOrUrl: string, tableName: string) => {
    try {
      if (pathOrUrl.startsWith('remote://')) {
        const remoteConfig = getStore('remoteDbConnection') as any;
        const { engine, ip, port, credentials } = remoteConfig;
        const { u, p } = { u: credentials.username, p: credentials.password };
        
        if (engine === 'mysql') {
          const mysql = require('mysql2/promise');
          const conn = await mysql.createConnection({ host: ip, port, user: u, password: p });
          const [rows] = await conn.query(`SELECT * FROM \`${tableName}\` LIMIT 5`);
          await conn.end();
          return { success: true, rawSample: rows };
        } else if (engine === 'mssql') {
          const sql = require('mssql');
          const pool = await sql.connect({ user: u, password: p, server: ip, port, options: { encrypt: false, trustServerCertificate: true } });
          const result = await pool.request().query(`SELECT TOP 5 * FROM ${tableName}`);
          await sql.close();
          return { success: true, rawSample: result.recordset };
        } else if (engine === 'postgres') {
          const { Client } = require('pg');
          const client = new Client({ host: ip, port, user: u, password: p });
          await client.connect();
          const res = await client.query(`SELECT * FROM "${tableName}" LIMIT 5`);
          await client.end();
          return { success: true, rawSample: res.rows };
        }
      }

      const ext = path.extname(pathOrUrl).toLowerCase();
      if (ext === '.csv') {
        const content = fs.readFileSync(pathOrUrl, 'utf8');
        const lines = content.split('\n').filter(l => l.trim().length > 0).slice(0, 6);
        const headers = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const rawSample = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const obj: any = {};
          headers.forEach((h, i) => obj[h] = vals[i]);
          return obj;
        });
        return { success: true, rawSample };
      } else if (ext === '.json') {
        const content = fs.readFileSync(pathOrUrl, 'utf8');
        const data = JSON.parse(content);
        const rawSample = Array.isArray(data) ? data.slice(0, 5) : [data];
        return { success: true, rawSample };
      }

      const Database = require('better-sqlite3');
      const db = new Database(pathOrUrl, { readonly: true });
      const rows = db.prepare(`SELECT * FROM '${tableName}' LIMIT 5`).all();
      return { success: true, rawSample: rows };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('search-source', async (_, { query, exclude }) => {
    try {
      const axios = require('axios');
      const res = await axios.get(`https://www.pharmastackx.com/api/source?query=${encodeURIComponent(query)}&exclude=${encodeURIComponent(exclude)}`);
      return res.data;
    } catch (error: any) {
      console.error('IPC search-source error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('autocomplete-source', async (_, { query }) => {
    try {
      const axios = require('axios');
      const res = await axios.get(`https://www.pharmastackx.com/api/source/autocomplete?query=${encodeURIComponent(query)}`);
      return res.data;
    } catch (error: any) {
      console.error('IPC autocomplete-source error:', error.message);
      return { success: false, suggestions: [] };
    }
  });

  // ── Secure Credential Storage (safeStorage) ─────────────────────────
  ipcMain.handle('save-psx-credentials', async (event, { email, password }: { email: string; password: string }) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: 'OS-level encryption is not available on this machine.' };
      }
      const encEmail = safeStorage.encryptString(email).toString('base64');
      const encPass = safeStorage.encryptString(password).toString('base64');
      setStore('psxCredentials', { encEmail, encPass });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-psx-credentials', async () => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const creds = getStore('psxCredentials') as any;
      if (!creds || !creds.encEmail || !creds.encPass) return null;
      
      const email = safeStorage.decryptString(Buffer.from(creds.encEmail, 'base64'));
      const password = safeStorage.decryptString(Buffer.from(creds.encPass, 'base64'));
      return { email, password };
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('save-web-pos-credentials', async (event, { username, password, url }: { username: string; password: string, url?: string }) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: 'OS-level encryption is not available on this machine.' };
      }
      
      // 1. Encrypt and store locally for auto-relogin
      const encUser = safeStorage.encryptString(username).toString('base64');
      const encPass = safeStorage.encryptString(password).toString('base64');
      setStore('webPosCredentials', { encUser, encPass, url });
      
      // 2. Set default sync frequency to 1440 (Daily)
      setStore('syncFrequency', '1440');

      // 3. Send encrypted backup to PSX (Application-Level Master Encryption)
      try {
        const storefront = getStore('storefront') as any;
        const slug = storefront?.slug;

        if (slug) {
          const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://www.pharmastackx.com';
          const response = await fetch(`${baseUrl}/api/admin/pharmacy/web-pos-backup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, username, password, url: url || '' })
          });
          if (!response.ok) {
            console.error('Failed to backup Web POS credentials to PSX Cloud', await response.text());
          } else {
            console.log('Successfully backed up Web POS credentials to PSX Cloud via HTTPS.');
          }
        }
      } catch (backupErr) {
        console.error('Network error during Web POS backup:', backupErr);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('has-web-pos-credentials', async () => {
    const creds = getStore('webPosCredentials') as any;
    return !!(creds && creds.encUser && creds.encPass);
  });

  ipcMain.handle('delete-web-pos-credentials', async () => {
    setStore('webPosCredentials', null);
    return { success: true };
  });

  // ── Sync error retrieval for the dashboard ──────────────────────────
  ipcMain.handle('get-last-sync-error', async () => {
    return getStore('lastSyncError') || null;
  });

  ipcMain.handle('get-sync-retry-info', async () => {
    return getStore('syncRetryInfo') || null;
  });

  // ── Leads Data ──────────────────────────
  ipcMain.handle('get-leads', async () => {
    return getStore('leads') || [];
  });

  ipcMain.handle('update-lead-status', async (event, id: string, status: string) => {
    const leads = (getStore('leads') as any[]) || [];
    const lead = leads.find(l => l.id === id);
    if (lead) {
      lead.status = status;
      setStore('leads', leads);
      return { success: true };
    }
    return { success: false, error: 'Lead not found locally' };
  });

  ipcMain.on('clear-notifications', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.flashFrame(false);
    if (app.setBadgeCount) app.setBadgeCount(0);
  });

  ipcMain.on('bring-window-to-front', () => {
    const windows = BrowserWindow.getAllWindows();
    // Find the main window (not the overlay)
    const mainWindow = windows.find(w => w.getSize()[0] > 500); 
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.on('open-checkout-window', async (event, url) => {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    const checkoutWin = new BrowserWindow({
      width: 1000,
      height: 800,
      parent: parentWin || undefined,
      modal: !!parentWin,
      show: false,
      title: 'Secure Checkout',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    checkoutWin.setMenu(null);
    
    checkoutWin.on('ready-to-show', () => {
      checkoutWin.show();
    });

    checkoutWin.webContents.on('did-finish-load', () => {
      const currentUrl = checkoutWin.webContents.getURL();
      // Try auto-login if the window lands on a login/auth page
      if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('auth')) {
        try {
          if (safeStorage.isEncryptionAvailable()) {
            const creds = getStore('psxCredentials') as any;
            if (creds && creds.encEmail && creds.encPass) {
              const email = safeStorage.decryptString(Buffer.from(creds.encEmail, 'base64')).replace(/'/g, "\\'");
              const password = safeStorage.decryptString(Buffer.from(creds.encPass, 'base64')).replace(/'/g, "\\'");
              
              const script = `
                setTimeout(() => {
                  const emailInput = document.querySelector('input[type="email"], input[name="email"], input[name="username"]');
                  const passInput = document.querySelector('input[type="password"], input[name="password"]');
                  if (emailInput && passInput) {
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    nativeSetter.call(emailInput, '${email}');
                    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    nativeSetter.call(passInput, '${password}');
                    passInput.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    setTimeout(() => {
                      const submitBtn = document.querySelector('button[type="submit"]') || 
                                        Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('log') || b.textContent.toLowerCase().includes('sign'));
                      if (submitBtn) submitBtn.click();
                    }, 500);
                  }
                }, 1000);
              `;
              checkoutWin.webContents.executeJavaScript(script).catch(e => console.error('Auto-login script error:', e));
            }
          }
        } catch (e) {
          console.error('Auto-login error:', e);
        }
      }
    });

    checkoutWin.loadURL(url);
  });

  ipcMain.handle('logout-completely', async () => {
    try {
      // 1. Delete all credentials from the local database
      setStore('webPosCredentials', null);
      setStore('psxCredentials', null);
      setStore('storefront', null);
      setStore('pairing', null);

      // 2. Clear Electron's Session data (Cookies, Local Storage, IndexedDB)
      await session.defaultSession.clearStorageData();
      
      // 3. Stop the sync scheduler loop if running
      const { stopScheduler } = require('./sync');
      stopScheduler();

      // 4. Reset the system tray
      const { updateTrayStatus } = require('./tray');
      updateTrayStatus('green', 'Never', 0);

      return { success: true };
    } catch (err: any) {
      console.error('Logout error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dev-kill-session', async () => {
    try {
      await session.defaultSession.clearStorageData();
      return { success: true };
    } catch (err: any) {
      console.error('Kill session error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Epic 1: Silent Observation (Bubble Mode) ──────────────────────────
  // Opens a background Electron window, watches for network traffic matching
  // pharmacy/inventory patterns, and returns the captured payload to the UI.
  ipcMain.handle('start-silent-observation', async (_event, { posNameHint }: { posNameHint?: string }) => {
    return new Promise<any>((resolve, reject) => {
      console.log('[BubbleMode] Starting silent observation...', { posNameHint });

      // Create a minimal invisible window to intercept network traffic
      const observerWin = new BrowserWindow({
        width: 1280,
        height: 900,
        show: false, // completely invisible
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false,
        },
      });

      const OBSERVATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

      let resolved = false;
      const safeResolve = (value: any) => {
        if (!resolved) {
          resolved = true;
          if (!observerWin.isDestroyed()) observerWin.destroy();
          resolve(value);
        }
      };

      // Intercept JSON responses that look like inventory data
      observerWin.webContents.session.webRequest.onCompleted(
        { urls: ['<all_urls>'] },
        async (details) => {
          if (resolved) return;
          const ct = details.responseHeaders?.['content-type']?.[0] || '';
          if (!ct.includes('application/json')) return;
          // Look for endpoints with inventory-like keywords
          const url = details.url.toLowerCase();
          const inventoryKeywords = ['product', 'inventory', 'stock', 'item', 'medicine', 'drug', 'catalog'];
          if (!inventoryKeywords.some(kw => url.includes(kw))) return;
          if (details.statusCode !== 200) return;

          console.log('[BubbleMode] Promising inventory URL intercepted:', details.url);

          // Re-fetch via main process to read the body
          try {
            const res = await fetch(details.url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return;
            const payload = await res.json();
            const arr = Array.isArray(payload) ? payload : (payload.data || payload.items || payload.products || payload.inventory || []);
            if (!Array.isArray(arr) || arr.length < 3) return;

            // Quick heuristic: does each object have a name-like key?
            const sampleItem = arr[0];
            const hasName = Object.keys(sampleItem).some(k =>
              ['name', 'title', 'product', 'medicine', 'drug', 'item_name', 'description'].includes(k.toLowerCase())
            );
            if (!hasName) return;

            console.log(`[BubbleMode] Found ${arr.length} items via network intercept!`);
            safeResolve({
              method: 'network',
              itemCount: arr.length,
              posName: posNameHint || 'Unknown POS',
              items: arr.slice(0, 5000), // cap
            });
          } catch (e) {
            // Silently ignore fetch errors
          }
        }
      );

      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          console.log('[BubbleMode] Observation timed out with no results.');
          safeResolve({ method: 'network', itemCount: 0, posName: '', items: [] });
        }
      }, OBSERVATION_TIMEOUT_MS);
    });
  });

  // Watch User Open App (Process Watcher)
  const { processWatcher } = require('./process-watcher');

  ipcMain.handle('take-process-snapshot', async () => {
    try {
      await processWatcher.takeSnapshot();
      return { success: true };
    } catch (e: any) {
      console.error('Snapshot error:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('start-process-watch', async (event) => {
    try {
      const result = await processWatcher.watchForNewApp(60000, (appName) => {
        event.sender.send('process-watch-status', appName);
      }); // 60 seconds
      return result;
    } catch (e: any) {
      console.error('Process watch error:', e);
      return { type: 'error', details: e.message };
    }
  });

  ipcMain.handle('stop-process-watch', () => {
    processWatcher.stop();
    return { success: true };
  });

  // Floating Bubble Widget
  const { launchBubbleWidget, closeBubbleWidget } = require('./bubble-widget');
  
  ipcMain.handle('launch-bubble-widget', async (event, posNameHint) => {
    // Hide the main window
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.hide();
    
    launchBubbleWidget(posNameHint);
    return { success: true };
  });

  ipcMain.on('bubble-completed', (event, data) => {
    closeBubbleWidget();
    
    // Restore the main window and navigate it to /analysis
    const wins = BrowserWindow.getAllWindows();
    // Assuming the largest window or the first one created is the main one. 
    // Usually getAllWindows() returns them in order, or we can look for one that is NOT always on top.
    const mainWin = wins.find(w => !w.isAlwaysOnTop());
    
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
      mainWin.webContents.send('navigate-to', {
        path: '/analysis',
        state: { method: 'bubble', capturedItems: data.items, posName: data.posName }
      });
    }
  });

  ipcMain.on('bubble-cancelled', () => {
    closeBubbleWidget();
    
    const wins = BrowserWindow.getAllWindows();
    const mainWin = wins.find(w => !w.isAlwaysOnTop());
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
    }
  });

  ipcMain.on('bubble-pivot-local', (event, dbPath) => {
    closeBubbleWidget();
    
    const wins = BrowserWindow.getAllWindows();
    const mainWin = wins.find(w => !w.isAlwaysOnTop());
    
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
      mainWin.webContents.send('navigate-to', {
        path: '/analysis',
        state: { method: 'drop', filePath: dbPath }
      });
    }
  });

  ipcMain.on('bubble-pivot-web', (event) => {
    closeBubbleWidget();
    
    const wins = BrowserWindow.getAllWindows();
    const mainWin = wins.find(w => !w.isAlwaysOnTop());
    
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
      // Route back to Welcome, and maybe trigger a special state
      // For now, navigating to / is fine, they can just click Web POS
      // or we can pass a state to auto-open the Web POS URL input
      mainWin.webContents.send('navigate-to', {
        path: '/',
        state: { autoFocusWebPos: true }
      });
    }
  });
}
