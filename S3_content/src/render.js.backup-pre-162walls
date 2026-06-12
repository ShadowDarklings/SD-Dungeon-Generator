import { DOOR_STATES, ENTITY_TYPES, TILE_SIZE_PX, TILE_TYPES } from "./constants.js";
import { tileKey } from "./state-schema.js";

const USE_HAND_DRAWN_RENDERER = true;
const ASSET_PATHS = Object.freeze({
  stone: "./assets/map_background_dark.jpg",
  floor: "./assets/room_grid_backgroung.jpg",
  north: "./assets/54x810-1x15-n.png",
  west: "./assets/54x810-1x15-w.png",
  east: "./assets/54x810-1x15-e.png",
  south: "./assets/54x810-1x15-s.png"
});
const DOOR_SPRITE_COUNT = 4;
const DOOR_STATE_SUFFIXES = Object.freeze(["", "-o", "-l", "-t"]);

const rendererAssets = {
  ready: false,
  images: {},
  doors: {}
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load renderer asset: ${src}`));
    image.src = src;
  });
}

async function loadOptionalImage(src) {
  try {
    return await loadImage(src);
  } catch (error) {
    console.warn(error.message);
    return null;
  }
}

export async function preloadRendererAssets() {
  const entries = await Promise.all(
    Object.entries(ASSET_PATHS).map(async ([key, src]) => [key, await loadImage(src)])
  );
  rendererAssets.images = Object.fromEntries(entries);
  const doorEntries = [];
  for (let i = 1; i <= DOOR_SPRITE_COUNT; i += 1) {
    for (const suffix of DOOR_STATE_SUFFIXES) {
      const key = `door${i}${suffix}`;
      doorEntries.push([key, await loadOptionalImage(`./assets/${key}.png`)]);
    }
  }
  rendererAssets.doors = Object.fromEntries(doorEntries);
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
  return state.rooms.flatMap((room) => (
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

function chooseWallImage(state, run) {
  const upperPool = [rendererAssets.images.north, rendererAssets.images.west];
  const lowerPool = [rendererAssets.images.south, rendererAssets.images.east];
  const pool = run.side === "north" || run.side === "west" ? upperPool : lowerPool;
  const runId = run.room?.id || run.hallId || "wall";
  const runStart = run.room ? run.start : `${run.x},${run.y}`;
  const hash = hashString(`${state.seed}:${runId}:${run.side}:${runStart}:${run.length}:image`);
  return pool[hash % pool.length];
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
  const dest = getWallDestination(run);
  const longAxis = Math.max(image.width, image.height);
  const shortAxis = Math.min(image.width, image.height);
  const sliceLength = Math.min(dest.pixels, longAxis);
  const maxOffset = Math.max(0, longAxis - sliceLength);
  const runId = run.room?.id || run.hallId || "wall";
  const runStart = run.room ? run.start : `${run.x},${run.y}`;
  const offset = maxOffset === 0
    ? 0
    : hashString(`${state.seed}:${runId}:${run.side}:${runStart}:${run.length}:slice`) % (maxOffset + 1);
  const sourceIsHorizontal = image.width >= image.height;
  const sx = sourceIsHorizontal ? offset : 0;
  const sy = sourceIsHorizontal ? 0 : offset;
  const sw = sourceIsHorizontal ? sliceLength : shortAxis;
  const sh = sourceIsHorizontal ? shortAxis : sliceLength;

  ctx.save();
  if (dest.vertical) {
    ctx.translate(dest.x, dest.y);
    ctx.rotate(dest.angle);
    if (sourceIsHorizontal) {
      ctx.drawImage(image, sx, sy, sw, sh, 0, -TILE_SIZE_PX / 2, dest.pixels, TILE_SIZE_PX);
    } else {
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(image, sx, sy, sw, sh, -TILE_SIZE_PX / 2, -dest.pixels, TILE_SIZE_PX, dest.pixels);
    }
  } else {
    if (sourceIsHorizontal) {
      ctx.drawImage(image, sx, sy, sw, sh, dest.x, dest.y - TILE_SIZE_PX / 2, dest.pixels, TILE_SIZE_PX);
    } else {
      ctx.translate(dest.x, dest.y);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(image, sx, sy, sw, sh, -TILE_SIZE_PX / 2, -dest.pixels, TILE_SIZE_PX, dest.pixels);
    }
  }
  ctx.restore();
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
  const key = getDoorSpriteKey(state, entity);
  const image = rendererAssets.doors[key] || rendererAssets.doors[entity.doorSpriteId || "door1"];
  if (!image) {
    drawDoorFallback(state, entity, ctx);
    return;
  }

  const center = getDoorBoundaryCenter(entity);
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
      continue;
    }
    if (state.visibility.exploredEver.has(key)) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
    } else {
      ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
      ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
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
  drawPlayer(state, objectsCtx);
  fogCtx.clearRect(0, 0, widthPx, heightPx);
  drawFog(state, fogCtx, widthPx, heightPx, options.forceBlackout === true);
}
