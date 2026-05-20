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

function getDoorBaseAngle(entity) {
  return entity.orientation === "horizontal" ? Math.PI / 2 : 0;
}

function getDoorDebugOffset(entity) {
  return {
    x: Number(entity.debugOffsetX || 0),
    y: Number(entity.debugOffsetY || 0)
  };
}

function getDoorDebugAnimationConfig(entity) {
  const mode = entity.debugAnimationMode || null;
  if (!mode) {
    return {
      hingeSide: entity.hingeSide,
      swingTarget: entity.swingTarget,
      turnDirection: entity.turnDirection || 1
    };
  }

  if (mode === "opposite-pivot") {
    return {
      hingeSide: entity.hingeSide === "north"
        ? "south"
        : entity.hingeSide === "south"
          ? "north"
          : entity.hingeSide === "west"
            ? "east"
            : "west",
      swingTarget: entity.swingTarget,
      turnDirection: entity.turnDirection || 1
    };
  }

  if (mode === "swap-90-180") {
    return {
      hingeSide: entity.hingeSide,
      swingTarget: entity.swingTarget === "room" ? "hall" : "room",
      turnDirection: entity.turnDirection || 1
    };
  }

  if (mode === "flip-cw-ccw") {
    return {
      hingeSide: entity.hingeSide,
      swingTarget: entity.swingTarget,
      turnDirection: (entity.turnDirection || 1) * -1
    };
  }

  return {
    hingeSide: entity.hingeSide,
    swingTarget: entity.swingTarget,
    turnDirection: entity.turnDirection || 1
  };
}

function getDoorOpenAngle(entity) {
  const debug = getDoorDebugAnimationConfig(entity);
  const magnitude = debug.swingTarget === "room" ? Math.PI : Math.PI / 2;
  const direction = debug.turnDirection || 1;
  return getDoorBaseAngle(entity) + direction * magnitude;
}

function getDoorAngle(entity, now) {
  const closedAngle = getDoorBaseAngle(entity);
  const openAngle = getDoorOpenAngle(entity);
  const transition = entity.transition;
  if (!transition) {
    return entity.doorState === DOOR_STATES.OPEN ? openAngle : closedAngle;
  }

  const elapsed = Math.max(0, now - transition.startedAt);
  const progress = Math.min(1, elapsed / transition.duration);
  const fromAngle = transition.from === DOOR_STATES.OPEN ? openAngle : closedAngle;
  const toAngle = transition.to === DOOR_STATES.OPEN ? openAngle : closedAngle;
  if (progress >= 1) {
    return toAngle;
  }
  return fromAngle + (toAngle - fromAngle) * progress;
}

function getDoorGeometry(entity) {
  const size = TILE_SIZE_PX;
  const leafLength = size * 0.62;
  const leafThickness = Math.max(4, size * 0.16);
  const inset = size * 0.18;
  const verticalWall = entity.orientation !== "horizontal";
  const offset = getDoorDebugOffset(entity);
  const debug = getDoorDebugAnimationConfig(entity);
  const hingeSide = debug.hingeSide || entity.hingeSide;

  if (verticalWall) {
    const boundaryX = (entity.hallDirection === "east" ? entity.x * size : (entity.x + 1) * size) + offset.x;
    const hingeY = (hingeSide === "north" ? entity.y * size + inset : (entity.y + 1) * size - inset) + offset.y;
    return {
      hingeX: boundaryX,
      hingeY,
      leafStart: hingeSide === "north" ? 0 : -leafLength,
      leafLength,
      leafThickness,
      frameSide: entity.hallDirection || "east"
    };
  }

  const boundaryY = (entity.hallDirection === "south" ? entity.y * size : (entity.y + 1) * size) + offset.y;
  const hingeX = (hingeSide === "west" ? entity.x * size + inset : (entity.x + 1) * size - inset) + offset.x;
  return {
    hingeX,
    hingeY: boundaryY,
    leafStart: hingeSide === "west" ? 0 : -leafLength,
    leafLength,
    leafThickness,
    frameSide: entity.hallDirection || "south"
  };
}

function drawDoorFramePieces(entity, ctx) {
  const size = TILE_SIZE_PX;
  const frameColor = "#383838";
  const frameThickness = Math.max(3, size * 0.08);
  const frameLength = size * 0.22;
  const isVerticalWall = entity.orientation !== "horizontal";
  const offset = getDoorDebugOffset(entity);

  ctx.fillStyle = frameColor;
  if (isVerticalWall) {
    const boundaryX = (entity.hallDirection === "east" ? entity.x * size : (entity.x + 1) * size) + offset.x;
    const upperY = entity.y * size + size * 0.14;
    const lowerY = entity.y * size + size * 0.66;
    ctx.fillRect(boundaryX - frameThickness / 2, upperY, frameThickness, frameLength);
    ctx.fillRect(boundaryX - frameThickness / 2, lowerY, frameThickness, frameLength);
    return;
  }

  const boundaryY = (entity.hallDirection === "south" ? entity.y * size : (entity.y + 1) * size) + offset.y;
  const leftX = entity.x * size + size * 0.14 + offset.x;
  const rightX = entity.x * size + size * 0.66 + offset.x;
  ctx.fillRect(leftX, boundaryY - frameThickness / 2, frameLength, frameThickness);
  ctx.fillRect(rightX, boundaryY - frameThickness / 2, frameLength, frameThickness);
}

