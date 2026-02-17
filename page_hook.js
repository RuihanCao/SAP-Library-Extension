(() => {
  const MARKER = "__sap_library_uploader__";
  const API_HOST = /https:\/\/api\.teamwood\.games\//i;
  const API_VERSION_PATH = /https:\/\/api\.teamwood\.games\/(0\.\d+)\//i;
  const WATCH_PATH = /\/0\.\d+\/api\/(arena\/watch|versus\/watch)$/i;
  const HISTORY_PATH = /\/0\.\d+\/api\/history\/fetch$/i;
  const BATTLE_GET_PATH = /\/0\.\d+\/api\/battle\/get\/([0-9a-f-]{36})$/i;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8"
  };
  const FALLBACK_API_VERSION = "0.45";

  const battleOverride = {
    enabled: false,
    battle: null
  };
  let latestApiVersion = FALLBACK_API_VERSION;

  function post(payload) {
    window.postMessage({ [MARKER]: true, ...payload }, "*");
  }

  function normalizeUrl(value) {
    try {
      return new URL(String(value || ""), window.location.href).toString();
    } catch {
      return "";
    }
  }

  function trackApiVersion(url) {
    if (typeof url !== "string" || !url) {
      return;
    }

    const match = url.match(API_VERSION_PATH);
    if (match && typeof match[1] === "string") {
      latestApiVersion = match[1];
    }
  }

  function extractBattleId(url) {
    try {
      const urlObj = new URL(url);
      const match = urlObj.pathname.match(BATTLE_GET_PATH);
      if (!match) {
        return null;
      }

      return normalizeUuid(match[1]);
    } catch {
      return null;
    }
  }

  function cloneJson(value) {
    if (value === null || value === undefined) {
      return null;
    }

    try {
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }
    } catch {
      // Ignore and fall back to JSON clone.
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function createUuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
      const random = Math.floor(Math.random() * 16);
      const value = token === "x" ? random : ((random & 0x3) | 0x8);
      return value.toString(16);
    });
  }

  function buildBattleOverrideText(url) {
    if (!battleOverride.enabled || !battleOverride.battle || typeof battleOverride.battle !== "object") {
      return null;
    }

    const battleId = extractBattleId(url);
    if (!battleId) {
      return null;
    }

    const payload = cloneJson(battleOverride.battle);
    if (!payload || typeof payload !== "object") {
      return null;
    }

    // One-shot behavior: consume the override on first matching battle/get call.
    battleOverride.enabled = false;
    post({
      type: "battle_override_used",
      battleId
    });

    payload.Id = battleId;

    try {
      return JSON.stringify(payload);
    } catch {
      return null;
    }
  }

  function applyBattleOverrideConfig(message) {
    battleOverride.enabled = Boolean(message.enabled);
    battleOverride.battle = cloneJson(message.battle);
  }

  async function forceBattleFetch(rawBattleId, nonce) {
    const battleId = normalizeUuid(rawBattleId) || createUuid();
    const url = `https://api.teamwood.games/${latestApiVersion}/api/battle/get/${battleId}`;

    try {
      const response = await fetch(url, { cache: "no-store" });
      const responseText = await response.clone().text();
      let parsed = null;

      try {
        parsed = responseText ? JSON.parse(responseText) : null;
      } catch {
        parsed = null;
      }

      post({
        type: "forced_battle_fetch_result",
        nonce: typeof nonce === "string" ? nonce : null,
        ok: response.ok,
        status: response.status,
        battleId,
        responseId: parsed && typeof parsed === "object" ? parsed.Id || null : null
      });
    } catch (error) {
      post({
        type: "forced_battle_fetch_result",
        nonce: typeof nonce === "string" ? nonce : null,
        ok: false,
        status: null,
        battleId,
        error: error && error.message ? error.message : "force_battle_fetch_failed"
      });
    }
  }

  function dispatchXhrEvent(xhr, type) {
    try {
      xhr.dispatchEvent(new Event(type));
    } catch {
      // Ignore event dispatch failures.
    }
  }

  function defineReadOnlyValue(target, key, value) {
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        writable: false,
        value
      });
    } catch {
      // Some browser internals may reject overriding properties.
    }
  }

  function encodeArrayBuffer(text) {
    const encoder = new TextEncoder();
    return encoder.encode(text).buffer;
  }

  function fakeXhrSuccess(xhr, url, bodyText) {
    const headers = "content-type: application/json; charset=utf-8\r\n";
    const responseType = xhr.responseType || "";

    let parsedBody = null;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      parsedBody = null;
    }

    defineReadOnlyValue(xhr, "readyState", 4);
    defineReadOnlyValue(xhr, "status", 200);
    defineReadOnlyValue(xhr, "statusText", "OK");
    defineReadOnlyValue(xhr, "responseURL", url);

    if (responseType === "" || responseType === "text") {
      defineReadOnlyValue(xhr, "responseText", bodyText);
      defineReadOnlyValue(xhr, "response", bodyText);
    } else if (responseType === "json") {
      defineReadOnlyValue(xhr, "responseText", bodyText);
      defineReadOnlyValue(xhr, "response", parsedBody);
    } else if (responseType === "arraybuffer") {
      defineReadOnlyValue(xhr, "response", encodeArrayBuffer(bodyText));
    } else {
      defineReadOnlyValue(xhr, "responseText", bodyText);
      defineReadOnlyValue(xhr, "response", bodyText);
    }

    xhr.getAllResponseHeaders = () => headers;
    xhr.getResponseHeader = (name) => {
      if (typeof name !== "string") {
        return null;
      }

      return name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null;
    };

    setTimeout(() => {
      dispatchXhrEvent(xhr, "readystatechange");
      dispatchXhrEvent(xhr, "load");
      dispatchXhrEvent(xhr, "loadend");
    }, 0);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const message = event.data;
    if (!message || !message[MARKER]) {
      return;
    }

    if (message.type === "set_battle_override") {
      applyBattleOverrideConfig(message);
      return;
    }

    if (message.type === "force_battle_fetch") {
      void forceBattleFetch(message.battleId || null, message.nonce || null);
    }
  });

  post({ type: "battle_override_request" });

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
    trackApiVersion(url);

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
    const url = normalizeUrl(request ? request.url : typeof input === "string" ? input : "");
    trackApiVersion(url);
    const battleText = buildBattleOverrideText(url);
    if (battleText !== null) {
      return Promise.resolve(new Response(battleText, { status: 200, headers: JSON_HEADERS }));
    }

    const result = originalFetch.apply(this, arguments);
    result.then((response) => handleResponse(url, response)).catch(() => {});
    return result;
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function wrappedOpen(method, url) {
    this.__sapLibraryUploaderUrl = normalizeUrl(url);
    trackApiVersion(this.__sapLibraryUploaderUrl);
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function wrappedSend() {
    const url = this.__sapLibraryUploaderUrl || "";
    const battleText = buildBattleOverrideText(url);
    if (battleText !== null) {
      fakeXhrSuccess(this, url, battleText);
      return;
    }

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
