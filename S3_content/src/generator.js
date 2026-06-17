import {
  DOOR_STATES,
  ENTITY_TYPES,
  FEATURE_NAMES,
  TILE_TYPES,
  TREASURE_SPAWN_CHANCE
} from "./constants.js";
import { SeededRng } from "./rng.js";
import {
  createDoorEntity,
  createEmptyDungeonState,
  getTile,
  setTileType,
} from "./state-schema.js";
import { createTreasureDetails } from "./treasure.js";

const RECT_GRAPH_DIRECTIONS = Object.freeze({
  north: Object.freeze({ x: 0, y: -1 }),
  south: Object.freeze({ x: 0, y: 1 }),
  west: Object.freeze({ x: -1, y: 0 }),
  east: Object.freeze({ x: 1, y: 0 })
});
const RECT_GRAPH_SIDES = Object.freeze(["north", "south", "west", "east"]);
const RECT_GRAPH_OPPOSITE = Object.freeze({
  north: "south",
  south: "north",
  west: "east",
  east: "west"
});
const ARCHITECTURE_PATTERNS = Object.freeze([
  "processional",
  "cross",
  "hub",
  "symmetricWings",
  "chain",
  "web",
  "symmetry",
  "almostSymmetry",
  "fortress",
  "forked",
  "boring",
  "almostBoring",
  "maze",
  "gallery",
  "waterLogged"
]);
const ROOM_ROLES = Object.freeze({
  ENTRANCE: "entrance",
  JUNCTION: "junction",
  GUARD: "guardRoom",
  VAULT: "vault",
  SHRINE: "shrine",
  WATER: "waterRoom",
  ROTUNDA: "rotunda",
  ENDING: "ending",
  DEAD_END: "deadEndFeature",
  CHAMBER: "chamber"
});
const WATER_FLAT_KEYS = Object.freeze([
  "water-nn-1", "water-nn-2", "water-nn-3", "water-nn-4", "water-nn-5", "water-nn-6",
  "water-nn-7", "water-nn-8", "water-nn-9", "water-nn-10", "water-nn-12"
]);
const WATER_DIAGONAL_KEYS = Object.freeze(Array.from({ length: 13 }, (_, index) => `water-nw-${index + 1}`));
const ROUND_CORNERS_ENABLED = true;
const ROUND_CORNER_MAX_SIZE = 1;
const ROTUNDA_ROOM_CHANCE = 0.28;
const MAX_ROTUNDAS = 3;
const COMPOUND_ROOM_CHANCE = 0.26;
const L_SHAPED_ROOM_CHANCE = 0.06;
const TREASURE_TARGET_ROOM_RATIO = 0.72;
const VISIBLE_TREASURE_ROOM_RATIO = 0.3;

function intersects(a, b, margin = 1) {
  return !(
    a.x + a.width + margin <= b.x ||
    b.x + b.width + margin <= a.x ||
    a.y + a.height + margin <= b.y ||
    b.y + b.height + margin <= a.y
  );
}

function isCornerBlockedTile(room, x, y, cornerSize, corner) {
  if (cornerSize <= 1) {
    return false;
  }

  const max = cornerSize - 1;
  let lx = 0;
  let ly = 0;

  if (corner === "sw") {
    lx = x - room.x;
    ly = room.y + room.height - 1 - y;
  } else if (corner === "se") {
    lx = room.x + room.width - 1 - x;
    ly = room.y + room.height - 1 - y;
  } else if (corner === "nw") {
    lx = x - room.x;
    ly = y - room.y;
  } else {
    lx = room.x + room.width - 1 - x;
    ly = y - room.y;
  }

  if (lx < 0 || ly < 0 || lx > max || ly > max) {
    return false;
  }

  if (lx === 0 || ly === 0) {
    return true;
  }

  return lx === 1 && ly === 1;
}

function getRoomOpeningSides(room) {
  const openings = Array.isArray(room.rotundaOpenings) && room.rotundaOpenings.length
    ? room.rotundaOpenings
    : [room.rotundaOpening || room.opening || "south"];
  return openings.map((opening) => String(opening || "").toLowerCase()).filter(Boolean);
}

function isRotundaExitTile(room, x, y, size) {
  const centerX = room.x + Math.floor(size / 2);
  const centerY = room.y + Math.floor(size / 2);
  return getRoomOpeningSides(room).some((side) => {
    if (side === "north" || side === "n") return x === centerX && y === room.y;
    if (side === "south" || side === "s") return x === centerX && y === room.y + size - 1;
    if (side === "west" || side === "w") return x === room.x && y === centerY;
    if (side === "east" || side === "e") return x === room.x + size - 1 && y === centerY;
    return false;
  });
}

function isRoomFloorTile(room, x, y) {
  if (room.rotunda === true) {
    const rotundaSize = Number(room.rotundaSize || room.width || room.height);
    if (rotundaSize === 5) {
      const inInnerFloor = x >= room.x + 1 &&
        x <= room.x + room.width - 2 &&
        y >= room.y + 1 &&
        y <= room.y + room.height - 2;
      return inInnerFloor || isRotundaExitTile(room, x, y, 5);
    }
    if (rotundaSize === 7) {
      const dx = x - (room.x + 3);
      const dy = y - (room.y + 3);
      return !(Math.abs(dx) === 3 && Math.abs(dy) === 3);
    }
    const centerX = room.x + Math.floor(room.width / 2);
    const centerY = room.y + Math.floor(room.height / 2);
    const radius = Math.max(1, Math.floor(Math.min(room.width, room.height) / 2) - 1);
    const dx = Math.abs(x - centerX);
    const dy = Math.abs(y - centerY);
    return (dx * dx + dy * dy) <= (radius * radius + radius);
  }

  const cornerSize = Number(room.cornerSize || 0);
  if (!cornerSize) {
    return isCompoundRoomFloorTile(room, x, y);
  }

  const width = Number(room.width);
  const height = Number(room.height);
  const inSouthWest = isCornerBlockedTile(room, x, y, cornerSize, "sw");
  const inSouthEast = isCornerBlockedTile(room, x, y, cornerSize, "se");
  const inNorthWest = isCornerBlockedTile(room, x, y, cornerSize, "nw");
  const inNorthEast = isCornerBlockedTile(room, x, y, cornerSize, "ne");
  return isCompoundRoomFloorTile(room, x, y) && !(inSouthWest || inSouthEast || inNorthWest || inNorthEast);
}

function isCompoundRoomFloorTile(room, x, y) {
  const shape = String(room.shape || "rect").toLowerCase();
  if (shape === "rect" || room.rotunda === true) {
    return true;
  }
  const lx = x - room.x;
  const ly = y - room.y;
  const width = Number(room.width);
  const height = Number(room.height);
  if (lx < 0 || ly < 0 || lx >= width || ly >= height) {
    return false;
  }
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  const stemWidth = Math.max(2, Math.floor(width / 2));
  const stemLeft = Math.max(0, Math.floor((width - stemWidth) / 2));
  const stemRight = Math.min(width - 1, stemLeft + stemWidth - 1);
  const barHeight = Math.max(2, Math.floor(height / 2));
  const barTop = Math.max(0, Math.floor((height - barHeight) / 2));
  const barBottom = Math.min(height - 1, barTop + barHeight - 1);

  if (shape === "t-north") return ly <= midY || (lx >= stemLeft && lx <= stemRight);
  if (shape === "t-south") return ly >= midY || (lx >= stemLeft && lx <= stemRight);
  if (shape === "t-west") return lx <= midX || (ly >= barTop && ly <= barBottom);
  if (shape === "t-east") return lx >= midX || (ly >= barTop && ly <= barBottom);
  if (shape === "pear-north") return ly <= midY || (lx >= stemLeft && lx <= stemRight);
  if (shape === "pear-south") return ly >= midY || (lx >= stemLeft && lx <= stemRight);
  if (shape === "pear-west") return lx <= midX || (ly >= barTop && ly <= barBottom);
  if (shape === "pear-east") return lx >= midX || (ly >= barTop && ly <= barBottom);
  if (shape === "l-ne") return lx >= midX || ly <= midY;
  if (shape === "l-se") return lx >= midX || ly >= midY;
  if (shape === "l-sw") return lx <= midX || ly >= midY;
  if (shape === "l-nw") return lx <= midX || ly <= midY;
  return true;
}

function carveRoom(state, room) {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (!isRoomFloorTile(room, x, y)) {
        continue;
      }
      setTileType(state, x, y, TILE_TYPES.FLOOR, { roomId: room.id });
    }
  }
}

function carveHallTile(state, x, y, hallId) {
  const tile = getTile(state, x, y);
  if (!tile) {
    return;
  }
  if (tile.type === TILE_TYPES.WALL) {
    setTileType(state, x, y, TILE_TYPES.FLOOR, { hallId });
  } else if (tile.type === TILE_TYPES.FLOOR && tile.hallId === null && tile.roomId === null) {
    tile.hallId = hallId;
  }
}

function carveLShapedHall(state, from, to, hallId, rng) {
  const horizontalFirst = rng.nextFloat() > 0.5;
  const mid = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };

  const points = [from, mid, to];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const xStep = Math.sign(end.x - start.x);
    const yStep = Math.sign(end.y - start.y);
    let x = start.x;
    let y = start.y;
    carveHallTile(state, x, y, hallId);
    while (x !== end.x || y !== end.y) {
      if (x !== end.x) x += xStep;
      if (y !== end.y) y += yStep;
      carveHallTile(state, x, y, hallId);
    }
  }
}

function getRoomCenter(room) {
  return {
    x: Math.floor(room.x + room.width / 2),
    y: Math.floor(room.y + room.height / 2)
  };
}

function getDoorSwingMetadata(room, endpoint) {
  const roomCenter = getRoomCenter(room);
  const isVerticalWall = endpoint.orientation === "vertical";
  const isFirstHalf = isVerticalWall
    ? endpoint.door.y <= roomCenter.y
    : endpoint.door.x <= roomCenter.x;

  if (isVerticalWall) {
    return {
      hingeSide: isFirstHalf ? "north" : "south",
      swingTarget: endpoint.wallSide === "west"
        ? (isFirstHalf ? "hall" : "room")
        : (isFirstHalf ? "room" : "hall")
    };
  }

  return {
    hingeSide: isFirstHalf ? "west" : "east",
    swingTarget: endpoint.wallSide === "north"
      ? (isFirstHalf ? "hall" : "room")
      : (isFirstHalf ? "room" : "hall")
  };
}

