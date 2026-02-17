const STORAGE_KEYS = {
  pending: "slx_pending_ids",
  uploaded: "slx_uploaded_ids",
  failed: "slx_failed",
  lastUpload: "slx_last_upload",
  retryRequired: "slx_retry_required",
  playerId: "slx_player_id",
  historySyncLast: "slx_history_sync_last",
  sapApiVersion: "slx_sap_api_version",
  savedSapEmail: "slx_saved_sap_email",
  savedSapPassword: "slx_saved_sap_password"
};

const LEGACY_STORAGE_KEYS = {
  autoHistorySyncEmail: "slx_auto_history_sync_email",
  autoHistorySyncPassword: "slx_auto_history_sync_password"
};

const TARGET_BASE_URL = "https://sap-library.vercel.app";
const UPLOAD_BATCH_SIZE = 25;
const MAX_UPLOADED_IDS = 5000;
const DEFAULT_SAP_API_VERSION = "45";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let uploadPromise = null;

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}


function normalizeUuid(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim().toLowerCase();
  return UUID_REGEX.test(text) ? text : null;
}

function normalizeParticipationId(value) {
  return normalizeUuid(value);
}

function normalizePlayerId(value) {
  return normalizeUuid(value);
}

function normalizeApiVersion(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return String(parsed);
}

function uniqueIds(items) {
  const out = [];
  const seen = new Set();

  for (const item of items || []) {
    const id = normalizeParticipationId(item);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    out.push(id);
  }

  return out;
}

function sanitizeParticipationIds(rawIds) {
  if (!Array.isArray(rawIds)) {
    return [];
  }

  const ids = [];
  const seen = new Set();

  for (const item of rawIds) {
    const id = normalizeParticipationId(item);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}

async function updateBadge() {
  const result = await storageGet([
    STORAGE_KEYS.pending,
    STORAGE_KEYS.lastUpload,
    STORAGE_KEYS.retryRequired
  ]);

  const pending = uniqueIds(result[STORAGE_KEYS.pending]);
  const pendingCount = pending.length;

  const lastUpload = result[STORAGE_KEYS.lastUpload] || null;
  const retryRequired = Boolean(result[STORAGE_KEYS.retryRequired]);
  const hasError = retryRequired || (lastUpload && lastUpload.ok === false);

  if (pendingCount === 0 && !hasError) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }

  const badgeText = pendingCount > 0 ? String(Math.min(pendingCount, 999)) : "!";
  const badgeColor = hasError ? "#dc2626" : "#2563eb";

  chrome.action.setBadgeBackgroundColor({ color: badgeColor });
  chrome.action.setBadgeText({ text: badgeText });
}

async function ensureInitialized() {
  const result = await storageGet([
    ...Object.values(STORAGE_KEYS),
    ...Object.values(LEGACY_STORAGE_KEYS)
  ]);
  const updates = {};

  if (!Array.isArray(result[STORAGE_KEYS.pending])) {
    updates[STORAGE_KEYS.pending] = [];
  }

  if (!Array.isArray(result[STORAGE_KEYS.uploaded])) {
    updates[STORAGE_KEYS.uploaded] = [];
  }

  if (!result[STORAGE_KEYS.failed] || typeof result[STORAGE_KEYS.failed] !== "object" || Array.isArray(result[STORAGE_KEYS.failed])) {
    updates[STORAGE_KEYS.failed] = {};
  }

  if (!(STORAGE_KEYS.lastUpload in result)) {
    updates[STORAGE_KEYS.lastUpload] = null;
  }

  if (!(STORAGE_KEYS.retryRequired in result)) {
    updates[STORAGE_KEYS.retryRequired] = false;
  }

  if (!(STORAGE_KEYS.playerId in result)) {
    updates[STORAGE_KEYS.playerId] = null;
  }

  if (!(STORAGE_KEYS.historySyncLast in result)) {
    updates[STORAGE_KEYS.historySyncLast] = null;
  }

  if (result[STORAGE_KEYS.sapApiVersion] !== DEFAULT_SAP_API_VERSION) {
    updates[STORAGE_KEYS.sapApiVersion] = DEFAULT_SAP_API_VERSION;
  }

  const legacyEmail = typeof result[LEGACY_STORAGE_KEYS.autoHistorySyncEmail] === "string"
    ? result[LEGACY_STORAGE_KEYS.autoHistorySyncEmail].trim()
    : "";
  const legacyPassword = typeof result[LEGACY_STORAGE_KEYS.autoHistorySyncPassword] === "string"
    ? result[LEGACY_STORAGE_KEYS.autoHistorySyncPassword]
    : "";

  if (typeof result[STORAGE_KEYS.savedSapEmail] !== "string") {
    updates[STORAGE_KEYS.savedSapEmail] = legacyEmail || "";
  }

  if (typeof result[STORAGE_KEYS.savedSapPassword] !== "string") {
    updates[STORAGE_KEYS.savedSapPassword] = legacyPassword || "";
  }

  if (Object.keys(updates).length > 0) {
    await storageSet(updates);
  }

  await updateBadge();
}

