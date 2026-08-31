const PRIMARY_SNAPSHOT_PATH = '/api/dni/comms/snapshot';
const OWNER_SNAPSHOT_PATH = '/sync-runtime-secrets.php?mode=snapshot';
const AUDIT_PATH = '/api/dni/comms/audit';

const emptyLink = () => ({ state: 'idle', httpStatus: 0, error: '', lastCheckedAt: null, lastSuccessAt: null });
const clone = value => JSON.parse(JSON.stringify(value));

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
  links: { primary: emptyLink(), owner: emptyLink() }
};
let csrfToken = '';
let refreshPromise = null;

function emitState(reason = 'update') {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
  globalThis.dispatchEvent(new CustomEvent('dni:comms-state', {
    detail: { snapshot: getCommsSnapshot(), reason, receivedAt: Date.now() }
  }));
}

function successfulLink(previous = {}) {
  const now = new Date().toISOString();
  return { state: 'online', httpStatus: 200, error: '', lastCheckedAt: now, lastSuccessAt: now || previous.lastSuccessAt || null };
}

function standbyLink(previous = {}) {
  return { state: 'standby', httpStatus: 0, error: '', lastCheckedAt: previous.lastCheckedAt || null, lastSuccessAt: previous.lastSuccessAt || null };
}

function failedLink(error, previous = {}) {
  const status = Number(error?.status || 0);
  let linkState = 'network-error';
  if (status === 401) linkState = 'authentication-error';
  else if (status === 403) linkState = 'permission-error';
  else if (status === 404) linkState = 'route-error';
  else if (status >= 500) linkState = 'server-error';
  else if (status >= 400) linkState = 'request-error';
  return {
    state: linkState,
    httpStatus: status,
    error: String(error?.message || 'Communication API request failed.'),
    lastCheckedAt: new Date().toISOString(),
    lastSuccessAt: previous.lastSuccessAt || null
  };
}

