#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const MAP_OUTPUT_PATH = path.join(ROOT_DIR, "calculator_maps.js");

const SOURCE_PATHS = {
  replayBotPets: path.join(ROOT_DIR, "map_sources", "replay_bot", "pets.json"),
  replayBotPerks: path.join(ROOT_DIR, "map_sources", "replay_bot", "perks.json"),
  replayBotToys: path.join(ROOT_DIR, "map_sources", "replay_bot", "toys.json"),
  replayBotRelicAbilityEnums: path.join(ROOT_DIR, "map_sources", "replay_bot", "relic_ability_enums.json"),
  replayEditorAnimals: path.join(ROOT_DIR, "map_sources", "replay_editor", "animals.json"),
  replayEditorAbilities: path.join(ROOT_DIR, "map_sources", "replay_editor", "abilities.json"),
  replayEditorPerks: path.join(ROOT_DIR, "map_sources", "replay_editor", "perks.json"),
  replayEditorBackgrounds: path.join(ROOT_DIR, "map_sources", "replay_editor", "backgrounds.json")
};

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseId(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortedObject(input) {
  const entries = Object.entries(input || {}).sort(([left], [right]) => (
    left < right ? -1 : (left > right ? 1 : 0)
  ));
  return Object.fromEntries(entries);
}

function buildPetIdMap(replayBotPets, replayEditorAnimals) {
  const map = {};
  const metaByKey = {};
  const conflicts = [];
  const replayBotPetIds = new Set();

  const computePetPriority = (meta) => {
    if (!meta || typeof meta !== "object") {
      return 0;
    }

    let score = 0;

    if (meta.source === "replay_bot_name") {
      score += 1000;
    }
    if (meta.rollable === true) {
      score += 100;
    }
    if (typeof meta.name === "string" && !meta.name.includes("?")) {
      score += 10;
    }

    const tier = parseId(meta.tier);
    if (Number.isFinite(tier)) {
      score += tier;
    }

    return score;
  };

  const pickPreferred = (currentMeta, nextMeta) => {
    const currentScore = computePetPriority(currentMeta);
    const nextScore = computePetPriority(nextMeta);

    if (nextScore > currentScore) {
      return true;
    }

    if (nextScore < currentScore) {
      return false;
    }

    const currentId = parseId(currentMeta?.id);
    const nextId = parseId(nextMeta?.id);
    if (Number.isFinite(currentId) && Number.isFinite(nextId)) {
      return nextId < currentId;
    }

    return false;
  };

  const put = (rawKey, id, source, petMeta) => {
    const key = normalizeLookupKey(rawKey);
    if (!key || !Number.isFinite(id)) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(map, key) && map[key] !== id) {
      const currentMeta = metaByKey[key] || { id: map[key], source: "unknown" };
      const nextMeta = {
        id,
        source,
        name: petMeta?.name || rawKey || "",
        rollable: petMeta?.rollable,
        tier: petMeta?.tier
      };
      const shouldReplace = pickPreferred(currentMeta, nextMeta);

      if (shouldReplace) {
        conflicts.push({
          key,
          previousId: map[key],
          nextId: id,
          source,
          resolvedTo: id
        });
        map[key] = id;
        metaByKey[key] = nextMeta;
        return;
      }

      conflicts.push({
        key,
        previousId: map[key],
        nextId: id,
        source,
        resolvedTo: map[key]
      });
      return;
    }

    map[key] = id;
    metaByKey[key] = {
      id,
      source,
      name: petMeta?.name || rawKey || "",
      rollable: petMeta?.rollable,
      tier: petMeta?.tier
    };
  };

  for (const pet of replayBotPets) {
    const id = parseId(pet?.Id);
    if (!Number.isFinite(id)) {
      continue;
    }

    replayBotPetIds.add(id);
    // Requested behavior: use display Name from replay-bot as primary source.
    put(pet?.Name, id, "replay_bot_name", {
      name: pet?.Name,
      rollable: pet?.Rollable === true,
      tier: pet?.Tier
    });
  }

  for (const [animalName, rawId] of Object.entries(replayEditorAnimals || {})) {
    const id = parseId(rawId);
    if (!Number.isFinite(id) || !replayBotPetIds.has(id)) {
      continue;
    }
    put(animalName, id, "replay_editor_animals");
  }

  return {
    petIdsByName: sortedObject(map),
    conflicts
  };
}

