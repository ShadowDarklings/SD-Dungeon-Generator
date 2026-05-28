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
    message: `trapped ${describeTrapSource(trap)}! ${trap.name}. Trigger: ${trap.trigger}. Effect: ${trap.effect}.`
  };
}

function startDoorTransition(door, nextState) {
  const duration = door.swingTarget === "room" ? 192 : 96;
  door.transition = {
    from: door.doorState,
    to: nextState,
    startedAt: performance.now(),
    duration
  };
  door.doorState = nextState;
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
  const door = getDoorAt(state, tile.x, tile.y);
  if (!door) {
    if (tile.type === TILE_TYPES.FLOOR) {
      return { ok: true, message: "Moved." };
    }
    return { ok: false, message: "Blocked by stone wall." };
  }
  if (door?.doorState === DOOR_STATES.OPEN) {
    return { ok: true, message: "Moved through open door." };
  }
  if (door?.doorState === DOOR_STATES.LOCKED) {
    return { ok: false, message: "The door is locked." };
  }
  return { ok: false, message: "The door is closed." };
}

function openClosedDoorFromMovement(state, tile) {
  if (!tile) {
    return null;
  }

  const door = getDoorAt(state, tile.x, tile.y);
  if (!door || door.doorState !== DOOR_STATES.CLOSED) {
    return null;
  }

  const trap = findActiveTrapForTarget(state, "door", door.id);
  startDoorTransition(door, DOOR_STATES.OPEN);
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
      startDoorTransition(entity, DOOR_STATES.OPEN);
      recomputeVisibility(state);
      return { message: "You force the locked door open." };
    }
    const nextState = entity.doorState === DOOR_STATES.OPEN ? DOOR_STATES.CLOSED : DOOR_STATES.OPEN;
    startDoorTransition(entity, nextState);
    recomputeVisibility(state);
    return {
      message: nextState === DOOR_STATES.OPEN ? "Door opened." : "Door closed."
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
    message: `Got: ${entity.name || "treasure"} (${entity.value} gp).`
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
    x: state.player.x,
    y: state.player.y,
    roomId: state.player.roomId,
    visible: true,
    value: entry.value,
    collected: false
  });
  return { message: `Left ${entry.name} (${entry.value} gp).` };
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
  const normalizedModifier = Math.max(-99, Math.min(99, Number(modifier) || 0));
  return {
    roll,
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

export function searchForTraps(state, modifier) {
  const check = rollCheck(modifier);
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
    message: result.message
  };
}
