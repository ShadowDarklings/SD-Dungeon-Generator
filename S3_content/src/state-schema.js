import {
  DEFAULT_LIGHT_RADIUS,
  DOOR_STATES,
  ENTITY_TYPES,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TILE_SIZE_PX,
  TILE_TYPES
} from "./constants.js";

function buildTileMap(width, height) {
  const tiles = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push({
        x,
        y,
        type: TILE_TYPES.WALL,
        roomId: null,
        hallId: null,
        meta: {}
      });
    }
  }
  return tiles;
}

export function getTileIndex(x, y, width) {
  return y * width + x;
}

export function createEmptyDungeonState(seed = Date.now(), level = 1) {
  const now = Date.now();
  return {
    seed,
    level,
    run: {
      id: null,
      name: "",
      dirty: false,
      lastSavedAt: null,
      hasUserActivity: false
    },
    map: {
      width: MAP_WIDTH_TILES,
      height: MAP_HEIGHT_TILES,
      tileSize: TILE_SIZE_PX
    },
    tiles: buildTileMap(MAP_WIDTH_TILES, MAP_HEIGHT_TILES),
    rooms: [],
    halls: [],
    entities: [],
    player: {
      x: 0,
      y: 0,
      roomId: null,
      lightRadius: DEFAULT_LIGHT_RADIUS,
      torchLit: true
    },
    timers: {
      actualElapsedMs: 0,
      torchElapsedMs: 0,
      torchDurationMs: 60 * 60 * 1000,
      nextWanderingCheckMs: 10 * 60 * 1000,
      lastTickAt: now
    },
    wanderingMonsters: {
      numerator: 1,
      denominator: 6,
      spawnedCount: 0
    },
    darkness: {
      pendingDoorKey: null
    },
    lockedDoorAction: null,
    visibility: {
      visibleNow: new Set(),
      exploredEver: new Set()
    },
    lootLog: {
      entries: [],
      totalValue: 0,
      fullyLootedShown: false
    },
    inventory: {
      baseSlots: 10,
      bonusSlots: 0,
      usedSlots: 0
    },
    generation: {
      entranceRoomId: null,
      connectivityValid: false
    }
  };
}

export function getTile(state, x, y) {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
    return null;
  }
  return state.tiles[getTileIndex(x, y, state.map.width)];
}

export function setTileType(state, x, y, type, extra = {}) {
  const tile = getTile(state, x, y);
  if (!tile) {
    return;
  }
  tile.type = type;
  Object.assign(tile, extra);
}

export function createDoorEntity(
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
  const roll = rng.nextFloat();
  let state = DOOR_STATES.CLOSED;
  if (roll < 0.25) {
    state = DOOR_STATES.OPEN;
  } else if (roll < 0.35) {
    state = DOOR_STATES.LOCKED;
  }

  const isEastWestOpening = orientation !== "horizontal";
  const rotationAngle = isEastWestOpening
    ? (rng.nextFloat() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
    : (rng.nextFloat() < 0.5 ? 0 : Math.PI);

  return {
    id: `door-${x}-${y}`,
    type: ENTITY_TYPES.FEATURE,
    subtype: "door",
    x,
    y,
    roomId,
    hallId,
    orientation,
    wallSide,
    hallDirection,
    hingeSide,
    swingTarget,
    turnDirection,
    facing: hallDirection,
    doorSpriteId: `door${rng.nextInt(1, 4)}`,
    doorRotationAngle: rotationAngle,
    doorState: state,
    visible: true
  };
}

export function tileKey(x, y) {
  return `${x},${y}`;
}
