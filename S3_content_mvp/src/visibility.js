import { DOOR_STATES, TILE_TYPES } from "./constants.js";
import { tileKey } from "./state-schema.js";

function isWithinRadius(x1, y1, x2, y2, radius) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) <= radius;
}

function isLightBlockingTile(state, x, y) {
  const tile = state.tiles[y * state.map.width + x];
  if (!tile) {
    return true;
  }
  if (tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.VOID) {
    return true;
  }
  return false;
}

function getDoorSegment(door) {
  if (door.wallSide === "east") {
    return { x1: door.x, y1: door.y, x2: door.x, y2: door.y + 1 };
  }
  if (door.wallSide === "west") {
    return { x1: door.x + 1, y1: door.y, x2: door.x + 1, y2: door.y + 1 };
  }
  if (door.wallSide === "south") {
    return { x1: door.x, y1: door.y, x2: door.x + 1, y2: door.y };
  }
  return { x1: door.x, y1: door.y + 1, x2: door.x + 1, y2: door.y + 1 };
}

function orientation(ax, ay, bx, by, cx, cy) {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 1e-9) {
    return 0;
  }
  return value > 0 ? 1 : 2;
}

function pointOnSegment(ax, ay, bx, by, cx, cy) {
  return bx <= Math.max(ax, cx) + 1e-9 &&
    bx + 1e-9 >= Math.min(ax, cx) &&
    by <= Math.max(ay, cy) + 1e-9 &&
    by + 1e-9 >= Math.min(ay, cy);
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const o1 = orientation(ax, ay, bx, by, cx, cy);
  const o2 = orientation(ax, ay, bx, by, dx, dy);
  const o3 = orientation(cx, cy, dx, dy, ax, ay);
  const o4 = orientation(cx, cy, dx, dy, bx, by);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }
  if (o1 === 0 && pointOnSegment(ax, ay, cx, cy, bx, by)) return true;
  if (o2 === 0 && pointOnSegment(ax, ay, dx, dy, bx, by)) return true;
  if (o3 === 0 && pointOnSegment(cx, cy, ax, ay, dx, dy)) return true;
  if (o4 === 0 && pointOnSegment(cx, cy, bx, by, dx, dy)) return true;
  return false;
}

function getLineBetween(x0, y0, x1, y1) {
  const points = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  let x = x0;
  let y = y0;

  while (true) {
    points.push({ x, y });
    if (x === x1 && y === y1) {
      break;
    }
    const doubledError = 2 * error;
    if (doubledError >= dy) {
      error += dy;
      x += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      y += sy;
    }
  }

  return points;
}

export function hasLineOfSight(state, x, y) {
  const sourceX = state.player.x + 0.5;
  const sourceY = state.player.y + 0.5;
  const targetX = x + 0.5;
  const targetY = y + 0.5;
  const points = getLineBetween(state.player.x, state.player.y, x, y);
  for (let i = 1; i < points.length - 1; i += 1) {
    if (isLightBlockingTile(state, points[i].x, points[i].y)) {
      return false;
    }
  }

  for (const door of state.entities) {
    if (door.subtype !== "door" || door.doorState === DOOR_STATES.OPEN) {
      continue;
    }
    const doorSegment = getDoorSegment(door);
    if (segmentsIntersect(
      sourceX,
      sourceY,
      targetX,
      targetY,
      doorSegment.x1,
      doorSegment.y1,
      doorSegment.x2,
      doorSegment.y2
    )) {
      return false;
    }
  }

  return true;
}

export function isTileVisible(state, x, y) {
  return state.visibility.visibleNow.has(tileKey(x, y));
}

export function recomputeVisibility(state) {
  state.visibility.visibleNow.clear();
  if (!state.player.torchLit) {
    return;
  }

  for (const tile of state.tiles) {
    if (
      isWithinRadius(state.player.x, state.player.y, tile.x, tile.y, state.player.lightRadius) &&
      hasLineOfSight(state, tile.x, tile.y)
    ) {
      const key = tileKey(tile.x, tile.y);
      state.visibility.visibleNow.add(key);
      state.visibility.exploredEver.add(key);
      if (tile.roomId) {
        const room = state.rooms.find((candidate) => candidate.id === tile.roomId);
        if (room) {
          room.discovered = true;
          room.explored = true;
        }
      }
    }
  }
}

export function revealTrapAtPlayer(state) {
  for (const entity of state.entities) {
    if (
      entity.type !== "trap" ||
      entity.targetType !== "tile" ||
      entity.triggered ||
      entity.disarmed
    ) {
      continue;
    }
    if (entity.x === state.player.x && entity.y === state.player.y) {
      entity.revealed = true;
      entity.visible = true;
      entity.triggered = true;
      return entity;
    }
  }
  return null;
}
