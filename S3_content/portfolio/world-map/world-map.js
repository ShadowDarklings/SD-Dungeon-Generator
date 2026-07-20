const TERRAIN = {
  grass: { label: "Grass", rank: 1 },
  forest: { label: "Forest", rank: 2 },
  swamp: { label: "Swamp", rank: 3 },
  desert: { label: "Desert", rank: 4 },
  hills: { label: "Hills", rank: 5 },
  mountain: { label: "Mountain", rank: 6 },
  water: { label: "Water", rank: 7 },
};

const NATURAL_TYPES = Object.keys(TERRAIN);
const RADIUS = 6;
const TILE_WIDTH = 130;
const TILE_HEIGHT = 149;
const HEX_SIZE = TILE_HEIGHT / 2;
const SQRT3 = Math.sqrt(3);
const STEP_X = SQRT3 * HEX_SIZE;
const STEP_Y = 1.5 * HEX_SIZE;
const REVEAL_RADIUS = 2;
const ASSET_ROOT = "../assets/hex_tiles/";

const DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const USER_SIDE_ORDER = [4, 5, 0, 1, 2, 3];

const AFFINITY = {
  water: { water: 16, forest: 4, mountain: 1, swamp: 5, hills: 4, grass: 10, desert: 2 },
  forest: { water: 5, forest: 16, mountain: 5, swamp: 7, hills: 7, grass: 10, desert: 2 },
  mountain: { water: 1, forest: 3, mountain: 18, swamp: 1, hills: 10, grass: 3, desert: 3 },
  swamp: { water: 10, forest: 9, mountain: 1, swamp: 16, hills: 3, grass: 8, desert: 1 },
  hills: { water: 3, forest: 7, mountain: 10, swamp: 3, hills: 16, grass: 10, desert: 7 },
  grass: { water: 10, forest: 10, mountain: 2, swamp: 10, hills: 10, grass: 14, desert: 10 },
  desert: { water: 2, forest: 4, mountain: 3, swamp: 1, hills: 10, grass: 10, desert: 16 },
};

const BASE_ASSETS = {
  grass: ["grass_1.png", "grass_2.png", "grass_3.png", "grass_4.png", "grass_5.png", "grass_6.png"],
  forest: ["forest1.png", "forest2.png", "forest3.png", "forest4.png", "forest5.png"],
  swamp: ["swamp1.png", "swamp2.png", "swamp3.png"],
  desert: ["desert1.png", "desert2.png", "desert3.png"],
  hills: ["hill1.png", "hill2.png", "hill3.png"],
  mountain: ["Mountain1.png", "Mountain2.png", "Mountain3.png"],
  water: ["wat_A.png", "wat_B.png", "wat_C.png", "wat_D.png", "wat_E.png", "wat_F.png", "wat_G.png"],
};

const FALLBACK_ASSETS = {
  grass: ["grass_v0_gen3.png", "grass_v1_gen3.png", "grass_v2_gen3.png", "grass_v3_gen3.png"],
  forest: ["forest_v3_gen3.png"],
  swamp: ["swamp_v0_gen3.png", "swamp_v1_gen3.png", "swamp_v2_gen3.png", "swamp_v3_gen3.png"],
  desert: ["desert1.png", "desert2.png", "desert3.png"],
  hills: ["hills_v0_gen3.png", "hills_v1_gen3.png", "hills_v2_gen3.png", "hills_v3_gen3.png"],
  mountain: ["mountain_v0_gen3.png", "mountain_v1_gen3.png", "mountain_v2_gen3.png", "mountain_v3_gen3.png"],
  water: ["water_v0_gen3.png", "water_v1_gen3.png", "water_v2_gen3.png", "water_v3_gen3.png"],
};

const WATER_PATTERNS = [
  "111111", "11x11x", "1x1111", "1x111x", "1x11xx", "1x1x1x", "1xx111",
  "1xx1xx", "1xxx11", "1xxx1x", "1xxxx1", "1xxxxx", "xxxxxx",
];

const BORDER_PREFIX = {
  forest: "F",
  swamp: "S",
  desert: "D",
  hills: "H",
  mountain: "M",
  water: "W",
};

