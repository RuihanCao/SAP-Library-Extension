(() => {
  const els = {
    syncStatus: document.getElementById("syncStatus"),
    pendingCount: document.getElementById("pendingCount"),
    uploadedCount: document.getElementById("uploadedCount"),
    failedCount: document.getElementById("failedCount"),
    lastSyncLine: document.getElementById("lastSyncLine"),
    statusMessage: document.getElementById("statusMessage"),
    sapEmail: document.getElementById("sapEmail"),
    sapPassword: document.getElementById("sapPassword"),
    showPasswordToggle: document.getElementById("showPasswordToggle"),
    syncHistory: document.getElementById("syncHistory"),
    retryNow: document.getElementById("retryNow"),
    openProfile: document.getElementById("openProfile"),
    participationLookupId: document.getElementById("participationLookupId"),
    fetchParticipationReplay: document.getElementById("fetchParticipationReplay"),
    participationLookupStatus: document.getElementById("participationLookupStatus"),
    overrideJson: document.getElementById("overrideJson"),
    overrideStatus: document.getElementById("overrideStatus"),
    saveOverride: document.getElementById("saveOverride")
  };

  let refreshTimer = null;
  let busy = false;
  let latestState = null;
  let hasHydratedSavedCredentials = false;
  let latestOverrideConfig = {
    enabled: false,
    battle: null
  };

  async function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  function formatTs(ts) {
    if (!ts) return "none";
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return String(ts);
    return date.toLocaleString();
  }

  function buildFallbackState() {
    return latestState || {
      syncState: "ready",
      counts: { pending: 0, uploaded: 0, failed: 0 },
      playerId: null,
      savedSapEmail: null,
      savedSapPassword: null,
      hasSavedSapPassword: false,
      historySyncLast: null,
      lastUpload: null
    };
  }

  function renderTransientError(message, extraState) {
    const fallbackState = buildFallbackState();
    renderState({
      ...fallbackState,
      ...(extraState || {}),
      syncState: "needs_retry",
      lastUpload: {
        ok: false,
        attempted: 0,
        uploaded: 0,
        at: new Date().toISOString(),
        error: message
      }
    });
  }

  function setBusy(value) {
    busy = Boolean(value);
    els.retryNow.disabled = busy;
    els.saveOverride.disabled = busy;
    els.fetchParticipationReplay.disabled = busy;
    els.participationLookupId.disabled = busy;
  }

  function prettyJson(value) {
    return JSON.stringify(value, null, 2);
  }

  function setOverrideStatus(text, isError = false) {
    els.overrideStatus.textContent = text;
    els.overrideStatus.style.color = isError ? "#991b1b" : "#334155";
    els.syncHistory.disabled = busy;
    els.sapEmail.disabled = busy;
    els.sapPassword.disabled = busy;
    els.showPasswordToggle.disabled = busy;
  }

  function setParticipationLookupStatus(text, isError = false) {
    els.participationLookupStatus.textContent = text;
    els.participationLookupStatus.style.color = isError ? "#991b1b" : "#334155";
  }

  function setOverrideActionText(config) {
    const enabled = Boolean(config && config.enabled);
    els.saveOverride.textContent = enabled ? "Disable Injection" : "Enable";
  }

  function applyPasswordVisibility() {
    els.sapPassword.type = els.showPasswordToggle.checked ? "text" : "password";
  }

  function hydrateSavedCredentialsOnce(state) {
    if (hasHydratedSavedCredentials) {
      return;
    }

    const savedEmail = typeof state?.savedSapEmail === "string" ? state.savedSapEmail : "";
    const savedPassword = typeof state?.savedSapPassword === "string" ? state.savedSapPassword : "";

    if (savedEmail && !els.sapEmail.value) {
      els.sapEmail.value = savedEmail;
    }
    if (savedPassword && !els.sapPassword.value) {
      els.sapPassword.value = savedPassword;
    }

    hasHydratedSavedCredentials = true;
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
      const reasonLower = String(reason).toLowerCase();
      if (reasonLower.includes("history") || reasonLower.includes("sap login") || reasonLower.includes("email") || reasonLower.includes("password")) {
        els.statusMessage.textContent = reason;
        return;
      }
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

    els.statusMessage.textContent = "Open SAP and play or use Sync History with credentials.";
  }

  function getTsMs(ts) {
    if (!ts) return Number.NEGATIVE_INFINITY;
    const ms = new Date(ts).getTime();
    return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
  }

  function renderLastSync(state) {
    const lastUpload = state.lastUpload;
    const history = state?.historySyncLast || null;

    if (!lastUpload && !history) {
      els.lastSyncLine.innerHTML = "<strong>Last Sync:</strong> none yet";
      return;
    }

    const uploadAt = getTsMs(lastUpload?.at);
    const historyAt = getTsMs(history?.at);

    if (history && historyAt >= uploadAt) {
      if (history.ok) {
        const detail = `fetched ${history.fetched || 0}, finished ${history.finished || 0}, added ${history.added || 0}`;
        els.lastSyncLine.innerHTML = `<strong>Last Sync:</strong> History success at ${formatTs(history.at)} (${detail})`;
      } else {
        els.lastSyncLine.innerHTML = `<strong>Last Sync:</strong> History failed at ${formatTs(history.at)} (${history.error || "unknown error"})`;
      }
      return;
    }

    const label = lastUpload?.ok ? "Success" : "Failed";
    const detail = `attempted ${lastUpload?.attempted || 0}, uploaded ${lastUpload?.uploaded || 0}`;
    els.lastSyncLine.innerHTML = `<strong>Last Sync:</strong> ${label} at ${formatTs(lastUpload?.at)} (${detail})`;
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

    hydrateSavedCredentialsOnce(state);

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
      renderTransientError(error.message);
    }
  }

  async function refreshOverrideConfig() {
    const response = await sendMessage({ type: "get_battle_override_config" });
    if (!response || !response.ok) {
      setOverrideStatus(response?.error || "Could not load replay override", true);
      return;
    }

    const config = response.config || { enabled: false, battle: null };
    latestOverrideConfig = {
      enabled: Boolean(config.enabled),
      battle: config.battle && typeof config.battle === "object" ? config.battle : null
    };

    els.overrideJson.value = latestOverrideConfig.battle ? prettyJson(latestOverrideConfig.battle) : "";
    setOverrideActionText(latestOverrideConfig);

    if (latestOverrideConfig.enabled) {
      setOverrideStatus("Replay injection enabled.");
    } else if (latestOverrideConfig.battle) {
      setOverrideStatus("Replay JSON loaded. Click Enable to activate.");
    } else {
      setOverrideStatus("No replay override saved.");
    }
  }

  async function toggleOverrideConfig() {
    if (latestOverrideConfig.enabled) {
      const response = await sendMessage({
        type: "set_battle_override_config",
        enabled: false,
        battle: latestOverrideConfig.battle || null
      });

      if (!response || !response.ok) {
        setOverrideStatus(response?.error || "Could not disable replay override", true);
        return;
      }

      const config = response.config || { enabled: false, battle: null };
      latestOverrideConfig = {
        enabled: Boolean(config.enabled),
        battle: config.battle && typeof config.battle === "object" ? config.battle : null
      };
      els.overrideJson.value = latestOverrideConfig.battle ? prettyJson(latestOverrideConfig.battle) : "";
      setOverrideActionText(latestOverrideConfig);
      setOverrideStatus("Injection disabled. Saved replay JSON kept.");
      return;
    }

    const response = await sendMessage({
      type: "set_battle_override_config",
      enabled: true,
      battleText: els.overrideJson.value || ""
    });

    if (!response || !response.ok) {
      setOverrideStatus(response?.error || "Could not enable replay override", true);
      return;
    }

    const config = response.config || { enabled: false, battle: null };
    latestOverrideConfig = {
      enabled: Boolean(config.enabled),
      battle: config.battle && typeof config.battle === "object" ? config.battle : null
    };
    els.overrideJson.value = latestOverrideConfig.battle ? prettyJson(latestOverrideConfig.battle) : "";
    setOverrideActionText(latestOverrideConfig);
    setOverrideStatus("Saved and enabled replay injection.");
  }

  async function fetchParticipationReplayNow() {
    if (busy) {
      return;
    }

    const participationId = typeof els.participationLookupId.value === "string"
      ? els.participationLookupId.value.trim()
      : "";
    if (!participationId) {
      setParticipationLookupStatus("Enter a participation ID first.", true);
      return;
    }

    const email = typeof els.sapEmail.value === "string" ? els.sapEmail.value.trim() : "";
    const password = typeof els.sapPassword.value === "string" ? els.sapPassword.value.trim() : "";

    setBusy(true);
    setParticipationLookupStatus("Fetching replay data...");
    try {
      const response = await sendMessage({
        type: "fetch_participation_replay",
        participationId,
        email,
        password
      });

      if (!response || !response.ok || !response.battle) {
        setParticipationLookupStatus(
          response?.error || "Replay lookup failed.",
          true
        );
        return;
      }

      const battle = response.battle;
      els.overrideJson.value = prettyJson(battle);

      const saved = await sendMessage({
        type: "set_battle_override_config",
        enabled: false,
        battle
      });

      if (saved?.ok && saved.config) {
        latestOverrideConfig = {
          enabled: Boolean(saved.config.enabled),
          battle: saved.config.battle && typeof saved.config.battle === "object" ? saved.config.battle : null
        };
      } else {
        latestOverrideConfig = {
          enabled: false,
          battle
        };
      }

      setOverrideActionText(latestOverrideConfig);
      setOverrideStatus("Replay JSON loaded. Click Enable to activate.");

      const source = response.source === "sap_library" ? "SAP Library" : "Teamwood";
      const battleIdText = response.battleId ? ` Battle ${response.battleId}.` : "";
      setParticipationLookupStatus(`Loaded from ${source}.${battleIdText}`);
    } catch (error) {
      setParticipationLookupStatus(error && error.message ? error.message : "Replay lookup failed.", true);
    } finally {
      setBusy(false);
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
      renderTransientError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function syncHistoryNow() {
    if (busy) {
      return;
    }

    const email = typeof els.sapEmail.value === "string" ? els.sapEmail.value.trim() : "";
    const password = typeof els.sapPassword.value === "string" ? els.sapPassword.value.trim() : "";

    setBusy(true);
    try {
      const response = await sendMessage({
        type: "sync_history_with_credentials",
        email,
        password
      });

      if (!response || !response.ok) {
        const message = response?.error || response?.summary?.error || "History sync failed";
        renderTransientError(message, response?.state || null);
        return;
      }

      if (response.state) {
        renderState(response.state);
      } else {
        await refreshState();
      }
    } catch (error) {
      renderTransientError(error.message);
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
    els.syncHistory.addEventListener("click", () => {
      void syncHistoryNow();
    });
    els.showPasswordToggle.addEventListener("change", () => {
      applyPasswordVisibility();
    });
    els.retryNow.addEventListener("click", () => {
      void retryUploadNow();
    });

    els.openProfile.addEventListener("click", () => {
      void openMyProfile();
    });

    els.saveOverride.addEventListener("click", () => {
      void toggleOverrideConfig();
    });

    els.fetchParticipationReplay.addEventListener("click", () => {
      void fetchParticipationReplayNow();
    });
  }

  async function init() {
    bindEvents();
    await Promise.all([refreshState(), refreshOverrideConfig()]);
    applyPasswordVisibility();
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
