import { getStore, setStore } from '../store/local';
import { updateTrayStatus } from './tray';
import { sendFailureAlertEmail } from './mailer';
import { net } from 'electron';

export async function executeSync() {
  console.log('Executing sync cycle...');
  const pairingData = getStore('pairing') || { name: 'Unknown Pharmacy' };
  
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
      return { status: 'queued' };
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

    // 4. Push to PSX catalog API
    console.log(`Pushing ${rawInventory.length} inventory items to cloud...`);
    const storefrontData = getStore('storefront') || { slug: 'unknown-slug' };
    const syncBatchId = Date.now().toString();

    const axios = require('axios');
    const payload = {
      pharmacy_slug: storefrontData.slug,
      sync_batch_id: syncBatchId,
      inventory: rawInventory
    };

    try {
      // In production, this would be an actual API endpoint with auth tokens
      // For the MVP, we are POSTing to a placeholder relay route
      await axios.post('https://pharmastackx.com/api/sync', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`
        },
        timeout: 10000
      });
      console.log('Successfully pushed to Supabase via Web Relay!');
    } catch (pushError: any) {
      console.error('Failed to push to cloud API:', pushError.message);
      throw new Error(`Cloud Push Failed: ${pushError.message}`);
    }
    
    // 5. Update tray status
    updateTrayStatus('green', new Date().toLocaleTimeString(), rawInventory.length);
    return { status: 'success' };
    
  } catch (error: any) {
    console.error('Sync failed:', error);
    updateTrayStatus('red', 'Failed', 0);
    
    await sendFailureAlertEmail(
      pairingData.posIdentifier || 'Unknown Pharmacy', 
      error.message || 'Unknown error occurred during inventory extraction.',
      'The POS database schema might have been modified, or a Web POS session expired.',
      'Check the Dashboard to see the exact error log.'
    );
    
    throw error;
  }
}

async function extractFromLocalDB(dbPath: string, schema: any): Promise<any[]> {
  const Database = require('better-sqlite3');
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    // Use the mapped columns dynamically
    const query = `SELECT "${schema.nameCol}" as name, "${schema.qtyCol}" as qty, "${schema.priceCol}" as price FROM "${schema.tableName}"`;
    const rows = db.prepare(query).all();
    db.close();
    return rows;
  } catch (e: any) {
    throw new Error(`Local DB Extraction Failed: ${e.message}`);
  }
}

async function extractFromWebPOS(url: string, schema: any): Promise<any[]> {
  const { BrowserWindow, ipcMain } = require('electron');
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
        console.log('Hidden window loaded URL, extracting text...');
        // Execute JS to grab all visible text from the POS
        const code = `document.body.innerText || document.body.textContent`;
        const pageText = await hiddenWindow.webContents.executeJavaScript(code);
        
        // Pass to Semantic AI
        const { GoogleGenAI } = require('@google/genai');
        const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const model = geminiClient.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
        
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
