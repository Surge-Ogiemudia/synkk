// PST Content Script

let isTraining = false;
let isScraping = false;
let stopRequested = false;

// Notify background worker that POS page is open
try {
  chrome.runtime.sendMessage({
    action: "POS_PAGE_LOADED",
    url: window.location.href,
    host: window.location.hostname
  });
} catch(e) {}

// Autonomous Ghost Tab Auto-Sync Handler
if (window.location.hash.includes('pst-auto-sync')) {
  console.log("👻 [PharmastackX] Autonomous Ghost Tab Sync initialized...");
  const runGhostSync = async () => {
    try {
      await new Promise(r => setTimeout(r, 2500)); // Wait for DOM/table
      const storage = await new Promise(r => chrome.storage.local.get(['pmsInventoryConfig', 'columnMapping'], r));
      const paginationData = (storage.pmsInventoryConfig && storage.pmsInventoryConfig.paginationData) || null;
      await startAutoScrape(paginationData);
      setTimeout(() => {
        try { window.close(); } catch(e) {}
      }, 2000);
    } catch(err) {
      console.warn("Ghost sync execution error:", err);
    }
  };

  if (document.readyState === 'complete') {
    runGhostSync();
  } else {
    window.addEventListener('load', runGhostSync);
  }
}

// 1. Listen for messages from side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "GET_PMS_METADATA") {
    sendResponse(getPMSMetadata());
    return true;
  }

  if (msg.action === "START_TRAINING") {
    isTraining = true;
    document.body.style.cursor = "crosshair";
    
    // Add visual overlay on hover
    document.addEventListener("mouseover", highlightElement, true);
    document.addEventListener("mouseout", removeHighlight, true);
    document.addEventListener("click", captureClick, true);
  }

  if (msg.action === "SCAN_INVENTORY") {
    if (isScraping) return; // Prevent double scanning
    startAutoScrape(msg.paginationData);
  }

  if (msg.action === "STOP_SCANNING") {
    stopRequested = true;
  }
});

// =============================================
// Auto-Capture PMS URL, Name, & Credentials
// =============================================
let capturedCredentials = null;

function getPMSMetadata() {
  const url = window.location.href;
  const host = window.location.hostname.replace('www.', '');
  const title = document.title || host;

  // Extract clean app name from title or hostname
  let pmsName = host.split('.')[0];
  if (pmsName.length < 3) pmsName = host;
  pmsName = pmsName.charAt(0).toUpperCase() + pmsName.slice(1);

  return {
    url: url,
    host: host,
    pmsName: pmsName,
    credentials: capturedCredentials
  };
}

function sendCapturedLogin(creds) {
  if (!creds || !creds.password) return;
  capturedCredentials = creds;
  console.log("[PharmastackX] Captured Login & PMS URL:", creds);

  // Send to sidepanel for user confirmation instead of fetching directly
  chrome.runtime.sendMessage({ action: "PMS_LOGIN_CAPTURED", data: creds }).catch(e => {});
}

function tryExtractDOMCredentials() {
  try {
    const passInput = document.querySelector('input[type="password"]');
    if (!passInput || !passInput.value) return null;

    const allInputs = Array.from(document.querySelectorAll('input'));
    const passIdx = allInputs.indexOf(passInput);
    
    let userInput = null;
    if (passIdx > 0) {
      for (let i = passIdx - 1; i >= 0; i--) {
        const type = (allInputs[i].type || 'text').toLowerCase();
        if (type === 'text' || type === 'email' || type === 'number') {
          userInput = allInputs[i];
          break;
        }
      }
    }

    const username = userInput ? userInput.value.trim() : '';
    const password = passInput.value;

    if (password) {
      return {
        pmsUrl: window.location.href,
        username: username,
        password: password
      };
    }
  } catch(e) {}
  return null;
}

// Passive login form submission listener
document.addEventListener("submit", (e) => {
  const creds = tryExtractDOMCredentials();
  if (creds) sendCapturedLogin(creds);
}, true);

