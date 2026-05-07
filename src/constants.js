export const MAP_WIDTH_TILES = 46;
export const MAP_HEIGHT_TILES = 31;
export const TILE_SIZE_PX = 52;

export const TILE_TYPES = Object.freeze({
  VOID: "void",
  FLOOR: "floor",
  WALL: "wall",
  DOOR: "door"
});

export const ENTITY_TYPES = Object.freeze({
  MONSTER: "monster",
  TREASURE: "treasure",
  TRAP: "trap",
  FEATURE: "feature"
});

export const DOOR_STATES = Object.freeze({
  OPEN: "open",
  CLOSED: "closed",
  LOCKED: "locked"
});

export const DEFAULT_LIGHT_RADIUS = 6;

export const LOOT_NAMES = Object.freeze([
  "crown",
  "fiddle",
  "rare spices",
  "cup",
  "bracelet",
  "dagger",
  "medallion",
  "ring",
  "horn",
  "robes",
  "fabric",
  "fancy boots"
]);