async function markBatchFailure(ids, errorMessage) {
  const now = new Date().toISOString();
  const current = await storageGet([STORAGE_KEYS.failed]);
  const failed = current[STORAGE_KEYS.failed] && typeof current[STORAGE_KEYS.failed] === "object"
    ? { ...current[STORAGE_KEYS.failed] }
    : {};

  for (const id of ids) {
    const prev = failed[id] || {};
    failed[id] = {
      attempts: Number(prev.attempts || 0) + 1,
      lastError: errorMessage,
      updatedAt: now
    };
  }

  await storageSet({ [STORAGE_KEYS.failed]: failed });
}

async function enqueueParticipationIds(rawIds, source, rawPlayerId) {
  await ensureInitialized();

  const incomingIds = sanitizeParticipationIds(rawIds);
  const detectedPlayerId = normalizePlayerId(rawPlayerId);

  const result = await storageGet([
    STORAGE_KEYS.pending,
    STORAGE_KEYS.uploaded,
    STORAGE_KEYS.failed,
    STORAGE_KEYS.retryRequired,
    STORAGE_KEYS.playerId
  ]);

  const pending = uniqueIds(result[STORAGE_KEYS.pending]);
  const uploaded = uniqueIds(result[STORAGE_KEYS.uploaded]);
  const failed = result[STORAGE_KEYS.failed] && typeof result[STORAGE_KEYS.failed] === "object"
    ? { ...result[STORAGE_KEYS.failed] }
    : {};
  const retryRequired = Boolean(result[STORAGE_KEYS.retryRequired]);

  const existingPlayerId = normalizePlayerId(result[STORAGE_KEYS.playerId]);
  const nextPlayerId = detectedPlayerId || existingPlayerId || null;
  const playerIdChanged = nextPlayerId !== existingPlayerId;

  const pendingSet = new Set(pending);
  const uploadedSet = new Set(uploaded);

  let added = 0;
  let skipped = 0;

  for (const id of incomingIds) {
    if (pendingSet.has(id) || uploadedSet.has(id)) {
      skipped += 1;
      continue;
    }

    pending.push(id);
    pendingSet.add(id);
    delete failed[id];
    added += 1;
  }

  if (added > 0 || playerIdChanged) {
    await storageSet({
      [STORAGE_KEYS.pending]: pending,
      [STORAGE_KEYS.failed]: failed,
      [STORAGE_KEYS.playerId]: nextPlayerId
    });

    await updateBadge();

    if (added > 0 && !retryRequired) {
      void triggerUpload("auto");
    }
  }

  return {
    ok: true,
    added,
    skipped,
    source: source || "unknown",
    state: await buildState()
  };
}

function isFinishedOutcome(outcome) {
  return outcome === 1 || outcome === 2;
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
    const candidates = [item?.Battle?.User?.Id, item?.User?.Id, item?.UserId];
    for (const candidate of candidates) {
      const id = normalizePlayerId(candidate);
      if (id) {
        return id;
      }
    }
  }
  return null;
}

