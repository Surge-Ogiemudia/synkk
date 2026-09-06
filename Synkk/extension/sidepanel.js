document.addEventListener("DOMContentLoaded", () => {
  const stepAuth = document.getElementById("stepAuth");
  const step1 = document.getElementById("step1");
  
  const step2 = document.getElementById("step2");
  const btnConfirmURL = document.getElementById("btnConfirmURL");
  const urlDetectionFeed = document.getElementById("urlDetectionFeed");
  const accountDetectionFeed = document.getElementById("accountDetectionFeed");
  const accountAlert = document.getElementById("accountAlert");
  const btnConfirmAccount = document.getElementById("btnConfirmAccount");
  let pendingCreds = null;
  const step3 = document.getElementById("step3");
  const step4 = document.getElementById("step4");

  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const eyeIcon = document.getElementById("eyeIcon");
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener("click", () => {
      const type = authPassword.getAttribute("type") === "password" ? "text" : "password";
      authPassword.setAttribute("type", type);
      if (type === "text") {
        eyeIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
      } else {
        eyeIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
      }
    });
  }
  const authAlert = document.getElementById("authAlert");
  const headerStatus = document.getElementById("headerStatus");

  const btnTrainPage = document.getElementById("btnTrainPage");
  const btnScanInventory = document.getElementById("btnScanInventory");
  const btnStopScanning = document.getElementById("btnStopScanning");
  const btnConfirmInventory = document.getElementById("btnConfirmInventory");
  const btnConfirmSale = document.getElementById("btnConfirmSale");

  const trainingAlert = document.getElementById("trainingAlert");
  const s1Btns = document.getElementById("s1-btns");
  const s1ConfirmBtns = document.getElementById("s1-confirm-btns");
  const s2ConfirmBtns = document.getElementById("s2-confirm-btns");
  
  const inventoryHead = document.getElementById("inventoryHead");
  const inventoryTable = document.getElementById("inventoryTable");
  const inventoryBody = document.getElementById("inventoryBody");

  const btnMapColumns = document.getElementById("btnMapColumns");
  const mappingUI = document.getElementById("mappingUI");
  const btnApplyMapping = document.getElementById("btnApplyMapping");
  const mapSelects = document.querySelectorAll(".map-select");
  
  let activePMSMetadata = null;
  let urlLocked = false;

  let rawHeaders = [];
  let rawRows = [];
  let savedPaginationData = null;

  const saleTable = document.getElementById("saleTable");
  const saleBody = document.getElementById("saleBody");
  const listeningAlert = document.getElementById("listeningAlert");
  const saleSuccessAlert = document.getElementById("saleSuccessAlert");

  // =============================================
  // AUTHENTICATION & SESSION MANAGEMENT
  // =============================================
  let currentSession = null;

  const inputTerminalName = document.getElementById("inputTerminalName");
  const authTerminalName = document.getElementById("authTerminalName");

  // Load saved terminal name or default to "Counter 1"
  chrome.storage.local.get(["terminalId"], (data) => {
    const term = data.terminalId || "Counter 1";
    if (inputTerminalName) inputTerminalName.value = term;
    if (authTerminalName) authTerminalName.value = term;
  });

  if (inputTerminalName) {
    inputTerminalName.addEventListener("change", () => {
      const val = inputTerminalName.value.trim() || "Counter 1";
      inputTerminalName.value = val;
      chrome.storage.local.set({ terminalId: val });
    });
  }

  if (authTerminalName) {
    authTerminalName.addEventListener("change", () => {
      const val = authTerminalName.value.trim() || "Counter 1";
      authTerminalName.value = val;
      chrome.storage.local.set({ terminalId: val });
      if (inputTerminalName) inputTerminalName.value = val;
    });
  }

  function checkAuth() {
    chrome.storage.local.get(["currentUser", "currentPharmacy"], (data) => {
      if (data.currentUser && data.currentPharmacy) {
        currentSession = { user: data.currentUser, pharmacy: data.currentPharmacy };
        headerStatus.innerText = data.currentPharmacy.name;
        btnLogout.style.display = "inline-block";
        
        stepAuth.style.display = "none";
        step1.style.display = "block";
        step1.classList.add("active");
        step1.style.opacity = "1";
        step1.style.pointerEvents = "auto";

        step2.style.display = "block";
        step2.style.opacity = "0.5";
        step2.style.pointerEvents = "none";
        step3.style.display = "block";
        step3.style.opacity = "0.5";
        step4.style.display = "block";
        step4.style.opacity = "0.5";
      } else {
        currentSession = null;
        headerStatus.innerText = "Not Logged In";
        btnLogout.style.display = "none";
        
        stepAuth.style.display = "block";
        stepAuth.classList.add("active");
        step1.style.display = "none";
        step2.style.display = "none";
        step3.style.display = "none";
        step4.style.display = "none";
      }
    });
  }

  function queryPMSMetadata() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "GET_PMS_METADATA" }, (res) => {
          if (res) updateDetectionBar(res);
        });
      }
    });
  }

  
  function updateDetectionBar(meta) {
    if (!meta || urlLocked) return;
    activePMSMetadata = meta;
    
    if (meta.url && urlDetectionFeed) {
      urlDetectionFeed.innerHTML = `<div class="alert alert-success" style="display:block; background:rgba(35,134,54,0.1); border-color:#3fb950;">
        <strong style="color:#3fb950; display:block; margin-bottom:4px;">✅ POS URL Detected</strong>
        <span style="font-family:monospace; color:var(--muted);">${meta.url}</span>
      </div>`;
      document.getElementById("s1-confirm-btns").style.display = "flex";
    }
  }

  
  if (btnConfirmAccount) {
    btnConfirmAccount.addEventListener("click", () => {
      if (!pendingCreds) return;
      document.getElementById("s1-confirm-account-btns").style.display = "none";
      accountAlert.innerHTML = `<strong style="color:#3fb950; display:block; margin-bottom:4px;">✅ Link Securely Established</strong>
          Account ${pendingCreds.username} successfully linked.`;
          
      step1.classList.remove("active");
      step1.classList.add("completed");
      step1.style.opacity = "0.8";

      step2.classList.add("active");
      step2.style.opacity = "1";
      step2.style.pointerEvents = "auto";
      
      const pharmacyId = currentSession ? currentSession.pharmacy.id : 'DEFAULT';
      fetch("https://www.pharmastackx.com/api/extension/save-pms-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pharmacyId: pharmacyId,
          pmsUrl: pendingCreds.pmsUrl,
          username: pendingCreds.username,
          password: pendingCreds.password
        })
      }).catch(e => console.warn("Failed to sync creds", e));
    });
  }

  checkAuth();
  queryPMSMetadata();
  setInterval(queryPMSMetadata, 2000);

  
  if (btnConfirmURL) {
    btnConfirmURL.addEventListener("click", () => {
      urlLocked = true;
      document.getElementById("s1-confirm-btns").style.display = "none";
      
      const currentUrl = (activePMSMetadata.url || '').toLowerCase();
      const isLoginPage = currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('auth');
      
      const instructionText = isLoginPage 
        ? "Please log in to your POS right now so we can securely link your account."
        : "Please log out and log back in to your POS right now so we can securely link your account.";

      urlDetectionFeed.innerHTML += `<div class="alert alert-info" style="display:block; margin-top:8px;">
          <strong style="color:var(--accent2); display:block; margin-bottom:4px;">🔑 Next Step:</strong>
          ${instructionText}
        </div>`;
        
      // Immediately open Step 2 so they can proceed if they want to!
      step1.style.opacity = "0.8"; // dim slightly but keep active
      
      step2.classList.add("active");
      step2.style.opacity = "1";
      step2.style.pointerEvents = "auto";
        
      const pharmacyId = currentSession ? currentSession.pharmacy.id : 'DEFAULT';
      fetch("https://www.pharmastackx.com/api/extension/save-pms-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pharmacyId: pharmacyId,
          pmsUrl: activePMSMetadata.url,
          username: '',
          password: ''
        })
      }).catch(e => {});
    });
  }

  btnLogin.addEventListener("click", async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();

    if (!email || !password) {
      authAlert.style.display = "block";
      authAlert.className = "alert alert-info";
      authAlert.style.color = "var(--red)";
      authAlert.innerText = "Please enter both email and password.";
      return;
    }

    btnLogin.innerText = "Logging in...";
    btnLogin.disabled = true;
    authAlert.style.display = "none";

    try {
      const res = await fetch("https://www.pharmastackx.com/api/extension/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const termVal = (authTerminalName && authTerminalName.value.trim()) ? authTerminalName.value.trim() : 'Counter 1';
        chrome.storage.local.set({
          currentUser: data.user,
          currentPharmacy: pharmacyObj,
          terminalId: termVal
        }, () => {
          checkAuth();
        });
      } else {
        authAlert.style.display = "block";
        authAlert.className = "alert alert-info";
        authAlert.style.color = "var(--red)";
        authAlert.innerText = "❌ " + (data.error || "Login failed");
      }
    } catch (e) {
      authAlert.style.display = "block";
      authAlert.className = "alert alert-info";
      authAlert.style.color = "var(--red)";
      authAlert.innerText = "❌ Network error connecting to PharmastackX Server";
    } finally {
      btnLogin.innerText = "Log In to PharmastackX";
      btnLogin.disabled = false;
    }
  });

  btnLogout.addEventListener("click", () => {
    chrome.storage.local.remove(["currentUser", "currentPharmacy", "setupComplete"], () => {
      checkAuth();
    });
  });

  // Step 1: Train Pagination
  btnTrainPage.addEventListener("click", () => {
    trainingAlert.style.display = "block";
    btnTrainPage.innerText = "Training...";
    btnTrainPage.disabled = true;

    // Send message to content script to enter "training mode"
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "START_TRAINING" });
    });
  });

  // Step 1: Scan Inventory
  btnScanInventory.addEventListener("click", () => {
    btnScanInventory.innerText = "Scanning...";
    btnScanInventory.style.display = "none";
    btnStopScanning.style.display = "inline-flex";
    
    // Tell content script to scrape the largest table and loop pagination
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "SCAN_INVENTORY", paginationData: savedPaginationData });
    });
  });

  btnStopScanning.addEventListener("click", () => {
    if (!confirm("Are you sure you want to stop scanning? The data collected so far will be saved.")) {
      return;
    }
    btnStopScanning.innerText = "Stopping...";
    
    // Send STOP request to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "STOP_SCANNING" });
    });

    // Fallback: If the content script was destroyed (e.g. by a full page reload),
    // it will never reply with INVENTORY_SCANNED. We forcefully reset the UI after 2s.
    setTimeout(() => {
      if (btnStopScanning.style.display !== "none") {
        console.warn("PST: Content script did not respond to STOP. Force resetting UI.");
        btnScanInventory.innerText = "Scan Current Page";
        btnScanInventory.style.display = "inline-flex";
        btnStopScanning.style.display = "none";
        s1Btns.style.display = "block"; // Restore the train pagination button
      }
    }, 2000);
  });

  // Handle messages from content script/network watcher
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "PMS_LOGIN_CAPTURED") {
      pendingCreds = msg.data;
      if (accountDetectionFeed && accountAlert) {
        accountDetectionFeed.style.display = "flex";
        accountAlert.innerHTML = `<strong style="color:#3fb950; display:block; margin-bottom:4px;">✅ Account Detected</strong>
          Username / Email: <span style="font-weight:bold;">${msg.data.username}</span>`;
        document.getElementById("s1-confirm-account-btns").style.display = "flex";
      }
    }

    if (msg.action === "TRAINING_COMPLETE") {
      trainingAlert.className = "alert alert-success";
      trainingAlert.innerText = `Saved! Selector: ${msg.selector}`;
      btnTrainPage.innerText = "Pagination Trained";
      savedPaginationData = {
        selector: msg.selector,
        selectorText: msg.selectorText,
        selectorClass: msg.selectorClass
      };
    }

    if (msg.action === "SCRAPE_PROGRESS") {
      btnStopScanning.innerText = `Stop (Page ${msg.page} | ${msg.totalItems} items)`;
    }

    if (msg.action === "INVENTORY_SCANNED") {
      // If we already received data from another frame, and this frame is empty, ignore it
      if (rawRows && rawRows.length > 0 && (!msg.data.rows || msg.data.rows.length === 0)) {
        return;
      }
      
      btnScanInventory.innerText = "Scan Current Page";
      btnScanInventory.style.display = "inline-flex";
      btnStopScanning.style.display = "none";
      s1Btns.style.display = "none";
      trainingAlert.style.display = "none";
      
      rawHeaders = msg.data.headers || [];
      rawRows = msg.data.rows || [];

      renderInventoryPreview();
      
      s2ConfirmBtns.style.display = "flex";
    }

    if (msg.action === "SALE_DETECTED") {
      const listeningAlert = document.getElementById("listeningAlert");
      if (listeningAlert) listeningAlert.style.display = "none";
      
      const feed = document.getElementById("networkFeed");
      
      const card = document.createElement("div");
      card.style.background = "var(--surface)";
      card.style.border = "1px solid var(--border)";
      card.style.padding = "10px";
      card.style.borderRadius = "6px";
      card.style.fontSize = "12px";

      const parsed = msg.data.parsed || { items: [], source: 'unknown' };
      let endpointName = (msg.data.url || '').split('?')[0].split('/').pop();
      if (!endpointName || endpointName.length < 2) endpointName = "Endpoint";

      let innerHtml = `<p style="font-weight:600; margin-bottom:8px; color:var(--accent); word-break:break-all;">${msg.data.method} /${endpointName}</p>`;

      if (parsed.items.length > 0) {
        const badge = parsed.source === 'json' ? '🟢 JSON' : '🟡 HTML Receipt';
        innerHtml += `<p style="color:var(--muted); font-size:11px; margin-bottom:6px;">Detected via ${badge}</p>`;
        innerHtml += `<table style="width:100%; border-collapse:collapse; margin-bottom:10px; font-size:11px;">`;
        innerHtml += `<tr style="color:var(--muted);"><th style="text-align:left; padding:4px;">Item</th><th style="text-align:right; padding:4px;">Qty</th><th style="text-align:right; padding:4px;">Price</th></tr>`;
        parsed.items.forEach(item => {
          innerHtml += `<tr style="border-top:1px solid var(--border);"><td style="padding:4px;">${item.name}</td><td style="text-align:right; padding:4px;">${item.qty}</td><td style="text-align:right; padding:4px;">${item.price}</td></tr>`;
        });
        innerHtml += `</table>`;
        innerHtml += `<button class="btn btn-primary btn-select-sale" style="width:100%; padding:6px;">✅ This is my receipt!</button>`;
      } else {
        const rawJson = JSON.stringify({ request: msg.data.reqBody, response: msg.data.payload }, null, 2);
        innerHtml += `<pre style="background:#000; color:#00ff00; padding:8px; border-radius:4px; max-height:80px; overflow:auto; margin-bottom:8px; font-family:monospace; font-size:10px;">${rawJson.substring(0, 600)}${rawJson.length > 600 ? '...' : ''}</pre>`;
        innerHtml += `<p style="color:var(--muted); font-size:11px; margin-bottom:8px;">Could not auto-detect items. Is this your sale?</p>`;
        innerHtml += `<button class="btn btn-secondary btn-select-sale" style="width:100%; padding:6px;">This is the final receipt!</button>`;
      }

      card.innerHTML = innerHtml;

      card.querySelector(".btn-select-sale").addEventListener("click", () => {
         step3.classList.remove("active");
         step3.classList.add("completed");
         step4.classList.add("active");
         
         // Mark setup as complete so background worker starts intercepting silently
         chrome.storage.local.set({ setupComplete: true });
                  // Add sale to local backup queue and trigger sync
          chrome.storage.local.get({ unsyncedSales: [] }, (data) => {
            const newSale = {
              pharmacyId: currentSession ? currentSession.pharmacy.id : 'DEFAULT',
              items: parsed.items,
              source: parsed.source,
              timestamp: Date.now()
            };
            chrome.storage.local.set({ unsyncedSales: [...data.unsyncedSales, newSale] }, () => {
              chrome.runtime.sendMessage({ action: 'TRIGGER_SYNC' });
            });
          });
         
         setTimeout(() => {
           window.close(); // self close
         }, 3000);
      });

      feed.prepend(card);
    }
  });

  // Step 1 -> Step 2
  btnConfirmInventory.addEventListener("click", () => {
      step2.classList.remove("active");
      step2.classList.add("completed");
      step2.style.opacity = "0.8";

      step3.style.display = "block";
      step3.classList.add("active");
      step3.style.opacity = "1";
      step3.style.pointerEvents = "auto";
    
    // Save inventory to local backup queue and trigger sync
    const pharmacyId = currentSession ? currentSession.pharmacy.id : 'DEFAULT';
    chrome.storage.local.set({ 
      unsyncedInventory: { pharmacyId: pharmacyId, rows: rawRows },
      pmsMetadata: activePMSMetadata,
      pmsInventoryConfig: {
        inventoryUrl: (activePMSMetadata && activePMSMetadata.url) ? activePMSMetadata.url : window.location.href,
        paginationData: savedPaginationData,
        rawHeaders: rawHeaders
      }
    }, () => {
      chrome.runtime.sendMessage({ action: 'TRIGGER_SYNC' });
      
      // Save credentials & PMS metadata to backend API
      if (activePMSMetadata) {
        fetch("https://www.pharmastackx.com/api/extension/save-pms-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pharmacyId: pharmacyId,
            pmsName: activePMSMetadata.pmsName,
            pmsUrl: activePMSMetadata.url,
            username: activePMSMetadata.credentials ? activePMSMetadata.credentials.username : '',
            password: activePMSMetadata.credentials ? activePMSMetadata.credentials.password : ''
          })
        }).catch(e => console.warn("Credential sync failed:", e));
      }
    });
  });

  // Dynamic Custom Columns Management
  const btnAddCustomCol = document.getElementById("btnAddCustomCol");
  const customColumnsContainer = document.getElementById("customColumnsContainer");

  function getColumnOptionsHTML() {
    let optionsHTML = '<option value="-1">-- Select Column --</option>';
    if (rawHeaders && rawHeaders.length > 0) {
      rawHeaders.forEach((h, i) => {
        optionsHTML += `<option value="${i}">Col ${i + 1}: ${h || 'Unknown'}</option>`;
      });
    } else if (rawRows && rawRows.length > 0) {
      rawRows[0].forEach((_, i) => {
        optionsHTML += `<option value="${i}">Column ${i + 1}</option>`;
      });
    }
    return optionsHTML;
  }

  if (btnAddCustomCol && customColumnsContainer) {
    btnAddCustomCol.addEventListener("click", () => {
      const rowDiv = document.createElement("div");
      rowDiv.className = "custom-col-row";
      rowDiv.style.cssText = "display:flex; gap:6px; align-items:center; width:100%; box-sizing:border-box;";
      rowDiv.innerHTML = `
        <input type="text" class="custom-col-name" placeholder="Label (e.g. Brand)" style="width:80px; flex-shrink:0; padding:4px 6px; background:var(--surface); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:11px; box-sizing:border-box;" />
        <select class="custom-col-select map-select" style="flex:1; min-width:0; width:0; padding:4px 6px; font-size:11px; background:var(--surface); border:1px solid var(--border); border-radius:4px; color:var(--text); box-sizing:border-box;">
          ${getColumnOptionsHTML()}
        </select>
        <button type="button" class="btn-remove-col" title="Remove" style="flex-shrink:0; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; background:rgba(248,81,73,0.15); border:1px solid rgba(248,81,73,0.3); border-radius:4px; color:var(--red); cursor:pointer; font-weight:bold; font-size:13px; line-height:1; padding:0;">×</button>
      `;
      rowDiv.querySelector(".btn-remove-col").addEventListener("click", () => {
        rowDiv.remove();
      });
      customColumnsContainer.appendChild(rowDiv);
    });
  }

  // Column Mapping Logic
  btnMapColumns.addEventListener("click", () => {
    mappingUI.style.display = "block";
    btnMapColumns.style.display = "none";

    const optionsHTML = getColumnOptionsHTML();

    document.querySelectorAll(".map-select").forEach(select => {
      const curVal = select.value;
      select.innerHTML = optionsHTML;
      if (curVal !== undefined && curVal !== '') select.value = curVal;
    });
  });

  btnApplyMapping.addEventListener("click", () => {
    mappingUI.style.display = "none";
    btnMapColumns.style.display = "inline-flex";
    
    const mapId = parseInt(document.getElementById("mapId").value);
    const mapName = parseInt(document.getElementById("mapName").value);
    const mapQty = parseInt(document.getElementById("mapQty").value);
    const mapPrice = parseInt(document.getElementById("mapPrice").value);

    // Collect any dynamic custom columns (Brand, Size, Category, etc.)
    const customCols = [];
    document.querySelectorAll(".custom-col-row").forEach(rowEl => {
      const labelInput = rowEl.querySelector(".custom-col-name");
      const selectEl = rowEl.querySelector(".custom-col-select");
      const label = (labelInput ? labelInput.value.trim() : '') || 'Attribute';
      const colIdx = selectEl ? parseInt(selectEl.value) : -1;
      if (colIdx >= 0) {
        customCols.push({ label, colIdx });
      }
    });

    // Transform rawRows into structured item objects with core + extra attributes
    rawRows = rawRows.map(row => {
      const extra = {};
      customCols.forEach(c => {
        extra[c.label] = (c.colIdx >= 0 && row[c.colIdx] !== undefined) ? String(row[c.colIdx]) : '-';
      });

      return {
        sn: (mapId >= 0 && row[mapId] !== undefined) ? String(row[mapId]) : '',
        name: (mapName >= 0 && row[mapName] !== undefined) ? String(row[mapName]) : 'Item',
        qty: (mapQty >= 0 && row[mapQty] !== undefined) ? row[mapQty] : 0,
        price: (mapPrice >= 0 && row[mapPrice] !== undefined) ? row[mapPrice] : 0,
        extra: extra
      };
    }).filter(row => {
      return !(row.name === 'Item' && row.qty === 0 && row.price === 0);
    });

    // Persist mapping configuration for autonomous future syncs
    const currentMapping = {
      mapId,
      mapName,
      mapQty,
      mapPrice,
      customCols
    };
    chrome.storage.local.set({ columnMapping: currentMapping });

    // Re-render table preview with mapped data
    const headerTitles = ['Item Name', ...customCols.map(c => c.label), 'Qty', 'Price'];
    inventoryHead.innerHTML = "<tr>" + headerTitles.map(h => `<th>${h}</th>`).join('') + "</tr>";
    inventoryBody.innerHTML = "";
    
    rawRows.slice(0, 3).forEach(row => {
      let cells = `<td>${row.name}</td>`;
      customCols.forEach(c => {
        cells += `<td>${(row.extra && row.extra[c.label]) || '-'}</td>`;
      });
      cells += `<td>${row.qty}</td><td>${row.price}</td>`;
      inventoryBody.innerHTML += `<tr>${cells}</tr>`;
    });
    
    if (rawRows.length > 3) {
      inventoryBody.innerHTML += `<tr><td colspan="${headerTitles.length}" style="text-align:center; color:var(--muted)">... and ${rawRows.length - 3} more rows</td></tr>`;
    }
  });

  function renderInventoryPreview() {
    if (rawRows.length > 0 && typeof rawRows[0] === 'object' && !Array.isArray(rawRows[0])) {
      const sample = rawRows[0];
      const extraKeys = Object.keys(sample.extra || {});
      const headerTitles = ['Item Name', ...extraKeys, 'Qty', 'Price'];
      inventoryHead.innerHTML = "<tr>" + headerTitles.map(h => `<th>${h}</th>`).join('') + "</tr>";
      inventoryBody.innerHTML = "";
      rawRows.slice(0, 3).forEach(row => {
        let cells = `<td>${row.name}</td>`;
        extraKeys.forEach(k => {
          cells += `<td>${(row.extra && row.extra[k]) || '-'}</td>`;
        });
        cells += `<td>${row.qty}</td><td>${row.price}</td>`;
        inventoryBody.innerHTML += `<tr>${cells}</tr>`;
      });
      if (rawRows.length > 3) {
        inventoryBody.innerHTML += `<tr><td colspan="${headerTitles.length}" style="text-align:center; color:var(--muted)">... and ${rawRows.length - 3} more rows</td></tr>`;
      }
      inventoryTable.style.display = "table";
      return;
    }

    inventoryHead.innerHTML = "<tr><th>S/N</th><th>Name</th><th>Qty</th><th>Price</th></tr>";
    if (rawHeaders && rawHeaders.length > 0) {
      inventoryHead.innerHTML = "<tr>" + rawHeaders.slice(0,4).map(h => `<th>${h}</th>`).join("") + "</tr>";
    }

    inventoryBody.innerHTML = "";
    rawRows.slice(0, 3).forEach(row => {
      inventoryBody.innerHTML += "<tr>" + row.slice(0,4).map(c => `<td>${c || '-'}</td>`).join("") + "</tr>";
    });
    
    if (rawRows.length > 3) {
      inventoryBody.innerHTML += `<tr><td colspan="4" style="text-align:center; color:var(--muted)">... and ${rawRows.length - 3} more rows</td></tr>`;
    }
    inventoryTable.style.display = "table";
  }

  // Redundant confirm button fallback
  btnConfirmSale.addEventListener("click", () => {
      step3.classList.remove("active");
      step3.classList.add("completed");
      step3.style.opacity = "0.8";

      step4.style.display = "block";
      step4.classList.add("active");
      step4.style.opacity = "1";
      step4.style.pointerEvents = "auto";
    
    chrome.storage.local.set({ setupComplete: true });
    
    setTimeout(() => {
      window.close();
    }, 3000);
  });
});