// Universal button click listener for SPA login forms (React/Vue/Angular/jQuery)
document.addEventListener("click", (e) => {
  const target = e.target;
  if (!target) return;
  const tag = (target.tagName || '').toLowerCase();
  const text = (target.innerText || target.value || '').toLowerCase();
  
  if (tag === 'button' || tag === 'input' || text.includes('log') || text.includes('sign') || text.includes('submit') || text.includes('enter')) {
    const creds = tryExtractDOMCredentials();
    if (creds) sendCapturedLogin(creds);
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const creds = tryExtractDOMCredentials();
    if (creds) sendCapturedLogin(creds);
  }
}, true);

// Send initial metadata as soon as script loads
try {
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: "PMS_METADATA_UPDATED", data: getPMSMetadata() });
  }, 500);
} catch(e) {}

// =============================================
// Silent On-Visit Inventory Auto-Sync Engine
// =============================================
function checkAndAutoSyncInventory() {
  try {
    const url = window.location.href.toLowerCase();
    const isInventoryPage = 
      url.includes('product') || url.includes('catalog') || 
      url.includes('inventory') || url.includes('pos') || 
      url.includes('stock') || url.includes('item');

    if (!isInventoryPage) return;

    // Check throttle (auto-sync once every 10 minutes per domain)
    const hostKey = "lastAutoSync_" + window.location.hostname;
    chrome.storage.local.get([hostKey, "currentPharmacy"], (stored) => {
      const lastSync = stored[hostKey] || 0;
      const now = Date.now();

      if (now - lastSync < 10 * 60 * 1000) {
        return; // Throttle active
      }

      // Wait 3 seconds after page load for DOM table to settle
      setTimeout(() => {
        const data = scrapeInventory();
        if (data && data.rows && data.rows.length >= 3) {
          const pharmacyId = (stored.currentPharmacy && stored.currentPharmacy.id) ? stored.currentPharmacy.id : 'DEFAULT';
          
          fetch("https://www.pharmastackx.com/api/extension/sync-inventory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pharmacyId: pharmacyId,
              rows: data.rows
            })
          }).then(() => {
            console.log(`📦 [PharmastackX] Silently auto-synced ${data.rows.length} total inventory items!`);
            chrome.storage.local.set({ [hostKey]: now });
          }).catch(e => {});
        }
      }, 3000);
    });
  } catch(e) {}
}

// Auto-trigger on page visit
try {
  setTimeout(checkAndAutoSyncInventory, 2500);
} catch(e) {}

// =============================================
// Universal Sale Data Parser
// =============================================
function parseSaleData(reqBody, payload) {
  // Strategy 1: Find a JSON array of line items anywhere in the response
  const jsonItems = findItemsArray(payload) || findItemsArray(reqBody);
  if (jsonItems && jsonItems.length > 0) {
    return { items: jsonItems, source: 'json' };
  }

  // Strategy 2: Find an HTML string anywhere in the response and parse its table
  const htmlItems = findHtmlTableItems(payload) || findHtmlTableItems(reqBody);
  if (htmlItems && htmlItems.length > 0) {
    return { items: htmlItems, source: 'html' };
  }

  return { items: [], source: 'unknown' };
}

// Recursively search an object for all arrays that look like line items and return the best one
function findItemsArray(rootObj) {
  const candidates = [];
  
  function search(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 15) return;
    
    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === 'object') {
        const score = scoreLineItemArray(obj);
        if (score > 0) candidates.push({ array: obj, score });
      }
    } else {
      for (const key of Object.keys(obj)) {
        search(obj[key], depth + 1);
      }
    }
  }
  
  search(rootObj);
  
  if (candidates.length === 0) return null;
  
  // Sort by score descending and return the best match
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].array.map(normalizeItem);
}

const NAME_KEYS   = ['name','product','product_name','item','item_name','description','drug','medicine'];
const QTY_KEYS    = ['qty','quantity','units','count','amount_qty','quantity_sold'];
const PRICE_KEYS  = ['price','unit_price','rate','cost','selling_price','retail_price','subtotal','sub_total','amount','total'];

