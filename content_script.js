(() => {
  const MARKER = "__sap_library_uploader__";

  function injectPageHook() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page_hook.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
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

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const message = event.data;
    if (!message || !message[MARKER]) {
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
