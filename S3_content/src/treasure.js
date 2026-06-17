const DEFAULT_RULES_DATA = Object.freeze({
  gear: [
    { name: "arrows", costGp: 1, quantityDie: "1d20", stackSize: 20, slots: 1, ammoType: "arrows" },
    { name: "backpack", costGp: 2, slots: 0 },
    { name: "caltrops", costGp: 0.5, slots: 1 },
    { name: "crossbow bolts", costGp: 1, quantityDie: "1d20", stackSize: 20, slots: 1, ammoType: "bolts" },
    { name: "crowbar", costGp: 0.5, slots: 1 },
    { name: "flask", costGp: 0.3, slots: 1 },
    { name: "bottle", costGp: 0.3, slots: 1 },
    { name: "flint and steel", costGp: 0.5, slots: 1 },
    { name: "gem", costGp: 14, slots: 1 },
    { name: "grappling hook", costGp: 1, slots: 1 },
    { name: "iron spikes", costGp: 1, quantityDie: "1d10", stackSize: 10, slots: 1 },
    { name: "lantern", costGp: 5, slots: 1, lightSource: "lantern", lit: false },
    { name: "mirror", costGp: 10, slots: 1 },
    { name: "oil flask", costGp: 0.5, slots: 1 },
    { name: "pole", costGp: 0.5, slots: 1 },
    { name: "rations", costGp: 0.5, stackSize: 3, slots: 1 },
    { name: "rope 60'", costGp: 1, slots: 1 },
    { name: "torch", costGp: 0.5, slots: 1, lightSource: "torch", lit: false }
  ],
  weapons: [
    { name: "bastard sword", costGp: 10, slots: 2, damage: "1d8", versatileDamage: "1d10" },
    { name: "club", costGp: 0.05, slots: 1, damage: "1d4" },
    { name: "crossbow", costGp: 8, slots: 1, damage: "1d6", ammoType: "bolts" },
    { name: "dagger", costGp: 1, slots: 1, damage: "1d4" },
    { name: "greataxe", costGp: 10, slots: 2, damage: "1d8", versatileDamage: "1d10" },
    { name: "javelin", costGp: 0.5, slots: 1, damage: "1d4" },
    { name: "longbow", costGp: 8, slots: 1, damage: "1d8", ammoType: "arrows" },
    { name: "longsword", costGp: 9, slots: 1, damage: "1d8" },
    { name: "mace", costGp: 5, slots: 1, damage: "1d6" },
    { name: "shortbow", costGp: 6, slots: 1, damage: "1d4", ammoType: "arrows" },
    { name: "shortsword", costGp: 7, slots: 1, damage: "1d6" },
    { name: "spear", costGp: 0.5, slots: 1, damage: "1d6" },
    { name: "staff", costGp: 0.5, slots: 1, damage: "1d4" },
    { name: "warhammer", costGp: 10, slots: 1, damage: "1d10" }
  ]
});

const NOUN_DISTANCE_WEIGHTS = Object.freeze([5, 4, 4, 3, 3, 3, 2, 2, 2, 1]);
const ADJECTIVE_DISTANCE_WEIGHTS = Object.freeze([20, 18, 16, 12, 9, 5, 4, 3, 2, 1]);
const ADJECTIVE_VALUE_MULTIPLIERS = Object.freeze([0.02, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]);