function scoreLineItemArray(arr) {
  // Sample up to 3 items in the array to determine its quality
  const sample = arr.slice(0, 3);
  let totalScore = 0;
  
  for (const obj of sample) {
    if (!obj || typeof obj !== 'object') continue;
    const keys = Object.keys(obj).map(k => k.toLowerCase());
    const hasName  = NAME_KEYS.some(k  => keys.some(key => key.includes(k)));
    const hasQty   = QTY_KEYS.some(k   => keys.some(key => key.includes(k)));
    const hasPrice = PRICE_KEYS.some(k => keys.some(key => key.includes(k)));
    
    let score = 0;
    if (hasName) score += 2;
    if (hasQty) score += 1;
    if (hasPrice) score += 1;
    
    // Penalty if name is just an ID (if we can detect it)
    if (hasName && !hasPrice && !hasQty) score -= 1;
    
    if (score >= 2) totalScore += score;
  }
  return totalScore;
}

function normalizeItem(obj) {
  const keys = Object.keys(obj);
  const findVal = (candidates, preferNumber = false) => {
    let fallback = undefined;
    
    // Check exact matches first, then substring matches
    for (const exact of [true, false]) {
      for (const c of candidates) {
        const match = keys.find(k => exact ? k.toLowerCase() === c : k.toLowerCase().includes(c));
        if (match !== undefined && obj[match] !== null && obj[match] !== undefined) {
          const val = obj[match];
          
          if (preferNumber) {
            const strVal = String(val).replace(/[^0-9.-]+/g, "");
            if (strVal === "") continue; // Reject pure strings like "retail"
            
            const numVal = parseFloat(strVal);
            if (!isNaN(numVal)) {
              if (numVal > 0) return val; // Found a non-zero number, perfect match!
              if (fallback === undefined) fallback = val; // Save 0 as a fallback
            }
          } else {
            if (String(val).trim() !== "") return val;
          }
        }
      }
    }
    return fallback !== undefined ? fallback : '-';
  };
  return {
    name:  findVal(NAME_KEYS, false),
    qty:   findVal(QTY_KEYS, true),
    price: findVal(PRICE_KEYS, true)
  };
}

// Find any HTML string in the object and extract its largest table
function findHtmlTableItems(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (typeof obj === 'string' && obj.includes('<table')) {
    return extractTableFromHtml(obj);
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const result = findHtmlTableItems(obj[key], depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function extractTableFromHtml(htmlStr) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');
    const tables = Array.from(doc.querySelectorAll('table'));
    if (!tables.length) return null;
    
    // Pick the largest table
    const table = tables.reduce((a, b) => 
      b.querySelectorAll('tr').length > a.querySelectorAll('tr').length ? b : a
    );
    
    const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText || th.textContent).map(h => h.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr, tr')).map(tr => {
      return Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || td.textContent).trim().replace(/\s+/g, ' '));
    }).filter(r => r.length > 1);
    
    if (!rows.length) return null;
    
    // Map rows using detected headers
    return rows.map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || '-'; });
      const normalized = normalizeItem(obj);
      // If normalizeItem couldn't match, just use positional
      if (normalized.name === '-' && normalized.qty === '-') {
        return { name: row[0] || '-', qty: row[1] || '-', price: row[2] || '-' };
      }
      return normalized;
    });
  } catch(e) {
    return null;
  }
}

