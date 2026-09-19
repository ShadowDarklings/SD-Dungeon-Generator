import { serializeDungeonState } from './persistence.js';
import { apiFetch, readApiResponse } from './api.js';

const ROOM_REQUEST_TIMEOUT_MS = 10000;

export function normalizeSessionCode(value) {
  const text = String(value || '').trim();
  try {
    const url = new URL(text);
    return (url.searchParams.get('join') || '').toUpperCase();
  } catch {
    return text.toUpperCase();
  }
}

export async function roomRequest(id, action = '', body = null, method = 'POST', options = {}) {
  const query = new URLSearchParams(Object.entries(options.query || {}).filter(([, value]) => value !== null && value !== undefined));
  const path = `/api/rooms${id ? `/${encodeURIComponent(id)}` : ''}${action ? `/${action}` : ''}${query.size ? `?${query}` : ''}`;
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : ROOM_REQUEST_TIMEOUT_MS;
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      const error = new Error('The dungeon server took too long to respond.');
      error.status = 0;
      error.code = 'request_timeout';
      reject(error);
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      apiFetch(path, {
        method: body === null ? 'GET' : method,
        signal: controller.signal,
        keepalive: options.keepalive === true,
        ...(body === null ? {} : { body: JSON.stringify(body) })
      }),
      deadline
    ]);
    return await readApiResponse(response);
  } catch (error) {
    if (timedOut || error?.code === 'request_timeout') throw error;
    if (error?.name === 'AbortError') {
      const cancelled = new Error('Dungeon request cancelled.');
      cancelled.status = 0;
      cancelled.code = 'request_cancelled';
      throw cancelled;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export const createHostSession = (state, options = {}) => roomRequest('', '', {
  name: state.run?.name || 'Unnamed dungeon', state_json: serializeDungeonState(state), options
});
export const joinHostSession = (value, options = {}) => roomRequest('', 'join', {
  code: normalizeSessionCode(value), display_name: options.displayName || 'Adventurer'
});
export const getHostSession = (id, revision = null) => roomRequest(id, '', null, 'GET', {
  query: Number.isInteger(revision) ? { revision } : {}
});
export const listJoinedRooms = () => roomRequest('', 'saved');