const TREASURE_TYPES = Object.freeze([
  {
    key: "herbs",
    weight: 10,
    baseValueGp: 0.4,
    nouns: ["rotten salt", "parsley", "oregano", "basil", "rosemary", "thyme", "mint", "dill", "pepper", "bay laurel", "lavender", "turmeric", "paprika", "cloves", "cardamom", "nutmeg", "cinnamon", "ginger", "vanilla", "saffron"],
    adjectives: ["rotten", "musty", "dry", "bitter", "fresh", "wild", "dryad's", "witch's", "saint's", "mythic"]
  },
  {
    key: "leather",
    weight: 10,
    baseValueGp: 10,
    nouns: ["scraps", "hide", "pelt", "tanned hide", "leather", "studded leather"],
    adjectives: ["ragged", "rough", "patched", "treated", "soft", "embossed", "fine", "ornate"]
  },
  {
    key: "clothing",
    weight: 10,
    baseValueGp: 0.6,
    nouns: ["neckerchief", "bandana", "socks", "apron", "skirt", "tunic", "cape", "cloak", "hat", "bonnet", "breeches", "robe", "costume", "boots", "dress", "gown"],
    adjectives: ["tattered", "orcish", "grass", "worn", "peasant", "hemp", "wool", "linen", "merchant", "fancy", "elven", "silk", "embroidered", "magical"]
  },
  {
    key: "dagger",
    weight: 10,
    baseValueGp: 1,
    nouns: ["shiv", "knife", "cleaver", "dirk", "stiletto", "kukri", "cutlass", "tanto", "kris", "wakizashi"],
    adjectives: ["fake", "rusty", "chipped", "bronze", "iron", "steel", "curved", "ornate", "ritual", "silver"]
  },
  {
    key: "shield",
    weight: 10,
    baseValueGp: 10,
    nouns: ["buckler", "hide shield", "wooden shield", "round shield", "heater shield", "kite shield", "tower shield", "wall shield"],
    adjectives: ["battered", "scarred", "patched", "reinforced", "sturdy", "etched", "blessed", "holy"]
  },
  {
    key: "instrument",
    weight: 10,
    baseValueGp: 5,
    nouns: ["horn", "pipe", "flute", "fiddle", "lute", "harp", "drum", "dulcimer", "lyre", "organ"],
    adjectives: []
  },
  {
    key: "chainmail",
    weight: 4,
    baseValueGp: 60,
    nouns: ["mail links", "ring mail", "chain shirt", "chainmail", "chain hauberk", "fine chainmail"],
    adjectives: ["rusted", "beaten", "oiled", "tempered", "reinforced", "sturdy", "elven", "forged"]
  },
  {
    key: "gems",
    weight: 10,
    baseValueGp: 14,
    nouns: ["quartz", "topaz", "garnet", "opal", "fire opal", "sapphire", "ruby", "emerald", "diamond"],
    adjectives: ["cloudy", "rough", "clear", "bright", "sparkling", "flawless", "cut", "glimmering", "radiant"]
  },
  {
    key: "platemail",
    weight: 1,
    baseValueGp: 130,
    nouns: ["breastplate", "cuirass", "half plate", "plate mail", "full plate", "full harness", "royal plate"],
    adjectives: ["dented", "polished", "reinforced", "engraved", "gold-inlaid", "ancient", "ceremonial", "ritual", "holy"]
  },
  {
    key: "jewels",
    weight: 10,
    baseValueGp: 39,
    nouns: ["buckle", "ring", "earrings", "brooch", "cloak pin", "bracelet", "necklace", "amulet", "medallion", "mask", "crown"],
    adjectives: ["counterfeit", "wood", "cloth", "leather", "bronze", "copper", "nickel", "silver", "gold", "diamond", "lunastone", "ceremonial", "ritual", "holy"]
  },
  { key: "weapon", weight: 15, equipmentTable: "weapons" },
  { key: "items", weight: 10, equipmentTable: "gear" },
  { key: "weapons", weight: 5, equipmentTable: "weapons" }
]);

const HERB_CONTAINERS = Object.freeze(["box", "pouch", "tin", "shaker", "sack"]);
const DIVINE_SUFFIXES = Object.freeze(["Saint Terrangis", "Gede", "Madeera", "Ord", "Memnon", "Ramlaat", "Shune"]);
const SPECIAL_SUFFIX_ADJECTIVES = new Set(["ceremonial", "holy", "ritual"]);

function clampLevel(level) {
  return Math.max(1, Math.min(10, Math.round(Number(level) || 1)));
}

function getScaledIndex(index, count) {
  if (count <= 1) {
    return 0;
  }
  return Math.max(0, Math.min(9, Math.round((index / (count - 1)) * 9)));
}

function getDungeonLevelIndex(level) {
  return clampLevel(level) - 1;
}

function getPositionWeight(index, count, level, profile) {
  const distance = Math.abs(getScaledIndex(index, count) - getDungeonLevelIndex(level));
  return profile[Math.max(0, Math.min(profile.length - 1, distance))] || 1;
}

function weightedPick(rng, entries, getWeight) {
  const weighted = entries
    .map((entry, index) => ({ entry, weight: Math.max(0, Number(getWeight(entry, index)) || 0) }))
    .filter((item) => item.weight > 0);
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!total) {
    return entries[0];
  }
  let roll = rng.nextFloat() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) {
      return item.entry;
    }
  }
  return weighted[weighted.length - 1].entry;
}

function rollQuantity(rng, die) {
  const match = String(die || "").match(/^1d(\d+)$/i);
  if (!match) {
    return 1;
  }
  return rng.nextInt(1, Number(match[1]));
}

function roundTreasureValue(valueGp) {
  const value = Math.max(0.01, Number(valueGp) || 0.01);
  if (value >= 1000) return Math.round(value / 100) * 100;
  if (value >= 100) return Math.round(value / 10) * 10;
  if (value >= 1) return Math.round(value);
  return Math.max(0.01, Math.round(value * 100) / 100);
}

function formatCoinLabelFromValue(valueGp) {
  const gp = Math.max(0, Number(valueGp) || 0);
  if (gp >= 1) return `${Math.round(gp)} gp`;
  const sp = Math.round(gp * 10);
  if (sp >= 1) return `${sp} sp`;
  return `${Math.max(1, Math.round(gp * 100))} cp`;
}

function getNounValueMultiplier(index, count) {
  return getPositionWeight(index, count, 10, NOUN_DISTANCE_WEIGHTS);
}

function getAdjectiveValueMultiplier(index, count) {
  const scaledIndex = getScaledIndex(index, count);
  return ADJECTIVE_VALUE_MULTIPLIERS[Math.max(0, Math.min(ADJECTIVE_VALUE_MULTIPLIERS.length - 1, scaledIndex))] || 1;
}