async function startAutoScrape(paginationSelector) {
  isScraping = true;
  stopRequested = false;
  
  let aggregatedRows = [];
  let headers = [];
  let currentPage = 1;
  let lastRowHash = "";

  try {
    while (!stopRequested) {
    const data = scrapeInventory();
    if (currentPage === 1) headers = data.headers;
    
    // Check if the current page actually returned new data
    if (data.rows.length === 0) break;
    
    // Create a hash of the first 5 rows to detect if the table actually changed
    const currentRowHash = data.rows.slice(0, 5).map(r => r.join("|")).join("||");
    if (currentRowHash === lastRowHash && currentPage > 1) {
      break; // The page didn't actually change!
    }
    lastRowHash = currentRowHash;
    
    aggregatedRows = aggregatedRows.concat(data.rows);

    // Now that we have scraped this page, update the UI
    chrome.runtime.sendMessage({ action: "SCRAPE_PROGRESS", page: currentPage, totalItems: aggregatedRows.length });

    if (!paginationSelector) break; // Single page scan

    let nextBtn = null;
    try {
      nextBtn = document.querySelector(paginationSelector.selector);
    } catch(e) {
      console.warn("PST: Invalid primary selector, falling back.", e);
    }
    
    // Fallback: If strict selector fails, try to find it by exact class or text
    if (!nextBtn) {
      const allLinks = Array.from(document.querySelectorAll("a, button"));
      if (paginationSelector.selectorClass) {
        nextBtn = allLinks.find(el => el.className === paginationSelector.selectorClass);
      }
      if (!nextBtn && paginationSelector.selectorText) {
        nextBtn = allLinks.find(el => el.innerText && el.innerText.trim() === paginationSelector.selectorText);
      }
    }

    if (!nextBtn || nextBtn.disabled || nextBtn.hasAttribute('disabled') || nextBtn.classList.contains('disabled')) {
      break;
    }

    nextBtn.click();
    
    // Dynamically wait for the table to change (up to 10 seconds)
    let waited = 0;
    let tableChanged = false;
    while (waited < 10000 && !stopRequested) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
      
      const checkData = scrapeInventory();
      if (checkData.rows.length > 0) {
        const checkHash = checkData.rows.slice(0, 5).map(r => r.join("|")).join("||");
        if (checkHash !== currentRowHash) {
          tableChanged = true;
          break;
        }
      }
    }

    if (!tableChanged) {
      break; // Page didn't change after 10 seconds, must be the end.
    }

    currentPage++;

      if (currentPage > 50) break; // Hard limit safety
    }
  } catch (e) {
    console.error("PST Auto Scrape Error:", e);
  } finally {
    isScraping = false;
    chrome.runtime.sendMessage({ action: "INVENTORY_SCANNED", data: { headers: headers, rows: aggregatedRows } });
  }
}

// 2. Training Logic
let currentHighlight = null;

function highlightElement(e) {
  if (!isTraining) return;
  if (currentHighlight) currentHighlight.style.outline = "";
  currentHighlight = e.target;
  currentHighlight.style.outline = "2px solid #00d4aa";
  currentHighlight.style.outlineOffset = "2px";
}

function removeHighlight(e) {
  if (!isTraining) return;
  if (currentHighlight) currentHighlight.style.outline = "";
}

function captureClick(e) {
  if (!isTraining) return;
  e.preventDefault();
  e.stopPropagation();

  isTraining = false;
  document.body.style.cursor = "default";
  
  document.removeEventListener("mouseover", highlightElement, true);
  document.removeEventListener("mouseout", removeHighlight, true);
  document.removeEventListener("click", captureClick, true);

  if (currentHighlight) currentHighlight.style.outline = "";

  const selector = generateSelector(e.target);
  const selectorText = e.target.innerText ? e.target.innerText.trim() : "";
  const selectorClass = e.target.className && typeof e.target.className === 'string' ? e.target.className : "";
  
  chrome.runtime.sendMessage({ 
    action: "TRAINING_COMPLETE", 
    selector: selector,
    selectorText: selectorText,
    selectorClass: selectorClass
  });
}

// Very basic unique selector generator
function generateSelector(el) {
  if (el.id) return `#${el.id}`;
  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += `#${el.id}`;
      path.unshift(selector);
      break;
    } else {
      let sib = el, nth = 1;
      while (sib = sib.previousElementSibling) {
        if (sib.nodeName.toLowerCase() === selector) nth++;
      }
      if (nth != 1) selector += `:nth-of-type(${nth})`;
    }
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(" > ");
}

