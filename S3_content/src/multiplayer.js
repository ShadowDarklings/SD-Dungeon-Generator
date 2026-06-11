import { serializeDungeonState } from "./persistence.js";

const MULTIPLAYER_BASE_PATH = "/api/multiplayer/sessions";

function normalizeSessionCode(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text, window.location.origin);
    return url.searchParams.get("session") || url.pathname.split("/").filter(Boolean).pop() || text;
  } catch {
    return text;
  }
}

function inviteUrlForCode(code) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", code);
  return url.toString();
}

async function parseMultiplayerResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (response.status === 404) {
      throw new Error("Multiplayer backend is not connected yet.");
    }
    throw new Error(response.redirected ? "Login required before multiplayer." : "Server returned a non-JSON multiplayer response.");
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || "Multiplayer request failed.");
  }
  return data;
}

function buildSessionPayload(state, hostCharacterId = null) {
  return {
    seed: state?.seed,
    level: state?.level,
    host_character_id: hostCharacterId,
    state_json: serializeDungeonState(state)
  };
}

export async function createHostSession(state, options = {}) {
  const response = await fetch(MULTIPLAYER_BASE_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSessionPayload(state, options.hostCharacterId || null))
  });
  const data = await parseMultiplayerResponse(response);
  const code = data.invite_code || data.code || data.session_code || data.id;
  return {
    ...data,
    invite_code: code,
    invite_url: data.invite_url || (code ? inviteUrlForCode(code) : "")
  };
}

export async function joinHostSession(inviteValue, options = {}) {
  const code = normalizeSessionCode(inviteValue);
  if (!code) {
    throw new Error("Enter a host invite code or link.");
  }
  const response = await fetch(`${MULTIPLAYER_BASE_PATH}/${encodeURIComponent(code)}/join`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      character_id: options.characterId || null,
      display_name: options.displayName || ""
    })
  });
  const data = await parseMultiplayerResponse(response);
  return {
    ...data,
    invite_code: data.invite_code || data.code || code,
    invite_url: data.invite_url || inviteUrlForCode(data.invite_code || data.code || code)
  };
}

export async function getHostSession(inviteValue) {
  const code = normalizeSessionCode(inviteValue);
  if (!code) {
    throw new Error("No multiplayer session code is active.");
  }
  const response = await fetch(`${MULTIPLAYER_BASE_PATH}/${encodeURIComponent(code)}`, {
    credentials: "same-origin"
  });
  const data = await parseMultiplayerResponse(response);
  return {
    ...data,
    invite_code: data.invite_code || data.code || code,
    invite_url: data.invite_url || inviteUrlForCode(data.invite_code || data.code || code)
  };
}

export async function assignSessionCharacter(inviteValue, playerId, characterId) {
  const code = normalizeSessionCode(inviteValue);
  if (!code) {
    throw new Error("No multiplayer session code is active.");
  }
  if (!playerId || !characterId) {
    throw new Error("Choose both a player and a dot.");
  }
  const response = await fetch(`${MULTIPLAYER_BASE_PATH}/${encodeURIComponent(code)}/assignments`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      character_id: characterId
    })
  });
  return parseMultiplayerResponse(response);
}

export { inviteUrlForCode, normalizeSessionCode };