const BORDER_ASSETS = {
  forest: {
    0: ["F_0sA.png"],
    1: ["F_1sA.png", "F_1sB.png", "F_1sC.png", "F_1sD.png", "F_1sE.png", "F_1sF.png", "F_1sG.png", "F_1sH.png", "F_1sI.png", "F_1sJ.png"],
    2: ["F_2sA.png", "F_2sB.png", "F_2sC.png", "F_2sD.png"],
    3: ["F_3sA.png", "F_3sB.png", "F_3sC.png"],
    4: ["F_4sA.png", "F_4sB.png", "F_4sC.png"],
    5: ["F_5sA.png", "F_5sB.png", "F_5sC.png"],
    6: ["F_6sA.png"],
  },
  swamp: {
    1: ["S_1sA.png", "S_1sB.png", "S_1sC.png"],
    2: ["S_2sA.png", "S_2sB.png", "S_2sC.png"],
    3: ["S_3sA.png", "S_3sB.png", "S_3sC.png"],
    4: ["S_4sA.png", "S_4sB.png"],
    5: ["S_5sA.png"],
  },
  desert: {
    1: ["D_1sA.png"],
    2: ["D_2sA.png"],
    3: ["D_3sA.png"],
    4: ["D_4sA.png"],
    5: ["D_5sA.png"],
  },
  hills: {
    1: ["H_1sA.png"],
    2: ["H_2sA.png"],
    3: ["H_3sA.png"],
    4: ["H_4sA.png"],
    5: ["H_5sA.png"],
  },
  mountain: {
    1: ["M_1sA.png"],
    2: ["M_2sA.png"],
    3: ["M_3sA.png"],
    4: ["M_4sA.png"],
    5: ["M_5sA.png"],
  },
  water: {
    1: ["W_1sA.png", "W_1sB.png", "W_1sC.png", "W_1sD.png"],
  },
};

const NAME_DATA = {
  forest: {
    adjectives: ["Ancient", "Moonlit", "Mossy", "Shadowy", "Verdant", "Fey", "Thorny", "Whispering"],
    synonyms: ["Forest", "Woods", "Grove", "Wildwood", "Thicket", "Greenwood"],
    nouns: ["Dryads", "Ferns", "Elves", "Stags", "Ravens", "Witches", "Owlbears"],
  },
  desert: {
    adjectives: ["Arid", "Blazing", "Golden", "Parched", "Scorched", "Windswept", "Rust", "Searing"],
    synonyms: ["Desert", "Wastes", "Sands", "Dunes", "Badlands", "Barrens"],
    nouns: ["Mirages", "Canyons", "Scorpions", "Nomads", "Bones", "Djinns", "Jackals"],
  },
  water: {
    adjectives: ["Azure", "Deep", "Moonlit", "Misty", "Sapphire", "Drowned", "Briny", "Stormy"],
    synonyms: ["Sea", "Waters", "Depths", "Bay", "Sound", "Reef", "Lagoon"],
    nouns: ["Currents", "Tides", "Reefs", "Leviathans", "Islands", "Shallows", "Waves"],
  },
  lake: {
    adjectives: ["Clear", "Cold", "Crystal", "Mirror", "Quiet", "Still", "Sunken", "Green"],
    synonyms: ["Lake", "Mere", "Pool", "Loch", "Tarn", "Waters"],
    nouns: ["Nymphs", "Reeds", "Trout", "Mirrors", "Lake Monsters", "Sunsets"],
  },
  grass: {
    adjectives: ["Amber", "Dewy", "Emerald", "Fertile", "Golden", "Rolling", "Verdant", "Wide"],
    synonyms: ["Plains", "Prairie", "Meadow", "Grasslands", "Steppe", "Fields", "Vale"],
    nouns: ["Herdlands", "Bison", "Wheat", "Larks", "Harvests", "Winds", "Halflings"],
  },
  swamp: {
    adjectives: ["Boggy", "Brackish", "Drowned", "Fetid", "Misty", "Murky", "Rotting", "Black"],
    synonyms: ["Swamp", "Bog", "Marsh", "Mire", "Fen", "Bayou", "Wetlands"],
    nouns: ["Mists", "Leeches", "Cattails", "Bones", "Will-o'-the-Wisps", "Frogs", "Hags"],
  },
  mountain: {
    adjectives: ["Alpine", "Craggy", "Granite", "High", "Jagged", "Stormcrowned", "Icy", "Fanged"],
    synonyms: ["Mountains", "Range", "Peaks", "Ridges", "Spires", "Crags", "Highlands"],
    nouns: ["Avalanches", "Cliffs", "Peaks", "Storms", "Dragons", "Dwarves", "Caves"],
  },
  hills: {
    adjectives: ["Bronze", "Broken", "Green", "Rolling", "Stony", "Windy", "Sunlit", "Old"],
    synonyms: ["Hills", "Downs", "Uplands", "Ridges", "Heights", "Knolls"],
    nouns: ["Barrows", "Goats", "Stones", "Cairns", "Roads", "Shepherds"],
  },
};