function resolveTurnDirection(wallSide, hingeSide, swingTarget) {
  const swingIntoRoom = swingTarget === "room";
  if (wallSide === "east") {
    return hingeSide === "north"
      ? (swingIntoRoom ? -1 : 1)
      : (swingIntoRoom ? 1 : -1);
  }
  if (wallSide === "west") {
    return hingeSide === "north"
      ? (swingIntoRoom ? 1 : -1)
      : (swingIntoRoom ? -1 : 1);
  }
  if (wallSide === "south") {
    return hingeSide === "west"
      ? (swingIntoRoom ? -1 : 1)
      : (swingIntoRoom ? 1 : -1);
  }
  return hingeSide === "west"
    ? (swingIntoRoom ? 1 : -1)
    : (swingIntoRoom ? -1 : 1);
}

function getStraightStep(point, direction, steps = 1) {
  return {
    x: point.x + direction.x * steps,
    y: point.y + direction.y * steps
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isCornerTouchingRoom(state, x, y) {
  return state.rooms.some((room) => {
    const roomMinX = room.x;
    const roomMaxX = room.x + room.width - 1;
    const roomMinY = room.y;
    const roomMaxY = room.y + room.height - 1;
    const dx = Math.min(Math.abs(x - roomMinX), Math.abs(x - roomMaxX));
    const dy = Math.min(Math.abs(y - roomMinY), Math.abs(y - roomMaxY));
    return dx === 1 && dy === 1;
  });
}

function collectOrthogonalPathTiles(start, end) {
  const tiles = [];
  let x = start.x;
  let y = start.y;
  tiles.push({ x, y });
  const xStep = Math.sign(end.x - start.x);
  const yStep = Math.sign(end.y - start.y);
  while (x !== end.x || y !== end.y) {
    if (x !== end.x) x += xStep;
    if (y !== end.y) y += yStep;
    tiles.push({ x, y });
  }
  return tiles;
}

function scoreHallRoute(state, points) {
  let score = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const segmentTiles = collectOrthogonalPathTiles(points[i], points[i + 1]);
    for (const tile of segmentTiles) {
      if (isCornerTouchingRoom(state, tile.x, tile.y)) {
        score += 1;
      }
    }
  }
  return score;
}

function pickHallRoute(state, start, end, rng) {
  const horizontalFirst = [
    start,
    { x: end.x, y: start.y },
    end
  ];
  const verticalFirst = [
    start,
    { x: start.x, y: end.y },
    end
  ];
  const horizontalScore = scoreHallRoute(state, horizontalFirst);
  const verticalScore = scoreHallRoute(state, verticalFirst);
  if (horizontalScore < verticalScore) {
    return horizontalFirst;
  }
  if (verticalScore < horizontalScore) {
    return verticalFirst;
  }
  return rng.nextFloat() < 0.5 ? horizontalFirst : verticalFirst;
}

function carveOrthogonalRoute(state, points, hallId) {
  if (!points || points.length < 2) {
    return;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const segment = collectOrthogonalPathTiles(points[i], points[i + 1]);
    for (const tile of segment) {
      carveHallTile(state, tile.x, tile.y, hallId);
    }
  }
}

function getDoorEndpoint(room, target) {
  const roomCenter = getRoomCenter(room);
  const dx = target.x - roomCenter.x;
  const dy = target.y - roomCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const east = dx >= 0;
    const yMin = room.height > 2 ? room.y + 1 : room.y;
    const yMax = room.height > 2 ? room.y + room.height - 2 : room.y + room.height - 1;
    const y = clamp(target.y, yMin, yMax);
    const direction = east ? { x: 1, y: 0 } : { x: -1, y: 0 };
    const doorX = east ? room.x + room.width : room.x - 1;
    const hallEntry = { x: doorX, y };
    const hallTurn = getStraightStep(hallEntry, direction);
    return {
      door: { x: hallEntry.x, y },
      hallEntry,
      hallTurn,
      wallSide: east ? "east" : "west",
      hallDirection: east ? "east" : "west",
      orientation: "vertical"
    };
  }

  const south = dy >= 0;
  const xMin = room.width > 2 ? room.x + 1 : room.x;
  const xMax = room.width > 2 ? room.x + room.width - 2 : room.x + room.width - 1;
  const x = clamp(target.x, xMin, xMax);
  const direction = south ? { x: 0, y: 1 } : { x: 0, y: -1 };
  const doorY = south ? room.y + room.height : room.y - 1;
  const hallEntry = { x, y: doorY };
  const hallTurn = getStraightStep(hallEntry, direction);
  return {
    door: { x, y: hallEntry.y },
    hallEntry,
    hallTurn,
    wallSide: south ? "south" : "north",
    hallDirection: south ? "south" : "north",
    orientation: "horizontal"
  };
}

function buildRoomGraph(rooms) {
  const edges = [];
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const a = getRoomCenter(rooms[i]);
      const b = getRoomCenter(rooms[j]);
      const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      edges.push({ from: rooms[i], to: rooms[j], distance });
    }
  }
  edges.sort((a, b) => a.distance - b.distance);
  return edges;
}

function find(parent, id) {
  if (parent.get(id) !== id) {
    parent.set(id, find(parent, parent.get(id)));
  }
  return parent.get(id);
}

function union(parent, rank, a, b) {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA === rootB) {
    return false;
  }
  const rankA = rank.get(rootA);
  const rankB = rank.get(rootB);
  if (rankA < rankB) {
    parent.set(rootA, rootB);
  } else if (rankA > rankB) {
    parent.set(rootB, rootA);
  } else {
    parent.set(rootB, rootA);
    rank.set(rootA, rankA + 1);
  }
  return true;
}

function connectRoomsWithMstAndLoops(state, rooms, rng) {
  const parent = new Map();
  const rank = new Map();
  for (const room of rooms) {
    parent.set(room.id, room.id);
    rank.set(room.id, 0);
  }

  const edges = buildRoomGraph(rooms);
  let hallCounter = 0;
  const chosen = [];

  for (const edge of edges) {
    if (union(parent, rank, edge.from.id, edge.to.id)) {
      chosen.push(edge);
    }
  }

  let extraLoops = 0;
  const maxExtraLoops = Math.max(1, Math.floor(rooms.length * 0.2));
  for (const edge of edges) {
    if (chosen.includes(edge)) {
      continue;
    }
    if (extraLoops < maxExtraLoops && rng.nextFloat() < 0.08) {
      chosen.push(edge);
      extraLoops += 1;
    }
  }

  for (const edge of chosen) {
    const hallId = `hall-${hallCounter}`;
    hallCounter += 1;
    const fromCenter = getRoomCenter(edge.from);
    const toCenter = getRoomCenter(edge.to);
    const fromEndpoint = getDoorEndpoint(edge.from, toCenter);
    const toEndpoint = getDoorEndpoint(edge.to, fromCenter);

    carveHallTile(state, fromEndpoint.hallEntry.x, fromEndpoint.hallEntry.y, hallId);
    carveHallTile(state, fromEndpoint.hallTurn.x, fromEndpoint.hallTurn.y, hallId);
    carveHallTile(state, toEndpoint.hallEntry.x, toEndpoint.hallEntry.y, hallId);
    carveHallTile(state, toEndpoint.hallTurn.x, toEndpoint.hallTurn.y, hallId);

    const route = pickHallRoute(state, fromEndpoint.hallTurn, toEndpoint.hallTurn, rng);
    carveOrthogonalRoute(state, route, hallId);

    const fromDoorMeta = getDoorSwingMetadata(edge.from, fromEndpoint);
    const toDoorMeta = getDoorSwingMetadata(edge.to, toEndpoint);
    fromDoorMeta.turnDirection = resolveTurnDirection(
      fromEndpoint.wallSide,
      fromDoorMeta.hingeSide,
      fromDoorMeta.swingTarget
    );
    toDoorMeta.turnDirection = resolveTurnDirection(
      toEndpoint.wallSide,
      toDoorMeta.hingeSide,
      toDoorMeta.swingTarget
    );

    const fromDoor = addDoorEntity(
      state,
      fromEndpoint.door.x,
      fromEndpoint.door.y,
      edge.from.id,
      hallId,
      rng,
      fromEndpoint.orientation,
      fromEndpoint.wallSide,
      fromEndpoint.hallDirection,
      fromDoorMeta.hingeSide,
      fromDoorMeta.swingTarget,
      fromDoorMeta.turnDirection
    );
    const toDoor = addDoorEntity(
      state,
      toEndpoint.door.x,
      toEndpoint.door.y,
      edge.to.id,
      hallId,
      rng,
      toEndpoint.orientation,
      toEndpoint.wallSide,
      toEndpoint.hallDirection,
      toDoorMeta.hingeSide,
      toDoorMeta.swingTarget,
      toDoorMeta.turnDirection
    );

    state.halls.push({
      id: hallId,
      fromRoomId: edge.from.id,
      toRoomId: edge.to.id,
      doors: [fromDoor.id, toDoor.id]
    });
  }
}

