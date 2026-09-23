/**
 * API client.
 *
 * A thin fetch wrapper that:
 *  - attaches the access JWT and an X-Request-Id
 *  - unwraps the { success, data, error, requestId } envelope
 *  - silently refreshes an expired access token once (rotating refresh token) and retries
 *  - sends an Idempotency-Key with every mutating game action so retries/double-clicks are safe
 *  - normalises network failures into in-world errors
 *  - notifies the auth layer on a terminal 401 so the session can be torn down
 */

const TOKEN_KEY = 'lostatsql.token';
const REFRESH_KEY = 'lostatsql.refresh';
const BASE = import.meta.env.VITE_API_BASE || '/api';

let unauthorizedHandler = null;
let refreshing = null;

export class ApiClientError extends Error {
  constructor(status, code, message, details, requestId) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

const storage = (key) => ({
  get() {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      /* storage unavailable — session lives in memory only */
    }
  },
});

export const tokenStore = storage(TOKEN_KEY);
export const refreshStore = storage(REFRESH_KEY);

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function rawRequest(method, path, body, { signal, timeoutMs = 20000, headers: extra = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  const headers = { Accept: 'application/json', 'X-Request-Id': newIdempotencyKey(), ...extra };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'same-origin',
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new ApiClientError(0, 'TIMEOUT', 'The server did not respond in time.');
    throw new ApiClientError(0, 'NETWORK', 'CONNECTION INTERRUPTED');
  }
  clearTimeout(timer);

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  return { res, payload, token };
}

async function refreshAccessToken() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = refreshStore.get();
    const { res, payload } = await rawRequest('POST', '/auth/refresh', refreshToken ? { refreshToken } : {}, { timeoutMs: 10000 });
    if (!res.ok || !payload?.success) return null;
    tokenStore.set(payload.data.token);
    if (payload.data.refreshToken) refreshStore.set(payload.data.refreshToken);
    return payload.data.token;
  })()
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request(method, path, body, opts = {}, retried = false) {
  const { res, payload, token } = await rawRequest(method, path, body, opts);
  if (res.ok && payload && payload.success !== false) return payload.data;

  const error = payload?.error || {};
  const code = error.code || (res.status === 429 ? 'RATE_LIMITED' : `HTTP_${res.status}`);
  const message = error.message || (res.status >= 500 ? 'Internal server fault.' : 'Request failed.');

  if (res.status === 401 && token && code === 'TOKEN_EXPIRED' && !retried && !path.startsWith('/auth/')) {
    const fresh = await refreshAccessToken();
    if (fresh) return request(method, path, body, opts, true);
  }
  if (res.status === 401 && token && code !== 'INVALID_CREDENTIALS' && unauthorizedHandler) unauthorizedHandler(code);
  throw new ApiClientError(res.status, code, message, error.details, payload?.requestId);
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body ?? {}, opts),
  put: (path, body, opts) => request('PUT', path, body ?? {}, opts),
  patch: (path, body, opts) => request('PATCH', path, body ?? {}, opts),
  delete: (path, opts) => request('DELETE', path, undefined, opts),
};

/** POST with a fresh Idempotency-Key — for game actions a double-click must not repeat. */
const idempotentPost = (path, body, opts = {}) => api.post(path, body, { ...opts, headers: { 'Idempotency-Key': newIdempotencyKey(), ...(opts.headers || {}) } });

/* ------------------------------------------------------- typed helpers */

