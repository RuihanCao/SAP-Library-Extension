(() => {
  const MARKER = "__sap_library_uploader__";
  const EMPTY_OVERRIDE_CONFIG = {
    enabled: false,
    battle: null
  };
  const OVERRIDE_REFRESH_INTERVAL_MS = 5000;

  let latestOverrideConfig = EMPTY_OVERRIDE_CONFIG;
  const pendingForceFetch = new Map();
  let overrideRefreshTimer = null;
  let extensionContextGone = false;

  function isContextInvalidatedError(errorLike) {
    const text = String(errorLike || "").toLowerCase();
    return text.includes("extension context invalidated")
      || text.includes("context invalidated")
      || text.includes("receiving end does not exist");
  }

  function markExtensionContextGone(errorLike) {
    if (!isContextInvalidatedError(errorLike)) {
      return;
    }
    extensionContextGone = true;
    if (overrideRefreshTimer !== null) {
      window.clearInterval(overrideRefreshTimer);
      overrideRefreshTimer = null;
    }
  }

  function injectPageHook() {
    if (extensionContextGone) {
      return;
    }
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("page_hook.js");
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      markExtensionContextGone(error && error.message ? error.message : error);
    }
  }

  function postToPage(payload) {
    window.postMessage({ [MARKER]: true, ...payload }, "*");
  }

  function sendMessageToWorker(payload) {
    return new Promise((resolve) => {
      if (extensionContextGone) {
        resolve({ ok: false, error: "Extension context invalidated" });
        return;
      }
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            markExtensionContextGone(error.message);
            resolve({ ok: false, error: error.message });
            return;
          }

          resolve(response || { ok: false, error: "No response from extension worker" });
        });
      } catch (error) {
        markExtensionContextGone(error && error.message ? error.message : error);
        resolve({ ok: false, error: error && error.message ? error.message : String(error) });
      }
    });
  }

  function normalizeOverrideConfig(raw) {
    if (!raw || typeof raw !== "object") {
      return EMPTY_OVERRIDE_CONFIG;
    }

    const enabled = Boolean(raw.enabled);
    const battle = raw.battle && typeof raw.battle === "object" ? raw.battle : null;

    if (!enabled || !battle) {
      return EMPTY_OVERRIDE_CONFIG;
    }

    return {
      enabled: true,
      battle
    };
  }

  function pushOverrideConfig() {
    postToPage({
      type: "set_battle_override",
      enabled: latestOverrideConfig.enabled,
      battle: latestOverrideConfig.battle
    });
  }

  function createNonce() {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `${Date.now()}-${randomPart}`;
  }

  function resolvePendingForceFetch(nonce, payload) {
    if (typeof nonce !== "string" || !pendingForceFetch.has(nonce)) {
      return false;
    }

    const pending = pendingForceFetch.get(nonce);
    pendingForceFetch.delete(nonce);
    window.clearTimeout(pending.timeoutId);
    pending.sendResponse(payload);
    return true;
  }

  async function refreshOverrideConfig() {
    if (extensionContextGone) {
      return;
    }
    try {
      const response = await sendMessageToWorker({ type: "get_battle_override_config" });
      if (response?.ok) {
        latestOverrideConfig = normalizeOverrideConfig(response.config);
      } else {
        latestOverrideConfig = EMPTY_OVERRIDE_CONFIG;
        markExtensionContextGone(response?.error);
      }
      pushOverrideConfig();
    } catch (error) {
      latestOverrideConfig = EMPTY_OVERRIDE_CONFIG;
      markExtensionContextGone(error && error.message ? error.message : error);
      pushOverrideConfig();
    }
  }

  function startOverrideRefreshLoop() {
    if (extensionContextGone || overrideRefreshTimer !== null) {
      return;
    }

    overrideRefreshTimer = window.setInterval(() => {
      void refreshOverrideConfig();
    }, OVERRIDE_REFRESH_INTERVAL_MS);
  }

  function sendToWorker(payload) {
    if (extensionContextGone) {
      return;
    }
    try {
      chrome.runtime.sendMessage(payload, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          markExtensionContextGone(error.message);
          // Worker can be sleeping during navigation. Ignore transient errors.
        }
      });
    } catch (error) {
      markExtensionContextGone(error && error.message ? error.message : error);
    }
  }

  injectPageHook();
  void refreshOverrideConfig();
  startOverrideRefreshLoop();

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void refreshOverrideConfig();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (overrideRefreshTimer !== null) {
      window.clearInterval(overrideRefreshTimer);
      overrideRefreshTimer = null;
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "battle_override_updated") {
      latestOverrideConfig = normalizeOverrideConfig(message.config);
      pushOverrideConfig();
      return;
    }

    if (message.type === "force_battle_fetch") {
      const nonce = typeof message.nonce === "string" && message.nonce ? message.nonce : createNonce();
      const timeoutMsRaw = Number(message.timeoutMs);
      const timeoutMs = Number.isFinite(timeoutMsRaw)
        ? Math.min(15000, Math.max(1500, Math.round(timeoutMsRaw)))
        : 9000;

      const timeoutId = window.setTimeout(() => {
        resolvePendingForceFetch(nonce, {
          ok: false,
          error: "Timed out waiting for forced battle request result."
        });
      }, timeoutMs);

      pendingForceFetch.set(nonce, { sendResponse, timeoutId });
      void refreshOverrideConfig().finally(() => {
        postToPage({
          type: "force_battle_fetch",
          battleId: message.battleId || null,
          nonce
        });
      });
      return true;
    }
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const message = event.data;
    if (!message || !message[MARKER]) {
      return;
    }

    if (message.type === "battle_override_request") {
      void refreshOverrideConfig();
      return;
    }

    if (message.type === "forced_battle_fetch_result") {
      const handled = resolvePendingForceFetch(message.nonce, {
        ok: Boolean(message.ok),
        status: Number.isFinite(Number(message.status)) ? Number(message.status) : null,
        battleId: typeof message.battleId === "string" ? message.battleId : null,
        responseId: typeof message.responseId === "string" ? message.responseId : null,
        error: typeof message.error === "string" ? message.error : null
      });

      if (!handled) {
        // Unsolicited result; useful for page-level debugging.
        console.info("[SAP Extension] Forced battle fetch result:", message);
      }
      return;
    }

    if (message.type === "watch_finished_participation" && message.participationId) {
      sendToWorker({
        type: "enqueue_participation_ids",
        ids: [message.participationId],
        playerId: message.playerId || null,
        source: "watch"
      });
      return;
    }

    if (message.type === "history_finished_participations" && Array.isArray(message.participationIds)) {
      sendToWorker({
        type: "enqueue_participation_ids",
        ids: message.participationIds,
        playerId: message.playerId || null,
        source: "history"
      });
    }
  });
})();