const COMMON_ADJECTIVES = ["Forgotten", "Hidden", "Haunted", "Lost", "Sacred", "Silent", "Grim", "Twilight", "Fallen", "Wild"];
const COMMON_NOUNS = ["Shadows", "Bones", "Wolves", "Crowns", "Ghosts", "Kings", "Wizards", "Dreams", "Thorns", "Thunder"];
const PATTERNS = ["Adjective Synonym", "The Adjective Synonym", "Synonym of Noun", "The Synonym of Adjective Noun"];

const canvas = document.querySelector("#world-map-canvas");
const ctx = canvas?.getContext("2d");
const currentTerrain = document.querySelector("[data-current-terrain]");
const currentRegion = document.querySelector("[data-current-region]");
const legend = document.querySelector("[data-legend]");

const imageCache = new Map();
let state = null;

function key(q, r) {
  return `${q},${r}`;
}

function parseKey(value) {
  return value.split(",").map(Number);
}

function axialDistance(aq, ar, bq = 0, br = 0) {
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
}

function axialToPixel(q, r) {
  return {
    x: STEP_X * q + (STEP_X / 2) * r,
    y: STEP_Y * r,
  };
}

function pixelToAxial(x, y) {
  const q = ((SQRT3 / 3) * x - y / 3) / HEX_SIZE;
  const r = (2 / 3) * y / HEX_SIZE;
  return roundAxial(q, r);
}

function roundAxial(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, rz];
}

function neighbors(q, r) {
  return DIRECTIONS.map(([dq, dr]) => [q + dq, r + dr]);
}

function orderedNeighbors(q, r) {
  const local = neighbors(q, r);
  return USER_SIDE_ORDER.map((index) => local[index]);
}

function allCoords(radius = RADIUS) {
  const coords = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r += 1) {
      coords.push([q, r]);
    }
  }
  return coords;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicIndex(seed, count) {
  return count ? hashString(seed) % count : 0;
}

function choice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function weightedChoice(entries) {
  const total = entries.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of entries) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return entries[entries.length - 1].value;
}

function generateName(type, largeWater = false) {
  const data = type === "water" && !largeWater ? NAME_DATA.lake : NAME_DATA[type];
  const pattern = choice(PATTERNS);
  const adj = choice(Math.random() < 0.72 ? data.adjectives : COMMON_ADJECTIVES);
  const syn = choice(data.synonyms);
  const noun = choice(Math.random() < 0.35 ? data.nouns : COMMON_NOUNS);
  if (pattern === "Adjective Synonym") return `${adj} ${syn}`;
  if (pattern === "The Adjective Synonym") return `The ${adj} ${syn}`;
  if (pattern === "Synonym of Noun") return `${syn} of the ${noun.replace(/s$/, "")}`;
  return `The ${syn} of the ${adj} ${noun.replace(/s$/, "")}`;
}

