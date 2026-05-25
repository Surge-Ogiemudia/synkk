import { ipcMain, dialog } from 'electron';
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
          throw new Error(`Could not find a local .db or .sqlite database for ${path.basename(pathOrUrl)}. This application might be entirely cloud-based or stores its data elsewhere.`);
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
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
      if (!apiKey) throw new Error("Missing Gemini API Key.");

      const geminiClient = new GoogleGenerativeAI(apiKey);
      const model = geminiClient.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
      
      const prompt = `System Instruction: You are an expert data scraper. I am providing you the raw text extracted from a Pharmacy POS inventory webpage.
Your job is to semantically parse this text and find the medication inventory data.
Extract all medications, their quantities, and their prices.
Return ONLY a valid JSON object matching this exact schema:
{
  "tableName": "ScrapedWebData",
  "nameCol": "Name",
  "qtyCol": "Quantity",
  "priceCol": "Price",
  "brandCol": null,
  "imageCol": null,
  "sample": [
     { "Name": "Aspirin", "Quantity": 100, "Price": 5.99 }
  ]
}
Do not return any markdown formatting. If no inventory data is found, return { "error": "No inventory data found on this page." }

Page URL: ${url}
Extracted Text:
${text.slice(0, 15000)}`;

      const response = await model.generateContent(prompt);
      let aiResponse = response.response.text().trim();
      
      if (aiResponse.startsWith('\`\`\`json')) aiResponse = aiResponse.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
      if (aiResponse.startsWith('\`\`\`')) aiResponse = aiResponse.replace(/\`\`\`/g, '').trim();

      const parsed = JSON.parse(aiResponse);
      
      if (parsed.error) {
        return { success: false, error: parsed.error };
      }
      
      const finalResult = {
        status: 'analyzed',
        schemaMapping: parsed,
        rawSample: parsed.sample,
        reasoning: "Semantically scraped from web POS by Synkk."
      };
      
      return { success: true, result: finalResult };
      
    } catch (e: any) {
      console.error("Scrape Error:", e);
      return { success: false, error: e.message };
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

  ipcMain.handle('save-storefront-data', async (event, data: { slug: string, name: string }) => {
    try {
      setStore('storefront', data);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
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
  ipcMain.handle('get-database-tables', async (event, pathOrUrl: string) => {
    try {
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
}
