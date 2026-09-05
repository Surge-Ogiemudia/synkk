// PST Background Service Worker
// All data flows live to https://www.pharmastackx.com — no local connector needed

// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
  // Set a green badge to indicate the extension is active
  chrome.action.setBadgeText({ text: '●' });
  chrome.action.setBadgeBackgroundColor({ color: '#00d4aa' });
});

// ==========================================
// Cloud Sync Logic (Local-First Reconciliation)
// ==========================================
const CLOUD_API = 'https://www.pharmastackx.com/api/extension';

// Initialize persistent terminalId for multi-counter tagging (defaults to Counter 1)
chrome.storage.local.get(['terminalId'], (res) => {
  if (!res.terminalId) {
    chrome.storage.local.set({ terminalId: 'Counter 1' });
  }
});

async function syncInventoryToCloud() {
  const data = await chrome.storage.local.get(['unsyncedInventory', 'currentPharmacy']);
  if (!data.unsyncedInventory) return;

  const pharmacyId = (data.unsyncedInventory && data.unsyncedInventory.pharmacyId) 
    || (data.currentPharmacy && data.currentPharmacy.id) 
    || 'DEFAULT';

  const rows = Array.isArray(data.unsyncedInventory) ? data.unsyncedInventory : (data.unsyncedInventory.rows || []);

  try {
    const res = await fetch(`${CLOUD_API}/sync-inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pharmacyId: pharmacyId, rows: rows })
    });
    if (res.ok) {
      console.log('✅ Inventory synced to cloud for pharmacy:', pharmacyId);
      chrome.storage.local.remove('unsyncedInventory');
    }
  } catch (e) {
    console.error('❌ Cloud sync failed, will retry later:', e);
  }
}

async function syncSalesToCloud() {
  const data = await chrome.storage.local.get(['unsyncedSales', 'currentPharmacy', 'terminalId']);
  if (!data.unsyncedSales || data.unsyncedSales.length === 0) return;

  const terminalId = data.terminalId || 'Terminal-1';
  const remainingSales = [];
  for (const sale of data.unsyncedSales) {
    const pharmacyId = sale.pharmacyId || (data.currentPharmacy && data.currentPharmacy.id) || 'DEFAULT';
    try {
      const res = await fetch(`${CLOUD_API}/record-sale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pharmacyId: pharmacyId,
          terminalId: sale.terminalId || terminalId,
          items: sale.items,
          source: sale.source
        })
      });
      if (res.ok) {
        console.log('✅ Sale synced to cloud for pharmacy:', pharmacyId, 'terminal:', terminalId);
      } else {
        remainingSales.push(sale);
      }
    } catch (e) {
      console.error('❌ Cloud sync failed for sale, keeping in local backup:', e);
      remainingSales.push(sale);
    }
  }
  
  if (remainingSales.length === 0) {
    chrome.storage.local.remove('unsyncedSales');
  } else {
    chrome.storage.local.set({ unsyncedSales: remainingSales });
  }
}