function makeInitialSeeds(coords) {
  const shuffled = [...coords].sort(() => Math.random() - 0.5);
  const seeds = new Map();
  const used = [];
  for (const type of NATURAL_TYPES) {
    let coord = shuffled.find(([q, r]) => {
      if (q === 0 && r === 0) return type === "grass";
      return used.every(([uq, ur]) => axialDistance(q, r, uq, ur) >= 3);
    }) || shuffled.find(([q, r]) => !seeds.has(key(q, r)));
    if (!coord) coord = choice(coords);
    seeds.set(key(coord[0], coord[1]), type);
    used.push(coord);
  }
  return seeds;
}

function generateTiles() {
  const coords = allCoords();
  const valid = new Set(coords.map(([q, r]) => key(q, r)));
  const terrain = makeInitialSeeds(coords);
  const frontier = [...terrain.keys()];

  while (terrain.size < coords.length) {
    const sourceKey = choice(frontier);
    const [q, r] = parseKey(sourceKey);
    const openNeighbors = neighbors(q, r).filter(([nq, nr]) => valid.has(key(nq, nr)) && !terrain.has(key(nq, nr)));
    if (!openNeighbors.length) {
      frontier.splice(frontier.indexOf(sourceKey), 1);
      continue;
    }
    const [nq, nr] = choice(openNeighbors);
    const parent = terrain.get(sourceKey);
    const entries = NATURAL_TYPES.map((type) => ({ value: type, weight: AFFINITY[parent][type] || 1 }));
    terrain.set(key(nq, nr), weightedChoice(entries));
    frontier.push(key(nq, nr));
  }

  smoothTerrain(terrain, valid, 2);
  carveWaterThreads(terrain, valid);
  guaranteeCoverage(terrain);
  return terrain;
}

function smoothTerrain(terrain, valid, passes) {
  for (let pass = 0; pass < passes; pass += 1) {
    const updates = [];
    for (const itemKey of terrain.keys()) {
      const [q, r] = parseKey(itemKey);
      const current = terrain.get(itemKey);
      const adjacent = neighbors(q, r)
        .filter(([nq, nr]) => valid.has(key(nq, nr)))
        .map(([nq, nr]) => terrain.get(key(nq, nr)));
      const counts = new Map();
      adjacent.forEach((type) => counts.set(type, (counts.get(type) || 0) + 1));
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 4 && best[0] !== current && Math.random() < 0.55) {
        updates.push([itemKey, best[0]]);
      }
    }
    updates.forEach(([itemKey, type]) => terrain.set(itemKey, type));
  }
}

function carveWaterThreads(terrain, valid) {
  const starts = [...terrain.keys()].filter((itemKey) => terrain.get(itemKey) === "mountain" || terrain.get(itemKey) === "hills");
  const count = Math.max(1, Math.floor(Math.random() * 2) + 1);
  for (let i = 0; i < count; i += 1) {
    let current = starts.length ? choice(starts) : choice([...terrain.keys()]);
    let direction = Math.floor(Math.random() * 6);
    const length = 7 + Math.floor(Math.random() * 9);
    for (let step = 0; step < length; step += 1) {
      terrain.set(current, "water");
      const [q, r] = parseKey(current);
      if (Math.random() < 0.38) direction = (direction + choice([-1, 1]) + 6) % 6;
      const next = neighbors(q, r)[direction];
      const nextKey = key(next[0], next[1]);
      if (!valid.has(nextKey)) break;
      current = nextKey;
    }
  }
}

function guaranteeCoverage(terrain) {
  const keys = [...terrain.keys()].sort(() => Math.random() - 0.5);
  for (const type of NATURAL_TYPES) {
    if ([...terrain.values()].includes(type)) continue;
    const target = keys.find((itemKey) => axialDistance(...parseKey(itemKey), 0, 0) > 1) || keys[0];
    terrain.set(target, type);
  }
}

function buildClusters(terrain) {
  const clusters = [];
  const visited = new Set();
  for (const itemKey of terrain.keys()) {
    if (visited.has(itemKey)) continue;
    const type = terrain.get(itemKey);
    const queue = [itemKey];
    const cluster = [];
    visited.add(itemKey);
    while (queue.length) {
      const current = queue.shift();
      cluster.push(current);
      const [q, r] = parseKey(current);
      for (const [nq, nr] of neighbors(q, r)) {
        const nk = key(nq, nr);
        if (!visited.has(nk) && terrain.get(nk) === type) {
          visited.add(nk);
          queue.push(nk);
        }
      }
    }
    clusters.push({ type, keys: cluster });
  }
  return clusters;
}

