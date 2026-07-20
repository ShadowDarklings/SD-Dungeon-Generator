const TERRAIN = {
  grass: { label: "Grass", color: "#7fb069", stroke: "#4f7b48" },
  forest: { label: "Forest", color: "#245d38", stroke: "#163a23" },
  mountain: { label: "Mountain", color: "#9da3a9", stroke: "#5f6670" },
  water: { label: "Water", color: "#315f9f", stroke: "#17365e" },
  swamp: { label: "Swamp", color: "#526b35", stroke: "#344621" },
  hills: { label: "Hills", color: "#c39a42", stroke: "#836023" },
  desert: { label: "Desert", color: "#d7b579", stroke: "#9a7441" },
};

const NATURAL_TYPES = Object.keys(TERRAIN);
const RADIUS = 6;
const HEX_SIZE = 36;
const SQRT3 = Math.sqrt(3);
const DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const AFFINITY = {
  water: { water: 16, forest: 4, mountain: 1, swamp: 5, hills: 4, grass: 10, desert: 2 },
  forest: { water: 5, forest: 16, mountain: 5, swamp: 7, hills: 7, grass: 10, desert: 2 },
  mountain: { water: 1, forest: 3, mountain: 18, swamp: 1, hills: 10, grass: 3, desert: 3 },
  swamp: { water: 10, forest: 9, mountain: 1, swamp: 16, hills: 3, grass: 8, desert: 1 },
  hills: { water: 3, forest: 7, mountain: 10, swamp: 3, hills: 16, grass: 10, desert: 7 },
  grass: { water: 10, forest: 10, mountain: 2, swamp: 10, hills: 10, grass: 14, desert: 10 },
  desert: { water: 2, forest: 4, mountain: 3, swamp: 1, hills: 10, grass: 10, desert: 16 },
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
    x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r),
    y: HEX_SIZE * 1.5 * r,
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

function allCoords(radius = RADIUS) {
  const coords = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r += 1) {
      coords.push([q, r]);
    }
  }
  return coords;
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
    const picked = weightedChoice(entries);
    terrain.set(key(nq, nr), picked);
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
    size: Math.max(12, Math.min(21, 11 + width * 1.8)),
    angle: Math.random() < 0.5 ? -10 : 10,
  };
}

function newMap() {
  const terrain = generateTiles();
  state = {
    terrain,
    labels: labelClusters(terrain),
    player: { q: 0, r: 0 },
  };
  draw();
  updateCurrentPanel();
}

function polygonPoints(cx, cy, size) {
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return points;
}

function drawHex(cx, cy, size, fill, stroke) {
  const points = polygonPoints(cx, cy, size);
  ctx.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawTerrainDetail(type, cx, cy, variant) {
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  if (type === "forest") {
    for (let i = 0; i < 3; i += 1) {
      const x = cx - 12 + i * 12 + (variant % 2) * 2;
      ctx.beginPath();
      ctx.moveTo(x, cy - 14);
      ctx.lineTo(x - 8, cy + 8);
      ctx.lineTo(x + 8, cy + 8);
      ctx.closePath();
      ctx.fillStyle = "#12381f";
      ctx.fill();
    }
  } else if (type === "mountain") {
    ctx.fillStyle = "#5f6670";
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy + 14);
    ctx.lineTo(cx - 4, cy - 18);
    ctx.lineTo(cx + 12, cy + 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d8dde4";
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 18);
    ctx.lineTo(cx - 9, cy - 7);
    ctx.lineTo(cx + 2, cy - 8);
    ctx.closePath();
    ctx.fill();
  } else if (type === "water") {
    ctx.strokeStyle = "rgba(220,240,255,0.65)";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.arc(cx + i * 10, cy + i * 2, 8, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  } else if (type === "swamp") {
    ctx.strokeStyle = "#233314";
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(cx - 18 + i * 11, cy + 13);
      ctx.lineTo(cx - 14 + i * 11, cy - 6);
      ctx.stroke();
    }
  } else if (type === "hills") {
    ctx.strokeStyle = "#795722";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx - 10, cy + 8, 14, Math.PI, 0);
    ctx.arc(cx + 8, cy + 10, 12, Math.PI, 0);
    ctx.stroke();
  } else if (type === "desert") {
    ctx.strokeStyle = "#9a7441";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 21, cy + 4);
    ctx.quadraticCurveTo(cx - 4, cy - 8, cx + 22, cy + 2);
    ctx.stroke();
  } else if (type === "grass") {
    ctx.fillStyle = "#d8ef9f";
    for (let i = 0; i < 5; i += 1) {
      ctx.fillRect(cx - 18 + i * 9, cy + ((i + variant) % 3) * 4 - 3, 3, 9);
    }
  }
  ctx.restore();
}