function buildPerkIdMap(replayBotPerks, replayEditorPerks) {
  const map = {};
  const conflicts = [];
  const replayBotPerkIds = new Set();

  const put = (rawKey, id, source) => {
    const key = normalizeLookupKey(rawKey);
    if (!key || !Number.isFinite(id)) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(map, key) && map[key] !== id) {
      conflicts.push({
        key,
        previousId: map[key],
        nextId: id,
        source
      });
      return;
    }

    map[key] = id;
  };

  for (const perk of replayBotPerks) {
    const id = parseId(perk?.Id);
    if (!Number.isFinite(id)) {
      continue;
    }
    replayBotPerkIds.add(id);
    // Requested behavior: use display Name from replay-bot as primary source.
    put(perk?.Name, id, "replay_bot_name");
  }

  // Add replay-editor aliases only when the ID exists in replay-bot.
  for (const [perkName, rawId] of Object.entries(replayEditorPerks || {})) {
    const id = parseId(rawId);
    if (!Number.isFinite(id) || !replayBotPerkIds.has(id)) {
      continue;
    }
    put(perkName, id, "replay_editor_perks");
  }

  return {
    perkIdsByName: sortedObject(map),
    conflicts
  };
}

function buildToyIdMap(replayBotToys) {
  const map = {};
  const conflicts = [];

  const put = (rawKey, id, source) => {
    const key = normalizeLookupKey(rawKey);
    if (!key || !Number.isFinite(id)) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(map, key) && map[key] !== id) {
      conflicts.push({
        key,
        previousId: map[key],
        nextId: id,
        source
      });
      return;
    }

    map[key] = id;
  };

  for (const toy of replayBotToys) {
    const id = parseId(toy?.Id);
    if (!Number.isFinite(id)) {
      continue;
    }
    // Requested behavior: use display Name from replay-bot as primary source.
    put(toy?.Name, id, "replay_bot_name");
  }

  return {
    toyIdsByName: sortedObject(map),
    conflicts
  };
}

function buildAbilityMapByPetId(replayBotPets, replayEditorAnimals, replayEditorAbilities) {
  const abilityIdsByPetId = {};
  const animalsById = new Map();
  const missingById = [];

  for (const [animalName, rawId] of Object.entries(replayEditorAnimals || {})) {
    const id = parseId(rawId);
    if (!Number.isFinite(id)) {
      continue;
    }

    const key = String(id);
    if (!animalsById.has(key)) {
      animalsById.set(key, []);
    }
    animalsById.get(key).push(animalName);
  }

  for (const pet of replayBotPets) {
    const id = parseId(pet?.Id);
    if (!Number.isFinite(id)) {
      continue;
    }

    const key = String(id);
    const names = animalsById.get(key) || [];
    const merged = [];
    const seen = new Set();

    for (const name of names) {
      const enums = replayEditorAbilities?.[name];
      if (!Array.isArray(enums)) {
        continue;
      }

      for (const rawEnum of enums) {
        const enumId = parseId(rawEnum);
        if (!Number.isFinite(enumId) || seen.has(enumId)) {
          continue;
        }
        seen.add(enumId);
        merged.push(enumId);
      }
    }

    abilityIdsByPetId[key] = merged;

    if (names.length === 0) {
      missingById.push({
        petId: id,
        petName: String(pet?.Name || ""),
        reason: "missing_animals_id_bridge"
      });
    }
  }

  const sortedByNumericKey = Object.fromEntries(
    Object.entries(abilityIdsByPetId).sort((left, right) => Number(left[0]) - Number(right[0]))
  );

  return {
    abilityIdsByPetId: sortedByNumericKey,
    missingById
  };
}