function collectHistoryParticipationIds(historyItems, onlyFinished) {
  const ids = [];
  const seen = new Set();

  for (const item of historyItems) {
    if (onlyFinished && !isFinishedHistoryItem(item)) {
      continue;
    }

    const participationId = normalizeParticipationId(item?.ParticipationId);
    if (!participationId || seen.has(participationId)) {
      continue;
    }

    seen.add(participationId);
    ids.push(participationId);
  }

  return ids;
}

function parseJsonText(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getErrorMessageFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof payload.Error === "string" && payload.Error.trim()) {
    return payload.Error.trim();
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof payload.Message === "string" && payload.Message.trim()) {
    return payload.Message.trim();
  }

  return null;
}

function normalizeBearerToken(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return "";
  }

  return raw.replace(/^Bearer\s+/i, "").trim();
}

async function loginWithSapCredentials(email, password, apiVersion) {
  const endpoint = `https://api.teamwood.games/0.${apiVersion}/api/user/login`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      Email: email,
      Password: password,
      Version: Number(apiVersion)
    })
  });

  const text = await response.text();
  const payload = parseJsonText(text);

  if (!response.ok) {
    const detail = getErrorMessageFromPayload(payload);
    throw new Error(detail ? `SAP login failed: HTTP ${response.status}: ${detail}` : `SAP login failed: HTTP ${response.status}`);
  }

  const token = normalizeBearerToken(payload?.Token || payload?.token || "");
  if (!token) {
    throw new Error("SAP login failed: missing token in response");
  }

  return {
    token,
    endpoint
  };
}

