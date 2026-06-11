import { DOOR_STATES, ENTITY_TYPES, TILE_TYPES } from "./constants.js";
import { getTile } from "./state-schema.js";
import { isTileVisible, recomputeVisibility, revealTrapAtPlayer } from "./visibility.js";

const LOCK_DC_VALUES = Object.freeze([8, 10, 12, 15]);
const DEFAULT_INVENTORY_SLOTS = 10;

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
  return item?.priceless === true ? "priceless" : `${item?.value ?? 0} gp`;
}

function recomputeInventory(state) {
  const inventory = ensureInventory(state);
  inventory.usedSlots = state.lootLog.entries.reduce((total, entry) => total + getItemSlots(entry), 0);
  inventory.bonusSlots = state.lootLog.entries.reduce((total, entry) => total + getItemBonusSlots(entry), 0);
  return inventory;
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
    visible: true
  });
}

function isWalkable(state, tile) {
  if (!tile) {
    return { ok: false, message: "Blocked by stone wall." };
  }
  if (tile.type === TILE_TYPES.FLOOR) {
    return { ok: true, message: "Moved." };
  }
  return { ok: false, message: "Blocked by stone wall." };
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
    if (door.doorState === DOOR_STATES.OPEN) {
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

  if (!tile || tile.type !== TILE_TYPES.FLOOR) {
    state.darkness.pendingDoorKey = null;
    return { moved: false, message: "You've run into a wall!", darknessMessage: "You've run into a wall!" };
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

  if (door?.doorState === DOOR_STATES.LOCKED) {
    return lockedDoorResult(state, door);
  }
  if (door?.doorState === DOOR_STATES.CLOSED) {
    return openClosedDoorFromMovement(state, door);
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
    entity.defeated = true;
    addFeature(state, entity.x, entity.y, entity.roomId, `dead ${entity.name}`);
    return { message: `Monster defeated: dead ${entity.name}.` };
  }

  if (entity.type === ENTITY_TYPES.TREASURE) {
    return { message: "Use the room loot buttons to collect treasure." };
  }

  if (entity.type === ENTITY_TYPES.TRAP) {
    entity.revealed = true;
    entity.visible = true;
    return { message: "Trap manually revealed." };
  }

  return { message: `Feature: ${entity.name || "unknown feature"}.` };
}

export function getRoomLoot(state) {
  if (!state.player.roomId) {
    return [];
  }
  return state.entities.filter((entity) => {
    return (
      entity.type === ENTITY_TYPES.TREASURE &&
      !entity.collected &&
      entity.visible !== false &&
      entity.roomId === state.player.roomId
    );
  });
}

export function collectLoot(state, lootId) {
  const entity = state.entities.find((candidate) => candidate.id === lootId);
  if (!entity || entity.type !== ENTITY_TYPES.TREASURE || entity.collected) {
    return { collected: 0, message: "Loot item not found." };
  }

  const trap = findActiveTrapForTarget(state, "treasure", entity.id);
  if (trap) {
    const result = revealAndTriggerTrap(trap);
    return {
      collected: 0,
      interrupted: true,
      message: result.message
    };
  }

  const inventory = ensureInventory(state);
  const itemSlots = getItemSlots(entity);
  const capacity = getInventoryCapacity(state);
  if (inventory.usedSlots + itemSlots > capacity) {
    return {
      collected: 0,
      message: `Not enough inventory slots. Carrying ${inventory.usedSlots}/${capacity} slots.`
    };
  }

  entity.collected = true;
  state.lootLog.entries.push({
    id: entity.id,
    name: entity.name || "loot",
    kind: entity.kind || entity.subtype || "treasure",
    value: entity.value,
    slots: itemSlots,
    bonusSlots: getItemBonusSlots(entity),
    priceless: entity.priceless === true,
    description: entity.description || "",
    originTile: { x: entity.x, y: entity.y }
  });
  state.lootLog.totalValue += entity.value;
  recomputeInventory(state);
  return {
    collected: 1,
    message: `Got: ${entity.name || "treasure"} (${getLootValueLabel(entity)}).`
  };
}

export function collectRoomLoot(state) {
  const loot = getRoomLoot(state);
  let totalValue = 0;
  let collected = 0;

  for (const entity of loot) {
    const result = collectLoot(state, entity.id);
    if (result.interrupted) {
      return result;
    }
    if (result.collected) {
      collected += 1;
      totalValue += entity.value;
    }
  }

  if (!collected) {
    return { collected: 0, message: "No revealed treasure in this room." };
  }
  return {
    collected,
    message: `Got ${collected} item${collected === 1 ? "" : "s"} (${totalValue} gp total).`
  };
}

export function dropLootAtPlayer(state, lootId) {
  const entryIndex = state.lootLog.entries.findIndex((item) => item.id === lootId);
  if (entryIndex === -1) {
    return { message: "Loot item not found." };
  }

  const [entry] = state.lootLog.entries.splice(entryIndex, 1);
  state.lootLog.totalValue -= entry.value;
  state.entities.push({
    id: `${entry.id}-dropped-${Date.now()}`,
    type: ENTITY_TYPES.TREASURE,
    subtype: "dropped-loot",
    name: entry.name,
    kind: entry.kind || "treasure",
    x: state.player.x,
    y: state.player.y,
    roomId: state.player.roomId,
    visible: true,
    value: entry.value,
    slots: getItemSlots(entry),
    bonusSlots: getItemBonusSlots(entry),
    priceless: entry.priceless === true,
    description: entry.description || "",
    collected: false
  });
  recomputeInventory(state);
  return { message: `Left ${entry.name} (${getLootValueLabel(entry)}).` };
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
      (entity.roomId === state.player.roomId || entity.wasSprung)
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
          return `${entity.name} (${entity.value} gp)`;
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
