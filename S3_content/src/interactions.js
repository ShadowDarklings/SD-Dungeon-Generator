import { DOOR_STATES, ENTITY_TYPES, TILE_TYPES } from "./constants.js";
import { getTile } from "./state-schema.js";
import { isTileVisible, recomputeVisibility, revealTrapAtPlayer } from "./visibility.js";

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

function getDoorAt(state, x, y) {
  return state.entities.find((entity) => entity.subtype === "door" && entity.x === x && entity.y === y);
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

function describeTrapSource(trap) {
  if (trap.targetType === "treasure") {
    return "treasure";
  }
  if (trap.targetType === "door") {
    return "door";
  }
  return "tile";
}

function revealAndTriggerTrap(trap) {
  trap.revealed = true;
  trap.visible = true;
  trap.triggered = true;
  return {
    trap,
    message: `trapped ${describeTrapSource(trap)}! ${trap.name}. Effect: ${trap.effect}.`
  };
}

function isWalkable(state, tile) {
  if (!tile) {
    return { ok: false, message: "Blocked by stone wall." };
  }
  if (tile.type === TILE_TYPES.FLOOR) {
    return { ok: true, message: "Moved." };
  }
  if (tile.type !== TILE_TYPES.DOOR) {
    return { ok: false, message: "Blocked by stone wall." };
  }

  const door = getDoorAt(state, tile.x, tile.y);
  if (door?.doorState === DOOR_STATES.OPEN) {
    return { ok: true, message: "Moved through open door." };
  }
  if (door?.doorState === DOOR_STATES.LOCKED) {
    return { ok: false, message: "The door is locked." };
  }
  return { ok: false, message: "The door is closed." };
}

function openClosedDoorFromMovement(state, tile) {
  if (tile?.type !== TILE_TYPES.DOOR) {
    return null;
  }

  const door = getDoorAt(state, tile.x, tile.y);
  if (!door || door.doorState !== DOOR_STATES.CLOSED) {
    return null;
  }

  const trap = findActiveTrapForTarget(state, "door", door.id);
  door.doorState = DOOR_STATES.OPEN;
  recomputeVisibility(state);

  if (trap) {
    const result = revealAndTriggerTrap(trap);
    return { moved: false, message: `Door opened. ${result.message}` };
  }

  return { moved: false, message: "Door opened. Move again to pass through." };
}

export function movePlayer(state, dx, dy) {
  const nextX = state.player.x + dx;
  const nextY = state.player.y + dy;
  const tile = getTile(state, nextX, nextY);
  const walkable = isWalkable(state, tile);
  if (!walkable.ok) {
    const openedDoor = openClosedDoorFromMovement(state, tile);
    if (openedDoor) {
      return openedDoor;
    }
    return { moved: false, message: walkable.message };
  }

  state.player.x = nextX;
  state.player.y = nextY;
  state.player.roomId = tile.roomId;
  recomputeVisibility(state);
  const trap = revealTrapAtPlayer(state);
  if (trap) {
    const result = revealAndTriggerTrap(trap);
    return {
      moved: true,
      message: result.message
    };
  }
  return { moved: true, message: walkable.message };
}

export function clickEntity(state, x, y) {
  if (!isTileVisible(state, x, y)) {
    return { message: "That tile is hidden by darkness." };
  }

  const entity = findEntityAt(state, x, y);
  if (!entity) {
    return { message: "No interactive token on that tile." };
  }

  if (entity.subtype === "door") {
    const trap = findActiveTrapForTarget(state, "door", entity.id);
    if (trap && entity.doorState !== DOOR_STATES.OPEN) {
      const result = revealAndTriggerTrap(trap);
      return { message: result.message };
    }
    if (entity.doorState === DOOR_STATES.LOCKED) {
      entity.doorState = DOOR_STATES.OPEN;
      recomputeVisibility(state);
      return { message: "You force the locked door open." };
    }
    entity.doorState =
      entity.doorState === DOOR_STATES.OPEN ? DOOR_STATES.CLOSED : DOOR_STATES.OPEN;
    recomputeVisibility(state);
    return {
      message: entity.doorState === DOOR_STATES.OPEN ? "Door opened." : "Door closed."
    };
  }

  if (entity.type === ENTITY_TYPES.MONSTER) {
    entity.defeated = true;
    return { message: "Monster defeated and removed from map." };
  }

  if (entity.type === ENTITY_TYPES.TREASURE) {
    return { message: "Use the room loot buttons to collect treasure." };
  }

  if (entity.type === ENTITY_TYPES.TRAP) {
    entity.revealed = true;
    entity.visible = true;
    return { message: "Trap manually revealed." };
  }

  return { message: "Feature inspected." };
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

  entity.collected = true;
  state.lootLog.entries.push({
    id: entity.id,
    name: entity.name || "loot",
    value: entity.value,
    originTile: { x: entity.x, y: entity.y }
  });
  state.lootLog.totalValue += entity.value;
  return {
    collected: 1,
    message: `Looted: ${entity.name || "loot"} (${entity.value} gp).`
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
    return { collected: 0, message: "No loot in this room." };
  }
  return {
    collected,
    message: `Looted ${collected} item${collected === 1 ? "" : "s"} (${totalValue} gp total).`
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
    x: state.player.x,
    y: state.player.y,
    roomId: state.player.roomId,
    visible: true,
    value: entry.value,
    collected: false
  });
  return { message: `Dropped ${entry.name} (${entry.value} gp).` };
}

export function toggleTorch(state) {
  state.player.torchLit = !state.player.torchLit;
  recomputeVisibility(state);
  return { torchLit: state.player.torchLit };
}

export function getRoomTraps(state) {
  if (!state.player.roomId) {
    return [];
  }
  return state.entities.filter((entity) => {
    return entity.type === ENTITY_TYPES.TRAP && entity.roomId === state.player.roomId && entity.revealed;
  });
}

function rollCheck(modifier) {
  const roll = Math.floor(Math.random() * 20) + 1;
  const normalizedModifier = Math.max(-9, Math.min(9, Number(modifier) || 0));
  return {
    roll,
    modifier: normalizedModifier,
    total: roll + normalizedModifier
  };
}

export function searchForTraps(state, modifier) {
  const check = rollCheck(modifier);
  const candidates = state.entities.filter((entity) => {
    return (
      entity.type === ENTITY_TYPES.TRAP &&
      entity.roomId === state.player.roomId &&
      !entity.revealed &&
      !entity.triggered &&
      !entity.disarmed
    );
  });

  const found = candidates.filter((trap) => check.total >= trap.dc);
  for (const trap of found) {
    trap.revealed = true;
    trap.visible = true;
  }

  return {
    ...check,
    found,
    message: found.length
      ? `revealed: ${found.map((trap) => `${trap.name}. Effect: ${trap.effect}`).join("; ")}`
      : `Search ${check.total}: no traps found.`
  };
}

export function disarmTrap(state, trapId, modifier) {
  const trap = state.entities.find((entity) => entity.id === trapId && entity.type === ENTITY_TYPES.TRAP);
  if (!trap || !trap.revealed || trap.triggered || trap.disarmed) {
    return {
      ...rollCheck(modifier),
      disarmed: false,
      triggered: false,
      message: "No active revealed trap to disarm."
    };
  }

  const check = rollCheck(modifier);
  if (check.total >= trap.dc) {
    trap.disarmed = true;
    trap.visible = true;
    return {
      ...check,
      disarmed: true,
      triggered: false,
      message: `disarmed: ${trap.name}.`
    };
  }

  if (trap.dc - check.total <= 5) {
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
    message: `trap is triggered. you take ${trap.effect} damage!`
  };
}
