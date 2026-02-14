(() => {
  const els = {
    syncStatus: document.getElementById("syncStatus"),
    pendingCount: document.getElementById("pendingCount"),
    uploadedCount: document.getElementById("uploadedCount"),
    failedCount: document.getElementById("failedCount"),
    lastSyncLine: document.getElementById("lastSyncLine"),
    statusMessage: document.getElementById("statusMessage"),
    retryNow: document.getElementById("retryNow"),
    openProfile: document.getElementById("openProfile")
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
  }

  async function init() {
    bindEvents();
    await refreshState();

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
