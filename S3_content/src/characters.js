const ABILITY_KEYS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const MAX_EDITABLE_VALUE = 99;
const MAX_COIN_VALUE = 2000;
const SHADOWDARK_LANGUAGES = [
  "Dwarvish",
  "Elvish",
  "Giant",
  "Goblin",
  "Merran",
  "Orcish",
  "Reptilian",
  "Sylvan",
  "Thanian"
];

function clampInRange(value, min, max, fallback = min) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, fallback));
  }
  return Math.max(min, Math.min(max, parsed));
}

function inferGearItemSlots(name, item = {}) {
  const normalizedName = String(name || "").toLowerCase();
  const treasureKind = String(item?.treasureKind || item?.kind || "").toLowerCase();
  if (item?.treasureItem === true || treasureKind) {
    if (treasureKind === "herbs" || treasureKind === "clothing" || treasureKind === "jewels") {
      return 0;
    }
    if (treasureKind === "platemail") {
      return 3;
    }
    if (treasureKind === "chainmail") {
      return 2;
    }
    if (treasureKind === "leather") {
      return 1;
    }
  }
  if (/\bplate\s*(?:mail|armor)?\b/.test(normalizedName)) {
    return 3;
  }
  if (/(?:chainmail|bastard\s+sword|greatsword|greataxe)/.test(normalizedName)) {
    return 2;
  }
  return 1;
}

function hasHaulerTalent(raw = {}) {
  const haystack = [
    ...(Array.isArray(raw?.levels) ? raw.levels : []).map((level) => `${level?.talentRolledName || ""} ${level?.talentRolledDesc || ""}`),
    ...(Array.isArray(raw?.bonuses) ? raw.bonuses : []).map((bonus) => `${bonus?.bonusName || bonus?.name || ""} ${bonus?.bonusTo || ""}`),
    ...(Array.isArray(raw?.talents) ? raw.talents : [])
  ].join(" ");
  return /\bhauler\b/i.test(haystack);
}

function getGearSlotCapacity(stats = {}, className = "", raw = {}) {
  const strCapacity = clampInRange(stats?.STR, 10, 20, 10);
  const isFighter = /\bfighter\b/i.test(String(className || raw?.className || raw?.class || ""));
  const conModifier = Math.max(0, abilityModifier(stats?.CON));
  return strCapacity + (isFighter && hasHaulerTalent(raw) ? conModifier : 0);
}

function getSlotsFromGear(gear, excludeFreeBackpack = true) {
  const normalizedGear = Array.isArray(gear) ? gear : [];
  let backpackUsedForFreeCarry = false;
  let slotsUsed = 0;
  let freeCarry = [];

  function getUnits(item, isBackpack, backpackReserved, remainingUnits) {
    if (!isBackpack || !excludeFreeBackpack) {
      return remainingUnits;
    }
    if (backpackReserved) {
      return remainingUnits;
    }
    return Math.max(0, remainingUnits - 1);
  }

  function inferGroupSize(name) {
    const normalizedName = name.toLowerCase();
    if (normalizedName.includes("arrow") || normalizedName.includes("bolt")) {
      return 20;
    }
    if (normalizedName.includes("ration")) {
      return 3;
    }
    return 1;
  }

  for (const item of normalizedGear) {
    const name = normalizeName(item?.name, false) || "Gear";
    const isBackpack = name.toLowerCase() === "backpack";
    const normalizedName = name.toLowerCase();
    const isTorch = normalizedName === "torch" || normalizedName.startsWith("torch ");
    const stackSize = inferGroupSize(name);
    const units = Number.isFinite(Number(item?.totalUnits))
      ? Math.max(0, Math.floor(Number(item.totalUnits)))
      : Number.isFinite(Number(item?.quantity))
        ? Math.max(0, Math.floor(Number(item.quantity)))
        : 1;

    if (!units) {
      continue;
    }

    let chargeForSlots = getUnits(name, isBackpack, backpackUsedForFreeCarry, units);
    if (excludeFreeBackpack && isBackpack && !backpackUsedForFreeCarry) {
      backpackUsedForFreeCarry = true;
      freeCarry.push(name);
    }
    if (stackSize > 1) {
      slotsUsed += Math.max(1, Math.ceil(chargeForSlots / stackSize));
      continue;
    }

    const perUnitSlots = isTorch ? 1 : inferGearItemSlots(name, item);
    slotsUsed += chargeForSlots * perUnitSlots;
  }

  return {
    usedSlots: slotsUsed,
    freeCarry
  };
}