export const authApi = {
  login: (investigatorId, accessCode) => api.post('/auth/login', { investigatorId, accessCode }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout', refreshStore.get() ? { refreshToken: refreshStore.get() } : {}),
};

export const publicApi = {
  eventState: () => api.get('/event/state'),
  health: () => api.get('/health'),
};

export const investigationApi = {
  briefing: () => api.get('/investigation/briefing'),
  start: () => idempotentPost('/investigation/start', {}),
  session: () => api.get('/investigation/session'),
  /* exam-integrity flag — fire and forget, never blocks the participant */
  proctor: (body) => api.post('/investigation/proctor', body, { timeoutMs: 6000 }),
  currentFile: () => api.get('/investigation/current-file'),
  progress: () => api.get('/investigation/progress'),
  history: (limit = 50) => api.get(`/investigation/queries?limit=${limit}`),

  caseFile: (code) => api.get(`/cases/${encodeURIComponent(code)}`),
  caseSchema: (code) => api.get(`/cases/${encodeURIComponent(code)}/schema`),
  query: (code, sql) => api.post(`/cases/${encodeURIComponent(code)}/query`, { sql }, { timeoutMs: 15000 }),
  useHint: (code, hintId) => idempotentPost(`/cases/${encodeURIComponent(code)}/hints/${encodeURIComponent(hintId)}/use`, {}),
  submit: (code, body) => idempotentPost(`/cases/${encodeURIComponent(code)}/submit`, body, { timeoutMs: 15000 }),

  finalStatus: () => api.get('/final'),
  finalQuery: (sql) => api.post('/final/query', { sql }, { timeoutMs: 15000 }),
  finalSubmit: (answers) => idempotentPost('/final/submit', answers),

  evidence: () => api.get('/evidence'),
  evidenceItem: (code) => api.get(`/evidence/${encodeURIComponent(code)}`),
  schema: () => api.get('/database/schema'),
  sample: (table, limit = 5) => api.get(`/database/tables/${table}/sample?limit=${limit}`),
  leaderboard: (limit = 100) => api.get(`/leaderboard?limit=${limit}`),
};

const qs = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  monitor: () => api.get('/admin/monitor'),
  sessions: (params) => api.get(`/admin/sessions${qs(params)}`),
  session: (id) => api.get(`/admin/sessions/${id}`),
  adjustScore: (id, amount, reason) => api.post(`/admin/sessions/${id}/adjust-score`, { amount, reason }),
  proctorUnlock: (id, reset = false) => api.post(`/admin/sessions/${id}/proctor/unlock`, { reset }),
  disqualify: (id, reason) => api.post(`/admin/sessions/${id}/disqualify`, { reason }),
  reinstate: (id) => api.post(`/admin/sessions/${id}/reinstate`),
  ledgerCheck: () => api.get('/admin/sessions-ledger-check'),
  audit: (params) => api.get(`/admin/audit-logs${qs(params)}`),
  queries: (params) => api.get(`/admin/query-attempts${qs(params)}`),
  leaderboard: () => api.get('/admin/leaderboard'),
  recomputeLeaderboard: () => api.post('/admin/leaderboard/recompute'),

  participants: (params) => api.get(`/admin/participants${qs(params)}`),
  participant: (id) => api.get(`/admin/participants/${id}`),
  createParticipant: (data) => api.post('/admin/participants', data),
  bulkCreateParticipants: (participants) => api.post('/admin/participants/bulk', { participants }),
  updateParticipant: (id, data) => api.patch(`/admin/participants/${id}`, data),
  resetCredentials: (id, accessCode) => api.post(`/admin/participants/${id}/reset-credentials`, accessCode ? { accessCode } : {}),
  resetProgress: (id) => api.post(`/admin/participants/${id}/reset-progress`),
  removeParticipant: (id) => api.delete(`/admin/participants/${id}`),

  teams: () => api.get('/admin/teams'),
  createTeam: (data) => api.post('/admin/teams', data),
  updateTeam: (id, data) => api.patch(`/admin/teams/${id}`, data),
  deleteTeam: (id) => api.delete(`/admin/teams/${id}`),

  cases: () => api.get('/admin/cases'),
  answers: () => api.get('/admin/answers', { timeoutMs: 30000 }),
  createCase: (data) => api.post('/admin/cases', data),
  updateCase: (id, data) => api.patch(`/admin/cases/${id}`, data),
  reorderCases: (orderedIds) => api.post('/admin/cases/reorder', { orderedIds }),
  deleteCase: (id) => api.delete(`/admin/cases/${id}`),
  createChallenge: (caseId, data) => api.post(`/admin/cases/${caseId}/challenges`, data),
  updateChallenge: (id, data) => api.patch(`/admin/challenges/${id}`, data),
  deleteChallenge: (id) => api.delete(`/admin/challenges/${id}`),
  createHint: (challengeId, data) => api.post(`/admin/challenges/${challengeId}/hints`, data),
  updateHint: (id, data) => api.patch(`/admin/hints/${id}`, data),
  deleteHint: (id) => api.delete(`/admin/hints/${id}`),
  evidence: () => api.get('/admin/evidence'),
  upsertEvidence: (data) => api.put('/admin/evidence', data),
  deleteEvidence: (code) => api.delete(`/admin/evidence/${code}`),

  tables: () => api.get('/admin/database/tables'),
  table: (name, params) => api.get(`/admin/database/tables/${name}${qs(params)}`),
  importTables: (tables, replace = false) => api.post('/admin/database/import', { tables, replace }, { timeoutMs: 60000 }),
  validateTables: (tables) => api.post('/admin/database/validate', { tables }, { timeoutMs: 60000 }),
  updateTable: (name, data) => api.patch(`/admin/database/tables/${name}`, data),
  deleteTable: (name) => api.delete(`/admin/database/tables/${name}`),
  resetDatabase: () => api.post('/admin/database/reset', {}, { timeoutMs: 60000 }),

  event: () => api.get('/admin/event'),
  updateEvent: (data) => api.patch('/admin/event', data),
  readyEvent: () => api.post('/admin/event/ready'),
  scheduleEvent: (startsAt) => api.post('/admin/event/schedule', { startsAt }),
  startEvent: () => api.post('/admin/event/start'),
  pauseEvent: () => api.post('/admin/event/pause'),
  resumeEvent: () => api.post('/admin/event/resume'),
  extendEvent: (minutes) => api.post('/admin/event/extend', { minutes }),
  endEvent: () => api.post('/admin/event/end'),
  archiveEvent: () => api.post('/admin/event/archive'),
  resetEvent: (mode, confirm, target) => api.post('/admin/event/reset', { mode, confirm, target }),
  announce: (data) => api.post('/admin/event/announce', data),
};
