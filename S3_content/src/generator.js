import { ENTITY_TYPES, FEATURE_NAMES, LOOT_NAMES, TILE_TYPES } from "./constants.js";
import { SeededRng } from "./rng.js";
import {
  createDoorEntity,
  createEmptyDungeonState,
  getTile,
  setTileType,
} from "./state-schema.js";

function intersects(a, b, margin = 1) {
  return !(
    a.x + a.width + margin <= b.x ||
    b.x + b.width + margin <= a.x ||
    a.y + a.height + margin <= b.y ||
    b.y + b.height + margin <= a.y
  );
}

function carveRoom(state, room) {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
    const doorX = east ? room.x + room.width - 1 : room.x;
    return {
      door: { x: doorX, y },
      hallStart: { x: doorX + (east ? 1 : -1), y }
    };
  }

  const south = dy >= 0;
  const xMin = room.width > 2 ? room.x + 1 : room.x;
  const xMax = room.width > 2 ? room.x + room.width - 2 : room.x + room.width - 1;
  const x = clamp(target.x, xMin, xMax);
  const doorY = south ? room.y + room.height - 1 : room.y;
  return {
    door: { x, y: doorY },
    hallStart: { x, y: doorY + (south ? 1 : -1) }
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

    carveLShapedHall(state, fromEndpoint.hallStart, toEndpoint.hallStart, hallId, rng);
    setTileType(state, fromEndpoint.door.x, fromEndpoint.door.y, TILE_TYPES.DOOR, { hallId });
    setTileType(state, toEndpoint.door.x, toEndpoint.door.y, TILE_TYPES.DOOR, { hallId });

    const fromDoor = addDoorEntity(state, fromEndpoint.door.x, fromEndpoint.door.y, edge.from.id, hallId, rng);
    const toDoor = addDoorEntity(state, toEndpoint.door.x, toEndpoint.door.y, edge.to.id, hallId, rng);

    state.halls.push({
      id: hallId,
      fromRoomId: edge.from.id,
      toRoomId: edge.to.id,
      doors: [fromDoor.id, toDoor.id]
    });
  }
}

function addDoorEntity(state, x, y, roomId, hallId, rng) {
  const existing = state.entities.find((entity) => entity.subtype === "door" && entity.x === x && entity.y === y);
  if (existing) {
    existing.connectedHallIds = Array.from(new Set([...(existing.connectedHallIds || [existing.hallId]), hallId]));
    return existing;
  }

  const door = createDoorEntity(x, y, roomId, hallId, rng);
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
      if (hall.fromRoomId === roomId && !visited.has(hall.toRoomId)) {
        queue.push(hall.toRoomId);
      }
      if (hall.toRoomId === roomId && !visited.has(hall.fromRoomId)) {
        queue.push(hall.fromRoomId);
      }
    }
  }
  return visited;
}

function isWalkableForValidation(tile) {
  return tile?.type === TILE_TYPES.FLOOR || tile?.type === TILE_TYPES.DOOR;
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

function isFloorOccupied(state, x, y) {
  return state.entities.some((entity) => entity.x === x && entity.y === y && occupiesFloor(entity));
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

function createLootDetails(rng) {
  return {
    name: rng.pick(LOOT_NAMES),
    value: rng.nextInt(5, 100),
    searchDc: rng.nextInt(8, 14)
  };
}

function createMonsterDetails(rng, monsterTable = []) {
  const validMonsters = monsterTable.filter((monster) => monster?.["Monster Name"]);
  const monster = rng.pick(validMonsters);
  if (!monster) {
    return null;
  }
  return {
    name: monster["Monster Name"],
    ac: monster["**AC**"] || null,
    hp: monster["**HP**"] || null,
    attack: monster["**ATK**"] || null,
    abilities: monster.abilities || {},
    defeated: false
  };
}

function populateRoomEntities(state, rng, monsterTable = [], trapTable = []) {
  for (const room of state.rooms) {
    if (room.id === state.generation.entranceRoomId) {
      continue;
    }
    if (rng.nextFloat() < 0.45) {
      const monster = createMonsterDetails(rng, monsterTable);
      if (monster) {
        spawnEntity(state, rng, room, "monster", ENTITY_TYPES.MONSTER, "foe", true, monster);
      }
    }
    if (rng.nextFloat() < 0.4) {
      const loot = createLootDetails(rng);
      const treasureId = `treasure-${state.entities.length}`;
      const treasure = spawnEntity(state, rng, room, "treasure", ENTITY_TYPES.TREASURE, "coin-cache", false, {
        id: treasureId,
        name: loot.name,
        value: loot.value,
        searchDc: loot.searchDc,
        revealed: false,
        collected: false
      });
      if (treasure && rng.nextFloat() < 0.25) {
        spawnTrap(state, rng, room, trapTable, "treasure", treasureId);
      }
    }
    if (rng.nextFloat() < 0.35) {
      spawnTrap(state, rng, room, trapTable, "tile");
    }
    if (rng.nextFloat() < 0.25) {
      spawnEntity(state, rng, room, "feature", ENTITY_TYPES.FEATURE, "room-feature", true, {
        name: rng.pick(FEATURE_NAMES)
      });
    }
  }

  for (const door of state.entities.filter((entity) => entity.subtype === "door")) {
    const room = state.rooms.find((candidate) => candidate.id === door.roomId);
    if (room && rng.nextFloat() < 0.15) {
      spawnTrap(state, rng, room, trapTable, "door", door.id);
    }
  }
}

export function generateDungeon(seed = Date.now(), level = 1, options = {}) {
  const state = createEmptyDungeonState(seed, level);
  const rng = new SeededRng(seed);
  const maxRooms = 18;

  for (let attempt = 0; attempt < 250 && state.rooms.length < maxRooms; attempt += 1) {
    const width = rng.nextInt(3, 8);
    const height = rng.nextInt(3, 8);
    const x = rng.nextInt(1, state.map.width - width - 2);
    const y = rng.nextInt(1, state.map.height - height - 2);
    const candidate = {
      id: `room-${state.rooms.length}`,
      x,
      y,
      width,
      height,
      discovered: false,
      explored: false
    };
    if (state.rooms.some((room) => intersects(room, candidate, 1))) {
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
  state.generation.connectivityValid =
    reachableRooms.size === state.rooms.length && validateTileConnectivity(state);

  populateRoomEntities(state, rng, options.monsterTable || [], options.trapTable || []);
  return state;
}
