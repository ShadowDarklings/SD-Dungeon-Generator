import { DOOR_STATES, ENTITY_TYPES, FEATURE_NAMES, TILE_TYPES } from "./constants.js";
import { getTile } from "./state-schema.js";
import { SeededRng } from "./rng.js";
import { isTileVisible, recomputeVisibility, revealTrapAtPlayer } from "./visibility.js";
import { getCharacterGearFreeSlots } from "./characters.js";
import { createTreasureDetails, formatTreasureValue } from "./treasure.js";

const LOCK_DC_VALUES = Object.freeze([8, 10, 12, 15]);
const DEFAULT_INVENTORY_SLOTS = 10;
const MONSTER_LOOT_DROP_CHANCE = 0.75;
const MAX_COIN_VALUE = 2000;
const WORTHLESS_FEATURE_NAMES = new Set(FEATURE_NAMES.map((name) => String(name || "").toLowerCase()));

function isWorthlessFeature(entity) {
  if (entity?.worthlessLoot === true || entity?.corpseLoot === true) {
    return true;
  }
  if (entity?.type !== ENTITY_TYPES.FEATURE) {
    return false;
  }
  const name = String(entity?.name || "").toLowerCase();
  return entity?.subtype === "room-feature" && WORTHLESS_FEATURE_NAMES.has(name);
}

function ensureInventory(state) {
  if (!state.inventory) {
    state.inventory = {
      baseSlots: DEFAULT_INVENTORY_SLOTS,
      bonusSlots: 0,
      usedSlots: 0
    };
  }
  state.inventory.baseSlots = Math.max(0, Number(state.inventory.baseSlots ?? DEFAULT_INVENTORY_SLOTS) || DEFAULT_INVENTORY_SLOTS);
  state.inventory.bonusSlots = Math.max(0, Number(state.inventory.bonusSlots ?? 0) || 0);
  state.inventory.usedSlots = Math.max(0, Number(state.inventory.usedSlots ?? 0) || 0);
  return state.inventory;
}

function getInventoryCapacity(state) {
  const inventory = ensureInventory(state);
  return inventory.baseSlots + inventory.bonusSlots;
}

function getItemSlots(item) {
  const slots = Number(item?.slots ?? 1);
  return Number.isFinite(slots) && slots > 0 ? Math.ceil(slots) : 1;
}

function getItemBonusSlots(item) {
  const bonusSlots = Number(item?.bonusSlots ?? 0);
  return Number.isFinite(bonusSlots) && bonusSlots > 0 ? Math.ceil(bonusSlots) : 0;
}

function getLootValueLabel(item) {
  return item?.priceless === true ? "priceless" : formatTreasureValue(item?.value ?? 0);
}

function getTreasureSlotCost(entity) {
  if (isWorthlessFeature(entity)) {
    return 1;
  }
  if (entity?.gearItem) {
    return Math.max(1, Number(entity.gearItem.slots ?? entity.slots ?? 1) || 1);
  }
  const kind = String(entity?.kind || entity?.treasureKind || "").toLowerCase();
  if (kind === "chainmail") {
    return 2;
  }
  if (kind === "platemail") {
    return 3;
  }
  return 1;
}

function clampCoinValue(value) {
  return Math.max(0, Math.min(MAX_COIN_VALUE, Math.floor(Number(value) || 0)));
}

function recomputeInventory(state) {
  const inventory = ensureInventory(state);
  inventory.usedSlots = state.lootLog.entries.reduce((total, entry) => total + getItemSlots(entry), 0);
  inventory.bonusSlots = state.lootLog.entries.reduce((total, entry) => total + getItemBonusSlots(entry), 0);
  return inventory;
}

function getActiveCarrier(state) {
  if (!Array.isArray(state?.characters) || !state.characters.length) {
    return null;
  }
  return state.characters.find((character) => character.id === state.activeCharacterId) || state.characters[0] || null;
}

function getTreasureXpAward(valueGp) {
  const value = Number(valueGp) || 0;
  if (value <= 50) return 0;
  if (value <= 500) return 1;
  if (value <= 1500) return 2;
  if (value <= 3000) return 3;
  if (value < 5000) return 4;
  return 5;
}

