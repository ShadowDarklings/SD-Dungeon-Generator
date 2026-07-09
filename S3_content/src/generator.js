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
import {
  canCrossOrganicEdge,
  clearOrganicTileMeta,
  isInvalidOrganicFreeTile,
  isOrganicMovementBlockingTile,
  parseOrganicKind,
  parseOrganicSignature,
  setOrganicTileMeta,
  transformOrganicSignature
} from "./organic-tiles.js";
import {
  clearInnerWallTileMeta,
  isInnerWallBlockingTile,
  setInnerWallTileMeta
} from "./inner-walls.js";
import {
  clearAngledWallTileMeta,
  isAngledWallMovementBlockingTile,
  setAngledWallTileMeta
} from "./angled-walls.js";

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
  "waterLogged",
  "angled",
  "organic",
  "organicHybrid",
  "innerWalls"
]);
const ARCHITECTURE_PATTERN_WEIGHTS = Object.freeze([
  ["processional", 5],
  ["cross", 4],
  ["hub", 4],
  ["symmetricWings", 3],
  ["chain", 4],
  ["web", 4],
  ["symmetry", 3],
  ["almostSymmetry", 3],
  ["fortress", 4],
  ["forked", 4],
  ["boring", 2],
  ["almostBoring", 2],
  ["maze", 4],
  ["gallery", 4],
  ["waterLogged", 3],
  ["angled", 5],
  ["organic", 5],
  ["organicHybrid", 0],
  ["innerWalls", 4]
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
const CANAL_BANK_EDGE_KEYS = Object.freeze([
  "canal-1x1-NWbNEbSEwSWwNbEwSwWw1",
  "canal-1x1-NWbNEbSEwSWwNbEwSwWw2"
]);
const CANAL_BRIDGE_BANK_KEYS = Object.freeze([
  "canal-1x1-NWbNEwSEwSWbNbEwSbWb1",
  "canal-1x1-NWbNEwSEwSWbNbEwSbWb2"
]);
const CANAL_BRIDGE_CORNER_KEYS = Object.freeze([
  "canal-1x1-NWwNEwSEwSWbNwEwSwWb1",
  "canal-1x1-NWwNEbSEwSWwNwEwSwWw1"
]);
const CANAL_CENTER_KEY = "canal-center-piece";
const CANAL_IMPASSABLE_KEYS = Object.freeze(new Set([
  "canal-1x1-NWbNEbSEbSWwNbEbSwWw1",
  "canal-1x1-NWbNEbSEwSWwNbEwSwWw1",
  "canal-1x1-NWbNEbSEwSWwNbEwSwWw2",
  "canal-1x1-NWwNEbSEwSWwNwEwSwWw1",
  CANAL_CENTER_KEY
]));
const CANAL_BRIDGE_KEY = "canal-bridge-4x4-ns";
const JUNK_ASSET_KEYS = Object.freeze([
  "junk-1x1-1",
  "junk-1x1-2",
  "junk-1x1-3",
  "junk-1x1-4",
  "junk-1x1-5",
  "junk-1x1-6",
  "junk-1x1-7",
  "junk-1x1-8",
  "junk-1x1-9",
  "junk-1x1-10",
  "junk-1x1-11",
  "junk-1x1-e",
  "junk-1x1-sw",
  "junk-1x1-w",
  "junk-2x1-2",
  "junk-2x1-E",
  "junk-2x1-ew",
  "junk-2x1-n",
  "junk-2x1-ns",
  "junk-2x1-nw",
  "junk-2x1-w",
  "junk-4x4-nesw",
  "junk-4x4-sw",
  "junk-4x4-w"
]);
const ROUND_CORNERS_ENABLED = true;
const ROUND_CORNER_MAX_SIZE = 1;
const ROTUNDA_ROOM_CHANCE = 0.28;
const MAX_ROTUNDAS = 3;
const COMPOUND_ROOM_CHANCE = 0.26;
const L_SHAPED_ROOM_CHANCE = 0.06;
const TREASURE_TARGET_ROOM_RATIO = 0.72;
const VISIBLE_TREASURE_ROOM_RATIO = 0.3;
const SECRET_DOOR_CHANCE = 0.12;
const SECRET_DOOR_MAX_PER_DUNGEON = 2;
const SECRET_TREASURE_ROOM_MAX = 3;
const SECRET_TREASURE_ROOM_MONSTER_CHANCE = 0.25;
const INNER_WALL_MIN_ROOM_WIDTH = 8;
const INNER_WALL_MIN_ROOM_HEIGHT = 8;
const INNER_WALL_PATTERN_NAMES = Object.freeze([
  "pixelSubdivision",
  "pixelMaze",
  "subdivision",
  "maze",
  "spider",
  "spiral",
  "roomWithinRoom",
  "alternatingRows"
]);
const PROHIBITED_INNER_WALL_SYMBOL_MAX_MISSING = 2;
const BOSS_TREASURE_MULTIPLIER = 10;
const ORGANIC_DOOR_CHANCE = 0.1;
const ORGANIC_MIN_ROOMS = 8;
const ORGANIC_MAX_ROOMS = 13;
const ORGANIC_TRANSFORM_STEPS = Object.freeze([
  Object.freeze({ rotationTurns: 0, flipX: false, flipY: false }),
  Object.freeze({ rotationTurns: 1, flipX: false, flipY: false }),
  Object.freeze({ rotationTurns: 2, flipX: false, flipY: false }),
  Object.freeze({ rotationTurns: 3, flipX: false, flipY: false }),
  Object.freeze({ rotationTurns: 0, flipX: true, flipY: false }),
  Object.freeze({ rotationTurns: 1, flipX: true, flipY: false }),
  Object.freeze({ rotationTurns: 2, flipX: true, flipY: false }),
  Object.freeze({ rotationTurns: 3, flipX: true, flipY: false }),
  Object.freeze({ rotationTurns: 0, flipX: false, flipY: true }),
  Object.freeze({ rotationTurns: 1, flipX: false, flipY: true }),
  Object.freeze({ rotationTurns: 2, flipX: false, flipY: true }),
  Object.freeze({ rotationTurns: 3, flipX: false, flipY: true }),
  Object.freeze({ rotationTurns: 0, flipX: true, flipY: true }),
  Object.freeze({ rotationTurns: 1, flipX: true, flipY: true }),
  Object.freeze({ rotationTurns: 2, flipX: true, flipY: true }),
  Object.freeze({ rotationTurns: 3, flipX: true, flipY: true })
]);
const ANGLED_CORNER_ASSETS = Object.freeze({
  ne: Object.freeze([
    "1x1-wall-angle-ne-1.png",
    "1x1-wall-angle-ne-2.png",
    "1x1-wall-angle-ne-3.png",
    "1x1-wall-angle-ne-4.png",
    "1x1-wall-angle-ne-pillar1.png",
    "1x1-wall-angle-ne-pillar2.png",
    "1x1-wall-angle-ne-pillar3.png"
  ]),
  sw: Object.freeze([
    "1x1-wall-angle-sw-1.png",
    "1x1-wall-angle-sw-2.png",
    "1x1-wall-angle-sw-pillar1.png",
    "1x1-wall-angle-sw-pillar2.png",
    "1x1-wall-angle-sw-pillar3.png"
  ])
});

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

function clearTileDecorMeta(tile) {
  if (!tile) {
    return;
  }
  clearOrganicTileMeta(tile);
  clearInnerWallTileMeta(tile);
  clearAngledWallTileMeta(tile);
  if (tile.meta) {
    delete tile.meta.neverExplore;
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

function isWalkableForValidation(state, tile) {
  return tile?.type === TILE_TYPES.FLOOR &&
    !isOrganicMovementBlockingTile(tile) &&
    !isInnerWallBlockingTile(tile) &&
    !isAngledWallMovementBlockingTile(tile) &&
    !isBlockingDecorAt(state, tile.x, tile.y);
}

function validateTileConnectivity(state) {
  const start = getTile(state, state.player.x, state.player.y);
  if (!isWalkableForValidation(state, start)) {
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
      if (isWalkableForValidation(state, neighbor) && !visited.has(`${neighbor.x},${neighbor.y}`)) {
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
  if (columns.some((column) => (
    column?.blocksMovement === true &&
    String(column.placement || "center") === "center" &&
    Number(column.x) === x &&
    Number(column.y) === y
  ))) {
    return true;
  }
  const blockers = [
    ...(Array.isArray(state.decor?.canals) ? state.decor.canals : []),
    ...(Array.isArray(state.decor?.wells) ? state.decor.wells : [])
  ];
  return blockers.some((placement) => decorPlacementBlocksTile(placement, x, y));
}

function decorPlacementBlocksTile(placement, x, y) {
  if (!placement?.blocksMovement) {
    return false;
  }
  if (Array.isArray(placement.blocks)) {
    return placement.blocks.some((block) => Number(block?.x) === x && Number(block?.y) === y);
  }
  const left = Number(placement.x);
  const top = Number(placement.y);
  const width = Math.max(1, Math.round(Number(placement.widthTiles) || 1));
  const height = Math.max(1, Math.round(Number(placement.heightTiles) || 1));
  return x >= left && y >= top && x < left + width && y < top + height;
}

function decorPlacementCoversTile(placement, x, y) {
  if (!placement) {
    return false;
  }
  const left = Number(placement.x);
  const top = Number(placement.y);
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return false;
  }
  const width = Math.max(1, Math.round(Number(placement.widthTiles) || 1));
  const height = Math.max(1, Math.round(Number(placement.heightTiles) || 1));
  return x >= left && y >= top && x < left + width && y < top + height;
}

function isVisualDecorAt(state, x, y) {
  const decor = state.decor || {};
  const placements = [
    ...(Array.isArray(decor.columns) ? decor.columns : []),
    ...(Array.isArray(decor.water) ? decor.water : []),
    ...(Array.isArray(decor.canals) ? decor.canals : []),
    ...(Array.isArray(decor.junk) ? decor.junk : []),
    ...(Array.isArray(decor.wells) ? decor.wells : [])
  ];
  return placements.some((placement) => decorPlacementCoversTile(placement, x, y));
}

function decorFootprintTiles(placement) {
  const tiles = [];
  const left = Number(placement.x);
  const top = Number(placement.y);
  const width = Math.max(1, Math.round(Number(placement.widthTiles) || 1));
  const height = Math.max(1, Math.round(Number(placement.heightTiles) || 1));
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      tiles.push({ x, y });
    }
  }
  return tiles;
}

function ensureDecorCollections(state) {
  state.decor = state.decor || {};
  state.decor.columns = Array.isArray(state.decor.columns) ? state.decor.columns : [];
  state.decor.water = Array.isArray(state.decor.water) ? state.decor.water : [];
  state.decor.canals = Array.isArray(state.decor.canals) ? state.decor.canals : [];
  state.decor.junk = Array.isArray(state.decor.junk) ? state.decor.junk : [];
  state.decor.wells = Array.isArray(state.decor.wells) ? state.decor.wells : [];
}

function isFloorOccupied(state, x, y) {
  return isVisualDecorAt(state, x, y) ||
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
        !isOrganicMovementBlockingTile(tile) &&
        !isInnerWallBlockingTile(tile) &&
        !isAngledWallMovementBlockingTile(tile) &&
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
        !isOrganicMovementBlockingTile(tile) &&
        !isInnerWallBlockingTile(tile) &&
        !isAngledWallMovementBlockingTile(tile) &&
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
    coinBreakdown: loot.coinBreakdown ? JSON.parse(JSON.stringify(loot.coinBreakdown)) : null,
    gearItem: loot.gearItem ? JSON.parse(JSON.stringify(loot.gearItem)) : null,
    revealed: false,
    collected: false,
    ...extra
  };
  state.entities.push(entity);
  return entity;
}

function trySpawnRoomTreasure(state, rng, room, trapTable, lootCatalog = {}, spawnChance = TREASURE_SPAWN_CHANCE, options = {}) {
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
    coinBreakdown: loot.coinBreakdown ? JSON.parse(JSON.stringify(loot.coinBreakdown)) : null,
    gearItem: loot.gearItem ? JSON.parse(JSON.stringify(loot.gearItem)) : null,
    revealed: false,
    collected: false
  });
  if (treasure && options.valueMultiplier) {
    setTreasureValueGp(treasure, Math.max(0, Number(treasure.value || 0) || 0) * Number(options.valueMultiplier));
  }
  const trapChance = Math.max(0, Math.min(1, Number(options.trapChance ?? 0.25) || 0));
  if (treasure && rng.nextFloat() < trapChance) {
    spawnTrap(state, rng, room, trapTable, "treasure", treasureId);
  }
  return treasure;
}

function chooseArchitecturePattern(rng) {
  const totalWeight = ARCHITECTURE_PATTERN_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  const mixed = (rng.next() ^ (rng.next() >>> 7) ^ (rng.next() >>> 15)) >>> 0;
  let roll = (mixed % totalWeight) + 1;
  for (const [pattern, weight] of ARCHITECTURE_PATTERN_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) {
      return pattern;
    }
  }
  return ARCHITECTURE_PATTERNS[0] || "processional";
}

function getTreasureValueTotal(state, predicate = () => true) {
  return (state.entities || [])
    .filter((entity) => entity.type === ENTITY_TYPES.TREASURE && !entity.collected && predicate(entity))
    .reduce((total, entity) => total + Math.max(0, Number(entity.value || 0) || 0), 0);
}

function getTreasureTargetValueGp(state) {
  return Math.max(1, Number(state.level || 1) || 1) * 4000;
}

function getCoinEntityKey(entity) {
  const breakdown = entity?.coinBreakdown || {};
  if (Number(breakdown.gold || 0) > 0) {
    return "gold";
  }
  if (Number(breakdown.silver || 0) > 0) {
    return "silver";
  }
  return "copper";
}

function setTreasureValueGp(entity, valueGp) {
  const value = Math.max(0, Math.round((Number(valueGp) || 0) * 100) / 100);
  entity.value = value;
  if (entity.kind === "coin-cache" || entity.coinBreakdown) {
    const key = getCoinEntityKey(entity);
    const totalCopper = Math.max(0, Math.round(value * 100));
    entity.coinBreakdown = { gold: 0, silver: 0, copper: 0 };
    if (key === "gold") {
      entity.coinBreakdown.gold = Math.max(1, Math.round(totalCopper / 100));
    } else if (key === "silver") {
      entity.coinBreakdown.silver = Math.max(1, Math.round(totalCopper / 10));
    } else {
      entity.coinBreakdown.copper = Math.max(1, totalCopper);
    }
    const physicalCoins = entity.coinBreakdown.gold + entity.coinBreakdown.silver + entity.coinBreakdown.copper;
    entity.value = (entity.coinBreakdown.gold * 100 + entity.coinBreakdown.silver * 10 + entity.coinBreakdown.copper) / 100;
    entity.slots = Math.max(0, Math.ceil(Math.max(0, physicalCoins - 100) / 100));
  }
}

function pickBossTreasureShare(rng) {
  const roll = rng.nextFloat();
  if (roll < 0.02) {
    return 0.9 + rng.nextFloat() * 0.08;
  }
  if (roll < 0.04) {
    return 0.12 + rng.nextFloat() * 0.13;
  }
  const centered = (rng.nextFloat() + rng.nextFloat() + rng.nextFloat()) / 3;
  return 0.35 + centered * 0.3;
}

function scaleTreasureGroup(treasures, targetValue) {
  const currentValue = treasures.reduce((total, treasure) => total + Math.max(0, Number(treasure.value || 0) || 0), 0);
  if (!treasures.length || currentValue <= 0 || targetValue <= 0) {
    return;
  }
  const scale = targetValue / currentValue;
  let assigned = 0;
  for (let index = 0; index < treasures.length; index += 1) {
    const treasure = treasures[index];
    if (index === treasures.length - 1) {
      setTreasureValueGp(treasure, Math.max(0.01, targetValue - assigned));
      continue;
    }
    const nextValue = Math.max(0.01, Number(treasure.value || 0) * scale);
    setTreasureValueGp(treasure, nextValue);
    assigned += Number(treasure.value || 0) || 0;
  }
}

function balanceBossTreasureShare(state, rng, targetValue) {
  const treasures = (state.entities || []).filter((entity) => entity.type === ENTITY_TYPES.TREASURE && !entity.collected);
  const bossTreasures = treasures.filter((entity) => entity.bossTreasure === true || entity.bossRoom === true);
  if (!bossTreasures.length) {
    return;
  }
  const scatteredTreasures = treasures.filter((entity) => !bossTreasures.includes(entity));
  const bossShare = Number.isFinite(Number(state.generation.bossTreasureShare))
    ? Number(state.generation.bossTreasureShare)
    : pickBossTreasureShare(rng);
  state.generation.bossTreasureShare = bossShare;
  const bossTarget = targetValue * bossShare;
  scaleTreasureGroup(bossTreasures, bossTarget);
  if (scatteredTreasures.length) {
    scaleTreasureGroup(scatteredTreasures, Math.max(1, targetValue - bossTarget));
  }
}

function organicSidesKey(sides) {
  return `N${sides.north || "x"}E${sides.east || "x"}S${sides.south || "x"}W${sides.west || "x"}`;
}

function organicSidesFromSignature(signatureData) {
  return {
    north: signatureData?.sides?.north || "x",
    east: signatureData?.sides?.east || "x",
    south: signatureData?.sides?.south || "x",
    west: signatureData?.sides?.west || "x"
  };
}

function organicCornersFromSignature(signatureData) {
  return {
    nw: signatureData?.corners?.nw || "x",
    ne: signatureData?.corners?.ne || "x",
    se: signatureData?.corners?.se || "x",
    sw: signatureData?.corners?.sw || "x"
  };
}

function organicCornersMatch(candidate = {}, target = null) {
  if (!target) {
    return true;
  }
  return ["nw", "ne", "se", "sw"].every((corner) => !target[corner] || (candidate[corner] || "x") === target[corner]);
}

function isAllOrganicSides(sides, value) {
  return sides.north === value && sides.east === value && sides.south === value && sides.west === value;
}

function addOrganicCatalogEntry(map, sideKey, entry) {
  const existing = map.get(sideKey) || [];
  const identity = `${entry.asset}:${entry.rotationTurns}:${entry.flipX}:${entry.flipY}`;
  if (!existing.some((candidate) => candidate.identity === identity)) {
    existing.push({ ...entry, identity });
  }
  map.set(sideKey, existing);
}

function buildOrganicAssetCatalog(assetNames = []) {
  const catalog = {
    freeBySides: new Map(),
    blocksBySides: new Map(),
    available: false
  };
  for (const asset of assetNames || []) {
    const assetName = String(asset || "").trim();
    const kind = parseOrganicKind(assetName);
    const signature = parseOrganicSignature(assetName);
    if (!assetName || !kind || !signature) {
      continue;
    }
    for (const transform of ORGANIC_TRANSFORM_STEPS) {
      const transformed = transformOrganicSignature(signature, transform.rotationTurns, transform.flipX, transform.flipY);
      const sides = organicSidesFromSignature(transformed);
      if (kind === "free" && isAllOrganicSides(sides, "o")) {
        continue;
      }
      const sideKey = organicSidesKey(sides);
      const target = kind === "blocks" ? catalog.blocksBySides : catalog.freeBySides;
      addOrganicCatalogEntry(target, sideKey, {
        asset: assetName,
        sides,
        corners: organicCornersFromSignature(transformed),
        rotationTurns: transform.rotationTurns,
        flipX: transform.flipX,
        flipY: transform.flipY
      });
    }
  }
  catalog.available = catalog.freeBySides.size > 0 && catalog.blocksBySides.size > 0;
  return catalog;
}

function isOrganicDrawableTile(tile) {
  return tile?.type === TILE_TYPES.FLOOR;
}

function getOrganicCornerNeighborDeltas(corner) {
  if (corner === "nw") {
    return [{ dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }];
  }
  if (corner === "ne") {
    return [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: -1 }];
  }
  if (corner === "se") {
    return [{ dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }];
  }
  return [{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: 1 }];
}

function getOrganicCornerRequirement(state, tile, corner, options = {}) {
  const [firstSide, secondSide, diagonal] = getOrganicCornerNeighborDeltas(corner).map(({ dx, dy }) => (
    isOrganicDrawableTile(getTile(state, tile.x + dx, tile.y + dy))
  ));
  if (!firstSide && !secondSide && !diagonal) {
    return "o";
  }
  if (options.closeDiagonalCorners === true && !diagonal && firstSide && secondSide) {
    return "o";
  }
  return null;
}