function clusterWidth(cluster) {
  const coords = cluster.keys.map(parseKey);
  const qs = coords.map(([q]) => q);
  const rs = coords.map(([, r]) => r);
  const ss = coords.map(([q, r]) => -q - r);
  return Math.max(Math.max(...qs) - Math.min(...qs), Math.max(...rs) - Math.min(...rs), Math.max(...ss) - Math.min(...ss));
}

function labelClusters(terrain) {
  const labels = [];
  const clusters = buildClusters(terrain);
  const labeledTypes = new Set();
  for (const cluster of clusters) {
    const width = clusterWidth(cluster);
    const threshold = cluster.type === "water" ? 3 : 2;
    if (width < threshold || cluster.keys.length < 3) continue;
    labels.push(makeClusterLabel(cluster, width));
    labeledTypes.add(cluster.type);
  }
  for (const type of NATURAL_TYPES) {
    if (labeledTypes.has(type)) continue;
    const cluster = clusters.filter((item) => item.type === type).sort((a, b) => b.keys.length - a.keys.length)[0];
    if (cluster) labels.push(makeClusterLabel(cluster, Math.max(1, clusterWidth(cluster))));
  }
  return labels;
}

function makeClusterLabel(cluster, width) {
  const coords = cluster.keys.map(parseKey);
  const centerQ = coords.reduce((sum, [q]) => sum + q, 0) / coords.length;
  const centerR = coords.reduce((sum, [, r]) => sum + r, 0) / coords.length;
  const anchor = coords
    .map(([q, r]) => ({ q, r, dist: axialDistance(q, r, centerQ, centerR) }))
    .sort((a, b) => a.dist - b.dist)[0];
  const touchesEdge = coords.some(([q, r]) => neighbors(q, r).some(([nq, nr]) => axialDistance(nq, nr) > RADIUS));
  const largeWater = cluster.type === "water" && (touchesEdge || width >= 5);
  return {
    type: cluster.type,
    text: generateName(cluster.type, largeWater),
    q: anchor.q,
    r: anchor.r,
    size: Math.max(15, Math.min(24, 13 + width * 2)),
    angle: Math.random() < 0.5 ? -10 : 10,
  };
}

function newMap() {
  const terrain = generateTiles();
  state = {
    terrain,
    labels: labelClusters(terrain),
    player: { q: 0, r: 0 },
    explored: new Set(),
    visible: new Set(),
  };
  revealFrom(0, 0);
  draw();
  updateCurrentPanel();
}

function revealFrom(q, r) {
  state.visible = new Set();
  const seen = new Set([key(q, r)]);
  const queue = [[q, r, 0]];
  while (queue.length) {
    const [cq, cr, dist] = queue.shift();
    const tileKey = key(cq, cr);
    if (!state.terrain.has(tileKey)) continue;
    state.visible.add(tileKey);
    state.explored.add(tileKey);

    if (state.terrain.get(tileKey) === "water") {
      revealWaterBody(cq, cr);
    }

    if (dist < REVEAL_RADIUS) {
      for (const [nq, nr] of neighbors(cq, cr)) {
        const nk = key(nq, nr);
        if (!seen.has(nk)) {
          seen.add(nk);
          queue.push([nq, nr, dist + 1]);
        }
      }
    }
  }
}

function revealWaterBody(q, r) {
  const queue = [[q, r]];
  const visited = new Set([key(q, r)]);
  while (queue.length) {
    const [cq, cr] = queue.shift();
    const currentKey = key(cq, cr);
    state.visible.add(currentKey);
    state.explored.add(currentKey);
    for (const [nq, nr] of neighbors(cq, cr)) {
      const nk = key(nq, nr);
      if (!visited.has(nk) && state.terrain.get(nk) === "water") {
        visited.add(nk);
        queue.push([nq, nr]);
      }
    }
  }
}