function awardTreasureExperience(state, entity) {
  const xp = getTreasureXpAward(entity?.value);
  if (!xp || !Array.isArray(state?.characters)) {
    return 0;
  }
  for (const character of state.characters) {
    if (Number(character?.hp) < 1 || character.dead === true || character.slain === true) {
      continue;
    }
    character.XP = Math.max(0, Number(character.XP || 0) + xp);
    character.raw = character.raw || {};
    character.raw.XP = character.XP;
    character.raw.xp = character.XP;
  }
  return xp;
}

function createWorthlessLootEntity(state, feature, name = feature?.name) {
  const loot = {
    id: `worthless-loot-${state.entities.length}-${Date.now()}`,
    type: ENTITY_TYPES.TREASURE,
    subtype: "worthless-loot",
    kind: "worthless-loot",
    name,
    x: feature.x,
    y: feature.y,
    roomId: feature.roomId,
    visible: true,
    revealed: true,
    collected: false,
    value: 0,
    slots: 1,
    bonusSlots: 0,
    priceless: false,
    description: "Worthless loot.",
    worthlessLoot: true,
    sourceFeatureId: feature.id
  };
  state.entities.push(loot);
  feature.collected = true;
  feature.visible = false;
  return loot;
}

function findEntityAt(state, x, y) {
  return state.entities.find((entity) => {
    if (entity.x !== x || entity.y !== y) {
      return false;
    }
    if (entity.type === ENTITY_TYPES.MONSTER && entity.defeated) {
      return false;
    }
    if (entity.type === ENTITY_TYPES.TREASURE && entity.collected) {
      return false;
    }
    if (entity.type === ENTITY_TYPES.FEATURE && entity.collected) {
      return false;
    }
    if (entity.type === ENTITY_TYPES.TRAP && !entity.visible) {
      return false;
    }
    return entity.visible !== false;
  });
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

function findDoorTouchingTile(state, x, y) {
  return state.entities.find((entity) => {
    if (entity.subtype !== "door") {
      return false;
    }
    const { hall, room } = getDoorTiles(entity);
    return (hall.x === x && hall.y === y) || (room.x === x && room.y === y);
  }) || null;
}

function getDoorAt(state, x, y) {
  return findDoorTouchingTile(state, x, y);
}

function isDoorPassable(door) {
  return door?.doorState === DOOR_STATES.OPEN ||
    door?.doorState === "gone" ||
    door?.gone === true ||
    door?.destroyed === true;
}

function findBlockingDoorAtTile(state, x, y) {
  return state.entities.find((entity) => (
    entity.subtype === "door" &&
    !isDoorPassable(entity) &&
    entity.x === x &&
    entity.y === y
  )) || null;
}

function findActiveTrapForTarget(state, targetType, targetEntityId = null) {
  return state.entities.find((entity) => {
    return (
      entity.type === ENTITY_TYPES.TRAP &&
      !entity.triggered &&
      !entity.disarmed &&
      entity.targetType === targetType &&
      (targetEntityId === null || entity.targetEntityId === targetEntityId)
    );
  });
}

function pickLockDc() {
  return LOCK_DC_VALUES[Math.floor(Math.random() * LOCK_DC_VALUES.length)];
}

function ensureDoorLockDcs(door) {
  if (!door.lockPickDc) {
    door.lockPickDc = pickLockDc();
  }
  if (!door.breakDc) {
    door.breakDc = pickLockDc();
  }
  return {
    pickDc: door.lockPickDc,
    breakDc: door.breakDc
  };
}

function setDoorState(door, nextState) {
  delete door.transition;
  door.doorState = nextState;
  if (nextState === DOOR_STATES.OPEN) {
    door.everOpened = true;
  }
}

function clearLockedDoorAction(state) {
  state.lockedDoorAction = null;
}

function setLockedDoorAction(state, door) {
  const dcs = ensureDoorLockDcs(door);
  state.lockedDoorAction = {
    doorId: door.id,
    pickDc: dcs.pickDc,
    breakDc: dcs.breakDc
  };
  return state.lockedDoorAction;
}

export function getPendingLockedDoorAction(state) {
  const action = state?.lockedDoorAction;
  if (!action?.doorId) {
    return null;
  }
  const door = state.entities.find((entity) => entity.id === action.doorId && entity.subtype === "door");
  if (!door || door.doorState !== DOOR_STATES.LOCKED) {
    clearLockedDoorAction(state);
    return null;
  }
  const dcs = ensureDoorLockDcs(door);
  return {
    doorId: door.id,
    pickDc: dcs.pickDc,
    breakDc: dcs.breakDc
  };
}

function lockedDoorResult(state, door) {
  state.darkness.pendingDoorKey = null;
  return {
    moved: false,
    message: "Locked.",
    darknessMessage: "Locked.",
    lockedDoor: setLockedDoorAction(state, door)
  };
}

function findStumbleEntityAt(state, x, y) {
  return state.entities.find((entity) => {
    if (entity.x !== x || entity.y !== y || entity.subtype === "door") {
      return false;
    }
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
  });
}

function revealAndTriggerTrap(trap) {
  trap.revealed = true;
  trap.visible = true;
  trap.triggered = true;
  trap.wasSprung = true;
  return {
    trap,
    trapSprung: true,
    message: `${trap.name}. Trigger: ${trap.trigger}. Effect: ${trap.effect}.`
  };
}

function addFeature(state, x, y, roomId, name) {
  state.entities.push({
    id: `feature-${state.entities.length}-${Date.now()}`,
    type: ENTITY_TYPES.FEATURE,
    subtype: "room-feature",
    name,
    x,
    y,
    roomId,
    visible: true,
    worthlessLoot: WORTHLESS_FEATURE_NAMES.has(String(name || "").toLowerCase()) || /^dead\s+/i.test(String(name || ""))
  });
}

function isBlockingPillarAt(state, x, y) {
  const columns = Array.isArray(state.decor?.columns) ? state.decor.columns : [];
  return columns.some((column) => (
    column?.blocksMovement === true &&
    String(column.placement || "center") === "center" &&
    Number(column.x) === x &&
    Number(column.y) === y
  ));
}

function isWalkable(state, tile) {
  if (!tile) {
    return { ok: false, message: "Blocked by stone wall." };
  }
  if (isBlockingPillarAt(state, tile.x, tile.y)) {
    return { ok: false, message: "Blocked by a pillar." };
  }
  if (tile.type === TILE_TYPES.FLOOR) {
    return { ok: true, message: "Moved." };
  }
  return { ok: false, message: "Blocked by stone wall." };
}

function addMonsterLootDrop(state, monster) {
  const dropChance = monster?.wandering === true ? 0.5 : MONSTER_LOOT_DROP_CHANCE;
  if (Math.random() >= dropChance) {
    return null;
  }
  const level = Math.max(1, Number(monster.level ?? state.level ?? 1) || 1);
  const rngSeed = (Number(state.seed) || 0)
    + (level * 97)
    + (Number(monster.x) || 0) * 17
    + (Number(monster.y) || 0) * 31
    + state.entities.length * 13;
  const rng = new SeededRng(rngSeed);
  const treasure = createTreasureDetails({ ...state, level }, rng);
  const loot = {
    id: `monster-loot-${state.entities.length}-${Date.now()}`,
    type: ENTITY_TYPES.TREASURE,
    subtype: "monster-loot",
    kind: treasure.kind,
    x: monster.x,
    y: monster.y,
    roomId: monster.roomId,
    visible: true,
    revealed: true,
    collected: false,
    name: treasure.name,
    value: treasure.value,
    searchDc: treasure.searchDc ?? 0,
    slots: treasure.slots ?? 1,
    bonusSlots: treasure.bonusSlots ?? 0,
    priceless: treasure.priceless === true,
    description: treasure.description || "Coins, oddments, or useful salvage dropped by a defeated monster."
  };
  state.entities.push(loot);
  return loot;
}

export function defeatMonster(state, monster) {
  if (!monster || monster.type !== ENTITY_TYPES.MONSTER || monster.defeated === true) {
    return { defeated: false, message: "Monster not found." };
  }
  monster.defeated = true;
  monster.hp = 0;
  const corpseName = `Dead ${monster.name || "monster"}`;
  state.entities.push({
    id: `corpse-${state.entities.length}-${Date.now()}`,
    type: ENTITY_TYPES.TREASURE,
    subtype: "corpse-loot",
    kind: "worthless-loot",
    name: corpseName,
    x: monster.x,
    y: monster.y,
    roomId: monster.roomId,
    visible: true,
    revealed: true,
    collected: false,
    value: 0,
    slots: 1,
    bonusSlots: 0,
    priceless: false,
    description: "The remains of a defeated monster.",
    corpseLoot: true,
    monsterName: monster.name || "monster"
  });
  const loot = addMonsterLootDrop(state, monster);
  return {
    defeated: true,
    corpseName,
    loot,
    message: loot
      ? `Monster defeated: ${corpseName}. It dropped ${loot.name}.`
      : `Monster defeated: ${corpseName}.`
  };
}

function openClosedDoorFromMovement(state, door) {
  if (!door || door.doorState !== DOOR_STATES.CLOSED) {
    return null;
  }

  const trap = findActiveTrapForTarget(state, "door", door.id);
  setDoorState(door, DOOR_STATES.OPEN);
  clearLockedDoorAction(state);
  recomputeVisibility(state);

  if (trap) {
    const result = revealAndTriggerTrap(trap);
    return { moved: false, trapSprung: true, message: `You've run into a trapped door! ${result.message}` };
  }

  return { moved: false, message: "Door opened. Move again to pass through." };
}

function moveToTileInDarkness(state, tile) {
  state.darkness.pendingDoorKey = null;
  clearLockedDoorAction(state);
  state.player.x = tile.x;
  state.player.y = tile.y;
  state.player.roomId = tile.roomId;

  const tileTrap = revealTrapAtPlayer(state);
  if (tileTrap) {
    return {
      moved: true,
      trapSprung: true,
      message: `you've set off a trap! ${tileTrap.name}. Trigger: ${tileTrap.trigger}. Effect: ${tileTrap.effect}.`,
      darknessMessage: "you've set off a trap!"
    };
  }

  const entity = findStumbleEntityAt(state, tile.x, tile.y);
  if (!entity) {
    return { moved: true, message: "Moved through darkness." };
  }

  entity.visible = true;
  entity.revealed = true;
  entity.darknessRevealed = true;

  if (entity.type === ENTITY_TYPES.TREASURE) {
    const trap = findActiveTrapForTarget(state, "treasure", entity.id);
    if (trap) {
      const result = revealAndTriggerTrap(trap);
      return {
        moved: true,
        trapSprung: true,
        message: `You've stumbled onto a trapped ${entity.name || "treasure"}! ${result.message}`,
        darknessMessage: `You've stumbled onto a trapped ${entity.name || "treasure"}!`
      };
    }
  }

  const name = entity.name || entity.subtype || entity.type || "object";
  return {
    moved: true,
    message: `You've stumbled onto a ${name}.`,
    darknessMessage: `You've stumbled onto a ${name}.`
  };
}

function movePlayerInDarkness(state, dx, dy) {
  const nextX = state.player.x + dx;
  const nextY = state.player.y + dy;
  const tile = getTile(state, nextX, nextY);
  const door = getDoorBetween(state, state.player.x, state.player.y, nextX, nextY);

  if (door) {
    if (isDoorPassable(door)) {
      return moveToTileInDarkness(state, tile);
    }

    const trap = findActiveTrapForTarget(state, "door", door.id);
    if (trap) {
      const result = revealAndTriggerTrap(trap);
      setDoorState(door, DOOR_STATES.OPEN);
      state.darkness.pendingDoorKey = null;
      return {
        moved: false,
        trapSprung: true,
        message: `you've run into a trapped door! ${result.message}`,
        darknessMessage: "you've run into a trapped door!"
      };
    }

    if (state.darkness.pendingDoorKey !== door.id) {
      state.darkness.pendingDoorKey = door.id;
      return { moved: false, message: "you've run into a door.", darknessMessage: "you've run into a door." };
    }

    if (door.doorState === DOOR_STATES.LOCKED) {
      return lockedDoorResult(state, door);
    }

    setDoorState(door, DOOR_STATES.OPEN);
    clearLockedDoorAction(state);
    state.darkness.pendingDoorKey = null;
    return { moved: false, message: "door open", darknessMessage: "door open" };
  }

  const blockingDoor = findBlockingDoorAtTile(state, nextX, nextY);
  if (blockingDoor) {
    const trap = findActiveTrapForTarget(state, "door", blockingDoor.id);
    if (trap) {
      const result = revealAndTriggerTrap(trap);
      setDoorState(blockingDoor, DOOR_STATES.OPEN);
      state.darkness.pendingDoorKey = null;
      return {
        moved: false,
        trapSprung: true,
        message: `you've run into a trapped door! ${result.message}`,
        darknessMessage: "you've run into a trapped door!"
      };
    }
    if (blockingDoor.doorState === DOOR_STATES.LOCKED) {
      return lockedDoorResult(state, blockingDoor);
    }
    if (state.darkness.pendingDoorKey === blockingDoor.id && blockingDoor.doorState === DOOR_STATES.CLOSED) {
      setDoorState(blockingDoor, DOOR_STATES.OPEN);
      clearLockedDoorAction(state);
      state.darkness.pendingDoorKey = null;
      return { moved: false, message: "door open", darknessMessage: "door open" };
    }
    state.darkness.pendingDoorKey = blockingDoor.id;
    return { moved: false, message: "you've run into a door.", darknessMessage: "you've run into a door." };
  }

  if (!tile || tile.type !== TILE_TYPES.FLOOR || isBlockingPillarAt(state, nextX, nextY)) {
    state.darkness.pendingDoorKey = null;
    const message = isBlockingPillarAt(state, nextX, nextY) ? "You've run into a pillar!" : "You've run into a wall!";
    return { moved: false, message, darknessMessage: message };
  }

  return moveToTileInDarkness(state, tile);
}

export function movePlayer(state, dx, dy) {
  if (!state.player.torchLit) {
    return movePlayerInDarkness(state, dx, dy);
  }

  const nextX = state.player.x + dx;
  const nextY = state.player.y + dy;
  const tile = getTile(state, nextX, nextY);
  const door = getDoorBetween(state, state.player.x, state.player.y, nextX, nextY);

  if (door && !isDoorPassable(door)) {
    if (door.doorState === DOOR_STATES.LOCKED) {
      return lockedDoorResult(state, door);
    }
    if (door.doorState === DOOR_STATES.CLOSED) {
      return openClosedDoorFromMovement(state, door);
    }
    return { moved: false, message: "Blocked by a door." };
  }

  const blockingDoor = findBlockingDoorAtTile(state, nextX, nextY);
  if (blockingDoor) {
    if (blockingDoor.doorState === DOOR_STATES.LOCKED) {
      return lockedDoorResult(state, blockingDoor);
    }
    if (blockingDoor.doorState === DOOR_STATES.CLOSED) {
      return openClosedDoorFromMovement(state, blockingDoor);
    }
    return { moved: false, message: "Blocked by a door." };
  }

  const walkable = isWalkable(state, tile);
  if (!walkable.ok) {
    return { moved: false, message: walkable.message };
  }

  state.player.x = nextX;
  state.player.y = nextY;
  state.player.roomId = tile.roomId;
  clearLockedDoorAction(state);
  recomputeVisibility(state);
  const trap = revealTrapAtPlayer(state);
  if (trap) {
    const result = revealAndTriggerTrap(trap);
    return {
      moved: true,
      trapSprung: result.trapSprung,
      message: result.message
    };
  }
  return { moved: true, message: walkable.message };
}

export function clickEntity(state, x, y) {
  const clickedDoor = findDoorTouchingTile(state, x, y);
  const doorTiles = clickedDoor ? getDoorTiles(clickedDoor) : null;
  const clickedVisibleDoor = clickedDoor && (
    isTileVisible(state, doorTiles.hall.x, doorTiles.hall.y) ||
    isTileVisible(state, doorTiles.room.x, doorTiles.room.y)
  );
  if (!clickedVisibleDoor && !isTileVisible(state, x, y)) {
    return { message: "That tile is hidden by darkness." };
  }

  const clickedEntity = findEntityAt(state, x, y);
  const entity = clickedEntity?.subtype === "door"
    ? clickedEntity
    : clickedEntity || clickedDoor;
  if (!entity) {
    return { message: "No interactive token on that tile." };
  }

  if (entity.subtype === "door") {
    const trap = findActiveTrapForTarget(state, "door", entity.id);
    if (trap && entity.doorState !== DOOR_STATES.OPEN) {
      const result = revealAndTriggerTrap(trap);
      setDoorState(entity, DOOR_STATES.OPEN);
      recomputeVisibility(state);
      return { trapSprung: true, message: `You've run into a trapped door! ${result.message}` };
    }
    if (entity.doorState === DOOR_STATES.LOCKED) {
      return lockedDoorResult(state, entity);
    }
    setDoorState(entity, entity.doorState === DOOR_STATES.OPEN ? DOOR_STATES.CLOSED : DOOR_STATES.OPEN);
    clearLockedDoorAction(state);
    recomputeVisibility(state);
    return {
      message: entity.doorState === DOOR_STATES.OPEN ? "Door opened." : "Door closed."
    };
  }

  if (entity.type === ENTITY_TYPES.MONSTER) {
    return defeatMonster(state, entity);
  }

  if (entity.type === ENTITY_TYPES.TREASURE) {
    if (entity.corpseLoot === true || entity.worthlessLoot === true || entity.subtype === "worthless-loot") {
      return collectLoot(state, entity.id);
    }
    return { message: "Use the room loot buttons to collect treasure." };
  }

  if (entity.type === ENTITY_TYPES.TRAP) {
    entity.revealed = true;
    entity.visible = true;
    return { message: "Trap manually revealed." };
  }

  if (entity.type === ENTITY_TYPES.FEATURE && isWorthlessFeature(entity)) {
    const loot = createWorthlessLootEntity(state, entity, entity.name || "worthless loot");
    return { message: `${loot.name} can be picked up from the room loot panel.` };
  }

  return { message: `Feature: ${entity.name || "unknown feature"}.` };
}

export function getRoomLoot(state) {
  if (!state.player.roomId) {
    return [];
  }
  return state.entities.filter((entity) => {
    return (
      (
        entity.type === ENTITY_TYPES.TREASURE ||
        (entity.type === ENTITY_TYPES.FEATURE && isWorthlessFeature(entity))
      ) &&
      !entity.collected &&
      entity.visible !== false &&
      entity.roomId === state.player.roomId
    );
  });
}

export function collectLoot(state, lootId) {
  const entity = state.entities.find((candidate) => candidate.id === lootId);
  if (!entity || entity.collected || (entity.type !== ENTITY_TYPES.TREASURE && entity.type !== ENTITY_TYPES.FEATURE)) {
    return { collected: 0, message: "Loot item not found." };
  }
  const collectable = entity.type === ENTITY_TYPES.TREASURE
    ? entity
    : isWorthlessFeature(entity)
      ? createWorthlessLootEntity(state, entity, entity.name || "worthless loot")
      : null;
  if (!collectable) {
    return { collected: 0, message: "Loot item not found." };
  }

  const trap = findActiveTrapForTarget(state, "treasure", collectable.id);
  if (trap) {
    const result = revealAndTriggerTrap(trap);
    return {
      collected: 0,
      interrupted: true,
      message: result.message
    };
  }

  const character = getActiveCarrier(state);
  if (!character) {
    return { collected: 0, message: "Select a character to carry treasure." };
  }

  const itemSlots = getTreasureSlotCost(collectable);
  if (getCharacterGearFreeSlots(character) < itemSlots) {
    return {
      collected: 0,
      message: `${character.name || "Character"} has no room for ${collectable.name || "treasure"}.`
    };
  }

  collectable.collected = true;
  const treasureName = collectable.corpseLoot && collectable.monsterName
    ? `pieces of ${collectable.monsterName}`
    : collectable.name || "treasure";
  const xpAward = awardTreasureExperience(state, collectable);
  if (collectable.coinBreakdown) {
    character.gold = clampCoinValue(Number(character.gold || 0) + Number(collectable.coinBreakdown.gold || 0));
    character.silver = clampCoinValue(Number(character.silver || 0) + Number(collectable.coinBreakdown.silver || 0));
    character.copper = clampCoinValue(Number(character.copper || 0) + Number(collectable.coinBreakdown.copper || 0));
    character.raw = character.raw || {};
    character.raw.gold = character.gold;
    character.raw.silver = character.silver;
    character.raw.copper = character.copper;
    return {
      collected: 1,
      message: `Got: ${treasureName} (${getLootValueLabel(collectable)}).${xpAward ? ` ${xpAward} XP to each living party member.` : ""}`
    };
  }

  character.gear = Array.isArray(character.gear) ? character.gear : [];
  const gearItem = collectable.gearItem
    ? JSON.parse(JSON.stringify(collectable.gearItem))
    : {
      name: treasureName,
      quantity: 1,
      totalUnits: 1,
      value: Math.max(0, Number(collectable.value) || 0),
      slots: itemSlots,
      bonusSlots: getItemBonusSlots(collectable),
      priceless: collectable.priceless === true,
      description: collectable.description || "",
      treasureItem: true,
      treasureKind: collectable.kind || collectable.subtype || "treasure",
      worthlessLoot: collectable.worthlessLoot === true,
      corpseLoot: collectable.corpseLoot === true,
      monsterName: collectable.monsterName || ""
    };
  character.gear.push({
    id: collectable.id,
    ...gearItem,
    name: collectable.gearItem ? (gearItem.name || treasureName) : treasureName,
    quantity: Number(gearItem.quantity || gearItem.totalUnits || 1) || 1,
    totalUnits: Number(gearItem.totalUnits || gearItem.quantity || 1) || 1,
    value: Math.max(0, Number(gearItem.value ?? collectable.value) || 0),
    slots: itemSlots,
    bonusSlots: getItemBonusSlots(collectable),
    priceless: collectable.priceless === true,
    description: collectable.description || gearItem.description || "",
    treasureItem: !collectable.gearItem,
    treasureKind: collectable.kind || collectable.subtype || "treasure",
    worthlessLoot: collectable.worthlessLoot === true || gearItem.worthlessLoot === true,
    corpseLoot: collectable.corpseLoot === true || gearItem.corpseLoot === true,
    monsterName: collectable.monsterName || gearItem.monsterName || ""
  });
  return {
    collected: 1,
    message: `Got: ${treasureName} (${getLootValueLabel(collectable)}).${xpAward ? ` ${xpAward} XP to each living party member.` : ""}`
  };
}

export function collectRoomLoot(state) {
  const loot = getRoomLoot(state).filter((entity) => entity.subtype !== "dropped-equipment");
  let totalValue = 0;
  let collected = 0;

  for (const entity of loot) {
    const result = collectLoot(state, entity.id);
    if (result.interrupted) {
      return result;
    }
    if (result.collected) {
      collected += 1;
      totalValue += Number(entity.value) || 0;
    }
  }

  if (!collected) {
    return { collected: 0, message: "No revealed treasure in this room." };
  }
  return {
    collected,
    message: `Got ${collected} item${collected === 1 ? "" : "s"} (${formatTreasureValue(totalValue)} total).`
  };
}

export function dropLootAtPlayer(state, lootId) {
  const character = getActiveCarrier(state);
  if (!character || !Array.isArray(character.gear)) {
    return { message: "No carried treasure to leave." };
  }
  const index = character.gear.findIndex((item) => String(item?.id || "") === String(lootId));
  if (index === -1) {
    return { message: "Loot item not found." };
  }
  const [entry] = character.gear.splice(index, 1);
  character.raw = character.raw || {};
  if (entry.treasureItem) {
    state.entities.push({
      id: `${entry.id}-dropped-${Date.now()}`,
      type: ENTITY_TYPES.TREASURE,
      subtype: "dropped-loot",
      name: entry.name,
      kind: entry.treasureKind || "treasure",
      x: state.player.x,
      y: state.player.y,
      roomId: state.player.roomId,
      visible: true,
      value: entry.value,
      slots: getItemSlots(entry),
      bonusSlots: getItemBonusSlots(entry),
      priceless: entry.priceless === true,
      description: entry.description || "",
      collected: false,
      worthlessLoot: entry.worthlessLoot === true,
      corpseLoot: entry.corpseLoot === true,
      monsterName: entry.monsterName || ""
    });
    return { message: `Left ${entry.name} (${getLootValueLabel(entry)}).` };
  }
  character.gear.splice(index, 0, entry);
  return { message: "That item cannot be left here." };
}

export function getInventorySummary(state) {
  const inventory = ensureInventory(state);
  return {
    usedSlots: inventory.usedSlots,
    bonusSlots: inventory.bonusSlots,
    capacity: getInventoryCapacity(state)
  };
}

export function toggleTorch(state) {
  state.player.torchLit = !state.player.torchLit;
  recomputeVisibility(state);
  return { torchLit: state.player.torchLit };
}

export function getRoomTraps(state) {
  return state.entities.filter((entity) => {
    return (
      entity.type === ENTITY_TYPES.TRAP &&
      entity.revealed &&
      entity.roomId === state.player.roomId
    );
  });
}

export function rollCheck(modifier, options = {}) {
  const firstRoll = Math.floor(Math.random() * 20) + 1;
  const usesPairedRoll = options.doubleRoll === true || options.disadvantage === true;
  const secondRoll = usesPairedRoll ? Math.floor(Math.random() * 20) + 1 : null;
  const roll = secondRoll === null
    ? firstRoll
    : options.disadvantage === true
      ? Math.min(firstRoll, secondRoll)
      : Math.max(firstRoll, secondRoll);
  const normalizedModifier = Math.max(-99, Math.min(99, Number(modifier) || 0));
  return {
    roll,
    firstRoll,
    secondaryRoll: secondRoll,
    checkMode: options.disadvantage === true ? "disadvantage" : options.doubleRoll === true ? "advantage" : "normal",
    modifier: normalizedModifier,
    total: roll + normalizedModifier
  };
}

function isSearchCandidate(entity, roomId) {
  if (entity.roomId !== roomId) {
    return false;
  }
  if (entity.type === ENTITY_TYPES.TRAP) {
    return !entity.revealed && !entity.triggered && !entity.disarmed;
  }
  if (entity.type === ENTITY_TYPES.TREASURE) {
    return entity.visible === false && !entity.collected;
  }
  return false;
}

export function searchForTraps(state, modifier, options = {}) {
  if (!state.player.torchLit) {
    return {
      roll: 0,
      modifier: 0,
      total: 0,
      found: [],
      message: "Searching impossible in total darkness.",
      darknessMessage: "Searching impossible in total darkness."
    };
  }

  const check = rollCheck(modifier, options);
  const candidates = state.entities.filter((entity) => isSearchCandidate(entity, state.player.roomId));

  const found = candidates.filter((entity) => check.total >= (entity.searchDc ?? entity.dc));
  for (const entity of found) {
    entity.revealed = true;
    entity.visible = true;
  }

  return {
    ...check,
    found,
    message: found.length
      ? `Search ${check.total} revealed: ${found.map((entity) => {
          if (entity.type === ENTITY_TYPES.TRAP) {
            return `${entity.name} (trigger: ${entity.trigger}; effect: ${entity.effect})`;
          }
          return `${entity.name} (${formatTreasureValue(entity.value)})`;
        }).join("; ")}` 
      : `Search ${check.total}: no hidden traps or treasure found.`
  };
}

export function disarmTrap(state, trapId, modifier, options = {}) {
  const trap = state.entities.find((entity) => entity.id === trapId && entity.type === ENTITY_TYPES.TRAP);
  if (!trap || !trap.revealed || trap.triggered || trap.disarmed) {
    return {
      ...rollCheck(modifier, options),
      disarmed: false,
      triggered: false,
      message: "No active revealed trap to disarm."
    };
  }

  const check = rollCheck(modifier, options);
  if (check.total >= trap.dc) {
    const trapIndex = state.entities.findIndex((entity) => entity.id === trap.id);
    if (trapIndex !== -1) {
      state.entities.splice(trapIndex, 1);
    }
    addFeature(state, trap.x, trap.y, trap.roomId, `broken ${trap.name}`);
    return {
      ...check,
      disarmed: true,
      triggered: false,
      message: `disarmed: ${trap.name}. A broken ${trap.name} remains.`
    };
  }

  if (check.total > trap.dc - 5) {
    return {
      ...check,
      disarmed: false,
      triggered: false,
      message: "Failed to disarm. Try again?"
    };
  }

  const result = revealAndTriggerTrap(trap);
  return {
    ...check,
    disarmed: false,
    triggered: true,
    trapSprung: result.trapSprung,
    message: result.message
  };
}

export function attemptLockedDoor(state, method, modifier = 0, options = {}) {
  const action = getPendingLockedDoorAction(state);
  if (!action) {
    return {
      ...rollCheck(modifier, options),
      opened: false,
      message: "No locked door selected."
    };
  }

  const door = state.entities.find((entity) => entity.id === action.doorId && entity.subtype === "door");
  const dc = method === "break" ? action.breakDc : action.pickDc;
  const check = rollCheck(modifier, options);
  if (check.total < dc) {
    return {
      ...check,
      opened: false,
      dc,
      method,
      lockedDoor: action,
      message: `${method === "break" ? "Break" : "Pick lock"} ${check.total} vs DC ${dc}: failed.`
    };
  }

  const trap = findActiveTrapForTarget(state, "door", door?.id);
  if (method === "break") {
    const doorIndex = state.entities.findIndex((entity) => entity.id === action.doorId && entity.subtype === "door");
    if (doorIndex !== -1) {
      state.entities.splice(doorIndex, 1);
    }
  } else {
    setDoorState(door, DOOR_STATES.OPEN);
  }
  clearLockedDoorAction(state);
  recomputeVisibility(state);

  if (trap) {
    const result = revealAndTriggerTrap(trap);
    return {
      ...check,
      opened: true,
      destroyed: method === "break",
      dc,
      method,
      trapSprung: true,
      message: `${method === "break" ? "Door broken open" : "Lock picked"}. You've run into a trapped door! ${result.message}`
    };
  }

  return {
    ...check,
    opened: true,
    destroyed: method === "break",
    dc,
    method,
    message: `${method === "break" ? "Door broken open" : "Lock picked"}. Door open.`
  };
}