function organicPlacementFitsCorners(placement, options = {}) {
  if (!options.state || !options.tile) {
    return true;
  }
  for (const corner of ["nw", "ne", "se", "sw"]) {
    const required = getOrganicCornerRequirement(options.state, options.tile, corner, options);
    if (required && (placement.corners?.[corner] || "x") !== required) {
      return false;
    }
    if ((placement.corners?.[corner] || "x") !== "x") {
      continue;
    }
    const touchesOrganicNeighbor = getOrganicCornerNeighborDeltas(corner).some(({ dx, dy }) => (
      isOrganicDrawableTile(getTile(options.state, options.tile.x + dx, options.tile.y + dy))
    ));
    if (!touchesOrganicNeighbor) {
      return false;
    }
  }
  return true;
}

function pickOrganicPlacement(catalog, kind, sides, rng, options = {}) {
  const sideKey = organicSidesKey(sides);
  const source = kind === "blocks" ? catalog.blocksBySides : catalog.freeBySides;
  const candidates = source.get(sideKey) || [];
  if (!candidates.length) {
    return null;
  }
  if (options.corners) {
    const cornerMatches = candidates.filter((candidate) => organicCornersMatch(candidate.corners, options.corners));
    if (cornerMatches.length) {
      return rng.pick(cornerMatches);
    }
  }
  if (!options.state || !options.tile) {
    return rng.pick(candidates);
  }
  const exact = candidates.filter((candidate) => organicPlacementFitsCorners(candidate, options));
  if (exact.length) {
    return rng.pick(exact);
  }
  if (options.closeDiagonalCorners === true) {
    const looser = candidates.filter((candidate) => organicPlacementFitsCorners(candidate, {
      ...options,
      closeDiagonalCorners: false
    }));
    if (looser.length) {
      return rng.pick(looser);
    }
  }
  return null;
}

function getOrganicNeighborDelta(side) {
  if (side === "north") return { dx: 0, dy: -1 };
  if (side === "east") return { dx: 1, dy: 0 };
  if (side === "south") return { dx: 0, dy: 1 };
  return { dx: -1, dy: 0 };
}

function getOrganicRoomTileSides(state, tile) {
  const sides = {};
  for (const side of RECT_GRAPH_SIDES) {
    const { dx, dy } = getOrganicNeighborDelta(side);
    const neighbor = getTile(state, tile.x + dx, tile.y + dy);
    sides[side] = neighbor?.type === TILE_TYPES.FLOOR && !isOrganicMovementBlockingTile(neighbor) ? "x" : "o";
  }
  return sides;
}

function isOrganicShellTile(tile) {
  return tile?.meta?.organicShell === true;
}

function getOrganicCaveFreeTileSides(state, tile) {
  const sides = {};
  for (const side of RECT_GRAPH_SIDES) {
    const { dx, dy } = getOrganicNeighborDelta(side);
    const neighbor = getTile(state, tile.x + dx, tile.y + dy);
    sides[side] = (
      neighbor?.type === TILE_TYPES.FLOOR &&
      (!isOrganicMovementBlockingTile(neighbor) || isOrganicShellTile(neighbor))
    ) ? "x" : "o";
  }
  return sides;
}

function organicTileTouchesDiagonalBoundary(state, tile) {
  for (const corner of ["nw", "ne", "se", "sw"]) {
    const [firstSide, secondSide, diagonal] = getOrganicCornerNeighborDeltas(corner).map(({ dx, dy }) => (
      isOrganicDrawableTile(getTile(state, tile.x + dx, tile.y + dy))
    ));
    if (!diagonal && (firstSide || secondSide)) {
      return true;
    }
  }
  return false;
}

function organicTileNeedsEdgeArt(state, tile, sides) {
  return !isAllOrganicSides(sides, "x") || organicTileTouchesDiagonalBoundary(state, tile);
}

function rememberOrganicTileChange(changes, tile) {
  if (!tile || changes.has(tile)) {
    return;
  }
  const organic = tile.meta?.organic ? JSON.parse(JSON.stringify(tile.meta.organic)) : null;
  changes.set(tile, organic);
}

function restoreOrganicTileChanges(changes) {
  for (const [tile, organic] of changes.entries()) {
    if (!tile.meta || typeof tile.meta !== "object") {
      tile.meta = {};
    }
    if (organic) {
      tile.meta.organic = organic;
    } else {
      clearOrganicTileMeta(tile);
    }
  }
}

function getRoomDoorInteriorKeys(state, room) {
  const keys = new Set();
  for (const door of state.entities || []) {
    if (door?.subtype !== "door" || door.roomId !== room.id || !door.wallSide) {
      continue;
    }
    const interior = getDoorInteriorTile(room, door.wallSide, door);
    keys.add(`${interior.x},${interior.y}`);
    for (const side of RECT_GRAPH_SIDES) {
      const { dx, dy } = getOrganicNeighborDelta(side);
      keys.add(`${interior.x + dx},${interior.y + dy}`);
    }
  }
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      const tile = getTile(state, x, y);
      if (tile?.type !== TILE_TYPES.FLOOR || tile.roomId !== room.id) {
        continue;
      }
      for (const side of RECT_GRAPH_SIDES) {
        const { dx, dy } = getOrganicNeighborDelta(side);
        const neighbor = getTile(state, x + dx, y + dy);
        if (neighbor?.type === TILE_TYPES.FLOOR && neighbor.hallId && neighbor.roomId !== room.id) {
          keys.add(`${x},${y}`);
          keys.add(`${neighbor.x},${neighbor.y}`);
          for (const adjacentSide of RECT_GRAPH_SIDES) {
            const adjacent = getOrganicNeighborDelta(adjacentSide);
            keys.add(`${x + adjacent.dx},${y + adjacent.dy}`);
          }
        }
      }
    }
  }
  if (state.player?.roomId === room.id) {
    keys.add(`${state.player.x},${state.player.y}`);
  }
  for (const character of state.characters || []) {
    if (character?.roomId === room.id) {
      keys.add(`${character.x},${character.y}`);
    }
  }
  return keys;
}

function getRoomOrganicFloorTiles(state, room) {
  const tiles = [];
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      const tile = getTile(state, x, y);
      if (tile?.type === TILE_TYPES.FLOOR && tile.roomId === room.id) {
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

function applyOrganicFreeEdges(state, room, catalog, rng, changes, protectedKeys = new Set()) {
  for (const tile of getRoomOrganicFloorTiles(state, room)) {
    if (protectedKeys.has(`${tile.x},${tile.y}`) || isOrganicMovementBlockingTile(tile)) {
      continue;
    }
    const sides = getOrganicRoomTileSides(state, tile);
    if (!organicTileNeedsEdgeArt(state, tile, sides) || isAllOrganicSides(sides, "o")) {
      continue;
    }
    const placement = pickOrganicPlacement(catalog, "free", sides, rng, {
      state,
      tile,
      closeDiagonalCorners: true
    });
    if (!placement) {
      continue;
    }
    rememberOrganicTileChange(changes, tile);
    setOrganicTileMeta(tile, placement.asset, placement);
  }
}

function applyOrganicFreeTile(state, tile, catalog, rng, changes, protectedKeys = new Set()) {
  if (!tile || tile.type !== TILE_TYPES.FLOOR || protectedKeys.has(`${tile.x},${tile.y}`) || isOrganicMovementBlockingTile(tile)) {
    return false;
  }
  const sides = getOrganicRoomTileSides(state, tile);
  if (!organicTileNeedsEdgeArt(state, tile, sides) || isAllOrganicSides(sides, "o")) {
    return false;
  }
  const placement = pickOrganicPlacement(catalog, "free", sides, rng, {
    state,
    tile,
    closeDiagonalCorners: true
  });
  if (!placement) {
    return false;
  }
  rememberOrganicTileChange(changes, tile);
  setOrganicTileMeta(tile, placement.asset, placement);
  return true;
}

function getDoorTileKeys(state) {
  const keys = new Set();
  for (const door of state.entities || []) {
    if (door?.subtype !== "door") {
      continue;
    }
    keys.add(`${door.x},${door.y}`);
    for (const side of RECT_GRAPH_SIDES) {
      const direction = RECT_GRAPH_DIRECTIONS[side];
      keys.add(`${door.x + direction.x},${door.y + direction.y}`);
    }
  }
  return keys;
}

function addOrganicHallBulges(state, hall, rng, protectedKeys, pattern) {
  const tiles = Array.isArray(hall.tiles) ? hall.tiles : [];
  if (tiles.length < 4) {
    return;
  }
  const chance = pattern === "organic" ? 0.34 : 0.18;
  const pathKeys = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
  const additions = [];
  for (let index = 1; index < tiles.length - 1; index += 1) {
    if (rng.nextFloat() > chance) {
      continue;
    }
    const direction = getHallTileDirection(tiles, index);
    if (!direction) {
      continue;
    }
    const side = rng.pick(getPerpendicularSides(direction));
    const delta = RECT_GRAPH_DIRECTIONS[side];
    const candidate = {
      x: tiles[index].x + delta.x,
      y: tiles[index].y + delta.y
    };
    const key = `${candidate.x},${candidate.y}`;
    if (protectedKeys.has(key) || !canCarveHallBranchTile(state, candidate.x, candidate.y, pathKeys)) {
      continue;
    }
    pathKeys.add(key);
    additions.push(candidate);
  }
  for (const tile of additions) {
    carveHallTile(state, tile.x, tile.y, hall.id);
    hall.tiles.push({ ...tile, organicBulge: true });
  }
}

function applyOrganicHallTheme(state, rng, catalog, pattern) {
  if (pattern !== "organic" && pattern !== "organicHybrid") {
    return;
  }
  const protectedKeys = getDoorTileKeys(state);
  for (const hall of state.halls || []) {
    if (hall.entrance || !Array.isArray(hall.tiles)) {
      continue;
    }
    addOrganicHallBulges(state, hall, rng, protectedKeys, pattern);
    const changes = new Map();
    for (const point of hall.tiles) {
      const tile = getTile(state, point.x, point.y);
      applyOrganicFreeTile(state, tile, catalog, rng, changes, protectedKeys);
    }
    if (changes.size) {
      hall.theme = hall.theme ? `${hall.theme}+organic` : "organic";
    }
  }
}

function collectOrganicBlockCandidates(state, room, protectedKeys) {
  const candidates = [];
  for (const tile of getRoomOrganicFloorTiles(state, room)) {
    const key = `${tile.x},${tile.y}`;
    if (protectedKeys.has(key) || isOrganicMovementBlockingTile(tile) || isInnerWallBlockingTile(tile)) {
      continue;
    }
    const sides = getOrganicRoomTileSides(state, tile);
    const closedCount = RECT_GRAPH_SIDES.filter((side) => sides[side] === "o").length;
    const openCount = RECT_GRAPH_SIDES.length - closedCount;
    if (closedCount <= 0 || openCount <= 0 || openCount >= 4) {
      continue;
    }
    const edgeScore =
      (tile.x === room.x || tile.x === room.x + room.width - 1 ? 1 : 0) +
      (tile.y === room.y || tile.y === room.y + room.height - 1 ? 1 : 0);
    candidates.push({ tile, sides, edgeScore, closedCount });
  }
  candidates.sort((a, b) => (
    (b.edgeScore - a.edgeScore) ||
    (b.closedCount - a.closedCount) ||
    (a.tile.y - b.tile.y) ||
    (a.tile.x - b.tile.x)
  ));
  return candidates;
}

function roomOrganicConnectivityValid(state, room) {
  const passable = getRoomOrganicFloorTiles(state, room)
    .filter((tile) => !isOrganicMovementBlockingTile(tile));
  if (passable.length <= 1) {
    return true;
  }
  const byKey = new Map(passable.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const start = passable.find((tile) => !isInvalidOrganicFreeTile(tile)) || passable[0];
  const queue = [start];
  const visited = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const current = queue.shift();
    for (const side of RECT_GRAPH_SIDES) {
      const { dx, dy } = getOrganicNeighborDelta(side);
      const neighbor = byKey.get(`${current.x + dx},${current.y + dy}`);
      if (!neighbor || visited.has(`${neighbor.x},${neighbor.y}`)) {
        continue;
      }
      if (!canCrossOrganicEdge(current, neighbor, dx, dy)) {
        continue;
      }
      visited.add(`${neighbor.x},${neighbor.y}`);
      queue.push(neighbor);
    }
  }
  return visited.size === passable.length;
}

function getOrganicRoomChance(pattern) {
  if (pattern === "organic") return 1;
  if (pattern === "organicHybrid") return 0.64;
  return 0;
}

function applyOrganicRoomTheme(state, room, catalog, rng, pattern) {
  const changes = new Map();
  const protectedKeys = getRoomDoorInteriorKeys(state, room);
  const area = Math.max(1, room.width * room.height);
  room.cornerSize = 0;
  const maxBlocks = Math.min(
    pattern === "organic" ? 14 : 7,
    Math.max(2, Math.floor(area / (pattern === "organic" ? 5 : 8)))
  );
  let placedBlocks = 0;
  let attempts = 0;

  while (placedBlocks < maxBlocks && attempts < maxBlocks * 8) {
    attempts += 1;
    const blockCandidates = collectOrganicBlockCandidates(state, room, protectedKeys);
    if (!blockCandidates.length) {
      break;
    }
    const shortlistSize = Math.max(1, Math.min(blockCandidates.length, pattern === "organic" ? 12 : 7));
    const candidate = rng.pick(blockCandidates.slice(0, shortlistSize));
    if (!candidate || rng.nextFloat() > (pattern === "organic" ? 0.88 : 0.58)) {
      continue;
    }
    const placement = pickOrganicPlacement(catalog, "blocks", candidate.sides, rng, {
      state,
      tile: candidate.tile,
      closeDiagonalCorners: true
    });
    if (!placement) {
      continue;
    }
    rememberOrganicTileChange(changes, candidate.tile);
    setOrganicTileMeta(candidate.tile, placement.asset, placement);
    if (!roomOrganicConnectivityValid(state, room)) {
      restoreOrganicTileChanges(new Map([[candidate.tile, changes.get(candidate.tile)]]));
      continue;
    }
    placedBlocks += 1;
  }

  applyOrganicFreeEdges(state, room, catalog, rng, changes, protectedKeys);
  if (!roomOrganicConnectivityValid(state, room)) {
    restoreOrganicTileChanges(changes);
    const edgeOnlyChanges = new Map();
    applyOrganicFreeEdges(state, room, catalog, rng, edgeOnlyChanges, protectedKeys);
    if (edgeOnlyChanges.size) {
      room.theme = room.theme ? `${room.theme}+organic` : "organic";
    }
  } else if (changes.size) {
    room.theme = room.theme ? `${room.theme}+organic` : "organic";
  }
}

function applyOrganicDungeonTheme(state, rng, organicAssets = [], pattern = "processional") {
  const catalog = buildOrganicAssetCatalog(organicAssets);
  if (!catalog.available) {
    return;
  }
  const chance = getOrganicRoomChance(pattern);
  const candidates = state.rooms.filter((room) => (
    room.rotunda !== true &&
    room.width >= (pattern === "organic" ? 4 : 5) &&
    room.height >= (pattern === "organic" ? 4 : 5)
  ));
  if (!candidates.length) {
    return;
  }
  let applied = 0;
  for (const room of candidates) {
    if (rng.nextFloat() <= chance) {
      applyOrganicRoomTheme(state, room, catalog, rng, pattern);
      applied += 1;
    }
  }
  if (applied === 0 && (pattern === "organic" || pattern === "organicHybrid")) {
    applyOrganicRoomTheme(state, rng.pick(candidates), catalog, rng, pattern);
  }
  applyOrganicHallTheme(state, rng, catalog, pattern);
}

function getAngledRoomChance(pattern) {
  if (pattern === "angled") return 1;
  if (pattern === "organic" || pattern === "organicHybrid") return 0;
  if (pattern === "fortress" || pattern === "gallery") return 0.38;
  if (pattern === "symmetry" || pattern === "almostSymmetry") return 0.32;
  return 0.22;
}

function getAngledFourCornerChance(state, pattern) {
  return pattern === "angled" ? 0.75 : 0.75;
}

function pickAngledCornerPlacement(corner, rng) {
  const source = corner === "nw" || corner === "ne" ? "ne" : "sw";
  const assets = ANGLED_CORNER_ASSETS[source] || [];
  if (!assets.length) {
    return null;
  }
  return {
    asset: rng.pick(assets),
    flipX: corner === "nw" || corner === "se",
    flipY: false
  };
}

function getAngledRoomMaxRun(room) {
  return Math.max(1, Math.min(
    3,
    Math.floor((Math.min(Number(room.width) || 0, Number(room.height) || 0) - 1) / 2)
  ));
}

function getAngledCornerOrigin(room, corner, runLength) {
  if (corner === "ne") return { x: room.x + room.width - runLength, y: room.y };
  if (corner === "se") return { x: room.x + room.width - runLength, y: room.y + room.height - runLength };
  if (corner === "sw") return { x: room.x, y: room.y + room.height - runLength };
  return { x: room.x, y: room.y };
}

function isAngledBoundaryLocalCell(corner, lx, ly, runLength) {
  if (corner === "ne" || corner === "sw") {
    return lx === ly;
  }
  return lx + ly === runLength - 1;
}

function isAngledBlockedLocalCell(corner, lx, ly, runLength) {
  if (corner === "nw") return lx + ly < runLength - 1;
  if (corner === "ne") return lx > ly;
  if (corner === "se") return lx + ly > runLength - 1;
  return ly > lx;
}

function collectAngledCornerCells(room, corner, runLength) {
  const origin = getAngledCornerOrigin(room, corner, runLength);
  const cells = [];
  for (let ly = 0; ly < runLength; ly += 1) {
    for (let lx = 0; lx < runLength; lx += 1) {
      if (isAngledBoundaryLocalCell(corner, lx, ly, runLength)) {
        cells.push({ x: origin.x + lx, y: origin.y + ly, role: "angle", corner });
      } else if (isAngledBlockedLocalCell(corner, lx, ly, runLength)) {
        cells.push({ x: origin.x + lx, y: origin.y + ly, role: "block", corner });
      }
    }
  }
  return cells;
}

function canApplyAngledCornerCells(state, room, cells, protectedKeys) {
  return cells.every((cell) => {
    const key = coordKey(cell.x, cell.y);
    if (protectedKeys.has(key)) {
      return false;
    }
    const tile = getTile(state, cell.x, cell.y);
    return tile?.type === TILE_TYPES.FLOOR && tile.roomId === room.id;
  });
}

function setAngledBlockingCell(state, cell) {
  const tile = getTile(state, cell.x, cell.y);
  if (!tile) {
    return;
  }
  clearTileDecorMeta(tile);
  tile.type = TILE_TYPES.WALL;
  tile.roomId = null;
  tile.hallId = null;
  setAngledWallTileMeta(tile, "1-black.png", {
    kind: "block",
    corner: cell.corner,
    blocksMovement: true,
    blocksLight: true
  });
  tile.meta.neverExplore = true;
}

function getAngledRunLengthOptions(room, rng) {
  const maxRun = getAngledRoomMaxRun(room);
  const first = rng.nextInt(1, maxRun);
  return [first, ...Array.from({ length: maxRun }, (_, index) => index + 1).filter((value) => value !== first)];
}

function applyAngledCornerRoomTheme(state, room, rng, corners) {
  const protectedKeys = getRoomDoorInteriorKeys(state, room);
  let runLength = 1;
  let allCells = [];
  for (const candidateRunLength of getAngledRunLengthOptions(room, rng)) {
    const candidateCells = [];
    const seen = new Set();
    let duplicate = false;
    for (const corner of corners) {
      for (const cell of collectAngledCornerCells(room, corner, candidateRunLength)) {
        const key = coordKey(cell.x, cell.y);
        if (seen.has(key)) {
          duplicate = true;
          break;
        }
        seen.add(key);
        candidateCells.push(cell);
      }
      if (duplicate) {
        break;
      }
    }
    if (!duplicate && canApplyAngledCornerCells(state, room, candidateCells, protectedKeys)) {
      runLength = candidateRunLength;
      allCells = candidateCells;
      break;
    }
  }
  if (!allCells.length) {
    return false;
  }

  let placed = 0;
  room.cornerSize = 0;
  const placements = new Map(corners.map((corner) => [corner, pickAngledCornerPlacement(corner, rng)]));
  for (const cell of allCells) {
    if (cell.role === "block") {
      setAngledBlockingCell(state, cell);
      placed += 1;
      continue;
    }
    const tile = getTile(state, cell.x, cell.y);
    const placement = placements.get(cell.corner);
    if (!placement) {
      continue;
    }
    clearTileDecorMeta(tile);
    setAngledWallTileMeta(tile, placement.asset, {
      kind: "corner",
      corner: cell.corner,
      runLength,
      rotationTurns: 0,
      flipX: placement.flipX,
      flipY: placement.flipY,
      blocksMovement: false,
      blocksLight: false
    });
    placed += 1;
  }
  if (placed > 0) {
    room.theme = room.theme ? `${room.theme}+angled` : "angled";
  }
  return placed > 0;
}

function applyAngledCornerDungeonTheme(state, rng, pattern = "processional") {
  const chance = getAngledRoomChance(pattern);
  if (chance <= 0) {
    return;
  }
  const pairs = [
    ["ne", "nw"],
    ["ne", "se"],
    ["sw", "nw"],
    ["se", "sw"]
  ];
  const candidates = state.rooms.filter((room) => (
    room.rotunda !== true &&
    room.organic !== true &&
    !String(room.theme || "").includes("organic") &&
    room.width >= 3 &&
    room.height >= 3
  ));
  if (!candidates.length) {
    return;
  }
  let applied = 0;
  for (const room of candidates) {
    if (rng.nextFloat() > chance) {
      continue;
    }
    const corners = rng.nextFloat() < getAngledFourCornerChance(state, pattern)
      ? ["nw", "ne", "se", "sw"]
      : rng.pick(pairs);
    if (applyAngledCornerRoomTheme(state, room, rng, corners)) {
      applied += 1;
    }
  }
  if (applied === 0 && pattern === "angled") {
    const fallbackCornerSets = [["nw", "ne", "se", "sw"], ...pairs];
    for (const room of candidates) {
      if (fallbackCornerSets.some((corners) => applyAngledCornerRoomTheme(state, room, rng, corners))) {
        break;
      }
    }
  }
}

function buildInnerWallAssetCatalog(assetNames = []) {
  const catalog = {
    run: [],
    cap: [],
    corner: [],
    t: [],
    cross: [],
    pillar: [],
    available: false
  };
  for (const asset of assetNames || []) {
    const assetName = String(asset || "").trim();
    if (!assetName) {
      continue;
    }
    if (/^1-wall-run/i.test(assetName)) {
      catalog.run.push(assetName);
    } else if (/^1-wall-t/i.test(assetName)) {
      catalog.t.push(assetName);
    } else if (/^1-wall-intersection/i.test(assetName)) {
      catalog.cross.push(assetName);
    } else if (/^1-wall-cap/i.test(assetName)) {
      catalog.cap.push(assetName);
    } else if (/^1-wall-l/i.test(assetName)) {
      catalog.corner.push(assetName);
    } else if (/^1x1-wall-\d+/i.test(assetName)) {
      catalog.pillar.push(assetName);
    }
  }
  catalog.available = catalog.run.length > 0 || catalog.cap.length > 0 || catalog.t.length > 0 || catalog.cross.length > 0 || catalog.pillar.length > 0;
  return catalog;
}

function pickInnerWallAsset(catalog, kind, rng) {
  const fallback = catalog.run.length ? catalog.run : [...catalog.cap, ...catalog.pillar];
  const pool = catalog[kind]?.length ? catalog[kind] : fallback;
  return pool.length ? rng.pick(pool) : null;
}

function innerWallRotationFor(orientation, role) {
  if (role === "pillar") {
    return 0;
  }
  if (role === "run") {
    return orientation === "horizontal" ? 1 : 0;
  }
  if (orientation === "vertical") {
    return role === "start" ? 0 : 2;
  }
  return role === "start" ? 3 : 1;
}

function innerWallCapRotationFor(neighborSide) {
  if (neighborSide === "south") return 0;
  if (neighborSide === "west") return 1;
  if (neighborSide === "north") return 2;
  return 3;
}

function innerWallCornerRotationFor(sides) {
  const key = sides.slice().sort().join("-");
  if (key === "north-west") return 0;
  if (key === "east-north") return 1;
  if (key === "east-south") return 2;
  if (key === "south-west") return 3;
  return 0;
}

function innerWallTRotationFor(sides) {
  const missingSide = RECT_GRAPH_SIDES.find((side) => !sides.includes(side)) || "north";
  if (missingSide === "north") return 0;
  if (missingSide === "east") return 1;
  if (missingSide === "south") return 2;
  return 3;
}

function isGeneratedPassableTile(tile) {
  return tile?.type === TILE_TYPES.FLOOR &&
    !isOrganicMovementBlockingTile(tile) &&
    !isInnerWallBlockingTile(tile) &&
    !isAngledWallMovementBlockingTile(tile);
}

function roomStructuralConnectivityValid(state, room) {
  const passable = getRoomOrganicFloorTiles(state, room).filter(isGeneratedPassableTile);
  if (passable.length <= 1) {
    return true;
  }
  const byKey = new Map(passable.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const start = passable[0];
  const queue = [start];
  const visited = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const current = queue.shift();
    for (const side of RECT_GRAPH_SIDES) {
      const { dx, dy } = getOrganicNeighborDelta(side);
      const neighbor = byKey.get(`${current.x + dx},${current.y + dy}`);
      if (!neighbor || visited.has(`${neighbor.x},${neighbor.y}`)) {
        continue;
      }
      if (!canCrossOrganicEdge(current, neighbor, dx, dy)) {
        continue;
      }
      visited.add(`${neighbor.x},${neighbor.y}`);
      queue.push(neighbor);
    }
  }
  return visited.size === passable.length;
}

function rememberInnerWallTileChange(changes, tile) {
  if (!tile || changes.has(tile)) {
    return;
  }
  const innerWall = tile.meta?.innerWall ? JSON.parse(JSON.stringify(tile.meta.innerWall)) : null;
  changes.set(tile, innerWall);
}

function restoreInnerWallTileChanges(changes) {
  for (const [tile, innerWall] of changes.entries()) {
    if (!tile.meta || typeof tile.meta !== "object") {
      tile.meta = {};
    }
    if (innerWall) {
      tile.meta.innerWall = innerWall;
    } else {
      clearInnerWallTileMeta(tile);
    }
  }
}

function canPlaceInnerWallTile(state, room, tile, protectedKeys) {
  if (!tile || tile.roomId !== room.id || tile.type !== TILE_TYPES.FLOOR) {
    return false;
  }
  if (protectedKeys.has(`${tile.x},${tile.y}`)) {
    return false;
  }
  return !isOrganicMovementBlockingTile(tile) &&
    !isInnerWallBlockingTile(tile) &&
    !isAngledWallMovementBlockingTile(tile) &&
    !isFloorOccupied(state, tile.x, tile.y);
}

function collectInnerWallLineSegments(state, room, orientation, protectedKeys, rng) {
  const attempts = 16;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const tiles = [];
    if (orientation === "vertical") {
      const minX = room.x + 2;
      const maxX = room.x + room.width - 3;
      if (maxX < minX) {
        return [];
      }
      const x = rng.nextInt(minX, maxX);
      for (let y = room.y + 1; y <= room.y + room.height - 2; y += 1) {
        tiles.push(getTile(state, x, y));
      }
    } else {
      const minY = room.y + 2;
      const maxY = room.y + room.height - 3;
      if (maxY < minY) {
        return [];
      }
      const y = rng.nextInt(minY, maxY);
      for (let x = room.x + 1; x <= room.x + room.width - 2; x += 1) {
        tiles.push(getTile(state, x, y));
      }
    }

    const placeable = tiles.map((tile) => canPlaceInnerWallTile(state, room, tile, protectedKeys));
    const gapCandidates = tiles
      .map((tile, index) => ({ tile, index }))
      .filter(({ tile, index }) => tile && placeable[index] && index > 0 && index < tiles.length - 1);
    if (!gapCandidates.length) {
      continue;
    }
    const gap = rng.pick(gapCandidates).index;
    const segments = [];
    let segment = [];
    for (let index = 0; index < tiles.length; index += 1) {
      if (index === gap || !placeable[index]) {
        if (segment.length) {
          segments.push(segment);
          segment = [];
        }
        continue;
      }
      segment.push(tiles[index]);
    }
    if (segments.some((candidate) => candidate.length >= 2)) {
      return segments.filter((candidate) => candidate.length > 0);
    }
  }
  return [];
}

function applyInnerWallSegment(state, segment, orientation, catalog, rng, changes) {
  if (!segment.length) {
    return 0;
  }
  if (segment.length === 1) {
    const asset = pickInnerWallAsset(catalog, "pillar", rng);
    if (!asset) {
      return 0;
    }
    const tile = segment[0];
    rememberInnerWallTileChange(changes, tile);
    setInnerWallTileMeta(tile, asset, {
      kind: "pillar",
      rotationTurns: rng.nextInt(0, 3),
      flipX: rng.nextFloat() < 0.5,
      flipY: rng.nextFloat() < 0.5
    });
    return 1;
  }

  let placed = 0;
  for (let index = 0; index < segment.length; index += 1) {
    const tile = segment[index];
    const role = index === 0
      ? "start"
      : index === segment.length - 1
        ? "end"
        : "run";
    const asset = pickInnerWallAsset(catalog, role === "run" ? "run" : "cap", rng) ||
      pickInnerWallAsset(catalog, "run", rng);
    if (!asset) {
      continue;
    }
    rememberInnerWallTileChange(changes, tile);
    setInnerWallTileMeta(tile, asset, {
      kind: role === "run" ? "run" : "cap",
      rotationTurns: innerWallRotationFor(orientation, role),
      flipX: role === "run" && rng.nextFloat() < 0.5,
      flipY: role === "run" && rng.nextFloat() < 0.5
    });
    placed += 1;
  }
  return placed;
}

function getInnerWallPointKey(point) {
  return `${point.x},${point.y}`;
}

function createInnerWallPointSet(points) {
  const map = new Map();
  for (const point of points || []) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      continue;
    }
    map.set(getInnerWallPointKey(point), { x: point.x, y: point.y });
  }
  return map;
}