function buildHolySuffix(rng) {
  return `of ${weightedPick(rng, DIVINE_SUFFIXES, () => 1)}`;
}

function buildName(rng, category, adjective, noun) {
  if (category.key === "herbs") {
    const container = weightedPick(rng, HERB_CONTAINERS, () => 1);
    return `a ${container} of ${adjective ? `${adjective} ` : ""}${noun}`;
  }
  const base = adjective ? `${adjective} ${noun}` : noun;
  return SPECIAL_SUFFIX_ADJECTIVES.has(adjective) ? `${base} ${buildHolySuffix(rng)}` : base;
}

function getRulesData(state) {
  return state?.rulesData || state?.shadowdarkRules || DEFAULT_RULES_DATA;
}

function buildEquipmentTreasure(state, rng, tableName) {
  const rules = getRulesData(state);
  const table = Array.isArray(rules?.[tableName]) && rules[tableName].length
    ? rules[tableName]
    : DEFAULT_RULES_DATA[tableName];
  const item = weightedPick(rng, table, () => 1);
  const isSingleTorch = /^torch\b/i.test(String(item?.name || ""));
  const quantity = isSingleTorch ? 1 : rollQuantity(rng, item.quantityDie);
  const displayName = quantity > 1 ? `${item.name} x${quantity}` : item.name;
  const slots = Math.max(1, Number(item.slots ?? 1) || 1);
  return {
    kind: tableName === "weapons" ? "weapon" : "gear",
    name: displayName,
    value: roundTreasureValue((Number(item.costGp) || 0) * (quantity > 1 && item.stackSize ? quantity / item.stackSize : 1)),
    slots,
    bonusSlots: 0,
    priceless: false,
    description: "Dungeon equipment.",
    searchDc: null,
    gearItem: {
      ...item,
      name: item.name,
      quantity,
      totalUnits: quantity,
      slots,
      value: Number(item.costGp) || 0,
      lit: item.lit === true
    }
  };
}

function buildTypedTreasure(state, rng, category) {
  const level = clampLevel(state?.level);
  const noun = weightedPick(rng, category.nouns, (value, index) => getPositionWeight(index, category.nouns.length, level, NOUN_DISTANCE_WEIGHTS));
  const nounIndex = Math.max(0, category.nouns.indexOf(noun));
  const adjective = category.adjectives?.length
    ? weightedPick(rng, category.adjectives, (value, index) => getPositionWeight(index, category.adjectives.length, level, ADJECTIVE_DISTANCE_WEIGHTS))
    : "";
  const adjectiveIndex = adjective ? Math.max(0, category.adjectives.indexOf(adjective)) : -1;
  const nounMultiplier = getNounValueMultiplier(nounIndex, category.nouns.length);
  const adjectiveMultiplier = adjectiveIndex >= 0 ? getAdjectiveValueMultiplier(adjectiveIndex, category.adjectives.length) : 1;
  const value = roundTreasureValue(category.baseValueGp * nounMultiplier * adjectiveMultiplier);
  return {
    kind: category.key,
    name: buildName(rng, category, adjective, noun),
    value,
    slots: category.key === "platemail" ? 3 : category.key === "chainmail" ? 2 : 1,
    bonusSlots: 0,
    priceless: false,
    description: "",
    searchDc: null
  };
}

function buildCoinTreasure(state, rng) {
  const level = clampLevel(state?.level);
  const goldGp = Math.max(0, level > 1 ? rng.nextInt(0, level * 6) : rng.nextInt(0, 3));
  const silverSp = rng.nextInt(1, 30 + level * 5);
  const copperCp = rng.nextInt(0, 99);
  const value = roundTreasureValue(goldGp + silverSp / 10 + copperCp / 100);
  const dominant = goldGp > 0 ? "g.p." : silverSp >= copperCp ? "s.p." : "c.p.";
  return {
    kind: "coin-cache",
    name: `${dominant} pouch`,
    value,
    slots: Math.max(0, Math.ceil(Math.max(0, (goldGp * 100) + (silverSp * 10) + copperCp - 100) / 100)),
    bonusSlots: 0,
    priceless: false,
    description: `Coins: ${goldGp} gp, ${silverSp} sp, ${copperCp} cp.`,
    searchDc: null,
    coinBreakdown: { gold: goldGp, silver: silverSp, copper: copperCp }
  };
}

export function createTreasureDetails(state, rng) {
  if (rng.nextFloat() < 0.18) {
    return buildCoinTreasure(state, rng);
  }
  const category = weightedPick(rng, TREASURE_TYPES, (entry) => entry.weight);
  if (category.equipmentTable) {
    return buildEquipmentTreasure(state, rng, category.equipmentTable);
  }
  return buildTypedTreasure(state, rng, category);
}

export function formatTreasureValue(valueGp) {
  return formatCoinLabelFromValue(roundTreasureValue(valueGp));
}