function addDoorEntity(
  state,
  x,
  y,
  roomId,
  hallId,
  rng,
  orientation = "vertical",
  wallSide = null,
  hallDirection = null,
  hingeSide = null,
  swingTarget = "hall",
  turnDirection = 1
) {
  const existing = state.entities.find((entity) => entity.subtype === "door" && entity.x === x && entity.y === y);
  if (existing) {
    existing.connectedHallIds = Array.from(new Set([...(existing.connectedHallIds || [existing.hallId]), hallId]));
    if (!existing.orientation) {
      existing.orientation = orientation;
    }
    if (!existing.wallSide) {
      existing.wallSide = wallSide;
    }
    if (!existing.hallDirection) {
      existing.hallDirection = hallDirection;
    }
    if (!existing.hingeSide) {
      existing.hingeSide = hingeSide;
    }
    if (!existing.swingTarget) {
      existing.swingTarget = swingTarget;
    }
    if (!existing.turnDirection) {
      existing.turnDirection = turnDirection;
    }
    if (!existing.doorSpriteId) {
      existing.doorSpriteId = `door${rng.nextInt(1, 4)}`;
    }
    if (existing.doorRotationAngle === undefined) {
      existing.doorRotationAngle = orientation === "horizontal"
        ? (rng.nextFloat() < 0.5 ? 0 : Math.PI)
        : (rng.nextFloat() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    }
    return existing;
  }

  const door = createDoorEntity(
    x,
    y,
    roomId,
    hallId,
    rng,
    orientation,
    wallSide,
    hallDirection,
    hingeSide,
    swingTarget,
    turnDirection
  );
  door.connectedHallIds = [hallId];
  state.entities.push(door);
  return door;
}

function floodFillReachableRooms(state, startRoomId) {
  const visited = new Set();
  const queue = [startRoomId];
  while (queue.length) {
    const roomId = queue.shift();
    if (visited.has(roomId)) {
      continue;
    }
    visited.add(roomId);
    for (const hall of state.halls) {
      if (hall.fromRoomId === roomId && hall.toRoomId && !visited.has(hall.toRoomId)) {
        queue.push(hall.toRoomId);
      }
      if (hall.toRoomId === roomId && hall.fromRoomId && !visited.has(hall.fromRoomId)) {
        queue.push(hall.fromRoomId);
      }
    }
  }
  return visited;
}

function isWalkableForValidation(tile) {
  return tile?.type === TILE_TYPES.FLOOR;
}

function validateTileConnectivity(state) {
  const start = getTile(state, state.player.x, state.player.y);
  if (!isWalkableForValidation(start)) {
    return false;
  }

  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const tile = queue.shift();
    const key = `${tile.x},${tile.y}`;
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const neighbor = getTile(state, tile.x + dx, tile.y + dy);
      if (isWalkableForValidation(neighbor) && !visited.has(`${neighbor.x},${neighbor.y}`)) {
        queue.push(neighbor);
      }
    }
  }

  return state.rooms.every((room) => {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (!isRoomFloorTile(room, x, y)) {
          continue;
        }
        if (visited.has(`${x},${y}`)) {
          return true;
        }
      }
    }
    const center = getRoomCenter(room);
    return visited.has(`${center.x},${center.y}`);
  });
}

function isActiveOccupant(entity) {
  if (entity.type === ENTITY_TYPES.MONSTER && entity.defeated) {
    return false;
  }
  if (entity.type === ENTITY_TYPES.TREASURE && entity.collected) {
    return false;
  }
  if (entity.type === ENTITY_TYPES.TRAP && (entity.disarmed || entity.triggered)) {
    return false;
  }
  return true;
}

function occupiesFloor(entity) {
  if (!isActiveOccupant(entity)) {
    return false;
  }
  if (entity.subtype === "door") {
    return true;
  }
  if (entity.type === ENTITY_TYPES.TRAP && entity.targetType !== "tile") {
    return false;
  }
  return [
    ENTITY_TYPES.MONSTER,
    ENTITY_TYPES.TREASURE,
    ENTITY_TYPES.FEATURE,
    ENTITY_TYPES.TRAP
  ].includes(entity.type);
}

function isBlockingDecorAt(state, x, y) {
  const columns = Array.isArray(state.decor?.columns) ? state.decor.columns : [];
  return columns.some((column) => (
    column?.blocksMovement === true &&
    String(column.placement || "center") === "center" &&
    Number(column.x) === x &&
    Number(column.y) === y
  ));
}

function isFloorOccupied(state, x, y) {
  return isBlockingDecorAt(state, x, y) ||
    state.entities.some((entity) => entity.x === x && entity.y === y && occupiesFloor(entity));
}

function pickRandomFloorTileInRoom(state, rng, room, options = {}) {
  const candidates = [];
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      const tile = getTile(state, x, y);
      if (
        tile?.type === TILE_TYPES.FLOOR &&
        tile.roomId === room.id &&
        (options.allowOccupied || !isFloorOccupied(state, x, y))
      ) {
        candidates.push(tile);
      }
    }
  }
  return candidates.length ? rng.pick(candidates) : null;
}

function spawnEntity(state, rng, room, idPrefix, type, subtype, visible = true, extra = {}) {
  const spawnTile = pickRandomFloorTileInRoom(state, rng, room, extra.placement || {});
  if (!spawnTile) {
    return null;
  }
  const entity = {
    id: extra.id || `${idPrefix}-${state.entities.length}`,
    type,
    subtype,
    x: spawnTile.x,
    y: spawnTile.y,
    roomId: room.id,
    visible,
    ...extra
  };
  delete entity.placement;
  state.entities.push(entity);
  return entity;
}

function createTrapDetails(rng, level, trapTable = []) {
  const validTraps = trapTable.filter((trap) => trap?.name && trap?.trigger && trap?.effect);
  const trap = rng.pick(validTraps);
  if (!trap) {
    return null;
  }
  const dc = rng.nextInt(8, 12) + Math.max(0, level - 1);
  return {
    name: trap.name,
    trigger: trap.trigger,
    effect: trap.effect,
    dc,
    searchDc: dc,
    revealed: false,
    disarmed: false,
    triggered: false
  };
}

function spawnTrap(state, rng, room, trapTable, targetType, targetEntityId = null) {
  const details = createTrapDetails(rng, state.level, trapTable);
  if (!details) {
    return null;
  }
  const target = targetEntityId
    ? state.entities.find((entity) => entity.id === targetEntityId)
    : null;
  if (targetEntityId && !target) {
    return null;
  }
  if (target) {
    state.entities.push({
      id: `trap-${state.entities.length}`,
      type: ENTITY_TYPES.TRAP,
      subtype: "target-trap",
      x: target.x,
      y: target.y,
      roomId: room.id,
      visible: false,
      ...details,
      targetType,
      targetEntityId
    });
    return state.entities[state.entities.length - 1];
  }
  return spawnEntity(state, rng, room, "trap", ENTITY_TYPES.TRAP, "hidden-trap", false, {
    ...details,
    targetType,
    targetEntityId
  });
}

function pickLootBucket(level) {
  if (level >= 5) {
    return [
      ["magic-item", 28],
      ["armor", 20],
      ["weapon", 22],
      ["gear", 30]
    ];
  }
  if (level >= 3) {
    return [
      ["magic-item", 12],
      ["armor", 24],
      ["weapon", 28],
      ["gear", 36]
    ];
  }
  return [
    ["magic-item", 5],
    ["armor", 12],
    ["weapon", 23],
    ["gear", 60]
  ];
}

function normalizeLootEntry(item, kind) {
  if (!item) {
    return null;
  }
  const isMagicItem = kind === "magic-item";
  const name = item.name || item.slug || "treasure";
  const slots = Math.max(1, Number(item.slots ?? 1) || 1);
  const bonusSlots = Math.max(0, Number(item.bonusSlots ?? 0) || 0);
  return {
    name,
    kind,
    value: isMagicItem ? 0 : Math.max(0, Number(item.cost ?? item.value ?? 0) || 0),
    slots,
    bonusSlots,
    priceless: isMagicItem || item.priceless === true,
    description: item.description || "",
    searchDc: item.searchDc ?? null
  };
}

function pickLootTemplate(rng, level, lootCatalog = {}) {
  const lootPools = {
    "magic-item": Array.isArray(lootCatalog.magicItems) ? lootCatalog.magicItems : [],
    armor: Array.isArray(lootCatalog.armor) ? lootCatalog.armor : [],
    weapon: Array.isArray(lootCatalog.weapons) ? lootCatalog.weapons : [],
    gear: Array.isArray(lootCatalog.gear) ? lootCatalog.gear : []
  };
  const weightedKinds = pickLootBucket(level).filter(([kind]) => lootPools[kind].length > 0);
  if (!weightedKinds.length) {
    return null;
  }
  const totalWeight = weightedKinds.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.nextInt(1, totalWeight);
  let chosenKind = weightedKinds[0][0];
  for (const [kind, weight] of weightedKinds) {
    roll -= weight;
    if (roll <= 0) {
      chosenKind = kind;
      break;
    }
  }
  const item = rng.pick(lootPools[chosenKind]);
  const loot = normalizeLootEntry(item, chosenKind);
  if (loot?.name?.toLowerCase() === "bag of holding") {
    loot.bonusSlots = 10;
  }
  return loot;
}

function createLootDetails(rng, state, lootCatalog = {}) {
  const loot = createTreasureDetails(state, rng);
  loot.searchDc = rng.nextInt(8, 14);
  return loot;
}

function tileDistanceFromStart(state, x, y) {
  return Math.max(Math.abs(x - state.player.x), Math.abs(y - state.player.y));
}