async function fetchHistoryWithToken(authToken, apiVersion) {
  const token = normalizeBearerToken(authToken);
  if (!token) {
    throw new Error("History sync failed: missing auth token");
  }

  const endpointCandidates = [
    {
      method: "POST",
      path: "/api/history/fetch",
      body: { Version: Number(apiVersion) }
    },
    {
      method: "POST",
      path: "/api/history/fetch",
      body: {}
    },
    {
      method: "GET",
      path: "/api/history/fetch"
    },
    {
      method: "POST",
      path: "/api/history/get",
      body: { Version: Number(apiVersion) }
    },
    {
      method: "GET",
      path: "/api/history/get"
    }
  ];

  let lastError = null;

  for (const candidate of endpointCandidates) {
    const endpoint = `https://api.teamwood.games/0.${apiVersion}${candidate.path}`;

    const requestOptions = {
      method: candidate.method,
      headers: {
        Authorization: `Bearer ${token}`
      }
    };

    if (candidate.method === "POST") {
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(candidate.body ?? {});
    }

    try {
      const response = await fetch(endpoint, requestOptions);
      const text = await response.text();
      const payload = parseJsonText(text);

      if (response.status === 401 || response.status === 403) {
        throw new Error(`History sync failed: SAP auth rejected (HTTP ${response.status})`);
      }

      if (!response.ok) {
        const detail = getErrorMessageFromPayload(payload);
        lastError = `${candidate.method} ${candidate.path} -> ${detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`}`;
        continue;
      }

      const historyItems = Array.isArray(payload?.History) ? payload.History : null;
      if (!historyItems) {
        lastError = `${candidate.method} ${candidate.path} -> invalid history payload`;
        continue;
      }

      return {
        endpoint,
        method: candidate.method,
        requestBody: Object.prototype.hasOwnProperty.call(candidate, "body") ? candidate.body : null,
        historyItems
      };
    } catch (error) {
      if (String(error && error.message || "").startsWith("History sync failed: SAP auth rejected")) {
        throw error;
      }
      lastError = `${candidate.method} ${candidate.path} -> ${error && error.message ? error.message : "network_error"}`;
    }
  }

  throw new Error(`History sync failed: ${lastError || "unknown_error"}`);
}

function buildHistoryFailureSummary(trigger, apiVersion, error, extra = {}) {
  return {
    ok: false,
    trigger,
    at: new Date().toISOString(),
    apiVersion,
    fetched: 0,
    finished: 0,
    added: 0,
    skipped: 0,
    error,
    ...extra
  };
}

async function persistHistorySyncSummary(summary, apiVersion) {
  const updates = {
    [STORAGE_KEYS.historySyncLast]: summary
  };

  const normalizedVersion = normalizeApiVersion(apiVersion);
  if (normalizedVersion) {
    updates[STORAGE_KEYS.sapApiVersion] = normalizedVersion;
  }

  await storageSet(updates);
}

async function syncHistoryWithCredentials(rawEmail, rawPassword, trigger) {
  await ensureInitialized();

  const providedEmail = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const providedPassword = typeof rawPassword === "string" ? rawPassword.trim() : "";
  const saved = await storageGet([
    STORAGE_KEYS.savedSapEmail,
    STORAGE_KEYS.savedSapPassword
  ]);
  const savedEmail = typeof saved[STORAGE_KEYS.savedSapEmail] === "string"
    ? saved[STORAGE_KEYS.savedSapEmail].trim()
    : "";
  const savedPassword = typeof saved[STORAGE_KEYS.savedSapPassword] === "string"
    ? saved[STORAGE_KEYS.savedSapPassword]
    : "";

  const email = providedEmail || savedEmail;
  const canReuseSavedPassword = !providedEmail || providedEmail === savedEmail;
  const password = providedPassword || (canReuseSavedPassword ? savedPassword : "");
  const apiVersion = DEFAULT_SAP_API_VERSION;

  if (!email || !password) {
    const summary = buildHistoryFailureSummary(
      trigger,
      apiVersion,
      "SAP email/password missing. Enter them once, then they will be remembered on this device."
    );
    await persistHistorySyncSummary(summary, apiVersion);
    return {
      ...summary,
      state: await buildState()
    };
  }

  let loginResult;
  try {
    loginResult = await loginWithSapCredentials(email, password, apiVersion);
  } catch (error) {
    const summary = buildHistoryFailureSummary(
      trigger,
      apiVersion,
      error && error.message ? error.message : "SAP login failed",
      {
        loginEndpoint: `https://api.teamwood.games/0.${apiVersion}/api/user/login`
      }
    );
    await persistHistorySyncSummary(summary, apiVersion);
    return {
      ...summary,
      state: await buildState()
    };
  }

  let historyResult;
  try {
    historyResult = await fetchHistoryWithToken(loginResult.token, apiVersion);
  } catch (error) {
    const summary = buildHistoryFailureSummary(
      trigger,
      apiVersion,
      error && error.message ? error.message : "History sync failed",
      {
        loginEndpoint: loginResult.endpoint
      }
    );
    await persistHistorySyncSummary(summary, apiVersion);
    return {
      ...summary,
      state: await buildState()
    };
  }

  const historyItems = Array.isArray(historyResult.historyItems) ? historyResult.historyItems : [];
  const fetchedIds = collectHistoryParticipationIds(historyItems, false);
  const finishedIds = collectHistoryParticipationIds(historyItems, true);
  const playerId = extractHistoryPlayerId(historyItems);

  console.log("SAP Library Uploader: History sync fetched participation IDs:", fetchedIds);
  console.log("SAP Library Uploader: History sync finished participation IDs:", finishedIds);

  const enqueueResult = await enqueueParticipationIds(finishedIds, "history_sync_credentials", playerId);

  const summary = {
    ok: true,
    trigger,
    at: new Date().toISOString(),
    apiVersion,
    loginEndpoint: loginResult.endpoint,
    endpoint: historyResult.endpoint,
    method: historyResult.method,
    requestBody: historyResult.requestBody,
    fetched: fetchedIds.length,
    finished: finishedIds.length,
    added: enqueueResult.added,
    skipped: enqueueResult.skipped,
    fetchedParticipationIds: fetchedIds,
    finishedParticipationIds: finishedIds
  };

  await persistHistorySyncSummary(summary, apiVersion);
  await storageSet({
    [STORAGE_KEYS.savedSapEmail]: email,
    [STORAGE_KEYS.savedSapPassword]: password
  });

  return {
    ...summary,
    state: await buildState()
  };
}