function resolveToyAbilityEnum(toyNameId, replayBotRelicAbilityEnums) {
  const base = String(toyNameId || "").trim();
  if (!base) {
    return null;
  }

  const candidates = [`${base}Ability`];

  // SAP-Replay-Bot uses some NameId values with a "RelicToy" prefix while the
  // enum is "Relic*Ability" (example: RelicToySaw -> RelicSawAbility).
  if (base.startsWith("RelicToy")) {
    candidates.push(`Relic${base.slice("RelicToy".length)}Ability`);
  }

  // The game has both "RelicThe..." and "Relic..." naming variants in assets.
  if (base.startsWith("RelicThe")) {
    candidates.push(`Relic${base.slice("RelicThe".length)}Ability`);
  }

  for (const enumName of candidates) {
    const enumId = parseId(replayBotRelicAbilityEnums?.[enumName]);
    if (Number.isFinite(enumId)) {
      return enumId;
    }
  }

  return null;
}

function buildToyAbilityEnumMapByToyId(replayBotToys, replayBotRelicAbilityEnums) {
  const map = {};
  const missing = [];

  for (const toy of replayBotToys) {
    const toyId = parseId(toy?.Id);
    if (!Number.isFinite(toyId)) {
      continue;
    }

    const enumId = resolveToyAbilityEnum(toy?.NameId, replayBotRelicAbilityEnums);
    if (!Number.isFinite(enumId)) {
      missing.push({
        toyId,
        toyName: String(toy?.Name || ""),
        toyNameId: String(toy?.NameId || "")
      });
      continue;
    }

    map[String(toyId)] = enumId;
  }

  const sortedByNumericKey = Object.fromEntries(
    Object.entries(map).sort((left, right) => Number(left[0]) - Number(right[0]))
  );

  return {
    toyAbilityEnumsByToyId: sortedByNumericKey,
    missing
  };
}

function buildPackMap() {
  return {
    turtle: 0,
    puppy: 1,
    star: 2,
    golden: 5,
    unicorn: 6,
    danger: 7
  };
}

function buildDefaults(replayEditorBackgrounds) {
  const backgroundId = parseId(replayEditorBackgrounds?.field);
  return {
    backgroundId: Number.isFinite(backgroundId) ? backgroundId : 0,
    mascotId: 18,
    cosmeticId: 0
  };
}

function buildSourceMetadata() {
  return {
    replayBotPets: "map_sources/replay_bot/pets.json",
    replayBotPerks: "map_sources/replay_bot/perks.json",
    replayBotToys: "map_sources/replay_bot/toys.json",
    replayBotRelicAbilityEnums: "map_sources/replay_bot/relic_ability_enums.json",
    replayEditorAnimals: "map_sources/replay_editor/animals.json",
    replayEditorAbilities: "map_sources/replay_editor/abilities.json",
    replayEditorPerks: "map_sources/replay_editor/perks.json",
    replayEditorBackgrounds: "map_sources/replay_editor/backgrounds.json"
  };
}

