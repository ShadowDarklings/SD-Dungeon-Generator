let sessionPromise;

export function getAccountSession(refresh = false) {
  if (refresh || !sessionPromise) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    sessionPromise = fetch('/api/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(readApiResponse)
      .catch((error) => { sessionPromise = null; throw error; })
      .finally(() => clearTimeout(timeout));
  }
  return sessionPromise;
}

export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRFToken', (await getAccountSession()).csrf_token);
    headers.set('Content-Type', 'application/json');
  }
  const send = () => fetch(path, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
  const response = await send();
  if (response.status === 400 && response.headers.get('content-type')?.includes('application/json') &&
      (await response.clone().json()).error === 'csrf_invalid') {
    headers.set('X-CSRFToken', (await getAccountSession(true)).csrf_token);
    return send();
  }
  return response;
}

export async function readApiResponse(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(response.redirected ? 'Sign in to use your saved characters and games.' : 'The server could not complete this request.');
  }
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Request failed.');
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}
