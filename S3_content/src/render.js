import { DOOR_STATES, ENTITY_TYPES, TILE_SIZE_PX, TILE_TYPES } from "./constants.js";
import { tileKey } from "./state-schema.js";

const USE_HAND_DRAWN_RENDERER = true;
const USE_WATABOU_INK_OVERLAY = true;
const INK_WALL_COLOR = "#111111";
const HATCH_COLOR = "rgba(17, 17, 17, 0.72)";
const HATCH_SPACING_PX = 11;
const HATCH_LENGTH_PX = 15;
const ASSET_PATHS = Object.freeze({
  stone: "./assets/map_background_dark.jpg",
  floor: "./assets/room_grid_backgroung.jpg",
  north: "./assets/54x810-1x15-n.png",
  west: "./assets/54x810-1x15-w.png",
  east: "./assets/54x810-1x15-e.png",
  south: "./assets/54x810-1x15-s.png"
});
const WALL_IMAGE_VARIANTS = Object.freeze({
  north: Object.freeze(["54x810-1x15-n.png"]),
  west: Object.freeze(["54x810-1x15-w.png"]),
  east: Object.freeze(["54x810-1x15-e.png"]),
  south: Object.freeze(["54x810-1x15-s.png"])
});
const ROTUNDA_VARIANTS = Object.freeze({
  7: Object.freeze([
    "rotunda7x7.png",
    "rotunda7x7-n-s.png",
    "rotunda7x7-e-s.png",
    "rotunda7x7-w-s.png",
    "rotunda7x7-n-e-s-w.png",
    "rotunda7x7-n-e-s.png",
    "rotunda7x7-n-w-s.png"
  ]),
  5: Object.freeze([
    "rotunda5x5-s.png",
    "rotunda5x5-s2.png",
    "rotunda5x5-s3.png",
    "rotunda5x5-s4.png",
    "rotunda5x5-n-s.png",
    "rotunda5x5-s-e.png",
    "rotunda5x5-s-w.png",
    "rotunda5x5-n-s-e.png",
    "rotunda5x5-n-s-w.png",
    "rotunda5x5-s-e-w.png"
  ])
});
const CORNER_VARIANTS = Object.freeze({
  4: Object.freeze([
    "round-corner-4x4-nw.png",
    "round-corner-4x4-ne.png",
    "round-corner-4x4-se.png",
    "round-corner-4x4-sw.png"
  ]),
  3: Object.freeze([
    "round-corner-3x3-nw.png",
    "round-corner-3x3-ne.png",
    "round-corner-3x3-se.png",
    "round-corner-3x3-sw.png"
  ]),
  2: Object.freeze([
    "round-corner-2x2-nw.png",
    "round-corner-2x2-ne.png",
    "round-corner-2x2-se.png",
    "round-corner-2x2-sw.png"
  ]),
  1: Object.freeze([
    "round-corner-1x1-nw.png",
    "round-corner-1x1-ne.png",
    "round-corner-1x1-se.png",
    "round-corner-1x1-sw.png"
  ])
});
const DOOR_SPRITE_COUNT = 4;
const DOOR_STATE_SUFFIXES = Object.freeze(["", "-o", "-l", "-t"]);
const NEW_DOOR_KEYS = Object.freeze([
  "door-closed",
  "door-gone",
  "door-open",
  "door-portcullis",
  "door-portculis",
  "door-secret",
  "door-trap"
]);
const WATER_FLAT_KEYS = Object.freeze([
  "water-nn-1", "water-nn-2", "water-nn-3", "water-nn-4", "water-nn-5", "water-nn-6",
  "water-nn-7", "water-nn-8", "water-nn-9", "water-nn-10", "water-nn-12"
]);
const WATER_DIAGONAL_KEYS = Object.freeze(Array.from({ length: 13 }, (_, index) => `water-nw-${index + 1}`));
const WATER_ALL_KEYS = Object.freeze(["water-c", ...WATER_FLAT_KEYS, ...WATER_DIAGONAL_KEYS]);
const ROUND_CORNERS_ENABLED = true;
const STAIR_DOWN_KEYS = Object.freeze(["d-stair-1", "d-stair-2", "d-stair-3", "d-stair-4"]);
const STAIR_UP_KEYS = Object.freeze(["u-stair-n", "u-stair-e", "u-stair-s", "u-stair-w"]);
const PILLAR_KEYS = Object.freeze(["plr-1", "plr-2", "plr-3", "plr-4", "plr-5", "plr-6", "plr-7", "plr-8"]);
const PILLAR_BLOCK_KEYS = Object.freeze(["plr-b-1", "plr-b-2", "plr-b-3", "plr-b-4", "plr-b-5", "plr-b-6", "plr-b-7", "plr-b-8", "plr-b-9", "plr-b-10"]);