async function uploadPending(trigger) {
  await ensureInitialized();

  const current = await storageGet([
    STORAGE_KEYS.pending,
    STORAGE_KEYS.uploaded,
    STORAGE_KEYS.failed,
    STORAGE_KEYS.retryRequired
  ]);

  const retryRequired = Boolean(current[STORAGE_KEYS.retryRequired]);
  if (retryRequired && trigger !== "manual") {
    return {
      ok: false,
      status: "retry_required",
      trigger,
      attempted: 0,
      uploaded: 0,
      failed: 0,
      remaining: uniqueIds(current[STORAGE_KEYS.pending]).length,
      at: new Date().toISOString()
    };
  }

  const pending = uniqueIds(current[STORAGE_KEYS.pending]);

  if (!pending.length) {
    const summary = {
      ok: true,
      status: "idle",
      trigger,
      attempted: 0,
      uploaded: 0,
      failed: 0,
      remaining: 0,
      at: new Date().toISOString()
    };

    await storageSet({
      [STORAGE_KEYS.lastUpload]: summary,
      [STORAGE_KEYS.retryRequired]: false
    });

    await updateBadge();
    return summary;
  }

  const batch = pending.slice(0, UPLOAD_BATCH_SIZE);
  const endpoint = `${TARGET_BASE_URL}/api/replays`;

  const failedReasonById = new Map();
  const successfulIds = [];
  let insertedCount = 0;
  let skippedCount = 0;

  for (const participationId of batch) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participationId })
      });

      const responseText = await response.text();
      let payload = null;
      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const reasonFromBody = payload && typeof payload.error === "string" ? payload.error : null;
        const reason = reasonFromBody
          ? `HTTP ${response.status}: ${reasonFromBody}`
          : `HTTP ${response.status}`;
        failedReasonById.set(participationId, reason);
        continue;
      }

      const status = typeof payload?.status === "string" ? payload.status : "";
      if (status === "failed") {
        failedReasonById.set(participationId, payload?.error || "failed");
        continue;
      }

      if (status === "inserted") {
        insertedCount += 1;
      } else {
        skippedCount += 1;
      }

      successfulIds.push(participationId);
    } catch (error) {
      const message = error && error.message ? error.message : "network_error";
      failedReasonById.set(participationId, message);
    }
  }

  const successSet = new Set(successfulIds);
  const nextPending = pending.filter((id) => !successSet.has(id));

  const uploaded = uniqueIds([
    ...successfulIds,
    ...uniqueIds(current[STORAGE_KEYS.uploaded])
  ]).slice(0, MAX_UPLOADED_IDS);

  const failed = current[STORAGE_KEYS.failed] && typeof current[STORAGE_KEYS.failed] === "object"
    ? { ...current[STORAGE_KEYS.failed] }
    : {};

  const now = new Date().toISOString();

  for (const id of successfulIds) {
    delete failed[id];
  }

  for (const [id, reason] of failedReasonById.entries()) {
    const prev = failed[id] || {};
    failed[id] = {
      attempts: Number(prev.attempts || 0) + 1,
      lastError: reason,
      updatedAt: now
    };
  }

  const failedCount = failedReasonById.size;
  const retryNeeded = failedCount > 0;
  const summary = {
    ok: !retryNeeded,
    status: retryNeeded ? "partial_retry_required" : "uploaded",
    trigger,
    endpoint,
    attempted: batch.length,
    uploaded: successfulIds.length,
    failed: failedCount,
    inserted: insertedCount,
    skipped: skippedCount,
    remaining: nextPending.length,
    at: now
  };

  await storageSet({
    [STORAGE_KEYS.pending]: nextPending,
    [STORAGE_KEYS.uploaded]: uploaded,
    [STORAGE_KEYS.failed]: failed,
    [STORAGE_KEYS.lastUpload]: summary,
    [STORAGE_KEYS.retryRequired]: retryNeeded
  });

  await updateBadge();
  return summary;
}