function getFloorTilesInRoom(state, room, options = {}) {
  const tiles = [];
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      const tile = getTile(state, x, y);
      if (
        tile?.type === TILE_TYPES.FLOOR &&
        tile.roomId === room.id &&
        (options.allowOccupied || !isFloorOccupied(state, x, y))
      ) {
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

function findFurthestRoomFromStart(state, excludedRoomIds = []) {
  let bestRoom = null;
  let bestDistance = -1;
  for (const room of state.rooms) {
    if (excludedRoomIds.includes(room.id)) {
      continue;
    }
    const tiles = getFloorTilesInRoom(state, room, { allowOccupied: true });
    for (const tile of tiles) {
      const distance = tileDistanceFromStart(state, tile.x, tile.y);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestRoom = room;
      }
    }
  }
  return bestRoom;
}

function findFurthestFloorTileInRoomFromStart(state, room, options = {}) {
  let bestTile = null;
  let bestDistance = -1;
  for (const tile of getFloorTilesInRoom(state, room, options)) {
    const distance = tileDistanceFromStart(state, tile.x, tile.y);
    if (distance > bestDistance) {
      bestDistance = distance;
      bestTile = tile;
    }
  }
  return bestTile;
}

function countTreasureRooms(state) {
  const roomIds = new Set();
  for (const entity of state.entities) {
    if (entity.type === ENTITY_TYPES.TREASURE) {
      roomIds.add(entity.roomId);
    }
  }
  return roomIds.size;
}

function getExpectedTreasureRoomCount(totalRooms, spawnChance = TREASURE_TARGET_ROOM_RATIO) {
  return Math.ceil(totalRooms * spawnChance);
}

function getGhostTreasureMultiplier(expectedCount, actualTreasureRoomCount) {
  if (actualTreasureRoomCount <= 0) {
    return expectedCount;
  }
  return expectedCount - actualTreasureRoomCount + 1;
}

function findFurthestTreasureFromStart(state) {
  let bestTreasure = null;
  let bestDistance = -1;
  for (const entity of state.entities) {
    if (entity.type !== ENTITY_TYPES.TREASURE) {
      continue;
    }
    const distance = tileDistanceFromStart(state, entity.x, entity.y);
    if (distance > bestDistance) {
      bestDistance = distance;
      bestTreasure = entity;
    }
  }
  return bestTreasure;
}

function spawnTreasureAtTile(state, rng, room, tile, extra = {}, lootCatalog = {}) {
  const loot = createLootDetails(rng, state, lootCatalog);
  const treasureId = extra.id || `treasure-${state.entities.length}`;
  const entity = {
    id: treasureId,
    type: ENTITY_TYPES.TREASURE,
    subtype: loot.kind || "coin-cache",
    kind: loot.kind || "coin-cache",
    x: tile.x,
    y: tile.y,
    roomId: room.id,
    visible: false,
    name: loot.name,
    value: loot.value,
    searchDc: loot.searchDc,
    slots: loot.slots,
    bonusSlots: loot.bonusSlots,
    priceless: loot.priceless,
    description: loot.description,
    gearItem: loot.gearItem ? JSON.parse(JSON.stringify(loot.gearItem)) : null,
    revealed: false,
    collected: false,
    ...extra
  };
  state.entities.push(entity);
  return entity;
}

function trySpawnRoomTreasure(state, rng, room, trapTable, lootCatalog = {}, spawnChance = TREASURE_SPAWN_CHANCE) {
  if (rng.nextFloat() >= spawnChance) {
    return null;
  }
  const loot = createLootDetails(rng, state, lootCatalog);
  const treasureId = `treasure-${state.entities.length}`;
  const treasure = spawnEntity(state, rng, room, "treasure", ENTITY_TYPES.TREASURE, "coin-cache", false, {
    id: treasureId,
    kind: loot.kind,
    name: loot.name,
    value: loot.value,
    searchDc: loot.searchDc,
    slots: loot.slots,
    bonusSlots: loot.bonusSlots,
    priceless: loot.priceless,
    description: loot.description,
    gearItem: loot.gearItem ? JSON.parse(JSON.stringify(loot.gearItem)) : null,
    revealed: false,
    collected: false
  });
  if (treasure && rng.nextFloat() < 0.25) {
    spawnTrap(state, rng, room, trapTable, "treasure", treasureId);
  }
  return treasure;
}

function chooseArchitecturePattern(rng) {
  const mixed = (rng.next() ^ (rng.next() >>> 7) ^ (rng.next() >>> 15)) >>> 0;
  return ARCHITECTURE_PATTERNS[mixed % ARCHITECTURE_PATTERNS.length] || "processional";
}

function getInitialExitSides(pattern, rng) {
  if (pattern === "web") {
    return RECT_GRAPH_SIDES;
  }
  if (pattern === "forked") {
    return ["east", "north"];
  }
  if (pattern === "maze") {
    return rng.nextFloat() < 0.65 ? ["east"] : ["east", "north"];
  }
  if (pattern === "cross" || pattern === "hub" || pattern === "gallery") {
    return ["north", "south", "east"];
  }
  if (pattern === "symmetricWings" || pattern === "symmetry" || pattern === "almostSymmetry") {
    return rng.nextFloat() < 0.5 ? ["north", "south", "east"] : ["east", "north", "south"];
  }
  if (pattern === "chain" || pattern === "fortress" || pattern === "boring" || pattern === "almostBoring") {
    return rng.nextFloat() < 0.35 ? ["east", "north"] : ["east"];
  }
  return rng.nextFloat() < 0.45 ? ["east", "north", "south"] : ["east", "south"];
}

function addInitialRoomExits(queue, room, rng, pattern) {
  for (const side of getInitialExitSides(pattern, rng)) {
    queue.push({ room, side, depth: 1, architecture: pattern });
  }
}

function getRoomGraphStats(state) {
  const stats = new Map(state.rooms.map((room) => [room.id, {
    degree: 0,
    doors: 0,
    hallIds: [],
    distance: Math.abs(getRoomCenter(room).x - state.player.x) + Math.abs(getRoomCenter(room).y - state.player.y)
  }]));
  for (const hall of state.halls) {
    for (const roomId of [hall.fromRoomId, hall.toRoomId]) {
      if (!roomId || !stats.has(roomId)) {
        continue;
      }
      const entry = stats.get(roomId);
      entry.degree += 1;
      entry.doors += Array.isArray(hall.doors) ? hall.doors.length : 0;
      entry.hallIds.push(hall.id);
    }
  }
  return stats;
}

function setRoomRole(room, role, description = null) {
  room.role = role;
  room.description = description || getRoleDescription(role);
}

function getRoleDescription(role) {
  const descriptions = {
    [ROOM_ROLES.ENTRANCE]: "An entrance chamber arranged to receive travelers from the dark.",
    [ROOM_ROLES.JUNCTION]: "A deliberate crossing chamber where several passages meet.",
    [ROOM_ROLES.GUARD]: "A watch room with clear sightlines toward nearby halls.",
    [ROOM_ROLES.VAULT]: "A protected chamber built to keep something valuable away from casual hands.",
    [ROOM_ROLES.SHRINE]: "A ceremonial room with an architectural focus and an uneasy stillness.",
    [ROOM_ROLES.WATER]: "A damp chamber where water has pooled across the worked stone.",
    [ROOM_ROLES.ROTUNDA]: "A round chamber whose curved wall changes how light moves through it.",
    [ROOM_ROLES.ENDING]: "A deep terminal chamber that feels like the dungeon was aiming here.",
    [ROOM_ROLES.DEAD_END]: "A small side chamber with a single strange feature.",
    [ROOM_ROLES.CHAMBER]: "A worked stone room with no obvious purpose yet."
  };
  return descriptions[role] || descriptions[ROOM_ROLES.CHAMBER];
}

function pickBestRoleCandidate(state, rooms, predicate, score) {
  let best = null;
  let bestScore = -Infinity;
  for (const room of rooms) {
    if (room.role || !predicate(room)) {
      continue;
    }
    const value = score(room);
    if (value > bestScore) {
      best = room;
      bestScore = value;
    }
  }
  return best;
}

function assignArchitecturalRoles(state, rng, pattern) {
  const stats = getRoomGraphStats(state);
  const entrance = state.rooms.find((room) => room.id === state.generation.entranceRoomId);
  if (entrance) {
    setRoomRole(entrance, ROOM_ROLES.ENTRANCE);
  }

  for (const room of state.rooms) {
    if (room.rotunda === true) {
      setRoomRole(room, ROOM_ROLES.ROTUNDA);
    }
  }

  const ending = state.rooms.find((room) => room.ending === true);
  if (ending) {
    setRoomRole(ending, ROOM_ROLES.ENDING);
  }

  const unassigned = () => state.rooms.filter((room) => !room.role);
  const largeRoomScore = (room) => {
    const area = Number(room.width) * Number(room.height);
    return area + (stats.get(room.id)?.distance || 0) * 0.4;
  };
  const deepDeadEndScore = (room) => {
    const stat = stats.get(room.id);
    return (stat?.distance || 0) + (room.graphDepth || 0) * 4;
  };

  for (const room of unassigned()) {
    const stat = stats.get(room.id);
    if ((stat?.degree || 0) >= 3) {
      setRoomRole(room, ROOM_ROLES.JUNCTION);
    }
  }

  const vault = pickBestRoleCandidate(
    state,
    unassigned(),
    (room) => (stats.get(room.id)?.degree || 0) <= 2 && (room.graphDepth || 0) >= 2,
    deepDeadEndScore
  );
  if (vault) {
    setRoomRole(vault, ROOM_ROLES.VAULT);
  }

  const shrine = pickBestRoleCandidate(
    state,
    unassigned(),
    (room) => Number(room.width) >= 5 && Number(room.height) >= 5,
    largeRoomScore
  );
  if (shrine) {
    setRoomRole(shrine, ROOM_ROLES.SHRINE);
  }

  const water = pickBestRoleCandidate(
    state,
    unassigned(),
    (room) => Number(room.width) >= 5 && Number(room.height) >= 5 && rng.nextFloat() < 0.82,
    largeRoomScore
  );
  if (water) {
    setRoomRole(water, ROOM_ROLES.WATER);
  }

  for (const room of unassigned()) {
    const stat = stats.get(room.id);
    if ((room.graphDepth || 0) <= 2 && rng.nextFloat() < 0.42) {
      setRoomRole(room, ROOM_ROLES.GUARD);
    } else if ((stat?.degree || 0) <= 1 && rng.nextFloat() < 0.48) {
      setRoomRole(room, ROOM_ROLES.DEAD_END);
    }
  }

  for (const room of state.rooms) {
    if (!room.role) {
      setRoomRole(room, ROOM_ROLES.CHAMBER);
    }
  }

  state.generation.architecture = {
    pattern,
    rolePassVersion: 1,
    roles: state.rooms.reduce((acc, room) => {
      acc[room.id] = room.role;
      return acc;
    }, {})
  };
}

function getRoomContentProfile(room) {
  const base = {
    monster: 0.45,
    treasure: 0.72,
    trap: 0.35,
    feature: 0.25,
    doorTrap: 0.15
  };
  const profiles = {
    [ROOM_ROLES.ENTRANCE]: { monster: 0.06, treasure: 0.08, trap: 0.02, feature: 0.18, doorTrap: 0.03 },
    [ROOM_ROLES.JUNCTION]: { monster: 0.34, treasure: 0.48, trap: 0.18, feature: 0.18, doorTrap: 0.1 },
    [ROOM_ROLES.GUARD]: { monster: 0.76, treasure: 0.58, trap: 0.18, feature: 0.12, doorTrap: 0.12 },
    [ROOM_ROLES.VAULT]: { monster: 0.28, treasure: 0.92, trap: 0.52, feature: 0.14, doorTrap: 0.42 },
    [ROOM_ROLES.SHRINE]: { monster: 0.38, treasure: 0.66, trap: 0.28, feature: 0.74, doorTrap: 0.14 },
    [ROOM_ROLES.WATER]: { monster: 0.26, treasure: 0.5, trap: 0.34, feature: 0.4, doorTrap: 0.08 },
    [ROOM_ROLES.ROTUNDA]: { monster: 0.42, treasure: 0.58, trap: 0.22, feature: 0.36, doorTrap: 0.12 },
    [ROOM_ROLES.ENDING]: { monster: 0.62, treasure: 0.92, trap: 0.42, feature: 0.38, doorTrap: 0.28 },
    [ROOM_ROLES.DEAD_END]: { monster: 0.16, treasure: 0.62, trap: 0.3, feature: 0.7, doorTrap: 0.08 },
    [ROOM_ROLES.CHAMBER]: base
  };
  return profiles[room.role] || base;
}

function applyArchitecturalDoorDetails(state, rng) {
  for (const door of state.entities.filter((entity) => entity.subtype === "door")) {
    const room = state.rooms.find((candidate) => candidate.id === door.roomId);
    if (!room) {
      continue;
    }
    if (room.role === ROOM_ROLES.VAULT && door.doorKind !== "gate" && rng.nextFloat() < 0.72) {
      door.doorState = DOOR_STATES.LOCKED;
    }
    if (room.role === ROOM_ROLES.DEAD_END && rng.nextFloat() < 0.18) {
      door.doorKind = "secret";
      door.secret = true;
    }
    if (room.role === ROOM_ROLES.SHRINE && rng.nextFloat() < 0.12) {
      door.doorKind = "gate";
      door.watabouDoorType = 5;
    }
  }
}

function finalizeRoomGeometry(state) {
  for (const room of state.rooms) {
    if (room.rotunda !== true) {
      continue;
    }
    const size = Number(room.rotundaSize || room.width || room.height || 7);
    const centerX = room.x + Math.floor(size / 2);
    const centerY = room.y + Math.floor(size / 2);
    const sideChecks = {
      north: { inside: { x: centerX, y: room.y }, outside: { x: centerX, y: room.y - 1 } },
      south: { inside: { x: centerX, y: room.y + size - 1 }, outside: { x: centerX, y: room.y + size } },
      west: { inside: { x: room.x, y: centerY }, outside: { x: room.x - 1, y: centerY } },
      east: { inside: { x: room.x + size - 1, y: centerY }, outside: { x: room.x + size, y: centerY } }
    };
    const openings = new Set(RECT_GRAPH_SIDES.filter((side) => {
      const check = sideChecks[side];
      const outside = getTile(state, check.outside.x, check.outside.y);
      const hasDoor = state.entities.some((door) => (
        door.subtype === "door" &&
        door.roomId === room.id &&
        door.wallSide === side &&
        door.x === check.outside.x &&
        door.y === check.outside.y
      ));
      return hasDoor || outside?.type === TILE_TYPES.FLOOR;
    }));
    if (!openings.size && room.rotundaOpening) {
      openings.add(room.rotundaOpening);
    }
    room.rotundaOpenings = RECT_GRAPH_SIDES.filter((side) => openings.has(side));
    carveRoom(state, room);
  }
}

function balanceTreasureSpawns(state, rng, trapTable = [], lootCatalog = {}) {
  const totalRooms = state.rooms.length;
  const expectedCount = getExpectedTreasureRoomCount(totalRooms);
  let treasureRoomCount = countTreasureRooms(state);

  if (treasureRoomCount === 0) {
    const furthestRoom = findFurthestRoomFromStart(state, [state.generation.entranceRoomId]);
    const tile = furthestRoom
      ? findFurthestFloorTileInRoomFromStart(state, furthestRoom)
      : null;
    if (tile) {
      const treasure = spawnTreasureAtTile(state, rng, furthestRoom, tile, {}, lootCatalog);
      if (treasure && rng.nextFloat() < 0.25) {
        spawnTrap(state, rng, furthestRoom, trapTable, "treasure", treasure.id);
      }
      treasureRoomCount = countTreasureRooms(state);
    }
  }

  if (treasureRoomCount >= expectedCount) {
    return;
  }

  const roomsWithTreasure = new Set(
    state.entities
      .filter((entity) => entity.type === ENTITY_TYPES.TREASURE && !entity.collected)
      .map((entity) => entity.roomId)
  );
  const candidates = state.rooms
    .filter((room) => room.id !== state.generation.entranceRoomId && !roomsWithTreasure.has(room.id))
    .map((room) => ({
      room,
      tile: findFurthestFloorTileInRoomFromStart(state, room)
    }))
    .filter((entry) => entry.tile)
    .sort((a, b) => (
      tileDistanceFromStart(state, b.tile.x, b.tile.y) -
      tileDistanceFromStart(state, a.tile.x, a.tile.y)
    ));

  for (const entry of candidates) {
    if (treasureRoomCount >= expectedCount) {
      break;
    }
    const treasure = spawnTreasureAtTile(state, rng, entry.room, entry.tile, {}, lootCatalog);
    if (!treasure) {
      continue;
    }
    roomsWithTreasure.add(entry.room.id);
    treasureRoomCount += 1;
    if (rng.nextFloat() < 0.18) {
      spawnTrap(state, rng, entry.room, trapTable, "treasure", treasure.id);
    }
  }

  if (treasureRoomCount >= expectedCount) {
    return;
  }

  const multiplier = getGhostTreasureMultiplier(expectedCount, treasureRoomCount);
  if (multiplier <= 1) {
    return;
  }

  const target = findFurthestTreasureFromStart(state);
  if (!target) {
    return;
  }
  target.value = Math.ceil(target.value * multiplier);
  target.ghostTreasure = true;
}

function ensureVisibleGroundTreasure(state, rng, lootCatalog = {}) {
  const eligibleRooms = state.rooms.filter((room) => room.id !== state.generation.entranceRoomId);
  if (!eligibleRooms.length) {
    return;
  }
  const targetCount = Math.max(1, Math.ceil(eligibleRooms.length * VISIBLE_TREASURE_ROOM_RATIO));
  const visibleTreasureRoomIds = new Set(
    state.entities
      .filter((entity) => (
        entity.type === ENTITY_TYPES.TREASURE &&
        !entity.collected &&
        entity.visible !== false
      ))
      .map((entity) => entity.roomId)
  );
  const hiddenTreasure = state.entities
    .filter((entity) => (
      entity.type === ENTITY_TYPES.TREASURE &&
      !entity.collected &&
      entity.visible === false &&
      entity.roomId !== state.generation.entranceRoomId
    ))
    .sort((a, b) => tileDistanceFromStart(state, b.x, b.y) - tileDistanceFromStart(state, a.x, a.y));

  for (const treasure of hiddenTreasure) {
    if (visibleTreasureRoomIds.size >= targetCount) {
      return;
    }
    if (visibleTreasureRoomIds.has(treasure.roomId)) {
      continue;
    }
    treasure.visible = true;
    treasure.revealed = true;
    treasure.groundTreasure = true;
    visibleTreasureRoomIds.add(treasure.roomId);
  }

  const candidates = eligibleRooms
    .filter((room) => !visibleTreasureRoomIds.has(room.id))
    .map((room) => ({
      room,
      tile: findFurthestFloorTileInRoomFromStart(state, room)
    }))
    .filter((entry) => entry.tile)
    .sort((a, b) => (
      tileDistanceFromStart(state, b.tile.x, b.tile.y) -
      tileDistanceFromStart(state, a.tile.x, a.tile.y)
    ));

  for (const entry of candidates) {
    if (visibleTreasureRoomIds.size >= targetCount) {
      break;
    }
    const treasure = spawnTreasureAtTile(state, rng, entry.room, entry.tile, {
      visible: true,
      revealed: true,
      groundTreasure: true
    }, lootCatalog);
    if (treasure) {
      visibleTreasureRoomIds.add(entry.room.id);
    }
  }
}

function createMonsterDetails(rng, monsterTable = []) {
  const validMonsters = monsterTable.filter((monster) => monster?.name || monster?.["Monster Name"]);
  const monster = rng.pick(validMonsters);
  if (!monster) {
    return null;
  }
  const name = monster.name || monster["Monster Name"];
  return {
    name,
    level: monster.level ?? monster.lv ?? null,
    ac: monster.ac ?? monster["**AC**"] ?? monster["AC"] ?? null,
    hp: monster.hp ?? monster["**HP**"] ?? monster["HP"] ?? null,
    attack: monster.attack ?? monster["**ATK**"] ?? monster["ATK"] ?? null,
    movement: monster.movement ?? monster.mv ?? null,
    abilities: monster.abilities || monster.talents || {},
    tags: monster.tags || [],
    defeated: false
  };
}

function populateRoomEntities(state, rng, monsterTable = [], trapTable = [], lootCatalog = {}) {
  for (const room of state.rooms) {
    if (room.id === state.generation.entranceRoomId) {
      continue;
    }
    const profile = getRoomContentProfile(room);
    if (rng.nextFloat() < profile.monster) {
      const monster = createMonsterDetails(rng, monsterTable);
      if (monster) {
        spawnEntity(state, rng, room, "monster", ENTITY_TYPES.MONSTER, "foe", true, monster);
      }
    }
    trySpawnRoomTreasure(state, rng, room, trapTable, lootCatalog, profile.treasure);
    if (rng.nextFloat() < profile.trap) {
      spawnTrap(state, rng, room, trapTable, "tile");
    }
    if (rng.nextFloat() < profile.feature) {
      const featureName = rng.pick(FEATURE_NAMES);
      spawnEntity(state, rng, room, "feature", ENTITY_TYPES.FEATURE, "room-feature", true, {
        name: featureName,
        worthlessLoot: true
      });
    }
  }

  for (const door of state.entities.filter((entity) => entity.subtype === "door")) {
    const room = state.rooms.find((candidate) => candidate.id === door.roomId);
    const profile = room ? getRoomContentProfile(room) : null;
    if (room && rng.nextFloat() < (profile?.doorTrap ?? 0.15)) {
      spawnTrap(state, rng, room, trapTable, "door", door.id);
    }
  }
}

function isRectInBounds(state, rect, margin = 1) {
  return rect.x >= margin &&
    rect.y >= margin &&
    rect.x + rect.width < state.map.width - margin &&
    rect.y + rect.height < state.map.height - margin;
}

function isFloorAt(state, x, y) {
  return getTile(state, x, y)?.type === TILE_TYPES.FLOOR;
}

function isRoomAreaClear(state, rect) {
  if (!isRectInBounds(state, rect, 2)) {
    return false;
  }
  if (state.rooms.some((room) => intersects(room, rect, 1))) {
    return false;
  }
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (isFloorAt(state, x, y)) {
        return false;
      }
    }
  }
  return true;
}

