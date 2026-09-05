document.addEventListener("DOMContentLoaded", () => {
  const appFrame = document.getElementById("appFrame");
  const loadingOverlay = document.getElementById("loadingOverlay");

  const REMOTE_APP_BASE = "https://www.psx.ng/extension";

  chrome.storage.local.get([
    "currentUser",
    "currentPharmacy",
    "terminalId",
    "lastInventoryCount",
    "lastInventorySyncTime"
  ], (res) => {
    const pharmacy = res.currentPharmacy?.name || "Suya Pharmacy";
    const slug = res.currentPharmacy?.slug || res.currentPharmacy?.id || "suya-pharmacy";
    const terminal = res.terminalId || "Counter 1";
    const count = res.lastInventoryCount || 0;

    const targetUrl = new URL(REMOTE_APP_BASE);
    targetUrl.searchParams.set("pharmacy", pharmacy);
    targetUrl.searchParams.set("slug", slug);
    targetUrl.searchParams.set("terminal", terminal);
    if (count) targetUrl.searchParams.set("count", count.toString());

    appFrame.src = targetUrl.toString();

    appFrame.onload = () => {
      setTimeout(() => {
        if (loadingOverlay) {
          loadingOverlay.style.opacity = "0";
          setTimeout(() => {
            loadingOverlay.style.display = "none";
          }, 300);
        }
      }, 200);
    };
  });

  // Bi-directional message bridge between iframe and extension
  window.addEventListener("message", (event) => {
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

    if (event.data && event.data.type === "EXTENSION_LOGOUT") {
      chrome.storage.local.remove(["currentUser", "currentPharmacy", "setupComplete", "activePMSMetadata"], () => {
        window.location.reload();
      });
    }
  });

  // Listen to background sync updates
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
});