function triggerUpload(trigger) {
  if (!uploadPromise) {
    uploadPromise = uploadPending(trigger).finally(() => {
      uploadPromise = null;
    });
  }
  return uploadPromise;
}

async function buildState() {
  await ensureInitialized();
  const result = await storageGet(Object.values(STORAGE_KEYS));

  const pending = uniqueIds(result[STORAGE_KEYS.pending]);
  const uploaded = uniqueIds(result[STORAGE_KEYS.uploaded]);
  const failedRaw = result[STORAGE_KEYS.failed] && typeof result[STORAGE_KEYS.failed] === "object"
    ? result[STORAGE_KEYS.failed]
    : {};

  const failedCount = Object.keys(failedRaw)
    .map((id) => normalizeParticipationId(id))
    .filter(Boolean).length;

  const retryRequired = Boolean(result[STORAGE_KEYS.retryRequired]);
  const lastUpload = result[STORAGE_KEYS.lastUpload] || null;
  const playerId = normalizePlayerId(result[STORAGE_KEYS.playerId]);
  const historySyncLast = result[STORAGE_KEYS.historySyncLast] && typeof result[STORAGE_KEYS.historySyncLast] === "object"
    ? result[STORAGE_KEYS.historySyncLast]
    : null;
  const sapApiVersion = normalizeApiVersion(result[STORAGE_KEYS.sapApiVersion]) || DEFAULT_SAP_API_VERSION;
  const savedSapEmail = typeof result[STORAGE_KEYS.savedSapEmail] === "string"
    ? result[STORAGE_KEYS.savedSapEmail].trim()
    : "";
  const savedSapPassword = typeof result[STORAGE_KEYS.savedSapPassword] === "string"
    ? result[STORAGE_KEYS.savedSapPassword]
    : "";

  let syncState = "ready";
  if (uploadPromise) {
    syncState = "uploading";
  } else if (retryRequired) {
    syncState = "needs_retry";
  } else if (pending.length > 0) {
    syncState = "queued";
  } else if (lastUpload && lastUpload.ok === true) {
    syncState = "synced";
  }

  return {
    syncState,
    target: TARGET_BASE_URL,
    playerId,
    counts: {
      pending: pending.length,
      uploaded: uploaded.length,
      failed: failedCount
    },
    sapApiVersion,
    savedSapEmail: savedSapEmail || null,
    savedSapPassword: savedSapPassword || null,
    hasSavedSapPassword: Boolean(savedSapPassword),
    historySyncLast,
    retryRequired,
    lastUpload,
    isUploading: Boolean(uploadPromise)
  };
}

async function clearQueue() {
  await storageSet({
    [STORAGE_KEYS.pending]: [],
    [STORAGE_KEYS.failed]: {},
    [STORAGE_KEYS.retryRequired]: false
  });

  await updateBadge();
  return buildState();
}

async function handleMessage(message) {
  const type = message?.type;

  if (type === "enqueue_participation_ids") {
    return enqueueParticipationIds(message.ids, message.source || "unknown", message.playerId || null);
  }

  if (type === "sync_history_with_credentials") {
    const summary = await syncHistoryWithCredentials(
      message.email,
      message.password,
      "manual_history_sync"
    );

    return {
      ok: summary.ok,
      summary,
      state: summary.state || await buildState(),
      error: summary.ok ? null : summary.error
    };
  }

  if (type === "get_state") {
    return { ok: true, state: await buildState() };
  }

  if (type === "upload_now") {
    const summary = await triggerUpload("manual");
    return { ok: true, summary, state: await buildState() };
  }

  if (type === "clear_queue") {
    return { ok: true, state: await clearQueue() };
  }

  if (type === "ping") {
    return { ok: true, pong: true };
  }

  return { ok: false, error: `Unknown message type: ${String(type)}` };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : "Unhandled error"
      });
    });

  return true;
});

async function initializeRuntime() {
  await ensureInitialized();
}

chrome.runtime.onInstalled.addListener(() => {
  void initializeRuntime();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeRuntime();
});

void initializeRuntime();
