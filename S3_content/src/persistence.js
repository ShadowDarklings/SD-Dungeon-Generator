import { apiFetch } from "./api.js";
import { normalizeCharacterState } from "./characters.js";

const MAX_SAVE_NAME_LENGTH = 15;
const MAX_SAVED_RUNS = 10;
const MAX_SAVED_CHARACTERS = 50;
const SHADOWDARKLINGS_IMPORT_TIMEOUT_MS = 40000;

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function asSet(value) {
  if (value instanceof Set) {
    return value;
  }
  if (Array.isArray(value)) {
    return new Set(value);
  }
  return new Set();
}

function serializeDoorSideMap(value) {
  if (!(value instanceof Map)) {
    return {};
  }
  return Object.fromEntries([...value.entries()].map(([doorId, sides]) => [
    doorId,
    Array.from(sides || [])
  ]));
}

function hydrateDoorSideMap(value) {
  if (value instanceof Map) {
    return new Map([...value.entries()].map(([doorId, sides]) => [doorId, asSet(sides)]));
  }
  if (!value || typeof value !== "object") {
    return new Map();
  }
  return new Map(Object.entries(value).map(([doorId, sides]) => [doorId, asSet(sides)]));
}

function normalizeExploredLightPolygons(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((polygon) => Array.isArray(polygon) && polygon.length >= 3)
    .map((polygon) => polygon
      .filter((point) => (
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
      ))
      .map((point) => [Number(point[0]), Number(point[1])])
    )
    .filter((polygon) => polygon.length >= 3);
}

function normalizeRunMeta(raw = {}) {
  return {
    id: raw.id ?? null,
    revision: raw.revision ?? null,
    name: typeof raw.name === "string" ? raw.name.slice(0, MAX_SAVE_NAME_LENGTH) : "",
    dirty: raw.dirty === true,
    lastSavedAt: raw.lastSavedAt ?? null,
    hasUserActivity: raw.hasUserActivity === true
  };
}

function normalizeTimers(raw = {}) {
  return {
    actualElapsedMs: Math.max(0, Number(raw.actualElapsedMs) || 0),
    torchElapsedMs: Math.max(0, Number(raw.torchElapsedMs) || 0),
    torchDurationMs: Math.max(1, Number(raw.torchDurationMs) || 60 * 60 * 1000),
    nextWanderingCheckMs: Math.max(10 * 60 * 1000, Number(raw.nextWanderingCheckMs) || 10 * 60 * 1000),
    lastTickAt: Date.now()
  };
}

function normalizeWandering(raw = {}) {
  return {
    numerator: Math.max(0, Number.parseInt(raw.numerator ?? 1, 10) || 0),
    denominator: Math.max(0, Number.parseInt(raw.denominator ?? 6, 10) || 0),
    spawnedCount: Math.max(0, Number.parseInt(raw.spawnedCount ?? 0, 10) || 0)
  };
}

function normalizeInventory(raw = {}) {
  return {
    baseSlots: Math.max(0, Number(raw.baseSlots ?? 10) || 10),
    bonusSlots: Math.max(0, Number(raw.bonusSlots ?? 0) || 0),
    usedSlots: Math.max(0, Number(raw.usedSlots ?? 0) || 0)
  };
}

function normalizeCombat(raw = {}) {
  return {
    active: raw.active === true,
    round: Math.max(0, Number.parseInt(raw.round ?? 0, 10) || 0),
    turnIndex: Math.max(0, Number.parseInt(raw.turnIndex ?? 0, 10) || 0),
    turnOrder: Array.isArray(raw.turnOrder) ? raw.turnOrder : [],
    playerOrderIds: Array.isArray(raw.playerOrderIds) ? raw.playerOrderIds : [],
    pendingPlayerIds: Array.isArray(raw.pendingPlayerIds) ? raw.pendingPlayerIds : [],
    monsterIds: Array.isArray(raw.monsterIds) ? raw.monsterIds : [],
    sideFirst: raw.sideFirst === "monsters" ? "monsters" : "characters",
    movementRemaining: Math.max(0, Number.parseInt(raw.movementRemaining ?? 0, 10) || 0),
    actionUsed: raw.actionUsed === true,
    initiative: Array.isArray(raw.initiative) ? raw.initiative : [],
    log: Array.isArray(raw.log) ? raw.log.slice(-12) : []
  };
}

function normalizeMoney(raw = {}) {
  return {
    gold: Math.max(0, Math.floor(Number(raw.gold || 0) || 0)),
    silver: Math.max(0, Math.floor(Number(raw.silver || 0) || 0)),
    copper: Math.max(0, Math.floor(Number(raw.copper || 0) || 0))
  };
}