function imageNames() {
  const names = new Set(["fog.png"]);
  Object.values(BASE_ASSETS).flat().forEach((name) => names.add(name));
  Object.values(FALLBACK_ASSETS).flat().forEach((name) => names.add(name));
  WATER_PATTERNS.forEach((pattern) => names.add(`wat_grass_${pattern}.png`));
  Object.values(BORDER_ASSETS).forEach((byCount) => Object.values(byCount).flat().forEach((name) => names.add(name)));
  return [...names];
}

function preloadImages() {
  if (typeof Image === "undefined") return Promise.resolve();
  const jobs = imageNames().map((name) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(name, img);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `${ASSET_ROOT}${name}`;
  }));
  return Promise.all(jobs);
}

function getImage(name) {
  return imageCache.get(name);
}

function baseAssetFor(type, q, r) {
  const options = BASE_ASSETS[type]?.length ? BASE_ASSETS[type] : FALLBACK_ASSETS[type];
  return options[deterministicIndex(`${type}:${q},${r}:base`, options.length)];
}

function transformFor(type, q, r) {
  if (type === "water") return { rotation: 0, mirrored: false };
  const hash = hashString(`${type}:${q},${r}:transform`);
  return {
    rotation: [0, 60, 120, 180, 240, 300][hash % 6],
    mirrored: Boolean((hash >> 3) & 1),
  };
}

function targetWaterPattern(q, r) {
  return orderedNeighbors(q, r).map(([nq, nr]) => {
    const type = state.terrain.get(key(nq, nr));
    return type && type !== "water" ? "1" : "x";
  }).join("");
}

function waterAssetFor(q, r) {
  const target = targetWaterPattern(q, r);
  const patterns = Object.fromEntries(WATER_PATTERNS.map((pattern) => [pattern, `wat_grass_${pattern}.png`]));
  const match = findPatternMatch(Object.keys(patterns), target);
  let asset = match.pattern ? patterns[match.pattern] : null;
  if (match.pattern === "xxxxxx" || !asset || !getImage(asset)) {
    asset = baseAssetFor("water", q, r);
  }
  return { asset, rotation: match.rotation, mirrored: match.mirrored };
}

function findPatternMatch(basePatterns, targetPattern) {
  if (basePatterns.includes(targetPattern)) return { pattern: targetPattern, rotation: 0, mirrored: false };
  const flippedIndices = [1, 0, 5, 4, 3, 2];
  for (const base of basePatterns) {
    for (let i = 1; i < 6; i += 1) {
      const shifted = base.slice(-i) + base.slice(0, -i);
      if (shifted === targetPattern) return { pattern: base, rotation: i * 60, mirrored: false };
    }
    const flipped = flippedIndices.map((index) => base[index]).join("");
    if (flipped === targetPattern) return { pattern: base, rotation: 0, mirrored: true };
    for (let i = 1; i < 6; i += 1) {
      const shiftedFlip = flipped.slice(-i) + flipped.slice(0, -i);
      if (shiftedFlip === targetPattern) return { pattern: base, rotation: i * 60, mirrored: true };
    }
  }
  return { pattern: null, rotation: 0, mirrored: false };
}

function splitBorderRuns(sideIndices, maxSideCount) {
  const remaining = new Set(sideIndices);
  const runs = [];
  if (!remaining.size) return runs;
  if (remaining.size === 6 && maxSideCount >= 6) return [[0, 1, 2, 3, 4, 5]];

  while (remaining.size) {
    const starts = [...remaining].filter((side) => !remaining.has((side + 5) % 6));
    const start = starts.length ? Math.min(...starts) : Math.min(...remaining);
    const run = [];
    let side = start;
    while (remaining.has(side)) {
      run.push(side);
      side = (side + 1) % 6;
      if (side === start) break;
    }
    run.forEach((item) => remaining.delete(item));
    while (run.length) runs.push(run.splice(0, Math.min(run.length, maxSideCount)));
  }
  return runs;
}

function borderRunToPattern(run) {
  const pattern = ["x", "x", "x", "x", "x", "x"];
  run.forEach((side) => {
    pattern[side] = "1";
  });
  return pattern.join("");
}