// 3. Scraping Logic
function scrapeInventory() {
  // Strategy A: HTML <table> based layout
  const tables = document.querySelectorAll("table");
  let targetTable = null;
  let maxRows = 0;

  tables.forEach(t => {
    const rows = t.querySelectorAll("tr");
    if (rows.length > maxRows) {
      maxRows = rows.length;
      targetTable = t;
    }
  });

  if (targetTable && maxRows > 1) {
    let headers = [];
    const headerRow = targetTable.querySelector("thead tr") || targetTable.querySelector("tr");
    if (headerRow) {
      headers = Array.from(headerRow.querySelectorAll("th, td")).map(c => c.innerText.trim().replace(/\n/g, ' '));
    }
    const results = [];
    const rows = targetTable.querySelectorAll("tbody tr, tr");
    rows.forEach(row => {
      if (row === headerRow) return;
      const cells = Array.from(row.querySelectorAll("td")).map(c => c.innerText.trim().replace(/\n/g, ' | ').replace(/\s+/g, ' '));
      if (cells.length > 0) results.push(cells);
    });
    if (results.length > 0) return { headers, rows: results };
  }

  // Strategy B: Card/grid layout (no table found — look for repeated product card pattern)
  // Find groups of sibling elements that repeat with similar structure
  const candidates = Array.from(document.querySelectorAll('[class*="product"], [class*="item"], [class*="card"], [class*="catalog"], [class*="grid"]'));
  
  // Pick the container with the most direct children that look like cards
  let bestContainer = null;
  let bestCount = 0;
  candidates.forEach(el => {
    const children = Array.from(el.children);
    if (children.length > bestCount && children.length > 2) {
      bestCount = children.length;
      bestContainer = el;
    }
  });

  if (bestContainer && bestCount > 2) {
    const results = [];
    Array.from(bestContainer.children).forEach(card => {
      const text = card.innerText || card.textContent || '';
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length >= 1) results.push(lines);
    });
    if (results.length > 0) {
      return { headers: ['Product Info'], rows: results };
    }
  }

  return { headers: [], rows: [] };
}

// 4. Listen for network events from injected script
let networkLogBuffer = [];

function flushNetworkLogs() {
  if (networkLogBuffer.length === 0) return;
  const logsToFlush = [...networkLogBuffer];
  networkLogBuffer = [];

  chrome.storage.local.get(["currentPharmacy"], (stored) => {
    const pharmacyId = (stored.currentPharmacy && stored.currentPharmacy.id) ? stored.currentPharmacy.id : 'DEFAULT';
    fetch("https://www.pharmastackx.com/api/extension/log-network-traffic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pharmacyId, logs: logsToFlush })
    }).catch(e => {});
  });
}

// Flush logs periodically
setInterval(flushNetworkLogs, 4000);

// =============================================
// Background API Pagination Loop Engine
// =============================================
let activeAPIPaginationLock = false;

async function triggerBackgroundAPIPagination(url, pageOneItems) {
  if (activeAPIPaginationLock) return;
  activeAPIPaginationLock = true;

  try {
    console.log(`🚀 [PharmastackX] Detected product API (${pageOneItems.length} items on Page 1). Starting silent background pagination loop...`);
    let allItems = [...pageOneItems];
    let page = 2;
    const maxPages = 60;

    // Check domain throttle
    const hostKey = "lastAPISync_" + window.location.hostname;
    const stored = await new Promise(resolve => chrome.storage.local.get([hostKey, "currentPharmacy"], resolve));
    const lastSync = stored[hostKey] || 0;
    const now = Date.now();

    if (now - lastSync < 10 * 60 * 1000) {
      console.log("⏳ [PharmastackX] Background API pagination throttled (synced within last 10m).");
      activeAPIPaginationLock = false;
      return;
    }

    const pharmacyId = (stored.currentPharmacy && stored.currentPharmacy.id) ? stored.currentPharmacy.id : 'DEFAULT';

    while (page <= maxPages) {
      try {
        const pageUrl = url.replace(/([?&]page=)1\b/i, `$1${page}`);
        if (pageUrl === url) break; // Couldn't replace page parameter

        const res = await fetch(pageUrl);
        if (!res.ok) break;
        const json = await res.json();
        const pageItems = typeof findProductArrayInJSON === 'function' ? findProductArrayInJSON(json) : [];
        
        if (!pageItems || pageItems.length === 0) break;
        allItems = allItems.concat(pageItems);
        page++;
      } catch(e) {
        break;
      }
    }

    console.log(`✅ [PharmastackX] Finished background API pagination: fetched ${allItems.length} total items across ${page - 1} pages!`);

    // Post complete multi-page inventory snapshot to backend
    fetch("https://www.pharmastackx.com/api/extension/sync-inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pharmacyId: pharmacyId,
        rows: allItems
      })
    }).then(() => {
      console.log("📦 [PharmastackX] Complete multi-page inventory synced to MongoDB!");
      chrome.storage.local.set({ [hostKey]: now, cachedProductApiUrl: url, lastInventorySyncTime: now });
    }).catch(e => {});

  } catch(e) {
    console.warn("Background API pagination error:", e);
  } finally {
    activeAPIPaginationLock = false;
  }
}