function main() {
  const replayBotPets = loadJson(SOURCE_PATHS.replayBotPets);
  const replayBotPerks = loadJson(SOURCE_PATHS.replayBotPerks);
  const replayBotToys = loadJson(SOURCE_PATHS.replayBotToys);
  const replayBotRelicAbilityEnums = loadJson(SOURCE_PATHS.replayBotRelicAbilityEnums);
  const replayEditorAnimals = loadJson(SOURCE_PATHS.replayEditorAnimals);
  const replayEditorAbilities = loadJson(SOURCE_PATHS.replayEditorAbilities);
  const replayEditorPerks = loadJson(SOURCE_PATHS.replayEditorPerks);
  const replayEditorBackgrounds = loadJson(SOURCE_PATHS.replayEditorBackgrounds);

  if (!Array.isArray(replayBotPets)) {
    throw new Error("Expected replay-bot pets.json to be an array");
  }
  if (!Array.isArray(replayBotPerks)) {
    throw new Error("Expected replay-bot perks.json to be an array");
  }
  if (!Array.isArray(replayBotToys)) {
    throw new Error("Expected replay-bot toys.json to be an array");
  }
  if (!replayBotRelicAbilityEnums || typeof replayBotRelicAbilityEnums !== "object") {
    throw new Error("Expected replay_bot relic_ability_enums.json to be an object");
  }

  const petMapResult = buildPetIdMap(replayBotPets, replayEditorAnimals);
  const perkMapResult = buildPerkIdMap(replayBotPerks, replayEditorPerks);
  const toyMapResult = buildToyIdMap(replayBotToys);
  const abilityMapResult = buildAbilityMapByPetId(
    replayBotPets,
    replayEditorAnimals,
    replayEditorAbilities
  );
  const toyAbilityMapResult = buildToyAbilityEnumMapByToyId(
    replayBotToys,
    replayBotRelicAbilityEnums
  );

  const output = {
    generatedAt: new Date().toISOString(),
    sources: buildSourceMetadata(),
    petIdsByName: petMapResult.petIdsByName,
    perkIdsByName: perkMapResult.perkIdsByName,
    toyIdsByName: toyMapResult.toyIdsByName,
    abilityIdsByPetId: abilityMapResult.abilityIdsByPetId,
    toyAbilityEnumsByToyId: toyAbilityMapResult.toyAbilityEnumsByToyId,
    packIdsByName: buildPackMap(),
    defaults: buildDefaults(replayEditorBackgrounds)
  };

  const fileText = [
    "// Auto-generated mapping data for SAP Calculator -> replay conversion.",
    "// Regenerate via scripts/generate_calculator_maps.js.",
    `const SAP_CALCULATOR_MAPS = ${JSON.stringify(output)};`,
    ""
  ].join("\n");

  fs.writeFileSync(MAP_OUTPUT_PATH, fileText, "utf8");

  console.log("Generated calculator maps:");
  console.log(`- petIdsByName: ${Object.keys(output.petIdsByName).length}`);
  console.log(`- perkIdsByName: ${Object.keys(output.perkIdsByName).length}`);
  console.log(`- toyIdsByName: ${Object.keys(output.toyIdsByName).length}`);
  console.log(`- abilityIdsByPetId: ${Object.keys(output.abilityIdsByPetId).length}`);
  console.log(`- toyAbilityEnumsByToyId: ${Object.keys(output.toyAbilityEnumsByToyId).length}`);
  console.log(`- pet map conflicts: ${petMapResult.conflicts.length}`);
  console.log(`- perk map conflicts: ${perkMapResult.conflicts.length}`);
  console.log(`- toy map conflicts: ${toyMapResult.conflicts.length}`);
  console.log(`- ability bridge misses: ${abilityMapResult.missingById.length}`);
  console.log(`- toy ability misses: ${toyAbilityMapResult.missing.length}`);

  if (petMapResult.conflicts.length > 0) {
    console.warn("Pet key conflicts (showing up to 10):", petMapResult.conflicts.slice(0, 10));
  }
  if (perkMapResult.conflicts.length > 0) {
    console.warn("Perk key conflicts (showing up to 10):", perkMapResult.conflicts.slice(0, 10));
  }
  if (toyMapResult.conflicts.length > 0) {
    console.warn("Toy key conflicts (showing up to 10):", toyMapResult.conflicts.slice(0, 10));
  }
  if (abilityMapResult.missingById.length > 0) {
    console.warn("Ability bridge misses (showing up to 10):", abilityMapResult.missingById.slice(0, 10));
  }
  if (toyAbilityMapResult.missing.length > 0) {
    console.warn("Toy ability misses (showing up to 10):", toyAbilityMapResult.missing.slice(0, 10));
  }
}

main();