const rendererAssets = {
  ready: false,
  images: {},
  walls: {
    north: [],
    west: [],
    east: [],
    south: []
  },
  doors: {},
  decor: {
    pillars: [],
    blockPillars: [],
    stairsDown: [],
    stairsUp: {},
    waterCenter: null,
    waterByKey: {},
    waterFlat: [],
    waterDiagonal: [],
    rotundas: {
      5: [],
      7: []
    },
    corners: {
      1: [],
      2: [],
      3: [],
      4: []
    }
  }
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load renderer asset: ${src}`));
    image.src = src;
  });
}

async function loadOptionalImage(src, options = {}) {
  try {
    return await loadImage(src);
  } catch (error) {
    if (options.quiet !== true) {
      console.warn(error.message);
    }
    return null;
  }
}

async function loadOptionalImageList(paths) {
  const images = [];
  for (const path of paths) {
    const image = await loadOptionalImage(`./assets/${path}`, { quiet: true });
    if (image) {
      images.push({ key: path.replace(/\.png$/i, ""), image });
    }
  }
  return images;
}

export async function preloadRendererAssets() {
  const entries = await Promise.all(
    Object.entries(ASSET_PATHS).map(async ([key, src]) => [key, await loadImage(src)])
  );
  rendererAssets.images = Object.fromEntries(entries);
  rendererAssets.walls = {
    north: await loadOptionalImageList(WALL_IMAGE_VARIANTS.north),
    west: await loadOptionalImageList(WALL_IMAGE_VARIANTS.west),
    east: await loadOptionalImageList(WALL_IMAGE_VARIANTS.east),
    south: await loadOptionalImageList(WALL_IMAGE_VARIANTS.south)
  };
  const doorEntries = [];
  for (let i = 1; i <= DOOR_SPRITE_COUNT; i += 1) {
    for (const suffix of DOOR_STATE_SUFFIXES) {
      const key = `door${i}${suffix}`;
      doorEntries.push([key, await loadOptionalImage(`./assets/${key}.png`)]);
    }
  }
  for (const key of NEW_DOOR_KEYS) {
    doorEntries.push([key, await loadOptionalImage(`./assets/${key}.png`)]);
  }
  rendererAssets.doors = Object.fromEntries(doorEntries);
  rendererAssets.decor = {
    pillars: await Promise.all(PILLAR_KEYS.map((key) => loadOptionalImage(`./assets/${key}.png`))),
    blockPillars: await Promise.all(PILLAR_BLOCK_KEYS.map((key) => loadOptionalImage(`./assets/${key}.png`))),
    stairsDown: await Promise.all(STAIR_DOWN_KEYS.map((key) => loadOptionalImage(`./assets/${key}.png`))),
    stairsUp: {
      n: await loadOptionalImage("./assets/u-stair-n.png"),
      e: await loadOptionalImage("./assets/u-stair-e.png"),
      s: await loadOptionalImage("./assets/u-stair-s.png"),
      w: await loadOptionalImage("./assets/u-stair-w.png")
    },
    waterCenter: await loadOptionalImage("./assets/water-c.png"),
    waterByKey: Object.fromEntries(
      await Promise.all(
        WATER_ALL_KEYS.map(async (key) => [key, await loadOptionalImage(`./assets/${key}.png`, { quiet: true })])
      )
    ),
    waterFlat: await Promise.all(WATER_FLAT_KEYS.map((key) => loadOptionalImage(`./assets/${key}.png`, { quiet: true }))),
    waterDiagonal: await Promise.all(WATER_DIAGONAL_KEYS.map((key) => loadOptionalImage(`./assets/${key}.png`, { quiet: true }))),
    rotundas: {
      7: await loadOptionalImageList(ROTUNDA_VARIANTS[7]),
      5: await loadOptionalImageList(ROTUNDA_VARIANTS[5])
    },
    corners: {
      4: await loadOptionalImageList(CORNER_VARIANTS[4]),
      3: await loadOptionalImageList(CORNER_VARIANTS[3]),
      2: await loadOptionalImageList(CORNER_VARIANTS[2]),
      1: await loadOptionalImageList(CORNER_VARIANTS[1])
    }
  };
  rendererAssets.ready = true;
}

function drawBackground(ctx, widthPx, heightPx) {
  ctx.fillStyle = "#2c2f36";
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = "#30343d";
  for (let y = 0; y < heightPx; y += TILE_SIZE_PX) {
    for (let x = 0; x < widthPx; x += TILE_SIZE_PX) {
      if (((x + y) / TILE_SIZE_PX) % 2 === 0) {
        ctx.fillRect(x, y, TILE_SIZE_PX, TILE_SIZE_PX);
      }
    }
  }
}

function drawTiledImage(ctx, image, widthPx, heightPx) {
  for (let y = 0; y < heightPx; y += image.height) {
    for (let x = 0; x < widthPx; x += image.width) {
      const sw = Math.min(image.width, widthPx - x);
      const sh = Math.min(image.height, heightPx - y);
      ctx.drawImage(image, 0, 0, sw, sh, x, y, sw, sh);
    }
  }
}

function drawHandDrawnBackground(ctx, widthPx, heightPx) {
  drawTiledImage(ctx, rendererAssets.images.stone, widthPx, heightPx);
}

function getTileAt(state, x, y) {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
    return null;
  }
  return state.tiles[y * state.map.width + x] || null;
}

function isWalkableTile(tile) {
  return tile?.type === TILE_TYPES.FLOOR;
}

function isDoorOnRoomSide(state, room, side, offset) {
  return state.entities.some((entity) => {
    if (entity.subtype !== "door" || entity.roomId !== room.id) {
      return false;
    }
    if (side === "north") return entity.wallSide === side && entity.x === room.x + offset && entity.y === room.y - 1;
    if (side === "south") return entity.wallSide === side && entity.x === room.x + offset && entity.y === room.y + room.height;
    if (side === "west") return entity.wallSide === side && entity.x === room.x - 1 && entity.y === room.y + offset;
    return entity.wallSide === side && entity.x === room.x + room.width && entity.y === room.y + offset;
  });
}

function isRoomSideOpening(state, room, side, offset) {
  if (isDoorOnRoomSide(state, room, side, offset)) {
    return true;
  }
  let outside = null;
  if (side === "north") outside = getTileAt(state, room.x + offset, room.y - 1);
  if (side === "south") outside = getTileAt(state, room.x + offset, room.y + room.height);
  if (side === "west") outside = getTileAt(state, room.x - 1, room.y + offset);
  if (side === "east") outside = getTileAt(state, room.x + room.width, room.y + offset);
  return outside?.hallId && isWalkableTile(outside);
}

function collectSideRuns(state, room, side) {
  const count = side === "north" || side === "south" ? room.width : room.height;
  const runs = [];
  let runStart = null;

  for (let offset = 0; offset < count; offset += 1) {
    if (isRoomSideOpening(state, room, side, offset)) {
      if (runStart !== null) {
        runs.push({ side, start: runStart, length: offset - runStart });
        runStart = null;
      }
      continue;
    }
    if (runStart === null) {
      runStart = offset;
    }
  }

  if (runStart !== null) {
    runs.push({ side, start: runStart, length: count - runStart });
  }
  return runs;
}

function collectWallRuns(state) {
  return state.rooms.filter((room) => room.rotunda !== true).flatMap((room) => (
    ["north", "south", "west", "east"].flatMap((side) => (
      collectSideRuns(state, room, side).map((run) => ({ ...run, room }))
    ))
  ));
}

function isHallFloorTile(tile) {
  return tile?.hallId && tile.type === TILE_TYPES.FLOOR && tile.roomId === null;
}

function isHallPerimeterSide(state, tile, side) {
  const deltas = {
    north: [0, -1],
    south: [0, 1],
    west: [-1, 0],
    east: [1, 0]
  };
  const [dx, dy] = deltas[side];
  const neighbor = getTileAt(state, tile.x + dx, tile.y + dy);
  return !isWalkableTile(neighbor);
}

function getHallEdgeStart(tile, side) {
  if (side === "north") return { axis: "horizontal", x: tile.x, y: tile.y };
  if (side === "south") return { axis: "horizontal", x: tile.x, y: tile.y + 1 };
  if (side === "west") return { axis: "vertical", x: tile.x, y: tile.y };
  return { axis: "vertical", x: tile.x + 1, y: tile.y };
}

function compareHallEdges(a, b) {
  if (a.side !== b.side) return a.side.localeCompare(b.side);
  if (a.hallId !== b.hallId) return a.hallId.localeCompare(b.hallId);
  if (a.axis !== b.axis) return a.axis.localeCompare(b.axis);
  if (a.axis === "horizontal") {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  }
  if (a.x !== b.x) return a.x - b.x;
  return a.y - b.y;
}

function collectHallWallRuns(state) {
  const edges = [];
  for (const tile of state.tiles) {
    if (!isHallFloorTile(tile)) {
      continue;
    }
    for (const side of ["north", "south", "west", "east"]) {
      if (!isHallPerimeterSide(state, tile, side)) {
        continue;
      }
      edges.push({
        ...getHallEdgeStart(tile, side),
        side,
        hallId: tile.hallId
      });
    }
  }

  edges.sort(compareHallEdges);
  const runs = [];
  for (const edge of edges) {
    const previous = runs[runs.length - 1];
    const nextStart = edge.axis === "horizontal"
      ? previous?.x + previous?.length
      : previous?.y + previous?.length;
    const sameRun = previous &&
      previous.side === edge.side &&
      previous.hallId === edge.hallId &&
      previous.axis === edge.axis &&
      (
        edge.axis === "horizontal"
          ? previous.y === edge.y && nextStart === edge.x
          : previous.x === edge.x && nextStart === edge.y
      );

    if (sameRun) {
      previous.length += 1;
    } else {
      runs.push({ ...edge, length: 1, kind: "hall" });
    }
  }
  return runs;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sideToVector(side) {
  if (side === "north" || side === "n") return { x: 0, y: -1 };
  if (side === "east" || side === "e") return { x: 1, y: 0 };
  if (side === "south" || side === "s") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

function vectorToSide(x, y) {
  if (Math.abs(x) > Math.abs(y)) {
    return x >= 0 ? "e" : "w";
  }
  return y >= 0 ? "s" : "n";
}

function transformSideLabel(side, rotationTurns = 0, flipX = false, flipY = false) {
  let vector = sideToVector(side);
  if (flipX) {
    vector = { x: -vector.x, y: vector.y };
  }
  if (flipY) {
    vector = { x: vector.x, y: -vector.y };
  }
  let { x, y } = vector;
  for (let i = 0; i < ((rotationTurns % 4) + 4) % 4; i += 1) {
    const nextX = -y;
    const nextY = x;
    x = nextX;
    y = nextY;
  }
  return vectorToSide(x, y);
}

function parseExitKey(key) {
  const match = String(key || "").match(/rotunda\d+x\d+(?:-([nesw-]+))?(?:\.png)?$/i);
  if (!match) {
    return ["s"];
  }
  if (!match[1]) {
    return ["s"];
  }
  return match[1].split("-").filter(Boolean);
}

function parseCornerKey(key) {
  const match = String(key || "").match(/round-corner-\d+x\d+-([nesw]{2})(?:\.png)?$/i);
  return [match ? match[1] : "sw"];
}

function transformCornerLabel(label, rotationTurns = 0, flipX = false, flipY = false) {
  const corners = {
    nw: { x: -1, y: -1 },
    ne: { x: 1, y: -1 },
    se: { x: 1, y: 1 },
    sw: { x: -1, y: 1 }
  };
  let vector = corners[label] || corners.sw;
  if (flipX) {
    vector = { x: -vector.x, y: vector.y };
  }
  if (flipY) {
    vector = { x: vector.x, y: -vector.y };
  }
  let { x, y } = vector;
  for (let i = 0; i < ((rotationTurns % 4) + 4) % 4; i += 1) {
    const nextX = -y;
    const nextY = x;
    x = nextX;
    y = nextY;
  }
  for (const [name, candidate] of Object.entries(corners)) {
    if (candidate.x === x && candidate.y === y) {
      return name;
    }
  }
  return "sw";
}

function pickSeededIndex(seedValue, length) {
  if (!length) {
    return 0;
  }
  return hashString(seedValue) % length;
}

function transformLabelList(labels, rotationTurns = 0, flipX = false, flipY = false, transformLabel = transformSideLabel) {
  return [...new Set((labels || []).map((label) => transformLabel(label, rotationTurns, flipX, flipY)))];
}

function chooseTransformedVariant(variants, targetLabels, seedValue, parseLabel, transformLabel = transformSideLabel, options = {}) {
  const target = [...new Set((targetLabels || []).filter(Boolean))].sort().join("-");
  const candidates = [];
  for (const variant of variants || []) {
    const sourceKey = variant?.key || variant?.sourceKey || "";
    const sourceLabels = [...new Set(parseLabel(sourceKey))].sort().join("-");
    for (const rotationTurns of [0, 1, 2, 3]) {
      for (const flipX of [false, true]) {
        for (const flipY of [false, true]) {
          const transformed = transformLabelList(parseLabel(sourceKey), rotationTurns, flipX, flipY, transformLabel)
            .sort()
            .join("-");
          if (transformed === target) {
            const transformCost = (rotationTurns === 0 ? 0 : 1) + (flipX ? 1 : 0) + (flipY ? 1 : 0);
            candidates.push({ variant, rotationTurns, flipX, flipY, sourceLabels, transformCost });
          }
        }
      }
    }
  }
  if (!candidates.length) {
    if (options.allowFallback === false) {
      return null;
    }
    const variant = variants?.[pickSeededIndex(seedValue, variants.length)] || null;
    return variant ? { variant, rotationTurns: 0, flipX: false, flipY: false } : null;
  }
  const ranked = options.preferSimpleTransforms === true
    ? candidates.filter((candidate) => candidate.transformCost === Math.min(...candidates.map((entry) => entry.transformCost)))
    : candidates;
  return ranked[pickSeededIndex(seedValue, ranked.length)];
}

function chooseWallImage(state, run) {
  const pool = Array.isArray(rendererAssets.walls?.[run.side]) && rendererAssets.walls[run.side].length
    ? rendererAssets.walls[run.side].map((entry) => entry.image)
    : [rendererAssets.images[run.side]];
  const runId = run.room?.id || run.hallId || "wall";
  const runStart = run.room ? run.start : `${run.x},${run.y}`;
  const runLengthPx = Math.max(1, Number(run.length || 1) * TILE_SIZE_PX);
  const usable = pool.filter((image) => image && Math.max(image.width || 0, image.height || 0) >= runLengthPx);
  const fallback = pool.filter(Boolean);
  const selectionPool = usable.length ? usable : fallback;
  const hash = hashString(`${state.seed}:${runId}:${run.side}:${runStart}:${run.length}:image`);
  const chosen = selectionPool[hash % Math.max(1, selectionPool.length)] || null;
  return {
    image: chosen,
    side: run.side
  };
}

function getWallDestination(run) {
  const { room, side, start, length } = run;
  const pixels = length * TILE_SIZE_PX;
  if (!room) {
    return {
      x: run.x * TILE_SIZE_PX,
      y: run.y * TILE_SIZE_PX,
      pixels,
      vertical: run.axis === "vertical",
      angle: run.axis === "vertical" ? Math.PI / 2 : 0
    };
  }
  if (side === "north") {
    return { x: (room.x + start) * TILE_SIZE_PX, y: room.y * TILE_SIZE_PX, pixels, vertical: false, angle: 0 };
  }
  if (side === "south") {
    return { x: (room.x + start) * TILE_SIZE_PX, y: (room.y + room.height) * TILE_SIZE_PX, pixels, vertical: false, angle: 0 };
  }
  if (side === "west") {
    return { x: room.x * TILE_SIZE_PX, y: (room.y + start) * TILE_SIZE_PX, pixels, vertical: true, angle: Math.PI / 2 };
  }
  return { x: (room.x + room.width) * TILE_SIZE_PX, y: (room.y + start) * TILE_SIZE_PX, pixels, vertical: true, angle: Math.PI / 2 };
}

function drawWallSlice(ctx, image, state, run) {
  const wallImage = image?.image || image || null;
  if (!wallImage) {
    return;
  }
  const dest = getWallDestination(run);
  const longAxis = Math.max(wallImage.width, wallImage.height);
  const shortAxis = Math.min(wallImage.width, wallImage.height);
  const sliceLength = Math.min(dest.pixels, longAxis);
  const maxOffset = Math.max(0, longAxis - sliceLength);
  const runId = run.room?.id || run.hallId || "wall";
  const runStart = run.room ? run.start : `${run.x},${run.y}`;
  const offset = maxOffset === 0
    ? 0
    : hashString(`${state.seed}:${runId}:${run.side}:${runStart}:${run.length}:slice`) % (maxOffset + 1);
  const sourceIsHorizontal = wallImage.width >= wallImage.height;
  const sx = sourceIsHorizontal ? offset : 0;
  const sy = sourceIsHorizontal ? 0 : offset;
  const sw = sourceIsHorizontal ? sliceLength : shortAxis;
  const sh = sourceIsHorizontal ? shortAxis : sliceLength;
  const thickness = sourceIsHorizontal ? wallImage.height : wallImage.width;
  const outwardInset = Math.max(0, thickness - (TILE_SIZE_PX / 2));

  ctx.save();
  if (dest.vertical) {
    ctx.translate(dest.x, dest.y);
    ctx.rotate(dest.angle);
    if (sourceIsHorizontal) {
      ctx.drawImage(wallImage, sx, sy, sw, sh, 0, -outwardInset, sw, sh);
    } else {
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(wallImage, sx, sy, sw, sh, -outwardInset, -sw, sh, sw);
    }
  } else {
    if (sourceIsHorizontal) {
      ctx.drawImage(wallImage, sx, sy, sw, sh, dest.x, dest.y - outwardInset, sw, sh);
    } else {
      ctx.translate(dest.x, dest.y);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(wallImage, sx, sy, sw, sh, -outwardInset, -sw, sh, sw);
    }
  }
  ctx.restore();
}

function getRunNormal(run) {
  if (run.side === "north") return { x: 0, y: -1 };
  if (run.side === "south") return { x: 0, y: 1 };
  if (run.side === "west") return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function getRunEndpoints(run) {
  const dest = getWallDestination(run);
  if (dest.vertical) {
    return {
      start: { x: dest.x, y: dest.y },
      end: { x: dest.x, y: dest.y + dest.pixels },
      tangent: { x: 0, y: 1 },
      normal: getRunNormal(run),
      pixels: dest.pixels
    };
  }
  return {
    start: { x: dest.x, y: dest.y },
    end: { x: dest.x + dest.pixels, y: dest.y },
    tangent: { x: 1, y: 0 },
    normal: getRunNormal(run),
    pixels: dest.pixels
  };
}

function drawInkWallLine(ctx, run) {
  const edge = getRunEndpoints(run);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK_WALL_COLOR;
  ctx.lineWidth = Math.max(5, TILE_SIZE_PX * 0.13);
  ctx.beginPath();
  ctx.moveTo(edge.start.x, edge.start.y);
  ctx.lineTo(edge.end.x, edge.end.y);
  ctx.stroke();
  ctx.restore();
}

function drawWallHatching(ctx, state, run) {
  const edge = getRunEndpoints(run);
  if (edge.pixels <= HATCH_SPACING_PX) {
    return;
  }

  const runId = run.room?.id || run.hallId || "wall";
  const runStart = run.room ? run.start : `${run.x},${run.y}`;
  const jitterSeed = hashString(`${state.seed}:${runId}:${run.side}:${runStart}:hatch`);
  const direction = (jitterSeed % 2 === 0) ? 1 : -1;
  const strokeOffset = Math.max(4, TILE_SIZE_PX * 0.08);
  const hatchStart = Math.max(8, TILE_SIZE_PX * 0.16);
  const hatchLength = Math.max(10, Math.min(HATCH_LENGTH_PX, TILE_SIZE_PX * 0.35));
  const diagonal = {
    x: edge.normal.x * hatchLength + edge.tangent.x * hatchLength * 0.36 * direction,
    y: edge.normal.y * hatchLength + edge.tangent.y * hatchLength * 0.36 * direction
  };

  ctx.save();
  ctx.strokeStyle = HATCH_COLOR;
  ctx.lineWidth = Math.max(1.2, TILE_SIZE_PX * 0.035);
  ctx.lineCap = "round";
  for (let distance = HATCH_SPACING_PX; distance < edge.pixels; distance += HATCH_SPACING_PX) {
    const jitter = ((jitterSeed + distance * 17) % 5) - 2;
    const baseX = edge.start.x + edge.tangent.x * (distance + jitter) + edge.normal.x * hatchStart;
    const baseY = edge.start.y + edge.tangent.y * (distance + jitter) + edge.normal.y * hatchStart;
    ctx.beginPath();
    ctx.moveTo(baseX - edge.normal.x * strokeOffset, baseY - edge.normal.y * strokeOffset);
    ctx.lineTo(baseX + diagonal.x, baseY + diagonal.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWatabouInspiredWallOverlay(state, ctx, wallRuns) {
  for (const run of wallRuns) {
    if (run.length <= 0) {
      continue;
    }
    drawWallHatching(ctx, state, run);
  }
  for (const run of wallRuns) {
    if (run.length <= 0) {
      continue;
    }
    drawInkWallLine(ctx, run);
  }
}

function drawTileImage(
  ctx,
  image,
  x,
  y,
  rotationTurns = 0,
  widthTiles = 1,
  heightTiles = 1,
  offsetXPx = 0,
  offsetYPx = 0,
  flipX = false,
  flipY = false
) {
  if (!image) {
    return;
  }
  const width = widthTiles * TILE_SIZE_PX;
  const height = heightTiles * TILE_SIZE_PX;
  const px = x * TILE_SIZE_PX + offsetXPx;
  const py = y * TILE_SIZE_PX + offsetYPx;
  const turns = ((Number(rotationTurns) || 0) % 4 + 4) % 4;
  if (!turns && !flipX && !flipY) {
    ctx.drawImage(image, px, py, width, height);
    return;
  }
  ctx.save();
  ctx.translate(px + width / 2, py + height / 2);
  ctx.rotate(turns * Math.PI / 2);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function drawSnappedWaterFlatTile(
  ctx,
  image,
  x,
  y,
  direction = "n",
  rotationTurns = 0,
  offsetXPx = 0,
  offsetYPx = 0,
  flipX = false,
  flipY = false
) {
  if (!image) {
    return;
  }
  const imageWidth = Number(image.naturalWidth || image.width || TILE_SIZE_PX) || TILE_SIZE_PX;
  const imageHeight = Number(image.naturalHeight || image.height || TILE_SIZE_PX * 1.5) || TILE_SIZE_PX * 1.5;
  const spillPx = Math.max(0, imageHeight - TILE_SIZE_PX);
  const tileX = Number(x) * TILE_SIZE_PX;
  const tileY = Number(y) * TILE_SIZE_PX;
  const normalizedDirection = String(direction || "n").toLowerCase();
  const turns = (cardinalToRotationTurns(normalizedDirection) + rotationTurns) % 4;

  let boxX = tileX;
  let boxY = tileY - spillPx;
  let boxWidth = imageWidth;
  let boxHeight = imageHeight;

  if (normalizedDirection === "s" || normalizedDirection === "south") {
    boxY = tileY;
  } else if (normalizedDirection === "e" || normalizedDirection === "east") {
    boxY = tileY;
    boxWidth = imageHeight;
    boxHeight = imageWidth;
  } else if (normalizedDirection === "w" || normalizedDirection === "west") {
    boxX = tileX - spillPx;
    boxY = tileY;
    boxWidth = imageHeight;
    boxHeight = imageWidth;
  }

  ctx.save();
  ctx.translate(boxX + offsetXPx + boxWidth / 2, boxY + offsetYPx + boxHeight / 2);
  ctx.rotate(turns * Math.PI / 2);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
  ctx.restore();
}

function cardinalToRotationTurns(cardinal) {
  if (cardinal === "e" || cardinal === "east") return 1;
  if (cardinal === "s" || cardinal === "south") return 2;
  if (cardinal === "w" || cardinal === "west") return 3;
  return 0;
}

function vectorToCardinal(vector, fallback = "n") {
  const x = Number(vector?.x) || 0;
  const y = Number(vector?.y) || 0;
  if (Math.abs(x) > Math.abs(y)) {
    return x > 0 ? "e" : "w";
  }
  if (Math.abs(y) > 0) {
    return y > 0 ? "s" : "n";
  }
  return fallback;
}

function pickDeterministicImage(images, seedValue) {
  const usable = images.filter(Boolean);
  if (!usable.length) {
    return null;
  }
  return usable[hashString(seedValue) % usable.length];
}

function getImageTileSize(image) {
  if (!image) {
    return { widthTiles: 1, heightTiles: 1 };
  }
  const width = Number(image.naturalWidth || image.width || TILE_SIZE_PX) || TILE_SIZE_PX;
  const height = Number(image.naturalHeight || image.height || TILE_SIZE_PX) || TILE_SIZE_PX;
  return {
    widthTiles: width / TILE_SIZE_PX,
    heightTiles: height / TILE_SIZE_PX
  };
}

function getWaterImageAndRotation(tile, state) {
  const assetKey = String(tile?.assetKey || tile?.asset || tile?.key || "").toLowerCase();
  const exactImage = assetKey ? (rendererAssets.decor.waterByKey?.[assetKey] || null) : null;
  const variant = String(tile?.variant || tile?.shape || tile?.kind || "center").toLowerCase();
  const direction = String(tile?.direction || tile?.edge || tile?.corner || "n").toLowerCase();
  const seedValue = `${state.seed}:water:${tile.x},${tile.y}:${variant}`;
  const nudgeX = (Number(tile?.nudgeX) || 0) * TILE_SIZE_PX;
  const nudgeY = (Number(tile?.nudgeY) || 0) * TILE_SIZE_PX;
  const rotationTurns = Number(tile?.rotationTurns || tile?.rotation || 0) || 0;
  const flipX = tile?.flipX === true;
  const flipY = tile?.flipY === true;
  if (exactImage) {
    if (assetKey.startsWith("water-nw-")) {
      const rotationByCorner = { nw: 0, ne: 1, se: 2, sw: 3 };
      return {
        image: exactImage,
        rotationTurns: (rotationTurns + (rotationByCorner[direction] ?? 0)) % 4,
        offsetXPx: nudgeX,
        offsetYPx: nudgeY,
        flipX,
        flipY,
        ...getImageTileSize(exactImage)
      };
    }
    if (assetKey.startsWith("water-nn-")) {
      return {
        image: exactImage,
        rotationTurns,
        offsetXPx: nudgeX,
        offsetYPx: nudgeY,
        flipX,
        flipY,
        snappedFlat: true,
        direction,
        ...getImageTileSize(exactImage)
      };
    }
    return {
      image: exactImage,
      rotationTurns,
      offsetXPx: nudgeX,
      offsetYPx: nudgeY,
      flipX,
      flipY,
      ...getImageTileSize(exactImage)
    };
  }
  if (variant === "nw" || variant === "diagonal" || ["nw", "ne", "se", "sw"].includes(direction)) {
    const rotationByCorner = { nw: 0, ne: 1, se: 2, sw: 3 };
    const image = pickDeterministicImage(rendererAssets.decor.waterDiagonal, seedValue);
    return {
      image,
      rotationTurns: (rotationTurns + (rotationByCorner[direction] ?? 0)) % 4,
      offsetXPx: nudgeX,
      offsetYPx: nudgeY,
      flipX,
      flipY,
      ...getImageTileSize(image)
    };
  }
  if (variant === "nn" || variant === "edge" || variant === "flat" || ["n", "e", "s", "w"].includes(direction)) {
    const image = pickDeterministicImage(rendererAssets.decor.waterFlat, seedValue);
    return {
      image,
      rotationTurns,
      offsetXPx: nudgeX,
      offsetYPx: nudgeY,
      flipX,
      flipY: flipY || hashString(`${seedValue}:flip`) % 2 === 0,
      snappedFlat: true,
      direction,
      ...getImageTileSize(image)
    };
  }
  const image = rendererAssets.decor.waterCenter;
  return {
    image,
    rotationTurns,
    offsetXPx: nudgeX,
    offsetYPx: nudgeY,
    flipX,
    flipY,
    ...getImageTileSize(image)
  };
}

function drawWaterDecor(state, ctx) {
  const water = Array.isArray(state.decor?.water) ? state.decor.water : [];
  for (const tile of water) {
    if (!Number.isFinite(Number(tile?.x)) || !Number.isFinite(Number(tile?.y))) {
      continue;
    }
    const {
      image,
      rotationTurns,
      offsetXPx,
      offsetYPx,
      widthTiles,
      heightTiles,
      flipX,
      flipY,
      snappedFlat,
      direction
    } = getWaterImageAndRotation(tile, state);
    if (snappedFlat) {
      drawSnappedWaterFlatTile(
        ctx,
        image,
        Number(tile.x),
        Number(tile.y),
        direction,
        rotationTurns,
        offsetXPx,
        offsetYPx,
        flipX,
        flipY
      );
      continue;
    }
    drawTileImage(
      ctx,
      image,
      Number(tile.x),
      Number(tile.y),
      rotationTurns,
      widthTiles,
      heightTiles,
      offsetXPx,
      offsetYPx,
      flipX,
      flipY
    );
  }
}

function getRoomOpenings(room) {
  const openings = Array.isArray(room?.rotundaOpenings) && room.rotundaOpenings.length
    ? room.rotundaOpenings
    : [room?.rotundaOpening || room?.opening || "south"];
  return [...new Set(openings.map((opening) => String(opening).toLowerCase()))].filter(Boolean);
}

function getRotundaAssetSize(room) {
  const size = Number(room?.rotundaSize || room?.width || room?.height || 7);
  return size === 5 ? 5 : 7;
}

function getRotundaArtFootprint(room) {
  const size = getRotundaAssetSize(room);
  if (size === 5) {
    return {
      size,
      x: Number(room.x),
      y: Number(room.y),
      drawSize: 5
    };
  }
  return {
    size,
    x: Number(room.x) - 1,
    y: Number(room.y) - 1,
    drawSize: 9
  };
}

function drawRotundaDecor(state, ctx) {
  for (const room of state.rooms || []) {
    if (room.rotunda !== true) {
      continue;
    }
    const size = getRotundaAssetSize(room);
    const variants = rendererAssets.decor.rotundas[size]?.length
      ? rendererAssets.decor.rotundas[size]
      : rendererAssets.decor.rotundas[7];
    const openings = getRoomOpenings(room);
    const targetLabels = openings.map((opening) => {
      if (opening === "north" || opening === "n") return "n";
      if (opening === "east" || opening === "e") return "e";
      if (opening === "south" || opening === "s") return "s";
      return "w";
    });
    const chosen = chooseTransformedVariant(
      variants,
      targetLabels.length ? targetLabels : ["s"],
      `${state.seed}:rotunda:${room.id}:${openings.join("-")}`,
      parseExitKey,
      transformSideLabel,
      { allowFallback: false, preferSimpleTransforms: true }
    );
    if (!chosen?.variant?.image) {
      continue;
    }
    const footprint = getRotundaArtFootprint(room);
    drawTileImage(
      ctx,
      chosen.variant.image,
      footprint.x,
      footprint.y,
      chosen.rotationTurns,
      footprint.drawSize,
      footprint.drawSize,
      0,
      0,
      chosen.flipX,
      chosen.flipY
    );
  }
}

function drawRoundedCornerDecor(state, ctx) {
  if (!ROUND_CORNERS_ENABLED) {
    return;
  }
  for (const room of state.rooms || []) {
    const cornerSize = Number(room.cornerSize || 0);
    if (cornerSize !== 1 || room.rotunda === true) {
      continue;
    }
    const variants = rendererAssets.decor.corners[cornerSize] || rendererAssets.decor.corners[1] || [];
    if (!variants.length) {
      continue;
    }
    const placements = [
      { label: "nw", x: Number(room.x), y: Number(room.y) },
      { label: "ne", x: Number(room.x + room.width - cornerSize), y: Number(room.y) },
      { label: "se", x: Number(room.x + room.width - cornerSize), y: Number(room.y + room.height - cornerSize) },
      { label: "sw", x: Number(room.x), y: Number(room.y + room.height - cornerSize) }
    ];
    for (const placement of placements) {
      const exact = variants.find((variant) => parseCornerKey(variant.key)[0] === placement.label);
      if (!exact?.image) {
        continue;
      }
      drawTileImage(
        ctx,
        exact.image,
        placement.x,
        placement.y,
        0,
        cornerSize,
        cornerSize,
        0,
        0,
        false,
        false
      );
    }
  }
}

function drawColumnDecor(state, ctx) {
  const columns = Array.isArray(state.decor?.columns) ? state.decor.columns : [];
  for (const column of columns) {
    if (!Number.isFinite(Number(column?.x)) || !Number.isFinite(Number(column?.y))) {
      continue;
    }
    const style = String(column.style || column.type || "").toLowerCase();
    const pool = style === "b" || style === "block" ? rendererAssets.decor.blockPillars : rendererAssets.decor.pillars;
    const image = pickDeterministicImage(pool, `${state.seed}:pillar:${style}:${column.x},${column.y}`);
    const placement = String(column.placement || "center");
    const drawX = placement === "vertex" ? Number(column.x) - 0.5 : Number(column.x);
    const drawY = placement === "vertex" ? Number(column.y) - 0.5 : Number(column.y);
    drawTileImage(ctx, image, drawX, drawY, 0);
  }
}

function drawHandDrawnTopology(state, ctx) {
  const floorImage = rendererAssets.images.floor;
  for (const tile of state.tiles) {
    if (!isWalkableTile(tile)) {
      continue;
    }
    const dx = tile.x * TILE_SIZE_PX;
    const dy = tile.y * TILE_SIZE_PX;
    const sx = (dx % floorImage.width);
    const sy = (dy % floorImage.height);
    ctx.drawImage(floorImage, sx, sy, TILE_SIZE_PX, TILE_SIZE_PX, dx, dy, TILE_SIZE_PX, TILE_SIZE_PX);
  }
  drawWaterDecor(state, ctx);
  drawRotundaDecor(state, ctx);

  const wallRuns = [
    ...collectWallRuns(state),
    ...collectHallWallRuns(state)
  ];
  for (const run of wallRuns) {
    if (run.length <= 0) {
      continue;
    }
    drawWallSlice(ctx, chooseWallImage(state, run), state, run);
  }
  drawRoundedCornerDecor(state, ctx);
  if (USE_WATABOU_INK_OVERLAY) {
    drawWatabouInspiredWallOverlay(state, ctx, wallRuns);
  }
  drawColumnDecor(state, ctx);
}

function getDoorBoundaryCenter(entity) {
  const size = TILE_SIZE_PX;
  const verticalWall = entity.orientation !== "horizontal";

  if (verticalWall) {
    const boundaryX = entity.hallDirection === "east" ? entity.x * size : (entity.x + 1) * size;
    return {
      x: boundaryX,
      y: entity.y * size + size / 2
    };
  }

  const boundaryY = entity.hallDirection === "south" ? entity.y * size : (entity.y + 1) * size;
  return {
    x: entity.x * size + size / 2,
    y: boundaryY
  };
}

function getRoomSideInwardOffset(entity) {
  const half = TILE_SIZE_PX / 2;
  if (entity.wallSide === "east") return { x: -half, y: 0 };
  if (entity.wallSide === "west") return { x: half, y: 0 };
  if (entity.wallSide === "south") return { x: 0, y: -half };
  return { x: 0, y: half };
}

function getDoorTileCenter(entity) {
  const size = TILE_SIZE_PX;
  return {
    x: entity.x * size + size / 2,
    y: entity.y * size + size / 2
  };
}

function getDoorRotationAngle(entity) {
  const angle = Number(entity.doorRotationAngle || 0);
  if (entity.orientation !== "horizontal") {
    return angle < 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  return Math.abs(angle) > Math.PI / 2 ? Math.PI : 0;
}

function getDoorTrap(state, door) {
  return state.entities.find((entity) => (
    entity.type === ENTITY_TYPES.TRAP &&
    entity.targetType === "door" &&
    entity.targetEntityId === door.id &&
    !entity.disarmed
  )) || null;
}

function getDoorSpriteKey(state, door) {
  const baseKey = door.doorSpriteId || "door1";
  const trap = getDoorTrap(state, door);
  if (trap?.wasSprung || trap?.revealed || trap?.visible) {
    return `${baseKey}-t`;
  }
  if (door.doorState === DOOR_STATES.OPEN) {
    return `${baseKey}-o`;
  }
  if (door.doorState === DOOR_STATES.LOCKED) {
    return `${baseKey}-l`;
  }
  return baseKey;
}

function getDoorVisualKind(state, door) {
  const explicit = String(door.doorKind || door.visualKind || "").toLowerCase();
  if (explicit) {
    return explicit;
  }
  const watabouType = Number(door.watabouDoorType ?? door.type);
  if (watabouType === 3) return "stairs-up";
  if (watabouType === 8 || watabouType === 9) return "stairs-down";
  if (watabouType === 5) return "gate";
  const trap = getDoorTrap(state, door);
  if (trap?.wasSprung || trap?.revealed || trap?.visible) {
    return "trap";
  }
  if (door.secret === true || door.isSecret === true) {
    return "secret";
  }
  if (door.gone === true || door.destroyed === true || door.doorState === "gone") {
    return "gone";
  }
  if (door.portcullis === true || door.doorState === "portcullis") {
    return "portcullis";
  }
  if (door.doorState === DOOR_STATES.OPEN) {
    return "open";
  }
  return "closed";
}

function getDoorDirectionCardinal(door) {
  const explicit = String(door.highestStep || door.directionName || door.cardinal || "").toLowerCase();
  const value = explicit || vectorToCardinal(door.dir || door.direction, door.wallSide || door.hallDirection || "n");
  if (value === "north") return "n";
  if (value === "east") return "e";
  if (value === "south") return "s";
  if (value === "west") return "w";
  return value || "n";
}

function drawStairSprite(entity, ctx, kind) {
  const cardinal = getDoorDirectionCardinal(entity);
  const center = getDoorBoundaryCenter(entity);
  const inward = getRoomSideInwardOffset(entity);
  const size = TILE_SIZE_PX;
  let image = null;
  let rotationTurns = 0;
  if (kind === "stairs-up") {
    image = rendererAssets.decor.stairsUp[cardinal] || rendererAssets.decor.stairsUp.n;
  } else {
    image = pickDeterministicImage(rendererAssets.decor.stairsDown, `stairs:${entity.id || ""}:${entity.x},${entity.y}`);
    rotationTurns = cardinalToRotationTurns(cardinal);
  }
  if (!image) {
    return false;
  }
  ctx.save();
  ctx.translate(center.x + inward.x, center.y + inward.y);
  ctx.rotate(rotationTurns * Math.PI / 2);
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

function getNewDoorSpriteKey(state, door) {
  const kind = getDoorVisualKind(state, door);
  if (kind === "gate" || kind === "portcullis") {
    return "door-portcullis";
  }
  if (kind === "secret") {
    return "door-secret";
  }
  if (kind === "trap") {
    return "door-trap";
  }
  if (kind === "gone") {
    return "door-gone";
  }
  if (kind === "open") {
    return "door-open";
  }
  return "door-closed";
}

function drawDoorFallback(state, entity, ctx) {
  const center = getDoorBoundaryCenter(entity);
  const size = TILE_SIZE_PX;
  const thickness = Math.max(4, size * 0.12);
  const length = size * 0.72;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(getDoorRotationAngle(entity));
  ctx.fillStyle = entity.doorState === DOOR_STATES.OPEN ? "#c99a57" : "#2b160d";
  if (getDoorTrap(state, entity)?.revealed) {
    ctx.fillStyle = "#4b1a4f";
  }
  ctx.fillRect(-length / 2, -thickness / 2, length, thickness);
  ctx.restore();
}

function drawDoorSprite(state, entity, ctx) {
  const visualKind = getDoorVisualKind(state, entity);
  if (visualKind === "stairs-up" || visualKind === "stairs-down") {
    if (drawStairSprite(entity, ctx, visualKind)) {
      return;
    }
  }
  const newKey = getNewDoorSpriteKey(state, entity);
  const key = getDoorSpriteKey(state, entity);
  const image = rendererAssets.doors[newKey] || rendererAssets.doors[key] || rendererAssets.doors[entity.doorSpriteId || "door1"];
  if (!image) {
    drawDoorFallback(state, entity, ctx);
    return;
  }

  const center = getDoorTileCenter(entity);
  const size = TILE_SIZE_PX;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(getDoorRotationAngle(entity));
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawTopology(state, ctx) {
  for (const tile of state.tiles) {
    const px = tile.x * TILE_SIZE_PX;
    const py = tile.y * TILE_SIZE_PX;

    if (tile.type === TILE_TYPES.FLOOR) {
      ctx.fillStyle = "#8d8f94";
      ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
    } else {
      ctx.fillStyle = "#282828";
      ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
    }
  }
}

function drawEntity(entity, ctx, state) {
  const cx = entity.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const cy = entity.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const radius = TILE_SIZE_PX * 0.24;

  if (entity.subtype === "door") {
    drawDoorSprite(state, entity, ctx);
    return;
  }

  if (entity.subtype === "dropped-equipment" && Number(entity.lightRadius) > 0) {
    ctx.save();
    const isLantern = entity.lightSource === "lantern";
    ctx.fillStyle = "rgba(255, 209, 78, 0.22)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.9, 0, Math.PI * 2);
    ctx.fill();
    if (isLantern) {
      ctx.fillStyle = "#9ea3aa";
      ctx.strokeStyle = "#ffd14e";
      ctx.lineWidth = Math.max(1, TILE_SIZE_PX * 0.05);
      ctx.fillRect(cx - radius * 0.65, cy - radius * 0.8, radius * 1.3, radius * 1.55);
      ctx.strokeRect(cx - radius * 0.65, cy - radius * 0.8, radius * 1.3, radius * 1.55);
      ctx.fillStyle = "#ffd14e";
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.32, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#6f2d16";
      ctx.lineWidth = Math.max(2, TILE_SIZE_PX * 0.08);
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.45, cy + radius * 0.85);
      ctx.lineTo(cx + radius * 0.35, cy - radius * 0.65);
      ctx.stroke();
      ctx.fillStyle = "#ffd14e";
      ctx.beginPath();
      ctx.arc(cx + radius * 0.42, cy - radius * 0.82, radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c53320";
      ctx.beginPath();
      ctx.arc(cx + radius * 0.42, cy - radius * 0.82, radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  switch (entity.type) {
    case ENTITY_TYPES.MONSTER:
      ctx.fillStyle = "#be2d2d";
      break;
    case ENTITY_TYPES.TREASURE:
      ctx.fillStyle = "#e0bc2f";
      break;
    case ENTITY_TYPES.TRAP:
      ctx.fillStyle = "#a22dcf";
      break;
    default:
      ctx.fillStyle = "#4db1a7";
      break;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawObjects(state, ctx, options = {}) {
  for (const entity of state.entities) {
    if (entity.visible === false) {
      continue;
    }
    if (
      options.darkness === true &&
      entity.type === ENTITY_TYPES.FEATURE &&
      entity.subtype !== "door" &&
      entity.darknessRevealed !== true
    ) {
      continue;
    }
    if (entity.type === ENTITY_TYPES.MONSTER && entity.defeated) {
      continue;
    }
    if (entity.type === ENTITY_TYPES.TREASURE && entity.collected) {
      continue;
    }
    drawEntity(entity, ctx, state);
  }
}

function drawPlayer(state, ctx) {
  const cx = state.player.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const cy = state.player.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const radius = TILE_SIZE_PX * 0.27;
  ctx.fillStyle = "#3a7bd5";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawCharacterDot(character, ctx, isActive) {
  const cx = character.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const cy = character.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const radius = TILE_SIZE_PX * 0.27;
  ctx.fillStyle = character.colorValue || "#174a9c";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  if (character.guarding) {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  if (isActive) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawCharacters(state, ctx) {
  const characters = (state.characters || []).filter((character) => (
    character.dead !== true &&
    character.slain !== true &&
    character.x !== null &&
    character.x !== undefined &&
    character.y !== null &&
    character.y !== undefined &&
    Number.isFinite(Number(character.x)) &&
    Number.isFinite(Number(character.y))
  ));
  if (!characters.length) {
    drawPlayer(state, ctx);
    return;
  }
  for (const character of characters) {
    drawCharacterDot(character, ctx, character.id === state.activeCharacterId);
  }
}

function isRoomCurrentlyVisible(state, room) {
  for (let y = Number(room.y); y < Number(room.y + room.height); y += 1) {
    for (let x = Number(room.x); x < Number(room.x + room.width); x += 1) {
      if (state.visibility.visibleNow.has(tileKey(x, y))) {
        return true;
      }
    }
  }
  return false;
}

function getRotundaFogAlpha(state, tile) {
  for (const room of state.rooms || []) {
    if (room.rotunda !== true || !isRoomCurrentlyVisible(state, room)) {
      continue;
    }
    const footprint = getRotundaArtFootprint(room);
    if (
      tile.x < footprint.x ||
      tile.y < footprint.y ||
      tile.x >= footprint.x + footprint.drawSize ||
      tile.y >= footprint.y + footprint.drawSize
    ) {
      continue;
    }
    const localX = tile.x - footprint.x;
    const localY = tile.y - footprint.y;
    const max = footprint.drawSize - 1;
    if (footprint.size === 5) {
      const openings = new Set(getRoomOpenings(room).map((opening) => String(opening || "")[0]));
      const isInnerRotunda = localX >= 1 && localX <= 3 && localY >= 1 && localY <= 3;
      const isExit =
        (openings.has("n") && localX === 2 && localY === 0) ||
        (openings.has("s") && localX === 2 && localY === 4) ||
        (openings.has("w") && localX === 0 && localY === 2) ||
        (openings.has("e") && localX === 4 && localY === 2);
      return isInnerRotunda || isExit ? 0.18 : null;
    }
    const center = footprint.drawSize / 2;
    const dx = (localX + 0.5) - center;
    const dy = (localY + 0.5) - center;
    return Math.sqrt(dx * dx + dy * dy) <= footprint.size / 2 ? 0.24 : null;
  }
  return null;
}

function getRotundaVisibleBlackoutAlpha(state, tile) {
  for (const room of state.rooms || []) {
    if (room.rotunda !== true || !isRoomCurrentlyVisible(state, room)) {
      continue;
    }
    const footprint = getRotundaArtFootprint(room);
    if (footprint.size !== 5) {
      continue;
    }
    if (
      tile.x < footprint.x ||
      tile.y < footprint.y ||
      tile.x >= footprint.x + footprint.drawSize ||
      tile.y >= footprint.y + footprint.drawSize
    ) {
      continue;
    }
    const localX = tile.x - footprint.x;
    const localY = tile.y - footprint.y;
    const openings = new Set(getRoomOpenings(room).map((opening) => String(opening || "")[0]));
    const isInnerRotunda = localX >= 1 && localX <= 3 && localY >= 1 && localY <= 3;
    const isExit =
      (openings.has("n") && localX === 2 && localY === 0) ||
      (openings.has("s") && localX === 2 && localY === 4) ||
      (openings.has("w") && localX === 0 && localY === 2) ||
      (openings.has("e") && localX === 4 && localY === 2);
    if (isInnerRotunda || isExit) {
      return null;
    }
    return 0.95;
  }
  return null;
}

function getRoundedCornerFogAlpha(state, tile) {
  if (!ROUND_CORNERS_ENABLED) {
    return null;
  }
  for (const room of state.rooms || []) {
    const cornerSize = Number(room.cornerSize || 0);
    if (cornerSize !== 1 || room.rotunda === true || !isRoomCurrentlyVisible(state, room)) {
      continue;
    }
    const placements = [
      { x: Number(room.x), y: Number(room.y) },
      { x: Number(room.x + room.width - cornerSize), y: Number(room.y) },
      { x: Number(room.x + room.width - cornerSize), y: Number(room.y + room.height - cornerSize) },
      { x: Number(room.x), y: Number(room.y + room.height - cornerSize) }
    ];
    if (placements.some((placement) => (
      tile.x >= placement.x &&
      tile.y >= placement.y &&
      tile.x < placement.x + cornerSize &&
      tile.y < placement.y + cornerSize
    ))) {
      return cornerSize === 1 ? 0.08 : 0.22;
    }
  }
  return null;
}

function getCurvedDecorFogAlpha(state, tile, fallbackAlpha) {
  const rotundaAlpha = getRotundaFogAlpha(state, tile);
  const cornerAlpha = getRoundedCornerFogAlpha(state, tile);
  const candidates = [rotundaAlpha, cornerAlpha].filter((value) => value !== null);
  if (!candidates.length) {
    return fallbackAlpha;
  }
  return Math.min(fallbackAlpha, ...candidates);
}

function drawFog(state, ctx, widthPx, heightPx, forceBlackout) {
  if (forceBlackout) {
    for (const tile of state.tiles) {
      const key = tileKey(tile.x, tile.y);
      const px = tile.x * TILE_SIZE_PX;
      const py = tile.y * TILE_SIZE_PX;
      ctx.fillStyle = state.visibility.exploredEver.has(key)
        ? "rgba(0, 0, 0, 0.82)"
        : "rgba(0, 0, 0, 1)";
      ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
    }
    return;
  }

  for (const tile of state.tiles) {
    const key = tileKey(tile.x, tile.y);
    const px = tile.x * TILE_SIZE_PX;
    const py = tile.y * TILE_SIZE_PX;
    if (state.visibility.visibleNow.has(key)) {
      const visibleBlackoutAlpha = getRotundaVisibleBlackoutAlpha(state, tile);
      if (visibleBlackoutAlpha !== null) {
        ctx.fillStyle = `rgba(0, 0, 0, ${visibleBlackoutAlpha})`;
        ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
      }
      continue;
    }
    if (state.visibility.exploredEver.has(key)) {
      const alpha = getCurvedDecorFogAlpha(state, tile, 0.45);
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
    } else {
      const alpha = getCurvedDecorFogAlpha(state, tile, 0.95);
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
    }
  }
  drawClosedDoorFogBisectors(state, ctx);
}

function drawClosedDoorFogBisectors(state, ctx) {
  const sourceX = Number(state.player?.x) || 0;
  const sourceY = Number(state.player?.y) || 0;
  for (const door of state.entities || []) {
    if (door.subtype !== "door" || door.doorState === DOOR_STATES.OPEN) {
      continue;
    }
    const key = tileKey(door.x, door.y);
    if (!state.visibility.visibleNow.has(key)) {
      continue;
    }
    const px = door.x * TILE_SIZE_PX;
    const py = door.y * TILE_SIZE_PX;
    const half = TILE_SIZE_PX / 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
    if (door.orientation !== "horizontal") {
      if (sourceX <= door.x) {
        ctx.fillRect(px + half, py, half, TILE_SIZE_PX);
      } else {
        ctx.fillRect(px, py, half, TILE_SIZE_PX);
      }
      continue;
    }
    if (sourceY <= door.y) {
      ctx.fillRect(px, py + half, TILE_SIZE_PX, half);
    } else {
      ctx.fillRect(px, py, TILE_SIZE_PX, half);
    }
  }
}

export function renderDungeon(state, layers, options = {}) {
  const widthPx = state.map.width * TILE_SIZE_PX;
  const heightPx = state.map.height * TILE_SIZE_PX;
  const { backgroundCtx, topologyCtx, objectsCtx, fogCtx } = layers;
  const now = options.now ?? performance.now();

  if (USE_HAND_DRAWN_RENDERER && rendererAssets.ready) {
    drawHandDrawnBackground(backgroundCtx, widthPx, heightPx);
  } else {
    drawBackground(backgroundCtx, widthPx, heightPx);
  }
  topologyCtx.clearRect(0, 0, widthPx, heightPx);
  if (USE_HAND_DRAWN_RENDERER && rendererAssets.ready) {
    drawHandDrawnTopology(state, topologyCtx);
  } else {
    drawTopology(state, topologyCtx);
  }
  objectsCtx.clearRect(0, 0, widthPx, heightPx);
  objectsCtx.__doorNow = now;
  drawObjects(state, objectsCtx, { darkness: options.forceBlackout === true });
  fogCtx.clearRect(0, 0, widthPx, heightPx);
  drawFog(state, fogCtx, widthPx, heightPx, options.forceBlackout === true);
  drawCharacters(state, fogCtx);
}