async function syncSearchesToCloud() {
  const data = await chrome.storage.local.get(['unsyncedSearches', 'currentPharmacy', 'terminalId']);
  if (!data.unsyncedSearches || data.unsyncedSearches.length === 0) return;

  const pharmacyId = (data.currentPharmacy && data.currentPharmacy.id) || 'DEFAULT';
  const terminalId = data.terminalId || 'Terminal-1';
  const searchesToSend = [...data.unsyncedSearches];

  try {
    const res = await fetch(`${CLOUD_API}/record-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pharmacyId: pharmacyId,
        searches: searchesToSend.map(s => ({ ...s, terminalId: s.terminalId || terminalId }))
      })
    });
    if (res.ok) {
      console.log(`✅ Synced ${searchesToSend.length} search queries to cloud for pharmacy:`, pharmacyId);
      chrome.storage.local.remove('unsyncedSearches');
    }
  } catch (e) {
    console.warn('❌ Search sync to cloud failed, will retry:', e);
  }
}

let isAutoSyncRunning = false;

async function runAutonomousInventorySync(forced = false) {
  if (isAutoSyncRunning) return;
  isAutoSyncRunning = true;

  try {
    const data = await chrome.storage.local.get([
      'lastInventorySyncTime',
      'pmsInventoryConfig',
      'cachedProductApiUrl',
      'currentPharmacy',
      'columnMapping'
    ]);

    const pharmacyId = (data.currentPharmacy && data.currentPharmacy.id) || 'DEFAULT';
    const now = Date.now();
    const lastSync = data.lastInventorySyncTime || 0;

    // Daily opening roster: at least 18 hours elapsed, unless explicitly forced by admin
    if (!forced && (now - lastSync < 18 * 60 * 60 * 1000)) {
      console.log('⏰ [PharmastackX] Autonomous inventory sync not due yet (synced within last 18h).');
      isAutoSyncRunning = false;
      return;
    }

    console.log('🌅 [PharmastackX] Day Opening / Scheduled Inventory Sync initiated for:', pharmacyId);

    // Strategy 1: Fast API Replay if cached product API exists
    if (data.cachedProductApiUrl) {
      console.log('⚡ [PharmastackX] Running API Replay Loop with URL:', data.cachedProductApiUrl);
      let allItems = [];
      let page = 1;
      const maxPages = 60;

      while (page <= maxPages) {
        try {
          const pageUrl = data.cachedProductApiUrl.replace(/([?&]page=)\d+\b/i, `$1${page}`);
          const res = await fetch(pageUrl);
          if (!res.ok) break;
          const json = await res.json();
          
          let pageItems = [];
          if (Array.isArray(json)) pageItems = json;
          else if (json && typeof json === 'object') {
            const keys = ['data', 'items', 'products', 'results', 'rows', 'list', 'records'];
            for (const k of keys) {
              if (Array.isArray(json[k])) {
                pageItems = json[k];
                break;
              }
            }
          }

          if (!pageItems || pageItems.length === 0) break;
          allItems = allItems.concat(pageItems);
          page++;
        } catch (err) {
          break;
        }
      }

      if (allItems.length > 0) {
        console.log(`✅ [PharmastackX] API Replay fetched ${allItems.length} items! Syncing to cloud...`);
        await fetch(`${CLOUD_API}/sync-inventory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pharmacyId: pharmacyId, rows: allItems })
        });
        chrome.storage.local.set({ lastInventorySyncTime: Date.now() });
        isAutoSyncRunning = false;
        return;
      }
    }

    // Strategy 2: Silent Ghost Tab Fallback
    const inventoryUrl = (data.pmsInventoryConfig && data.pmsInventoryConfig.inventoryUrl) || null;
    if (inventoryUrl) {
      console.log('👻 [PharmastackX] Launching silent ghost tab to inventory:', inventoryUrl);
      const cleanUrl = inventoryUrl.split('#')[0] + '#pst-auto-sync';
      
      chrome.tabs.create({ url: cleanUrl, active: false }, (tab) => {
        const ghostTabId = tab.id;
        // Safety timeout: automatically remove ghost tab after 60s
        setTimeout(() => {
          try { chrome.tabs.remove(ghostTabId); } catch(e) {}
          isAutoSyncRunning = false;
        }, 60000);
      });
    }

  } catch (e) {
    console.error('❌ [PharmastackX] Autonomous inventory sync error:', e);
  } finally {
    setTimeout(() => { isAutoSyncRunning = false; }, 5000);
  }
}

