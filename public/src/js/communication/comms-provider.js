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
  issues: [],
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

function standbyLink(previous = {}) {
  return {
    state: 'standby',
    httpStatus: 0,
    error: '',
    lastCheckedAt: previous.lastCheckedAt || null,
    lastSuccessAt: previous.lastSuccessAt || null
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
    if (csrfToken) headers['X-DNI-CSRF'] = csrfToken;
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
    if (Array.isArray(payload?.result?.[name])) return payload.result[name];
  }
  return [];
}

function objectFrom(payload, names) {
  for (const name of names) {
    if (payload?.[name] && typeof payload[name] === 'object') return payload[name];
    if (payload?.data?.[name] && typeof payload.data[name] === 'object') return payload.data[name];
    if (payload?.result?.[name] && typeof payload.result[name] === 'object') return payload.result[name];
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function countFrom(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    return firstFinite(
      value.connected,
      value.connectedCount,
      value.online,
      value.onlineCount,
      value.total,
      value.count,
      value.operators,
      value.clients,
      value.members
    );
  }
  return firstFinite(value);
}

function booleanFrom(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on', 'open', 'active', 'tx', 'transmitting'].includes(value.trim().toLowerCase());
  }
  if (value && typeof value === 'object') {
    return booleanFrom(
      value.active ?? value.open ?? value.transmitting ?? value.isTransmitting ?? value.tx ?? value.count ?? false
    );
  }
  return false;
}

function assignmentMap(payload) {
  const raw = payload?.assignments ?? payload?.data?.assignments ?? payload?.result?.assignments ?? payload;
  const map = new Map();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const userId = String(item?.userId ?? item?.discordId ?? item?.id ?? '');
      const netUid = String(item?.netUid ?? item?.uid ?? item?.netId ?? '');
      if (userId && netUid) map.set(userId, netUid);
    }
  } else if (raw && typeof raw === 'object' && !raw.unavailable) {
    for (const [userId, value] of Object.entries(raw)) {
      const netUid = typeof value === 'string' || typeof value === 'number'
        ? String(value) : String(value?.netUid ?? value?.uid ?? value?.netId ?? '');
      if (netUid) map.set(String(userId), netUid);
    }
  }
  return map;
}

function normalizeReadyCheck(payload, fallbackTotal) {
  if (payload?.unavailable) return { active: false, ready: 0, declined: 0, afk: 0, total: fallbackTotal || 0 };
  const body = objectFrom(payload, ['session', 'readyCheck', 'activeSession', 'active']);
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
    active: booleanFrom(body?.active ?? body?.isActive ?? payload?.active),
    ready: Number(body?.ready ?? payload?.ready ?? 0),
    declined: Number(body?.declined ?? payload?.declined ?? 0),
    afk: Number(body?.afk ?? payload?.afk ?? 0),
    total: Number(body?.total ?? payload?.total ?? fallbackTotal ?? 0)
  };
}

function optionalIssue(name, payload) {
  if (!payload?.unavailable) return null;
  return {
    source: name,
    message: String(payload?.error || `${name} unavailable`)
  };
}