function getBounds() {
  const coords = [...state.terrain.keys()].map(parseKey).map(([q, r]) => axialToPixel(q, r));
  const xs = coords.map((p) => p.x);
  const ys = coords.map((p) => p.y);
  return {
    minX: Math.min(...xs) - HEX_SIZE,
    maxX: Math.max(...xs) + HEX_SIZE,
    minY: Math.min(...ys) - HEX_SIZE,
    maxY: Math.max(...ys) + HEX_SIZE,
  };
}

function mapTransform() {
  const bounds = getBounds();
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = Math.min((canvas.width - 80) / width, (canvas.height - 80) / height);
  return {
    scale,
    ox: canvas.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    oy: canvas.height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
  };
}

function toScreen(q, r) {
  const { scale, ox, oy } = mapTransform();
  const p = axialToPixel(q, r);
  return { x: p.x * scale + ox, y: p.y * scale + oy, scale };
}

function draw() {
  if (!ctx || !state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#0d141f");
  gradient.addColorStop(1, "#182230");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const [itemKey, type] of state.terrain.entries()) {
    const [q, r] = parseKey(itemKey);
    const { x, y, scale } = toScreen(q, r);
    const terrain = TERRAIN[type];
    drawHex(x, y, HEX_SIZE * scale * 0.96, terrain.color, terrain.stroke);
    drawTerrainDetail(type, x, y, (q * 7 + r * 13) & 3);
  }

  drawLabels();
  drawPlayer();
}

function drawLabels() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const label of state.labels) {
    const { x, y, scale } = toScreen(label.q, label.r);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((label.angle * Math.PI) / 180);
    ctx.font = `800 ${label.size * scale}px Georgia, serif`;
    ctx.lineWidth = Math.max(3, 4 * scale);
    ctx.strokeStyle = "rgba(0,0,0,0.76)";
    ctx.fillStyle = "rgba(255,249,222,0.92)";
    ctx.strokeText(label.text, 0, 0);
    ctx.fillText(label.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawPlayer() {
  const { x, y, scale } = toScreen(state.player.q, state.player.r);
  ctx.save();
  ctx.fillStyle = "#66d3cc";
  ctx.strokeStyle = "#071013";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 12 * scale + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#071013";
  ctx.beginPath();
  ctx.arc(x, y, 4 * scale + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function regionFor(q, r) {
  const type = state.terrain.get(key(q, r));
  const best = state.labels
    .filter((label) => label.type === type)
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
  draw();
  updateCurrentPanel();
}

function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const sy = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const { scale, ox, oy } = mapTransform();
  const [q, r] = pixelToAxial((sx - ox) / scale, (sy - oy) / scale);
  if (!state.terrain.has(key(q, r))) return;
  if (axialDistance(q, r, state.player.q, state.player.r) === 1) {
    state.player = { q, r };
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
  newMap();
  window.__miniWorldMap = {
    newMap,
    movePlayer,
    getState: () => state,
    terrainTypes: NATURAL_TYPES,
  };
}