async function checkRemoteSyncRequests() {
  const data = await chrome.storage.local.get(['currentPharmacy']);
  const pharmacyId = data.currentPharmacy && data.currentPharmacy.id;
  if (!pharmacyId || pharmacyId === 'DEFAULT') return;

  try {
    const res = await fetch(`${CLOUD_API}/request-sync?pharmacyId=${pharmacyId}`);
    if (res.ok) {
      const json = await res.json();
      if (json.syncRequested) {
        console.log('⚡ [PharmastackX] Remote Admin Snapshot Request received!');
        // Acknowledge receipt
        fetch(`${CLOUD_API}/request-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pharmacyId: pharmacyId, action: 'acknowledge' })
        }).catch(() => {});
        // Run forced sync immediately
        runAutonomousInventorySync(true);
      }
    }
  } catch (e) {}
}

// ==========================================
// Deduplication Engine (Multi-Tab Safety)
// ==========================================
const recentSaleFingerprints = new Map();
let lastPosOpenedPing = 0;

function isDuplicateSale(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  const fp = items
    .map(i => `${(i.name || '').toLowerCase().trim()}x${i.qty}@${i.price}`)
    .sort()
    .join('|');
  if (!fp) return false;

  const now = Date.now();
  // Prune fingerprints older than 30 seconds
  for (const [key, time] of recentSaleFingerprints.entries()) {
    if (now - time > 30000) recentSaleFingerprints.delete(key);
  }

  if (recentSaleFingerprints.has(fp)) {
    console.log('🛡️ [PharmastackX] Duplicate sale detected across open tabs. Discarding duplicate.');
    return true;
  }

  recentSaleFingerprints.set(fp, now);
  return false;
}

// ==========================================
// Manifest V3 Alarms (Persistent Heartbeat)
// ==========================================
chrome.alarms.create('pst_keepalive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pst_keepalive') {
    syncInventoryToCloud();
    syncSalesToCloud();
    syncSearchesToCloud();
    checkRemoteSyncRequests();
  }
});

// Background sync loop checks every 15 seconds while active
setInterval(() => {
  syncInventoryToCloud();
  syncSalesToCloud();
  syncSearchesToCloud();
  checkRemoteSyncRequests();
}, 15000);

// Listen for runtime messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'TRIGGER_SYNC') {
    syncInventoryToCloud();
    syncSalesToCloud();
    syncSearchesToCloud();
  }

  if (msg.action === 'POS_PAGE_LOADED') {
    const now = Date.now();
    // Debounce multi-tab restore on browser startup (ignore redundant pings within 30s)
    if (now - lastPosOpenedPing > 30000) {
      lastPosOpenedPing = now;
      runAutonomousInventorySync(false);
    }
  }

  if (msg.action === 'INVENTORY_SCANNED' && msg.data && msg.data.rows) {
    chrome.storage.local.get(['columnMapping', 'currentPharmacy'], (store) => {
      const pharmacyId = (store.currentPharmacy && store.currentPharmacy.id) || 'DEFAULT';
      const mapping = store.columnMapping;
      let finalRows = msg.data.rows;

      if (mapping && finalRows.length > 0 && Array.isArray(finalRows[0])) {
        finalRows = finalRows.map(row => {
          const extra = {};
          if (mapping.customCols && Array.isArray(mapping.customCols)) {
            mapping.customCols.forEach(c => {
              extra[c.label] = (c.colIdx >= 0 && row[c.colIdx] !== undefined) ? String(row[c.colIdx]) : '-';
            });
          }
          return {
            sn: (mapping.mapId >= 0 && row[mapping.mapId] !== undefined) ? String(row[mapping.mapId]) : '',
            name: (mapping.mapName >= 0 && row[mapping.mapName] !== undefined) ? String(row[mapping.mapName]) : 'Item',
            qty: (mapping.mapQty >= 0 && row[mapping.mapQty] !== undefined) ? row[mapping.mapQty] : 0,
            price: (mapping.mapPrice >= 0 && row[mapping.mapPrice] !== undefined) ? row[mapping.mapPrice] : 0,
            extra: extra
          };
        }).filter(r => !(r.name === 'Item' && r.qty === 0 && r.price === 0));
      }

      fetch(`${CLOUD_API}/sync-inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pharmacyId: pharmacyId, rows: finalRows })
      }).then(() => {
        console.log(`📦 [PharmastackX] Auto-scanned ${finalRows.length} inventory items synced to MongoDB!`);
        chrome.storage.local.set({ lastInventorySyncTime: Date.now() });
      }).catch(e => console.warn('Failed to sync auto-scanned inventory:', e));
    });
  }

  if (msg.action === 'SEARCH_DETECTED') {
    chrome.storage.local.get(['unsyncedSearches', 'currentPharmacy', 'terminalId'], (data) => {
      const existing = data.unsyncedSearches || [];
      const query = msg.data.query;
      const last = existing[existing.length - 1];

      // If typed consecutive prefix within 4 seconds, collapse into the longest query
      if (last && (query.toLowerCase().startsWith(last.query.toLowerCase()) || last.query.toLowerCase().startsWith(query.toLowerCase())) && (Date.now() - (last.timestamp || 0) < 4000)) {
        if (query.length >= last.query.length) {
          existing[existing.length - 1] = { ...msg.data, terminalId: data.terminalId || 'Counter 1' };
        }
      } else {
        existing.push({ ...msg.data, terminalId: data.terminalId || 'Counter 1' });
      }

      chrome.storage.local.set({ unsyncedSearches: existing.slice(-50) });
    });
  }
  
  if (msg.action === 'SALE_DETECTED') {
    if (msg.data.parsed && msg.data.parsed.items && isDuplicateSale(msg.data.parsed.items)) {
      return;
    }

    chrome.storage.local.get(['setupComplete', 'unsyncedSales', 'currentPharmacy', 'terminalId'], (data) => {
      if (data.setupComplete && msg.data.parsed && msg.data.parsed.items.length > 0) {
        const newSale = {
          pharmacyId: (data.currentPharmacy && data.currentPharmacy.id) || 'DEFAULT',
          terminalId: data.terminalId || 'Counter 1',
          items: msg.data.parsed.items,
          source: msg.data.parsed.source,
          timestamp: Date.now()
        };
        chrome.storage.local.set({ unsyncedSales: [...(data.unsyncedSales || []), newSale] }, () => {
          syncSalesToCloud(); // Immediately trigger sync for this new sale
        });
      }
    });
  }
});
