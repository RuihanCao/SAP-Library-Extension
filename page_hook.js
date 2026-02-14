(() => {
  const MARKER = "__sap_library_uploader__";
  const API_HOST = /https:\/\/api\.teamwood\.games\//i;
  const WATCH_PATH = /\/0\.\d+\/api\/(arena\/watch|versus\/watch)$/i;
  const HISTORY_PATH = /\/0\.\d+\/api\/history\/fetch$/i;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function post(payload) {
    window.postMessage({ [MARKER]: true, ...payload }, "*");
  }

  function normalizeUuid(value) {
    if (typeof value !== "string") {
      if (value === null || value === undefined) return null;
      value = String(value);
    }

    const text = value.trim();
    return UUID_REGEX.test(text) ? text.toLowerCase() : null;
  }

  function normalizeParticipationId(value) {
    return normalizeUuid(value);
  }

  function normalizePlayerId(value) {
    return normalizeUuid(value);
  }

  function isFinishedOutcome(outcome) {
    return outcome === 1 || outcome === 2;
  }

  function extractWatchPlayerId(data) {
    const candidates = [
      data?.UserMatch?.UserId,
      data?.UserMatch?.CreatorUserId,
      data?.UserMatch?.Build?.User?.Id,
      data?.UserId,
      data?.User?.Id,
      data?.WatchResult?.UserId,
      data?.WatchResult?.User?.Id
    ];

    for (const candidate of candidates) {
      const id = normalizePlayerId(candidate);
      if (id) return id;
    }

    return null;
  }

  function parseWatchResponse(url, data) {
    try {
      const urlObj = new URL(url);
      if (!WATCH_PATH.test(urlObj.pathname)) {
        return null;
      }

      const outcome = data?.WatchResult?.Outcome;
      if (!isFinishedOutcome(outcome)) {
        return null;
      }

      const participationId = normalizeParticipationId(
        data?.UserMatch?.ParticipationId || data?.ParticipationId
      );

      if (!participationId) {
        return null;
      }

      return {
        type: "watch_finished_participation",
        participationId,
        playerId: extractWatchPlayerId(data),
        outcome,
        mode: /\/versus\/watch$/i.test(urlObj.pathname) ? "versus" : "arena"
      };
    } catch {
      return null;
    }
  }

  function isFinishedHistoryItem(item) {
    const battleOutcome = item?.Battle?.Outcome;
    if (isFinishedOutcome(battleOutcome)) {
      return true;
    }

    const victories = Number(item?.Victories);
    if (Number.isFinite(victories) && victories >= 10) {
      return true;
    }

    const lives = Number(item?.Lives);
    if (Number.isFinite(lives) && lives <= 0) {
      return true;
    }

    return false;
  }

  function extractHistoryPlayerId(historyItems) {
    for (const item of historyItems) {
      const candidates = [
        item?.Battle?.User?.Id,
        item?.User?.Id,
        item?.UserId
      ];

      for (const candidate of candidates) {
        const id = normalizePlayerId(candidate);
        if (id) return id;
      }
    }

    return null;
  }

  function parseHistoryResponse(url, data) {
    try {
      const urlObj = new URL(url);
      if (!HISTORY_PATH.test(urlObj.pathname)) {
        return null;
      }

      const historyItems = Array.isArray(data?.History) ? data.History : [];
      const ids = [];
      const seen = new Set();

      for (const item of historyItems) {
        if (!isFinishedHistoryItem(item)) {
          continue;
        }

        const participationId = normalizeParticipationId(item?.ParticipationId);
        if (!participationId || seen.has(participationId)) {
          continue;
        }

        seen.add(participationId);
        ids.push(participationId);
      }

      if (!ids.length) {
        return null;
      }

      return {
        type: "history_finished_participations",
        participationIds: ids,
        playerId: extractHistoryPlayerId(historyItems)
      };
    } catch {
      return null;
    }
  }

  async function handleResponse(url, response) {
    if (!API_HOST.test(url)) {
      return;
    }

    try {
      const text = await response.clone().text();
      if (!text || !/^\s*[\[{]/.test(text)) {
        return;
      }

      const data = JSON.parse(text);
      const historyPayload = parseHistoryResponse(url, data);
      if (historyPayload) {
        post(historyPayload);
        return;
      }

      const watchPayload = parseWatchResponse(url, data);
      if (watchPayload) {
        post(watchPayload);
      }
    } catch {
      // Ignore parse failures for non-JSON or irrelevant payloads.
    }
  }

  const originalFetch = window.fetch;
  window.fetch = function wrappedFetch(input) {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : typeof input === "string" ? input : "";
    const result = originalFetch.apply(this, arguments);
    result.then((response) => handleResponse(url, response)).catch(() => {});
    return result;
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function wrappedOpen(method, url) {
    this.__sapLibraryUploaderUrl = url;
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function wrappedSend() {
    this.addEventListener("loadend", () => {
      try {
        const url = this.__sapLibraryUploaderUrl || "";
        if (!API_HOST.test(url)) {
          return;
        }

        let text = "";
        if (this.responseType === "" || this.responseType === "text") {
          text = this.responseText || "";
        } else if (this.responseType === "arraybuffer" && this.response) {
          const decoder = new TextDecoder("utf-8");
          text = decoder.decode(new Uint8Array(this.response));
        }

        if (!text || !/^\s*[\[{]/.test(text)) {
          return;
        }

        const data = JSON.parse(text);
        const historyPayload = parseHistoryResponse(url, data);
        if (historyPayload) {
          post(historyPayload);
          return;
        }

        const watchPayload = parseWatchResponse(url, data);
        if (watchPayload) {
          post(watchPayload);
        }
      } catch {
        // Ignore parse failures for non-JSON or irrelevant payloads.
      }
    });

    return originalXhrSend.apply(this, arguments);
  };
})();
