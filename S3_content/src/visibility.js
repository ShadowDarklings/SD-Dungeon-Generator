import { DOOR_STATES, TILE_SIZE_PX, TILE_TYPES } from "./constants.js";
import { collectLightSources, computeLightPolygon, getClosedDoorSegment, isPointInPolygon, isPortcullisDoor, isTileCenterInLightPolygon, isTileTouchedByLightPolygon } from "./light-geometry.js";
import { tileKey } from "./state-schema.js";
import { canCrossOrganicEdge, isOrganicMovementBlockingTile } from "./organic-tiles.js";
import { getInnerWallTileData, isInnerWallBlockingTile } from "./inner-walls.js";
import { isAngledWallLightBlockingTile, isAngledWallMovementBlockingTile } from "./angled-walls.js";

const LIGHT_GEOMETRY_VERSION = 7;

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
  if (isOrganicMovementBlockingTile(tile) || isInnerWallBlockingTile(tile)) {
    return true;
  }
  if (isAngledWallLightBlockingTile(tile) || isAngledWallMovementBlockingTile(tile)) {
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
  const side = door.hallDirection || door.wallSide;
  if (side === "east") {
    return {
      hall: { x: door.x, y: door.y },
      room: { x: door.x - 1, y: door.y }
    };
  }
  if (side === "west") {
    return {
      hall: { x: door.x, y: door.y },
      room: { x: door.x + 1, y: door.y }
    };
  }
  if (side === "south") {
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
    if (entity.subtype !== "door" || entity.doorState === DOOR_STATES.OPEN || isPortcullisDoor(entity)) {
      return false;
    }
    const { hall } = getDoorTiles(entity);
    return hall.x === x && hall.y === y;
  });
}

function isClosedSecretDoorTile(state, tile) {
  return (state.entities || []).some((door) => (
    door.subtype === "door" &&
    door.secret === true &&
    door.doorState !== DOOR_STATES.OPEN &&
    !isPortcullisDoor(door) &&
    door.x === tile?.x &&
    door.y === tile?.y
  ));
}

function getTileAt(state, x, y) {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
    return null;
  }
  return state.tiles[y * state.map.width + x] || null;
}

function getDoorSpaceSide(door, space) {
  const side = door.hallDirection || door.wallSide;
  const isHall = space === "hall";
  if (side === "east") {
    return isHall ? "right" : "left";
  }
  if (side === "west") {
    return isHall ? "left" : "right";
  }
  if (side === "south") {
    return isHall ? "bottom" : "top";
  }
  return isHall ? "top" : "bottom";
}

function cloneDoorSideMap(map) {
  const clone = new Map();
  if (!(map instanceof Map)) {
    return clone;
  }
  for (const [doorId, sides] of map.entries()) {
    clone.set(doorId, new Set(sides || []));
  }
  return clone;
}

function addDoorSide(map, door, side) {
  if (!door?.id || !side) {
    return;
  }
  const sides = map.get(door.id) || new Set();
  sides.add(side);
  map.set(door.id, sides);
}

export function isDoorThresholdTile(state, tile) {
  if (!tile || tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.VOID) {
    return false;
  }
  return (state.entities || []).some((door) => {
    return door.subtype === "door" &&
      door.doorState !== DOOR_STATES.OPEN &&
      !isPortcullisDoor(door) &&
      tile.x === door.x &&
      tile.y === door.y;
  });
}

function isBlockingDecorTile(tile) {
  return isOrganicMovementBlockingTile(tile) ||
    isInnerWallBlockingTile(tile) ||
    isAngledWallLightBlockingTile(tile) ||
    isAngledWallMovementBlockingTile(tile);
}

function revealTouchedBlockingDecor(state) {
  const visible = state.visibility.visibleNow;
  const newlyVisible = [];
  for (const tile of state.tiles || []) {
    if (!tile || tile.type !== TILE_TYPES.FLOOR || !isBlockingDecorTile(tile)) {
      continue;
    }
    const key = tileKey(tile.x, tile.y);
    if (visible.has(key)) {
      continue;
    }
    const touchesVisibleFloor = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ].some(([dx, dy]) => visible.has(tileKey(tile.x + dx, tile.y + dy)));
    if (touchesVisibleFloor) {
      newlyVisible.push(key);
    }
  }
  for (const key of newlyVisible) {
    visible.add(key);
    state.visibility.exploredEver.add(key);
  }
}

function getDoorSideSamplePoint(door, side) {
  if (side === "left") {
    return [door.x + 0.25, door.y + 0.5];
  }
  if (side === "right") {
    return [door.x + 0.75, door.y + 0.5];
  }
  if (side === "top") {
    return [door.x + 0.5, door.y + 0.25];
  }
  return [door.x + 0.5, door.y + 0.75];
}

