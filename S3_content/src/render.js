import { DOOR_STATES, ENTITY_TYPES, TILE_SIZE_PX, TILE_TYPES } from "./constants.js";
import { tileKey } from "./state-schema.js";

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

function drawTopology(state, ctx) {
  for (const tile of state.tiles) {
    const px = tile.x * TILE_SIZE_PX;
    const py = tile.y * TILE_SIZE_PX;

    if (tile.type === TILE_TYPES.FLOOR || tile.type === TILE_TYPES.DOOR) {
      const door = state.entities.find(
        (entity) => entity.subtype === "door" && entity.x === tile.x && entity.y === tile.y
      );
      ctx.fillStyle = tile.type === TILE_TYPES.DOOR && door?.doorState !== DOOR_STATES.OPEN
        ? "#5a3928"
        : "#8d8f94";
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

function drawEntity(entity, ctx) {
  const cx = entity.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const cy = entity.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const radius = TILE_SIZE_PX * 0.24;

  if (entity.subtype === "door") {
    ctx.strokeStyle = entity.doorState === DOOR_STATES.OPEN ? "#c99a57" : "#2b160d";
    ctx.lineWidth = entity.doorState === DOOR_STATES.LOCKED ? 8 : 5;
    ctx.beginPath();
    ctx.moveTo(entity.x * TILE_SIZE_PX + 10, cy);
    ctx.lineTo((entity.x + 1) * TILE_SIZE_PX - 10, cy);
    ctx.stroke();
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

function drawObjects(state, ctx) {
  for (const entity of state.entities) {
    if (entity.visible === false) {
      continue;
    }
    if (entity.type === ENTITY_TYPES.MONSTER && entity.defeated) {
      continue;
    }
    if (entity.type === ENTITY_TYPES.TREASURE && entity.collected) {
      continue;
    }
    drawEntity(entity, ctx);
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

function drawDebugOverlay(state, ctx) {
  ctx.save();
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const room of state.rooms) {
    const cx = (room.x + room.width / 2) * TILE_SIZE_PX;
    const cy = (room.y + room.height / 2) * TILE_SIZE_PX;
    ctx.fillStyle = "rgba(20, 20, 20, 0.75)";
    ctx.fillRect(cx - 28, cy - 10, 56, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(room.id, cx, cy);
  }

  const labeledHalls = new Set();
  for (const tile of state.tiles) {
    if (!tile.hallId || labeledHalls.has(tile.hallId)) {
      continue;
    }
    labeledHalls.add(tile.hallId);
    const cx = tile.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
    const cy = tile.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
    ctx.fillStyle = "rgba(10, 50, 90, 0.75)";
    ctx.fillRect(cx - 24, cy - 9, 48, 18);
    ctx.fillStyle = "#d8ecff";
    ctx.fillText(tile.hallId, cx, cy);
  }

  for (const door of state.entities.filter((entity) => entity.subtype === "door")) {
    const cx = door.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
    const cy = door.y * TILE_SIZE_PX + TILE_SIZE_PX / 2 + 13;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(door.doorState, cx, cy);
  }

  const radiusPx = state.player.lightRadius * TILE_SIZE_PX;
  const playerCx = state.player.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const playerCy = state.player.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  ctx.strokeStyle = "rgba(255, 230, 120, 0.8)";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    playerCx - radiusPx - TILE_SIZE_PX / 2,
    playerCy - radiusPx - TILE_SIZE_PX / 2,
    radiusPx * 2 + TILE_SIZE_PX,
    radiusPx * 2 + TILE_SIZE_PX
  );

  ctx.restore();
}

function drawFog(state, ctx, widthPx, heightPx, forceBlackout) {
  if (forceBlackout) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
    ctx.fillRect(0, 0, widthPx, heightPx);
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

  drawBackground(backgroundCtx, widthPx, heightPx);
  topologyCtx.clearRect(0, 0, widthPx, heightPx);
  drawTopology(state, topologyCtx);
  objectsCtx.clearRect(0, 0, widthPx, heightPx);
  drawObjects(state, objectsCtx);
  drawPlayer(state, objectsCtx);
  if (options.debug) {
    drawDebugOverlay(state, objectsCtx);
  }
  fogCtx.clearRect(0, 0, widthPx, heightPx);
  drawFog(state, fogCtx, widthPx, heightPx, options.forceBlackout === true);
}
