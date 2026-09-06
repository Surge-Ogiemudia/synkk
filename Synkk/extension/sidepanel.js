document.addEventListener("DOMContentLoaded", () => {
  // Views
  const setupView = document.getElementById("setupView");
  const sourceView = document.getElementById("sourceView");

  // Shared Header Elements
  const headerAvatar = document.getElementById("headerAvatar");
  const headerLogo = document.getElementById("headerLogo");
  const headerName = document.getElementById("headerName");
  const headerStatusDot = document.getElementById("headerStatusDot");
  const headerStatusText = document.getElementById("headerStatusText");
  const btnSettingsToggle = document.getElementById("btnSettingsToggle");
  const btnLogout = document.getElementById("btnLogout");
  const inputTerminalName = document.getElementById("inputTerminalName");
  const authTerminalName = document.getElementById("authTerminalName");

  // Settings Menu Elements
  const settingsDropdown = document.getElementById("settingsDropdown");
  const menuForceSync = document.getElementById("menuForceSync");
  const menuRelinkPOS = document.getElementById("menuRelinkPOS");
  const menuSignOut = document.getElementById("menuSignOut");

  // Confirmation Modal Elements
  const confirmModal = document.getElementById("confirmModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalDesc = document.getElementById("modalDesc");
  const btnModalCancel = document.getElementById("btnModalCancel");
  const btnModalConfirm = document.getElementById("btnModalConfirm");
  let onModalConfirmAction = null;

  // Setup Wizard Steps
  const stepAuth = document.getElementById("stepAuth");
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const step3 = document.getElementById("step3");
  const step4 = document.getElementById("step4");

  // Auth Elements
  const btnLogin = document.getElementById("btnLogin");
  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const eyeIcon = document.getElementById("eyeIcon");
  const authAlert = document.getElementById("authAlert");

  // Step 1: Link POS
  const btnConfirmURL = document.getElementById("btnConfirmURL");
  const urlDetectionFeed = document.getElementById("urlDetectionFeed");
  const accountDetectionFeed = document.getElementById("accountDetectionFeed");
  const accountAlert = document.getElementById("accountAlert");
  const btnConfirmAccount = document.getElementById("btnConfirmAccount");
  const s1ConfirmBtns = document.getElementById("s1-confirm-btns");
  const s1ConfirmAccountBtns = document.getElementById("s1-confirm-account-btns");
  let pendingCreds = null;
  let activePMSMetadata = null;
  let urlLocked = false;

  // Step 2: Inventory
  const btnTrainPage = document.getElementById("btnTrainPage");
  const btnScanInventory = document.getElementById("btnScanInventory");
  const btnStopScanning = document.getElementById("btnStopScanning");
  const btnConfirmInventory = document.getElementById("btnConfirmInventory");
  const trainingAlert = document.getElementById("trainingAlert");
  const s1Btns = document.getElementById("s1-btns");
  const s2ConfirmBtns = document.getElementById("s2-confirm-btns");
  const inventoryHead = document.getElementById("inventoryHead");
  const inventoryTable = document.getElementById("inventoryTable");
  const inventoryBody = document.getElementById("inventoryBody");
  const btnMapColumns = document.getElementById("btnMapColumns");
  const mappingUI = document.getElementById("mappingUI");
  const btnApplyMapping = document.getElementById("btnApplyMapping");
  const mapSelects = document.querySelectorAll(".map-select");
  const btnAddCustomCol = document.getElementById("btnAddCustomCol");
  const customColumnsContainer = document.getElementById("customColumnsContainer");
  let rawHeaders = [];
  let rawRows = [];
  let savedPaginationData = null;

  // Step 3: Mock Sale
  const listeningAlert = document.getElementById("listeningAlert");
  const networkFeed = document.getElementById("networkFeed");
  const btnConfirmSale = document.getElementById("btnConfirmSale");
  const btnOpenSourceTab = document.getElementById("btnOpenSourceTab");

  // =============================================
  // B2B SOURCE TAB (COCKPIT) ELEMENTS
  // =============================================
  const sourceItemCount = document.getElementById("sourceItemCount");
  const sourceLastSync = document.getElementById("sourceLastSync");
  const btnSourceSyncNow = document.getElementById("btnSourceSyncNow");
  const formSourceSearch = document.getElementById("formSourceSearch");
  const inputSourceQuery = document.getElementById("inputSourceQuery");
  const btnFindSource = document.getElementById("btnFindSource");
  const sourceSuggestions = document.getElementById("sourceSuggestions");
  const sourceResultsList = document.getElementById("sourceResultsList");
  const sourceEmptyState = document.getElementById("sourceEmptyState");
  const sourceLoadingState = document.getElementById("sourceLoadingState");
  const sourceCards = document.getElementById("sourceCards");

  // Slide-Over Checkout Drawer Elements
  const drawerBackdrop = document.getElementById("drawerBackdrop");
  const checkoutDrawer = document.getElementById("checkoutDrawer");
  const btnDrawerClose = document.getElementById("btnDrawerClose");
  const drawerItemName = document.getElementById("drawerItemName");
  const drawerSellerName = document.getElementById("drawerSellerName");
  const drawerUnitPrice = document.getElementById("drawerUnitPrice");
  const drawerAvailQty = document.getElementById("drawerAvailQty");
  const drawerOrderQty = document.getElementById("drawerOrderQty");
  const drawerSubtotal = document.getElementById("drawerSubtotal");
  const btnQtyMinus = document.getElementById("btnQtyMinus");
  const btnQtyPlus = document.getElementById("btnQtyPlus");
  const btnSubmitOrder = document.getElementById("btnSubmitOrder");
  const btnPopoutCheckout = document.getElementById("btnPopoutCheckout");
  const drawerSuccessToast = document.getElementById("drawerSuccessToast");

  let activeCheckoutItem = null;
  let activeOrderQty = 1;
  let searchDebounceTimer = null;
  let currentSession = null;

  // =============================================
  // HELPER ESCAPERS
  // =============================================
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function escapeAttr(str) {
    if (!str) return "";
    return String(str).replace(/"/g, '&quot;');
  }

  // =============================================
  // PASSWORD TOGGLE
  // =============================================
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

  // =============================================
  // TERMINAL NAME PERSISTENCE
  // =============================================
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

  // =============================================
  // VIEW ROUTING
  // =============================================
  function showView(view) {
    if (view === "source" && currentSession && currentSession.pharmacy) {
      if (setupView) setupView.style.display = "none";
      if (sourceView) sourceView.style.display = "flex";
      if (btnSettingsToggle) btnSettingsToggle.style.display = "flex";
      if (headerLogo) headerLogo.style.display = "none";
      if (headerAvatar) {
        headerAvatar.style.display = "flex";
        const pName = currentSession.pharmacy.name || "My Pharmacy";
        headerAvatar.innerText = pName.substring(0, 2).toUpperCase();
      }
      if (headerName) headerName.innerText = currentSession.pharmacy.name || "PharmastackX";
      if (headerStatusDot) headerStatusDot.style.display = "inline-block";
      if (headerStatusText) headerStatusText.innerText = "Active · Synced just now";
      if (btnLogout) btnLogout.style.display = "none";

      updateSyncHealth();
    } else {
      if (sourceView) sourceView.style.display = "none";
      if (setupView) setupView.style.display = "flex";
      if (btnSettingsToggle) btnSettingsToggle.style.display = "none";
      if (headerAvatar) headerAvatar.style.display = "none";
      if (headerLogo) headerLogo.style.display = "block";
      if (headerStatusDot) headerStatusDot.style.display = "none";
      if (headerName) headerName.innerText = "PharmastackX";
      if (currentSession && currentSession.pharmacy) {
        if (headerStatusText) headerStatusText.innerText = currentSession.pharmacy.name;
        if (btnLogout) btnLogout.style.display = "inline-block";
      } else {
        if (headerStatusText) headerStatusText.innerText = "Not Logged In";
        if (btnLogout) btnLogout.style.display = "none";
      }
    }
  }

  function updateSyncHealth() {
    chrome.storage.local.get(["unsyncedInventory", "inventoryItems"], (data) => {
      if (sourceItemCount) {
        const count =
          (data.inventoryItems && data.inventoryItems.length) ||
          (data.unsyncedInventory && data.unsyncedInventory.rows && data.unsyncedInventory.rows.length) ||
          0;
        sourceItemCount.innerText = count > 0 ? `${count.toLocaleString()} items synced` : "Catalog synced";
      }
    });
  }

  function checkAuth() {
    chrome.storage.local.get(["currentUser", "currentPharmacy", "setupComplete"], (data) => {
      if (data.currentUser && data.currentPharmacy) {
        currentSession = { user: data.currentUser, pharmacy: data.currentPharmacy };
        
        if (data.setupComplete) {
          showView("source");
        } else {
          showView("setup");
          
          if (stepAuth) stepAuth.style.display = "none";
          if (step1) {
            step1.style.display = "block";
            step1.classList.add("active");
            step1.style.opacity = "1";
            step1.style.pointerEvents = "auto";
          }
          if (step2) {
            step2.style.display = "block";
            step2.style.opacity = "0.5";
            step2.style.pointerEvents = "none";
          }
          if (step3) {
            step3.style.display = "block";
            step3.style.opacity = "0.5";
          }
          if (step4) {
            step4.style.display = "block";
            step4.style.opacity = "0.5";
          }
        }
      } else {
        currentSession = null;
        showView("setup");
        
        if (stepAuth) {
          stepAuth.style.display = "block";
          stepAuth.classList.add("active");
        }
        if (step1) step1.style.display = "none";
        if (step2) step2.style.display = "none";
        if (step3) step3.style.display = "none";
        if (step4) step4.style.display = "none";
      }
    });
  }

  // =============================================
  // SETTINGS DROPDOWN & CONFIRMATION MODAL
  // =============================================
  if (btnSettingsToggle) {
    btnSettingsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (settingsDropdown) settingsDropdown.classList.toggle("open");
    });
  }

  document.addEventListener("click", (e) => {
    if (settingsDropdown && !settingsDropdown.contains(e.target) && e.target !== btnSettingsToggle) {
      settingsDropdown.classList.remove("open");
    }
    if (sourceSuggestions && !sourceSuggestions.contains(e.target) && e.target !== inputSourceQuery) {
      sourceSuggestions.classList.remove("active");
    }
  });

  function showConfirmModal(title, desc, confirmText, isWarning, onConfirm) {
    if (settingsDropdown) settingsDropdown.classList.remove("open");
    if (modalTitle) modalTitle.innerText = title;
    if (modalDesc) modalDesc.innerText = desc;
    if (btnModalConfirm) {
      btnModalConfirm.innerText = confirmText;
      btnModalConfirm.className = isWarning ? "btn-modal btn-modal-confirm warning" : "btn-modal btn-modal-confirm";
    }
    onModalConfirmAction = onConfirm;
    if (confirmModal) confirmModal.classList.add("open");
  }

  if (btnModalCancel) {
    btnModalCancel.addEventListener("click", () => {
      if (confirmModal) confirmModal.classList.remove("open");
      onModalConfirmAction = null;
    });
  }

  if (btnModalConfirm) {
    btnModalConfirm.addEventListener("click", () => {
      if (confirmModal) confirmModal.classList.remove("open");
      if (typeof onModalConfirmAction === "function") {
        onModalConfirmAction();
      }
      onModalConfirmAction = null;
    });
  }

  function triggerForceSync() {
    if (sourceLastSync) sourceLastSync.innerText = "Syncing now...";
    chrome.runtime.sendMessage({ action: "TRIGGER_SYNC" });
    setTimeout(() => {
      if (sourceLastSync) sourceLastSync.innerText = "Synced just now";
      updateSyncHealth();
    }, 1800);
  }

  if (menuForceSync) {
    menuForceSync.addEventListener("click", () => {
      if (settingsDropdown) settingsDropdown.classList.remove("open");
      triggerForceSync();
    });
  }

  if (btnSourceSyncNow) {
    btnSourceSyncNow.addEventListener("click", triggerForceSync);
  }

  if (menuRelinkPOS) {
    menuRelinkPOS.addEventListener("click", () => {
      showConfirmModal(
        "Re-link POS Portal",
        "This will return you to the POS detection and column mapping wizard to connect a new portal. Live sync will pause until re-linked. Proceed?",
        "Proceed to Re-link",
        true,
        () => {
          chrome.storage.local.set({ setupComplete: false }, () => {
            checkAuth();
          });
        }
      );
    });
  }

  if (menuSignOut) {
    menuSignOut.addEventListener("click", () => {
      showConfirmModal(
        "Sign Out",
        "Signing out will disconnect this terminal and stop live inventory & sales syncing from this browser. Proceed?",
        "Sign Out",
        false,
        () => {
          chrome.storage.local.remove(["currentUser", "currentPharmacy", "setupComplete", "token"], () => {
            currentSession = null;
            checkAuth();
          });
        }
      );
    });
  }

  // =============================================
  // B2B SOURCING SEARCH & AUTOCOMPLETE
  // =============================================
  if (inputSourceQuery) {
    inputSourceQuery.addEventListener("input", () => {
      const q = inputSourceQuery.value.trim();
      clearTimeout(searchDebounceTimer);
      if (q.length < 2) {
        if (sourceSuggestions) {
          sourceSuggestions.innerHTML = "";
          sourceSuggestions.classList.remove("active");
        }
        return;
      }

      searchDebounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`https://www.psx.ng/api/source/autocomplete?query=${encodeURIComponent(q)}`);
          const data = await res.json().catch(() => ({}));
          if (data.success && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
            sourceSuggestions.innerHTML = data.suggestions.slice(0, 6).map((item) => `
              <div class="suggestion-item" data-val="${escapeAttr(item)}">
                <span>${escapeHtml(item)}</span>
                <span class="suggestion-sub">Search</span>
              </div>
            `).join("");
            sourceSuggestions.classList.add("active");

            sourceSuggestions.querySelectorAll(".suggestion-item").forEach((el) => {
              el.addEventListener("click", () => {
                const val = el.getAttribute("data-val");
                inputSourceQuery.value = val;
                sourceSuggestions.classList.remove("active");
                executeSearch(val);
              });
            });
          } else {
            sourceSuggestions.innerHTML = "";
            sourceSuggestions.classList.remove("active");
          }
        } catch (e) {
          console.warn("Autocomplete error:", e);
        }
      }, 250);
    });
  }

  if (formSourceSearch) {
    formSourceSearch.addEventListener("submit", (e) => {
      e.preventDefault();
      executeSearch(inputSourceQuery.value);
    });
  }

  if (btnFindSource) {
    btnFindSource.addEventListener("click", (e) => {
      e.preventDefault();
      executeSearch(inputSourceQuery.value);
    });
  }

  async function executeSearch(rawQuery) {
    const q = (rawQuery || "").trim();
    if (q.length < 2) return;

    if (sourceSuggestions) sourceSuggestions.classList.remove("active");
    if (sourceEmptyState) sourceEmptyState.style.display = "none";
    if (sourceLoadingState) sourceLoadingState.style.display = "block";
    if (sourceCards) sourceCards.innerHTML = "";

    const mySlug = (currentSession && currentSession.pharmacy && currentSession.pharmacy.slug) || "";

    try {
      const res = await fetch(`https://www.psx.ng/api/source?query=${encodeURIComponent(q)}&exclude=${encodeURIComponent(mySlug)}`);
      const data = await res.json().catch(() => ({}));

      if (sourceLoadingState) sourceLoadingState.style.display = "none";

      if (data.success && Array.isArray(data.results) && data.results.length > 0) {
        data.results.forEach((item) => {
          const card = document.createElement("div");
          card.className = "result-card";

          const pName = (item.pharmacy && item.pharmacy.name) || "Partner Pharmacy";
          const distance = item.distanceValue
            ? `${item.distanceValue} km away`
            : (item.pharmacy && item.pharmacy.address) || "Verified Partner";
          const priceStr = item.price ? `₦${Number(item.price).toLocaleString()}` : "Price on Request";
          const qty = item.qty || 0;
          const isLow = qty <= 5;

          card.innerHTML = `
            <div class="card-row-top">
              <div>
                <div class="card-item-title">${escapeHtml(item.itemName)}</div>
                <div class="card-seller-info">
                  <span>${escapeHtml(pName)}</span>
                  <span class="verified-badge">✓ Partner</span>
                  <span style="font-size:10px;">· ${escapeHtml(distance)}</span>
                </div>
              </div>
              <div class="card-price">${priceStr}</div>
            </div>
            <div class="card-stock-row">
              <span class="stock-badge ${isLow ? "low" : ""}">${qty} packs available</span>
              <button class="btn-source-action">
                <span>Source Item</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
          `;

          card.querySelector(".btn-source-action").addEventListener("click", () => {
            openCheckoutDrawer(item);
          });

          sourceCards.appendChild(card);
        });
      } else {
        sourceCards.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📦</div>
            <div class="empty-title">No partner stock found for "${escapeHtml(q)}"</div>
            <div class="empty-desc">None of the verified nearby pharmacies currently have this specific drug listed in stock.</div>
          </div>
        `;
      }

      // Record search to backend
      const pharmacyId = (currentSession && currentSession.pharmacy && currentSession.pharmacy.id) || "DEFAULT";
      fetch("https://www.psx.ng/api/extension/record-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pharmacyId: pharmacyId,
          query: q,
          resultCount: data.results ? data.results.length : 0,
          terminalId: (inputTerminalName && inputTerminalName.value) || "Counter 1"
        })
      }).catch(() => {});

    } catch (err) {
      if (sourceLoadingState) sourceLoadingState.style.display = "none";
      sourceCards.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Search Error</div>
          <div class="empty-desc">Could not connect to the sourcing network. Please check your internet connection.</div>
        </div>
      `;
    }
  }

  // =============================================
  // SLIDE-OVER CHECKOUT DRAWER
  // =============================================
  function openCheckoutDrawer(item) {
    activeCheckoutItem = item;
    activeOrderQty = 1;
    if (drawerItemName) drawerItemName.innerText = item.itemName || "Item";
    if (drawerSellerName) drawerSellerName.innerText = (item.pharmacy && item.pharmacy.name) || "Verified Partner Pharmacy";
    if (drawerUnitPrice) drawerUnitPrice.innerText = `₦${Number(item.price || 0).toLocaleString()}`;
    if (drawerAvailQty) drawerAvailQty.innerText = `${item.qty || 0} packs available`;
    if (drawerSuccessToast) drawerSuccessToast.style.display = "none";
    if (btnSubmitOrder) {
      btnSubmitOrder.disabled = false;
      btnSubmitOrder.innerText = "Confirm Sourcing Request";
    }
    updateDrawerSubtotal();

    if (drawerBackdrop) drawerBackdrop.classList.add("open");
    if (checkoutDrawer) checkoutDrawer.classList.add("open");
  }

  function closeCheckoutDrawer() {
    if (drawerBackdrop) drawerBackdrop.classList.remove("open");
    if (checkoutDrawer) checkoutDrawer.classList.remove("open");
  }

  function updateDrawerSubtotal() {
    if (drawerOrderQty) drawerOrderQty.innerText = String(activeOrderQty);
    const unitPrice = (activeCheckoutItem && activeCheckoutItem.price) || 0;
    const subtotal = unitPrice * activeOrderQty;
    if (drawerSubtotal) drawerSubtotal.innerText = `₦${Number(subtotal).toLocaleString()}`;
  }

  if (btnQtyMinus) {
    btnQtyMinus.addEventListener("click", () => {
      if (activeOrderQty > 1) {
        activeOrderQty--;
        updateDrawerSubtotal();
      }
    });
  }

  if (btnQtyPlus) {
    btnQtyPlus.addEventListener("click", () => {
      const maxQty = (activeCheckoutItem && activeCheckoutItem.qty) || 999;
      if (activeOrderQty < maxQty) {
        activeOrderQty++;
        updateDrawerSubtotal();
      }
    });
  }

  if (btnDrawerClose) btnDrawerClose.addEventListener("click", closeCheckoutDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener("click", closeCheckoutDrawer);

  if (btnPopoutCheckout) {
    btnPopoutCheckout.addEventListener("click", () => {
      if (!activeCheckoutItem) return;
      const seller =
        (activeCheckoutItem.pharmacy && (activeCheckoutItem.pharmacy.slug || activeCheckoutItem.pharmacy.name)) || "";
      const buyer = (currentSession && currentSession.pharmacy && currentSession.pharmacy.slug) || "";
      const url = `https://www.psx.ng/?view=confirmOrder&action=checkout&item=${encodeURIComponent(
        activeCheckoutItem.itemName
      )}&price=${activeCheckoutItem.price || 0}&seller=${encodeURIComponent(seller)}&buyer=${encodeURIComponent(buyer)}`;
      chrome.tabs.create({ url });
      closeCheckoutDrawer();
    });
  }

  if (btnSubmitOrder) {
    btnSubmitOrder.addEventListener("click", () => {
      if (!activeCheckoutItem) return;
      btnSubmitOrder.disabled = true;
      btnSubmitOrder.innerText = "Submitting...";

      if (drawerSuccessToast) drawerSuccessToast.style.display = "block";
      setTimeout(() => {
        closeCheckoutDrawer();
        btnSubmitOrder.disabled = false;
        btnSubmitOrder.innerText = "Confirm Sourcing Request";
      }, 2000);
    });
  }

  // =============================================
  // AUTHENTICATION HANDLERS
  // =============================================
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
      const res = await fetch("https://www.psx.ng/api/extension/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const termVal = authTerminalName && authTerminalName.value.trim() ? authTerminalName.value.trim() : "Counter 1";
        const pharmacy = data.pharmacy || {
          id: data.pharmacyId || (data.user && data.user.id) || "DEFAULT",
          name: data.pharmacyName || (data.user && data.user.name) || "My Pharmacy",
          slug: data.pharmacySlug || (data.user && data.user.slug) || ""
        };
        chrome.storage.local.set(
          {
            currentUser: data.user,
            currentPharmacy: pharmacy,
            terminalId: termVal
          },
          () => {
            checkAuth();
          }
        );
      } else {
        authAlert.style.display = "block";
        authAlert.className = "alert alert-info";
        authAlert.style.color = "var(--red)";
        authAlert.innerText = "❌ " + (data.error || data.message || "Invalid credentials");
      }
    } catch (e) {
      console.error("Login exception:", e);
      authAlert.style.display = "block";
      authAlert.className = "alert alert-info";
      authAlert.style.color = "var(--red)";
      authAlert.innerText = "❌ " + (e.message || "Network error connecting to PharmastackX Server");
    } finally {
      btnLogin.innerText = "Log In to PharmastackX";
      btnLogin.disabled = false;
    }
  });

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      chrome.storage.local.remove(["currentUser", "currentPharmacy", "setupComplete"], () => {
        checkAuth();
      });
    });
  }

  // =============================================
  // PMS DETECTION & WIZARD STEPS
  // =============================================
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
      if (s1ConfirmBtns) s1ConfirmBtns.style.display = "flex";
    }
  }

  if (btnConfirmAccount) {
    btnConfirmAccount.addEventListener("click", () => {
      if (!pendingCreds) return;
      if (s1ConfirmAccountBtns) s1ConfirmAccountBtns.style.display = "none";
      accountAlert.innerHTML = `<strong style="color:#3fb950; display:block; margin-bottom:4px;">✅ Link Securely Established</strong>
          Account ${pendingCreds.username} successfully linked.`;

      step1.classList.remove("active");
      step1.classList.add("completed");
      step1.style.opacity = "0.8";

      step2.classList.add("active");
      step2.style.opacity = "1";
      step2.style.pointerEvents = "auto";

      const pharmacyId = currentSession ? currentSession.pharmacy.id : "DEFAULT";
      fetch("https://www.psx.ng/api/extension/save-pms-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pharmacyId: pharmacyId,
          pmsUrl: pendingCreds.pmsUrl,
          username: pendingCreds.username,
          password: pendingCreds.password
        })
      }).catch((e) => console.warn("Failed to sync creds", e));
    });
  }

  if (btnConfirmURL) {
    btnConfirmURL.addEventListener("click", () => {
      urlLocked = true;
      if (s1ConfirmBtns) s1ConfirmBtns.style.display = "none";

      const currentUrl = (activePMSMetadata.url || "").toLowerCase();
      const isLoginPage = currentUrl.includes("login") || currentUrl.includes("signin") || currentUrl.includes("auth");

      const instructionText = isLoginPage
        ? "Please log in to your POS right now so we can securely link your account."
        : "Please log out and log back in to your POS right now so we can securely link your account.";

      urlDetectionFeed.innerHTML += `<div class="alert alert-info" style="display:block; margin-top:8px;">
          <strong style="color:var(--accent2); display:block; margin-bottom:4px;">🔑 Next Step:</strong>
          ${instructionText}
        </div>`;

      step1.style.opacity = "0.8";
      step2.classList.add("active");
      step2.style.opacity = "1";
      step2.style.pointerEvents = "auto";

      const pharmacyId = currentSession ? currentSession.pharmacy.id : "DEFAULT";
      fetch("https://www.psx.ng/api/extension/save-pms-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pharmacyId: pharmacyId,
          pmsUrl: activePMSMetadata.url,
          username: "",
          password: ""
        })
      }).catch(() => {});
    });
  }

  // Step 1: Train Pagination
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

  // Step 1: Scan Inventory
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
      if (!confirm("Are you sure you want to stop scanning? The data collected so far will be saved.")) {
        return;
      }
      btnStopScanning.innerText = "Stopping...";

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "STOP_SCANNING" });
      });

      setTimeout(() => {
        if (btnStopScanning.style.display !== "none") {
          btnScanInventory.innerText = "Scan Current Page";
          btnScanInventory.style.display = "inline-flex";
          btnStopScanning.style.display = "none";
          s1Btns.style.display = "block";
        }
      }, 2000);
    });
  }

  // Runtime Message Handlers
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "PMS_LOGIN_CAPTURED") {
      pendingCreds = msg.data;
      if (accountDetectionFeed && accountAlert) {
        accountDetectionFeed.style.display = "flex";
        accountAlert.innerHTML = `<strong style="color:#3fb950; display:block; margin-bottom:4px;">✅ Account Detected</strong>
          Username / Email: <span style="font-weight:bold;">${escapeHtml(msg.data.username)}</span>`;
        if (s1ConfirmAccountBtns) s1ConfirmAccountBtns.style.display = "flex";
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
      if (listeningAlert) listeningAlert.style.display = "none";
      const feed = document.getElementById("networkFeed");

      const card = document.createElement("div");
      card.style.background = "var(--surface)";
      card.style.border = "1px solid var(--border)";
      card.style.padding = "10px";
      card.style.borderRadius = "6px";
      card.style.fontSize = "12px";

      const parsed = msg.data.parsed || { items: [], source: "unknown" };
      let endpointName = (msg.data.url || "").split("?")[0].split("/").pop();
      if (!endpointName || endpointName.length < 2) endpointName = "Endpoint";

      let innerHtml = `<p style="font-weight:600; margin-bottom:8px; color:var(--accent); word-break:break-all;">${escapeHtml(
        msg.data.method
      )} /${escapeHtml(endpointName)}</p>`;

      if (parsed.items.length > 0) {
        const badge = parsed.source === "json" ? "🟢 JSON" : "🟡 HTML Receipt";
        innerHtml += `<p style="color:var(--muted); font-size:11px; margin-bottom:6px;">Detected via ${badge}</p>`;
        innerHtml += `<table style="width:100%; border-collapse:collapse; margin-bottom:10px; font-size:11px;">`;
        innerHtml += `<tr style="color:var(--muted);"><th style="text-align:left; padding:4px;">Item</th><th style="text-align:right; padding:4px;">Qty</th><th style="text-align:right; padding:4px;">Price</th></tr>`;
        parsed.items.forEach((item) => {
          innerHtml += `<tr style="border-top:1px solid var(--border);"><td style="padding:4px;">${escapeHtml(
            item.name
          )}</td><td style="text-align:right; padding:4px;">${item.qty}</td><td style="text-align:right; padding:4px;">${item.price}</td></tr>`;
        });
        innerHtml += `</table>`;
        innerHtml += `<button class="btn btn-primary btn-select-sale" style="width:100%; padding:6px;">✅ This is my receipt!</button>`;
      } else {
        const rawJson = JSON.stringify({ request: msg.data.reqBody, response: msg.data.payload }, null, 2);
        innerHtml += `<pre style="background:#000; color:#00ff00; padding:8px; border-radius:4px; max-height:80px; overflow:auto; margin-bottom:8px; font-family:monospace; font-size:10px;">${escapeHtml(
          rawJson.substring(0, 600)
        )}${rawJson.length > 600 ? "..." : ""}</pre>`;
        innerHtml += `<p style="color:var(--muted); font-size:11px; margin-bottom:8px;">Could not auto-detect items. Is this your sale?</p>`;
        innerHtml += `<button class="btn btn-secondary btn-select-sale" style="width:100%; padding:6px;">This is the final receipt!</button>`;
      }

      card.innerHTML = innerHtml;

      card.querySelector(".btn-select-sale").addEventListener("click", () => {
        step3.classList.remove("active");
        step3.classList.add("completed");
        step4.classList.add("active");

        chrome.storage.local.set({ setupComplete: true });
        chrome.storage.local.get({ unsyncedSales: [] }, (data) => {
          const newSale = {
            pharmacyId: currentSession ? currentSession.pharmacy.id : "DEFAULT",
            items: parsed.items,
            source: parsed.source,
            timestamp: Date.now()
          };
          chrome.storage.local.set({ unsyncedSales: [...data.unsyncedSales, newSale] }, () => {
            chrome.runtime.sendMessage({ action: "TRIGGER_SYNC" });
          });
        });

        setTimeout(() => {
          showView("source");
        }, 1200);
      });

      feed.prepend(card);
    }
  });

  // Step 2 -> Step 3
  if (btnConfirmInventory) {
    btnConfirmInventory.addEventListener("click", () => {
      step2.classList.remove("active");
      step2.classList.add("completed");
      step2.style.opacity = "0.8";

      step3.style.display = "block";
      step3.classList.add("active");
      step3.style.opacity = "1";
      step3.style.pointerEvents = "auto";

      const pharmacyId = currentSession ? currentSession.pharmacy.id : "DEFAULT";
      chrome.storage.local.set(
        {
          unsyncedInventory: { pharmacyId: pharmacyId, rows: rawRows },
          inventoryItems: rawRows,
          pmsMetadata: activePMSMetadata,
          pmsInventoryConfig: {
            inventoryUrl: activePMSMetadata && activePMSMetadata.url ? activePMSMetadata.url : window.location.href,
            paginationData: savedPaginationData,
            rawHeaders: rawHeaders
          }
        },
        () => {
          chrome.runtime.sendMessage({ action: "TRIGGER_SYNC" });

          if (activePMSMetadata) {
            fetch("https://www.psx.ng/api/extension/save-pms-credentials", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pharmacyId: pharmacyId,
                pmsUrl: activePMSMetadata.url,
                pmsInventoryConfig: {
                  inventoryUrl: activePMSMetadata.url,
                  paginationData: savedPaginationData,
                  rawHeaders: rawHeaders
                }
              })
            }).catch(() => {});
          }
        }
      );
    });
  }

  // Column Mapping
  if (btnMapColumns) {
    btnMapColumns.addEventListener("click", () => {
      if (rawHeaders.length === 0) return;
      mapSelects.forEach((sel) => {
        sel.innerHTML = '<option value="">-- Select Column --</option>';
        rawHeaders.forEach((h, idx) => {
          const opt = document.createElement("option");
          opt.value = idx;
          opt.text = h;
          sel.appendChild(opt);
        });
      });

      rawHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (lower.includes("name") || lower.includes("item") || lower.includes("description") || lower.includes("product")) {
          document.getElementById("mapName").value = idx;
        } else if (lower.includes("qty") || lower.includes("quantity") || lower.includes("stock") || lower.includes("balance")) {
          document.getElementById("mapQty").value = idx;
        } else if (lower.includes("price") || lower.includes("cost") || lower.includes("amount") || lower.includes("rate")) {
          document.getElementById("mapPrice").value = idx;
        } else if (lower.includes("id") || lower.includes("sku") || lower.includes("code") || lower.includes("barcode")) {
          document.getElementById("mapId").value = idx;
        }
      });

      mappingUI.style.display = "block";
    });
  }

  if (btnAddCustomCol) {
    btnAddCustomCol.addEventListener("click", () => {
      const row = document.createElement("div");
      row.className = "custom-col-row";
      row.style.cssText = "display: flex; gap: 6px; align-items: center;";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Label e.g. Brand";
      nameInput.className = "custom-col-label";
      nameInput.style.cssText =
        "flex: 1; padding: 4px 6px; font-size: 11px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--text); outline: none;";

      const colSelect = document.createElement("select");
      colSelect.className = "map-select custom-col-select";
      colSelect.style.cssText =
        "flex: 1; padding: 4px 6px; font-size: 11px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--text);";
      colSelect.innerHTML = '<option value="">-- Column --</option>';
      rawHeaders.forEach((h, idx) => {
        const opt = document.createElement("option");
        opt.value = idx;
        opt.text = h;
        colSelect.appendChild(opt);
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.innerHTML = "×";
      removeBtn.style.cssText =
        "background: none; border: none; color: var(--red); font-size: 14px; font-weight: bold; cursor: pointer; padding: 0 4px;";
      removeBtn.addEventListener("click", () => row.remove());

      row.appendChild(nameInput);
      row.appendChild(colSelect);
      row.appendChild(removeBtn);
      customColumnsContainer.appendChild(row);
    });
  }

  if (btnApplyMapping) {
    btnApplyMapping.addEventListener("click", () => {
      const mapName = document.getElementById("mapName").value;
      const mapQty = document.getElementById("mapQty").value;
      const mapPrice = document.getElementById("mapPrice").value;
      const mapId = document.getElementById("mapId").value;

      if (!mapName || !mapQty || !mapPrice) {
        alert("Please map at least Product Name, Quantity, and Price.");
        return;
      }

      const customCols = [];
      document.querySelectorAll(".custom-col-row").forEach((row) => {
        const label = row.querySelector(".custom-col-label").value.trim();
        const colIdx = row.querySelector(".custom-col-select").value;
        if (label && colIdx !== "") {
          customCols.push({ label, colIdx: parseInt(colIdx, 10) });
        }
      });

      rawRows = rawRows
        .map((row) => {
          let name = "";
          let qty = 0;
          let price = 0;
          let id = "";
          let extra = {};

          if (Array.isArray(row)) {
            name = String(row[mapName] || "").trim();
            const rawQ = String(row[mapQty] || "0").replace(/[^0-9.]/g, "");
            qty = parseFloat(rawQ) || 0;
            const rawP = String(row[mapPrice] || "0").replace(/[^0-9.]/g, "");
            price = parseFloat(rawP) || 0;
            if (mapId) id = String(row[mapId] || "").trim();
            customCols.forEach((c) => {
              extra[c.label] = String(row[c.colIdx] || "").trim();
            });
          } else if (typeof row === "object" && row !== null) {
            name = row.name || "";
            qty = row.qty || 0;
            price = row.price || 0;
            id = row.id || "";
            extra = row.extra || {};
          }

          return { id, name, qty, price, extra };
        })
        .filter((row) => !(row.name === "Item" && row.qty === 0 && row.price === 0));

      const headerTitles = ["Item Name", ...customCols.map((c) => c.label), "Qty", "Price"];
      inventoryHead.innerHTML = "<tr>" + headerTitles.map((h) => `<th>${h}</th>`).join("") + "</tr>";
      inventoryBody.innerHTML = "";

      rawRows.slice(0, 3).forEach((row) => {
        let cells = `<td>${escapeHtml(row.name)}</td>`;
        customCols.forEach((c) => {
          cells += `<td>${escapeHtml((row.extra && row.extra[c.label]) || "-")}</td>`;
        });
        cells += `<td>${row.qty}</td><td>${row.price}</td>`;
        inventoryBody.innerHTML += `<tr>${cells}</tr>`;
      });

      if (rawRows.length > 3) {
        inventoryBody.innerHTML += `<tr><td colspan="${headerTitles.length}" style="text-align:center; color:var(--muted)">... and ${rawRows.length - 3} more rows</td></tr>`;
      }
    });
  }

  function renderInventoryPreview() {
    if (rawRows.length > 0 && typeof rawRows[0] === "object" && !Array.isArray(rawRows[0])) {
      const sample = rawRows[0];
      const extraKeys = Object.keys(sample.extra || {});
      const headerTitles = ["Item Name", ...extraKeys, "Qty", "Price"];
      inventoryHead.innerHTML = "<tr>" + headerTitles.map((h) => `<th>${h}</th>`).join("") + "</tr>";
      inventoryBody.innerHTML = "";
      rawRows.slice(0, 3).forEach((row) => {
        let cells = `<td>${escapeHtml(row.name)}</td>`;
        extraKeys.forEach((k) => {
          cells += `<td>${escapeHtml((row.extra && row.extra[k]) || "-")}</td>`;
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
      inventoryHead.innerHTML = "<tr>" + rawHeaders.slice(0, 4).map((h) => `<th>${escapeHtml(h)}</th>`).join("") + "</tr>";
    }

    inventoryBody.innerHTML = "";
    rawRows.slice(0, 3).forEach((row) => {
      inventoryBody.innerHTML += "<tr>" + row.slice(0, 4).map((c) => `<td>${escapeHtml(c || "-")}</td>`).join("") + "</tr>";
    });

    if (rawRows.length > 3) {
      inventoryBody.innerHTML += `<tr><td colspan="4" style="text-align:center; color:var(--muted)">... and ${rawRows.length - 3} more rows</td></tr>`;
    }
    inventoryTable.style.display = "table";
  }

  // Step 3 Confirmation Fallback
  if (btnConfirmSale) {
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
        showView("source");
      }, 1500);
    });
  }

  if (btnOpenSourceTab) {
    btnOpenSourceTab.addEventListener("click", () => {
      chrome.storage.local.set({ setupComplete: true }, () => {
        showView("source");
      });
    });
  }

  // =============================================
  // INIT
  // =============================================
  checkAuth();
  queryPMSMetadata();
  setInterval(queryPMSMetadata, 2000);
});