function normalizeMultiplayerMotions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(-20).flatMap((motion) => {
    if (
      !motion ||
      typeof motion.id !== "string" ||
      motion.id.length < 16 ||
      motion.id.length > 64 ||
      typeof motion.characterId !== "string" ||
      motion.characterId.length > 120
    ) {
      return [];
    }
    const frames = (Array.isArray(motion.frames) ? motion.frames : []).slice(0, 9).flatMap((frame) => {
      const x = Number(frame?.x);
      const y = Number(frame?.y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        return [];
      }
      return [{
        x,
        y,
        roomId: typeof frame.roomId === "string" ? frame.roomId.slice(0, 120) : null
      }];
    });
    if (frames.length < 2) {
      return [];
    }
    return [{
      id: motion.id,
      actorId: typeof motion.actorId === "string" ? motion.actorId.slice(0, 120) : null,
      characterId: motion.characterId,
      frames,
      time: Number.isFinite(Number(motion.time)) ? Number(motion.time) : 0
    }];
  });
}

export function normalizeSaveName(name) {
  return String(name || "").trim().slice(0, MAX_SAVE_NAME_LENGTH);
}

export function serializeDungeonState(state) {
  const copy = clonePlain({
    ...state,
    visibility: {
      visibleNow: Array.from(state.visibility?.visibleNow || []),
      exploredEver: Array.from(state.visibility?.exploredEver || []),
      exploredLightPolygons: normalizeExploredLightPolygons(state.visibility?.exploredLightPolygons),
      visitedRoomIds: Array.from(state.visibility?.visitedRoomIds || []),
      closedDoorExploredSides: serializeDoorSideMap(state.visibility?.closedDoorExploredSides)
    }
  });
  copy.run = normalizeRunMeta(state.run);
  copy.timers = {
    ...normalizeTimers(state.timers),
    lastTickAt: null
  };
  copy.wanderingMonsters = normalizeWandering(state.wanderingMonsters);
  copy.combat = normalizeCombat(state.combat);
  copy.partyAssets = normalizeMoney(state.partyAssets);
  copy.multiplayerMotions = normalizeMultiplayerMotions(state.multiplayerMotions);
  delete copy.sharedRoom;
  normalizeCharacterState(copy);
  return copy;
}

export function hydrateDungeonState(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Saved run did not include a usable dungeon state.");
  }
  const visibleNow = asSet(raw.visibility?.visibleNow);
  const exploredEver = asSet(raw.visibility?.exploredEver);
  const visitedRoomIds = asSet(raw.visibility?.visitedRoomIds);
  const exploredLightPolygons = normalizeExploredLightPolygons(raw.visibility?.exploredLightPolygons);
  const closedDoorExploredSides = hydrateDoorSideMap(raw.visibility?.closedDoorExploredSides);
  const state = clonePlain({
    ...raw,
    visibility: {
      visibleNow: Array.from(visibleNow),
      exploredEver: Array.from(exploredEver),
      exploredLightPolygons,
      visitedRoomIds: Array.from(visitedRoomIds),
      closedDoorExploredSides: serializeDoorSideMap(closedDoorExploredSides)
    }
  });
  state.run = normalizeRunMeta(state.run);
  state.timers = normalizeTimers(state.timers);
  state.wanderingMonsters = normalizeWandering(state.wanderingMonsters);
  state.darkness = {
    pendingDoorKey: state.darkness?.pendingDoorKey || null
  };
  state.player = {
    ...state.player,
    lightSource: state.player?.lightSource || (state.player?.torchLit ? "torch" : ""),
    lightRadius: Math.max(1, Number(state.player?.lightRadius) || 6),
    torchLit: state.player?.torchLit !== false
  };
  state.lockedDoorAction = state.lockedDoorAction?.doorId ? state.lockedDoorAction : null;
  state.combat = normalizeCombat(state.combat);
  state.visibility = {
    visibleNow,
    exploredEver,
    exploredLightPolygons,
    visitedRoomIds,
    closedDoorVisibleSides: new Map(),
    closedDoorExploredSides
  };
  state.lootLog = {
    entries: Array.isArray(state.lootLog?.entries) ? state.lootLog.entries : [],
    totalValue: Number(state.lootLog?.totalValue) || 0,
    fullyLootedShown: state.lootLog?.fullyLootedShown === true
  };
  state.decor = {
    ...(state.decor || {}),
    columns: Array.isArray(state.decor?.columns) ? state.decor.columns : [],
    water: Array.isArray(state.decor?.water) ? state.decor.water : [],
    canals: Array.isArray(state.decor?.canals) ? state.decor.canals : [],
    junk: Array.isArray(state.decor?.junk) ? state.decor.junk : [],
    wells: Array.isArray(state.decor?.wells) ? state.decor.wells : []
  };
  state.partyAssets = normalizeMoney(state.partyAssets);
  state.multiplayerMotions = normalizeMultiplayerMotions(state.multiplayerMotions);
  normalizeCharacterState(state);
  state.inventory = normalizeInventory(state.inventory);
  return state;
}

