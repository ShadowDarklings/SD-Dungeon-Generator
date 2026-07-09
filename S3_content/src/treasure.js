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
const COIN_POUCH_DENOMINATION_WEIGHTS = Object.freeze([
  { copper: 25, silver: 25, gold: 50 },
  { copper: 20, silver: 20, gold: 60 },
  { copper: 10, silver: 25, gold: 65 },
  { copper: 10, silver: 15, gold: 75 },
  { copper: 5, silver: 15, gold: 80 },
  { copper: 5, silver: 10, gold: 85 },
  { copper: 5, silver: 7.5, gold: 92 },
  { copper: 5, silver: 5, gold: 90 },
  { copper: 2.5, silver: 5, gold: 92.5 },
  { copper: 2.5, silver: 2.5, gold: 95 }
]);

const TREASURE_TYPES = Object.freeze([
  {
    key: "herbs",
    weight: 10,
    valueRangeGp: [0.03, 20],
    nouns: ["salt", "parsley", "oregano", "basil", "rosemary", "thyme", "mint", "dill", "pepper", "bay laurel", "lavender", "turmeric", "paprika", "cloves", "cardamom", "nutmeg", "cinnamon", "ginger", "vanilla", "saffron"],
    adjectives: ["rotten", "moldy", "bitter", "goblin", "witch's", "old", "dried", "powdered", "minotaur", "crushed", "fresh", "elven", "druid's", "dryad's", "fragrant", "aromatic", "halfling", "enchanted"]
  },
  {
    key: "leather",
    weight: 10,
    valueRangeGp: [5, 1000],
    nouns: ["padded", "hide", "hardened cloth", "leather", "studded leather", "hardened leather", "bone armor", "wooden armor"],
    adjectives: ["broken", "mildewy", "costume", "cursed", "goblin", "halfling", "orcish", "spiked", "knight's", "masterwork", "inlaid", "ceremonial", "elven", "holy"]
  },
  {
    key: "clothing",
    weight: 10,
    valueRangeGp: [0.1, 50],
    nouns: ["neckerchief", "bandana", "handkerchief", "underwear", "socks", "apron", "skirt", "mask", "tunic", "cape", "cloak", "hat", "bra", "turban", "bonnet", "breeches", "robe", "costume", "lingerie", "boots", "dress", "gown"],
    adjectives: ["beggar's", "threadbare", "stained", "dirty", "tattered", "grass", "worn", "torn", "hide", "peasant", "weathered", "hemp", "wool", "rain-proof", "leather", "deerskin", "linen", "adventurer's", "merchant's", "fur", "fancy", "silk", "embroidered", "ceremonial", "royal"]
  },
  {
    key: "dagger",
    weight: 10,
    valueRangeGp: [0.1, 100],
    nouns: ["shiv", "spike", "knife", "cleaver", "dagger", "dirk", "stiletto", "kukri", "cutlass", "tanto", "kris", "wakizashi"],
    adjectives: ["fake", "rusty", "chipped", "bronze", "copper", "iron", "steel", "curved", "ornate", "ritual", "silver", "obsidian"],
    valueOverrides: {
      "fake|shiv": 0.1,
      "iron|dirk": 1,
      "silver|shiv": 100
    }
  },
  {
    key: "shield",
    weight: 10,
    valueRangeGp: [1, 1000],
    nouns: ["turtle shell", "buckler", "shield", "round shield", "kite shield", "tower shield"],
    adjectives: ["broken", "rusty", "dented", "costume", "cursed", "copper", "bronze", "iron", "spiked", "steel", "knight's", "masterwork", "inlaid", "ceremonial"]
  },
  {
    key: "instrument",
    weight: 10,
    valueRangeGp: [0.5, 5000],
    nouns: ["lute", "flute", "drum", "horn", "trumpet", "harp", "hurdy-gurdy", "fife", "bagpipes", "tambourine", "pan flute", "shawm", "viol", "recorder", "ocarina", "lyre", "mandolin", "sitar", "zither", "dulcimer", "accordion", "maraca", "marimba", "castanets", "gong", "cymbal", "crwth", "theorbo", "bandora", "sludra", "coronet", "psaltery", "crumhorn", "chalumeau", "clarinet", "bassoon", "oud", "ney", "qanun", "daf", "djembe", "tar", "zurna", "riq", "guqin", "guzheng", "pipa", "erhu", "dizi", "sheng", "koto", "biwa", "shakuhachi", "shamisen", "gayageum", "haegeum", "suona", "bianzhong", "tabla", "sarangi", "tambura", "sarod", "kora", "mbira", "kalimba", "angklung", "didgeridoo", "tama", "balafon", "shekere", "udu", "algaita", "siku", "quena", "teponaztli", "huehuetl", "ayotl", "gamelan gong", "bonang gong", "kempul gong"],
    adjectives: ["beggar's", "broken", "out of tune", "cursed", "goblin", "worn", "student", "rustic", "bard's", "polished", "resonant", "lacquered", "fine", "antique", "varnished", "ornate", "pristine", "masterwork", "exquisite", "elven", "ritual", "holy", "magic"]
  },
  {
    key: "chainmail",
    weight: 4,
    valueRangeGp: [5, 2000],
    nouns: ["chain shirt", "scale mail", "chainmail", "breastplate", "ringmail", "hauberk"],
    adjectives: ["broken", "rusty", "dented", "costume", "cursed", "goblin", "copper", "bronze", "iron", "orcish", "spiked", "steel", "elven", "knight's", "masterwork", "inlaid", "ceremonial", "dwarven"]
  },
  {
    key: "gems",
    weight: 10,
    valueRangeGp: [10, 10000],
    nouns: ["quartz", "topaz", "garnet", "opal", "fire opal", "sapphire", "ruby", "emerald", "diamond"],
    adjectives: ["dull", "flawed", "chipped", "rough", "cloudy", "polished", "shiny", "bright", "sparkling", "brilliant", "flawless", "enchanted", "holy", "radiant"],
    valueOverrides: {
      "cloudy|quartz": 10,
      "radiant|quartz": 500,
      "cloudy|sapphire": 100,
      "bright|sapphire": 500,
      "radiant|sapphire": 5000,
      "cloudy|diamond": 50,
      "radiant|diamond": 10000
    }
  },
  {
    key: "platemail",
    weight: 1,
    valueRangeGp: [65, 10000],
    nouns: ["lamellar", "splint", "breastplate", "plate mail", "full plate", "half plate", "cuirass", "brigandine", "banded mail", "gothic plate", "royal plate"],
    adjectives: ["broken", "rusty", "dented", "bent", "costume", "cursed", "copper", "tarnished", "bronze", "goblin", "iron", "orcish", "spiked", "steel", "knight's", "polished", "fire forged", "masterwork", "elven", "inlaid", "ceremonial", "dwarven", "holy"],
    valueOverrides: {
      "dented|breastplate": 65,
      "holy|royal plate": 10000
    }
  },
  {
    key: "jewels",
    weight: 10,
    valueRangeGp: [20, 20000],
    nouns: ["buckle", "brooch", "spittoon", "flagon", "scabbard", "mask", "flask", "dentures", "prosthetic hand", "torc", "choker", "candlestick", "earrings", "cloak pin", "goblet", "bracelet", "necklace", "gavel", "reliquary", "orb", "ring", "diadem", "tiara", "amulet", "crown"],
    adjectives: ["beggar's", "broken", "counterfeit", "tarnished", "lead", "wooden", "copper", "pewter", "tin", "bronze", "nickel", "silver", "quartz", "topaz", "garnet", "opal", "ornate", "fire opal", "ancient", "gold", "emerald", "ruby", "sapphire", "diamond", "royal", "holy"],
    valueOverrides: {
      "counterfeit|crown": 20,
      "holy|crown": 20000
    }
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

function normalizeTreasureKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getLinearRank(index, count) {
  if (count <= 1) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, index / (count - 1)));
}

function getTypedTreasureValue(category, adjective, adjectiveIndex, noun, nounIndex) {
  const overrideKey = `${normalizeTreasureKey(adjective)}|${normalizeTreasureKey(noun)}`;
  if (Object.prototype.hasOwnProperty.call(category.valueOverrides || {}, overrideKey)) {
    return roundTreasureValue(category.valueOverrides[overrideKey]);
  }
  const range = Array.isArray(category.valueRangeGp) ? category.valueRangeGp : [category.baseValueGp || 1, (category.baseValueGp || 1) * 100];
  const min = Math.max(0.01, Number(range[0]) || 0.01);
  const max = Math.max(min, Number(range[1]) || min);
  const nounRank = getLinearRank(nounIndex, category.nouns.length);
  const adjectiveRank = adjectiveIndex >= 0 ? getLinearRank(adjectiveIndex, category.adjectives.length) : nounRank;
  const quality = Math.max(0, Math.min(1, (nounRank * 0.45) + (adjectiveRank * 0.55)));
  return roundTreasureValue(min + ((max - min) * quality));
}

function getCoinDenominationWeights(level) {
  return COIN_POUCH_DENOMINATION_WEIGHTS[getDungeonLevelIndex(level)] || COIN_POUCH_DENOMINATION_WEIGHTS[0];
}

function pickCoinDenomination(level, rng) {
  const weights = getCoinDenominationWeights(level);
  const entries = [
    { key: "copper", weight: weights.copper },
    { key: "silver", weight: weights.silver },
    { key: "gold", weight: weights.gold }
  ];
  return weightedPick(rng, entries, (entry) => entry.weight).key;
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

function getTypedTreasureSlots(categoryKey) {
  if (categoryKey === "herbs" || categoryKey === "clothing" || categoryKey === "jewels" || categoryKey === "gems") {
    return 0;
  }
  if (categoryKey === "platemail") {
    return 3;
  }
  if (categoryKey === "chainmail") {
    return 2;
  }
  return 1;
}

function buildTypedTreasure(state, rng, category) {
  const level = clampLevel(state?.level);
  const noun = weightedPick(rng, category.nouns, (value, index) => getPositionWeight(index, category.nouns.length, level, NOUN_DISTANCE_WEIGHTS));
  const nounIndex = Math.max(0, category.nouns.indexOf(noun));
  const adjective = category.adjectives?.length
    ? weightedPick(rng, category.adjectives, (value, index) => getPositionWeight(index, category.adjectives.length, level, ADJECTIVE_DISTANCE_WEIGHTS))
    : "";
  const adjectiveIndex = adjective ? Math.max(0, category.adjectives.indexOf(adjective)) : -1;
  const value = getTypedTreasureValue(category, adjective, adjectiveIndex, noun, nounIndex);
  return {
    kind: category.key,
    name: buildName(rng, category, adjective, noun),
    value,
    slots: getTypedTreasureSlots(category.key),
    bonusSlots: 0,
    priceless: false,
    description: "",
    searchDc: null
  };
}

function buildCoinTreasure(state, rng) {
  const level = clampLevel(state?.level);
  const key = pickCoinDenomination(level, rng);
  const amount = key === "gold"
    ? Math.max(1, rng.nextInt(1, Math.max(2, level * 8)))
    : key === "silver"
      ? rng.nextInt(10, 80 + level * 35)
      : rng.nextInt(40, 180 + level * 60);
  const goldGp = key === "gold" ? amount : 0;
  const silverSp = key === "silver" ? amount : 0;
  const copperCp = key === "copper" ? amount : 0;
  const value = (goldGp * 100 + silverSp * 10 + copperCp) / 100;
  const dominant = key === "gold" ? "g.p." : key === "silver" ? "s.p." : "c.p.";
  return {
    kind: "coin-cache",
    name: `${dominant} pouch`,
    value,
    slots: Math.max(0, Math.ceil(Math.max(0, goldGp + silverSp + copperCp - 100) / 100)),
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
