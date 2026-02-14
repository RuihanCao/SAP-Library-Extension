const STORAGE_KEYS = {
  pending: "slx_pending_ids",
  uploaded: "slx_uploaded_ids",
  failed: "slx_failed",
  lastUpload: "slx_last_upload",
  retryRequired: "slx_retry_required",
  playerId: "slx_player_id"
};

const TARGET_BASE_URL = "https://sap-library.vercel.app";
const UPLOAD_BATCH_SIZE = 25;
const MAX_UPLOADED_IDS = 5000;

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
  const result = await storageGet(Object.values(STORAGE_KEYS));
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

chrome.runtime.onInstalled.addListener(() => {
  void ensureInitialized();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureInitialized();
});

void ensureInitialized();