function revealLitClosedDoorSides(state, lightPolygons) {
  for (const door of state.entities || []) {
    if (door.subtype !== "door" || door.doorState === DOOR_STATES.OPEN || isPortcullisDoor(door)) {
      continue;
    }
    if (door.secret === true) {
      continue;
    }
    const sides = [getDoorSpaceSide(door, "hall"), getDoorSpaceSide(door, "room")];
    for (const side of sides) {
      const [sampleX, sampleY] = getDoorSideSamplePoint(door, side);
      const point = [sampleX * TILE_SIZE_PX, sampleY * TILE_SIZE_PX];
      const lit = lightPolygons.some(({ polygon }) => isPointInPolygon(point, polygon));
      if (lit) {
        addDoorSide(state.visibility.closedDoorVisibleSides, door, side);
        addDoorSide(state.visibility.closedDoorExploredSides, door, side);
      }
    }
  }
}

function getTileCenterPoint(x, y) {
  return [x + 0.5, y + 0.5];
}

function segmentIntersectionRatio(a, b, c, d) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const cdx = d[0] - c[0];
  const cdy = d[1] - c[1];
  const denom = (abx * cdy) - (aby * cdx);
  if (Math.abs(denom) < 0.000001) {
    return null;
  }
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const rayRatio = ((acx * cdy) - (acy * cdx)) / denom;
  const segmentRatio = ((acx * aby) - (acy * abx)) / denom;
  if (rayRatio < -0.0001 || rayRatio > 1.0001 || segmentRatio < -0.0001 || segmentRatio > 1.0001) {
    return null;
  }
  return rayRatio;
}

function isAcrossClosedDoor(state, px, py, tx, ty) {
  const origin = getTileCenterPoint(px, py);
  const target = getTileCenterPoint(tx, ty);
  for (const door of state.entities) {
    if (door.subtype !== "door" || door.doorState === DOOR_STATES.OPEN || isPortcullisDoor(door)) {
      continue;
    }
    const [start, end] = getClosedDoorSegment(door).map(([x, y]) => [x / TILE_SIZE_PX, y / TILE_SIZE_PX]);
    const ratio = segmentIntersectionRatio(origin, target, start, end);
    if (ratio !== null && ratio > 0.0001 && ratio < 0.9999) {
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

export function hasLineOfSightFrom(state, originX, originY, x, y) {
  const points = getLineBetween(originX, originY, x, y);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!canCrossOrganicEdge(getTileAt(state, prev.x, prev.y), getTileAt(state, curr.x, curr.y), curr.x - prev.x, curr.y - prev.y)) {
      return false;
    }
    if (isLightBlockingTile(state, curr.x, curr.y)) {
      return false;
    }
    const door = getDoorBetween(state, prev.x, prev.y, curr.x, curr.y);
    if (door && door.doorState !== DOOR_STATES.OPEN && !isPortcullisDoor(door)) {
      return i === points.length - 1 && isClosedDoorHallTarget(state, x, y);
    }
  }

  return !isAcrossClosedDoor(state, originX, originY, x, y) || isClosedDoorHallTarget(state, x, y);
}

export function hasLineOfSight(state, x, y) {
  return hasLineOfSightFrom(state, state.player.x, state.player.y, x, y);
}

export function isTileVisible(state, x, y) {
  return state.visibility.visibleNow.has(tileKey(x, y));
}

function cloneLightPolygon(polygon) {
  return Array.isArray(polygon)
    ? polygon
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => [Number(point[0]), Number(point[1])])
      .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
    : [];
}

function normalizeLightPolygons(polygons) {
  return Array.isArray(polygons)
    ? polygons.map(cloneLightPolygon).filter((polygon) => polygon.length >= 3)
    : [];
}

function getLightPolygonKey(polygon) {
  const pointsKey = polygon
    .filter((_, index) => index % 6 === 0)
    .map((point) => `${Math.round(point[0])},${Math.round(point[1])}`)
    .join("|");
  return `${polygon.length}:${pointsKey}`;
}

function appendExploredLightPolygon(state, polygon) {
  const normalized = cloneLightPolygon(polygon);
  if (normalized.length < 3) {
    return;
  }
  state.visibility.exploredLightPolygons = normalizeLightPolygons(state.visibility.exploredLightPolygons);
  state.visibility.exploredLightPolygonKeys = state.visibility.exploredLightPolygonKeys instanceof Set
    ? state.visibility.exploredLightPolygonKeys
    : new Set(state.visibility.exploredLightPolygons.map(getLightPolygonKey));
  const key = getLightPolygonKey(normalized);
  if (state.visibility.exploredLightPolygonKeys.has(key)) {
    return;
  }
  state.visibility.exploredLightPolygonKeys.add(key);
  state.visibility.exploredLightPolygons.push(normalized);
}