function borderOverlaysFor(q, r) {
  const current = state.terrain.get(key(q, r));
  const currentRank = TERRAIN[current].rank;
  const overlays = [];
  const ordered = orderedNeighbors(q, r);

  for (const overlayType of ["forest", "swamp", "desert", "hills", "mountain", "water"]) {
    if (TERRAIN[overlayType].rank <= currentRank) continue;
    const assetsByCount = BORDER_ASSETS[overlayType] || {};
    const availableCounts = Object.keys(assetsByCount).map(Number).filter((count) => count > 0 && assetsByCount[count]?.length);
    if (!availableCounts.length) continue;
    const sides = [];
    ordered.forEach(([nq, nr], sideIndex) => {
      if (state.terrain.get(key(nq, nr)) === overlayType) sides.push(sideIndex);
    });
    if (!sides.length) continue;
    const maxSideCount = Math.max(...availableCounts);
    const basePatterns = availableCounts.map((count) => "1".repeat(count) + "x".repeat(6 - count));
    for (const run of splitBorderRuns(sides, maxSideCount)) {
      const target = borderRunToPattern(run);
      const match = findPatternMatch(basePatterns, target);
      if (!match.pattern) continue;
      const sideCount = match.pattern.split("").filter((char) => char === "1").length;
      const options = assetsByCount[sideCount] || [];
      const asset = options[deterministicIndex(`${q},${r}:${overlayType}:${target}`, options.length)];
      if (asset) overlays.push({ asset, rotation: match.rotation, mirrored: match.mirrored });
    }
  }
  return overlays;
}

function screenFor(q, r) {
  const playerPixel = axialToPixel(state.player.q, state.player.r);
  const tilePixel = axialToPixel(q, r);
  return {
    x: canvas.width / 2 + tilePixel.x - playerPixel.x,
    y: canvas.height / 2 + tilePixel.y - playerPixel.y,
  };
}

function drawImageCentered(name, x, y, options = {}) {
  const img = getImage(name);
  if (!img) return false;
  const { rotation = 0, mirrored = false, alpha = 1 } = options;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(mirrored ? -1 : 1, 1);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -TILE_WIDTH / 2, -TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT);
  ctx.restore();
  return true;
}

function drawFallbackHex(x, y, fill = "#314151") {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const px = HEX_SIZE * Math.cos(angle);
    const py = HEX_SIZE * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.52)";
  ctx.stroke();
  ctx.restore();
}

function drawTile(q, r) {
  const tileKey = key(q, r);
  const { x, y } = screenFor(q, r);
  if (x < -TILE_WIDTH || x > canvas.width + TILE_WIDTH || y < -TILE_HEIGHT || y > canvas.height + TILE_HEIGHT) return;

  if (!state.explored.has(tileKey)) {
    drawImageCentered("fog.png", x, y) || drawFallbackHex(x, y, "#121212");
    return;
  }

  const type = state.terrain.get(tileKey);
  if (type === "water") {
    const water = waterAssetFor(q, r);
    drawImageCentered(water.asset, x, y, water) || drawFallbackHex(x, y, "#315f9f");
  } else {
    const transform = transformFor(type, q, r);
    const asset = baseAssetFor(type, q, r);
    drawImageCentered(asset, x, y, transform) || drawFallbackHex(x, y, "#526b35");
  }

  for (const overlay of borderOverlaysFor(q, r)) {
    drawImageCentered(overlay.asset, x, y, overlay);
  }

  if (!state.visible.has(tileKey)) {
    drawImageCentered("fog.png", x, y, { alpha: 0.34 }) || drawFallbackHex(x, y, "rgba(0,0,0,0.34)");
  }
}

