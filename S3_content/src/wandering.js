import { ENTITY_TYPES, TILE_TYPES } from "./constants.js";
import { getTile, tileKey } from "./state-schema.js";
import { SeededRng } from "./rng.js";

export const DEFAULT_WANDERING_NUMERATOR = 1;
export const DEFAULT_WANDERING_DENOMINATOR = 6;

function normalizeInteger(value, fallback = 0) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    return fallback;
  }
  return Number.parseInt(digits, 10);
}

export function normalizeWanderingChance(state, numerator, denominator) {
  state.wanderingMonsters = {
    numerator: normalizeInteger(numerator, DEFAULT_WANDERING_NUMERATOR),
    denominator: normalizeInteger(denominator, DEFAULT_WANDERING_DENOMINATOR),
    spawnedCount: Math.max(0, Number.parseInt(state.wanderingMonsters?.spawnedCount ?? 0, 10) || 0)
  };
  return state.wanderingMonsters;
}

export function wanderingEnabled(state) {
  const chance = state.wanderingMonsters;
  return Number(chance?.numerator) > 0 && Number(chance?.denominator) > 0;
}

function isOccupied(state, x, y) {
  return state.entities.some((entity) => {
    if (entity.x !== x || entity.y !== y || entity.visible === false) {
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

function visibleEdgeCandidates(state) {
  const minDistance = Math.max(1, state.player.lightRadius - 1);
  const candidates = [];
  for (const key of state.visibility.visibleNow) {
    const [x, y] = key.split(",").map(Number);
    const tile = getTile(state, x, y);
    if (!tile || tile.type !== TILE_TYPES.FLOOR || isOccupied(state, x, y)) {
      continue;
    }
    const distance = Math.max(Math.abs(x - state.player.x), Math.abs(y - state.player.y));
    if (distance >= minDistance && tileKey(x, y) === key) {
      candidates.push(tile);
    }
  }
  return candidates;
}

function monsterDetails(rng, monsterTable) {
  const validMonsters = monsterTable.filter((monster) => monster?.["Monster Name"]);
  const monster = rng.pick(validMonsters);
  if (!monster) {
    return {
      name: "wandering monster",
      ac: null,
      hp: null,
      attack: null,
      abilities: {}
    };
  }
  return {
    name: monster["Monster Name"],
    level: monster["**LV**"] || monster.level || null,
    ac: monster["**AC**"] || null,
    hp: monster["**HP**"] || null,
    attack: monster["**ATK**"] || null,
    movement: monster["**MV**"] || monster.movement || null,
    D: monster["**D**"] || monster.D || "",
    abilities: monster.abilities || {},
    tags: monster.tags || [],
    diplomacy: monster.diplomacy || monster.Diplomacy || monster["Diplomacy"] || ""
  };
}

export function maybeSpawnWanderingMonster(state, monsterTable = []) {
  if (!wanderingEnabled(state) || !state.player.torchLit) {
    return { spawned: false, message: "" };
  }

  const chance = state.wanderingMonsters;
  const seed = (Number(state.seed) || 0) + Math.floor(state.timers?.torchElapsedMs || 0) + chance.spawnedCount;
  const rng = new SeededRng(seed);
  const roll = rng.nextInt(1, chance.denominator);
  if (roll > chance.numerator) {
    return { spawned: false, message: `Wandering monster check: ${roll} in ${chance.denominator}. No monster appears.` };
  }

  const candidates = visibleEdgeCandidates(state);
  const tile = rng.pick(candidates);
  if (!tile) {
    return { spawned: false, message: "Wandering monster check passed, but no visible edge square was available." };
  }

  chance.spawnedCount += 1;
  const details = monsterDetails(rng, monsterTable);
  const entity = {
    id: `wandering-monster-${chance.spawnedCount}`,
    type: ENTITY_TYPES.MONSTER,
    subtype: "wandering-foe",
    x: tile.x,
    y: tile.y,
    roomId: tile.roomId,
    visible: true,
    defeated: false,
    wandering: true,
    ...details
  };
  state.entities.push(entity);
  return {
    spawned: true,
    entity,
    message: `Wandering monster appears at the edge of torchlight: ${entity.name}.`
  };
}
