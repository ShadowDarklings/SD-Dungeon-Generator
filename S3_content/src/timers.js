export const TORCH_DURATION_MS = 60 * 60 * 1000;
export const TORCH_SEARCH_ADVANCE_MS = 10 * 60 * 1000;
export const WANDERING_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export function ensureTimers(state) {
  state.timers = {
    actualElapsedMs: Math.max(0, Number(state.timers?.actualElapsedMs) || 0),
    torchElapsedMs: Math.max(0, Number(state.timers?.torchElapsedMs) || 0),
    torchDurationMs: Math.max(1, Number(state.timers?.torchDurationMs) || TORCH_DURATION_MS),
    nextWanderingCheckMs: Math.max(
      WANDERING_CHECK_INTERVAL_MS,
      Number(state.timers?.nextWanderingCheckMs) || WANDERING_CHECK_INTERVAL_MS
    ),
    lastTickAt: Number(state.timers?.lastTickAt) || Date.now()
  };
  return state.timers;
}

export function syncElapsedTime(state, now = Date.now()) {
  const timers = ensureTimers(state);
  const elapsed = Math.max(0, now - timers.lastTickAt);
  timers.lastTickAt = now;
  timers.actualElapsedMs += elapsed;
  if (!state.player.torchLit) {
    return { crossedWanderingChecks: 0, expired: false };
  }
  return advanceTorchTime(state, elapsed);
}

export function advanceTorchTime(state, milliseconds) {
  const timers = ensureTimers(state);
  const start = timers.torchElapsedMs;
  timers.torchElapsedMs += Math.max(0, milliseconds);

  let crossedWanderingChecks = 0;
  while (timers.torchElapsedMs >= timers.nextWanderingCheckMs) {
    crossedWanderingChecks += 1;
    timers.nextWanderingCheckMs += WANDERING_CHECK_INTERVAL_MS;
  }

  const expired = state.player.torchLit && timers.torchElapsedMs >= timers.torchDurationMs;
  if (expired) {
    state.player.torchLit = false;
    timers.torchElapsedMs = Math.max(timers.torchElapsedMs, timers.torchDurationMs);
  }

  return {
    crossedWanderingChecks,
    expired,
    advancedMs: timers.torchElapsedMs - start
  };
}

export function lightNewTorch(state) {
  const timers = ensureTimers(state);
  timers.torchElapsedMs = 0;
  timers.nextWanderingCheckMs = WANDERING_CHECK_INTERVAL_MS;
  timers.lastTickAt = Date.now();
  state.player.torchLit = true;
  state.darkness = {
    ...state.darkness,
    pendingDoorKey: null
  };
}

export function forceTorchOut(state) {
  ensureTimers(state).lastTickAt = Date.now();
  state.player.torchLit = false;
  state.darkness = {
    ...state.darkness,
    pendingDoorKey: null
  };
}

export function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatTorchRemaining(state) {
  const timers = ensureTimers(state);
  const remaining = Math.max(0, timers.torchDurationMs - timers.torchElapsedMs);
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