function normalizeSnapshot(payload, links = state.links) {
  const status = objectFrom(payload.status, ['status']);
  const assignments = assignmentMap(payload.assignments);
  const rawRoster = arrayFrom(payload.roster, ['roster', 'members', 'users', 'clients', 'connected', 'operators']);
  const roster = rawRoster.map((user, index) => {
    const userId = String(user?.userId ?? user?.discordId ?? user?.discordUserId ?? user?.id ?? `user-${index + 1}`);
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const firstRole = roles[0];
    return {
      id: userId,
      userId,
      name: String(user?.displayName ?? user?.display_name ?? user?.name ?? user?.username ?? user?.globalName ?? user?.global_name ?? userId),
      role: String(user?.roleName ?? user?.role ?? user?.primaryRole ?? (typeof firstRole === 'string' ? firstRole : firstRole?.name) ?? 'Member'),
      netUid: String(user?.netUid ?? user?.net?.uid ?? user?.assignment?.netUid ?? assignments.get(userId) ?? '')
    };
  });

  const rawNets = arrayFrom(status, ['nets', 'networks', 'channels', 'radioNets']);
  const nets = rawNets.map((net, index) => {
    const uid = String(net?.netUid ?? net?.uid ?? net?.id ?? `net-${index + 1}`);
    const countedMembers = roster.filter(user => user.netUid === uid).length;
    const members = countFrom(net?.members ?? net?.occupancy ?? net?.connected ?? net?.users);
    return {
      uid,
      netUid: uid,
      name: String(net?.name ?? net?.label ?? net?.netName ?? net?.net_name ?? `NET ${index + 1}`),
      members: members ?? countedMembers,
      tx: booleanFrom(net?.tx ?? net?.transmitting ?? net?.activeTx ?? net?.pttActive ?? net?.isTransmitting)
    };
  });

  const occupancyCount = countFrom(status?.occupancy);
  const connectedCount = firstFinite(
    status?.connected,
    status?.connectedCount,
    status?.online,
    status?.onlineCount,
    status?.connectedOperators,
    status?.connectedClients,
    occupancyCount,
    roster.length
  );

  const rawEvents = [
    ...arrayFrom(payload.audit, ['audit', 'events', 'entries', 'items', 'calls']),
    ...arrayFrom(status, ['events', 'activity'])
  ].slice(0, 12);
  const events = rawEvents.map((event, index) => {
    const rawTime = String(event?.time ?? event?.timestamp ?? event?.createdAt ?? event?.created_at ?? new Date().toISOString());
    const parsed = new Date(rawTime);
    const time = Number.isNaN(parsed.getTime()) ? rawTime.slice(11, 16) : parsed.toISOString().slice(11, 16);
    return {
      time,
      type: String(event?.type ?? event?.action ?? event?.method ?? 'LIVE').toUpperCase(),
      text: String(event?.text ?? event?.message ?? event?.summary ?? event?.path ?? event?.endpoint ?? `Star Comms activity ${index + 1}`)
    };
  });

  const issues = [
    optionalIssue('roster', payload.roster),
    optionalIssue('assignments', payload.assignments),
    optionalIssue('ready-checks', payload.readyChecks),
    optionalIssue('metrics', payload.metrics),
    optionalIssue('audit', payload.audit)
  ].filter(Boolean);

  return {
    available: true,
    shard: String(status?.shardName ?? status?.shard?.name ?? status?.guildName ?? status?.guild?.name ?? status?.name ?? 'DREADNOUGHT IMPERIUM'),
    connectedCount: connectedCount ?? roster.length,
    operationOpen: booleanFrom(status?.operationOpen ?? status?.operation?.open ?? status?.operation ?? status?.open),
    nets,
    roster,
    readyCheck: normalizeReadyCheck(payload.readyChecks, roster.length),
    events,
    issues,
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
    let payload = null;
    let primaryError = null;

    try {
      payload = await snapshotRequest(PRIMARY_SNAPSHOT_PATH, 'Primary DNI Communication API');
      state.links.primary = successfulLink(state.links.primary);
      state.links.owner = standbyLink(state.links.owner);
    } catch (error) {
      primaryError = error;
      const previousSuccess = state.links.primary?.lastSuccessAt || null;
      state.links.primary = { ...linkStateFromError(error), lastSuccessAt: previousSuccess };
    }

    if (!payload) {
      try {
        payload = await snapshotRequest(OWNER_SNAPSHOT_PATH, 'Star Comms Owner API fallback');
        state.links.owner = successfulLink(state.links.owner);
      } catch (error) {
        const previousSuccess = state.links.owner?.lastSuccessAt || null;
        state.links.owner = { ...linkStateFromError(error), lastSuccessAt: previousSuccess };
      }
    }

    if (payload) {
      state = normalizeSnapshot(payload, state.links);
      emitState(state.links.primary.state === 'online' ? 'refresh-primary' : 'refresh-fallback');
      return getCommsSnapshot();
    }

    state.available = false;
    emitState('refresh-failed');
    const primaryMessage = primaryError?.message || state.links.primary.error || 'primary API unavailable';
    const ownerMessage = state.links.owner.error || 'fallback unavailable';
    const error = new Error(`Primary API: ${primaryMessage} | Fallback: ${ownerMessage}`);
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
  const payload = await serverRequest('/assignments', {
    method: 'POST',
    body: JSON.stringify({ userId: String(userId), netUid: String(netUid), action: 'assign' })
  });
  return applyMutationSnapshot(payload, 'assign-user');
}

export async function startReadyCheck() {
  const payload = await serverRequest('/ready-checks/start', { method: 'POST', body: '{}' });
  return applyMutationSnapshot(payload, 'ready-check');
}

export async function sendAcars(text) {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  const payload = await serverRequest('/acars', {
    method: 'POST',
    body: JSON.stringify({ text: clean, senderName: 'DNI Network Control' })
  });
  return applyMutationSnapshot(payload, 'acars');
}