function getInnerWallPointNeighbors(point, pointMap) {
  return RECT_GRAPH_SIDES
    .map((side) => {
      const direction = RECT_GRAPH_DIRECTIONS[side];
      return {
        side,
        point: pointMap.get(`${point.x + direction.x},${point.y + direction.y}`)
      };
    })
    .filter((entry) => entry.point);
}

function innerWallPointRunsParallelToPerimeter(room, point, pointMap) {
  const sides = getInnerWallPointNeighbors(point, pointMap).map((entry) => entry.side);
  const adjacentWestWall = point.x === room.x + 1;
  const adjacentEastWall = point.x === room.x + room.width - 2;
  const adjacentNorthWall = point.y === room.y + 1;
  const adjacentSouthWall = point.y === room.y + room.height - 2;
  if ((adjacentWestWall || adjacentEastWall) && (sides.includes("north") || sides.includes("south"))) {
    return true;
  }
  if ((adjacentNorthWall || adjacentSouthWall) && (sides.includes("east") || sides.includes("west"))) {
    return true;
  }
  return false;
}

function getInnerWallPointBounds(points) {
  const bounds = {
    left: Infinity,
    right: -Infinity,
    top: Infinity,
    bottom: -Infinity
  };
  for (const point of points || []) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      continue;
    }
    bounds.left = Math.min(bounds.left, point.x);
    bounds.right = Math.max(bounds.right, point.x);
    bounds.top = Math.min(bounds.top, point.y);
    bounds.bottom = Math.max(bounds.bottom, point.y);
  }
  return Number.isFinite(bounds.left) ? bounds : null;
}

function buildProhibitedInnerWallSymbolTemplate(centerX, centerY, radius, mirrored = false) {
  const points = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    points.push({ x: centerX + offset, y: centerY });
    points.push({ x: centerX, y: centerY + offset });
  }
  const directions = mirrored
    ? [
      { x: -1, y: -1, axis: "x" },
      { x: 1, y: -1, axis: "y" },
      { x: 1, y: 1, axis: "x" },
      { x: -1, y: 1, axis: "y" }
    ]
    : [
      { x: 1, y: -1, axis: "x" },
      { x: 1, y: 1, axis: "y" },
      { x: -1, y: 1, axis: "x" },
      { x: -1, y: -1, axis: "y" }
    ];
  for (const direction of directions) {
    for (let offset = 0; offset <= radius; offset += 1) {
      points.push({
        x: centerX + (direction.axis === "x" ? direction.x * offset : direction.x * radius),
        y: centerY + (direction.axis === "y" ? direction.y * offset : direction.y * radius)
      });
    }
  }
  return createInnerWallPointSet(points).values();
}