function drawLabels() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const label of state.labels) {
    if (!state.explored.has(key(label.q, label.r))) continue;
    const { x, y } = screenFor(label.q, label.r);
    if (x < -180 || x > canvas.width + 180 || y < -120 || y > canvas.height + 120) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((label.angle * Math.PI) / 180);
    ctx.font = `800 ${label.size}px Georgia, serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.82)";
    ctx.fillStyle = "rgba(255,249,222,0.94)";
    ctx.strokeText(label.text, 0, 0);
    ctx.fillText(label.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawPlayer() {
  const { x, y } = screenFor(state.player.q, state.player.r);
  ctx.save();
  ctx.fillStyle = "#66d3cc";
  ctx.strokeStyle = "#071013";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#071013";
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  if (!ctx || !state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#07090d");
  gradient.addColorStop(1, "#151b24");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sortedKeys = [...state.terrain.keys()].sort((a, b) => {
    const [aq, ar] = parseKey(a);
    const [bq, br] = parseKey(b);
    return ar === br ? bq - aq : ar - br;
  });
  for (const itemKey of sortedKeys) {
    const [q, r] = parseKey(itemKey);
    drawTile(q, r);
  }
  drawLabels();
  drawPlayer();
}

function regionFor(q, r) {
  const type = state.terrain.get(key(q, r));
  const best = state.labels
    .filter((label) => label.type === type && state.explored.has(key(label.q, label.r)))
    .map((label) => ({ label, dist: axialDistance(q, r, label.q, label.r) }))
    .sort((a, b) => a.dist - b.dist)[0];
  return best ? best.label.text : `Unnamed ${TERRAIN[type].label.toLowerCase()} region`;
}

function updateCurrentPanel() {
  const itemKey = key(state.player.q, state.player.r);
  const type = state.terrain.get(itemKey);
  currentTerrain.textContent = TERRAIN[type].label;
  currentRegion.textContent = regionFor(state.player.q, state.player.r);
}

function movePlayer(dq, dr) {
  const nq = state.player.q + dq;
  const nr = state.player.r + dr;
  if (!state.terrain.has(key(nq, nr))) return;
  state.player = { q: nq, r: nr };
  revealFrom(nq, nr);
  draw();
  updateCurrentPanel();
}

function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const sy = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const playerPixel = axialToPixel(state.player.q, state.player.r);
  const worldX = sx - canvas.width / 2 + playerPixel.x;
  const worldY = sy - canvas.height / 2 + playerPixel.y;
  const [q, r] = pixelToAxial(worldX, worldY);
  if (!state.terrain.has(key(q, r))) return;
  if (axialDistance(q, r, state.player.q, state.player.r) === 1) {
    state.player = { q, r };
    revealFrom(q, r);
    draw();
    updateCurrentPanel();
  }
}

function renderLegend() {
  legend.innerHTML = NATURAL_TYPES.map(
    (type) => `<span><i class="terrain-swatch terrain-${type}"></i>${TERRAIN[type].label}</span>`
  ).join("");
}

function bindControls() {
  document.querySelector("[data-new-map]")?.addEventListener("click", newMap);
  document.querySelector("[data-center-player]")?.addEventListener("click", () => {
    state.player = { q: 0, r: 0 };
    revealFrom(0, 0);
    draw();
    updateCurrentPanel();
  });
  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const [dq, dr] = button.dataset.move.split(",").map(Number);
      movePlayer(dq, dr);
    });
  });
  canvas?.addEventListener("click", handleCanvasClick);
  window.addEventListener("keydown", (event) => {
    if (!state || event.target.closest("input, textarea, button")) return;
    const bindings = {
      ArrowUp: [0, -1],
      w: [0, -1],
      q: [0, -1],
      ArrowLeft: [-1, 0],
      a: [-1, 0],
      e: [1, -1],
      ArrowRight: [1, 0],
      d: [1, 0],
      z: [-1, 1],
      ArrowDown: [0, 1],
      s: [0, 1],
      c: [0, 1],
    };
    const move = bindings[event.key];
    if (move) {
      event.preventDefault();
      movePlayer(move[0], move[1]);
    }
  });
}

if (canvas && ctx) {
  renderLegend();
  bindControls();
  preloadImages().then(() => {
    newMap();
    window.__miniWorldMap = {
      newMap,
      movePlayer,
      getState: () => state,
      terrainTypes: NATURAL_TYPES,
      imageCount: () => imageCache.size,
    };
  });
}
