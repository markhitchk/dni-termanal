let state = {
  available: false,
  shard: 'UNAVAILABLE',
  connectedCount: 0,
  operationOpen: false,
  nets: [],
  roster: [],
  readyCheck: { active: false, ready: 0, declined: 0, afk: 0, total: 0 },
  events: []
};
let csrfToken = '';

const clone = value => JSON.parse(JSON.stringify(value));

async function ensureSession() {
  if (csrfToken) return;
  const response = await fetch('/api/dni/session', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.authenticated) throw new Error(payload?.error || 'Discord sign-in required.');
  csrfToken = String(payload.csrfToken || '');
}

async function serverRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.method && options.method !== 'GET') {
    await ensureSession();
    headers['X-DNI-CSRF'] = csrfToken;
  }
  const response = await fetch(`/api/dni/comms${path}`, {
    credentials: 'same-origin', cache: 'no-store', ...options, headers
  });
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

function normalizeSnapshot(payload) {
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
    fetchedAt: payload.fetchedAt || new Date().toISOString()
  };
}

export function getCommsSnapshot() {
  return clone(state);
}

export async function refreshComms() {
  const payload = await serverRequest('/snapshot', { method: 'GET' });
  state = normalizeSnapshot(payload);
  return getCommsSnapshot();
}

export async function createNet(name) {
  const clean = String(name || '').trim().slice(0, 64);
  if (!clean) return getCommsSnapshot();
  const payload = await serverRequest('/nets', { method: 'POST', body: JSON.stringify({ name: clean }) });
  state = normalizeSnapshot(payload.snapshot);
  return getCommsSnapshot();
}

export async function assignUser(userId, netUid) {
  const payload = await serverRequest('/assignments', { method: 'POST', body: JSON.stringify({ userId, netUid }) });
  state = normalizeSnapshot(payload.snapshot);
  return getCommsSnapshot();
}

export async function startReadyCheck() {
  const payload = await serverRequest('/ready-checks/start', { method: 'POST', body: '{}' });
  state = normalizeSnapshot(payload.snapshot);
  return getCommsSnapshot();
}

export async function sendAcars(text) {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  const payload = await serverRequest('/acars', { method: 'POST', body: JSON.stringify({ text: clean }) });
  state = normalizeSnapshot(payload.snapshot);
  return getCommsSnapshot();
}