async function parseJsonResponse(
  response,
  nonJsonMessage = "Server returned a non-JSON response.",
  redirectedMessage = "Login required before using saved runs."
) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(response.redirected ? redirectedMessage : nonJsonMessage);
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || "Saved run request failed.");
  }
  return data;
}

function isStaticS3WebsiteHost() {
  return window.location.hostname.endsWith(".s3-website-us-west-2.amazonaws.com");
}

export async function listRuns() {
  const response = await apiFetch(`/api/runs?limit=${MAX_SAVED_RUNS}`, {
    credentials: "same-origin"
  });
  const data = await parseJsonResponse(response);
  return Array.isArray(data.results) ? data.results.slice(0, MAX_SAVED_RUNS) : [];
}

export async function loadRun(runId) {
  const response = await apiFetch(`/api/runs/${runId}`, {
    credentials: "same-origin"
  });
  const data = await parseJsonResponse(response);
  const state = hydrateDungeonState(data.state_json);
  state.run.id = data.id;
  state.run.revision = data.revision;
  state.run.lastSavedAt = data.updated_at || data.created_at || null;
  return {
    ...data,
    state_json: state,
    name: state.run.name || `Level ${data.level} - Seed ${data.seed}`
  };
}

export async function listRunsWithNames() {
  return listRuns();
}

export async function createRun(name, state) {
  const saveName = normalizeSaveName(name);
  const stateJson = serializeDungeonState({
    ...state,
    run: {
      ...state.run,
      name: saveName
    }
  });
  const response = await apiFetch("/api/runs", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seed: state.seed,
      level: state.level,
      state_json: stateJson
    })
  });
  return parseJsonResponse(response);
}

export async function updateRun(runId, name, state, revision = state.run?.revision) {
  const saveName = normalizeSaveName(name);
  const stateJson = serializeDungeonState({
    ...state,
    run: {
      ...state.run,
      id: runId,
      name: saveName
    }
  });
  const response = await apiFetch(`/api/runs/${runId}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revision,
      seed: state.seed,
      level: state.level,
      state_json: stateJson
    })
  });
  return parseJsonResponse(response);
}

export async function createSavedCharacter(name, character) {
  const response = await apiFetch("/api/characters", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      character_json: clonePlain(character)
    })
  });
  return parseJsonResponse(response);
}

export async function listSavedCharacters() {
  const response = await apiFetch(`/api/characters?limit=${MAX_SAVED_CHARACTERS}`, {
    credentials: "same-origin"
  });
  const data = await parseJsonResponse(response);
  return Array.isArray(data.results) ? data.results.slice(0, MAX_SAVED_CHARACTERS) : [];
}

export async function loadSavedCharacter(characterId) {
  const response = await apiFetch(`/api/characters/${characterId}`, {
    credentials: "same-origin"
  });
  return parseJsonResponse(response);
}

export async function importShadowdarklingsCharacter(options = {}) {
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      const error = new Error("Character import took too long. Please try again.");
      error.name = "AbortError";
      reject(error);
    }, SHADOWDARKLINGS_IMPORT_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      apiFetch("/api/shadowdarklings/import", {
        method: "POST",
        credentials: "same-origin",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_classes_only: options.baseClassesOnly === true,
          room_id: options.roomId || null
        })
      }),
      deadline
    ]);
    const data = await parseJsonResponse(
      response,
      "The character import server timed out. Please try again.",
      "Your guest dungeon session could not be verified. Rejoin with the 4-character code; no account is required."
    );
    return typeof data.character_json === "string" ? data.character_json : "";
  } catch (error) {
    if (isStaticS3WebsiteHost()) {
      throw new Error("Character import requires the app backend at https://ctreeder.com/site/.");
    }
    if (error?.name === "AbortError") {
      throw new Error("Character import took too long. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export { MAX_SAVE_NAME_LENGTH, MAX_SAVED_RUNS, MAX_SAVED_CHARACTERS };
