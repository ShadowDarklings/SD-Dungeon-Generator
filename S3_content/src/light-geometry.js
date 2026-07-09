import { DOOR_STATES, TILE_SIZE_PX, TILE_TYPES } from "./constants.js";
import { getOrganicBlockedSides, isOrganicMovementBlockingTile } from "./organic-tiles.js";
import { getInnerWallConnectedSides, getInnerWallTileData } from "./inner-walls.js";
import { isAngledWallLightBlockingTile, isAngledWallMovementBlockingTile } from "./angled-walls.js";

const ANGLE_EPSILON = 0.00008;
const RADIUS_RAY_COUNT = 96;
const INNER_WALL_EDGE_INSET_PX = 5;
const PILLAR_SHADOW_SIZE_PX = TILE_SIZE_PX / 3;
const PILLAR_SHADOW_INSET_PX = (TILE_SIZE_PX - PILLAR_SHADOW_SIZE_PX) / 2;
const TILE_SAMPLE_POINTS = Object.freeze([
  [0.5, 0.5],
  [0.16, 0.16],
  [0.84, 0.16],
  [0.84, 0.84],
  [0.16, 0.84]
]);

function getTileAt(state, x, y) {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
    return null;
  }
  return state.tiles[y * state.map.width + x] || null;
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

