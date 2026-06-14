const TREASURE_TYPES = [
  {
    key: "herbs",
    nouns: [
      "rotten salt",
      "parsley",
      "oregano",
      "basil",
      "rosemary",
      "thyme",
      "mint",
      "dill",
      "pepper",
      "bay laurel",
      "lavender",
      "turmeric",
      "paprika",
      "cloves",
      "cardamom",
      "nutmeg",
      "cinnamon",
      "ginger",
      "vanilla",
      "saffron"
    ],
    adjectives: [
      "rotten",
      "musty",
      "dry",
      "bitter",
      "fresh",
      "wild",
      "dryad's",
      "witch's",
      "saint's"
    ]
  },
  {
    key: "leather",
    nouns: [
      "scraps",
      "hide",
      "pelt",
      "tanned hide",
      "leather",
      "studded leather"
    ],
    adjectives: [
      "ragged",
      "rough",
      "patched",
      "treated",
      "soft",
      "embossed",
      "fine",
      "ornate"
    ]
  },
  {
    key: "dagger",
    nouns: [
      "shiv",
      "spike",
      "knife",
      "cleaver",
      "dagger",
      "dirk",
      "stiletto",
      "kukri",
      "cutlass",
      "tanto",
      "wakizashi"
    ],
    adjectives: [
      "fake",
      "rusty",
      "chipped",
      "bronze",
      "copper",
      "iron",
      "steel",
      "ritual",
      "curved",
      "silver",
      "obsidian"
    ]
  },
  {
    key: "clothing",
    nouns: [
      "neckerchief",
      "bandana",
      "socks",
      "apron",
      "skirt",
      "tunic",
      "cape",
      "cloak",
      "hat",
      "bonnet",
      "breeches",
      "robe",
      "costume",
      "boots",
      "dress",
      "gown"
    ],
    adjectives: [
      "tattered",
      "orcish",
      "grass",
      "worn",
      "peasant",
      "hemp",
      "wool",
      "linen",
      "merchant",
      "fancy",
      "elven",
      "silk",
      "embroidered",
      "magical"
    ]
  },
  {
    key: "shield",
    nouns: [
      "buckler",
      "hide shield",
      "wooden shield",
      "round shield",
      "heater shield",
      "kite shield",
      "tower shield",
      "wall shield"
    ],
    adjectives: [
      "battered",
      "scarred",
      "patched",
      "reinforced",
      "sturdy",
      "etched",
      "blessed",
      "holy"
    ]
  },
  {
    key: "instrument",
    nouns: [
      "horn",
      "pipe",
      "flute",
      "fiddle",
      "lute",
      "harp",
      "drum",
      "dulcimer",
      "lyre",
      "organ"
    ],
    adjectives: [
      "plain",
      "worn",
      "copper",
      "silver",
      "gold",
      "masterwork",
      "ritual",
      "holy"
    ]
  },
  {
    key: "chainmail",
    nouns: [
      "mail links",
      "ring mail",
      "chain shirt",
      "chainmail",
      "chain hauberk",
      "fine chainmail"
    ],
    adjectives: [
      "rusted",
      "beaten",
      "oiled",
      "tempered",
      "reinforced",
      "sturdy",
      "elven",
      "forged"
    ]
  },
  {
    key: "gems",
    nouns: [
      "quartz",
      "topaz",
      "garnet",
      "opal",
      "fire opal",
      "sapphire",
      "ruby",
      "emerald",
      "diamond"
    ],
    adjectives: [
      "cloudy",
      "rough",
      "clear",
      "bright",
      "sparkling",
      "flawless",
      "cut",
      "glimmering",
      "radiant"
    ]
  },
  {
    key: "platemail",
    nouns: [
      "breastplate",
      "cuirass",
      "half plate",
      "plate mail",
      "full plate",
      "full harness",
      "royal plate"
    ],
    adjectives: [
      "dented",
      "polished",
      "reinforced",
      "engraved",
      "gold-inlaid",
      "ancient",
      "ceremonial",
      "ritual",
      "holy"
    ]
  },
  {
    key: "jewels",
    nouns: [
      "ring",
      "earrings",
      "brooch",
      "cloak pin",
      "bracelet",
      "necklace",
      "amulet",
      "medallion",
      "mask",
      "crown"
    ],
    adjectives: [
      "counterfeit",
      "wood",
      "cloth",
      "leather",
      "bronze",
      "copper",
      "nickel",
      "silver",
      "gold",
      "diamond",
      "lunastone",
      "ceremonial",
      "ritual",
      "holy"
    ]
  }
];

