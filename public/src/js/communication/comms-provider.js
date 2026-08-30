const PRIMARY_SNAPSHOT_PATH = '/api/dni/comms/snapshot';
const OWNER_SNAPSHOT_PATH = '/sync-runtime-secrets.php?mode=snapshot';

const emptyLink = () => ({
  state: 'idle',
  httpStatus: 0,
  error: '',
  lastCheckedAt: null,
  lastSuccessAt: null
});

let state = {
  available: false,
  shard: 'UNAVAILABLE',
  connectedCount: 0,
  operationOpen: false,
  nets: [],
  roster: [],
  readyCheck: { active: false, ready: 0, declined: 0, afk: 0, total: 0 },
  events: [],
  links: {
    primary: emptyLink(),
    owner: emptyLink()
  }
};
let csrfToken = '';
let refreshPromise = null;

const clone = value => JSON.parse(JSON.stringify(value));

function emitState(reason = 'update') {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
  globalThis.dispatchEvent(new CustomEvent('dni:comms-state', {
    detail: { snapshot: getCommsSnapshot(), reason, receivedAt: Date.now() }
  }));
}

function linkStateFromError(error) {
  const status = Number(error?.status || 0);
  let stateName = 'network-error';
  if (status === 401) stateName = 'authentication-error';
  else if (status === 403) stateName = 'permission-error';
  else if (status === 404) stateName = 'route-error';
  else if (status >= 500) stateName = 'server-error';
  else if (status >= 400) stateName = 'request-error';
  return {
    state: stateName,
    httpStatus: status,
    error: String(error?.message || 'Communication API request failed.'),
    lastCheckedAt: new Date().toISOString(),
    lastSuccessAt: null
  };
}

function successfulLink(previous = {}) {
  const now = new Date().toISOString();
  return {
    state: 'online',
    httpStatus: 200,
    error: '',
    lastCheckedAt: now,
    lastSuccessAt: now || previous.lastSuccessAt || null
  };
}

async function ensureSession() {
  if (csrfToken) return;
  const response = await fetch('/api/dni/session', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.authenticated) {
    const error = new Error(payload?.error || 'Discord sign-in required.');
    error.status = response.status || 401;
    throw error;
  }
  csrfToken = String(payload.csrfToken || '');
}

async function serverRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.method && options.method !== 'GET') {
    await ensureSession();
    headers['X-DNI-CSRF'] = csrfToken;
  }
  let response;
  try {
    response = await fetch(`/api/dni/comms${path}`, {
      credentials: 'same-origin', cache: 'no-store', ...options, headers
    });
  } catch (cause) {
    const error = new Error('Primary DNI Communication API network request failed.');
    error.cause = cause;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  state.links.primary = successfulLink(state.links.primary);
  emitState('primary-write');
  return payload;
}