function drawDebugCross(ctx, x, y, size, color, lineWidth = 3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x - size, y + size);
  ctx.lineTo(x + size, y - size);
  ctx.stroke();
  ctx.restore();
}

function drawDoorPlacementDebugOverlay(state, ctx) {
  const debug = state.debugPlacement;
  if (!debug?.active) {
    return;
  }

  const size = TILE_SIZE_PX;
  const selectedDoor = state.entities.find((entity) => entity.subtype === "door" && entity.id === debug.selectedDoorId) || null;
  const selectedTile = debug.selectedTileKey
    ? state.tiles.find((tile) => `${tile.x},${tile.y}` === debug.selectedTileKey) || null
    : null;

  ctx.save();

  if (selectedDoor) {
    const offset = getDoorDebugOffset(selectedDoor);
    const left = selectedDoor.x * size + offset.x;
    const top = selectedDoor.y * size + offset.y;
    ctx.strokeStyle = "#45e0ff";
    ctx.lineWidth = 4;
    ctx.strokeRect(left + 2, top + 2, size - 4, size - 4);
    drawDebugCross(ctx, left + size / 2, top + size / 2, size * 0.25, "#45e0ff", 2);
  }

  if (selectedTile) {
    const left = selectedTile.x * size;
    const top = selectedTile.y * size;
    ctx.strokeStyle = "#ffe65b";
    ctx.lineWidth = 3;
    ctx.strokeRect(left + 2, top + 2, size - 4, size - 4);
    drawDebugCross(ctx, left + size / 2, top + size / 2, size * 0.28, "#ffe65b", 3);
  }

  const panelWidth = 380;
  const panelHeight = 168;
  ctx.fillStyle = "rgba(14, 16, 22, 0.82)";
  ctx.fillRect(12, 12, panelWidth, panelHeight);
  ctx.strokeStyle = "rgba(255, 227, 122, 0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, panelWidth, panelHeight);
  ctx.fillStyle = "#f6f7fb";
  ctx.font = "14px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Door placement debug mode", 24, 22);
  ctx.font = "12px Arial";
  const lines = [
    `Selected door: ${selectedDoor ? `${selectedDoor.id} @ ${selectedDoor.x},${selectedDoor.y}` : "none"}`,
    `Selected tile: ${selectedTile ? `${selectedTile.x},${selectedTile.y}` : "none"}`,
    `Click doors to select in magenta, tiles in yellow.`,
    `1 place, 2 delete, 3 show animation, 4 cycle animations,`,
    `5 impossible, 6 valid, 7 blocked by LoS, 8 not blocked by LoS.`
  ];
  let y = 46;
  for (const line of lines) {
    ctx.fillText(line, 24, y);
    y += 22;
  }

  ctx.restore();
}

function drawTopology(state, ctx) {
  for (const tile of state.tiles) {
    const px = tile.x * TILE_SIZE_PX;
    const py = tile.y * TILE_SIZE_PX;

    if (tile.type === TILE_TYPES.FLOOR || tile.type === TILE_TYPES.DOOR) {
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

function drawEntity(entity, ctx) {
  const cx = entity.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const cy = entity.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
  const radius = TILE_SIZE_PX * 0.24;

  if (entity.subtype === "door") {
    const angle = getDoorAngle(entity, ctx.__doorNow || performance.now());
    const { hingeX, hingeY, leafStart, leafLength, leafThickness } = getDoorGeometry(entity);
    ctx.save();
    ctx.translate(hingeX, hingeY);
    ctx.rotate(angle);
    ctx.fillStyle = entity.doorState === DOOR_STATES.OPEN ? "#c99a57" : "#2b160d";
    ctx.strokeStyle = entity.doorState === DOOR_STATES.OPEN ? "#c99a57" : "#2b160d";
    ctx.fillRect(-leafThickness / 2, leafStart, leafThickness, leafLength);
    ctx.strokeRect(-leafThickness / 2, leafStart, leafThickness, leafLength);
    ctx.restore();
    drawDoorFramePieces(entity, ctx);
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
  const now = options.now ?? performance.now();

  drawBackground(backgroundCtx, widthPx, heightPx);
  topologyCtx.clearRect(0, 0, widthPx, heightPx);
  drawTopology(state, topologyCtx);
  objectsCtx.clearRect(0, 0, widthPx, heightPx);
  objectsCtx.__doorNow = now;
  drawObjects(state, objectsCtx);
  drawPlayer(state, objectsCtx);
  if (options.debug) {
    drawDebugOverlay(state, objectsCtx);
  }
  fogCtx.clearRect(0, 0, widthPx, heightPx);
  drawFog(state, fogCtx, widthPx, heightPx, options.forceBlackout === true);
  if (options.doorPlacementDebug) {
    drawDoorPlacementDebugOverlay(state, fogCtx);
  }
}