const HERB_CONTAINERS = ["box", "pouch", "tin", "shaker", "sack"];
const DIVINE_SUFFIXES = ["Saint Terrangis", "Gede", "Madeera", "Ord", "Memnon", "Ramlaat", "Shune"];
const SPECIAL_SUFFIX_ADJECTIVES = new Set(["ceremonial", "holy", "ritual"]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function weightedChoiceIndex(rng, sourceScore, count, jitter = 0.12) {
  if (count <= 1) {
    return 0;
  }
  const noise = (rng.nextFloat() - 0.5) * jitter;
  const score = clamp01(sourceScore + noise);
  return Math.max(0, Math.min(count - 1, Math.round(score * (count - 1))));
}

function pickByScore(rng, values, sourceScore, jitter = 0.12) {
  if (!Array.isArray(values) || values.length === 0) {
    return "";
  }
  return values[weightedChoiceIndex(rng, sourceScore, values.length, jitter)];
}

function getPartyLevelBasis(state) {
  const levels = Array.isArray(state?.characters)
    ? state.characters.map((character) => Math.max(1, Number(character?.level) || 1))
    : [];
  const count = levels.length || 1;
  const total = levels.reduce((sum, level) => sum + level, 0) || Math.max(1, Number(state?.level) || 1);
  const average = total / count;
  return {
    count,
    totalLevel: total,
    averageLevel: average,
    baseValueGp: Math.max(1, Math.round(average * 10 * count))
  };
}

function formatCoinLabelFromValue(valueGp) {
  const gp = Math.max(0, Number(valueGp) || 0);
  if (gp >= 1) {
    return `${Math.round(gp)} gp`;
  }
  const sp = Math.round(gp * 10);
  if (sp >= 1) {
    return `${sp} sp`;
  }
  return `${Math.max(1, Math.round(gp * 100))} cp`;
}

function roundTreasureValue(valueGp) {
  const value = Math.max(0.01, Number(valueGp) || 0.01);
  if (value >= 1000) {
    return Math.round(value / 100) * 100;
  }
  if (value >= 100) {
    return Math.round(value / 10) * 10;
  }
  if (value >= 1) {
    return Math.round(value);
  }
  return Math.max(0.01, Math.round(value * 100) / 100);
}

function formatTreasureValue(valueGp) {
  return formatCoinLabelFromValue(roundTreasureValue(valueGp));
}

function buildHolySuffix(rng) {
  return `of ${pickByScore(rng, DIVINE_SUFFIXES, rng.nextFloat(), 0)}`;
}

function buildHerbName(rng, adjective, noun, sourceScore) {
  const container = pickByScore(rng, HERB_CONTAINERS, sourceScore, 0.08);
  const herbCore = adjective ? `${adjective} ${noun}` : noun;
  return {
    name: `a ${container} of ${herbCore}`,
    score: sourceScore
  };
}

function buildStandardName(rng, adjective, noun) {
  const base = adjective ? `${adjective} ${noun}` : noun;
  if (SPECIAL_SUFFIX_ADJECTIVES.has(adjective)) {
    return {
      name: `${base} ${buildHolySuffix(rng)}`
    };
  }
  return {
    name: base
  };
}

function getTreasureCategory(state, rng) {
  const basis = getPartyLevelBasis(state);
  const levelScale = clamp01((basis.baseValueGp - 10) / 1590);
  const index = weightedChoiceIndex(rng, levelScale, TREASURE_TYPES.length, 0.28);
  return {
    category: TREASURE_TYPES[index],
    categoryScore: TREASURE_TYPES.length <= 1 ? 0 : index / (TREASURE_TYPES.length - 1),
    basis
  };
}

function getTreasureValueScore(categoryScore, adjectiveScore, nounScore) {
  return (categoryScore * 0.45) + (adjectiveScore * 0.375) + (nounScore * 0.175);
}

function buildStandardTreasure(state, rng) {
  const { category, categoryScore, basis } = getTreasureCategory(state, rng);
  const adjective = pickByScore(rng, category.adjectives, rng.nextFloat(), 0.18);
  const noun = pickByScore(rng, category.nouns, rng.nextFloat(), 0.18);
  const adjectiveScore = category.adjectives.length <= 1 ? 0 : category.adjectives.indexOf(adjective) / (category.adjectives.length - 1);
  const nounScore = category.nouns.length <= 1 ? 0 : category.nouns.indexOf(noun) / (category.nouns.length - 1);
  const score = getTreasureValueScore(categoryScore, adjectiveScore, nounScore);
  const rawValueGp = basis.baseValueGp * (0.000025 + (3.999975 * Math.pow(score, 1.45)));
  const valueGp = roundTreasureValue(rawValueGp);
  let name;
  if (category.key === "herbs") {
    name = buildHerbName(rng, adjective, noun, score).name;
  } else {
    const built = buildStandardName(rng, adjective, noun);
    name = built.name;
  }

  return {
    kind: category.key,
    name,
    value: valueGp,
    slots: 1,
    bonusSlots: 0,
    priceless: false,
    description: "",
    searchDc: null
  };
}

function buildCoinTreasure(state, rng) {
  const basis = getPartyLevelBasis(state);
  const level = Math.max(1, Number(state?.level) || 1);
  const totalValueGp = Math.max(0.01, basis.baseValueGp * (rng.nextFloat() * 2));
  if (totalValueGp < 1) {
    const copperCp = Math.max(1, Math.round(totalValueGp * 100));
    return {
      kind: "coin-cache",
      name: "c.p. pouch",
      value: roundTreasureValue(copperCp / 100),
      slots: Math.max(0, Math.ceil(Math.max(0, copperCp - 100) / 100)),
      bonusSlots: 0,
      priceless: false,
      description: `Coins: ${copperCp} cp.`,
      searchDc: null,
      coinBreakdown: {
        gold: 0,
        silver: 0,
        copper: copperCp
      }
    };
  }

  const silverShareMax = Math.max(0, 0.7 - ((level - 1) * 0.1));
  const copperShareMax = Math.max(0, 0.3 - ((level - 1) * 0.1));
  const silverShare = rng.nextFloat() * silverShareMax;
  const copperShare = rng.nextFloat() * copperShareMax;
  const goldShare = Math.max(0, 1 - silverShare - copperShare);
  const normalized = goldShare + silverShare + copperShare || 1;
  const goldValue = totalValueGp * (goldShare / normalized);
  const silverValue = totalValueGp * (silverShare / normalized);
  const copperValue = totalValueGp * (copperShare / normalized);

  const goldGp = Math.max(1, Math.round(goldValue));
  const silverSp = Math.max(0, Math.round(silverValue * 10) + rng.nextInt(-9, 9));
  const copperCp = Math.max(0, Math.round(copperValue * 100) + rng.nextInt(-99, 99));
  const totalCoinCount = Math.max(1, Math.round((goldGp * 100) + (silverSp * 10) + copperCp));
  const slots = Math.max(0, Math.ceil(Math.max(0, totalCoinCount - 100) / 100));
  const dominant = silverSp > copperCp ? "s.p." : copperCp > 0 && copperCp >= silverSp ? "c.p." : "g.p.";
  const name = dominant === "g.p." ? "g.p. pouch" : dominant === "s.p." ? "s.p. pouch" : "c.p. pouch";
  const gpEquivalent = roundTreasureValue(goldGp + (silverSp / 10) + (copperCp / 100));

  return {
    kind: "coin-cache",
    name,
    value: gpEquivalent,
    slots,
    bonusSlots: 0,
    priceless: false,
    description: `Coins: ${goldGp} gp, ${silverSp} sp, ${copperCp} cp.`,
    searchDc: null,
    coinBreakdown: {
      gold: goldGp,
      silver: silverSp,
      copper: copperCp
    }
  };
}

export function createTreasureDetails(state, rng) {
  const coinRoll = rng.nextFloat();
  if (coinRoll < 0.25) {
    return buildCoinTreasure(state, rng);
  }
  return buildStandardTreasure(state, rng);
}

export { formatTreasureValue };
