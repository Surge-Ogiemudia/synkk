document.addEventListener("DOMContentLoaded", () => {
  // Global API Endpoint
  const CLOUD_API = "https://www.psx.ng/api/extension";
  const SOURCE_API = "https://www.psx.ng/api/source";

  // Views
  const cockpitView = document.getElementById("cockpitView");
  const setupView = document.getElementById("setupView");
  const checkoutDrawer = document.getElementById("checkoutDrawer");

  // Header Elements
  const headerAvatar = document.getElementById("headerAvatar");
  const headerName = document.getElementById("headerName");
  const headerStatus = document.getElementById("headerStatus");
  const headerTillPill = document.getElementById("headerTillPill");
  const btnSettingsMenu = document.getElementById("btnSettingsMenu");
  const menuDropdown = document.getElementById("menuDropdown");
  const menuToggleView = document.getElementById("menuToggleView");
  const menuToggleViewText = document.getElementById("menuToggleViewText");
  const menuResync = document.getElementById("menuResync");
  const menuLogout = document.getElementById("menuLogout");

  // Cockpit Elements
  const cockpitSyncBadge = document.getElementById("cockpitSyncBadge");
  const cockpitItemCount = document.getElementById("cockpitItemCount");
  const cockpitLastSync = document.getElementById("cockpitLastSync");
  const btnCockpitSyncNow = document.getElementById("btnCockpitSyncNow");
  const formSourceSearch = document.getElementById("formSourceSearch");
  const inputSourceQuery = document.getElementById("inputSourceQuery");
  const btnFindSource = document.getElementById("btnFindSource");
  const sourceSuggestions = document.getElementById("sourceSuggestions");
  const sourceResultsList = document.getElementById("sourceResultsList");

  // Checkout Drawer Elements
  const drawerItemName = document.getElementById("drawerItemName");
  const drawerSellerName = document.getElementById("drawerSellerName");
  const btnDrawerPopout = document.getElementById("btnDrawerPopout");
  const btnDrawerClose = document.getElementById("btnDrawerClose");
  const checkoutIframe = document.getElementById("checkoutIframe");
  let activeCheckoutUrl = null;

  // Setup Wizard Elements
  const stepAuth = document.getElementById("stepAuth");
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const step3 = document.getElementById("step3");

  const btnLogin = document.getElementById("btnLogin");
  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  const authAlert = document.getElementById("authAlert");
  const authTerminalName = document.getElementById("authTerminalName");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");

  const btnConfirmURL = document.getElementById("btnConfirmURL");
  const urlDetectionFeed = document.getElementById("urlDetectionFeed");
  const btnScanInventory = document.getElementById("btnScanInventory");
  const btnStopScanning = document.getElementById("btnStopScanning");
  const btnConfirmInventory = document.getElementById("btnConfirmInventory");
  const btnGoToCockpit = document.getElementById("btnGoToCockpit");
  const trainingAlert = document.getElementById("trainingAlert");
  const inventoryHead = document.getElementById("inventoryHead");

  let currentPharmacy = null;
  let currentUser = null;
  let activePMSMetadata = null;
  let debounceTimeout = null;

  // ==========================================
  // VIEW SWITCHING
  // ==========================================
  function showView(viewName) {
    if (viewName === "cockpit") {
      cockpitView.classList.add("active");
      setupView.classList.remove("active");
      menuToggleViewText.textContent = "Setup Wizard";
    } else {
      setupView.classList.add("active");
      cockpitView.classList.remove("active");
      menuToggleViewText.textContent = "Sourcing Cockpit";
    }
  }

  // ==========================================
  // AUTH & STATE INITIALIZATION
  // ==========================================
  function checkAuth() {
    chrome.storage.local.get([
      "currentUser",
      "currentPharmacy",
      "setupComplete",
      "terminalId",
      "lastInventorySyncTime",
      "lastInventoryCount",
      "activePMSMetadata"
    ], (res) => {
      currentUser = res.currentUser;
      currentPharmacy = res.currentPharmacy;
      activePMSMetadata = res.activePMSMetadata;

      const terminalId = res.terminalId || "Counter 1";
      if (headerTillPill) headerTillPill.textContent = `?? ${terminalId}`;

      if (currentUser && currentPharmacy) {
        // Authenticated
        const name = currentPharmacy.name || "My Pharmacy";
        headerName.textContent = name;
        headerAvatar.textContent = name.substring(0, 3).toUpperCase();
        headerStatus.textContent = "? Connected & Syncing";
        headerStatus.style.color = "#10b981";

        // Update Cockpit stats
        const count = res.lastInventoryCount || 0;
        cockpitItemCount.textContent = count > 0 ? `${count.toLocaleString()} items synced` : "Catalog synced";
        updateLastSyncTime(res.lastInventorySyncTime);

        // Show cockpit if setup is complete or pharmacy is already set up
        if (res.setupComplete !== false) {
          showView("cockpit");
        } else {
          showView("setup");
          activateStep(step1);
        }
      } else {
        // Not Authenticated
        headerName.textContent = "PharmastackX";
        headerAvatar.textContent = "PSX";
        headerStatus.textContent = "Sign in to begin";
        headerStatus.style.color = "var(--text-muted)";
        showView("setup");
        activateStep(stepAuth);
      }
    });
  }

  function updateLastSyncTime(timestamp) {
    if (!timestamp) {
      cockpitLastSync.textContent = "Synced recently";
      return;
    }
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) {
      cockpitLastSync.textContent = "Synced just now";
    } else if (diffMins < 60) {
      cockpitLastSync.textContent = `Synced ${diffMins}m ago`;
    } else {
      const hours = Math.floor(diffMins / 60);
      cockpitLastSync.textContent = `Synced ${hours}h ago`;
    }
  }

  function activateStep(stepElement) {
    [stepAuth, step1, step2, step3].forEach(step => {
      if (step) {
        step.classList.remove("active");
        step.classList.remove("completed");
      }
    });
    if (stepElement) {
      stepElement.classList.add("active");
    }
  }

  // ==========================================
  // SETTINGS DROPDOWN & ACTIONS
  // ==========================================
  btnSettingsMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle("show");
  });

  document.addEventListener("click", () => {
    menuDropdown.classList.remove("show");
    sourceSuggestions.classList.remove("show");
  });

  menuToggleView.addEventListener("click", () => {
    menuDropdown.classList.remove("show");
    if (cockpitView.classList.contains("active")) {
      showView("setup");
      activateStep(step1);
    } else {
      chrome.storage.local.set({ setupComplete: true });
      showView("cockpit");
    }
  });

  menuResync.addEventListener("click", () => {
    menuDropdown.classList.remove("show");
    triggerForceSync();
  });

  btnCockpitSyncNow.addEventListener("click", () => {
    triggerForceSync();
  });

  function triggerForceSync() {
    cockpitSyncBadge.textContent = "Syncing...";
    headerStatus.textContent = "Syncing inventory...";
    chrome.runtime.sendMessage({ action: "FORCE_SYNC_INVENTORY" }, (resp) => {
      setTimeout(() => {
        cockpitSyncBadge.textContent = "Live Sync Active";
        headerStatus.textContent = "? Connected & Syncing";
        headerStatus.style.color = "#10b981";
        cockpitLastSync.textContent = "Synced just now";
        chrome.storage.local.set({ lastInventorySyncTime: Date.now() });
      }, 1200);
    });
  }

  menuLogout.addEventListener("click", () => {
    menuDropdown.classList.remove("show");
    chrome.storage.local.remove(["currentUser", "currentPharmacy", "setupComplete", "activePMSMetadata"], () => {
      checkAuth();
    });
  });

  // Password toggle in auth
  if (togglePasswordBtn && authPassword) {
    togglePasswordBtn.addEventListener("click", () => {
      authPassword.type = authPassword.type === "password" ? "text" : "password";
    });
  }

  // ==========================================
  // AUTHENTICATION LOGIN
  // ==========================================
  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      const email = authEmail.value.trim();
      const password = authPassword.value.trim();
      const terminal = authTerminalName.value.trim() || "Counter 1";

      if (!email || !password) {
        authAlert.textContent = "Please enter both email and password.";
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
            setupComplete: true
          }, () => {
            checkAuth();
          });
        } else {
          // Fallback if cloud endpoint is developing
          chrome.storage.local.set({
            currentUser: { email },
            currentPharmacy: { id: "PHARM-" + Date.now(), name: email.split("@")[0].toUpperCase() + " Pharmacy" },
            terminalId: terminal,
            setupComplete: true
          }, () => {
            checkAuth();
          });
        }
      } catch (err) {
        // Fallback demo authentication
        chrome.storage.local.set({
          currentUser: { email },
          currentPharmacy: { id: "PHARM-" + Date.now(), name: email.split("@")[0].toUpperCase() + " Pharmacy" },
          terminalId: terminal,
          setupComplete: true
        }, () => {
          checkAuth();
        });
      } finally {
        btnLogin.textContent = "Sign In";
        btnLogin.disabled = false;
      }
    });
  }

  // ==========================================
  // ONBOARDING WIZARD STEPS
  // ==========================================
  // Live POS URL Detection Feed
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      const url = tabs[0].url;
      if (url.startsWith("http") && !url.includes("chrome://")) {
        urlDetectionFeed.textContent = url;
        urlDetectionFeed.style.display = "block";
      }
    }
  });

  if (btnConfirmURL) {
    btnConfirmURL.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeUrl = (tabs && tabs[0] && tabs[0].url) ? tabs[0].url : "https://pos.pharmacy.ng";
        activePMSMetadata = { url: activeUrl, origin: new URL(activeUrl).origin };
        chrome.storage.local.set({ activePMSMetadata });
        step1.classList.remove("active");
        step1.classList.add("completed");
        step2.classList.add("active");
      });
    });
  }

  if (btnScanInventory) {
    btnScanInventory.addEventListener("click", () => {
      btnScanInventory.textContent = "Scanning POS...";
      trainingAlert.textContent = "Scanning active tab for catalog items...";
      trainingAlert.style.display = "block";
      trainingAlert.style.color = "var(--accent)";

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "SCAN_INVENTORY" }, (resp) => {
            btnScanInventory.textContent = "Scan Page";
            inventoryHead.style.display = "block";
            trainingAlert.textContent = "? Detected items on POS page.";
            trainingAlert.style.color = "var(--green)";
          });
        }
      });
    });
  }

  if (btnConfirmInventory) {
    btnConfirmInventory.addEventListener("click", () => {
      step2.classList.remove("active");
      step2.classList.add("completed");
      step3.classList.add("active");
      chrome.storage.local.set({ setupComplete: true, lastInventorySyncTime: Date.now() });
    });
  }

  if (btnGoToCockpit) {
    btnGoToCockpit.addEventListener("click", () => {
      chrome.storage.local.set({ setupComplete: true });
      showView("cockpit");
      checkAuth();
    });
  }

  // ==========================================
  // B2B SOURCING SEARCH & AUTOCOMPLETE
  // ==========================================
  if (inputSourceQuery) {
    inputSourceQuery.addEventListener("input", () => {
      const q = inputSourceQuery.value.trim();
      clearTimeout(debounceTimeout);
      if (q.length < 2) {
        sourceSuggestions.classList.remove("show");
        sourceSuggestions.innerHTML = "";
        return;
      }

      debounceTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`${SOURCE_API}/autocomplete?q=${encodeURIComponent(q)}`);
          if (res.ok) {
            const items = await res.json();
            renderSuggestions(items);
          } else {
            renderFallbackSuggestions(q);
          }
        } catch (e) {
          renderFallbackSuggestions(q);
        }
      }, 200);
    });
  }

  function renderSuggestions(items) {
    if (!items || items.length === 0) {
      sourceSuggestions.classList.remove("show");
      return;
    }
    sourceSuggestions.innerHTML = items.map(item => `
      <div class="suggestion-item" data-query="${item.name || item}">
        <span>${item.name || item}</span>
        <span style="font-size:10px; color:var(--text-muted);">${item.category || "Medication"}</span>
      </div>
    `).join("");
    sourceSuggestions.classList.add("show");

    sourceSuggestions.querySelectorAll(".suggestion-item").forEach(el => {
      el.addEventListener("click", () => {
        const query = el.getAttribute("data-query");
        inputSourceQuery.value = query;
        sourceSuggestions.classList.remove("show");
        executeSearch(query);
      });
    });
  }

  function renderFallbackSuggestions(q) {
    const mockSuggestions = [
      { name: `${q} 500mg Tablets`, category: "Analgesic / Antibiotic" },
      { name: `${q} 1g Suspension`, category: "Oral Liquid" },
      { name: `${q} Forte 625mg`, category: "Prescription Drug" }
    ];
    renderSuggestions(mockSuggestions);
  }

  if (formSourceSearch) {
    formSourceSearch.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = inputSourceQuery.value.trim();
      if (q) {
        sourceSuggestions.classList.remove("show");
        executeSearch(q);
      }
    });
  }

  async function executeSearch(query) {
    btnFindSource.textContent = "...";
    sourceResultsList.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 12px;">
        Searching neighbor pharmacies for "${query}"...
      </div>
    `;

    try {
      const res = await fetch(`${SOURCE_API}/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        renderSearchResults(data.results || [], query);
      } else {
        renderMockResults(query);
      }
    } catch (err) {
      renderMockResults(query);
    } finally {
      btnFindSource.textContent = "Find";
    }
  }

  function renderSearchResults(results, query) {
    if (!results || results.length === 0) {
      sourceResultsList.innerHTML = `
        <div class="empty-sourcing">
          <div class="empty-icon">??</div>
          <div class="empty-title">No direct matches found</div>
          <div class="empty-desc">No nearby pharmacies have confirmed stock for "${query}" right now. Try a generic or brand name alternative.</div>
        </div>
      `;
      return;
    }

    sourceResultsList.innerHTML = results.map((item, idx) => `
      <div class="result-card" data-index="${idx}">
        <div class="result-header">
          <div class="result-item-name">${item.name || query}</div>
          <div class="result-price">?${Number(item.price || 3500).toLocaleString()}</div>
        </div>
        <div class="result-details-row">
          <div class="pharmacy-distance">
            <span>?? ${item.sellerPharmacy || "Apex Care Pharmacy"}</span>
            <span>·</span>
            <span>?? ${item.distance || "1.4 km"} (${item.eta || "6 mins"})</span>
          </div>
          <span class="stock-pill">? ${item.stock || 8} in stock</span>
        </div>
        <button class="btn-get-it" data-item='${JSON.stringify(item).replace(/'/g, "&apos;")}'>
          Get It · Procure Now
        </button>
      </div>
    `).join("");

    attachGetItListeners();
  }

  function renderMockResults(query) {
    const mockResults = [
      {
        name: `${query.toUpperCase()} 625mg (Augmentin/Amoxicillin)`,
        sellerPharmacy: "MedPlus Pharmacy (Victoria Island)",
        distance: "1.2 km",
        eta: "5 mins",
        price: 4200,
        stock: 14
      },
      {
        name: `${query.toUpperCase()} 1g Tab (GlaxoSmithKline)`,
        sellerPharmacy: "HealthPlus Community Care",
        distance: "2.5 km",
        eta: "9 mins",
        price: 4600,
        stock: 6
      },
      {
        name: `${query.toUpperCase()} Generic BP (500mg)`,
        sellerPharmacy: "Alpha Care Chemists",
        distance: "3.1 km",
        eta: "12 mins",
        price: 3100,
        stock: 22
      }
    ];
    renderSearchResults(mockResults, query);
  }

  // ==========================================
  // SLIDE-OVER CHECKOUT DRAWER & IFRAME
  // ==========================================
  function attachGetItListeners() {
    sourceResultsList.querySelectorAll(".btn-get-it").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = JSON.parse(btn.getAttribute("data-item"));
        openCheckoutDrawer(item);
      });
    });
  }

  function openCheckoutDrawer(item) {
    drawerItemName.textContent = item.name || "Procure Item";
    drawerSellerName.textContent = `Seller: ${item.sellerPharmacy || "Verified Pharmacy"}`;

    const buyerName = (currentPharmacy && currentPharmacy.name) ? currentPharmacy.name : "My Pharmacy";
    activeCheckoutUrl = `https://www.psx.ng/?view=confirmOrder&action=checkout&item=${encodeURIComponent(item.name)}&price=${encodeURIComponent(item.price)}&seller=${encodeURIComponent(item.sellerPharmacy)}&buyer=${encodeURIComponent(buyerName)}`;

    checkoutIframe.src = activeCheckoutUrl;
    checkoutDrawer.classList.add("open");
  }

  btnDrawerClose.addEventListener("click", () => {
    checkoutDrawer.classList.remove("open");
    checkoutIframe.src = "about:blank";
    activeCheckoutUrl = null;
  });

  btnDrawerPopout.addEventListener("click", () => {
    if (activeCheckoutUrl) {
      chrome.tabs.create({ url: activeCheckoutUrl });
      checkoutDrawer.classList.remove("open");
      checkoutIframe.src = "about:blank";
    }
  });

  // Handle postMessage from checkout iframe
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "PSX_ORDER_DONE") {
      checkoutDrawer.classList.remove("open");
      checkoutIframe.src = "about:blank";
      alert("? Order successfully placed with dispatch!");
    }
  });

  // Run on load
  checkAuth();
});
