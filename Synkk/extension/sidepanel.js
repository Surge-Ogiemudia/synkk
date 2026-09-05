document.addEventListener("DOMContentLoaded", () => {
  const REMOTE_APP_BASE = "https://www.psx.ng/extension";
  const CLOUD_API = "https://www.psx.ng/api/extension";

  // Elements
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingText = document.getElementById("loadingText");
  const appFrame = document.getElementById("appFrame");
  const setupContainer = document.getElementById("setupContainer");

  const stepAuth = document.getElementById("stepAuth");
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const step3 = document.getElementById("step3");

  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  const authTerminalName = document.getElementById("authTerminalName");
  const btnLogin = document.getElementById("btnLogin");
  const authAlert = document.getElementById("authAlert");

  const urlFeed = document.getElementById("urlFeed");
  const btnConfirmURL = document.getElementById("btnConfirmURL");

  const btnTrainPage = document.getElementById("btnTrainPage");
  const btnScanInventory = document.getElementById("btnScanInventory");
  const btnStopScanning = document.getElementById("btnStopScanning");
  const btnConfirmInventory = document.getElementById("btnConfirmInventory");
  const btnMapColumns = document.getElementById("btnMapColumns");
  const btnApplyMapping = document.getElementById("btnApplyMapping");
  const btnLaunchCockpit = document.getElementById("btnLaunchCockpit");

  const trainingAlert = document.getElementById("trainingAlert");
  const s1Btns = document.getElementById("s1-btns");
  const s1ConfirmBtns = document.getElementById("s1-confirm-btns");

  const inventoryHead = document.getElementById("inventoryHead");
  const inventoryTable = document.getElementById("inventoryTable");
  const inventoryBody = document.getElementById("inventoryBody");
  const mappingUI = document.getElementById("mappingUI");
  const mapSelects = document.querySelectorAll(".map-select");

  let rawHeaders = [];
  let rawRows = [];
  let savedPaginationData = null;

  function hideLoading() {
    if (loadingOverlay) {
      loadingOverlay.style.opacity = "0";
      setTimeout(() => {
        loadingOverlay.style.display = "none";
      }, 250);
    }
  }

  function showLoading(text) {
    if (loadingOverlay) {
      if (text) loadingText.textContent = text;
      loadingOverlay.style.display = "flex";
      loadingOverlay.style.opacity = "1";
    }
  }

  function activateStep(targetStep) {
    [stepAuth, step1, step2, step3].forEach(step => {
      if (step) {
        step.classList.remove("active");
        step.classList.remove("completed");
      }
    });
    if (targetStep) targetStep.classList.add("active");
  }

  // ==========================================
  // STATE ROUTING
  // ==========================================
  function checkState() {
    chrome.storage.local.get([
      "currentUser",
      "currentPharmacy",
      "terminalId",
      "setupComplete",
      "lastInventoryCount",
      "lastInventorySyncTime"
    ], (res) => {
      // 1. Not Authenticated -> Show Login
      if (!res.currentUser || !res.currentPharmacy) {
        appFrame.classList.remove("active");
        setupContainer.classList.add("active");
        activateStep(stepAuth);
        hideLoading();
        return;
      }

      // 2. Authenticated but Needs Setup / Re-linking -> Show Step 1
      if (res.setupComplete === false) {
        appFrame.classList.remove("active");
        setupContainer.classList.add("active");
        activateStep(step1);
        detectActivePOSUrl();
        hideLoading();
        return;
      }

      // 3. Fully Authenticated & Setup -> Load Hosted Cockpit
      setupContainer.classList.remove("active");
      appFrame.classList.add("active");

      const pharmacy = res.currentPharmacy.name || "Suya Pharmacy";
      const slug = res.currentPharmacy.slug || res.currentPharmacy.id || "suya-pharmacy";
      const terminal = res.terminalId || "Counter 1";
      const count = res.lastInventoryCount || 0;

      const targetUrl = new URL(REMOTE_APP_BASE);
      targetUrl.searchParams.set("pharmacy", pharmacy);
      targetUrl.searchParams.set("slug", slug);
      targetUrl.searchParams.set("terminal", terminal);
      if (count) targetUrl.searchParams.set("count", count.toString());

      if (appFrame.src !== targetUrl.toString()) {
        appFrame.src = targetUrl.toString();
        appFrame.onload = () => {
          hideLoading();
        };
      } else {
        hideLoading();
      }
    });
  }

  function detectActivePOSUrl() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        const url = tabs[0].url;
        if (url.startsWith("http") && !url.includes("chrome://")) {
          urlFeed.textContent = url;
          urlFeed.style.display = "block";
        }
      }
    });
  }

  // ==========================================
  // AUTH LOGIN HANDLER
  // ==========================================
  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      const email = authEmail.value.trim();
      const password = authPassword.value.trim();
      const terminal = authTerminalName.value.trim() || "Counter 1";

      if (!email || !password) {
        authAlert.textContent = "Please enter your email and password.";
        authAlert.style.display = "block";
        return;
      }

      btnLogin.textContent = "Signing In...";
      btnLogin.disabled = true;
      authAlert.style.display = "none";

      try {
        const res = await fetch(`${CLOUD_API}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          chrome.storage.local.set({
            currentUser: data.user,
            currentPharmacy: data.pharmacy,
            terminalId: terminal,
            setupComplete: false
          }, () => {
            checkState();
          });
        } else {
          // Fallback auth
          chrome.storage.local.set({
            currentUser: { email },
            currentPharmacy: { id: "PHARM-" + Date.now(), name: email.split("@")[0].toUpperCase() + " Pharmacy" },
            terminalId: terminal,
            setupComplete: false
          }, () => {
            checkState();
          });
        }
      } catch (err) {
        chrome.storage.local.set({
          currentUser: { email },
          currentPharmacy: { id: "PHARM-" + Date.now(), name: email.split("@")[0].toUpperCase() + " Pharmacy" },
          terminalId: terminal,
          setupComplete: false
        }, () => {
          checkState();
        });
      } finally {
        btnLogin.textContent = "Sign In";
        btnLogin.disabled = false;
      }
    });
  }

  // ==========================================
  // STEP 1: LINK POS PORTAL
  // ==========================================
  if (btnConfirmURL) {
    btnConfirmURL.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeUrl = (tabs && tabs[0] && tabs[0].url) ? tabs[0].url : "https://pos.pharmacy.ng";
        const origin = activeUrl.startsWith("http") ? new URL(activeUrl).origin : "https://pos.pharmacy.ng";
        chrome.storage.local.set({ activePMSMetadata: { url: activeUrl, origin } }, () => {
          step1.classList.remove("active");
          step1.classList.add("completed");
          step2.classList.add("active");
        });
      });
    });
  }

  // ==========================================
  // STEP 2: INVENTORY & PAGINATION
  // ==========================================
  if (btnTrainPage) {
    btnTrainPage.addEventListener("click", () => {
      trainingAlert.style.display = "block";
      btnTrainPage.innerText = "Training...";
      btnTrainPage.disabled = true;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "START_TRAINING" });
      });
    });
  }

  if (btnScanInventory) {
    btnScanInventory.addEventListener("click", () => {
      btnScanInventory.innerText = "Scanning...";
      btnScanInventory.style.display = "none";
      btnStopScanning.style.display = "inline-flex";
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "SCAN_INVENTORY", paginationData: savedPaginationData });
      });
    });
  }

  if (btnStopScanning) {
    btnStopScanning.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "STOP_SCANNING" });
      });
      btnStopScanning.style.display = "none";
      btnScanInventory.style.display = "inline-flex";
      btnScanInventory.innerText = "Scan Current Page";
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "TRAINING_SUCCESS") {
      trainingAlert.className = "alert alert-success";
      trainingAlert.innerText = "Pagination Button Learned!";
      trainingAlert.style.display = "block";
      savedPaginationData = msg.data;
      btnTrainPage.innerText = "Learned!";
    }

    if (msg.action === "INVENTORY_SCRAPED") {
      btnScanInventory.innerText = "Scan Current Page";
      btnScanInventory.style.display = "inline-flex";
      btnStopScanning.style.display = "none";
      s1Btns.style.display = "none";
      trainingAlert.style.display = "none";
      
      rawHeaders = msg.data.headers || [];
      rawRows = msg.data.rows || [];

      renderInventoryPreview();
      s1ConfirmBtns.style.display = "flex";
    }
  });

  function renderInventoryPreview() {
    inventoryHead.innerHTML = "<tr><th>ID</th><th>Name</th><th>Qty</th><th>Price</th></tr>";
    inventoryBody.innerHTML = "";
    rawRows.slice(0, 3).forEach(row => {
      inventoryBody.innerHTML += `<tr>
        <td>${row[0] || '-'}</td>
        <td>${row[1] || '-'}</td>
        <td>${row[2] || '0'}</td>
        <td>${row[3] || '0'}</td>
      </tr>`;
    });
    if (rawRows.length > 3) {
      inventoryBody.innerHTML += `<tr><td colspan="4" style="text-align:center; color:var(--text-muted)">... and ${rawRows.length - 3} more rows</td></tr>`;
    }
    inventoryTable.style.display = "table";
  }

  if (btnMapColumns) {
    btnMapColumns.addEventListener("click", () => {
      mappingUI.style.display = "block";
      btnMapColumns.style.display = "none";
      let optionsHTML = '<option value="-1">-- Ignore --</option>';
      rawHeaders.forEach((h, i) => {
        optionsHTML += `<option value="${i}">Col ${i + 1}: ${h || 'Unknown'}</option>`;
      });
      mapSelects.forEach(select => {
        select.innerHTML = optionsHTML;
      });
    });
  }

  if (btnApplyMapping) {
    btnApplyMapping.addEventListener("click", () => {
      mappingUI.style.display = "none";
      btnMapColumns.style.display = "inline-flex";
      
      const mapId = parseInt(document.getElementById("mapId").value);
      const mapName = parseInt(document.getElementById("mapName").value);
      const mapQty = parseInt(document.getElementById("mapQty").value);
      const mapPrice = parseInt(document.getElementById("mapPrice").value);

      rawRows = rawRows.map(row => [
        (mapId >= 0 && row[mapId]) ? row[mapId] : '-',
        (mapName >= 0 && row[mapName]) ? row[mapName] : '-',
        (mapQty >= 0 && row[mapQty]) ? row[mapQty] : 0,
        (mapPrice >= 0 && row[mapPrice]) ? row[mapPrice] : 0
      ]).filter(row => !(row[0] === '-' && row[1] === '-' && row[2] === 0 && row[3] === 0));

      renderInventoryPreview();
    });
  }

  if (btnConfirmInventory) {
    btnConfirmInventory.addEventListener("click", () => {
      step2.classList.remove("active");
      step2.classList.add("completed");
      step3.classList.add("active");

      chrome.storage.local.set({
        unsyncedInventory: rawRows,
        lastInventoryCount: rawRows.length,
        lastInventorySyncTime: Date.now()
      }, () => {
        chrome.runtime.sendMessage({ action: "FORCE_SYNC_INVENTORY" });
      });
    });
  }

  if (btnLaunchCockpit) {
    btnLaunchCockpit.addEventListener("click", () => {
      showLoading("Launching Sourcing Cockpit...");
      chrome.storage.local.set({ setupComplete: true }, () => {
        checkState();
      });
    });
  }

  // ==========================================
  // IFRAME POSTMESSAGE BRIDGE
  // ==========================================
  window.addEventListener("message", (event) => {
    // 1. Force Sync
    if (event.data && event.data.type === "TRIGGER_FORCE_SYNC") {
      chrome.runtime.sendMessage({ action: "FORCE_SYNC_INVENTORY" }, (resp) => {
        chrome.storage.local.get(["lastInventoryCount"], (res) => {
          appFrame.contentWindow?.postMessage({
            type: "SYNC_STATE_UPDATE",
            lastSyncText: "Synced just now",
            syncCount: res.lastInventoryCount || 0
          }, "*");
        });
      });
    }

    // 2. Sign Out
    if (event.data && event.data.type === "EXTENSION_LOGOUT") {
      showLoading("Signing out...");
      chrome.storage.local.remove([
        "currentUser",
        "currentPharmacy",
        "setupComplete",
        "activePMSMetadata"
      ], () => {
        checkState();
      });
    }

    // 3. Re-link POS
    if (event.data && event.data.type === "EXTENSION_RELINK_POS") {
      showLoading("Preparing POS Link Wizard...");
      chrome.storage.local.set({ setupComplete: false }, () => {
        chrome.storage.local.remove(["activePMSMetadata"], () => {
          checkState();
        });
      });
    }
  });

  // Background Sync Listener
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      const updates = { type: "SYNC_STATE_UPDATE" };
      if (changes.lastInventoryCount) updates.syncCount = changes.lastInventoryCount.newValue;
      if (changes.lastInventorySyncTime) updates.lastSyncText = "Synced just now";
      if (changes.currentPharmacy) updates.pharmacyName = changes.currentPharmacy.newValue?.name;
      if (changes.terminalId) updates.terminalId = changes.terminalId.newValue;
      appFrame.contentWindow?.postMessage(updates, "*");
    }
  });

  // Run on start
  checkState();
});
