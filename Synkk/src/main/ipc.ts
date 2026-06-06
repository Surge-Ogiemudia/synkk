import { ipcMain, dialog, safeStorage, BrowserWindow, app } from 'electron';
import { analyzePOSSystem } from '../brain/analyser';
import { executeSync } from './sync';
import { getStore, setStore } from '../store/local';

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { scanForPOS } from './scanner';

export function setupIpc() {
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

  ipcMain.handle('save-learned-system', async (event, payload: { posIdentifier: string, schemaMapping: any }) => {
    try {
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
  ipcMain.handle('save-web-pos-credentials', async (event, { username, password }: { username: string; password: string }) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: 'OS-level encryption is not available on this machine.' };
      }
      const encUser = safeStorage.encryptString(username).toString('base64');
      const encPass = safeStorage.encryptString(password).toString('base64');
      setStore('webPosCredentials', { encUser, encPass });
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
}
