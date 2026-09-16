import { serializeDungeonState } from './persistence.js';
import { apiFetch, readApiResponse } from './api.js';

export function normalizeSessionCode(value) {
  const text = String(value || '').trim();
  try {
    const url = new URL(text);
    return (url.searchParams.get('join') || '').toUpperCase();
  } catch {
    return text.toUpperCase();
  }
}

export async function roomRequest(id, action = '', body = null, method = 'POST') {
  const path = `/api/rooms${id ? `/${encodeURIComponent(id)}` : ''}${action ? `/${action}` : ''}`;
  return readApiResponse(await apiFetch(path, {
    method: body === null ? 'GET' : method,
    ...(body === null ? {} : { body: JSON.stringify(body) })
  }));
}

export const createHostSession = (state, options = {}) => roomRequest('', '', {
  name: state.run?.name || 'Unnamed dungeon', state_json: serializeDungeonState(state), options
});
export const joinHostSession = (value, options = {}) => roomRequest('', 'join', {
  code: normalizeSessionCode(value), display_name: options.displayName || 'Adventurer'
});
export const getHostSession = (id) => roomRequest(id);
export const listJoinedRooms = () => roomRequest('', 'saved');
