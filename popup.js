(() => {
  const els = {
    syncStatus: document.getElementById("syncStatus"),
    pendingCount: document.getElementById("pendingCount"),
    uploadedCount: document.getElementById("uploadedCount"),
    failedCount: document.getElementById("failedCount"),
    lastSyncLine: document.getElementById("lastSyncLine"),
    statusMessage: document.getElementById("statusMessage"),
    retryNow: document.getElementById("retryNow"),
    openProfile: document.getElementById("openProfile"),
    overrideEnabled: document.getElementById("overrideEnabled"),
    overrideJson: document.getElementById("overrideJson"),
    overrideStatus: document.getElementById("overrideStatus"),
    saveOverride: document.getElementById("saveOverride"),
    loadOverride: document.getElementById("loadOverride"),
    pasteOverride: document.getElementById("pasteOverride"),
    disableOverride: document.getElementById("disableOverride"),
    forceBattleFetch: document.getElementById("forceBattleFetch")
  };

  let refreshTimer = null;
  let busy = false;
  let latestState = null;

  async function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  function formatTs(ts) {
    if (!ts) return "none";
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return String(ts);
    return date.toLocaleString();
  }

  function setBusy(value) {
    busy = Boolean(value);
    els.retryNow.disabled = busy;
    els.forceBattleFetch.disabled = busy;
  }

  function prettyJson(value) {
    return JSON.stringify(value, null, 2);
  }

  function setOverrideStatus(text, isError = false) {
    els.overrideStatus.textContent = text;
    els.overrideStatus.style.color = isError ? "#991b1b" : "#334155";
  }

  function renderSyncBadge(syncState) {
    const badge = els.syncStatus;

    badge.className = "status-pill";

    if (syncState === "uploading") {
      badge.classList.add("status-uploading");
      badge.textContent = "Uploading...";
      return;
    }

    if (syncState === "needs_retry") {
      badge.classList.add("status-error");
      badge.textContent = "Retry Needed";
      return;
    }

    if (syncState === "queued") {
      badge.classList.add("status-queued");
      badge.textContent = "Queued";
      return;
    }

    if (syncState === "synced") {
      badge.classList.add("status-synced");
      badge.textContent = "Synced";
      return;
    }

    badge.classList.add("status-ready");
    badge.textContent = "Waiting";
  }

  function renderStatusMessage(state) {
    const lastUpload = state.lastUpload;

    if (state.syncState === "uploading") {
      els.statusMessage.textContent = "Uploading replay IDs now...";
      return;
    }

    if (state.syncState === "needs_retry") {
      const reason = lastUpload?.error || "Upload failed";
      els.statusMessage.textContent = `Upload failed: ${reason}. Click Retry Upload.`;
      return;
    }

    if (state.syncState === "queued") {
      els.statusMessage.textContent = "Replay IDs are queued for upload.";
      return;
    }

    if (state.syncState === "synced") {
      els.statusMessage.textContent = "Everything is uploaded.";
      return;
    }

    els.statusMessage.textContent = "Open SAP and play or view history.";
  }

  function renderLastSync(state) {
    const lastUpload = state.lastUpload;
    if (!lastUpload) {
      els.lastSyncLine.innerHTML = "<strong>Last Sync:</strong> none yet";
      return;
    }

    const label = lastUpload.ok ? "Success" : "Failed";
    const detail = `attempted ${lastUpload.attempted || 0}, uploaded ${lastUpload.uploaded || 0}`;
    els.lastSyncLine.innerHTML = `<strong>Last Sync:</strong> ${label} at ${formatTs(lastUpload.at)} (${detail})`;
  }

  function renderProfileAvailability(state) {
    const playerId = state?.playerId || null;
    els.openProfile.disabled = !playerId;
  }

  function renderState(state) {
    latestState = state || null;
    const counts = state?.counts || { pending: 0, uploaded: 0, failed: 0 };

    els.pendingCount.textContent = String(counts.pending || 0);
    els.uploadedCount.textContent = String(counts.uploaded || 0);
    els.failedCount.textContent = String(counts.failed || 0);

    renderSyncBadge(state?.syncState || "ready");
    renderProfileAvailability(state || {});
    renderLastSync(state || {});
    renderStatusMessage(state || {});
  }

  async function refreshState() {
    try {
      const response = await sendMessage({ type: "get_state" });
      if (!response || !response.ok) {
        throw new Error(response?.error || "Could not load sync status");
      }
      renderState(response.state);
    } catch (error) {
      renderState({
        syncState: "needs_retry",
        counts: { pending: 0, uploaded: 0, failed: 0 },
        playerId: null,
        lastUpload: {
          ok: false,
          attempted: 0,
          uploaded: 0,
          at: new Date().toISOString(),
          error: error.message
        }
      });
    }
  }

  async function refreshOverrideConfig() {
    const response = await sendMessage({ type: "get_battle_override_config" });
    if (!response || !response.ok) {
      setOverrideStatus(response?.error || "Could not load replay override", true);
      return;
    }

    const config = response.config || { enabled: false, battle: null };
    els.overrideEnabled.checked = Boolean(config.enabled);
    els.overrideJson.value = config.battle ? prettyJson(config.battle) : "";

    if (config.enabled) {
      setOverrideStatus("Replay injection enabled.");
    } else if (config.battle) {
      setOverrideStatus("Replay JSON loaded. Enable injection to use it.");
    } else {
      setOverrideStatus("No replay override saved.");
    }
  }

  async function saveOverrideConfig() {
    const enabled = Boolean(els.overrideEnabled.checked);
    const battleText = els.overrideJson.value || "";

    const response = await sendMessage({
      type: "set_battle_override_config",
      enabled,
      battleText
    });

    if (!response || !response.ok) {
      setOverrideStatus(response?.error || "Could not save replay override", true);
      return;
    }

    const config = response.config || { enabled: false, battle: null };
    els.overrideEnabled.checked = Boolean(config.enabled);
    els.overrideJson.value = config.battle ? prettyJson(config.battle) : "";
    setOverrideStatus(config.enabled ? "Saved. Injection is now active." : "Saved. Injection is disabled.");
  }

  async function disableOverrideConfig() {
    const response = await sendMessage({
      type: "set_battle_override_config",
      enabled: false,
      battleText: ""
    });

    if (!response || !response.ok) {
      setOverrideStatus(response?.error || "Could not disable replay override", true);
      return;
    }

    els.overrideEnabled.checked = false;
    setOverrideStatus("Injection disabled. Saved replay cleared.");
  }

  async function pasteOverrideFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setOverrideStatus("Clipboard is empty.", true);
        return;
      }

      els.overrideJson.value = text;
      setOverrideStatus("Pasted from clipboard. Click Save Override.");
    } catch (error) {
      setOverrideStatus(error?.message || "Clipboard access failed.", true);
    }
  }

  function randomUuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
      const random = Math.floor(Math.random() * 16);
      const value = token === "x" ? random : ((random & 0x3) | 0x8);
      return value.toString(16);
    });
  }

  async function forceBattleFetchNow() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs && tabs[0];

      if (!activeTab || typeof activeTab.id !== "number") {
        throw new Error("No active tab found.");
      }

      const battleId = randomUuid();
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: "force_battle_fetch",
        battleId,
        timeoutMs: 10000
      });

      if (!response || !response.ok) {
        throw new Error(
          response?.error ||
          "Could not force battle request in this tab. Open SAP game tab first."
        );
      }

      const statusText = Number.isFinite(response.status)
        ? `status ${response.status}`
        : "no status";
      const responseIdText = response.responseId ? `, response Id ${response.responseId}` : "";

      setOverrideStatus(
        `Forced battle request (${statusText}) for ${response.battleId || battleId}${responseIdText}.`
      );
    } catch (error) {
      setOverrideStatus(error?.message || "Force battle request failed.", true);
    }
  }

  async function retryUploadNow() {
    if (busy) {
      return;
    }

    setBusy(true);
    try {
      const response = await sendMessage({ type: "upload_now" });
      if (!response || !response.ok) {
        throw new Error(response?.error || "Retry failed");
      }
      if (response.state) {
        renderState(response.state);
      } else {
        await refreshState();
      }
    } catch (error) {
      renderState({
        syncState: "needs_retry",
        counts: { pending: 0, uploaded: 0, failed: 0 },
        playerId: null,
        lastUpload: {
          ok: false,
          attempted: 0,
          uploaded: 0,
          at: new Date().toISOString(),
          error: error.message
        }
      });
    } finally {
      setBusy(false);
    }
  }

  function buildProfileUrl(baseUrl, playerId) {
    const url = new URL("/profile", baseUrl);
    url.search = new URLSearchParams({
      scope: "game",
      playerId,
      uiView: "card"
    }).toString();
    return url.toString();
  }

  async function openMyProfile() {
    const playerId = latestState?.playerId || null;
    const target = latestState?.target || null;

    if (!playerId || !target) {
      return;
    }

    const url = buildProfileUrl(target, playerId);
    await chrome.tabs.create({ url });
  }

  function bindEvents() {
    els.retryNow.addEventListener("click", () => {
      void retryUploadNow();
    });

    els.openProfile.addEventListener("click", () => {
      void openMyProfile();
    });

    els.saveOverride.addEventListener("click", () => {
      void saveOverrideConfig();
    });

    els.loadOverride.addEventListener("click", () => {
      void refreshOverrideConfig();
    });

    els.pasteOverride.addEventListener("click", () => {
      void pasteOverrideFromClipboard();
    });

    els.disableOverride.addEventListener("click", () => {
      void disableOverrideConfig();
    });

    els.forceBattleFetch.addEventListener("click", () => {
      void forceBattleFetchNow();
    });
  }

  async function init() {
    bindEvents();
    await Promise.all([refreshState(), refreshOverrideConfig()]);

    refreshTimer = window.setInterval(() => {
      void refreshState();
    }, 4000);
  }

  window.addEventListener("unload", () => {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  });

  void init();
})();