function extractSearchQuery(url, reqBody) {
  try {
    if (url && (url.includes('?') || url.includes('search') || url.includes('find') || url.includes('query'))) {
      const parsed = new URL(url, window.location.href);
      const searchKeys = ['q', 'search', 'query', 'term', 'keyword', 'filter', 'name', 'search_term', 'searchterm', 'product_name', 'item_name', 'search_query'];
      for (const k of searchKeys) {
        const val = parsed.searchParams.get(k);
        if (val && typeof val === 'string' && val.trim().length >= 2) {
          if (!/^\d+$/.test(val.trim())) {
            return val.trim();
          }
        }
      }
    }
  } catch(e) {}

  if (reqBody && typeof reqBody === 'object') {
    const bodyKeys = ['query', 'search', 'q', 'term', 'keyword', 'filter', 'name', 'search_term', 'searchterm', 'product_name', 'item_name', 'search_query'];
    for (const k of bodyKeys) {
      const val = reqBody[k];
      if (val && typeof val === 'string' && val.trim().length >= 2) {
        if (!/^\d+$/.test(val.trim())) {
          return val.trim();
        }
      }
    }
  }

  return null;
}

function evaluateSearchResultCount(payload, query) {
  if (!payload) return 0;

  // Extract products/items array from payload
  let itemsArray = null;
  if (Array.isArray(payload)) {
    itemsArray = payload;
  } else if (typeof payload === 'object') {
    const listKeys = ['data', 'items', 'products', 'results', 'rows', 'list', 'records'];
    for (const k of listKeys) {
      if (Array.isArray(payload[k])) {
        itemsArray = payload[k];
        break;
      }
    }
  }

  // If an array of items was returned by the POS API
  if (itemsArray !== null) {
    if (itemsArray.length === 0) return 0;
    if (!query) return itemsArray.length;

    const cleanQuery = query.toLowerCase().trim();
    const queryWords = cleanQuery.split(/\s+/).filter(w => w.length >= 2);

    // Verify relevance: check if at least one returned product truly matches the search term
    const relevantItems = itemsArray.filter(item => {
      let itemText = '';
      if (typeof item === 'string') {
        itemText = item;
      } else if (typeof item === 'object' && item !== null) {
        itemText = [
          item.name, item.product_name, item.item_name, item.title, item.label,
          item.generic_name, item.brand, item.brand_name, item.description
        ].filter(Boolean).join(' ');
      }
      const cleanItemText = itemText.toLowerCase();

      // 1. Direct substring match (e.g. "amatem" inside "amatem softgel")
      if (cleanItemText.includes(cleanQuery)) return true;

      // 2. Multi-word match: all query words are present
      if (queryWords.length > 1 && queryWords.every(w => cleanItemText.includes(w))) {
        return true;
      }

      // 3. Primary keyword match (longest query word, e.g. "amatem" in "amatem 80/480")
      const primaryWord = queryWords.reduce((a, b) => a.length >= b.length ? a : b, '');
      if (primaryWord && primaryWord.length >= 4 && cleanItemText.includes(primaryWord)) {
        return true;
      }

      return false;
    });

    // If POS returned random fuzzy results (e.g. Amstel Malt when searching amatem),
    // relevantItems will be 0, correctly identifying it as OUT OF STOCK!
    return relevantItems.length;
  }

  // Fallback if API returned aggregate totals without raw arrays
  if (typeof payload === 'object') {
    if (typeof payload.total === 'number') return payload.total;
    if (typeof payload.count === 'number') return payload.count;
    if (typeof payload.total_records === 'number') return payload.total_records;
    if (typeof payload.totalRecords === 'number') return payload.totalRecords;
    if (typeof payload.totalCount === 'number') return payload.totalCount;
  }

  return -1;
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data && event.data.type === "PST_LOGIN_INTERCEPTED") {
    sendCapturedLogin({
      pmsUrl: event.data.pmsUrl || window.location.href,
      username: event.data.username,
      password: event.data.password
    });
  }

  if (event.data && event.data.type === "PST_RAW_NETWORK_STREAM") {
    const url = event.data.url || '';
    // Skip extension's own backend sync calls to the PSX server
    if (url.includes('pharmastackx.com/api/extension') || url.includes('pharmastackx.com/api/log-network') || url.includes('/api/dashboard-data') || url.includes('/api/network-logs')) {
      return;
    }

    networkLogBuffer.push({
      method: event.data.method,
      url: event.data.url,
      requestPayload: event.data.reqBody,
      responseStatus: event.data.status,
      responseSnippet: event.data.resSnippet
    });
    if (networkLogBuffer.length >= 5) {
      flushNetworkLogs();
    }
  }

  if (event.data.type && event.data.type === "PST_NETWORK_INTERCEPT") {
    const payload = event.data.payload;
    const reqBody = event.data.reqBody || {};
    const method = event.data.method || 'GET';
    const url = event.data.url || '';

    // Check if network payload contains a paginated product API
    try {
      if (payload && typeof findProductArrayInJSON === 'function' && (url.toLowerCase().includes('page=1') || url.toLowerCase().includes('products') || url.toLowerCase().includes('inventory') || url.toLowerCase().includes('pos'))) {
        const items = findProductArrayInJSON(payload);
        if (items && items.length >= 3 && (url.includes('page=1') || url.includes('page=1&'))) {
          triggerBackgroundAPIPagination(url, items);
        }
      }
    } catch(err) {
      console.warn("Pagination detection error bypassed:", err);
    }

    // ----------------------------------------------------
    // Zero-Assumption Search Demand & Lost Sale Interceptor
    // ----------------------------------------------------
    try {
      const searchQuery = extractSearchQuery(url, reqBody);
      if (searchQuery) {
        const resultCount = evaluateSearchResultCount(payload, searchQuery);
        if (resultCount >= 0) {
          chrome.runtime.sendMessage({
            action: "SEARCH_DETECTED",
            data: {
              query: searchQuery,
              resultCount: resultCount,
              url: url,
              timestamp: Date.now()
            }
          });
        }
      }
    } catch(err) {
      console.warn("Search interception bypassed:", err);
    }

    if (method !== 'POST' && method !== 'PUT') return;

    const strPayload = JSON.stringify(payload || {}).toLowerCase();
    const strReq = JSON.stringify(reqBody || {}).toLowerCase();
    const urlLower = url.toLowerCase();

    const looksLikeSale = 
      urlLower.includes('sale') || urlLower.includes('checkout') || urlLower.includes('order') || 
      urlLower.includes('invoice') || urlLower.includes('cart') || urlLower.includes('pos') ||
      urlLower.includes('payment') || urlLower.includes('bill') || urlLower.includes('receipt') ||
      strPayload.includes('receipt') || strPayload.includes('invoice') ||
      strReq.includes('qty') || strReq.includes('quantity') ||
      strReq.includes('price') || strReq.includes('amount');

    if (!looksLikeSale) return;

    const parsed = parseSaleData(reqBody, payload);
    
    chrome.runtime.sendMessage({ 
      action: "SALE_DETECTED", 
      data: { 
        url: url,
        method: method,
        reqBody: reqBody,
        payload: payload,
        parsed: parsed
      } 
    });
  }
});