function innerWallPointsContainProhibitedSymbol(points) {
  const pointMap = createInnerWallPointSet(points);
  if (pointMap.size < 10) {
    return false;
  }
  const bounds = getInnerWallPointBounds([...pointMap.values()]);
  if (!bounds) {
    return false;
  }
  const maxRadius = Math.floor(Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top) / 2);
  for (let radius = 2; radius <= maxRadius; radius += 1) {
    for (let centerY = bounds.top + radius; centerY <= bounds.bottom - radius; centerY += 1) {
      for (let centerX = bounds.left + radius; centerX <= bounds.right - radius; centerX += 1) {
        for (const mirrored of [false, true]) {
          const template = [...buildProhibitedInnerWallSymbolTemplate(centerX, centerY, radius, mirrored)];
          const present = template.filter((point) => pointMap.has(getInnerWallPointKey(point))).length;
          if (template.length - present <= PROHIBITED_INNER_WALL_SYMBOL_MAX_MISSING) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function getInnerWallOrientationFromNeighbors(neighbors) {
  const sides = neighbors.map((entry) => entry.side);
  if (sides.includes("north") || sides.includes("south")) {
    if (!sides.includes("east") && !sides.includes("west")) {
      return "vertical";
    }
  }
  return "horizontal";
}

function applyInnerWallPointPattern(state, room, points, catalog, rng, changes) {
  const pointMap = createInnerWallPointSet(points);
  let placed = 0;
  for (const point of pointMap.values()) {
    const tile = getTile(state, point.x, point.y);
    if (!tile) {
      continue;
    }
    const neighbors = getInnerWallPointNeighbors(point, pointMap);
    const neighborSides = neighbors.map((entry) => entry.side);
    const isPillar = neighbors.length === 0;
    const isCross = neighbors.length >= 4;
    const isT = neighbors.length === 3;
    const isRun = neighbors.length === 2 && (
      (neighborSides.includes("north") && neighborSides.includes("south")) ||
      (neighborSides.includes("east") && neighborSides.includes("west"))
    );
    const kind = isPillar
      ? "pillar"
      : isCross
        ? "cross"
      : isT
        ? "t"
        : neighbors.length === 1
        ? "cap"
        : isRun
          ? "run"
          : "corner";
    const asset = pickInnerWallAsset(catalog, kind, rng) ||
      pickInnerWallAsset(catalog, "run", rng);
    if (!asset) {
      continue;
    }
    const orientation = getInnerWallOrientationFromNeighbors(neighbors);
    const canDecorFlip = kind === "run" || kind === "pillar" || kind === "cross";
    rememberInnerWallTileChange(changes, tile);
    setInnerWallTileMeta(tile, asset, {
      kind,
      rotationTurns: kind === "pillar"
        ? rng.nextInt(0, 3)
        : kind === "cross"
          ? rng.nextInt(0, 3)
        : kind === "t"
          ? innerWallTRotationFor(neighborSides)
        : kind === "cap"
          ? innerWallCapRotationFor(neighborSides[0])
        : kind === "corner"
            ? innerWallCornerRotationFor(neighborSides)
            : innerWallRotationFor(orientation, "run"),
      flipX: canDecorFlip && rng.nextFloat() < 0.5,
      flipY: canDecorFlip && rng.nextFloat() < 0.5
    });
    placed += 1;
  }
  return placed;
}

function getInnerWallBuildArea(room) {
  return {
    left: room.x + 1,
    right: room.x + room.width - 2,
    top: room.y + 1,
    bottom: room.y + room.height - 2,
    width: Math.max(0, room.width - 2),
    height: Math.max(0, room.height - 2)
  };
}

function collectLinePoints(x1, y1, x2, y2) {
  const points = [];
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);
  let x = x1;
  let y = y1;
  points.push({ x, y });
  while (x !== x2 || y !== y2) {
    if (x !== x2) x += dx;
    if (y !== y2) y += dy;
    points.push({ x, y });
  }
  return points;
}

function removeInnerWallDoorway(points, doorway) {
  return points.filter((point) => point.x !== doorway.x || point.y !== doorway.y);
}

function removeInnerWallDoorways(points, doorways) {
  const blocked = new Set((doorways || []).map((point) => `${point.x},${point.y}`));
  return points.filter((point) => !blocked.has(`${point.x},${point.y}`));
}

function clampInnerWallPoint(area, x, y) {
  return {
    x: clamp(x, area.left, area.right),
    y: clamp(y, area.top, area.bottom)
  };
}

function buildPixelSubdivisionInnerWallPattern(room, rng) {
  const area = getInnerWallBuildArea(room);
  if (area.width < 6 || area.height < 6) {
    return buildSubdivisionInnerWallPattern(room, rng);
  }
  const innerLeft = area.left + 1;
  const innerRight = area.right - 1;
  const innerTop = area.top + 1;
  const innerBottom = area.bottom - 1;
  const leftColumn = clamp(area.left + Math.floor(area.width * 0.32), area.left + 1, area.right - 2);
  const rightColumn = clamp(area.left + Math.floor(area.width * 0.68), area.left + 2, area.right - 1);
  const upperRow = clamp(area.top + Math.floor(area.height * 0.34), area.top + 1, area.bottom - 2);
  const lowerRow = clamp(area.top + Math.floor(area.height * 0.68), area.top + 2, area.bottom - 1);
  const doorwayPoints = [
    clampInnerWallPoint(area, leftColumn, upperRow),
    clampInnerWallPoint(area, rightColumn, lowerRow),
    rng.nextFloat() < 0.5
      ? clampInnerWallPoint(area, rightColumn, upperRow + 1)
      : clampInnerWallPoint(area, leftColumn + 1, lowerRow)
  ];
  const points = [
    ...collectLinePoints(leftColumn, innerTop, leftColumn, innerBottom),
    ...collectLinePoints(innerLeft, upperRow, rightColumn, upperRow),
    ...collectLinePoints(rightColumn, upperRow, rightColumn, innerBottom),
    ...collectLinePoints(leftColumn, lowerRow, innerRight, lowerRow)
  ];
  if (area.width >= 10 || area.height >= 10) {
    const shortRow = clamp(area.top + Math.floor(area.height * 0.18), area.top, area.bottom);
    const shortEnd = clamp(area.left + Math.floor(area.width * 0.52), area.left + 2, area.right);
    points.push(...collectLinePoints(innerLeft, shortRow, shortEnd, shortRow));
    doorwayPoints.push(clampInnerWallPoint(area, shortEnd - 1, shortRow));
  }
  return removeInnerWallDoorways(points, doorwayPoints);
}

function buildPixelMazeInnerWallPattern(room, rng) {
  const area = getInnerWallBuildArea(room);
  if (area.width < 6 || area.height < 6) {
    return buildMazeInnerWallPattern(room, rng);
  }
  const innerLeft = area.left + 1;
  const innerRight = area.right - 1;
  const innerTop = area.top + 1;
  const innerBottom = area.bottom - 1;
  const firstX = clamp(area.left + Math.floor(area.width * 0.25), area.left + 1, area.right - 2);
  const secondX = clamp(area.left + Math.floor(area.width * 0.58), area.left + 2, area.right - 1);
  const thirdX = clamp(area.left + Math.floor(area.width * 0.78), area.left + 3, area.right);
  const upperY = clamp(area.top + Math.floor(area.height * 0.28), area.top + 1, area.bottom - 2);
  const middleY = clamp(area.top + Math.floor(area.height * 0.52), area.top + 2, area.bottom - 1);
  const lowerY = clamp(area.top + Math.floor(area.height * 0.76), area.top + 3, area.bottom);
  const points = [
    ...collectLinePoints(firstX, innerTop, firstX, middleY),
    ...collectLinePoints(firstX, upperY, innerRight, upperY),
    ...collectLinePoints(secondX, upperY, secondX, innerBottom),
    ...collectLinePoints(innerLeft, lowerY, secondX, lowerY)
  ];
  const doorways = [
    clampInnerWallPoint(area, firstX + 1, upperY),
    clampInnerWallPoint(area, secondX, lowerY)
  ];
  if (rng.nextFloat() < 0.55) {
    const sideY = clamp(area.top + Math.floor(area.height * 0.14), innerTop, innerBottom);
    points.push(...collectLinePoints(thirdX, sideY, thirdX, middleY));
  }
  return removeInnerWallDoorways(points, doorways);
}

function buildSpiderInnerWallPattern(room, rng) {
  const area = getInnerWallBuildArea(room);
  if (area.width < 6 || area.height < 6) {
    return buildMazeInnerWallPattern(room, rng);
  }
  const center = {
    x: clamp(Math.floor((area.left + area.right) / 2), area.left + 2, area.right - 2),
    y: clamp(Math.floor((area.top + area.bottom) / 2), area.top + 2, area.bottom - 2)
  };
  const northEnd = clamp(area.top + 1, area.top, center.y - 1);
  const southEnd = clamp(area.bottom - 1, center.y + 1, area.bottom);
  const westEnd = clamp(area.left + 1, area.left, center.x - 1);
  const eastEnd = clamp(area.right - 1, center.x + 1, area.right);
  const points = [
    ...collectLinePoints(center.x, northEnd, center.x, southEnd),
    ...collectLinePoints(westEnd, center.y, eastEnd, center.y)
  ];
  const diagonalArms = [
    collectLinePoints(center.x - 1, center.y - 1, area.left + 1, area.top + 1),
    collectLinePoints(center.x + 1, center.y - 1, area.right - 1, area.top + 1),
    collectLinePoints(center.x - 1, center.y + 1, area.left + 1, area.bottom - 1),
    collectLinePoints(center.x + 1, center.y + 1, area.right - 1, area.bottom - 1)
  ];
  for (const arm of diagonalArms) {
    if (rng.nextFloat() < 0.65) {
      points.push(...arm);
    }
  }
  return removeInnerWallDoorways(points, [
    clampInnerWallPoint(area, center.x, center.y - 1),
    clampInnerWallPoint(area, center.x + 1, center.y)
  ]);
}

function buildSubdivisionInnerWallPattern(room, rng) {
  const area = getInnerWallBuildArea(room);
  const points = [];
  const vertical = room.width >= 7;
  const horizontal = room.height >= 7 && (rng.nextFloat() < 0.55 || !vertical);
  if (vertical) {
    const x = rng.nextInt(area.left + 1, area.right - 1);
    const doorway = { x, y: rng.nextInt(area.top + 1, area.bottom - 1) };
    points.push(...removeInnerWallDoorway(collectLinePoints(x, area.top, x, area.bottom), doorway));
  }
  if (horizontal) {
    const y = rng.nextInt(area.top + 1, area.bottom - 1);
    const doorway = { x: rng.nextInt(area.left + 1, area.right - 1), y };
    points.push(...removeInnerWallDoorway(collectLinePoints(area.left, y, area.right, y), doorway));
  }
  return points;
}

function buildMazeInnerWallPattern(room, rng) {
  const area = getInnerWallBuildArea(room);
  const points = [];
  const verticalX = rng.nextInt(area.left + 1, area.right - 1);
  const topY = rng.nextInt(area.top, Math.max(area.top, area.top + Math.floor(area.height / 3)));
  const bottomY = rng.nextInt(Math.min(area.bottom, area.bottom - Math.floor(area.height / 3)), area.bottom);
  points.push(...collectLinePoints(verticalX, topY, verticalX, bottomY));
  const branchY = rng.nextFloat() < 0.5
    ? rng.nextInt(topY + 1, Math.max(topY + 1, bottomY - 1))
    : rng.nextInt(area.top + 1, area.bottom - 1);
  const branchEnd = rng.nextFloat() < 0.5 ? area.left : area.right;
  points.push(...collectLinePoints(verticalX, branchY, branchEnd, branchY));
  if (room.width >= 10 && room.height >= 8) {
    const secondY = rng.nextInt(area.top + 1, area.bottom - 1);
    const startX = rng.nextFloat() < 0.5 ? area.left : area.right;
    const endX = rng.nextInt(area.left + 2, area.right - 2);
    points.push(...collectLinePoints(startX, secondY, endX, secondY));
  }
  return points;
}

function buildSpiralInnerWallPattern(room) {
  const area = getInnerWallBuildArea(room);
  let left = area.left;
  let right = area.right;
  let top = area.top;
  let bottom = area.bottom;
  const points = [];
  while (right - left >= 3 && bottom - top >= 3) {
    points.push(...collectLinePoints(left, top, right, top));
    points.push(...collectLinePoints(right, top + 1, right, bottom));
    points.push(...collectLinePoints(right - 1, bottom, left + 1, bottom));
    left += 2;
    top += 2;
    right -= 2;
    bottom -= 2;
  }
  return points;
}

function buildRoomWithinRoomInnerWallPattern(room, rng) {
  const area = getInnerWallBuildArea(room);
  if (area.width < 5 || area.height < 5) {
    return [];
  }
  const width = Math.max(3, Math.min(area.width - 2, rng.nextInt(3, Math.max(3, area.width - 2))));
  const height = Math.max(3, Math.min(area.height - 2, rng.nextInt(3, Math.max(3, area.height - 2))));
  const left = rng.nextInt(area.left + 1, area.right - width);
  const top = rng.nextInt(area.top + 1, area.bottom - height);
  const right = left + width - 1;
  const bottom = top + height - 1;
  const doorwaySide = rng.pick(RECT_GRAPH_SIDES);
  const doorway = doorwaySide === "north"
    ? { x: rng.nextInt(left + 1, right - 1), y: top }
    : doorwaySide === "south"
      ? { x: rng.nextInt(left + 1, right - 1), y: bottom }
      : doorwaySide === "west"
        ? { x: left, y: rng.nextInt(top + 1, bottom - 1) }
        : { x: right, y: rng.nextInt(top + 1, bottom - 1) };
  const points = [
    ...collectLinePoints(left, top, right, top),
    ...collectLinePoints(right, top + 1, right, bottom),
    ...collectLinePoints(right - 1, bottom, left, bottom),
    ...collectLinePoints(left, bottom - 1, left, top + 1)
  ];
  return removeInnerWallDoorway(points, doorway);
}

function buildAlternatingRowsInnerWallPattern(room, rng) {
  const area = getInnerWallBuildArea(room);
  const points = [];
  const rowCount = Math.max(1, Math.min(3, Math.floor(area.height / 3)));
  const firstRow = rng.nextInt(area.top, Math.max(area.top, area.bottom - (rowCount - 1) * 2));
  for (let row = 0; row < rowCount; row += 1) {
    const y = firstRow + row * 2;
    const startOffset = row % 2;
    for (let x = area.left + startOffset; x <= area.right; x += 2) {
      points.push({ x, y });
    }
  }
  return points;
}

function buildInnerWallPatternPoints(room, rng, patternName) {
  if (patternName === "pixelSubdivision") {
    return buildPixelSubdivisionInnerWallPattern(room, rng);
  }
  if (patternName === "pixelMaze") {
    return buildPixelMazeInnerWallPattern(room, rng);
  }
  if (patternName === "maze") {
    return buildMazeInnerWallPattern(room, rng);
  }
  if (patternName === "spider") {
    return buildSpiderInnerWallPattern(room, rng);
  }
  if (patternName === "spiral") {
    return buildSpiralInnerWallPattern(room);
  }
  if (patternName === "roomWithinRoom") {
    return buildRoomWithinRoomInnerWallPattern(room, rng);
  }
  if (patternName === "alternatingRows") {
    return buildAlternatingRowsInnerWallPattern(room, rng);
  }
  return buildSubdivisionInnerWallPattern(room, rng);
}

function tryApplyInnerWallPatternRoomTheme(state, room, catalog, rng, protectedKeys, patternName) {
  const changes = new Map();
  const rawPoints = buildInnerWallPatternPoints(room, rng, patternName);
  const pointMap = createInnerWallPointSet(rawPoints);
  const safePoints = rawPoints
    .filter((point) => !innerWallPointRunsParallelToPerimeter(room, point, pointMap));
  if (innerWallPointsContainProhibitedSymbol(safePoints)) {
    return false;
  }
  const points = safePoints
    .map((point) => getTile(state, point.x, point.y))
    .filter((tile) => canPlaceInnerWallTile(state, room, tile, protectedKeys));
  if (points.length < 2) {
    return false;
  }
  const placed = applyInnerWallPointPattern(
    state,
    room,
    points.map((tile) => ({ x: tile.x, y: tile.y })),
    catalog,
    rng,
    changes
  );
  if (placed < 2 || !roomStructuralConnectivityValid(state, room)) {
    restoreInnerWallTileChanges(changes);
    return false;
  }
  room.theme = room.theme ? `${room.theme}+innerWalls` : "innerWalls";
  room.innerWallPattern = patternName;
  return true;
}

function getInnerWallRoomChance(pattern) {
  if (pattern === "innerWalls") return 0.9;
  if (pattern === "fortress") return 0.48;
  if (pattern === "gallery" || pattern === "hub") return 0.38;
  if (pattern === "organic" || pattern === "organicHybrid") return 0.08;
  return 0.22;
}

function applyInnerWallRoomTheme(state, room, catalog, rng, pattern) {
  const protectedKeys = getRoomDoorInteriorKeys(state, room);
  const patternNames = pattern === "innerWalls"
    ? shuffleInnerWallPatternNames(rng)
    : rng.nextFloat() < 0.45
      ? [rng.pick(INNER_WALL_PATTERN_NAMES)]
      : [];
  for (const patternName of patternNames) {
    if (tryApplyInnerWallPatternRoomTheme(state, room, catalog, rng, protectedKeys, patternName)) {
      return true;
    }
  }
  const changes = new Map();
  const orientation = room.width >= room.height
    ? (rng.nextFloat() < 0.72 ? "vertical" : "horizontal")
    : (rng.nextFloat() < 0.72 ? "horizontal" : "vertical");
  const segments = collectInnerWallLineSegments(state, room, orientation, protectedKeys, rng);
  if (!segments.length) {
    return false;
  }

  let placed = 0;
  for (const segment of segments) {
    placed += applyInnerWallSegment(state, segment, orientation, catalog, rng, changes);
  }

  if (placed < 2 || !roomStructuralConnectivityValid(state, room)) {
    restoreInnerWallTileChanges(changes);
    return false;
  }
  room.theme = room.theme ? `${room.theme}+innerWalls` : "innerWalls";
  room.innerWallPattern = "divider";
  return true;
}

function shuffleInnerWallPatternNames(rng) {
  const names = [...INNER_WALL_PATTERN_NAMES];
  for (let index = names.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(0, index);
    [names[index], names[swapIndex]] = [names[swapIndex], names[index]];
  }
  return names;
}

function applyInnerWallDungeonTheme(state, rng, innerWallAssets = [], pattern = "processional") {
  const catalog = buildInnerWallAssetCatalog(innerWallAssets);
  if (!catalog.available) {
    return;
  }
  const chance = getInnerWallRoomChance(pattern);
  const candidates = state.rooms.filter((room) => (
    room.id !== state.generation.entranceRoomId &&
    room.rotunda !== true &&
    !String(room.theme || "").includes("organic") &&
    room.width >= INNER_WALL_MIN_ROOM_WIDTH &&
    room.height >= INNER_WALL_MIN_ROOM_HEIGHT
  ));
  if (!candidates.length) {
    return;
  }

  let applied = 0;
  for (const room of candidates) {
    if (rng.nextFloat() <= chance && applyInnerWallRoomTheme(state, room, catalog, rng, pattern)) {
      applied += 1;
    }
  }
  if (applied === 0 && (pattern === "innerWalls" || pattern === "fortress")) {
    const fallbackRooms = [...candidates].sort((a, b) => (b.width * b.height) - (a.width * a.height));
    for (const room of fallbackRooms) {
      if (applyInnerWallRoomTheme(state, room, catalog, rng, pattern)) {
        applied += 1;
        break;
      }
    }
  }
  if (pattern === "innerWalls") {
    state.generation.innerWallRooms = state.rooms
      .filter((room) => String(room.theme || "").includes("innerWalls"))
      .map((room) => ({
        id: room.id,
        pattern: room.innerWallPattern || "divider"
      }));
  }
}

function getInitialExitSides(pattern, rng) {
  if (pattern === "innerWalls") {
    return RECT_GRAPH_SIDES;
  }
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
  if (room?.organic === true) {
    const organicBase = {
      monster: 0.72,
      treasure: 0.58,
      trap: 0.12,
      feature: 0.18,
      doorTrap: 0.04
    };
    const organicProfiles = {
      [ROOM_ROLES.ENTRANCE]: { monster: 0.12, treasure: 0.06, trap: 0.01, feature: 0.12, doorTrap: 0.01 },
      [ROOM_ROLES.GUARD]: { monster: 0.86, treasure: 0.48, trap: 0.08, feature: 0.12, doorTrap: 0.03 },
      [ROOM_ROLES.VAULT]: { monster: 0.5, treasure: 0.9, trap: 0.18, feature: 0.1, doorTrap: 0.08 },
      [ROOM_ROLES.SHRINE]: { monster: 0.58, treasure: 0.62, trap: 0.1, feature: 0.62, doorTrap: 0.04 },
      [ROOM_ROLES.WATER]: { monster: 0.62, treasure: 0.45, trap: 0.12, feature: 0.34, doorTrap: 0.02 },
      [ROOM_ROLES.ENDING]: { monster: 0.88, treasure: 0.84, trap: 0.16, feature: 0.26, doorTrap: 0.06 },
      [ROOM_ROLES.DEAD_END]: { monster: 0.42, treasure: 0.58, trap: 0.08, feature: 0.42, doorTrap: 0.02 },
      [ROOM_ROLES.CHAMBER]: organicBase
    };
    return organicProfiles[room.role] || organicBase;
  }
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

function applyArchitecturalDoorDetails(state, rng, pattern = "processional") {
  for (const door of state.entities.filter((entity) => entity.subtype === "door")) {
    const room = state.rooms.find((candidate) => candidate.id === door.roomId);
    if (!room) {
      continue;
    }
    if (room.role === ROOM_ROLES.VAULT && door.doorKind !== "gate" && rng.nextFloat() < 0.72) {
      door.doorState = DOOR_STATES.LOCKED;
    }
    if (pattern !== "organic" && room.role === ROOM_ROLES.DEAD_END && rng.nextFloat() < 0.18) {
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
    level: monster.level ?? monster.lv ?? monster["**LV**"] ?? monster["LV"] ?? null,
    ac: monster.ac ?? monster["**AC**"] ?? monster["AC"] ?? null,
    hp: monster.hp ?? monster["**HP**"] ?? monster["HP"] ?? null,
    attack: monster.attack ?? monster["**ATK**"] ?? monster["ATK"] ?? null,
    movement: monster.movement ?? monster.mv ?? monster["**MV**"] ?? monster["MV"] ?? null,
    D: monster.D ?? monster.dex ?? monster["**D**"] ?? "",
    abilities: monster.abilities || monster.talents || {},
    tags: monster.tags || [],
    diplomacy: monster.diplomacy ?? monster.Diplomacy ?? monster["Diplomacy"] ?? "",
    defeated: false
  };
}

function balanceTreasureValue(state, rng, trapTable = [], lootCatalog = {}) {
  const targetValue = getTreasureTargetValueGp(state);
  balanceBossTreasureShare(state, rng, targetValue);
  let currentValue = getTreasureValueTotal(state);
  if (currentValue > targetValue * 1.08) {
    const scale = targetValue / currentValue;
    for (const treasure of state.entities || []) {
      if (treasure.type === ENTITY_TYPES.TREASURE && !treasure.collected) {
        setTreasureValueGp(treasure, Number(treasure.value || 0) * scale);
      }
    }
    currentValue = getTreasureValueTotal(state);
  }
  if (currentValue >= targetValue * 0.92) {
    state.generation.treasureTargetGp = targetValue;
    state.generation.treasureActualGp = currentValue;
    return;
  }
  const candidates = state.rooms
    .filter((room) => room.id !== state.generation.entranceRoomId)
    .map((room) => ({
      room,
      tile: findFurthestFloorTileInRoomFromStart(state, room)
    }))
    .filter((entry) => entry.tile)
    .sort((a, b) => tileDistanceFromStart(state, b.tile.x, b.tile.y) - tileDistanceFromStart(state, a.tile.x, a.tile.y));
  let index = 0;
  while (currentValue < targetValue * 0.96 && index < candidates.length * 3) {
    const entry = candidates[index % candidates.length];
    const treasure = spawnTreasureAtTile(state, rng, entry.room, entry.tile, {}, lootCatalog);
    if (treasure) {
      const remaining = targetValue - currentValue;
      const fraction = 0.04 + rng.nextFloat() * 0.08;
      const desired = Math.max(25, Math.min(remaining, targetValue * fraction));
      if (Number(treasure.value || 0) < desired) {
        setTreasureValueGp(treasure, desired);
      }
      currentValue += Math.max(0, Number(treasure.value || 0) || 0);
      if (rng.nextFloat() < 0.12) {
        spawnTrap(state, rng, entry.room, trapTable, "treasure", treasure.id);
      }
    }
    index += 1;
  }
  const finalValue = getTreasureValueTotal(state);
  if (finalValue < targetValue * 0.92) {
    const target = findFurthestTreasureFromStart(state);
    if (target) {
      setTreasureValueGp(target, Number(target.value || 0) + (targetValue - finalValue));
      target.treasureValueBalanced = true;
    }
  }
  state.generation.treasureTargetGp = targetValue;
  state.generation.treasureActualGp = getTreasureValueTotal(state);
}

function pickBossRoomCount(rng) {
  const roll = rng.nextFloat();
  if (roll < 0.5) return 1;
  if (roll < 0.8) return 2;
  return 3;
}

function getRoomBossScore(state, room) {
  const center = getRoomCenter(room);
  const distance = Math.abs(center.x - state.player.x) + Math.abs(center.y - state.player.y);
  const area = Math.max(1, Number(room.width) * Number(room.height));
  const roleBonus =
    room.role === ROOM_ROLES.ENDING ? 20 :
      room.role === ROOM_ROLES.VAULT ? 15 :
        room.role === ROOM_ROLES.GUARD ? 8 :
          room.role === ROOM_ROLES.ROTUNDA ? 6 : 0;
  return distance * 3 + area + roleBonus;
}

function pickBossRooms(state, rng) {
  const targetCount = Math.min(pickBossRoomCount(rng), Math.max(1, state.rooms.length - 1));
  const candidates = state.rooms
    .filter((room) => room.id !== state.generation.entranceRoomId)
    .filter((room) => room.secretTreasureRoom !== true)
    .filter((room) => getFloorTilesInRoom(state, room).length > 0)
    .map((room) => ({
      room,
      score: getRoomBossScore(state, room) + rng.nextFloat() * 8
    }))
    .sort((a, b) => b.score - a.score);
  return candidates.slice(0, targetCount).map((entry) => entry.room);
}

function pickBossMonsterDetails(state, rng, bossMonsterTable = [], fallbackMonsterTable = []) {
  const level = Math.max(1, Number(state.level) || 1);
  const preferred = bossMonsterTable.filter((monster) => {
    const monsterLevel = Number(monster?.level ?? monster?.lv ?? monster?.["**LV**"] ?? 0) || 0;
    return monsterLevel >= Math.min(10, level + 1) && monsterLevel <= Math.min(10, level + 3);
  });
  const details = createMonsterDetails(rng, preferred.length ? preferred : (bossMonsterTable.length ? bossMonsterTable : fallbackMonsterTable));
  if (!details) {
    return null;
  }
  return {
    ...details,
    boss: true,
    bossRoom: true
  };
}

function upvalueBossTreasure(treasure) {
  if (!treasure) {
    return null;
  }
  if (treasure.bossTreasureValueApplied === true) {
    return treasure;
  }
  if (treasure.priceless !== true) {
    treasure.value = Math.max(1, Math.ceil(Number(treasure.value ?? 1) * BOSS_TREASURE_MULTIPLIER));
  }
  treasure.bossTreasure = true;
  treasure.bossTreasureValueApplied = true;
  treasure.treasureMultiplier = BOSS_TREASURE_MULTIPLIER;
  treasure.visible = treasure.visible === true;
  treasure.revealed = treasure.revealed === true;
  return treasure;
}

function ensureBossRoomTreasure(state, rng, room, lootCatalog = {}) {
  const existing = state.entities.find((entity) => (
    entity.type === ENTITY_TYPES.TREASURE &&
    entity.roomId === room.id &&
    entity.collected !== true
  ));
  if (existing) {
    return upvalueBossTreasure(existing);
  }
  const tile = findFurthestFloorTileInRoomFromStart(state, room);
  if (!tile) {
    return null;
  }
  return upvalueBossTreasure(spawnTreasureAtTile(state, rng, room, tile, {
    bossTreasure: true,
    treasureMultiplier: BOSS_TREASURE_MULTIPLIER
  }, lootCatalog));
}

function ensureBossRooms(state, rng, bossMonsterTable = [], fallbackMonsterTable = [], lootCatalog = {}) {
  const rooms = pickBossRooms(state, rng);
  state.generation.bossRooms = rooms.map((room) => room.id);
  for (const room of rooms) {
    room.bossRoom = true;
    room.danger = "boss";
    const details = pickBossMonsterDetails(state, rng, bossMonsterTable, fallbackMonsterTable);
    const existingMonster = state.entities.find((entity) => (
      entity.type === ENTITY_TYPES.MONSTER &&
      entity.roomId === room.id &&
      entity.defeated !== true
    ));
    if (details && existingMonster) {
      Object.assign(existingMonster, details, {
        subtype: "boss",
        boss: true,
        bossRoom: true
      });
    } else if (details) {
      spawnEntity(state, rng, room, "boss", ENTITY_TYPES.MONSTER, "boss", true, details);
    }
    ensureBossRoomTreasure(state, rng, room, lootCatalog);
  }
}

function populateRoomEntities(state, rng, monsterTable = [], trapTable = [], lootCatalog = {}, bossMonsterTable = []) {
  for (const room of state.rooms) {
    if (room.id === state.generation.entranceRoomId) {
      continue;
    }
    const profile = getRoomContentProfile(room);
    const secretTreasureRoom = room.secretTreasureRoom === true;
    let monsterSpawned = false;
    const monsterChance = secretTreasureRoom ? SECRET_TREASURE_ROOM_MONSTER_CHANCE : profile.monster;
    if (rng.nextFloat() < monsterChance) {
      const monster = secretTreasureRoom
        ? pickBossMonsterDetails(state, rng, bossMonsterTable, monsterTable)
        : createMonsterDetails(rng, monsterTable);
      if (monster) {
        spawnEntity(
          state,
          rng,
          room,
          secretTreasureRoom ? "boss" : "monster",
          ENTITY_TYPES.MONSTER,
          secretTreasureRoom ? "boss" : "foe",
          true,
          secretTreasureRoom ? { ...monster, boss: true, bossRoom: true } : monster
        );
        monsterSpawned = true;
      }
    }
    trySpawnRoomTreasure(
      state,
      rng,
      room,
      trapTable,
      lootCatalog,
      secretTreasureRoom ? 1 : profile.treasure,
      {
        trapChance: secretTreasureRoom && !monsterSpawned ? 0.5 : 0.25,
        valueMultiplier: secretTreasureRoom ? 2 : 1
      }
    );
    const roomTrapChance = secretTreasureRoom && !monsterSpawned
      ? Math.min(1, profile.trap * 2)
      : profile.trap;
    if (rng.nextFloat() < roomTrapChance) {
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
    const doorTrapChance = door.secret === true || (room?.secretTreasureRoom === true && !state.entities.some((entity) => (
      entity.type === ENTITY_TYPES.MONSTER &&
      entity.roomId === room.id &&
      entity.defeated !== true
    )))
      ? Math.min(1, (profile?.doorTrap ?? 0.15) * 2)
      : (profile?.doorTrap ?? 0.15);
    if (room && rng.nextFloat() < doorTrapChance) {
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
  if (pattern === "innerWalls") {
    const roll = rng.nextFloat();
    if (depth >= 1 && roll < 0.12) {
      const size = rng.nextInt(13, 15);
      return rng.nextFloat() < 0.58
        ? { width: size, height: size, rotunda: false }
        : { width: size, height: rng.nextInt(10, 15), rotunda: false };
    }
    if (roll < 0.66) {
      return { width: 10, height: 10, rotunda: false };
    }
    if (roll < 0.84) {
      return { width: rng.nextInt(10, 12), height: rng.nextInt(10, 12), rotunda: false };
    }
    if (roll < 0.94) {
      const drift = rng.pick([-1, 1]);
      return {
        width: clamp(10 + drift, 9, 11),
        height: clamp(10 - drift, 9, 11),
        rotunda: false
      };
    }
    return { width: rng.nextInt(8, 10), height: rng.nextInt(8, 10), rotunda: false };
  }
  if (pattern !== "organic" && rng.nextFloat() < ROTUNDA_ROOM_CHANCE && depth > 1) {
    const rotundaSize = rng.nextFloat() < 0.62 ? 7 : 5;
    return { width: rotundaSize, height: rotundaSize, rotunda: true, rotundaSize };
  }
  if (pattern === "organic") {
    const growth = Math.min(3, Math.max(0, depth - 1));
    return {
      width: rng.nextInt(5 + growth, 8 + growth),
      height: rng.nextInt(5 + growth, 8 + growth),
      rotunda: false
    };
  }
  if (depth >= 1) {
    const canalSizedRoomChance = pattern === "waterLogged" ? 0.42 : 0.24;
    if (rng.nextFloat() < canalSizedRoomChance) {
      return {
        width: rng.pick([10, 12, 14, 16]),
        height: rng.pick([12, 16]),
        rotunda: false
      };
    }
  }
  if (pattern === "organicHybrid" && rng.nextFloat() < 0.45) {
    return { width: rng.nextInt(5, 8), height: rng.nextInt(5, 8), rotunda: false };
  }
  if (pattern === "angled" && rng.nextFloat() < 0.4) {
    return { width: rng.nextInt(6, 9), height: rng.nextInt(5, 8), rotunda: false };
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

function areHallTilesClear(state, hallTiles, options = {}) {
  if (!hallTiles.length) {
    return false;
  }
  if (options.allowBent === true) {
    const pathKeys = new Set(hallTiles.map((tile) => `${tile.x},${tile.y}`));
    return hallTiles.every((tile, index) => {
      const existing = getTile(state, tile.x, tile.y);
      if (!existing || existing.type !== TILE_TYPES.WALL) {
        return false;
      }
      for (const side of RECT_GRAPH_SIDES) {
        const direction = RECT_GRAPH_DIRECTIONS[side];
        const neighbor = getTile(state, tile.x + direction.x, tile.y + direction.y);
        if (!neighbor || neighbor.type !== TILE_TYPES.FLOOR || pathKeys.has(`${neighbor.x},${neighbor.y}`)) {
          continue;
        }
        if (index === 0 && neighbor.roomId === options.parentRoomId) {
          continue;
        }
        return false;
      }
      return true;
    });
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

function buildStraightHallTilesFromDoor(parentDoorTile, side, length) {
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

function getPerpendicularSides(side) {
  if (side === "north" || side === "south") {
    return ["west", "east"];
  }
  return ["north", "south"];
}

function pushUniqueHallTile(tiles, seen, point) {
  const key = `${point.x},${point.y}`;
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  tiles.push(point);
  return true;
}

function buildOrganicHallTilesFromDoor(parentDoorTile, side, length, rng) {
  const tiles = [{ x: parentDoorTile.x, y: parentDoorTile.y }];
  const seen = new Set([`${parentDoorTile.x},${parentDoorTile.y}`]);
  const forward = RECT_GRAPH_DIRECTIONS[side];
  const lateralSide = rng.pick(getPerpendicularSides(side));
  const lateral = RECT_GRAPH_DIRECTIONS[lateralSide];
  const oppositeLateral = RECT_GRAPH_DIRECTIONS[RECT_GRAPH_OPPOSITE[lateralSide]];
  let current = { x: parentDoorTile.x, y: parentDoorTile.y };
  let lateralOffset = 0;
  const targetLength = Math.max(length + rng.nextInt(1, 3), 5);

  while (tiles.length < targetLength) {
    const canWiggle = tiles.length > 1 && tiles.length < targetLength - 2 && Math.abs(lateralOffset) < 2;
    if (canWiggle && rng.nextFloat() < 0.38) {
      const usePrimary = lateralOffset <= -1
        ? true
        : lateralOffset >= 1
          ? false
          : rng.nextFloat() < 0.5;
      const delta = usePrimary ? lateral : oppositeLateral;
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      if (pushUniqueHallTile(tiles, seen, next)) {
        current = next;
        lateralOffset += usePrimary ? 1 : -1;
      }
    }

    const nextForward = { x: current.x + forward.x, y: current.y + forward.y };
    if (pushUniqueHallTile(tiles, seen, nextForward)) {
      current = nextForward;
    } else {
      break;
    }

    if (tiles.length < targetLength - 1 && lateralOffset !== 0 && rng.nextFloat() < 0.46) {
      const delta = lateralOffset > 0 ? oppositeLateral : lateral;
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      if (pushUniqueHallTile(tiles, seen, next)) {
        current = next;
        lateralOffset += lateralOffset > 0 ? -1 : 1;
      }
    }
  }

  return tiles;
}

function buildHallTilesFromDoor(parentDoorTile, side, length, rng, pattern = "processional") {
  if (pattern === "organic" || (pattern === "organicHybrid" && rng.nextFloat() < 0.6)) {
    return buildOrganicHallTilesFromDoor(parentDoorTile, side, length, rng);
  }
  return buildStraightHallTilesFromDoor(parentDoorTile, side, length);
}

function getBranchChance(pattern, depth) {
  const base = depth <= 2 ? 0.74 : 0.56;
  if (pattern === "innerWalls") {
    return depth <= 2 ? 0.9 : 0.66;
  }
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

function getHallTileDirection(tiles, index) {
  const current = tiles[index];
  const previous = tiles[index - 1] || null;
  const next = tiles[index + 1] || null;
  const neighbor = next || previous;
  if (!current || !neighbor) {
    return null;
  }
  const dx = Math.sign(neighbor.x - current.x);
  const dy = Math.sign(neighbor.y - current.y);
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "east" : "west";
  }
  if (dy !== 0) {
    return dy >= 0 ? "south" : "north";
  }
  return null;
}

function canCarveHallBranchTile(state, x, y, pathKeys) {
  const tile = getTile(state, x, y);
  if (!tile || tile.type !== TILE_TYPES.WALL || pathKeys.has(`${x},${y}`)) {
    return false;
  }
  for (const side of RECT_GRAPH_SIDES) {
    const direction = RECT_GRAPH_DIRECTIONS[side];
    const neighbor = getTile(state, x + direction.x, y + direction.y);
    if (neighbor?.type === TILE_TYPES.FLOOR && !pathKeys.has(`${neighbor.x},${neighbor.y}`)) {
      return false;
    }
  }
  return true;
}

function findConnectingHallBranch(state, anchor, branchSide, minLength, maxLength, pathKeys) {
  const delta = RECT_GRAPH_DIRECTIONS[branchSide];
  let x = anchor.x;
  let y = anchor.y;
  const branchTiles = [];

  for (let step = 0; step < maxLength; step += 1) {
    x += delta.x;
    y += delta.y;
    const tile = getTile(state, x, y);
    const key = `${x},${y}`;
    if (!tile) {
      return null;
    }
    if (tile.type === TILE_TYPES.WALL) {
      if (!canCarveHallBranchTile(state, x, y, pathKeys)) {
        return null;
      }
      branchTiles.push({ x, y });
      continue;
    }
    if (
      tile.type === TILE_TYPES.FLOOR &&
      tile.roomId === null &&
      tile.hallId &&
      !pathKeys.has(key) &&
      branchTiles.length >= minLength
    ) {
      return branchTiles;
    }
    return null;
  }

  return null;
}

function getHallBranchChance(pattern) {
  if (pattern === "organic") return 0.72;
  if (pattern === "organicHybrid") return 0.52;
  if (pattern === "maze" || pattern === "web") return 0.46;
  if (pattern === "boring") return 0.12;
  return 0.28;
}

function addHallBranches(state, rng, pattern = "processional") {
  const chance = getHallBranchChance(pattern);
  for (const hall of state.halls || []) {
    const tiles = Array.isArray(hall.tiles) ? hall.tiles : [];
    if (hall.entrance || tiles.length < 4 || rng.nextFloat() > chance) {
      continue;
    }
    const orderedTiles = [...tiles];
    const pathKeys = new Set(orderedTiles.map((tile) => `${tile.x},${tile.y}`));
    const branchCount = pattern === "organic" && rng.nextFloat() < 0.35 ? 2 : 1;
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
      const anchorIndex = rng.nextInt(1, orderedTiles.length - 2);
      const anchor = orderedTiles[anchorIndex];
      const direction = getHallTileDirection(orderedTiles, anchorIndex);
      if (!anchor || !direction) {
        continue;
      }
      const sides = getPerpendicularSides(direction);
      const branchSides = rng.nextFloat() < 0.22 ? sides : [rng.pick(sides)];
      for (const branchSide of branchSides) {
        const branchTiles = findConnectingHallBranch(
          state,
          anchor,
          branchSide,
          1,
          pattern === "organic" ? 5 : 6,
          pathKeys
        );
        if (!branchTiles?.length) {
          continue;
        }
        for (const tile of branchTiles) {
          pathKeys.add(`${tile.x},${tile.y}`);
          carveHallTile(state, tile.x, tile.y, hall.id);
          hall.tiles.push({ ...tile, branch: true });
        }
      }
    }
  }
}

function coordKey(x, y) {
  return `${x},${y}`;
}

function parseCoordKey(key) {
  const [x, y] = String(key).split(",").map((value) => Number(value));
  return { x, y };
}

function isPointInOrganicBounds(state, x, y, margin = 2) {
  return x >= margin &&
    y >= margin &&
    x < state.map.width - margin &&
    y < state.map.height - margin;
}

function organicPointDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getOrganicDirectionStep(from, to, rng, straightRun = 0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const options = [];
  const directPenalty = straightRun >= 3 ? 1 : 0;
  if (dx !== 0) {
    options.push({ x: Math.sign(dx), y: 0, weight: Math.max(1, (Math.abs(dx) >= Math.abs(dy) ? 4 : 2) - directPenalty) });
  }
  if (dy !== 0) {
    options.push({ x: 0, y: Math.sign(dy), weight: Math.max(1, (Math.abs(dy) > Math.abs(dx) ? 4 : 2) - directPenalty) });
  }
  const lateralChance = straightRun >= 3 ? 0.72 : 0.48;
  if (rng.nextFloat() < lateralChance) {
    const lateral = Math.abs(dx) >= Math.abs(dy)
      ? [{ x: 0, y: -1 }, { x: 0, y: 1 }]
      : [{ x: -1, y: 0 }, { x: 1, y: 0 }];
    for (const option of lateral) {
      options.push({ ...option, weight: straightRun >= 3 ? 2 : 1 });
    }
  }
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = rng.nextInt(1, Math.max(1, total));
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) {
      return option;
    }
  }
  return options[0] || { x: 0, y: 0 };
}

function buildOrganicSnakePath(state, start, end, rng) {
  const path = [{ x: start.x, y: start.y }];
  const seen = new Set([coordKey(start.x, start.y)]);
  let current = { x: start.x, y: start.y };
  let stalls = 0;
  let lastStep = null;
  let straightRun = 0;
  const maxSteps = state.map.width + state.map.height + 40;
  while ((current.x !== end.x || current.y !== end.y) && path.length < maxSteps) {
    const beforeDistance = organicPointDistance(current, end);
    let step = getOrganicDirectionStep(current, end, rng, straightRun);
    let next = { x: current.x + step.x, y: current.y + step.y };
    if (
      !isPointInOrganicBounds(state, next.x, next.y, 1) ||
      (seen.has(coordKey(next.x, next.y)) && organicPointDistance(next, end) >= beforeDistance)
    ) {
      step = Math.abs(end.x - current.x) >= Math.abs(end.y - current.y)
        ? { x: Math.sign(end.x - current.x), y: 0 }
        : { x: 0, y: Math.sign(end.y - current.y) };
      next = { x: current.x + step.x, y: current.y + step.y };
    }
    if (!isPointInOrganicBounds(state, next.x, next.y, 1) || (next.x === current.x && next.y === current.y)) {
      break;
    }
    const nextKey = coordKey(next.x, next.y);
    if (seen.has(nextKey) && organicPointDistance(next, end) >= beforeDistance) {
      stalls += 1;
      if (stalls > 4) {
        break;
      }
      continue;
    }
    stalls = 0;
    seen.add(nextKey);
    path.push(next);
    if (lastStep && lastStep.x === step.x && lastStep.y === step.y) {
      straightRun += 1;
    } else {
      straightRun = 1;
    }
    lastStep = { ...step };
    current = next;
  }
  if (current.x !== end.x || current.y !== end.y) {
    while (current.x !== end.x && path.length < maxSteps + state.map.width) {
      current = { x: current.x + Math.sign(end.x - current.x), y: current.y };
      if (!isPointInOrganicBounds(state, current.x, current.y, 1)) {
        break;
      }
      path.push({ ...current });
    }
    while (current.y !== end.y && path.length < maxSteps + state.map.width + state.map.height) {
      current = { x: current.x, y: current.y + Math.sign(end.y - current.y) };
      if (!isPointInOrganicBounds(state, current.x, current.y, 1)) {
        break;
      }
      path.push({ ...current });
    }
  }
  return path;
}

function buildOrganicRoomBlobKeys(state, center, rng, targetSize) {
  const keys = new Set([coordKey(center.x, center.y)]);
  const points = [{ x: center.x, y: center.y }];
  let attempts = 0;
  while (keys.size < targetSize && attempts < targetSize * 18) {
    attempts += 1;
    const anchor = rng.pick(points);
    const direction = rng.pick(RECT_GRAPH_SIDES);
    const delta = RECT_GRAPH_DIRECTIONS[direction];
    const next = { x: anchor.x + delta.x, y: anchor.y + delta.y };
    if (!isPointInOrganicBounds(state, next.x, next.y, 2)) {
      continue;
    }
    const key = coordKey(next.x, next.y);
    if (keys.has(key)) {
      continue;
    }
    const distance = Math.max(Math.abs(next.x - center.x), Math.abs(next.y - center.y));
    const neighborCount = RECT_GRAPH_SIDES.reduce((count, side) => {
      const step = RECT_GRAPH_DIRECTIONS[side];
      return count + (keys.has(coordKey(next.x + step.x, next.y + step.y)) ? 1 : 0);
    }, 0);
    const acceptChance = neighborCount >= 2 ? 0.92 : Math.max(0.18, 0.78 - distance * 0.12);
    if (rng.nextFloat() > acceptChance) {
      continue;
    }
    keys.add(key);
    points.push(next);
  }

  const fillCandidates = [];
  for (const key of keys) {
    const point = parseCoordKey(key);
    for (const side of RECT_GRAPH_SIDES) {
      const step = RECT_GRAPH_DIRECTIONS[side];
      const next = { x: point.x + step.x, y: point.y + step.y };
      const nextKey = coordKey(next.x, next.y);
      if (!isPointInOrganicBounds(state, next.x, next.y, 2) || keys.has(nextKey)) {
        continue;
      }
      const neighborCount = RECT_GRAPH_SIDES.reduce((count, neighborSide) => {
        const neighborStep = RECT_GRAPH_DIRECTIONS[neighborSide];
        return count + (keys.has(coordKey(next.x + neighborStep.x, next.y + neighborStep.y)) ? 1 : 0);
      }, 0);
      if (neighborCount >= 3) {
        fillCandidates.push(nextKey);
      }
    }
  }
  for (const key of fillCandidates) {
    if (rng.nextFloat() < 0.82) {
      keys.add(key);
    }
  }
  return keys;
}

function getOrganicBoundingRect(keys) {
  const points = [...keys].map(parseCoordKey);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function carveOrganicRoomBlob(state, node, roomIndex, rng) {
  const targetSize = rng.nextInt(roomIndex > 5 ? 10 : 12, roomIndex > 5 ? 24 : 22);
  const keys = buildOrganicRoomBlobKeys(state, node, rng, targetSize);
  const rect = getOrganicBoundingRect(keys);
  const room = {
    id: `room-${roomIndex}`,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    discovered: false,
    explored: false,
    organic: true,
    renderer: "organic",
    cornerSize: 0,
    graphDepth: node.depth || 0,
    organicTileKeys: [...keys],
    center: { x: node.x, y: node.y }
  };
  state.rooms.push(room);
  for (const key of keys) {
    const point = parseCoordKey(key);
    setTileType(state, point.x, point.y, TILE_TYPES.FLOOR, { roomId: room.id, hallId: null });
    clearTileDecorMeta(getTile(state, point.x, point.y));
  }
  return room;
}

function createOrganicNodes(state, rng) {
  const count = rng.nextInt(ORGANIC_MIN_ROOMS, ORGANIC_MAX_ROOMS);
  const start = {
    x: rng.nextInt(5, 10),
    y: rng.nextInt(8, state.map.height - 9),
    depth: 0,
    parent: null
  };
  const nodes = [start];
  let attempts = 0;
  while (nodes.length < count && attempts < count * 60) {
    attempts += 1;
    const parent = rng.pick(nodes);
    const side = rng.pick(RECT_GRAPH_SIDES);
    const direction = RECT_GRAPH_DIRECTIONS[side];
    const driftSide = rng.pick(getPerpendicularSides(side));
    const drift = RECT_GRAPH_DIRECTIONS[driftSide];
    const distance = rng.nextInt(8, 14);
    const driftDistance = rng.nextInt(-4, 4);
    const candidate = {
      x: clamp(parent.x + direction.x * distance + drift.x * driftDistance, 4, state.map.width - 5),
      y: clamp(parent.y + direction.y * distance + drift.y * driftDistance, 4, state.map.height - 5),
      depth: (parent.depth || 0) + 1,
      parent
    };
    if (nodes.some((node) => organicPointDistance(node, candidate) < 7)) {
      continue;
    }
    nodes.push(candidate);
  }
  return nodes;
}

function buildOrganicGraphEdges(nodes, rng) {
  const edges = [];
  for (let index = 1; index < nodes.length; index += 1) {
    edges.push({ from: nodes[index].parent || nodes[0], to: nodes[index] });
  }
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 2; j < nodes.length; j += 1) {
      const distance = organicPointDistance(nodes[i], nodes[j]);
      if (distance >= 7 && distance <= 14 && rng.nextFloat() < 0.14) {
        edges.push({ from: nodes[i], to: nodes[j], loop: true });
      }
    }
  }
  return edges;
}

function getOrganicPathStep(path, index) {
  const previous = path[index - 1] || null;
  const current = path[index] || null;
  const next = path[index + 1] || null;
  if (!current) {
    return { x: 1, y: 0 };
  }
  if (next && (next.x !== current.x || next.y !== current.y)) {
    return { x: Math.sign(next.x - current.x), y: Math.sign(next.y - current.y) };
  }
  if (previous && (current.x !== previous.x || current.y !== previous.y)) {
    return { x: Math.sign(current.x - previous.x), y: Math.sign(current.y - previous.y) };
  }
  return { x: 1, y: 0 };
}

function getOrganicHallShoulders(path, index, rng) {
  const current = path[index];
  const step = getOrganicPathStep(path, index);
  const perpendiculars = step.x !== 0
    ? [{ x: 0, y: -1 }, { x: 0, y: 1 }]
    : [{ x: -1, y: 0 }, { x: 1, y: 0 }];
  const shoulders = [];
  const primary = rng.pick(perpendiculars);
  const secondary = perpendiculars.find((side) => side !== primary) || perpendiculars[0];
  if (rng.nextFloat() < 0.28) {
    shoulders.push({ x: current.x + primary.x, y: current.y + primary.y });
  }
  if (rng.nextFloat() < 0.12) {
    shoulders.push({ x: current.x + secondary.x, y: current.y + secondary.y });
  }

  const previousStep = index > 0 ? getOrganicPathStep(path, index - 1) : step;
  if ((previousStep.x !== step.x || previousStep.y !== step.y) && rng.nextFloat() < 0.38) {
    shoulders.push({
      x: current.x - previousStep.x + primary.x,
      y: current.y - previousStep.y + primary.y
    });
  }
  return shoulders;
}

function carveOrganicHallFloor(state, hallId, point, hallTiles, seen) {
  const tile = getTile(state, point.x, point.y);
  if (!tile || tile.roomId) {
    return;
  }
  if (tile.type === TILE_TYPES.WALL) {
    setTileType(state, point.x, point.y, TILE_TYPES.FLOOR, { hallId });
  } else if (tile.type === TILE_TYPES.FLOOR && !tile.hallId) {
    tile.hallId = hallId;
  }
  const carved = getTile(state, point.x, point.y);
  if (carved?.type !== TILE_TYPES.FLOOR || carved.roomId) {
    return;
  }
  carved.hallId = carved.hallId || hallId;
  clearTileDecorMeta(carved);
  const key = coordKey(point.x, point.y);
  if (!seen.has(key)) {
    seen.add(key);
    hallTiles.push({ x: point.x, y: point.y });
  }
}

function carveOrganicHall(state, edge, hallIndex, roomsByNode, rng) {
  const hallId = `hall-${hallIndex}`;
  const fromRoom = roomsByNode.get(edge.from);
  const toRoom = roomsByNode.get(edge.to);
  const path = buildOrganicSnakePath(state, edge.from, edge.to, rng);
  const hallTiles = [];
  const seen = new Set();
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index];
    carveOrganicHallFloor(state, hallId, point, hallTiles, seen);
    for (const shoulder of getOrganicHallShoulders(path, index, rng)) {
      if (!isPointInOrganicBounds(state, shoulder.x, shoulder.y, 1)) {
        continue;
      }
      carveOrganicHallFloor(state, hallId, shoulder, hallTiles, seen);
    }
  }
  const hall = {
    id: hallId,
    fromRoomId: fromRoom?.id || null,
    toRoomId: toRoom?.id || null,
    doors: [],
    tiles: hallTiles,
    style: "organic",
    organic: true
  };
  state.halls.push(hall);
  return hall;
}

function parseOrganicHallCellLabel(label, rows, cols) {
  const text = String(label || "").trim().toUpperCase();
  if (!text) {
    return null;
  }
  const centerX = Math.floor(cols / 2);
  const centerY = Math.floor(rows / 2);
  const cornerCells = {
    NW: { x: 0, y: 0 },
    NE: { x: cols - 1, y: 0 },
    SE: { x: cols - 1, y: rows - 1 },
    SW: { x: 0, y: rows - 1 }
  };
  if (cornerCells[text]) {
    return cornerCells[text];
  }
  if (text === "C") return { x: centerX, y: centerY };
  if (text === "N") return { x: centerX, y: 0 };
  if (text === "S") return { x: centerX, y: rows - 1 };
  if (text === "W") return { x: 0, y: centerY };
  if (text === "E") return { x: cols - 1, y: centerY };

  let match = text.match(/^N(\d+)$/);
  if (match) return { x: clamp(Number(match[1]) || 0, 0, cols - 1), y: 0 };
  match = text.match(/^S(\d+)$/);
  if (match) return { x: clamp(Number(match[1]) || 0, 0, cols - 1), y: rows - 1 };
  match = text.match(/^W(\d+)$/);
  if (match) return { x: 0, y: clamp(Number(match[1]) || 0, 0, rows - 1) };
  match = text.match(/^E(\d+)$/);
  if (match) return { x: cols - 1, y: clamp(Number(match[1]) || 0, 0, rows - 1) };
  match = text.match(/^NC(\d+)$/);
  if (match) return { x: centerX, y: clamp(Number(match[1]) || 0, 0, rows - 1) };
  match = text.match(/^SC(\d+)$/);
  if (match) return { x: centerX, y: clamp(rows - (Number(match[1]) || 0), 0, rows - 1) };
  return null;
}

function parseOrganicHallAsset(assetName) {
  const fileName = String(assetName || "").split(/[\\/]/).pop();
  const match = fileName.match(/^org-hall-(\d+)x(\d+)-(.+)\.png$/i);
  if (!match) {
    return null;
  }
  const rows = Number(match[1]) || 0;
  const cols = Number(match[2]) || 0;
  if (rows <= 0 || cols <= 0) {
    return null;
  }
  const tokens = match[3].split("-").filter(Boolean);
  const entIndex = tokens.findIndex((token) => token.toLowerCase() === "ent");
  const exitIndex = tokens.findIndex((token) => token.toLowerCase() === "exit");
  if (entIndex < 0 || exitIndex < 0 || entIndex + 1 >= tokens.length || exitIndex + 1 >= tokens.length) {
    return null;
  }
  const contIndex = tokens.findIndex((token) => token.toLowerCase() === "cont");
  const routeLabels = [
    tokens[entIndex + 1],
    ...(contIndex >= 0 && contIndex < exitIndex ? tokens.slice(contIndex + 1, exitIndex) : []),
    tokens[exitIndex + 1]
  ];
  const routeKeys = new Set();
  const routeCells = [];
  for (const label of routeLabels) {
    const point = parseOrganicHallCellLabel(label, rows, cols);
    if (!point) {
      continue;
    }
    const key = coordKey(point.x, point.y);
    if (routeKeys.has(key)) {
      continue;
    }
    routeKeys.add(key);
    routeCells.push(point);
  }
  if (routeCells.length < 2) {
    return null;
  }
  return {
    asset: fileName,
    widthTiles: cols,
    heightTiles: rows,
    routeCells,
    area: rows * cols
  };
}

function buildOrganicHallAssetCatalog(organicAssets = []) {
  return organicAssets
    .map(parseOrganicHallAsset)
    .filter(Boolean)
    .sort((a, b) => (b.area - a.area) || (b.routeCells.length - a.routeCells.length));
}

function isOrganicHallFootprintBlocked(state, hall, hallKeys, usedKeys, asset, x, y) {
  for (let dy = 0; dy < asset.heightTiles; dy += 1) {
    for (let dx = 0; dx < asset.widthTiles; dx += 1) {
      const tile = getTile(state, x + dx, y + dy);
      const key = coordKey(x + dx, y + dy);
      if (!tile || usedKeys.has(key) || tile.roomId) {
        return true;
      }
      const isRoute = asset.routeCells.some((cell) => cell.x === dx && cell.y === dy);
      if (isRoute && (!hallKeys.has(key) || tile.type !== TILE_TYPES.FLOOR || tile.hallId !== hall.id)) {
        return true;
      }
      if (isRoute && countOrganicCavePassableNeighbors(state, x + dx, y + dy) > 3) {
        return true;
      }
      if (!isRoute && tile.type === TILE_TYPES.FLOOR) {
        return true;
      }
    }
  }
  return false;
}

function findOrganicHallDecorCandidates(state, hall, hallKeys, usedKeys, asset) {
  const candidates = [];
  for (const tilePoint of hall.tiles || []) {
    for (const routeCell of asset.routeCells) {
      const x = tilePoint.x - routeCell.x;
      const y = tilePoint.y - routeCell.y;
      if (!isPointInOrganicBounds(state, x, y, 1) ||
          !isPointInOrganicBounds(state, x + asset.widthTiles - 1, y + asset.heightTiles - 1, 1)) {
        continue;
      }
      if (isOrganicHallFootprintBlocked(state, hall, hallKeys, usedKeys, asset, x, y)) {
        continue;
      }
      const routeMatches = asset.routeCells.reduce((count, cell) => (
        count + (hallKeys.has(coordKey(x + cell.x, y + cell.y)) ? 1 : 0)
      ), 0);
      candidates.push({
        x,
        y,
        score: routeMatches * 12 + asset.area
      });
    }
  }
  return candidates.sort((a, b) => (b.score - a.score) || (a.y - b.y) || (a.x - b.x));
}

function rememberOrganicHallDecorFootprint(usedKeys, placement) {
  for (let dy = 0; dy < placement.heightTiles; dy += 1) {
    for (let dx = 0; dx < placement.widthTiles; dx += 1) {
      usedKeys.add(coordKey(placement.x + dx, placement.y + dy));
    }
  }
}

function placeOrganicHallDecor(state, rng, organicAssets = []) {
  const assets = buildOrganicHallAssetCatalog(organicAssets);
  if (!assets.length) {
    return 0;
  }
  state.decor = state.decor || {};
  state.decor.organicHalls = [];
  const usedKeys = new Set();
  let placed = 0;
  for (const hall of state.halls || []) {
    if (hall?.organic !== true || !Array.isArray(hall.tiles) || hall.tiles.length < 4) {
      continue;
    }
    const hallKeys = new Set(hall.tiles.map((tile) => coordKey(tile.x, tile.y)));
    const targetCount = clamp(Math.floor(hall.tiles.length / 9), 1, 3);
    for (let count = 0; count < targetCount; count += 1) {
      let selected = null;
      for (const asset of assets) {
        const candidates = findOrganicHallDecorCandidates(state, hall, hallKeys, usedKeys, asset);
        if (candidates.length) {
          selected = {
            asset,
            candidate: rng.pick(candidates.slice(0, Math.min(6, candidates.length)))
          };
          break;
        }
      }
      if (!selected) {
        break;
      }
      const placement = {
        assetKey: selected.asset.asset,
        x: selected.candidate.x,
        y: selected.candidate.y,
        widthTiles: selected.asset.widthTiles,
        heightTiles: selected.asset.heightTiles,
        hallId: hall.id,
        organicHall: true
      };
      state.decor.organicHalls.push(placement);
      rememberOrganicHallDecorFootprint(usedKeys, placement);
      placed += 1;
    }
  }
  return placed;
}

function isOrganicCavePassableTile(tile) {
  return tile?.type === TILE_TYPES.FLOOR &&
    !isOrganicMovementBlockingTile(tile) &&
    !isInnerWallBlockingTile(tile) &&
    !isAngledWallMovementBlockingTile(tile);
}

function countOrganicCavePassableNeighbors(state, x, y) {
  return RECT_GRAPH_SIDES.reduce((count, side) => {
    const { dx, dy } = getOrganicNeighborDelta(side);
    return count + (isOrganicCavePassableTile(getTile(state, x + dx, y + dy)) ? 1 : 0);
  }, 0);
}

function roughenOrganicCaveFootprint(state, rng) {
  for (let sweep = 0; sweep < 2; sweep += 1) {
    const additions = [];
    for (const tile of state.tiles || []) {
      if (!isOrganicCavePassableTile(tile)) {
        continue;
      }
      const passableNeighbors = countOrganicCavePassableNeighbors(state, tile.x, tile.y);
      if (passableNeighbors >= 4) {
        continue;
      }
      const openSides = RECT_GRAPH_SIDES.filter((side) => {
        const { dx, dy } = getOrganicNeighborDelta(side);
        const neighbor = getTile(state, tile.x + dx, tile.y + dy);
        return neighbor?.type === TILE_TYPES.WALL && isPointInOrganicBounds(state, neighbor.x, neighbor.y, 1);
      });
      if (!openSides.length) {
        continue;
      }
      const chance = sweep === 0 ? 0.34 : 0.18;
      if (rng.nextFloat() > chance) {
        continue;
      }
      const side = rng.pick(openSides);
      const { dx, dy } = getOrganicNeighborDelta(side);
      const target = getTile(state, tile.x + dx, tile.y + dy);
      if (!target || countOrganicCavePassableNeighbors(state, target.x, target.y) > 2) {
        continue;
      }
      additions.push({
        x: target.x,
        y: target.y,
        roomId: tile.roomId || null,
        hallId: tile.hallId || null
      });
    }
    for (const addition of additions) {
      const tile = getTile(state, addition.x, addition.y);
      if (!tile || tile.type !== TILE_TYPES.WALL) {
        continue;
      }
      setTileType(state, addition.x, addition.y, TILE_TYPES.FLOOR, {
        roomId: addition.roomId,
        hallId: addition.hallId
      });
      clearTileDecorMeta(tile);
    }
  }
}

function sideFromDelta(dx, dy) {
  if (dx === 0 && dy === -1) return "north";
  if (dx === 1 && dy === 0) return "east";
  if (dx === 0 && dy === 1) return "south";
  if (dx === -1 && dy === 0) return "west";
  return null;
}

function collectOrganicDoorCandidates(state, room, hall) {
  const candidates = [];
  for (const point of hall.tiles || []) {
    const hallTile = getTile(state, point.x, point.y);
    if (!hallTile || hallTile.type !== TILE_TYPES.FLOOR || hallTile.roomId) {
      continue;
    }
    for (const side of RECT_GRAPH_SIDES) {
      const direction = RECT_GRAPH_DIRECTIONS[side];
      const roomTile = getTile(state, point.x - direction.x, point.y - direction.y);
      if (roomTile?.type !== TILE_TYPES.FLOOR || roomTile.roomId !== room.id) {
        continue;
      }
      candidates.push({
        hallTile,
        roomTile,
        side
      });
    }
  }
  return candidates.filter((candidate) => isOrganicDoorCandidate(state, room, hall, candidate));
}

function isOrganicDoorCandidate(state, room, hall, candidate) {
  if (!candidate?.hallTile || !candidate?.roomTile || !candidate?.side) {
    return false;
  }
  const outward = RECT_GRAPH_DIRECTIONS[candidate.side];
  const nextHallTile = getTile(state, candidate.hallTile.x + outward.x, candidate.hallTile.y + outward.y);
  if (!nextHallTile || nextHallTile.type !== TILE_TYPES.FLOOR || nextHallTile.hallId !== hall.id || nextHallTile.roomId === room.id) {
    return false;
  }

  let adjacentRoomCount = 0;
  for (const side of RECT_GRAPH_SIDES) {
    const delta = RECT_GRAPH_DIRECTIONS[side];
    const neighbor = getTile(state, candidate.hallTile.x + delta.x, candidate.hallTile.y + delta.y);
    if (neighbor?.type === TILE_TYPES.FLOOR && neighbor.roomId === room.id) {
      adjacentRoomCount += 1;
      if (!(neighbor.x === candidate.roomTile.x && neighbor.y === candidate.roomTile.y)) {
        return false;
      }
    }
  }

  return adjacentRoomCount === 1;
}

function addOrganicDoorAtCandidate(state, rng, room, hall, candidate) {
  if (!candidate || state.entities.some((entity) => entity.subtype === "door" && entity.x === candidate.hallTile.x && entity.y === candidate.hallTile.y)) {
    return null;
  }
  const side = sideFromDelta(
    candidate.hallTile.x - candidate.roomTile.x,
    candidate.hallTile.y - candidate.roomTile.y
  ) || candidate.side;
  const meta = getDoorMetaForSide(side);
  const door = addDoorEntity(
    state,
    candidate.hallTile.x,
    candidate.hallTile.y,
    room.id,
    hall.id,
    rng,
    meta.orientation,
    meta.wallSide,
    meta.hallDirection,
    meta.hingeSide,
    meta.swingTarget,
    meta.turnDirection
  );
  door.organic = true;
  door.doorState = rng.nextFloat() < 0.82 ? DOOR_STATES.CLOSED : DOOR_STATES.OPEN;
  hall.doors = Array.from(new Set([...(hall.doors || []), door.id]));
  return door;
}

function addRareOrganicDoors(state, rng) {
  for (const hall of state.halls || []) {
    if (hall.organic !== true) {
      continue;
    }
    for (const roomId of [hall.fromRoomId, hall.toRoomId]) {
      if (!roomId || rng.nextFloat() > ORGANIC_DOOR_CHANCE) {
        continue;
      }
      const room = state.rooms.find((candidate) => candidate.id === roomId);
      const candidates = room ? collectOrganicDoorCandidates(state, room, hall) : [];
      if (!candidates.length) {
        continue;
      }
      addOrganicDoorAtCandidate(state, rng, room, hall, rng.pick(candidates));
    }
  }
}

function getOrganicCaveProtectedKeys(state) {
  const keys = new Set();
  if (Number.isFinite(Number(state.player?.x)) && Number.isFinite(Number(state.player?.y))) {
    keys.add(coordKey(Number(state.player.x), Number(state.player.y)));
  }
  for (const room of state.rooms || []) {
    const center = room.center || getRoomCenter(room);
    keys.add(coordKey(center.x, center.y));
  }
  for (const entity of state.entities || []) {
    if (Number.isFinite(Number(entity?.x)) && Number.isFinite(Number(entity?.y))) {
      keys.add(coordKey(Number(entity.x), Number(entity.y)));
    }
  }
  return keys;
}

function getOrganicTileKind(tile) {
  return tile?.meta?.organic?.kind || parseOrganicKind(tile?.meta?.organic?.asset);
}

function clearOrganicNonBlockMeta(state) {
  for (const tile of state.tiles || []) {
    if (getOrganicTileKind(tile) !== "blocks") {
      clearOrganicTileMeta(tile);
    }
  }
}

function countOrganicTileKinds(state) {
  const counts = { blocks: 0, free: 0, total: 0 };
  for (const tile of state.tiles || []) {
    const kind = getOrganicTileKind(tile);
    if (kind !== "blocks" && kind !== "free") {
      continue;
    }
    counts.total += 1;
    if (kind === "blocks") {
      counts.blocks += 1;
    } else {
      counts.free += 1;
    }
  }
  return counts;
}

function organicPassableNeighborCount(state, tile) {
  return RECT_GRAPH_SIDES.reduce((count, side) => {
    const { dx, dy } = getOrganicNeighborDelta(side);
    return count + (isGeneratedPassableTile(getTile(state, tile.x + dx, tile.y + dy)) ? 1 : 0);
  }, 0);
}

function validateOrganicPassableConnectivity(state) {
  const passable = (state.tiles || []).filter((tile) => isGeneratedPassableTile(tile));
  if (passable.length <= 1) {
    return true;
  }
  const playerTile = getTile(state, state.player?.x, state.player?.y);
  const start = isGeneratedPassableTile(playerTile) ? playerTile : passable[0];
  const byKey = new Map(passable.map((tile) => [coordKey(tile.x, tile.y), tile]));
  const visited = new Set([coordKey(start.x, start.y)]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    for (const side of RECT_GRAPH_SIDES) {
      const { dx, dy } = getOrganicNeighborDelta(side);
      const neighbor = byKey.get(coordKey(current.x + dx, current.y + dy));
      if (!neighbor || visited.has(coordKey(neighbor.x, neighbor.y))) {
        continue;
      }
      if (!canCrossOrganicEdge(current, neighbor, dx, dy)) {
        continue;
      }
      visited.add(coordKey(neighbor.x, neighbor.y));
      queue.push(neighbor);
    }
  }
  return visited.size === passable.length;
}

function countOrganicCaveFreeArtCandidates(state, catalog, protectedKeys) {
  let count = 0;
  for (const tile of state.tiles || []) {
    if (tile?.type !== TILE_TYPES.FLOOR || isOrganicMovementBlockingTile(tile)) {
      continue;
    }
    const sides = getOrganicCaveFreeTileSides(state, tile);
    if (!organicTileNeedsEdgeArt(state, tile, sides) || isAllOrganicSides(sides, "o")) {
      continue;
    }
    if ((catalog.freeBySides.get(organicSidesKey(sides)) || []).length) {
      count += 1;
    }
  }
  return count;
}

function collectOrganicCaveBlockCandidates(state, protectedKeys, failedKeys) {
  const candidates = [];
  for (const tile of state.tiles || []) {
    const key = coordKey(tile?.x, tile?.y);
    if (
      tile?.type !== TILE_TYPES.FLOOR ||
      protectedKeys.has(key) ||
      failedKeys.has(key) ||
      isOrganicMovementBlockingTile(tile) ||
      isInnerWallBlockingTile(tile) ||
      isAngledWallMovementBlockingTile(tile) ||
      isFloorOccupied(state, tile.x, tile.y)
    ) {
      continue;
    }
    const neighborCount = organicPassableNeighborCount(state, tile);
    if (neighborCount < 3) {
      continue;
    }
    const sides = getOrganicRoomTileSides(state, tile);
    if (isAllOrganicSides(sides, "o")) {
      continue;
    }
    const closedCount = RECT_GRAPH_SIDES.filter((side) => sides[side] === "o").length;
    const diagonalScore = organicTileTouchesDiagonalBoundary(state, tile) ? 2 : 0;
    const hallScore = tile.hallId ? 3 : 0;
    const roomScore = tile.roomId ? 2 : 0;
    candidates.push({
      tile,
      sides,
      score: closedCount * 6 + neighborCount + diagonalScore + hallScore + roomScore
    });
  }
  candidates.sort((a, b) => (
    (b.score - a.score) ||
    (a.tile.y - b.tile.y) ||
    (a.tile.x - b.tile.x)
  ));
  return candidates;
}

function placeOrganicCaveBlocks(state, rng, catalog, protectedKeys, targetBlocks) {
  const failedKeys = new Set();
  let counts = countOrganicTileKinds(state);
  let attempts = 0;
  const maxAttempts = Math.max(60, targetBlocks * 36);
  while (counts.blocks < targetBlocks && attempts < maxAttempts) {
    attempts += 1;
    const candidates = collectOrganicCaveBlockCandidates(state, protectedKeys, failedKeys);
    if (!candidates.length) {
      break;
    }
    const shortlist = candidates.slice(0, Math.min(candidates.length, 28));
    const candidate = rng.pick(shortlist);
    const key = coordKey(candidate.tile.x, candidate.tile.y);
    const placement = pickOrganicPlacement(catalog, "blocks", candidate.sides, rng, {
      state,
      tile: candidate.tile,
      closeDiagonalCorners: true
    });
    if (!placement) {
      failedKeys.add(key);
      continue;
    }
    const changes = new Map();
    rememberOrganicTileChange(changes, candidate.tile);
    setOrganicTileMeta(candidate.tile, placement.asset, placement);
    if (!validateOrganicPassableConnectivity(state)) {
      restoreOrganicTileChanges(changes);
      failedKeys.add(key);
      continue;
    }
    counts = countOrganicTileKinds(state);
  }
  return counts.blocks;
}

function applyOrganicCaveFreeArt(state, rng, catalog, protectedKeys) {
  let placed = 0;
  for (const tile of state.tiles || []) {
    if (tile?.type !== TILE_TYPES.FLOOR || isOrganicMovementBlockingTile(tile)) {
      continue;
    }
    const sides = getOrganicCaveFreeTileSides(state, tile);
    if (!organicTileNeedsEdgeArt(state, tile, sides) || isAllOrganicSides(sides, "o")) {
      continue;
    }
    const placement = pickOrganicPlacement(catalog, "free", sides, rng, {
      state,
      tile,
      closeDiagonalCorners: true
    });
    if (!placement) {
      continue;
    }
    setOrganicTileMeta(tile, placement.asset, placement);
    placed += 1;
  }
  return placed;
}

function getOrganicBasePassableKeys(state) {
  const keys = new Set();
  for (const tile of state.tiles || []) {
    if (isGeneratedPassableTile(tile)) {
      keys.add(coordKey(tile.x, tile.y));
    }
  }
  return keys;
}

function getOrganicShellBlockSides(tile, passableKeys) {
  const sides = {};
  for (const side of RECT_GRAPH_SIDES) {
    const { dx, dy } = getOrganicNeighborDelta(side);
    sides[side] = passableKeys.has(coordKey(tile.x + dx, tile.y + dy)) ? "x" : "o";
  }
  return sides;
}

function getOrganicShellBlockCorners(tile, passableKeys) {
  const corners = {};
  for (const corner of ["nw", "ne", "se", "sw"]) {
    const touchesPassable = getOrganicCornerNeighborDeltas(corner).some(({ dx, dy }) => (
      passableKeys.has(coordKey(tile.x + dx, tile.y + dy))
    ));
    corners[corner] = touchesPassable ? "x" : "o";
  }
  return corners;
}

function collectOrganicShellBlockTiles(state, passableKeys) {
  const candidates = new Map();
  for (const key of passableKeys) {
    const point = parseCoordKey(key);
    for (const side of RECT_GRAPH_SIDES) {
      const { dx, dy } = getOrganicNeighborDelta(side);
      const tile = getTile(state, point.x + dx, point.y + dy);
      if (!tile || tile.type !== TILE_TYPES.WALL) {
        continue;
      }
      candidates.set(coordKey(tile.x, tile.y), tile);
    }
  }
  return [...candidates.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

function placeOrganicShellBlocks(state, rng, catalog, passableKeys) {
  let placed = 0;
  const shellTiles = collectOrganicShellBlockTiles(state, passableKeys);
  for (const tile of shellTiles) {
    const sides = getOrganicShellBlockSides(tile, passableKeys);
    const corners = getOrganicShellBlockCorners(tile, passableKeys);
    const placement = pickOrganicPlacement(catalog, "blocks", sides, rng, { corners });
    if (!placement) {
      continue;
    }
    setTileType(state, tile.x, tile.y, TILE_TYPES.FLOOR, {
      roomId: null,
      hallId: null
    });
    clearTileDecorMeta(tile);
    setOrganicTileMeta(tile, placement.asset, placement);
    tile.meta.organicShell = true;
    placed += 1;
  }
  return placed;
}

function applyOrganicCaveTileArt(state, rng, organicAssets = []) {
  const catalog = buildOrganicAssetCatalog(organicAssets);
  if (!catalog.available) {
    return;
  }
  const protectedKeys = getOrganicCaveProtectedKeys(state);
  for (const tile of state.tiles || []) {
    clearOrganicTileMeta(tile);
  }
  const passableKeys = getOrganicBasePassableKeys(state);
  placeOrganicShellBlocks(state, rng, catalog, passableKeys);
  applyOrganicCaveFreeArt(state, rng, catalog, protectedKeys);
}

function createOrganicEntranceMarker(state, room, rng) {
  const candidates = (room.organicTileKeys || [])
    .map(parseCoordKey)
    .filter((point) => organicPointDistance(point, room.center || point) <= 2);
  const point = candidates.length ? rng.pick(candidates) : (room.center || getRoomCenter(room));
  const stairs = createDoorEntity(
    point.x,
    point.y,
    room.id,
    null,
    rng,
    "horizontal",
    "south",
    "south",
    "west",
    "room",
    1
  );
  Object.assign(stairs, {
    id: "stairs-up-organic",
    doorKind: "stairs-up",
    watabouDoorType: 3,
    doorState: DOOR_STATES.OPEN,
    highestStep: "south",
    organic: true
  });
  state.entities.push(stairs);
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
    const hallLength = pattern === "innerWalls"
      ? rng.nextInt(2, 4)
      : pattern === "maze"
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
    const hallTiles = buildHallTilesFromDoor(parentDoorTile, side, hallLength, rng, pattern);
    const bentHall = !(hallTiles.every((tile) => tile.x === hallTiles[0].x) || hallTiles.every((tile) => tile.y === hallTiles[0].y));
    if (!areHallTilesClear(state, hallTiles, { allowBent: bentHall, parentRoomId: room.id })) {
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
      cornerSize: size.rotunda === true || pattern === "organic" ? 0 : pickRoomCornerSize(rng, size.width, size.height, depth),
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
    if (candidate.rotunda === true || hallTiles.length > 4 || rng.nextFloat() < 0.82) {
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
      !isOrganicMovementBlockingTile(tile) &&
      !isInnerWallBlockingTile(tile) &&
      !isAngledWallMovementBlockingTile(tile) &&
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
    room.hasCanal !== true &&
    room.width >= 5 &&
    room.height >= 5 &&
    !room.rotunda &&
    !String(room.theme || "").includes("organic")
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
        const tile = getTile(state, x, y);
        if (
          !tile ||
          isOrganicMovementBlockingTile(tile) ||
          isInnerWallBlockingTile(tile) ||
          isAngledWallMovementBlockingTile(tile) ||
          isFloorOccupied(state, x, y)
        ) {
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
    if (isFloorOccupied(state, tile.x, tile.y)) {
      return;
    }
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

function isPlainRoomFloor(state, room, x, y) {
  const tile = getTile(state, x, y);
  return tile?.type === TILE_TYPES.FLOOR &&
    tile.roomId === room.id &&
    isRoomFloorTile(room, x, y) &&
    !isOrganicMovementBlockingTile(tile) &&
    !isInnerWallBlockingTile(tile) &&
    !isAngledWallMovementBlockingTile(tile) &&
    !isFloorOccupied(state, x, y);
}

function addPlacedDecor(list, placement) {
  list.push({
    rotationTurns: 0,
    flipX: false,
    flipY: false,
    blocksMovement: false,
    ...placement
  });
}

function configureSecretDoor(door, rng, options = {}) {
  door.doorKind = "secret";
  door.secret = true;
  door.secretFound = door.secretFound === true;
  door.revealed = door.secretFound === true;
  door.visible = door.secretFound === true;
  const minSearchDc = Math.max(1, Number(options.minSearchDc || 0) || 10);
  door.searchDc = Math.max(minSearchDc, Number(door.searchDc || 0) || rng.nextInt(minSearchDc, 16));
  if (!/^door-secret-\d+$/i.test(String(door.doorSpriteId || ""))) {
    door.doorSpriteId = `door-secret-${rng.nextInt(1, 3)}`;
  }
}

function getRoomDoors(state, room) {
  return (state.entities || []).filter((door) => (
    door.subtype === "door" &&
    door.roomId === room.id &&
    door.organic !== true &&
    door.roomId &&
    door.hallId &&
    !door.portcullis
  ));
}

function configureSecretTreasureRooms(state, rng, pattern = "processional") {
  if (pattern === "organic") {
    return;
  }
  const candidates = (state.rooms || [])
    .filter((room) => (
      room.id !== state.generation.entranceRoomId &&
      room.bossRoom !== true &&
      room.rotunda !== true &&
      !String(room.theme || "").includes("organic") &&
      getRoomDoors(state, room).length > 0
    ))
    .map((room) => ({
      room,
      doors: getRoomDoors(state, room),
      area: Math.max(1, Number(room.width || 1) * Number(room.height || 1)),
      distance: tileDistanceFromStart(state, getRoomCenter(room).x, getRoomCenter(room).y)
    }))
    .sort((a, b) => (
      (a.room.role === ROOM_ROLES.VAULT ? -30 : 0) -
      (b.room.role === ROOM_ROLES.VAULT ? -30 : 0) ||
      a.doors.length - b.doors.length ||
      a.area - b.area ||
      b.distance - a.distance
    ));
  if (!candidates.length) {
    return;
  }
  const targetCount = Math.min(candidates.length, rng.nextInt(1, SECRET_TREASURE_ROOM_MAX));
  state.generation.secretTreasureRooms = [];
  for (const entry of candidates.slice(0, targetCount)) {
    const door = entry.doors.find((candidate) => candidate.doorState !== DOOR_STATES.OPEN) || entry.doors[0];
    configureSecretDoor(door, rng, { minSearchDc: 12 });
    entry.room.secretTreasureRoom = true;
    entry.room.role = ROOM_ROLES.VAULT;
    entry.room.danger = "secretTreasure";
    state.generation.secretTreasureRooms.push(entry.room.id);
  }
}

function addBuiltSecretDoors(state, rng, pattern = "processional") {
  if (pattern === "organic") {
    return;
  }
  const candidates = (state.entities || []).filter((door) => (
    door.subtype === "door" &&
    door.organic !== true &&
    door.doorState !== DOOR_STATES.OPEN &&
    door.roomId &&
    door.hallId &&
    !door.portcullis
  ));
  if (!candidates.length) {
    return;
  }
  let count = 0;
  for (const door of [...candidates].sort(() => rng.nextFloat() - 0.5)) {
    if (door.secret === true) {
      configureSecretDoor(door, rng);
      count += 1;
      continue;
    }
    if (count >= SECRET_DOOR_MAX_PER_DUNGEON) {
      break;
    }
    if (rng.nextFloat() > SECRET_DOOR_CHANCE) {
      continue;
    }
    configureSecretDoor(door, rng);
    count += 1;
  }
}

function plannedDecorCoversTile(planned, x, y) {
  return planned.some((placement) => decorPlacementCoversTile(placement, x, y));
}

function canPlacePlannedDecorFootprint(state, room, planned, x, y, width, height) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      const tile = getTile(state, xx, yy);
      if (
        tile?.type !== TILE_TYPES.FLOOR ||
        tile.roomId !== room.id ||
        !isRoomFloorTile(room, xx, yy) ||
        isOrganicMovementBlockingTile(tile) ||
        isInnerWallBlockingTile(tile) ||
        isAngledWallMovementBlockingTile(tile) ||
        isFloorOccupied(state, xx, yy) ||
        plannedDecorCoversTile(planned, xx, yy)
      ) {
        return false;
      }
    }
  }
  return true;
}

function addPlannedCanalDecor(state, room, planned, placement) {
  const width = Math.max(1, Math.round(Number(placement.widthTiles) || 1));
  const height = Math.max(1, Math.round(Number(placement.heightTiles) || 1));
  if (!canPlacePlannedDecorFootprint(state, room, planned, placement.x, placement.y, width, height)) {
    return false;
  }
  planned.push({
    rotationTurns: 0,
    flipX: false,
    flipY: false,
    blocksMovement: false,
    ...placement,
    widthTiles: width,
    heightTiles: height
  });
  return true;
}

function getCanalBankPlacement(rng, orientation, edge) {
  const assetKey = rng.pick(CANAL_BANK_EDGE_KEYS);
  const placement = {
    assetKey,
    widthTiles: 1,
    heightTiles: 1,
    blocksMovement: CANAL_IMPASSABLE_KEYS.has(assetKey)
  };
  if (orientation === "vertical") {
    placement.rotationTurns = edge === "west" ? 3 : 1;
    return placement;
  }
  placement.flipY = edge === "south";
  placement.flipX = rng.nextFloat() < 0.5;
  return placement;
}

function getCanalBridgeBankPlacement(rng, orientation, edge) {
  const assetKey = rng.pick(CANAL_BRIDGE_BANK_KEYS);
  const placement = {
    assetKey,
    widthTiles: 1,
    heightTiles: 1,
    blocksMovement: CANAL_IMPASSABLE_KEYS.has(assetKey)
  };
  if (orientation === "vertical") {
    placement.flipY = edge === "south";
    return placement;
  }
  placement.rotationTurns = edge === "west" ? 3 : 1;
  return placement;
}

function getCanalBridgeCornerPlacement(rng, orientation, edge) {
  const assetKey = rng.pick(CANAL_BRIDGE_CORNER_KEYS);
  const placement = {
    assetKey,
    widthTiles: 1,
    heightTiles: 1,
    blocksMovement: CANAL_IMPASSABLE_KEYS.has(assetKey)
  };
  if (orientation === "vertical") {
    placement.rotationTurns = edge === "west" ? 3 : 1;
    return placement;
  }
  placement.flipY = edge === "south";
  return placement;
}

function addCanalTile(state, room, planned, rng, x, y, placement) {
  const next = {
    x,
    y,
    ...placement
  };
  if (next.blocksMovement) {
    next.blocks = [{ x, y }];
  }
  return addPlannedCanalDecor(state, room, planned, next);
}

function addCanalBridgeApproachRows(state, room, planned, rng, orientation, bridgeStart, canalStart, canalEnd) {
  const roomEndX = room.x + room.width - 1;
  const roomEndY = room.y + room.height - 1;
  const approachBefore = bridgeStart - 1;
  const approachAfter = bridgeStart + 4;
  if (orientation === "vertical") {
    for (const y of [approachBefore, approachAfter]) {
      if (y < room.y || y > roomEndY) {
        continue;
      }
      for (let x = room.x; x <= roomEndX; x += 1) {
        if (x > canalStart && x < canalEnd) {
          continue;
        }
        const placement = x === canalStart || x === canalEnd
          ? getCanalBridgeCornerPlacement(rng, orientation, x === canalStart ? "west" : "east")
          : getCanalBridgeBankPlacement(rng, orientation, y === approachBefore ? "north" : "south");
        if (!addCanalTile(state, room, planned, rng, x, y, placement)) {
          return false;
        }
      }
    }
    return true;
  }

  for (const x of [approachBefore, approachAfter]) {
    if (x < room.x || x > roomEndX) {
      continue;
    }
    for (let y = room.y; y <= roomEndY; y += 1) {
      if (y > canalStart && y < canalEnd) {
        continue;
      }
      const placement = y === canalStart || y === canalEnd
        ? getCanalBridgeCornerPlacement(rng, orientation, y === canalStart ? "north" : "south")
        : getCanalBridgeBankPlacement(rng, orientation, x === approachBefore ? "west" : "east");
      if (!addCanalTile(state, room, planned, rng, x, y, placement)) {
        return false;
      }
    }
  }
  return true;
}

function tryAddStraightCanalRoom(state, rng, room, orientation) {
  const before = state.decor.canals.length;
  const bridgeSize = 4;
  const planned = [];
  const canalThickness = 4;
  const centerX = Math.floor(room.x + room.width / 2);
  const centerY = Math.floor(room.y + room.height / 2);
  let placed = true;

  if (orientation === "vertical") {
    const canalLeft = clamp(
      centerX - Math.floor(canalThickness / 2),
      room.x + 2,
      room.x + room.width - canalThickness - 2
    );
    const canalRight = canalLeft + canalThickness - 1;
    const bridgeY = clamp(
      centerY - Math.floor(bridgeSize / 2),
      room.y,
      room.y + room.height - bridgeSize
    );
    const bridgeLaneCovers = (x, y) => (
      x >= room.x &&
      x < room.x + room.width &&
      y >= bridgeY &&
      y < bridgeY + bridgeSize
    );

    for (let x = room.x; x < room.x + room.width; x += bridgeSize) {
      placed = addPlannedCanalDecor(state, room, planned, {
        x,
        y: bridgeY,
        assetKey: CANAL_BRIDGE_KEY,
        widthTiles: bridgeSize,
        heightTiles: bridgeSize,
        rotationTurns: 1,
        flipX: rng.nextFloat() < 0.5,
        flipY: rng.nextFloat() < 0.5
      }) && placed;
    }
    placed = addCanalBridgeApproachRows(state, room, planned, rng, orientation, bridgeY, canalLeft, canalRight) && placed;

    for (let x = canalLeft; x <= canalRight; x += 1) {
      for (let y = room.y; y < room.y + room.height; y += 1) {
        if (bridgeLaneCovers(x, y)) {
          continue;
        }
        if (plannedDecorCoversTile(planned, x, y)) {
          continue;
        }
        if (x === canalLeft || x === canalRight) {
          const nearBridge = y === bridgeY - 1 || y === bridgeY + bridgeSize;
          placed = addCanalTile(
            state,
            room,
            planned,
            rng,
            x,
            y,
            nearBridge
              ? getCanalBridgeCornerPlacement(rng, orientation, x === canalLeft ? "west" : "east")
              : getCanalBankPlacement(rng, orientation, x === canalLeft ? "west" : "east")
          ) && placed;
          continue;
        }
        placed = addCanalTile(state, room, planned, rng, x, y, {
          assetKey: CANAL_CENTER_KEY,
          widthTiles: 1,
          heightTiles: 1,
          blocksMovement: true
        }) && placed;
      }
    }
  } else {
    const canalLeft = room.x;
    const canalRight = room.x + room.width - 1;
    const canalTop = clamp(
      centerY - Math.floor(canalThickness / 2),
      room.y + 2,
      room.y + room.height - canalThickness - 2
    );
    const bridgeX = clamp(
      centerX - Math.floor(bridgeSize / 2),
      room.x,
      room.x + room.width - bridgeSize
    );
    const bridgeLaneCovers = (x, y) => (
      x >= bridgeX &&
      x < bridgeX + bridgeSize &&
      y >= room.y &&
      y < room.y + room.height
    );

    for (let y = room.y; y < room.y + room.height; y += bridgeSize) {
      placed = addPlannedCanalDecor(state, room, planned, {
        x: bridgeX,
        y,
        assetKey: CANAL_BRIDGE_KEY,
        widthTiles: bridgeSize,
        heightTiles: bridgeSize,
        rotationTurns: 0,
        flipX: rng.nextFloat() < 0.5,
        flipY: rng.nextFloat() < 0.5
      }) && placed;
    }
    placed = addCanalBridgeApproachRows(state, room, planned, rng, orientation, bridgeX, canalTop, canalTop + canalThickness - 1) && placed;

    for (let y = canalTop; y < canalTop + canalThickness; y += 1) {
      for (let x = canalLeft; x <= canalRight; x += 1) {
        if (bridgeLaneCovers(x, y)) {
          continue;
        }
        if (plannedDecorCoversTile(planned, x, y)) {
          continue;
        }
        if (y === canalTop || y === canalTop + canalThickness - 1) {
          const nearBridge = x === bridgeX - 1 || x === bridgeX + bridgeSize;
          placed = addCanalTile(
            state,
            room,
            planned,
            rng,
            x,
            y,
            nearBridge
              ? getCanalBridgeCornerPlacement(rng, orientation, y === canalTop ? "north" : "south")
              : getCanalBankPlacement(rng, orientation, y === canalTop ? "north" : "south")
          ) && placed;
          continue;
        }
        placed = addCanalTile(state, room, planned, rng, x, y, {
          assetKey: CANAL_CENTER_KEY,
          widthTiles: 1,
          heightTiles: 1,
          blocksMovement: true
        }) && placed;
      }
    }
  }

  if (!placed) {
    return false;
  }
  for (const placement of planned) {
    addPlacedDecor(state.decor.canals, placement);
  }
  if (!validateTileConnectivity(state)) {
    state.decor.canals.splice(before);
    return false;
  }
  room.hasCanal = true;
  room.canalOrientation = orientation;
  return true;
}

function addRectGraphCanals(state, rng) {
  ensureDecorCollections(state);
  state.decor.canals = [];
  const candidates = state.rooms.filter((room) => (
    room.id !== state.generation.entranceRoomId &&
    room.rotunda !== true &&
    (
      (room.width >= 10 && room.height >= 12 && room.height % 4 === 0) ||
      (room.width >= 12 && room.height >= 10 && room.width % 4 === 0)
    ) &&
    !String(room.theme || "").includes("organic")
  ));
  if (!candidates.length) {
    return;
  }
  const canalRoomCount = Math.min(candidates.length, rng.nextFloat() < 0.72 ? 1 : 2);
  const shuffled = [...candidates].sort(() => rng.nextFloat() - 0.5);

  let placedCanalRooms = 0;
  for (const room of shuffled) {
    if (placedCanalRooms >= canalRoomCount) {
      break;
    }
    const orientations = [];
    if (room.width >= 10 && room.height >= 12 && room.height % 4 === 0) {
      orientations.push("horizontal");
    }
    if (room.width >= 12 && room.height >= 10 && room.width % 4 === 0) {
      orientations.push("vertical");
    }
    for (const orientation of [...orientations].sort(() => rng.nextFloat() - 0.5)) {
      if (tryAddStraightCanalRoom(state, rng, room, orientation)) {
        placedCanalRooms += 1;
        break;
      }
    }
  }
}

function addRotundaWells(state, rng) {
  ensureDecorCollections(state);
  state.decor.wells = [];
  for (const room of state.rooms || []) {
    if (room.rotunda !== true || room.id === state.generation.entranceRoomId) {
      continue;
    }
    const size = Number(room.rotundaSize || room.width || room.height || 0);
    const center = getRoomCenter(room);
    if (size >= 7) {
      const x = center.x - 1;
      const y = center.y - 1;
      const blocks = [];
      for (let yy = y; yy < y + 3; yy += 1) {
        for (let xx = x; xx < x + 3; xx += 1) {
          const corner = (xx === x || xx === x + 2) && (yy === y || yy === y + 2);
          if (!corner) {
            blocks.push({ x: xx, y: yy });
          }
        }
      }
      addPlacedDecor(state.decor.wells, {
        x,
        y,
        assetKey: rng.nextFloat() < 0.5 ? "well-3x3" : "well-3x3-2",
        widthTiles: 3,
        heightTiles: 3,
        blocksMovement: true,
        blocks
      });
    } else {
      addPlacedDecor(state.decor.wells, {
        x: center.x,
        y: center.y,
        assetKey: "well-1x1",
        widthTiles: 1,
        heightTiles: 1,
        blocksMovement: true,
        blocks: [{ x: center.x, y: center.y }]
      });
    }
  }
  if (!validateTileConnectivity(state)) {
    state.decor.wells = [];
  }
}

function parseDecorAssetSize(assetKey) {
  const match = String(assetKey || "").match(/-(\d+)x(\d+)(?:-|$)/i);
  return {
    width: Math.max(1, Number(match?.[1]) || 1),
    height: Math.max(1, Number(match?.[2]) || 1)
  };
}

function parseJunkBoundarySides(assetKey) {
  const match = String(assetKey || "").match(/^junk-\d+x\d+-(.+)$/i);
  const suffix = String(match?.[1] || "").toLowerCase();
  if (!suffix || /^\d+$/.test(suffix)) {
    return [];
  }
  return [...new Set([...suffix].filter((letter) => "nesw".includes(letter)))];
}

function transformJunkBoundarySide(side, rotationTurns = 0, flipX = false, flipY = false) {
  let transformed = side;
  if (flipX) {
    transformed = { e: "w", w: "e" }[transformed] || transformed;
  }
  if (flipY) {
    transformed = { n: "s", s: "n" }[transformed] || transformed;
  }
  const sides = ["n", "e", "s", "w"];
  const index = sides.indexOf(transformed);
  if (index === -1) {
    return transformed;
  }
  const turns = ((Number(rotationTurns) || 0) % 4 + 4) % 4;
  return sides[(index + turns) % sides.length];
}

function transformJunkBoundarySides(sides, rotationTurns = 0, flipX = false, flipY = false) {
  return [...new Set(sides.map((side) => transformJunkBoundarySide(side, rotationTurns, flipX, flipY)))];
}

function isDecorBoundaryTile(state, x, y) {
  const tile = getTile(state, x, y);
  if (!tile) {
    return true;
  }
  if (tile.type !== TILE_TYPES.FLOOR) {
    return true;
  }
  return isOrganicMovementBlockingTile(tile) ||
    isInnerWallBlockingTile(tile) ||
    isAngledWallMovementBlockingTile(tile) ||
    isBlockingDecorAt(state, x, y);
}

function decorFootprintTouchesBoundarySides(state, x, y, width, height, sides) {
  for (const side of sides) {
    let matched = false;
    if (side === "n" || side === "s") {
      const yy = side === "n" ? y - 1 : y + height;
      for (let xx = x; xx < x + width; xx += 1) {
        if (isDecorBoundaryTile(state, xx, yy)) {
          matched = true;
          break;
        }
      }
    } else {
      const xx = side === "w" ? x - 1 : x + width;
      for (let yy = y; yy < y + height; yy += 1) {
        if (isDecorBoundaryTile(state, xx, yy)) {
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      return false;
    }
  }
  return true;
}

function canPlaceDecorFootprint(state, x, y, width, height, occupied, boundarySides = []) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      const tile = getTile(state, xx, yy);
      if (
        tile?.type !== TILE_TYPES.FLOOR ||
        isOrganicMovementBlockingTile(tile) ||
        isInnerWallBlockingTile(tile) ||
        isAngledWallMovementBlockingTile(tile) ||
        isFloorOccupied(state, xx, yy) ||
        occupied.has(`${xx},${yy}`)
      ) {
        return false;
      }
    }
  }
  return decorFootprintTouchesBoundarySides(state, x, y, width, height, boundarySides);
}

function addDungeonJunk(state, rng) {
  ensureDecorCollections(state);
  state.decor.junk = [];
  const validFloorTiles = state.tiles.filter((tile) => (
    tile.type === TILE_TYPES.FLOOR &&
    !isOrganicMovementBlockingTile(tile) &&
    !isInnerWallBlockingTile(tile) &&
    !isAngledWallMovementBlockingTile(tile)
  ));
  const floorTiles = validFloorTiles.filter((tile) => (
    !isFloorOccupied(state, tile.x, tile.y)
  ));
  if (!floorTiles.length) {
    return;
  }
  const target = Math.floor(validFloorTiles.length * (0.25 + rng.nextFloat() * 0.05));
  const occupied = new Set();
  let covered = 0;
  let attempts = 0;
  while (covered < target && attempts < target * 24) {
    attempts += 1;
    const preferSmall = covered > target * 0.76 || rng.nextFloat() < 0.7;
    const pool = preferSmall
      ? JUNK_ASSET_KEYS.filter((key) => key.includes("1x1"))
      : JUNK_ASSET_KEYS;
    const assetKey = rng.pick(pool);
    const baseSize = parseDecorAssetSize(assetKey);
    const rotationTurns = rng.nextInt(0, 3);
    const flipX = rng.nextFloat() < 0.5;
    const flipY = rng.nextFloat() < 0.5;
    const rotated = rotationTurns % 2 === 1;
    const width = rotated ? baseSize.height : baseSize.width;
    const height = rotated ? baseSize.width : baseSize.height;
    const boundarySides = transformJunkBoundarySides(
      parseJunkBoundarySides(assetKey),
      rotationTurns,
      flipX,
      flipY
    );
    const anchor = rng.pick(floorTiles);
    const x = clamp(anchor.x, 0, state.map.width - width);
    const y = clamp(anchor.y, 0, state.map.height - height);
    if (!canPlaceDecorFootprint(state, x, y, width, height, occupied, boundarySides)) {
      continue;
    }
    addPlacedDecor(state.decor.junk, {
      x,
      y,
      assetKey,
      widthTiles: width,
      heightTiles: height,
      rotationTurns,
      flipX,
      flipY
    });
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) {
        occupied.add(`${xx},${yy}`);
        covered += 1;
      }
    }
  }
}

function ensureCanalRoomVisibleTreasure(state, rng, lootCatalog = {}) {
  const rooms = state.rooms.filter((room) => room.hasCanal === true);
  for (const room of rooms) {
    const alreadyVisible = state.entities.some((entity) => (
      entity.type === ENTITY_TYPES.TREASURE &&
      entity.roomId === room.id &&
      entity.visible !== false &&
      !entity.collected
    ));
    if (alreadyVisible) {
      continue;
    }
    const tile = findFurthestFloorTileInRoomFromStart(state, room);
    if (tile) {
      spawnTreasureAtTile(state, rng, room, tile, {
        visible: true,
        revealed: true,
        groundTreasure: true,
        canalBait: true
      }, lootCatalog);
    }
  }
}

function createOrganicDungeon(seed, level, options = {}) {
  const state = createEmptyDungeonState(seed, level);
  state.rulesData = options.rulesData || options.contentCatalog?.rulesData || null;
  const rng = new SeededRng(seed);
  state.generation.architecture = {
    pattern: "organic",
    renderer: "organic",
    rolePassVersion: 1
  };

  const nodes = createOrganicNodes(state, rng);
  const roomsByNode = new Map();
  nodes.forEach((node, index) => {
    roomsByNode.set(node, carveOrganicRoomBlob(state, node, index, rng));
  });

  const edges = buildOrganicGraphEdges(nodes, rng);
  edges.forEach((edge, index) => {
    carveOrganicHall(state, edge, index, roomsByNode, rng);
  });
  roughenOrganicCaveFootprint(state, rng);
  placeOrganicHallDecor(state, rng, options.organicAssets || []);

  const entranceRoom = roomsByNode.get(nodes[0]) || state.rooms[0] || null;
  if (entranceRoom) {
    entranceRoom.role = ROOM_ROLES.ENTRANCE;
    entranceRoom.label = "1";
    state.generation.entranceRoomId = entranceRoom.id;
    const start = entranceRoom.center || getRoomCenter(entranceRoom);
    state.player.x = start.x;
    state.player.y = start.y;
    state.player.roomId = entranceRoom.id;
    createOrganicEntranceMarker(state, entranceRoom, rng);
  }

  addRareOrganicDoors(state, rng);
  applyOrganicCaveTileArt(state, rng, options.organicAssets || []);
  markEndingRoom(state, rng);
  assignArchitecturalRoles(state, rng, "organic");
  applyArchitecturalDoorDetails(state, rng, "organic");

  const reachableRooms = entranceRoom ? floodFillReachableRooms(state, entranceRoom.id) : new Set();
  state.generation.connectivityValid = reachableRooms.size === state.rooms.length && validateOrganicPassableConnectivity(state);

  populateRoomEntities(state, rng, options.monsterTable || [], options.trapTable || [], options.contentCatalog?.loot || {});
  ensureBossRooms(
    state,
    rng,
    options.bossMonsterTable || [],
    options.monsterTable || [],
    options.contentCatalog?.loot || {}
  );
  balanceTreasureSpawns(state, rng, options.trapTable || [], options.contentCatalog?.loot || {});
  balanceTreasureValue(state, rng, options.trapTable || [], options.contentCatalog?.loot || {});
  ensureVisibleGroundTreasure(state, rng, options.contentCatalog?.loot || {});
  addDungeonJunk(state, rng);
  return state;
}

function createRectGraphDungeon(seed, level, options = {}) {
  const state = createEmptyDungeonState(seed, level);
  state.rulesData = options.rulesData || options.contentCatalog?.rulesData || null;
  const rng = new SeededRng(seed);
  const architecturePattern = options.architecturePattern || chooseArchitecturePattern(rng);
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
  const minRooms = architecturePattern === "innerWalls" ? 7 : 9;
  const maxRooms = architecturePattern === "innerWalls" ? 12 : 17;
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
  while (roomIndex < minRooms && roomIndex < maxRooms && recoveryAttempts < 500) {
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

  for (let sweep = 0; roomIndex < minRooms && roomIndex < maxRooms && sweep < 3; sweep += 1) {
    let grewDuringSweep = false;
    const recoveryRooms = state.rooms.filter((room) => room.rotunda !== true);
    for (const room of recoveryRooms) {
      for (const side of RECT_GRAPH_SIDES) {
        if (roomIndex >= minRooms || roomIndex >= maxRooms) {
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

  addHallBranches(state, rng, architecturePattern);
  markEndingRoom(state, rng);
  assignArchitecturalRoles(state, rng, architecturePattern);
  applyArchitecturalDoorDetails(state, rng, architecturePattern);
  finalizeRoomGeometry(state);
  applyOrganicDungeonTheme(state, rng, options.organicAssets || [], architecturePattern);
  applyAngledCornerDungeonTheme(state, rng, architecturePattern);
  applyInnerWallDungeonTheme(state, rng, options.innerWallAssets || [], architecturePattern);
  addRectGraphCanals(state, rng);
  addRectGraphColumns(state, rng);
  addRectGraphWater(state, rng, architecturePattern);
  addRotundaWells(state, rng);
  addBuiltSecretDoors(state, rng, architecturePattern);

  const reachableRooms = floodFillReachableRooms(state, firstRoom.id);
  state.generation.connectivityValid = reachableRooms.size === state.rooms.length && validateTileConnectivity(state) && validateOrganicPassableConnectivity(state);

  populateRoomEntities(state, rng, options.monsterTable || [], options.trapTable || [], options.contentCatalog?.loot || {});
  ensureBossRooms(
    state,
    rng,
    options.bossMonsterTable || [],
    options.monsterTable || [],
    options.contentCatalog?.loot || {}
  );
  balanceTreasureSpawns(state, rng, options.trapTable || [], options.contentCatalog?.loot || {});
  balanceTreasureValue(state, rng, options.trapTable || [], options.contentCatalog?.loot || {});
  ensureVisibleGroundTreasure(state, rng, options.contentCatalog?.loot || {});
  ensureCanalRoomVisibleTreasure(state, rng, options.contentCatalog?.loot || {});
  addDungeonJunk(state, rng);
  return state;
}

export function generateDungeon(seed = Date.now(), level = 1, options = {}) {
  const rng = new SeededRng(seed);
  const architecturePattern = options.architecturePattern || chooseArchitecturePattern(rng);
  if (architecturePattern === "organic") {
    return createOrganicDungeon(seed, level, {
      ...options,
      architecturePattern
    });
  }
  return createRectGraphDungeon(seed, level, {
    ...options,
    architecturePattern
  });
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
  addBuiltSecretDoors(state, rng, "classic");

  populateRoomEntities(state, rng, options.monsterTable || [], options.trapTable || [], options.contentCatalog?.loot || {});
  ensureBossRooms(
    state,
    rng,
    options.bossMonsterTable || [],
    options.monsterTable || [],
    options.contentCatalog?.loot || {}
  );
  balanceTreasureSpawns(state, rng, options.trapTable || [], options.contentCatalog?.loot || {});
  balanceTreasureValue(state, rng, options.trapTable || [], options.contentCatalog?.loot || {});
  ensureVisibleGroundTreasure(state, rng, options.contentCatalog?.loot || {});
  return state;
}
