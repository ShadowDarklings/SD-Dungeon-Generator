import { DOOR_STATES, TILE_TYPES } from "./constants.js";
import { tileKey } from "./state-schema.js";

function isWithinRadius(x1, y1, x2, y2, radius) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) <= radius;
}

function getRotundaLightBlock(state, x, y) {
  for (const room of state.rooms || []) {
    if (room.rotunda !== true) {
      continue;
    }
    const size = Number(room.rotundaSize || room.width || room.height || 7) === 5 ? 5 : 7;
    const drawSize = size === 5 ? 5 : 9;
    const artX = Number(room.x) - (size === 5 ? 0 : 1);
    const artY = Number(room.y) - (size === 5 ? 0 : 1);
    if (x < artX || y < artY || x >= artX + drawSize || y >= artY + drawSize) {
      continue;
    }
    if (size === 5) {
      const localX = x - artX;
      const localY = y - artY;
      const openings = new Set((Array.isArray(room.rotundaOpenings) && room.rotundaOpenings.length
        ? room.rotundaOpenings
        : [room.rotundaOpening || room.opening || "south"]
      ).map((opening) => String(opening || "")[0].toLowerCase()));
      const isInnerRotunda = localX >= 1 && localX <= 3 && localY >= 1 && localY <= 3;
      const isExit =
        (openings.has("n") && localX === 2 && localY === 0) ||
        (openings.has("s") && localX === 2 && localY === 4) ||
        (openings.has("w") && localX === 0 && localY === 2) ||
        (openings.has("e") && localX === 4 && localY === 2);
      return !(isInnerRotunda || isExit);
    }
    const centerX = artX + drawSize / 2;
    const centerY = artY + drawSize / 2;
    const dx = (x + 0.5) - centerX;
    const dy = (y + 0.5) - centerY;
    const radius = size / 2;
    return Math.sqrt(dx * dx + dy * dy) >= radius;
  }
  return null;
}

function isLightBlockingTile(state, x, y) {
  const tile = state.tiles[y * state.map.width + x];
  if (!tile) {
    return true;
  }
  if (tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.VOID) {
    const rotundaBlock = getRotundaLightBlock(state, x, y);
    if (rotundaBlock !== null) {
      return rotundaBlock;
    }
    return true;
  }
  return false;
}

function getDoorTiles(door) {
  if (door.wallSide === "east") {
    return {
      hall: { x: door.x, y: door.y },
      room: { x: door.x - 1, y: door.y }
    };
  }
  if (door.wallSide === "west") {
    return {
      hall: { x: door.x, y: door.y },
      room: { x: door.x + 1, y: door.y }
    };
  }
  if (door.wallSide === "south") {
    return {
      hall: { x: door.x, y: door.y },
      room: { x: door.x, y: door.y - 1 }
    };
  }
  return {
    hall: { x: door.x, y: door.y },
    room: { x: door.x, y: door.y + 1 }
  };
}

function sameTile(a, b) {
  return a?.x === b?.x && a?.y === b?.y;
}

function getDoorBetween(state, fromX, fromY, toX, toY) {
  const from = { x: fromX, y: fromY };
  const to = { x: toX, y: toY };
  return state.entities.find((entity) => {
    if (entity.subtype !== "door") {
      return false;
    }
    const { hall, room } = getDoorTiles(entity);
    return (sameTile(from, hall) && sameTile(to, room)) || (sameTile(from, room) && sameTile(to, hall));
  }) || null;
}

function isClosedDoorHallTarget(state, x, y) {
  return state.entities.some((entity) => {
    if (entity.subtype !== "door" || entity.doorState === DOOR_STATES.OPEN) {
      return false;
    }
    const { hall } = getDoorTiles(entity);
    return hall.x === x && hall.y === y;
  });
}

function rangesOverlap(minA, maxA, minB, maxB) {
  return minA <= maxB && maxA >= minB;
}

function isAcrossClosedDoor(state, px, py, tx, ty) {
  for (const door of state.entities) {
    if (door.subtype !== "door" || door.doorState === DOOR_STATES.OPEN) {
      continue;
    }

    if (door.wallSide === "west") {
      const playerHall = px <= door.x;
      const targetHall = tx <= door.x;
      if (playerHall !== targetHall &&
        rangesOverlap(Math.min(py, ty), Math.max(py, ty), door.y, door.y + 1)) {
        return true;
      }
      continue;
    }

    if (door.wallSide === "east") {
      const playerHall = px >= door.x;
      const targetHall = tx >= door.x;
      if (playerHall !== targetHall &&
        rangesOverlap(Math.min(py, ty), Math.max(py, ty), door.y, door.y + 1)) {
        return true;
      }
      continue;
    }

    if (door.wallSide === "south") {
      const playerHall = py >= door.y;
      const targetHall = ty >= door.y;
      if (playerHall !== targetHall &&
        rangesOverlap(Math.min(px, tx), Math.max(px, tx), door.x, door.x + 1)) {
        return true;
      }
      continue;
    }

    const playerHall = py <= door.y;
    const targetHall = ty <= door.y;
    if (playerHall !== targetHall &&
      rangesOverlap(Math.min(px, tx), Math.max(px, tx), door.x, door.x + 1)) {
      return true;
    }
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
  const px = state.player.x;
  const py = state.player.y;

  const points = getLineBetween(px, py, x, y);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (isLightBlockingTile(state, curr.x, curr.y)) {
      return false;
    }
    const door = getDoorBetween(state, prev.x, prev.y, curr.x, curr.y);
    if (door && door.doorState !== DOOR_STATES.OPEN) {
      return i === points.length - 1 && isClosedDoorHallTarget(state, x, y);
    }
  }

  return !isAcrossClosedDoor(state, px, py, x, y) || isClosedDoorHallTarget(state, x, y);
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