async function jsonRequest(path, label, options = {}) {
  let response;
  try {
    response = await fetch(`${path}${options.cacheBust === false ? '' : `${path.includes('?') ? '&' : '?'}_=${Date.now()}`}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', ...(options.headers || {}) },
      ...options.fetch
    });
  } catch (cause) {
    const error = new Error(`${label} network request failed.`);
    error.cause = cause;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function ensureSession() {
  if (csrfToken) return;
  const payload = await jsonRequest('/api/dni/session', 'DNI session', { cacheBust: false });
  if (!payload.authenticated) {
    const error = new Error(payload?.error || 'Discord sign-in required.');
    error.status = 401;
    throw error;
  }
  csrfToken = String(payload.csrfToken || '');
}

async function serverRequest(path, body) {
  await ensureSession();
  const headers = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-DNI-CSRF'] = csrfToken;
  const payload = await jsonRequest(`/api/dni/comms${path}`, 'Primary DNI Communication API', {
    cacheBust: false,
    headers,
    fetch: { method: 'POST', body: JSON.stringify(body ?? {}) }
  });
  state.links.primary = successfulLink(state.links.primary);
  emitState('primary-write');
  return payload;
}

function arrayFrom(payload, names) {
  if (Array.isArray(payload)) return payload;
  for (const name of names) {
    for (const source of [payload, payload?.data, payload?.status, payload?.result]) {
      if (Array.isArray(source?.[name])) return source[name];
    }
  }
  return [];
}

function objectFrom(payload, names) {
  for (const name of names) {
    for (const source of [payload, payload?.data, payload?.result]) {
      if (source?.[name] && typeof source[name] === 'object') return source[name];
    }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function firstFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function countFrom(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    return firstFinite(value.connected, value.connectedCount, value.online, value.onlineCount, value.total, value.count, value.operators, value.clients, value.members);
  }
  return firstFinite(value);
}

function booleanFrom(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on', 'open', 'active', 'tx', 'transmitting'].includes(value.trim().toLowerCase());
  if (value && typeof value === 'object') return booleanFrom(value.active ?? value.open ?? value.transmitting ?? value.isTransmitting ?? value.tx ?? value.count ?? false);
  return false;
}

function assignmentMap(payload) {
  const raw = payload?.assignments ?? payload?.data?.assignments ?? payload?.result?.assignments ?? payload;
  const result = new Map();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const userId = String(item?.userId ?? item?.discordId ?? item?.id ?? '');
      const netUid = String(item?.netUid ?? item?.uid ?? item?.netId ?? '');
      if (userId && netUid) result.set(userId, netUid);
    }
  } else if (raw && typeof raw === 'object' && !raw.unavailable) {
    for (const [userId, value] of Object.entries(raw)) {
      const netUid = typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : String(value?.netUid ?? value?.uid ?? value?.netId ?? '');
      if (netUid) result.set(String(userId), netUid);
    }
  }
  return result;
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

function optionalIssue(source, payload) {
  return payload?.unavailable ? { source, message: String(payload?.error || `${source} unavailable`) } : null;
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
    return {
      uid,
      netUid: uid,
      name: String(net?.name ?? net?.label ?? net?.netName ?? net?.net_name ?? `NET ${index + 1}`),
      members: countFrom(net?.members ?? net?.occupancy ?? net?.connected ?? net?.users) ?? countedMembers,
      tx: booleanFrom(net?.tx ?? net?.transmitting ?? net?.activeTx ?? net?.pttActive ?? net?.isTransmitting)
    };
  });

  const connectedCount = firstFinite(
    status?.connected,
    status?.connectedCount,
    status?.online,
    status?.onlineCount,
    status?.connectedOperators,
    status?.connectedClients,
    countFrom(status?.occupancy),
    roster.length
  );

  const rawEvents = [
    ...arrayFrom(payload.audit, ['audit', 'events', 'entries', 'items', 'calls']),
    ...arrayFrom(status, ['events', 'activity'])
  ].slice(0, 12);
  const events = rawEvents.map((event, index) => {
    const rawTime = String(event?.time ?? event?.timestamp ?? event?.createdAt ?? event?.created_at ?? new Date().toISOString());
    const parsed = new Date(rawTime);
    return {
      time: Number.isNaN(parsed.getTime()) ? rawTime.slice(11, 16) : parsed.toISOString().slice(11, 16),
      type: String(event?.type ?? event?.action ?? event?.method ?? 'LIVE').toUpperCase(),
      text: String(event?.text ?? event?.message ?? event?.summary ?? event?.path ?? event?.endpoint ?? `Star Comms activity ${index + 1}`)
    };
  });

  return {
    available: true,
    shard: String(status?.shardName ?? status?.shard?.name ?? status?.guildName ?? status?.guild?.name ?? status?.name ?? 'DREADNOUGHT IMPERIUM'),
    connectedCount: connectedCount ?? roster.length,
    operationOpen: booleanFrom(status?.operationOpen ?? status?.operation?.open ?? status?.operation ?? status?.open),
    nets,
    roster,
    readyCheck: normalizeReadyCheck(payload.readyChecks, roster.length),
    events,
    issues: [
      optionalIssue('roster', payload.roster),
      optionalIssue('assignments', payload.assignments),
      optionalIssue('ready-checks', payload.readyChecks),
      optionalIssue('metrics', payload.metrics),
      optionalIssue('audit', payload.audit)
    ].filter(Boolean),
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    links: clone(links)
  };
}

async function optionalAudit() {
  try {
    return await jsonRequest(AUDIT_PATH, 'Star Comms audit');
  } catch (error) {
    return { unavailable: true, error: error?.message || 'Star Comms audit unavailable.' };
  }
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
      payload = await jsonRequest(PRIMARY_SNAPSHOT_PATH, 'Primary DNI Communication API');
      state.links.primary = successfulLink(state.links.primary);
      state.links.owner = standbyLink(state.links.owner);
      if (payload.audit === undefined) payload.audit = await optionalAudit();
    } catch (error) {
      primaryError = error;
      state.links.primary = failedLink(error, state.links.primary);
    }

    if (!payload) {
      try {
        payload = await jsonRequest(OWNER_SNAPSHOT_PATH, 'Star Comms Owner API fallback');
        state.links.owner = successfulLink(state.links.owner);
      } catch (error) {
        state.links.owner = failedLink(error, state.links.owner);
      }
    }

    if (payload) {
      state = normalizeSnapshot(payload, state.links);
      emitState(state.links.primary.state === 'online' ? 'refresh-primary' : 'refresh-fallback');
      return getCommsSnapshot();
    }

    state.available = false;
    emitState('refresh-failed');
    const error = new Error(`Primary API: ${primaryError?.message || state.links.primary.error || 'unavailable'} | Fallback: ${state.links.owner.error || 'unavailable'}`);
    error.links = getCommsLinkState();
    throw error;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function applyMutationSnapshot(payload, reason) {
  const snapshot = payload?.snapshot || payload?.networkData || payload?.data || null;
  if (snapshot && typeof snapshot === 'object') state = normalizeSnapshot(snapshot, state.links);
  state.links.primary = successfulLink(state.links.primary);
  emitState(reason);
  return getCommsSnapshot();
}

export async function createNet(name) {
  const clean = String(name || '').trim().slice(0, 64);
  if (!clean) return getCommsSnapshot();
  return applyMutationSnapshot(await serverRequest('/nets', { name: clean }), 'create-net');
}

export async function assignUser(userId, netUid) {
  return applyMutationSnapshot(await serverRequest('/assignments', {
    userId: String(userId),
    netUid: String(netUid),
    action: 'assign'
  }), 'assign-user');
}

export async function startReadyCheck() {
  return applyMutationSnapshot(await serverRequest('/ready-checks/start', {}), 'ready-check');
}

export async function sendAcars(text) {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  return applyMutationSnapshot(await serverRequest('/acars', {
    text: clean,
    senderName: 'DNI Network Control'
  }), 'acars');
}