function normalizeName(value, stripExtraSpaces = true) {
  const text = String(value || "");
  return stripExtraSpaces
    ? text.replace(/\s+/g, " ").trim()
    : text;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampInt(value, min, max, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, fallback));
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeAbilityScores(raw = {}) {
  return ABILITY_KEYS.reduce((scores, key) => {
    scores[key] = clampInt(raw[key], 1, MAX_EDITABLE_VALUE, 10);
    return scores;
  }, {});
}

function abilityModifier(score) {
  return Math.max(-4, Math.min(4, Math.floor((Number(score) - 10) / 2)));
}

function findGearUnits(gear, matcher) {
  return (Array.isArray(gear) ? gear : []).reduce((total, item) => {
    const name = String(item?.name || "").toLowerCase();
    if (!matcher(name, item)) {
      return total;
    }
    const units = Number.isFinite(Number(item?.totalUnits)) && Number(item.totalUnits) > 0
      ? Number(item.totalUnits)
      : Number(item?.quantity) > 0
        ? Number(item.quantity)
        : 0;
    return total + Math.max(0, Math.floor(units));
  }, 0);
}

function normalizeTextList(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.filter(Boolean).map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof rawValue === "string") {
    return rawValue.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function normalizeLanguageList(rawLanguages) {
  const values = Array.isArray(rawLanguages)
    ? rawLanguages
    : String(rawLanguages || "").split(/[,\n]+/)
        .map((entry) => normalizeName(entry))
        .filter(Boolean);
  const normalizedSet = new Set();
  const uniqueLanguages = [];
  const lowerUsed = new Set(
    SHADOWDARK_LANGUAGES.map((language) => language.toLowerCase())
  );

  for (const value of values) {
    const language = normalizeName(value);
    if (!language) {
      continue;
    }
    const lower = language.toLowerCase();
    if (!normalizedSet.has(lower)) {
      normalizedSet.add(lower);
      uniqueLanguages.push(language);
      continue;
    }

    const fallback = SHADOWDARK_LANGUAGES
      .find((candidate) => !normalizedSet.has(candidate.toLowerCase()) && lowerUsed.has(candidate.toLowerCase()));
    if (fallback) {
      normalizedSet.add(fallback.toLowerCase());
      uniqueLanguages.push(fallback);
    }
  }

  return uniqueLanguages.join(", ");
}

function parseMoneyInput(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function normalizeMoney(raw) {
  const hasExplicitMoney = raw && (
    raw.gold !== undefined || raw.silver !== undefined || raw.copper !== undefined
  );
  if (hasExplicitMoney) {
    return {
      gold: Math.max(0, Math.min(MAX_COIN_VALUE, parseMoneyInput(raw.gold) ?? 0)),
      silver: Math.max(0, Math.min(MAX_COIN_VALUE, parseMoneyInput(raw.silver) ?? 0)),
      copper: Math.max(0, Math.min(MAX_COIN_VALUE, parseMoneyInput(raw.copper) ?? 0))
    };
  }

  const ledger = Array.isArray(raw?.ledger) ? raw.ledger : [];
  const goldRolled = parseMoneyInput(raw?.goldRolled);
  if (goldRolled !== null) {
    let copper = goldRolled * 100;
    for (const entry of ledger) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const goldDelta = Number.parseInt(entry?.goldChange, 10) || 0;
      const silverDelta = Number.parseInt(entry?.silverChange, 10) || 0;
      const copperDelta = Number.parseInt(entry?.copperChange, 10) || 0;
      copper += goldDelta * 100 + silverDelta * 10 + copperDelta;
    }
    copper = Math.max(0, Math.floor(copper));
    return {
      gold: Math.floor(copper / 100),
      silver: Math.floor((copper % 100) / 10),
      copper: copper % 10
    };
  }

  return { gold: 0, silver: 0, copper: 0 };
}

function getCoinTotal(money = {}) {
  const gold = Math.max(0, Number(money.gold) || 0);
  const silver = Math.max(0, Number(money.silver) || 0);
  const copper = Math.max(0, Number(money.copper) || 0);
  return gold + silver + copper;
}

function getCoinBagSlots(money = {}) {
  return Math.ceil(Math.max(0, getCoinTotal(money) - 100) / 100);
}

function normalizeAmmo(gear, raw = {}) {
  const ammo = {};
  const arrowsFromGear = findGearUnits(gear, (name) => name.includes("arrow") && !name.includes("bolt"));
  const boltsFromGear = findGearUnits(gear, (name) => name.includes("bolt"));

  if (arrowsFromGear > 0) {
    ammo.arrows = clampInt(arrowsFromGear, 0, MAX_EDITABLE_VALUE, 0);
  } else if (raw?.ammo && Object.prototype.hasOwnProperty.call(raw.ammo, "arrows")) {
    ammo.arrows = clampInt(raw.ammo.arrows, 0, MAX_EDITABLE_VALUE, 0);
  } else if (raw && Object.prototype.hasOwnProperty.call(raw, "arrows")) {
    ammo.arrows = clampInt(raw.arrows, 0, MAX_EDITABLE_VALUE, 0);
  }

  if (boltsFromGear > 0) {
    ammo.bolts = clampInt(boltsFromGear, 0, MAX_EDITABLE_VALUE, 0);
  } else if (raw?.ammo && Object.prototype.hasOwnProperty.call(raw.ammo, "bolts")) {
    ammo.bolts = clampInt(raw.ammo.bolts, 0, MAX_EDITABLE_VALUE, 0);
  } else if (raw && Object.prototype.hasOwnProperty.call(raw, "bolts")) {
    ammo.bolts = clampInt(raw.bolts, 0, MAX_EDITABLE_VALUE, 0);
  }

  return ammo;
}

function normalizeCharacterSource(raw = {}, index = 0) {
  const normalizedRaw = clonePlain(raw);
  const stats = normalizeAbilityScores(raw.stats || {});
  const rolledStats = normalizeAbilityScores(raw.rolledStats || raw.stats || {});
  const gear = Array.isArray(raw.gear) ? clonePlain(raw.gear) : [];
  const languageString = normalizeLanguageList(raw.languages);
  const money = normalizeMoney(raw);
  const maxHitPoints = clampInt(raw.maxHitPoints ?? raw.hp ?? 1, 0, MAX_EDITABLE_VALUE, 1);
  const hp = clampInt(raw.hp ?? maxHitPoints, 0, maxHitPoints, maxHitPoints);
  const armorClass = clampInt(raw.armorClass ?? raw.ac ?? 10, 0, MAX_EDITABLE_VALUE, 10);
  const baseArmorClass = clampInt(raw.baseArmorClass ?? raw.rawBaseArmorClass ?? raw.armorClass ?? raw.ac ?? 10, 0, MAX_EDITABLE_VALUE, 10);
  const gearSlotsTotal = getGearSlotCapacity(stats, raw.class || raw.className || "", raw);
  const computedSlots = getSlotsFromGear(gear, true);
  const gearSlotsUsed = clampInt(computedSlots.usedSlots + getCoinBagSlots(money), 0, gearSlotsTotal, 0);
  const ammo = normalizeAmmo(gear, raw);
  const rawName = typeof raw.name === "string" ? raw.name.trim() : "";
  const name = rawName || `Character ${index + 1}`;
  normalizedRaw.languages = languageString;
  normalizedRaw.gold = money.gold;
  normalizedRaw.silver = money.silver;
  normalizedRaw.copper = money.copper;
  normalizedRaw.ammo = ammo;
  normalizedRaw.lightHidden = raw.lightHidden === true;
  normalizedRaw.baseArmorClass = baseArmorClass;
  normalizedRaw.baseAttacks = Array.isArray(raw.baseAttacks)
    ? clonePlain(raw.baseAttacks)
    : Array.isArray(raw.rawBaseAttacks)
      ? clonePlain(raw.rawBaseAttacks)
      : Array.isArray(raw.attacks)
        ? clonePlain(raw.attacks)
        : [];
  normalizedRaw.shieldReadied = raw.shieldReadied !== false;
  if (Object.prototype.hasOwnProperty.call(ammo, "arrows")) {
    normalizedRaw.arrows = ammo.arrows;
  }
  if (Object.prototype.hasOwnProperty.call(ammo, "bolts")) {
    normalizedRaw.bolts = ammo.bolts;
  }

  return {
    id: raw.id || `character-${index + 1}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    slain: raw.slain === true,
    dead: raw.dead === true || raw.slain === true,
    dyingRounds: clampInt(raw.dyingRounds ?? 0, 0, MAX_EDITABLE_VALUE, 0),
    active: raw.active === true,
    colorId: raw.colorId || "",
    guarding: raw.guarding === true,
    x: raw.x === null || raw.x === undefined ? null : Number.isFinite(Number(raw.x)) ? Number(raw.x) : null,
    y: raw.y === null || raw.y === undefined ? null : Number.isFinite(Number(raw.y)) ? Number(raw.y) : null,
    roomId: raw.roomId || null,
    hp,
    maxHitPoints,
    armorClass,
    baseArmorClass,
    shieldReadied: raw.shieldReadied !== false,
    ammo,
    arrows: Object.prototype.hasOwnProperty.call(ammo, "arrows") ? ammo.arrows : undefined,
    bolts: Object.prototype.hasOwnProperty.call(ammo, "bolts") ? ammo.bolts : undefined,
    stats,
    rolledStats,
    ancestry: raw.ancestry || "",
    className: raw.class || raw.className || "",
    level: clampInt(raw.level ?? 1, 1, MAX_EDITABLE_VALUE, 1),
    XP: clampInt(raw.XP ?? raw.xp ?? 0, 0, MAX_EDITABLE_VALUE, 0),
    title: raw.title || "",
    alignment: raw.alignment || "",
    background: raw.background || "",
    deity: raw.deity || "",
    gearSlotsTotal,
    gearSlotsUsed,
    spellsKnown: raw.spellsKnown || "",
    failedSpellKeys: Array.isArray(raw.failedSpellKeys) ? clonePlain(raw.failedSpellKeys) : [],
    lightSource: raw.lightSource || "",
    lightRadius: Number.isFinite(Number(raw.lightRadius)) ? Number(raw.lightRadius) : 0,
    lightHidden: raw.lightHidden === true,
    languages: languageString,
    gold: money.gold,
    silver: money.silver,
    copper: money.copper,
    creationMethod: raw.creationMethod || "",
    coreRulesOnly: raw.coreRulesOnly === true,
    activeSources: Array.isArray(raw.activeSources) ? clonePlain(raw.activeSources) : [],
    bonuses: Array.isArray(raw.bonuses) ? clonePlain(raw.bonuses) : [],
    gear,
    treasures: Array.isArray(raw.treasures) ? clonePlain(raw.treasures) : [],
    magicItems: Array.isArray(raw.magicItems) ? clonePlain(raw.magicItems) : [],
    baseAttacks: Array.isArray(normalizedRaw.baseAttacks) ? clonePlain(normalizedRaw.baseAttacks) : [],
    attacks: Array.isArray(raw.attacks) ? clonePlain(raw.attacks) : [],
    ledger: Array.isArray(raw.ledger) ? clonePlain(raw.ledger) : [],
    levels: Array.isArray(raw.levels) ? clonePlain(raw.levels) : [],
    ambitionTalentLevel: raw.ambitionTalentLevel ? clonePlain(raw.ambitionTalentLevel) : null,
    edits: Array.isArray(raw.edits) ? clonePlain(raw.edits) : [],
    raw: normalizedRaw
  };
}

export function abilityScoreModifier(score) {
  return abilityModifier(score);
}

export function getCharacterActionModifier(character, action) {
  if (!character) {
    return 0;
  }
  if (action === "break") {
    return abilityModifier(character.stats?.STR);
  }
  if (action === "search") {
    return abilityModifier(character.stats?.WIS);
  }
  return abilityModifier(character.stats?.DEX);
}

export function getCharacterGearFreeSlots(character) {
  if (!character) {
    return 0;
  }
  const gearCapacity = getGearSlotCapacity(character?.stats || {}, character?.className || "", character);
  const usedSlots = Number(character.gearSlotsUsed || 0);
  return Math.max(0, Number(gearCapacity) - usedSlots);
}

export function getCharacterAttackSummary(character) {
  if (!character?.attacks?.length) {
    return "None";
  }
  return character.attacks.join("; ");
}

export function getCharacterAmmo(character, type) {
  return clampInt(character?.ammo?.[type] ?? 0, 0, MAX_EDITABLE_VALUE, 0);
}

export function hasCharacterAmmo(character, type) {
  return Object.prototype.hasOwnProperty.call(character?.ammo || {}, type) || findGearUnits(character?.gear, (name) => {
    if (type === "arrows") {
      return name.includes("arrow") && !name.includes("bolt");
    }
    return name.includes("bolt");
  }) > 0;
}

export function getCharacterDisplayHeader(character) {
  if (!character) {
    return "";
  }
  return [
    character.name,
    character.ancestry,
    `${character.className || "Class"} ${character.level || 1}`,
    `AC ${character.armorClass}`
  ].filter(Boolean).join(" | ");
}

export function getCharacterAttackText(character) {
  if (!character?.attacks?.length) {
    return "None";
  }
  return character.attacks.map((attack) => String(attack).replace(/^ATTACKS?:\s*/i, "")).join("; ");
}

export function getCharacterSpellText(character) {
  const spells = normalizeTextList(character?.spellsKnown);
  if (!spells.length) {
    return "None";
  }
  return spells.join(", ");
}

export function getCharacterGearText(character) {
  if (!character?.gear?.length) {
    return "None";
  }
  return character.gear.map((item) => {
    const quantity = Number(item?.totalUnits ?? item?.quantity ?? 1) || 1;
    return quantity > 1 ? `${item.name} x${quantity}` : item.name;
  }).join(", ");
}

export function getCharacterAmmoEntries(character) {
  return ["arrows", "bolts"]
    .filter((type) => hasCharacterAmmo(character, type))
    .map((type) => ({
      type,
      label: type === "arrows" ? "Arrows" : "Bolts",
      value: getCharacterAmmo(character, type)
    }));
}

export function getCharacterStatSummary(character) {
  if (!character) {
    return "";
  }
  return [
    `${character.name}`,
    character.ancestry || "Unknown",
    `${character.className || "Class"} ${character.level || 1}`,
    `AC ${character.armorClass}`,
    `HP ${character.hp}`
  ].join(" | ");
}

export function getCharacterRuleText(character) {
  const lines = [];
  if (character?.attacks?.length) {
    lines.push(`Attacks: ${getCharacterAttackText(character)}`);
  }
  const spellText = getCharacterSpellText(character);
  if (spellText !== "None") {
    lines.push(`Spells: ${spellText}`);
  }
  return lines.join("\n");
}

export function getCharacterCoinTotal(character) {
  return getCoinTotal(character || {});
}

export function getCharacterCoinBagSlots(character) {
  return getCoinBagSlots(character || {});
}

export function extractShadowdarkCharacters(text) {
  const source = String(text || "").trim();
  if (!source) {
    return [];
  }

  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((entry, index) => (entry && typeof entry === "object" && !Array.isArray(entry) ? [normalizeCharacterSource(entry, index)] : []));
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [normalizeCharacterSource(parsed, 0)] : [];
  } catch {
    const docs = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{" || char === "[") {
        if (depth === 0) {
          start = index;
        }
        depth += 1;
      } else if (char === "}" || char === "]") {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          docs.push(source.slice(start, index + 1));
          start = -1;
        }
      }
    }

    return docs.flatMap((doc, index) => {
      try {
        const parsed = JSON.parse(doc);
        if (Array.isArray(parsed)) {
          return parsed.flatMap((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? [normalizeCharacterSource(entry, index)] : []));
        }
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [normalizeCharacterSource(parsed, index)] : [];
      } catch {
        return [];
      }
    });
  }
}

export function normalizeCharacterState(state) {
  const characters = Array.isArray(state?.characters)
    ? state.characters.map((character, index) => normalizeCharacterSource(character, index))
    : [];
  for (const character of characters) {
    const gearCapacity = getGearSlotCapacity(character?.stats || {}, character?.className || "", character);
    if (character.gearSlotsTotal !== gearCapacity) {
      character.gearSlotsTotal = gearCapacity;
    }
    character.gearSlotsUsed = clampInt(character.gearSlotsUsed || 0, 0, character.gearSlotsTotal, 0);
  }
  state.characters = characters;
  if (!state.activeCharacterId || !characters.some((character) => character.id === state.activeCharacterId)) {
    state.activeCharacterId = characters[0]?.id || null;
  }
  const livingFreeSlots = characters
    .filter((character) => !character.slain)
    .reduce((total, character) => total + getCharacterGearFreeSlots(character), 0);
  if (!state.inventory) {
    state.inventory = { baseSlots: 10, bonusSlots: 0, usedSlots: 0 };
  }
  state.inventory.baseSlots = characters.length ? Math.max(0, livingFreeSlots) : 0;
  return state;
}

export function getActiveCharacter(state) {
  if (!state) {
    return null;
  }
  return state.characters?.find((character) => character.id === state.activeCharacterId) || state.characters?.[0] || null;
}

export function setActiveCharacter(state, characterId) {
  state.activeCharacterId = characterId || null;
  return getActiveCharacter(state);
}

export function setCharacterHp(character, nextHp) {
  if (!character) {
    return null;
  }
  const maxHitPoints = clampInt(character.maxHitPoints, 0, MAX_EDITABLE_VALUE, character.hp || 0);
  character.maxHitPoints = maxHitPoints;
  character.hp = clampInt(nextHp, 0, maxHitPoints, character.hp || 0);
  if (!character.raw || typeof character.raw !== "object") {
    character.raw = {};
  }
  if (character.hp <= 0 && character.dead !== true && !character.dyingRounds) {
    const conModifier = abilityModifier(character.stats?.CON);
    character.dyingRounds = Math.max(1, Math.floor(Math.random() * 4) + 1 + conModifier);
  } else if (character.hp > 0) {
    character.dyingRounds = 0;
    character.dead = false;
    character.slain = false;
  }
  character.raw.hp = character.hp;
  character.raw.maxHitPoints = character.maxHitPoints;
  character.raw.dyingRounds = character.dyingRounds || 0;
  character.raw.dead = character.dead === true;
  character.raw.slain = character.slain === true;
  return character;
}

export function decrementCharacterDyingRounds(character) {
  if (!character || character.dead === true) {
    return character;
  }
  character.dyingRounds = clampInt(character.dyingRounds ?? 0, 0, MAX_EDITABLE_VALUE, 0);
  if (character.dyingRounds > 0) {
    character.dyingRounds -= 1;
  }
  if (character.dyingRounds <= 0) {
    character.dyingRounds = 0;
    character.dead = true;
    character.slain = true;
  }
  return character;
}

export function setCharacterAmmo(character, type, nextValue) {
  if (!character) {
    return null;
  }
  if (!character.ammo) {
    character.ammo = { arrows: 0, bolts: 0 };
  }
  character.ammo[type] = clampInt(nextValue, 0, MAX_EDITABLE_VALUE, character.ammo[type] || 0);
  character[type] = character.ammo[type];
  if (!character.raw || typeof character.raw !== "object") {
    character.raw = {};
  }
  character.raw.ammo = character.raw.ammo || {};
  character.raw.ammo[type] = character.ammo[type];
  character.raw[type] = character.ammo[type];
  return character;
}

export function markCharacterSlain(character) {
  if (character) {
    character.dead = true;
    character.dyingRounds = 0;
    character.slain = true;
  }
  return character;
}