function pickRectGraphRoomSize(rng, depth = 0, pattern = "processional") {
  if (rng.nextFloat() < ROTUNDA_ROOM_CHANCE && depth > 1) {
    const rotundaSize = rng.nextFloat() < 0.62 ? 7 : 5;
    return { width: rotundaSize, height: rotundaSize, rotunda: true, rotundaSize };
  }
  if (pattern === "web" && depth <= 1) {
    return { width: rng.nextInt(8, 10), height: rng.nextInt(7, 9), rotunda: false };
  }
  if (pattern === "gallery") {
    return depth <= 2
      ? { width: rng.nextInt(7, 10), height: rng.nextInt(6, 8), rotunda: false }
      : { width: rng.nextInt(3, 4), height: rng.nextInt(3, 4), rotunda: false };
  }
  if (pattern === "maze") {
    return { width: rng.nextInt(3, 5), height: rng.nextInt(3, 5), rotunda: false };
  }
  if (pattern === "boring") {
    return { width: 5, height: 5, rotunda: false };
  }
  if (pattern === "almostBoring" && depth <= 2) {
    return rng.nextFloat() < 0.5
      ? { width: 4, height: 6, rotunda: false }
      : { width: 6, height: 4, rotunda: false };
  }
  if (pattern === "fortress") {
    const growth = Math.min(4, Math.max(0, depth - 1));
    return { width: rng.nextInt(4 + growth, 6 + growth), height: rng.nextInt(4 + growth, 6 + growth), rotunda: false };
  }
  const style = rng.pick(["small", "medium", "medium", "wide", "tall", "large"]);
  if (style === "small") {
    return { width: rng.nextInt(3, 5), height: rng.nextInt(3, 5), rotunda: false };
  }
  if (style === "wide") {
    return { width: rng.nextInt(6, 9), height: rng.nextInt(3, 5), rotunda: false };
  }
  if (style === "tall") {
    return { width: rng.nextInt(3, 5), height: rng.nextInt(6, 8), rotunda: false };
  }
  if (style === "large") {
    return { width: rng.nextInt(6, 8), height: rng.nextInt(5, 7), rotunda: false };
  }
  return { width: rng.nextInt(4, 7), height: rng.nextInt(4, 6), rotunda: false };
}

