import { DOOR_STATES, TILE_TYPES } from "./constants.js";
import { tileKey } from "./state-schema.js";

function isWithinRadius(x1, y1, x2, y2, radius) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) <= radius;
}

function getDoorAt(state, x, y) {
  return state.entities.find((entity) => entity.subtype === "door" && entity.x === x && entity.y === y);
}

function getClosedDoorBlockRect(door) {
  const padding = 0.45;
  if (door.hallDirection === "north") {
    return {
      left: door.x - padding,
      top: door.y - 1 - padding,
      right: door.x + 1 + padding,
      bottom: door.y + 1 + padding
    };
  }
  if (door.hallDirection === "south") {
    return {
      left: door.x - padding,
      top: door.y - padding,
      right: door.x + 1 + padding,
      bottom: door.y + 2 + padding
    };
  }
  if (door.hallDirection === "east") {
    return {
      left: door.x - padding,
      top: door.y - padding,
      right: door.x + 2 + padding,
      bottom: door.y + 1 + padding
    };
  }
  return {
    left: door.x - 1 - padding,
    top: door.y - padding,
    right: door.x + 1 + padding,
    bottom: door.y + 1 + padding
  };
}

function segmentIntersectsRect(x0, y0, x1, y1, left, top, right, bottom) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const checks = [
    [-dx, x0 - left],
    [dx, right - x0],
    [-dy, y0 - top],
    [dy, bottom - y0]
  ];

  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) {
        return false;
      }
      continue;
    }

    const ratio = q / p;
    if (p < 0) {
      if (ratio > t1) {
        return false;
      }
      if (ratio > t0) {
        t0 = ratio;
      }
    } else {
      if (ratio < t0) {
        return false;
      }
      if (ratio < t1) {
        t1 = ratio;
      }
    }
  }

  return t0 <= t1;
}

function isLightBlockingTile(state, x, y) {
  const tile = state.tiles[y * state.map.width + x];
  if (!tile) {
    return true;
  }
  if (tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.VOID) {
    return true;
  }
  if (tile.type === TILE_TYPES.DOOR) {
    const door = getDoorAt(state, x, y);
    return door?.doorState !== DOOR_STATES.OPEN;
  }
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
    if (door.x === x && door.y === y) {
      continue;
    }
    const blockRect = getClosedDoorBlockRect(door);
    if (segmentIntersectsRect(sourceX, sourceY, targetX, targetY, blockRect.left, blockRect.top, blockRect.right, blockRect.bottom)) {
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
