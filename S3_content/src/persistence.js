import { normalizeCharacterState } from "./characters.js";

const MAX_SAVE_NAME_LENGTH = 15;
const MAX_SAVED_RUNS = 10;

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

function normalizeRunMeta(raw = {}) {
  return {
    id: raw.id ?? null,
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

export function normalizeSaveName(name) {
  return String(name || "").trim().slice(0, MAX_SAVE_NAME_LENGTH);
}

export function serializeDungeonState(state) {
  const copy = clonePlain({
    ...state,
    visibility: {
      visibleNow: Array.from(state.visibility?.visibleNow || []),
      exploredEver: Array.from(state.visibility?.exploredEver || [])
    }
  });
  copy.run = normalizeRunMeta(state.run);
  copy.timers = {
    ...normalizeTimers(state.timers),
    lastTickAt: null
  };
  copy.wanderingMonsters = normalizeWandering(state.wanderingMonsters);
  normalizeCharacterState(copy);
  return copy;
}

export function hydrateDungeonState(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Saved run did not include a usable dungeon state.");
  }
  const visibleNow = asSet(raw.visibility?.visibleNow);
  const exploredEver = asSet(raw.visibility?.exploredEver);
  const state = clonePlain({
    ...raw,
    visibility: {
      visibleNow: Array.from(visibleNow),
      exploredEver: Array.from(exploredEver)
    }
  });
  state.run = normalizeRunMeta(state.run);
  state.timers = normalizeTimers(state.timers);
  state.wanderingMonsters = normalizeWandering(state.wanderingMonsters);
  state.darkness = {
    pendingDoorKey: state.darkness?.pendingDoorKey || null
  };
  state.lockedDoorAction = state.lockedDoorAction?.doorId ? state.lockedDoorAction : null;
  state.visibility = {
    visibleNow,
    exploredEver
  };
  state.lootLog = {
    entries: Array.isArray(state.lootLog?.entries) ? state.lootLog.entries : [],
    totalValue: Number(state.lootLog?.totalValue) || 0,
    fullyLootedShown: state.lootLog?.fullyLootedShown === true
  };
  normalizeCharacterState(state);
  state.inventory = normalizeInventory(state.inventory);
  return state;
}

async function parseJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(response.redirected ? "Login required before using saved runs." : "Server returned a non-JSON response.");
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || "Saved run request failed.");
  }
  return data;
}

export async function listRuns() {
  const response = await fetch(`/api/runs?limit=${MAX_SAVED_RUNS}`, {
    credentials: "same-origin"
  });
  const data = await parseJsonResponse(response);
  return Array.isArray(data.results) ? data.results.slice(0, MAX_SAVED_RUNS) : [];
}

export async function loadRun(runId) {
  const response = await fetch(`/api/runs/${runId}`, {
    credentials: "same-origin"
  });
  const data = await parseJsonResponse(response);
  const state = hydrateDungeonState(data.state_json);
  state.run.id = data.id;
  state.run.lastSavedAt = data.updated_at || data.created_at || null;
  return {
    ...data,
    state_json: state,
    name: state.run.name || `Level ${data.level} - Seed ${data.seed}`
  };
}

export async function listRunsWithNames() {
  const summaries = await listRuns();
  const detailed = await Promise.allSettled(summaries.map((run) => loadRun(run.id)));
  return detailed.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    const fallback = summaries[index];
    return {
      ...fallback,
      name: `Level ${fallback.level} - Seed ${fallback.seed}`
    };
  });
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
  const response = await fetch("/api/runs", {
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

export async function updateRun(runId, name, state) {
  const saveName = normalizeSaveName(name);
  const stateJson = serializeDungeonState({
    ...state,
    run: {
      ...state.run,
      id: runId,
      name: saveName
    }
  });
  const response = await fetch(`/api/runs/${runId}`, {
    method: "PUT",
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

export async function importShadowdarklingsCharacter() {
  const response = await fetch("/api/shadowdarklings/import", {
    method: "POST",
    credentials: "same-origin"
  });
  const data = await parseJsonResponse(response);
  return typeof data.character_json === "string" ? data.character_json : "";
}

export { MAX_SAVE_NAME_LENGTH, MAX_SAVED_RUNS };