function pickRoomCornerSize(rng, width, height, depth = 0) {
  if (!ROUND_CORNERS_ENABLED) {
    return 0;
  }
  if (ROUND_CORNER_MAX_SIZE <= 1) {
    return rng.nextFloat() < 0.48 ? 1 : 0;
  }
  const minimum = Math.min(width, height);
  if (minimum < 4) {
    return 0;
  }

  const weights = [];
  if (minimum >= 7) {
    weights.push(4, 4, 3, 3, 2, 1);
  } else if (minimum >= 6) {
    weights.push(4, 3, 3, 2, 2, 1);
  } else if (minimum >= 5) {
    weights.push(3, 3, 2, 2, 1);
  } else {
    weights.push(2, 2, 1);
  }

  if (depth > 2 && rng.nextFloat() < 0.2) {
    weights.push(4);
  }

  return Math.min(ROUND_CORNER_MAX_SIZE, rng.pick(weights) || 0);
}

function pickCompoundRoomShape(rng, size, depth = 0, pattern = "processional") {
  if (size.rotunda === true || size.width < 8 || size.height < 8) {
    return "rect";
  }
  const styleChance = pattern === "gallery"
    ? COMPOUND_ROOM_CHANCE + 0.12
    : pattern === "maze"
      ? COMPOUND_ROOM_CHANCE - 0.1
      : COMPOUND_ROOM_CHANCE;
  if (rng.nextFloat() > Math.max(0, styleChance)) {
    return "rect";
  }
  if (rng.nextFloat() < L_SHAPED_ROOM_CHANCE) {
    return rng.pick(["l-ne", "l-se", "l-sw", "l-nw"]);
  }
  if (rng.nextFloat() < 0.56) {
    return rng.pick(["pear-north", "pear-south", "pear-east", "pear-west"]);
  }
  return rng.pick(["t-north", "t-south", "t-east", "t-west"]);
}

function getDoorInteriorTile(room, side, doorTile) {
  if (side === "east") return { x: room.x + room.width - 1, y: doorTile.y };
  if (side === "west") return { x: room.x, y: doorTile.y };
  if (side === "south") return { x: doorTile.x, y: room.y + room.height - 1 };
  return { x: doorTile.x, y: room.y };
}

function isDoorInteriorFloor(room, side, doorTile) {
  const interior = getDoorInteriorTile(room, side, doorTile);
  return isRoomFloorTile(room, interior.x, interior.y);
}

function fitCornerSizeToDoors(room, doorPlacements) {
  const original = Number(room.cornerSize || 0);
  for (let cornerSize = original; cornerSize >= 0; cornerSize -= 1) {
    room.cornerSize = cornerSize;
    if (doorPlacements.every((placement) => isDoorInteriorFloor(room, placement.side, placement.tile))) {
      return cornerSize;
    }
  }
  room.cornerSize = 0;
  return 0;
}

function getRoomAttachmentPoint(room, side, rng) {
  if (room.rotunda === true) {
    const size = Number(room.rotundaSize || room.width || room.height || 7);
    const radius = Math.floor(size / 2);
    const centerX = room.x + radius;
    const centerY = room.y + radius;
    if (side === "east") return { x: centerX + radius + 1, y: centerY };
    if (side === "west") return { x: centerX - radius - 1, y: centerY };
    if (side === "south") return { x: centerX, y: centerY + radius + 1 };
    return { x: centerX, y: centerY - radius - 1 };
  }
  if (side === "east" || side === "west") {
    const minY = room.height > 2 ? room.y + 1 : room.y;
    const maxY = room.height > 2 ? room.y + room.height - 2 : room.y + room.height - 1;
    const x = side === "east" ? room.x + room.width : room.x - 1;
    const candidates = [];
    for (let y = minY; y <= maxY; y += 1) {
      const tile = { x, y };
      if (isDoorInteriorFloor(room, side, tile)) {
        candidates.push(tile);
      }
    }
    return candidates.length ? rng.pick(candidates) : null;
  }
  const minX = room.width > 2 ? room.x + 1 : room.x;
  const maxX = room.width > 2 ? room.x + room.width - 2 : room.x + room.width - 1;
  const y = side === "south" ? room.y + room.height : room.y - 1;
  const candidates = [];
  for (let x = minX; x <= maxX; x += 1) {
    const tile = { x, y };
    if (isDoorInteriorFloor(room, side, tile)) {
      candidates.push(tile);
    }
  }
  return candidates.length ? rng.pick(candidates) : null;
}

function createAttachedRoomRect(doorTile, side, size, rng) {
  if (size.rotunda === true) {
    const radius = Math.floor(Number(size.rotundaSize || size.width || size.height || 7) / 2);
    if (side === "east") {
      return { x: doorTile.x + 1, y: doorTile.y - radius, width: size.width, height: size.height };
    }
    if (side === "west") {
      return { x: doorTile.x - size.width, y: doorTile.y - radius, width: size.width, height: size.height };
    }
    if (side === "south") {
      return { x: doorTile.x - radius, y: doorTile.y + 1, width: size.width, height: size.height };
    }
    return { x: doorTile.x - radius, y: doorTile.y - size.height, width: size.width, height: size.height };
  }
  if (side === "east") {
    const attachY = rng.nextInt(1, Math.max(1, size.height - 2));
    return { x: doorTile.x + 1, y: doorTile.y - attachY, width: size.width, height: size.height };
  }
  if (side === "west") {
    const attachY = rng.nextInt(1, Math.max(1, size.height - 2));
    return { x: doorTile.x - size.width, y: doorTile.y - attachY, width: size.width, height: size.height };
  }
  if (side === "south") {
    const attachX = rng.nextInt(1, Math.max(1, size.width - 2));
    return { x: doorTile.x - attachX, y: doorTile.y + 1, width: size.width, height: size.height };
  }
  const attachX = rng.nextInt(1, Math.max(1, size.width - 2));
  return { x: doorTile.x - attachX, y: doorTile.y - size.height, width: size.width, height: size.height };
}

function getDoorOrientationForSide(side) {
  return side === "east" || side === "west" ? "vertical" : "horizontal";
}

function getDoorMetaForSide(side) {
  const orientation = getDoorOrientationForSide(side);
  return {
    orientation,
    wallSide: side,
    hallDirection: side,
    hingeSide: orientation === "vertical" ? "north" : "west",
    swingTarget: "room",
    turnDirection: 1
  };
}

function carveRectGraphHall(state, hallTiles, hallId) {
  for (const tile of hallTiles) {
    carveHallTile(state, tile.x, tile.y, hallId);
  }
}

function areHallTilesClear(state, hallTiles) {
  if (!hallTiles.length) {
    return false;
  }
  const first = hallTiles[0];
  const last = hallTiles[hallTiles.length - 1];
  const isVertical = first.x === last.x;
  const bufferOffsets = isVertical
    ? [{ x: -1, y: 0 }, { x: 1, y: 0 }]
    : [{ x: 0, y: -1 }, { x: 0, y: 1 }];
  return hallTiles.every((tile) => {
    const existing = getTile(state, tile.x, tile.y);
    if (!existing || existing.type !== TILE_TYPES.WALL) {
      return false;
    }
    return bufferOffsets.every((offset) => {
      const neighbor = getTile(state, tile.x + offset.x, tile.y + offset.y);
      return !neighbor || neighbor.type === TILE_TYPES.WALL;
    });
  });
}

function addRectGraphDoor(state, room, hallTile, hallId, side, rng, overrides = {}) {
  const meta = getDoorMetaForSide(side);
  const door = addDoorEntity(
    state,
    hallTile.x,
    hallTile.y,
    room.id,
    hallId,
    rng,
    meta.orientation,
    meta.wallSide,
    meta.hallDirection,
    meta.hingeSide,
    meta.swingTarget,
    meta.turnDirection
  );
  Object.assign(door, overrides);
  return door;
}

function buildHallTilesFromDoor(parentDoorTile, side, length) {
  const direction = RECT_GRAPH_DIRECTIONS[side];
  const tiles = [];
  for (let step = 0; step < length; step += 1) {
    tiles.push({
      x: parentDoorTile.x + direction.x * step,
      y: parentDoorTile.y + direction.y * step
    });
  }
  return tiles;
}