export function isLightBlockingTile(state, x, y) {
  const tile = getTileAt(state, x, y);
  if (!tile) {
    return true;
  }
  if (isOrganicMovementBlockingTile(tile)) {
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

function isLightFloorTile(state, x, y) {
  const tile = getTileAt(state, x, y);
  return tile &&
    tile.type !== TILE_TYPES.WALL &&
    tile.type !== TILE_TYPES.VOID &&
    !isOrganicMovementBlockingTile(tile) &&
    !isAngledWallLightBlockingTile(tile) &&
    !isAngledWallMovementBlockingTile(tile);
}

export function getDoorTiles(door) {
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

function addLightSource(sources, seen, x, y, radius) {
  const source = {
    x: Number(x),
    y: Number(y),
    radius: Math.max(1, Number(radius) || 6)
  };
  if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) {
    return;
  }
  const key = `${source.x},${source.y},${source.radius}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  sources.push(source);
}

export function collectLightSources(state) {
  const sources = [];
  const seen = new Set();
  for (const character of state.characters || []) {
    if (Number(character?.lightRadius) > 0) {
      addLightSource(sources, seen, character.x, character.y, character.lightRadius);
    }
  }
  if (state.player?.torchLit) {
    addLightSource(sources, seen, state.player.x, state.player.y, state.player.lightRadius);
  }
  for (const entity of state.entities || []) {
    if (
      entity.subtype === "dropped-equipment" &&
      entity.collected !== true &&
      entity.visible !== false &&
      Number(entity.lightRadius) > 0
    ) {
      addLightSource(sources, seen, entity.x, entity.y, entity.lightRadius);
    }
  }
  return sources;
}

function tileEdgeSegment(x, y, side) {
  const left = x * TILE_SIZE_PX;
  const top = y * TILE_SIZE_PX;
  const right = left + TILE_SIZE_PX;
  const bottom = top + TILE_SIZE_PX;
  if (side === "north") return [[left, top], [right, top]];
  if (side === "south") return [[right, bottom], [left, bottom]];
  if (side === "west") return [[left, bottom], [left, top]];
  return [[right, top], [right, bottom]];
}

function innerWallBlockingSegments(tile) {
  const innerWall = getInnerWallTileData(tile);
  if (!innerWall?.blocksMovement) {
    return [];
  }
  const connectedSides = new Set(getInnerWallConnectedSides(innerWall));
  const left = tile.x * TILE_SIZE_PX + (connectedSides.has("west") ? 0 : INNER_WALL_EDGE_INSET_PX);
  const top = tile.y * TILE_SIZE_PX + (connectedSides.has("north") ? 0 : INNER_WALL_EDGE_INSET_PX);
  const right = (tile.x + 1) * TILE_SIZE_PX - (connectedSides.has("east") ? 0 : INNER_WALL_EDGE_INSET_PX);
  const bottom = (tile.y + 1) * TILE_SIZE_PX - (connectedSides.has("south") ? 0 : INNER_WALL_EDGE_INSET_PX);
  return [
    [[left, top], [right, top]],
    [[right, top], [right, bottom]],
    [[right, bottom], [left, bottom]],
    [[left, bottom], [left, top]]
  ];
}

function rectBlockingSegments(left, top, right, bottom) {
  return [
    [[left, top], [right, top]],
    [[right, top], [right, bottom]],
    [[right, bottom], [left, bottom]],
    [[left, bottom], [left, top]]
  ];
}

function columnBlockingSegments(column) {
  if (!Number.isFinite(Number(column?.x)) || !Number.isFinite(Number(column?.y))) {
    return [];
  }
  const placement = String(column.placement || "center");
  const drawX = placement === "vertex" ? Number(column.x) - 0.5 : Number(column.x);
  const drawY = placement === "vertex" ? Number(column.y) - 0.5 : Number(column.y);
  const left = drawX * TILE_SIZE_PX + PILLAR_SHADOW_INSET_PX;
  const top = drawY * TILE_SIZE_PX + PILLAR_SHADOW_INSET_PX;
  return rectBlockingSegments(
    left,
    top,
    left + PILLAR_SHADOW_SIZE_PX,
    top + PILLAR_SHADOW_SIZE_PX
  );
}

function isHorizontalDoor(door) {
  if (door.orientation === "horizontal") {
    return true;
  }
  if (door.orientation === "vertical") {
    return false;
  }
  const side = String(door.hallDirection || door.wallSide || "").toLowerCase();
  return side === "north" || side === "south";
}

export function isPortcullisDoor(door) {
  const explicit = String(door?.doorKind || door?.visualKind || "").toLowerCase();
  if (explicit === "gate" || explicit === "portcullis") {
    return true;
  }
  const watabouType = Number(door?.watabouDoorType ?? door?.type);
  return watabouType === 5 || door?.portcullis === true || door?.doorState === "portcullis";
}

export function getClosedDoorSegment(door) {
  const left = door.x * TILE_SIZE_PX;
  const top = door.y * TILE_SIZE_PX;
  const right = left + TILE_SIZE_PX;
  const bottom = top + TILE_SIZE_PX;
  const half = TILE_SIZE_PX / 2;
  if (!isHorizontalDoor(door)) {
    const x = left + half;
    return [[x, top], [x, bottom]];
  }
  const y = top + half;
  return [[right, y], [left, y]];
}

function segmentNearSource(segment, sourcePoint, radiusPx) {
  const radiusWithPadding = radiusPx + TILE_SIZE_PX * 1.5;
  return segment.some(([x, y]) => Math.hypot(x - sourcePoint[0], y - sourcePoint[1]) <= radiusWithPadding);
}

function collectBlockingSegments(state, source, sourcePoint, radiusPx) {
  const segments = [];
  const radiusTiles = Math.ceil(Math.max(1, Number(source.radius) || 6)) + 2;
  const originX = Math.round(Number(source.x));
  const originY = Math.round(Number(source.y));
  const minX = Math.max(0, originX - radiusTiles);
  const maxX = Math.min(state.map.width - 1, originX + radiusTiles);
  const minY = Math.max(0, originY - radiusTiles);
  const maxY = Math.min(state.map.height - 1, originY + radiusTiles);
  const sides = [
    ["north", 0, -1],
    ["south", 0, 1],
    ["west", -1, 0],
    ["east", 1, 0]
  ];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const tile = getTileAt(state, x, y);
      const innerWallSegments = innerWallBlockingSegments(tile);
      if (innerWallSegments.length) {
        segments.push(...innerWallSegments);
        continue;
      }
      if (!isLightBlockingTile(state, x, y)) {
        for (const side of getOrganicBlockedSides(tile)) {
          segments.push(tileEdgeSegment(x, y, side));
        }
        continue;
      }
      for (const [side, dx, dy] of sides) {
        if (isLightFloorTile(state, x + dx, y + dy)) {
          segments.push(tileEdgeSegment(x, y, side));
        }
      }
    }
  }

  for (const column of state.decor?.columns || []) {
    for (const segment of columnBlockingSegments(column)) {
      if (segmentNearSource(segment, sourcePoint, radiusPx)) {
        segments.push(segment);
      }
    }
  }

  for (const entity of state.entities || []) {
    if (entity.subtype !== "door" || entity.doorState === DOOR_STATES.OPEN || isPortcullisDoor(entity)) {
      continue;
    }
    const segment = getClosedDoorSegment(entity);
    if (segmentNearSource(segment, sourcePoint, radiusPx)) {
      segments.push(segment);
    }
  }

  return segments;
}

function normalizeAngle(angle) {
  const twoPi = Math.PI * 2;
  const normalized = angle % twoPi;
  return normalized < 0 ? normalized + twoPi : normalized;
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function raySegmentIntersection(origin, angle, segment, radiusPx) {
  const rayX = Math.cos(angle);
  const rayY = Math.sin(angle);
  const [a, b] = segment;
  const segX = b[0] - a[0];
  const segY = b[1] - a[1];
  const denom = cross(rayX, rayY, segX, segY);
  if (Math.abs(denom) < 0.000001) {
    return null;
  }
  const toSegmentX = a[0] - origin[0];
  const toSegmentY = a[1] - origin[1];
  const rayDistance = cross(toSegmentX, toSegmentY, segX, segY) / denom;
  const segmentDistance = cross(toSegmentX, toSegmentY, rayX, rayY) / denom;
  if (rayDistance < 0 || rayDistance > radiusPx || segmentDistance < -0.0001 || segmentDistance > 1.0001) {
    return null;
  }
  return {
    point: [origin[0] + rayX * rayDistance, origin[1] + rayY * rayDistance],
    distance: rayDistance
  };
}

function castRay(origin, angle, radiusPx, segments) {
  let closest = null;
  for (const segment of segments) {
    const hit = raySegmentIntersection(origin, angle, segment, radiusPx);
    if (!hit) {
      continue;
    }
    if (!closest || hit.distance < closest.distance) {
      closest = hit;
    }
  }
  if (closest) {
    return closest.point;
  }
  return [
    origin[0] + Math.cos(angle) * radiusPx,
    origin[1] + Math.sin(angle) * radiusPx
  ];
}

function collectRayAngles(sourcePoint, radiusPx, segments) {
  const angles = new Map();
  for (let index = 0; index < RADIUS_RAY_COUNT; index += 1) {
    const angle = (index / RADIUS_RAY_COUNT) * Math.PI * 2;
    angles.set(angle.toFixed(7), angle);
  }
  for (const segment of segments) {
    for (const point of segment) {
      if (Math.hypot(point[0] - sourcePoint[0], point[1] - sourcePoint[1]) > radiusPx + TILE_SIZE_PX) {
        continue;
      }
      const base = Math.atan2(point[1] - sourcePoint[1], point[0] - sourcePoint[0]);
      for (const offset of [-ANGLE_EPSILON, 0, ANGLE_EPSILON]) {
        const angle = normalizeAngle(base + offset);
        angles.set(angle.toFixed(7), angle);
      }
    }
  }
  return [...angles.values()].sort((a, b) => a - b);
}

export function computeLightPolygon(state, source) {
  const sourcePoint = [
    (Number(source.x) + 0.5) * TILE_SIZE_PX,
    (Number(source.y) + 0.5) * TILE_SIZE_PX
  ];
  const radiusPx = (Math.max(1, Number(source.radius) || 6) + 0.5) * TILE_SIZE_PX;
  const segments = collectBlockingSegments(state, source, sourcePoint, radiusPx);
  const angles = collectRayAngles(sourcePoint, radiusPx, segments);
  return angles.map((angle) => castRay(sourcePoint, angle, radiusPx, segments));
}

export function isPointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 0.000001) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function isTileCenterInLightPolygon(tile, polygon) {
  if (!tile || tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.VOID) {
    return false;
  }
  return isPointInPolygon([
    (tile.x + 0.5) * TILE_SIZE_PX,
    (tile.y + 0.5) * TILE_SIZE_PX
  ], polygon);
}

export function isTileTouchedByLightPolygon(tile, polygon) {
  if (!tile || tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.VOID) {
    return false;
  }
  for (const [sampleX, sampleY] of TILE_SAMPLE_POINTS) {
    const point = [
      (tile.x + sampleX) * TILE_SIZE_PX,
      (tile.y + sampleY) * TILE_SIZE_PX
    ];
    if (isPointInPolygon(point, polygon)) {
      return true;
    }
  }
  return false;
}
