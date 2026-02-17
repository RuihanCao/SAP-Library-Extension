(() => {
  const maps = typeof SAP_CALCULATOR_MAPS === "object" && SAP_CALCULATOR_MAPS ? SAP_CALCULATOR_MAPS : null;
  if (!maps) {
    return;
  }

  const SHORT_TO_LONG_KEY_MAP = {
    pP: "playerPack",
    oP: "opponentPack",
    pT: "playerToy",
    pTL: "playerToyLevel",
    oT: "opponentToy",
    oTL: "opponentToyLevel",
    t: "turn",
    pGS: "playerGoldSpent",
    oGS: "opponentGoldSpent",
    pRA: "playerRollAmount",
    oRA: "opponentRollAmount",
    pSA: "playerSummonedAmount",
    oSA: "opponentSummonedAmount",
    pL3: "playerLevel3Sold",
    oL3: "opponentLevel3Sold",
    pTA: "playerTransformationAmount",
    oTA: "opponentTransformationAmount",
    p: "playerPets",
    o: "opponentPets",
    an: "angler",
    ap: "allPets",
    lf: "logFilter",
    fs: "fontSize",
    cp: "customPacks",
    os: "oldStork",
    tp: "tokenPets",
    ks: "komodoShuffle",
    m: "mana",
    sa: "showAdvanced",
    ae: "ailmentEquipment",
    n: "name",
    a: "attack",
    h: "health",
    e: "exp",
    eq: "equipment",
    bSP: "belugaSwallowedPet",
    tH: "timesHurt"
  };

  const UI_BUTTON_ID = "sapReplayExportButton";
  const UI_STATUS_ID = "sapReplayExportStatus";
  const UI_STYLE_ID = "sapReplayExportStyle";

  const DEFAULT_BACKGROUND_ID = Number.isFinite(maps?.defaults?.backgroundId) ? maps.defaults.backgroundId : 0;
  const DEFAULT_MASCOT_ID = Number.isFinite(maps?.defaults?.mascotId) ? maps.defaults.mascotId : 18;
  const DEFAULT_COSMETIC_ID = Number.isFinite(maps?.defaults?.cosmeticId) ? maps.defaults.cosmeticId : 0;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeLookupKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function toFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clampInt(value, min, max) {
    const numeric = Math.round(toFiniteNumber(value, min));
    return Math.min(max, Math.max(min, numeric));
  }

  function normalizeDisplayName(value, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }

    const trimmed = value.trim();
    return trimmed || fallback;
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

  function randomSignedInt32() {
    return (Math.floor(Math.random() * 0xffffffff) | 0);
  }

  function randomHash() {
    return Math.floor(Math.random() * 0x7fffffff);
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function decodeBase64ToUtf8(base64Text) {
    try {
      const binary = atob(base64Text);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return null;
    }
  }

  function decodeBase64UrlToUtf8(base64UrlText) {
    const normalized = String(base64UrlText || "")
      .trim()
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    if (!normalized) {
      return null;
    }

    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return decodeBase64ToUtf8(padded);
  }

  function tryParseJson(text) {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false };
    }
  }

  function tryParseJsonCandidate(text) {
    if (typeof text !== "string") {
      return null;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    const direct = tryParseJson(trimmed);
    if (direct.ok) {
      return direct.value;
    }

    const decoded = safeDecodeURIComponent(trimmed);
    if (decoded !== trimmed) {
      const decodedJson = tryParseJson(decoded);
      if (decodedJson.ok) {
        return decodedJson.value;
      }
    }

    return null;
  }

  function extractStateParamFromUrl(rawUrl) {
    try {
      const parsedUrl = new URL(rawUrl);
      return parsedUrl.searchParams.get("c") || parsedUrl.searchParams.get("code") || "";
    } catch {
      return "";
    }
  }

  function parseCalculatorInput(rawInput) {
    const text = String(rawInput || "").trim();
    if (!text) {
      throw new Error("No calculator export text provided.");
    }

    if (/^https?:\/\//i.test(text)) {
      const fromUrl = extractStateParamFromUrl(text);
      if (!fromUrl) {
        throw new Error("Could not find a calculator state in that URL.");
      }
      return parseCalculatorInput(fromUrl);
    }

    if (/^SAPC1:/i.test(text)) {
      const payload = text.slice(6).trim();
      const decoded = decodeBase64UrlToUtf8(payload) || decodeBase64ToUtf8(payload);
      const parsed = tryParseJsonCandidate(decoded || "");
      if (parsed !== null) {
        return parsed;
      }
      throw new Error("Could not decode SAPC1 export text. Try refreshing the page.");
    }

    const direct = tryParseJsonCandidate(text);
    if (direct !== null) {
      return direct;
    }

    const decodedUrl = safeDecodeURIComponent(text);
    const urlParsed = tryParseJsonCandidate(decodedUrl);
    if (urlParsed !== null) {
      return urlParsed;
    }

    const decodedBase64Url = decodeBase64UrlToUtf8(text);
    const base64UrlParsed = tryParseJsonCandidate(decodedBase64Url || "");
    if (base64UrlParsed !== null) {
      return base64UrlParsed;
    }

    const decodedBase64 = decodeBase64ToUtf8(text);
    const base64Parsed = tryParseJsonCandidate(decodedBase64 || "");
    if (base64Parsed !== null) {
      return base64Parsed;
    }

    throw new Error("Input is not a recognized calculator export format.");
  }

  function expandShortKeys(value) {
    if (Array.isArray(value)) {
      return value.map((item) => expandShortKeys(item));
    }

    if (!isPlainObject(value)) {
      return value;
    }

    const output = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const expandedKey = SHORT_TO_LONG_KEY_MAP[key] || key;
      output[expandedKey] = expandShortKeys(nestedValue);
    }
    return output;
  }

  function looksLikeCalculatorState(value) {
    if (!isPlainObject(value)) {
      return false;
    }

    return Array.isArray(value.playerPets) || Array.isArray(value.opponentPets);
  }

  function extractCalculatorState(rawState) {
    const expanded = expandShortKeys(rawState);
    const candidates = [
      expanded,
      expanded?.state,
      expanded?.calculatorState,
      expanded?.calculator,
      expanded?.payload,
      expanded?.data,
      expanded?.formGroup
    ];

    for (const candidate of candidates) {
      if (looksLikeCalculatorState(candidate)) {
        return candidate;
      }
    }

    throw new Error("Could not find player/opponent team data in the calculator export.");
  }

  function getEquipmentName(rawPet) {
    const equipment = rawPet?.equipment;
    if (typeof equipment === "string") {
      return equipment;
    }
    if (isPlainObject(equipment) && typeof equipment.name === "string") {
      return equipment.name;
    }
    return null;
  }

  function resolvePackId(rawPackName) {
    const packKey = normalizeLookupKey(rawPackName);
    const mapped = maps?.packIdsByName?.[packKey];
    return Number.isFinite(mapped) ? mapped : 0;
  }

  function resolvePetId(rawPet) {
    if (!isPlainObject(rawPet)) {
      return null;
    }

    const directIdCandidates = [rawPet.id, rawPet.petId, rawPet.enum, rawPet.Enu];
    for (const candidate of directIdCandidates) {
      const numeric = toFiniteNumber(candidate, NaN);
      if (Number.isFinite(numeric)) {
        return Math.trunc(numeric);
      }
    }

    const lookupKey = normalizeLookupKey(rawPet.name);
    if (!lookupKey) {
      return null;
    }

    const mapped = maps?.petIdsByName?.[lookupKey];
    return Number.isFinite(mapped) ? mapped : null;
  }

  function resolvePerkId(rawPet) {
    const perkName = getEquipmentName(rawPet);
    const lookupKey = normalizeLookupKey(perkName);
    if (!lookupKey) {
      return null;
    }

    const mapped = maps?.perkIdsByName?.[lookupKey];
    return Number.isFinite(mapped) ? mapped : null;
  }

  function levelFromPet(rawPet) {
    const explicitLevel = toFiniteNumber(rawPet?.level, NaN);
    if (Number.isFinite(explicitLevel)) {
      return clampInt(explicitLevel, 1, 3);
    }

    const exp = toFiniteNumber(rawPet?.exp, 0);
    if (exp >= 5) {
      return 3;
    }
    if (exp >= 2) {
      return 2;
    }
    return 1;
  }

  function expFromPet(rawPet, level) {
    const explicitExp = toFiniteNumber(rawPet?.exp, NaN);
    if (Number.isFinite(explicitExp)) {
      return Math.max(0, Math.round(explicitExp));
    }

    if (level >= 3) {
      return 5;
    }
    if (level === 2) {
      return 2;
    }
    return 0;
  }

  function buildAbilityEntry(abilityEnum, level) {
    return {
      Enu: abilityEnum,
      Lvl: level,
      Nat: true,
      Dur: 0,
      TrCo: 0,
      Char: null,
      Dis: false,
      AIML: false,
      IgRe: false,
      Grop: 0,
      AcCo: 0,
      DisT: false
    };
  }

  function buildMinion(rawPet, position, boardId, uniqueId, warningBag) {
    if (!isPlainObject(rawPet) || !rawPet.name) {
      return null;
    }

    const petId = resolvePetId(rawPet);
    if (!Number.isFinite(petId)) {
      warningBag.unknownPets.push(String(rawPet.name));
      return null;
    }

    const level = levelFromPet(rawPet);
    const exp = expFromPet(rawPet, level);

    const attack = Math.max(0, Math.round(toFiniteNumber(rawPet.attack, 1)));
    const health = Math.max(1, Math.round(toFiniteNumber(rawPet.health, 1)));
    const perkName = getEquipmentName(rawPet);
    const perkId = resolvePerkId(rawPet);
    if (perkName && !Number.isFinite(perkId)) {
      warningBag.missingPerkMap.push(String(perkName));
    }

    const abilityMap = maps?.abilityIdsByPetId || {};
    const abilityMapKey = String(petId);
    const hasAbilityMapping = Object.prototype.hasOwnProperty.call(abilityMap, abilityMapKey);
    if (!hasAbilityMapping) {
      warningBag.missingAbilityMap.push(String(rawPet.name));
    }
    const abilityEnums = hasAbilityMapping && Array.isArray(abilityMap[abilityMapKey])
      ? abilityMap[abilityMapKey]
      : [];

    return {
      Own: 1,
      Enu: petId,
      Loc: 1,
      Poi: { x: position, y: 0 },
      Exp: exp,
      Lvl: level,
      Hp: { Perm: health, Temp: 0, Max: null },
      At: { Perm: attack, Temp: 0, Max: null },
      Mana: 0,
      Cou: null,
      CoBr: null,
      LaPP: null,
      Perk: Number.isFinite(perkId) ? perkId : null,
      PeBo: false,
      PeDu: null,
      PeDM: null,
      PeMu: null,
      PeDr: 0,
      Abil: abilityEnums.map((abilityEnum) => buildAbilityEntry(abilityEnum, level)),
      AbDi: false,
      Cosm: DEFAULT_COSMETIC_ID,
      Dead: false,
      Dest: false,
      DeBy: null,
      Link: null,
      Pow: null,
      SeV: null,
      Rwds: 0,
      Rwrd: false,
      MiMs: null,
      SpMe: null,
      Tri: null,
      AtkC: 0,
      HrtC: 0,
      SpCT: 0,
      OlTs: null,
      Id: { BoId: boardId, Uni: uniqueId },
      Pri: 3,
      Fro: false,
      WFro: false,
      AFro: false,
      LastTargetsThisTurn: null
    };
  }

  function uniqueStrings(values) {
    const output = [];
    const seen = new Set();
    for (const value of values) {
      const normalized = String(value || "").trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      output.push(normalized);
    }
    return output;
  }

  function buildBoard(
    boardId,
    packName,
    rawPets,
    displayLabel,
    unknownWarnings,
    missingAbilityWarnings,
    missingPerkWarnings,
    unknownPackWarnings,
    options = {}
  ) {
    const reverseInputOrder = Boolean(options.reverseInputOrder);
    const items = new Array(5).fill(null);
    const warningBag = {
      unknownPets: [],
      missingAbilityMap: [],
      missingPerkMap: []
    };

    for (let i = 0; i < 5; i += 1) {
      const uniqueId = 100 + i;
      const sourceIndex = reverseInputOrder ? (4 - i) : i;
      items[i] = buildMinion(rawPets[sourceIndex], i, boardId, uniqueId, warningBag);
    }

    unknownWarnings.push(...warningBag.unknownPets);
    missingAbilityWarnings.push(...warningBag.missingAbilityMap);
    missingPerkWarnings.push(...warningBag.missingPerkMap);

    const petEnums = items.filter(Boolean).map((minion) => minion.Enu);
    const packKey = normalizeLookupKey(packName);
    const hasPackMapping = Number.isFinite(maps?.packIdsByName?.[packKey]);
    if (packName && !hasPackMapping) {
      unknownPackWarnings.push(String(packName));
    }
    const packId = resolvePackId(packName);

    return {
      SPow: null,
      Id: boardId,
      UNC: 300 + petEnums.length,
      Sta: 4,
      IsBa: null,
      LiMa: 6,
      Los: 0,
      LPM: 4,
      LCa: null,
      LoPs: 5,
      Vic: 0,
      ViMa: null,
      Rec: null,
      Tur: 12,
      Go: 0,
      FuGo: null,
      GoSp: 10,
      FrRo: 0,
      FuRo: null,
      Rold: 1,
      TrTT: 0,
      TiMi: null,
      Ti: 6,
      BoCa: 99,
      Mins: {
        Size: { x: 5, y: 1 },
        Items: items
      },
      MiSC: 5,
      MSBo: [{ At: 1, Hp: 1, Ti: null, Mi: null }],
      MiSh: [],
      SpSC: 2,
      SpSh: [],
      Adj: displayLabel,
      Nou: "Replay",
      Trum: 0,
      PrOu: 1,
      PrEn: petEnums,
      PrES: [],
      MiPl: 0,
      MiSu: 0,
      MSFL: 0,
      SpPl: [],
      SpCo: null,
      Mode: 0,
      Cosm: DEFAULT_COSMETIC_ID,
      CoMa: null,
      Back: DEFAULT_BACKGROUND_ID,
      Masc: DEFAULT_MASCOT_ID,
      Entr: 0,
      Awar: null,
      Pack: packId,
      Pcks: false,
      Taut: null,
      Deck: null,
      Rel: {
        Size: { x: 2, y: 1 },
        Items: [null, null]
      },
      Bul: {
        Size: { x: 0, y: 0 },
        Items: null
      },
      Choi: null,
      FuCh: null,
      Hash: randomHash(),
      Diff: 0,
      ShRe: null,
      Clon: false,
      GoGa: 0,
      PrES2: [],
      Wacky: null,
      WMPs: null,
      WMPb: false
    };
  }

  function buildBattleFromCalculatorState(state) {
    const playerPets = Array.isArray(state.playerPets) ? state.playerPets : [];
    const opponentPets = Array.isArray(state.opponentPets) ? state.opponentPets : [];

    const unknownWarnings = [];
    const missingAbilityWarnings = [];
    const missingPerkWarnings = [];
    const unknownPackWarnings = [];

    const userBoardId = randomUuid();
    const opponentBoardId = randomUuid();
    const nowIso = new Date().toISOString();

    const battle = {
      Id: randomUuid(),
      Seed: randomSignedInt32(),
      Outcome: 1,
      ResolvedOn: nowIso,
      WatchedOn: nowIso,
      User: {
        Id: randomUuid(),
        DisplayName: normalizeDisplayName(state.playerName, "Calculator Player")
      },
      UserBoard: buildBoard(
        userBoardId,
        state.playerPack || "Turtle",
        playerPets,
        "Calculator",
        unknownWarnings,
        missingAbilityWarnings,
        missingPerkWarnings,
        unknownPackWarnings,
        { reverseInputOrder: true }
      ),
      Opponent: {
        Id: randomUuid(),
        DisplayName: normalizeDisplayName(state.opponentName, "Calculator Opponent")
      },
      OpponentBoard: buildBoard(
        opponentBoardId,
        state.opponentPack || "Turtle",
        opponentPets,
        "Opponent",
        unknownWarnings,
        missingAbilityWarnings,
        missingPerkWarnings,
        unknownPackWarnings,
        { reverseInputOrder: true }
      ),
      EndResult: randomHash()
    };

    return {
      battle,
      teamSizes: {
        player: battle.UserBoard.Mins.Items.filter(Boolean).length,
        opponent: battle.OpponentBoard.Mins.Items.filter(Boolean).length
      },
      warnings: {
        unknownPets: uniqueStrings(unknownWarnings),
        missingAbilityMap: uniqueStrings(missingAbilityWarnings),
        missingPerkMap: uniqueStrings(missingPerkWarnings),
        missingPackMap: uniqueStrings(unknownPackWarnings)
      }
    };
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message || "Extension worker is unavailable."));
          return;
        }
        resolve(response || null);
      });
    });
  }

  function looksLikeCalculatorCode(value) {
    if (typeof value !== "string") {
      return false;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    if (/^SAPC1:/i.test(trimmed)) {
      return true;
    }

    if (/^https?:\/\/[^ ]*sap-calculator\.com/i.test(trimmed)) {
      return true;
    }

    if (trimmed.startsWith("{") && /"playerPets"|"p"|"playerPack"|"pP"/.test(trimmed)) {
      return true;
    }

    if (/"playerPets"|"pP"|"opponentPets"|"oP"/.test(trimmed)) {
      return true;
    }

    return false;
  }

  function isElementVisible(element) {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (!style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
  }

  function guessCodeFromPage() {
    const fields = Array.from(document.querySelectorAll("textarea, input[type='text'], input:not([type])"));
    const candidates = [];

    for (const field of fields) {
      const value = typeof field.value === "string" ? field.value.trim() : "";
      if (!looksLikeCalculatorCode(value)) {
        continue;
      }

      const visibilityScore = isElementVisible(field) ? 10000 : 0;
      const score = visibilityScore + value.length;
      candidates.push({ score, value });
    }

    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.value || "";
  }

  async function guessCodeFromClipboard() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (looksLikeCalculatorCode(clipboardText)) {
        return clipboardText.trim();
      }
    } catch {
      // Ignore clipboard failures.
    }
    return "";
  }

  function ensureStyle() {
    if (document.getElementById(UI_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = UI_STYLE_ID;
    style.textContent = `
      #${UI_BUTTON_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483646;
        padding: 10px 12px;
        border: 1px solid #0f172a;
        border-radius: 999px;
        background: #0f172a;
        color: #ffffff;
        font: 600 12px/1.2 "Segoe UI", Tahoma, sans-serif;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.25);
        cursor: pointer;
      }
      #${UI_BUTTON_ID}[data-busy="1"] {
        opacity: 0.75;
        cursor: progress;
      }
      #${UI_STATUS_ID} {
        position: fixed;
        right: 16px;
        bottom: 62px;
        z-index: 2147483646;
        max-width: 350px;
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.92);
        color: #e2e8f0;
        font: 500 12px/1.35 "Segoe UI", Tahoma, sans-serif;
        white-space: normal;
      }
      #${UI_STATUS_ID}[data-error="1"] {
        background: rgba(127, 29, 29, 0.95);
        color: #fee2e2;
      }
      @media (max-width: 720px) {
        #${UI_BUTTON_ID} {
          right: 10px;
          bottom: 10px;
        }
        #${UI_STATUS_ID} {
          right: 10px;
          bottom: 56px;
          max-width: calc(100vw - 20px);
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function setStatus(text, isError = false) {
    let status = document.getElementById(UI_STATUS_ID);
    if (!status) {
      status = document.createElement("div");
      status.id = UI_STATUS_ID;
      document.body.appendChild(status);
    }
    status.textContent = text;
    status.setAttribute("data-error", isError ? "1" : "0");
  }

  function setButtonBusy(button, isBusy) {
    button.setAttribute("data-busy", isBusy ? "1" : "0");
    button.disabled = Boolean(isBusy);
    button.textContent = isBusy ? "Converting..." : "Send To SAP Replay";
  }

  function warningSummary(warnings) {
    const parts = [];
    if (warnings.unknownPets.length > 0) {
      parts.push(`Unknown pets skipped: ${warnings.unknownPets.slice(0, 4).join(", ")}${warnings.unknownPets.length > 4 ? "..." : ""}`);
    }
    if (warnings.missingAbilityMap.length > 0) {
      parts.push(`Ability map missing: ${warnings.missingAbilityMap.slice(0, 4).join(", ")}${warnings.missingAbilityMap.length > 4 ? "..." : ""}`);
    }
    if (warnings.missingPerkMap.length > 0) {
      parts.push(`Perk map missing: ${warnings.missingPerkMap.slice(0, 4).join(", ")}${warnings.missingPerkMap.length > 4 ? "..." : ""}`);
    }
    if (warnings.missingPackMap.length > 0) {
      parts.push(`Pack map missing: ${warnings.missingPackMap.slice(0, 4).join(", ")}${warnings.missingPackMap.length > 4 ? "..." : ""}`);
    }
    return parts.join(" | ");
  }

  async function convertAndSaveFromInput(userInput) {
    const parsed = parseCalculatorInput(userInput);
    const calculatorState = extractCalculatorState(parsed);
    const { battle, teamSizes, warnings } = buildBattleFromCalculatorState(calculatorState);

    const saveResponse = await sendMessage({
      type: "set_battle_override_config",
      enabled: true,
      battle
    });

    if (!saveResponse || !saveResponse.ok) {
      throw new Error(saveResponse?.error || "Could not save replay override.");
    }

    const verifyResponse = await sendMessage({ type: "get_battle_override_config" });
    if (!verifyResponse || !verifyResponse.ok || !verifyResponse.config?.enabled || !verifyResponse.config?.battle) {
      throw new Error("Replay conversion succeeded but extension override was not saved.");
    }

    let clipboardCopied = false;
    try {
      await navigator.clipboard.writeText(JSON.stringify(battle, null, 2));
      clipboardCopied = true;
    } catch {
      clipboardCopied = false;
    }

    const warningText = warningSummary(warnings);
    const sizeText = `Saved replay (${teamSizes.player} vs ${teamSizes.opponent}) and enabled injection.`;
    const clipboardText = clipboardCopied
      ? "Replay JSON copied to clipboard."
      : "Replay JSON not copied (clipboard blocked), but override is saved.";

    return warningText ? `${sizeText} ${warningText} ${clipboardText}` : `${sizeText} ${clipboardText}`;
  }

  async function onButtonClick(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    setButtonBusy(button, true);
    try {
      const pageGuess = guessCodeFromPage();
      if (pageGuess) {
        const message = await convertAndSaveFromInput(pageGuess);
        setStatus(`Auto-detected export from page. ${message}`);
        return;
      }

      const clipboardGuess = await guessCodeFromClipboard();
      if (clipboardGuess) {
        const message = await convertAndSaveFromInput(clipboardGuess);
        setStatus(`Used export from clipboard. ${message}`);
        return;
      }

      const promptValue = window.prompt(
        "No export code detected automatically. Paste SAP Calculator export code, share URL, or JSON:",
        ""
      );

      if (promptValue === null) {
        setStatus("Conversion cancelled.");
        return;
      }

      const message = await convertAndSaveFromInput(promptValue);
      setStatus(message);
    } catch (error) {
      const message = error && error.message ? error.message : "Unexpected conversion error.";
      setStatus(message, true);
    } finally {
      setButtonBusy(button, false);
    }
  }

  function ensureUi() {
    if (!document.body) {
      return;
    }

    ensureStyle();

    if (!document.getElementById(UI_BUTTON_ID)) {
      const button = document.createElement("button");
      button.id = UI_BUTTON_ID;
      button.type = "button";
      button.textContent = "Send To SAP Replay";
      button.addEventListener("click", onButtonClick);
      document.body.appendChild(button);
    }

    if (!document.getElementById(UI_STATUS_ID)) {
      setStatus("Ready to export calculator state to replay override.");
    }
  }

  function boot() {
    ensureUi();
    const observer = new MutationObserver(() => ensureUi());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