function getBranchChance(pattern, depth) {
  const base = depth <= 2 ? 0.74 : 0.56;
  if (pattern === "chain" || pattern === "fortress") {
    return Math.max(0.3, base - 0.2);
  }
  if (pattern === "maze") {
    return Math.max(0.28, base - 0.16);
  }
  if (pattern === "web" || pattern === "hub" || pattern === "cross" || pattern === "gallery") {
    return Math.min(0.88, base + 0.18);
  }
  if (pattern === "forked") {
    return depth <= 3 ? 0.86 : 0.48;
  }
  if (pattern === "boring") {
    return 0.58;
  }
  if (pattern === "symmetricWings" || pattern === "symmetry" || pattern === "almostSymmetry") {
    return Math.min(0.82, base + 0.1);
  }
  return base;
}

function addRoomExits(queue, room, rng, blockedSide = null, depth = 0, pattern = "processional") {
  const sides = (room.rotunda === true
    ? RECT_GRAPH_SIDES
    : RECT_GRAPH_SIDES
  ).filter((side) => side !== blockedSide);
  if (depth <= 0) {
    if (sides.includes("north") && sides.includes("south") && rng.nextFloat() < 0.64) {
      queue.push({ room, side: "north", depth: depth + 1, symmetryAxis: "horizontal", architecture: pattern });
      queue.push({ room, side: "south", depth: depth + 1, symmetryAxis: "horizontal", architecture: pattern });
    }
    if (sides.includes("east")) {
      queue.push({ room, side: "east", depth: depth + 1, architecture: pattern });
    }
    return;
  }
  for (const side of sides) {
    const chance = getBranchChance(pattern, depth);
    if (rng.nextFloat() < chance) {
      queue.push({ room, side, depth: depth + 1, architecture: pattern });
    }
  }
}

function tryGrowRectGraphRoom(state, queueEntry, rng, roomIndex, hallIndex) {
  const { room, side, depth } = queueEntry;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let size = pickRectGraphRoomSize(rng, depth, queueEntry.architecture || queueEntry.pattern || "processional");
    const rotundaCount = state.rooms.filter((candidate) => candidate.rotunda === true).length;
    if (size.rotunda === true && (roomIndex < 6 || rotundaCount >= MAX_ROTUNDAS)) {
      size = { width: rng.nextInt(5, 7), height: rng.nextInt(5, 6), rotunda: false };
    }
    const pattern = queueEntry.architecture || queueEntry.pattern || "processional";
    const hallLength = pattern === "maze"
      ? rng.nextInt(4, 8)
      : pattern === "boring"
        ? 4
        : pattern === "almostBoring" && depth <= 2
          ? 3
          : rng.nextInt(3, 6);
    const parentDoorTile = getRoomAttachmentPoint(room, side, rng);
    if (!parentDoorTile) {
      continue;
    }
    const hallTiles = buildHallTilesFromDoor(parentDoorTile, side, hallLength);
    if (!areHallTilesClear(state, hallTiles)) {
      continue;
    }
    const childDoorTile = hallTiles[hallTiles.length - 1];
    const childSide = RECT_GRAPH_OPPOSITE[side];
    const rect = createAttachedRoomRect(childDoorTile, side, size, rng);
    const candidate = {
      id: `room-${roomIndex}`,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      discovered: false,
      explored: false,
      rotunda: size.rotunda === true,
      rotundaSize: size.rotunda === true ? size.rotundaSize || size.width : null,
      rotundaOpening: size.rotunda === true ? childSide : null,
      shape: size.rotunda === true ? "rect" : pickCompoundRoomShape(rng, size, depth, pattern),
      cornerSize: size.rotunda === true ? 0 : pickRoomCornerSize(rng, size.width, size.height, depth),
      graphDepth: depth
    };
    if (candidate.shape !== "rect" && !isDoorInteriorFloor(candidate, childSide, childDoorTile)) {
      candidate.shape = "rect";
    }
    fitCornerSizeToDoors(candidate, [{ side: childSide, tile: childDoorTile }]);
    if (!isRoomAreaClear(state, candidate)) {
      continue;
    }

    const hallId = `hall-${hallIndex}`;
    carveRectGraphHall(state, hallTiles, hallId);
    carveRoom(state, candidate);
    state.rooms.push(candidate);
    const parentDoor = addRectGraphDoor(state, room, parentDoorTile, hallId, side, rng);
    const doors = [parentDoor.id];
    if (hallTiles.length > 4 || candidate.rotunda === true) {
      const childDoor = addRectGraphDoor(state, candidate, childDoorTile, hallId, childSide, rng);
      doors.push(childDoor.id);
    }
    state.halls.push({
      id: hallId,
      fromRoomId: room.id,
      toRoomId: candidate.id,
      doors,
      tiles: hallTiles.map((tile) => ({ ...tile })),
      style: "rect-graph"
    });
    return { room: candidate, hallId };
  }
  return null;
}

function createEntranceStairs(state, room, rng) {
  const side = rng.pick(RECT_GRAPH_SIDES);
  const hallId = "hall-entrance";
  const centerX = Math.floor(room.x + room.width / 2);
  const centerY = Math.floor(room.y + room.height / 2);
  const stairTile = side === "east"
    ? { x: room.x + room.width, y: centerY }
    : side === "west"
      ? { x: room.x - 1, y: centerY }
      : side === "south"
        ? { x: centerX, y: room.y + room.height }
        : { x: centerX, y: room.y - 1 };
  if (!getTile(state, stairTile.x, stairTile.y)) {
    return null;
  }
  const stairs = addRectGraphDoor(state, room, stairTile, hallId, side, rng, {
    doorKind: "stairs-up",
    watabouDoorType: 3,
    doorState: DOOR_STATES.OPEN,
    highestStep: side
  });
  state.halls.push({
    id: hallId,
    fromRoomId: null,
    toRoomId: room.id,
    doors: [stairs.id],
    tiles: [stairTile],
    entrance: true,
    style: "rect-graph"
  });
  return stairs;
}

function markEndingRoom(state, rng) {
  const candidates = state.rooms.filter((room) => room.id !== state.generation.entranceRoomId);
  if (!candidates.length) {
    return null;
  }
  let best = candidates[0];
  let bestDistance = -1;
  for (const room of candidates) {
    const center = getRoomCenter(room);
    const distance = Math.abs(center.x - state.player.x) + Math.abs(center.y - state.player.y);
    if (distance > bestDistance) {
      best = room;
      bestDistance = distance;
    }
  }
  best.ending = true;
  const gateDoor = state.entities.find((entity) => entity.subtype === "door" && entity.roomId === best.id);
  if (gateDoor && rng.nextFloat() < 0.65) {
    gateDoor.doorKind = "gate";
    gateDoor.watabouDoorType = 5;
  }
  return best;
}

function addRectGraphColumns(state, rng) {
  state.decor = state.decor || {};
  state.decor.columns = [];
  const canPlaceBlockingColumn = (room, x, y) => {
    const tile = getTile(state, x, y);
    return tile?.type === TILE_TYPES.FLOOR &&
      tile.roomId === room.id &&
      x > room.x &&
      x < room.x + room.width - 1 &&
      y > room.y &&
      y < room.y + room.height - 1 &&
      !isFloorOccupied(state, x, y);
  };
  const pushCenterColumn = (room, x, y, style) => {
    if (!canPlaceBlockingColumn(room, x, y)) {
      return false;
    }
    state.decor.columns.push({ x, y, style, placement: "center", blocksMovement: true });
    return true;
  };
  const pushVertexColumn = (room, x, y, style) => {
    state.decor.columns.push({ x, y, style, placement: "vertex", blocksMovement: false });
  };

  for (const room of state.rooms) {
    if (room.id === state.generation.entranceRoomId || room.width < 5 || room.height < 5 || room.rotunda) {
      continue;
    }
    const roleChance = room.role === ROOM_ROLES.SHRINE
      ? 0.86
      : room.role === ROOM_ROLES.JUNCTION
        ? 0.44
        : room.role === ROOM_ROLES.VAULT
          ? 0.34
          : 0.18;
    if (rng.nextFloat() > roleChance) {
      continue;
    }
    const style = room.role === ROOM_ROLES.SHRINE
      ? "round"
      : rng.nextFloat() < 0.45 ? "b" : "round";
    const left = room.x + 1;
    const right = room.x + room.width - 2;
    const top = room.y + 1;
    const bottom = room.y + room.height - 2;
    if (right <= left || bottom <= top) {
      continue;
    }
    const center = getRoomCenter(room);
    pushCenterColumn(room, center.x, center.y, style);
    if (room.width >= 7 && room.height >= 7 && rng.nextFloat() < 0.44) {
      pushCenterColumn(room, left, top, style);
      pushCenterColumn(room, right, top, style);
      pushCenterColumn(room, left, bottom, style);
      pushCenterColumn(room, right, bottom, style);
    }

    const vertexStyle = style === "b" && rng.nextFloat() < 0.5 ? "round" : style;
    pushVertexColumn(room, left, top, vertexStyle);
    pushVertexColumn(room, right + 1, top, vertexStyle);
    pushVertexColumn(room, left, bottom + 1, vertexStyle);
    pushVertexColumn(room, right + 1, bottom + 1, vertexStyle);
  }
}

