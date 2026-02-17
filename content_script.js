(() => {
  const MARKER = "__sap_library_uploader__";
  const EMPTY_OVERRIDE_CONFIG = {
    enabled: false,
    battle: null
  };

  let latestOverrideConfig = EMPTY_OVERRIDE_CONFIG;

  function injectPageHook() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page_hook.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  function postToPage(payload) {
    window.postMessage({ [MARKER]: true, ...payload }, "*");
  }

  function sendMessageToWorker(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          resolve({ ok: false, error: error.message });
          return;
        }

        resolve(response || { ok: false, error: "No response from extension worker" });
      });
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

  async function refreshOverrideConfig() {
    const response = await sendMessageToWorker({ type: "get_battle_override_config" });
    if (response?.ok) {
      latestOverrideConfig = normalizeOverrideConfig(response.config);
    } else {
      latestOverrideConfig = EMPTY_OVERRIDE_CONFIG;
    }
    pushOverrideConfig();
  }

  function sendToWorker(payload) {
    chrome.runtime.sendMessage(payload, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        // Worker can be sleeping during navigation. Ignore transient errors.
      }
    });
  }

  injectPageHook();
  void refreshOverrideConfig();

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "battle_override_updated") {
      return;
    }

    latestOverrideConfig = normalizeOverrideConfig(message.config);
    pushOverrideConfig();
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