async function snapshotRequest(path, label) {
  let response;
  try {
    response = await fetch(`${path}${path.includes('?') ? '&' : '?'}_=${Date.now()}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
    });
  } catch (cause) {
    const error = new Error(`${label} network request failed.`);
    error.cause = cause;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function arrayFrom(payload, names) {
  if (Array.isArray(payload)) return payload;
  for (const name of names) {
    if (Array.isArray(payload?.[name])) return payload[name];
    if (Array.isArray(payload?.data?.[name])) return payload.data[name];
    if (Array.isArray(payload?.status?.[name])) return payload.status[name];
  }
  return [];
}

function objectFrom(payload, names) {
  for (const name of names) {
    if (payload?.[name] && typeof payload[name] === 'object') return payload[name];
    if (payload?.data?.[name] && typeof payload.data[name] === 'object') return payload.data[name];
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function assignmentMap(payload) {
  const raw = payload?.assignments ?? payload?.data?.assignments ?? payload;
  const map = new Map();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const userId = String(item?.userId ?? item?.id ?? '');
      const netUid = String(item?.netUid ?? item?.uid ?? item?.netId ?? '');
      if (userId && netUid) map.set(userId, netUid);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [userId, value] of Object.entries(raw)) {
      const netUid = typeof value === 'string' || typeof value === 'number'
        ? String(value) : String(value?.netUid ?? value?.uid ?? value?.netId ?? '');
      if (netUid) map.set(String(userId), netUid);
    }
  }
  return map;
}

function normalizeReadyCheck(payload, fallbackTotal) {
  const body = objectFrom(payload, ['session', 'readyCheck', 'active']);
  const responses = arrayFrom(body, ['responses', 'members', 'results']);
  if (responses.length) {
    const values = responses.map(item => String(item?.status ?? item?.response ?? '').toLowerCase());
    return {
      active: true,
      ready: values.filter(value => value === 'ready').length,
      declined: values.filter(value => value === 'declined' || value === 'decline').length,
      afk: values.filter(value => value === 'afk').length,
      total: responses.length
    };
  }
  return {
    active: Boolean(body?.active ?? body?.isActive ?? payload?.active),
    ready: Number(body?.ready ?? payload?.ready ?? 0),
    declined: Number(body?.declined ?? payload?.declined ?? 0),
    afk: Number(body?.afk ?? payload?.afk ?? 0),
    total: Number(body?.total ?? payload?.total ?? fallbackTotal ?? 0)
  };
}

function normalizeSnapshot(payload, links = state.links) {
  const status = objectFrom(payload.status, ['status']);
  const assignments = assignmentMap(payload.assignments);
  const rawRoster = arrayFrom(payload.roster, ['roster', 'members', 'users', 'clients']);
  const roster = rawRoster.map((user, index) => {
    const userId = String(user?.userId ?? user?.discordId ?? user?.id ?? `user-${index + 1}`);
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const firstRole = roles[0];
    return {
      id: userId,
      userId,
      name: String(user?.displayName ?? user?.name ?? user?.username ?? user?.globalName ?? userId),
      role: String(user?.roleName ?? user?.role ?? (typeof firstRole === 'string' ? firstRole : firstRole?.name) ?? 'Member'),
      netUid: String(user?.netUid ?? user?.net?.uid ?? assignments.get(userId) ?? '')
    };
  });
  const rawNets = arrayFrom(status, ['nets', 'networks', 'channels']);
  const nets = rawNets.map((net, index) => {
    const uid = String(net?.netUid ?? net?.uid ?? net?.id ?? `net-${index + 1}`);
    const countedMembers = roster.filter(user => user.netUid === uid).length;
    return {
      uid,
      netUid: uid,
      name: String(net?.name ?? net?.label ?? net?.netName ?? `NET ${index + 1}`),
      members: Number(net?.members ?? net?.memberCount ?? net?.occupancy ?? countedMembers),
      tx: Boolean(net?.tx ?? net?.transmitting ?? net?.activeTx ?? net?.pttActive)
    };
  });
  const connectedCount = Number(status?.connected ?? status?.connectedCount ?? status?.online ?? status?.onlineCount ?? roster.length);
  const events = arrayFrom(status, ['events', 'activity']).slice(0, 12).map((event, index) => ({
    time: String(event?.time ?? event?.timestamp ?? new Date().toISOString()).slice(11, 16),
    type: String(event?.type ?? 'LIVE').toUpperCase(),
    text: String(event?.text ?? event?.message ?? `Star Comms activity ${index + 1}`)
  }));
  return {
    available: true,
    shard: String(status?.shardName ?? status?.shard?.name ?? status?.guildName ?? status?.guild?.name ?? 'DREADNOUGHT IMPERIUM'),
    connectedCount: Number.isFinite(connectedCount) ? connectedCount : roster.length,
    operationOpen: Boolean(status?.operationOpen ?? status?.operation?.open ?? status?.open ?? false),
    nets,
    roster,
    readyCheck: normalizeReadyCheck(payload.readyChecks, roster.length),
    events,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    links: clone(links)
  };
}

export function getCommsSnapshot() {
  return clone(state);
}

export function getCommsLinkState() {
  return clone(state.links);
}

export async function refreshComms() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const [primaryResult, ownerResult] = await Promise.allSettled([
      snapshotRequest(PRIMARY_SNAPSHOT_PATH, 'Primary DNI Communication API'),
      snapshotRequest(OWNER_SNAPSHOT_PATH, 'Star Comms Owner API')
    ]);

    let payload = null;
    if (primaryResult.status === 'fulfilled') {
      state.links.primary = successfulLink(state.links.primary);
      payload = primaryResult.value;
    } else {
      const previousSuccess = state.links.primary?.lastSuccessAt || null;
      state.links.primary = { ...linkStateFromError(primaryResult.reason), lastSuccessAt: previousSuccess };
    }

    if (ownerResult.status === 'fulfilled') {
      state.links.owner = successfulLink(state.links.owner);
      if (!payload) payload = ownerResult.value;
    } else {
      const previousSuccess = state.links.owner?.lastSuccessAt || null;
      state.links.owner = { ...linkStateFromError(ownerResult.reason), lastSuccessAt: previousSuccess };
    }

    if (payload) {
      state = normalizeSnapshot(payload, state.links);
      emitState('refresh-success');
      return getCommsSnapshot();
    }

    state.available = false;
    emitState('refresh-failed');
    const primaryError = state.links.primary.error || 'primary API unavailable';
    const ownerError = state.links.owner.error || 'Owner API unavailable';
    const error = new Error(`Primary API: ${primaryError} | Owner API: ${ownerError}`);
    error.links = getCommsLinkState();
    throw error;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function snapshotFromMutation(payload) {
  return payload?.snapshot || payload?.networkData || payload?.data || null;
}

function applyMutationSnapshot(payload, reason) {
  const snapshot = snapshotFromMutation(payload);
  if (snapshot && typeof snapshot === 'object') state = normalizeSnapshot(snapshot, state.links);
  state.links.primary = successfulLink(state.links.primary);
  emitState(reason);
  return getCommsSnapshot();
}

export async function createNet(name) {
  const clean = String(name || '').trim().slice(0, 64);
  if (!clean) return getCommsSnapshot();
  const payload = await serverRequest('/nets', { method: 'POST', body: JSON.stringify({ name: clean }) });
  return applyMutationSnapshot(payload, 'create-net');
}

export async function assignUser(userId, netUid) {
  const payload = await serverRequest('/assignments', { method: 'POST', body: JSON.stringify({ userId, netUid }) });
  return applyMutationSnapshot(payload, 'assign-user');
}

export async function startReadyCheck() {
  const payload = await serverRequest('/ready-checks/start', { method: 'POST', body: '{}' });
  return applyMutationSnapshot(payload, 'ready-check');
}

export async function sendAcars(text) {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  const payload = await serverRequest('/acars', { method: 'POST', body: JSON.stringify({ text: clean }) });
  return applyMutationSnapshot(payload, 'acars');
}