function addRectGraphWater(state, rng, pattern = "processional") {
  state.decor = state.decor || {};
  state.decor.water = [];
  const pickWaterKey = (family, direction = null) => {
    if (family === "center") {
      return "water-c";
    }
    const candidates = family === "flat" ? WATER_FLAT_KEYS : WATER_DIAGONAL_KEYS;
    const base = candidates[rng.nextInt(0, candidates.length - 1)];
    if (!direction) {
      return base;
    }
    return base;
  };
  const pushWater = (tile, assetKey, extra = {}) => {
    state.decor.water.push({
      x: tile.x,
      y: tile.y,
      assetKey,
      variant: extra.variant || (assetKey === "water-c" ? "center" : assetKey.includes("nw-") ? "nw" : "nn"),
      direction: extra.direction || null,
      nudgeX: extra.nudgeX ?? 0,
      nudgeY: extra.nudgeY ?? 0,
      rotationTurns: extra.rotationTurns ?? 0,
      flipX: extra.flipX ?? false,
      flipY: extra.flipY ?? false
    });
  };

  const roomCandidates = state.rooms.filter((room) => (
    room.id !== state.generation.entranceRoomId &&
    room.width >= 5 &&
    room.height >= 5 &&
    !room.rotunda
  ));
  const waterRooms = roomCandidates.filter((room) => room.role === ROOM_ROLES.WATER);
  const roomWaterChance = pattern === "waterLogged" ? 0.96 : 0.86;
  const chosenRoom = waterRooms.length
    ? rng.pick(waterRooms)
    : (roomCandidates.length && rng.nextFloat() < roomWaterChance ? rng.pick(roomCandidates) : null);

  if (chosenRoom) {
    const waterTiles = [];
    for (let y = chosenRoom.y; y < chosenRoom.y + chosenRoom.height; y += 1) {
      for (let x = chosenRoom.x; x < chosenRoom.x + chosenRoom.width; x += 1) {
        if (!isRoomFloorTile(chosenRoom, x, y)) {
          continue;
        }
        waterTiles.push({ x, y });
      }
    }
    const waterSet = new Set(waterTiles.map((tile) => `${tile.x},${tile.y}`));
    const hasWater = (x, y) => waterSet.has(`${x},${y}`);
    for (const tile of waterTiles) {
      const north = hasWater(tile.x, tile.y - 1);
      const east = hasWater(tile.x + 1, tile.y);
      const south = hasWater(tile.x, tile.y + 1);
      const west = hasWater(tile.x - 1, tile.y);
      if (!north && !west) {
        pushWater(tile, pickWaterKey("diagonal", "nw"), { variant: "nw", direction: "nw" });
      } else if (!north && !east) {
        pushWater(tile, pickWaterKey("diagonal", "ne"), { variant: "nw", direction: "ne" });
      } else if (!south && !east) {
        pushWater(tile, pickWaterKey("diagonal", "se"), { variant: "nw", direction: "se" });
      } else if (!south && !west) {
        pushWater(tile, pickWaterKey("diagonal", "sw"), { variant: "nw", direction: "sw" });
      } else if (!north) {
        pushWater(tile, pickWaterKey("flat", "n"), { variant: "nn", direction: "n" });
      } else if (!east) {
        pushWater(tile, pickWaterKey("flat", "e"), { variant: "nn", direction: "e" });
      } else if (!south) {
        pushWater(tile, pickWaterKey("flat", "s"), { variant: "nn", direction: "s" });
      } else if (!west) {
        pushWater(tile, pickWaterKey("flat", "w"), { variant: "nn", direction: "w" });
      } else {
          pushWater(tile, "water-c", { variant: "center", direction: "c" });
      }
    }
  }

  const hallCandidates = state.halls.filter((hall) => Array.isArray(hall.tiles) && hall.tiles.length >= 3 && !hall.entrance);
  if (!hallCandidates.length) {
    return;
  }
  const hallWaterChance = pattern === "waterLogged" ? 0.84 : 0.28;
  if (rng.nextFloat() > hallWaterChance) {
    return;
  }

  const hall = rng.pick(hallCandidates);
  const tiles = hall.tiles || [];
  const isHorizontal = tiles.length > 1 && tiles.every((tile) => tile.y === tiles[0].y);
  const isVertical = tiles.length > 1 && tiles.every((tile) => tile.x === tiles[0].x);
  if (!isHorizontal && !isVertical) {
    return;
  }

  const orderedTiles = [...tiles];
  if (isHorizontal) {
    orderedTiles.sort((a, b) => a.x - b.x);
  } else {
    orderedTiles.sort((a, b) => a.y - b.y);
  }

  orderedTiles.forEach((tile, index) => {
    const first = index === 0;
    const last = index === orderedTiles.length - 1;
    if (first || last) {
      pushWater(
        tile,
        pickWaterKey("diagonal", isHorizontal ? (first ? "nw" : "ne") : (first ? "nw" : "sw")),
        {
          variant: "nw",
          direction: isHorizontal ? (first ? "nw" : "ne") : (first ? "nw" : "sw")
        }
      );
      return;
    }
    const direction = isHorizontal ? "n" : "w";
    pushWater(tile, pickWaterKey("flat", direction), {
      variant: "nn",
      direction
    });
  });
}

function createRectGraphDungeon(seed, level, options = {}) {
  const state = createEmptyDungeonState(seed, level);
  state.rulesData = options.rulesData || options.contentCatalog?.rulesData || null;
  const rng = new SeededRng(seed);
  const architecturePattern = chooseArchitecturePattern(rng);
  state.generation.architecture = {
    pattern: architecturePattern,
    rolePassVersion: 1
  };
  const firstSize = { width: rng.nextInt(5, 7), height: rng.nextInt(5, 6), rotunda: false };
  const firstRoom = {
    id: "room-0",
    x: 5,
    y: clamp(Math.floor(state.map.height / 2 - firstSize.height / 2), 4, state.map.height - firstSize.height - 4),
    width: firstSize.width,
    height: firstSize.height,
    discovered: false,
    explored: false,
    role: ROOM_ROLES.ENTRANCE,
    graphDepth: 0,
    label: "1"
  };
  state.rooms.push(firstRoom);
  carveRoom(state, firstRoom);
  state.generation.entranceRoomId = firstRoom.id;
  createEntranceStairs(state, firstRoom, rng);
  state.player.x = Math.floor(firstRoom.x + firstRoom.width / 2);
  state.player.y = firstRoom.y + 1;
  state.player.roomId = firstRoom.id;

  const queue = [];
  addInitialRoomExits(queue, firstRoom, rng, architecturePattern);
  let roomIndex = 1;
  let hallIndex = 0;
  let attempts = 0;
  const maxRooms = 17;
  while (queue.length && roomIndex < maxRooms && attempts < 500) {
    attempts += 1;
    const index = rng.nextInt(0, queue.length - 1);
    const [entry] = queue.splice(index, 1);
    const result = tryGrowRectGraphRoom(state, entry, rng, roomIndex, hallIndex);
    if (!result) {
      continue;
    }
    roomIndex += 1;
    hallIndex += 1;
    addRoomExits(queue, result.room, rng, RECT_GRAPH_OPPOSITE[entry.side], entry.depth, architecturePattern);
  }

  let recoveryAttempts = 0;
  while (roomIndex < 9 && roomIndex < maxRooms && recoveryAttempts < 500) {
    recoveryAttempts += 1;
    const recoveryRooms = state.rooms.filter((room) => room.rotunda !== true);
    if (!recoveryRooms.length) {
      break;
    }
    const room = rng.pick(recoveryRooms);
    const side = rng.pick(RECT_GRAPH_SIDES);
    const result = tryGrowRectGraphRoom(
      state,
      { room, side, depth: room.graphDepth ?? 1, architecture: architecturePattern },
      rng,
      roomIndex,
      hallIndex
    );
    if (!result) {
      continue;
    }
    roomIndex += 1;
    hallIndex += 1;
  }

  for (let sweep = 0; roomIndex < 9 && roomIndex < maxRooms && sweep < 3; sweep += 1) {
    let grewDuringSweep = false;
    const recoveryRooms = state.rooms.filter((room) => room.rotunda !== true);
    for (const room of recoveryRooms) {
      for (const side of RECT_GRAPH_SIDES) {
        if (roomIndex >= 9 || roomIndex >= maxRooms) {
          break;
        }
        const result = tryGrowRectGraphRoom(
          state,
          { room, side, depth: Math.max(1, room.graphDepth ?? 1), architecture: architecturePattern },
          rng,
          roomIndex,
          hallIndex
        );
        if (!result) {
          continue;
        }
        roomIndex += 1;
        hallIndex += 1;
        grewDuringSweep = true;
      }
    }
    if (!grewDuringSweep) {
      break;
    }
  }

  markEndingRoom(state, rng);
  assignArchitecturalRoles(state, rng, architecturePattern);
  applyArchitecturalDoorDetails(state, rng);
  finalizeRoomGeometry(state);
  addRectGraphColumns(state, rng);
  addRectGraphWater(state, rng, architecturePattern);

  const reachableRooms = floodFillReachableRooms(state, firstRoom.id);
  state.generation.connectivityValid = reachableRooms.size === state.rooms.length;

  populateRoomEntities(state, rng, options.monsterTable || [], options.trapTable || [], options.contentCatalog?.loot || {});
  balanceTreasureSpawns(state, rng, options.trapTable || [], options.contentCatalog?.loot || {});
  ensureVisibleGroundTreasure(state, rng, options.contentCatalog?.loot || {});
  return state;
}

export function generateDungeon(seed = Date.now(), level = 1, options = {}) {
  return createRectGraphDungeon(seed, level, options);
}

export function generateClassicDungeon(seed = Date.now(), level = 1, options = {}) {
  const state = createEmptyDungeonState(seed, level);
  state.rulesData = options.rulesData || options.contentCatalog?.rulesData || null;
  const rng = new SeededRng(seed);
  const maxRooms = 18;

  for (let attempt = 0; attempt < 250 && state.rooms.length < maxRooms; attempt += 1) {
    const width = rng.nextInt(3, 8);
    const height = rng.nextInt(3, 8);
    const x = rng.nextInt(2, state.map.width - width - 3);
    const y = rng.nextInt(2, state.map.height - height - 3);
    const candidate = {
      id: `room-${state.rooms.length}`,
      x,
      y,
      width,
      height,
      discovered: false,
      explored: false
    };
    if (state.rooms.some((room) => intersects(room, candidate, 2))) {
      continue;
    }
    state.rooms.push(candidate);
    carveRoom(state, candidate);
  }

  if (!state.rooms.length) {
    return state;
  }

  connectRoomsWithMstAndLoops(state, state.rooms, rng);

  const entranceRoom = state.rooms[0];
  state.generation.entranceRoomId = entranceRoom.id;
  const start = getRoomCenter(entranceRoom);
  state.player.x = start.x;
  state.player.y = start.y;
  state.player.roomId = entranceRoom.id;

  const reachableRooms = floodFillReachableRooms(state, entranceRoom.id);
  state.generation.connectivityValid = reachableRooms.size === state.rooms.length;

  populateRoomEntities(state, rng, options.monsterTable || [], options.trapTable || [], options.contentCatalog?.loot || {});
  balanceTreasureSpawns(state, rng, options.trapTable || [], options.contentCatalog?.loot || {});
  ensureVisibleGroundTreasure(state, rng, options.contentCatalog?.loot || {});
  return state;
}