function migrateVisibilityGeometry(state) {
  if (!state.visibility) {
    return;
  }
  if (state.visibility.lightGeometryVersion === LIGHT_GEOMETRY_VERSION) {
    return;
  }
  state.visibility.visibleNow = new Set();
  state.visibility.exploredBeforeNow = new Set();
  state.visibility.exploredLightPolygons = [];
  state.visibility.exploredLightPolygonsBeforeNow = [];
  state.visibility.exploredLightPolygonKeys = new Set();
  state.visibility.exploredInnerWallInteriors = new Set();
  state.visibility.closedDoorVisibleSides = new Map();
  state.visibility.lightGeometryVersion = LIGHT_GEOMETRY_VERSION;
}

function ensureExploredInnerWallInteriors(state) {
  state.visibility.exploredInnerWallInteriors = state.visibility.exploredInnerWallInteriors instanceof Set
    ? state.visibility.exploredInnerWallInteriors
    : new Set(Array.isArray(state.visibility.exploredInnerWallInteriors) ? state.visibility.exploredInnerWallInteriors : []);
  return state.visibility.exploredInnerWallInteriors;
}

function ensureVisitedRoomIds(state) {
  state.visibility.visitedRoomIds = state.visibility.visitedRoomIds instanceof Set
    ? state.visibility.visitedRoomIds
    : new Set(Array.isArray(state.visibility.visitedRoomIds) ? state.visibility.visitedRoomIds : []);
  return state.visibility.visitedRoomIds;
}

function rememberOccupiedRooms(state) {
  const visitedRoomIds = ensureVisitedRoomIds(state);
  if (state.player?.roomId) {
    visitedRoomIds.add(state.player.roomId);
  }
  for (const character of state.characters || []) {
    if (character?.roomId) {
      visitedRoomIds.add(character.roomId);
    }
  }
  return visitedRoomIds;
}

function rememberAdjacentInnerWallInteriors(state, lightSources) {
  const exploredInnerWallInteriors = ensureExploredInnerWallInteriors(state);
  for (const tile of state.tiles || []) {
    if (!getInnerWallTileData(tile)?.blocksMovement) {
      continue;
    }
    const adjacentToLight = (lightSources || []).some((source) => {
      const dx = Math.abs(Number(source.x) - Number(tile.x));
      const dy = Math.abs(Number(source.y) - Number(tile.y));
      return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    });
    if (adjacentToLight) {
      exploredInnerWallInteriors.add(tileKey(tile.x, tile.y));
    }
  }
}

export function recomputeVisibility(state) {
  migrateVisibilityGeometry(state);
  ensureExploredInnerWallInteriors(state);
  const previouslyVisible = new Set(state.visibility.visibleNow || []);
  const exploredBeforeNow = new Set(state.visibility.exploredEver || []);
  const exploredLightPolygons = normalizeLightPolygons(state.visibility.exploredLightPolygons);
  const visitedRoomIds = rememberOccupiedRooms(state);
  for (const key of previouslyVisible) {
    exploredBeforeNow.add(key);
    state.visibility.exploredEver.add(key);
  }
  state.visibility.exploredBeforeNow = exploredBeforeNow;
  state.visibility.exploredLightPolygons = exploredLightPolygons;
  state.visibility.exploredLightPolygonsBeforeNow = exploredLightPolygons.map(cloneLightPolygon);
  state.visibility.exploredLightPolygonKeys = new Set(exploredLightPolygons.map(getLightPolygonKey));
  state.visibility.visibleNow.clear();
  state.visibility.closedDoorExploredSides = cloneDoorSideMap(state.visibility.closedDoorExploredSides);
  state.visibility.closedDoorVisibleSides = new Map();
  const lightSources = collectLightSources(state);
  if (!lightSources.length) {
    return;
  }
  rememberAdjacentInnerWallInteriors(state, lightSources);
  const lightPolygons = lightSources.map((source) => ({
    source,
    polygon: computeLightPolygon(state, source)
  }));
  for (const { polygon } of lightPolygons) {
    appendExploredLightPolygon(state, polygon);
  }

  for (const tile of state.tiles) {
    if (tile?.meta?.neverExplore === true) {
      continue;
    }
    if (isClosedSecretDoorTile(state, tile)) {
      continue;
    }
    let lit = false;
    for (const { source, polygon } of lightPolygons) {
      if (!isTileTouchedByLightPolygon(tile, polygon)) {
        continue;
      }
      if (
        isDoorThresholdTile(state, tile) &&
        (
          !isTileCenterInLightPolygon(tile, polygon) ||
          !hasLineOfSightFrom(state, source.x, source.y, tile.x, tile.y)
        )
      ) {
        continue;
      }
      lit = true;
    }
    if (lit) {
      const key = tileKey(tile.x, tile.y);
      state.visibility.visibleNow.add(key);
      state.visibility.exploredEver.add(key);
      if (tile.roomId && visitedRoomIds.has(tile.roomId)) {
        const room = state.rooms.find((candidate) => candidate.id === tile.roomId);
        if (room) {
          room.discovered = true;
          room.explored = true;
        }
      }
    }
  }

  revealTouchedBlockingDecor(state);
  revealLitClosedDoorSides(state, lightPolygons);
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
