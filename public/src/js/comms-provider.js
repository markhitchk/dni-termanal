import {
  STAR_COMMS_API,
  buildAssignmentBody,
  buildNetCreateBody,
  buildReadyCheckTemplateBody,
  buildReadyCheckStartBody,
  buildAcarsBody
} from './star-comms-api.js';

const STORAGE_KEY = 'dni.starCommsProxyUrl';
const clone = value => JSON.parse(JSON.stringify(value));

function storageGet() {
  try { return globalThis.localStorage?.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

function storageSet(value) {
  try {
    if (value) globalThis.localStorage?.setItem(STORAGE_KEY, value);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {}
}

function normalizeProxyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new URL(raw);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new Error('Star Comms proxy must use HTTPS.');
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

let proxyUrl = (() => {
  try { return normalizeProxyUrl(storageGet()); } catch { return ''; }
})();

const mockState = {
  mode: 'STAR COMMS API CONTRACT / SIMULATION',
  live: false,
  writesEnabled: false,
  shard: 'NOT CONNECTED',
  apiBase: STAR_COMMS_API.basePath,
  operationOpen: true,
  txNow: 2,
  nets: [
    { uid: 'net_command', netUid: 'net_command', name: 'COMMAND', members: 3, tx: true },
    { uid: 'net_ops', netUid: 'net_ops', name: 'OPERATIONS', members: 4, tx: true },
    { uid: 'net_sector1', netUid: 'net_sector1', name: 'SECTOR 01', members: 2, tx: false },
    { uid: 'net_logistics', netUid: 'net_logistics', name: 'LOGISTICS', members: 2, tx: false }
  ],
  roster: [
    { id: 'mock-001', userId: 'mock-001', name: 'HarleyTG', role: 'Command', netUid: 'net_command', status: 'Connected' },
    { id: 'mock-002', userId: 'mock-002', name: 'Vanguard-2', role: 'Operations', netUid: 'net_ops', status: 'Connected' },
    { id: 'mock-003', userId: 'mock-003', name: 'Atlas-7', role: 'Pilot', netUid: 'net_ops', status: 'Connected' },
    { id: 'mock-004', userId: 'mock-004', name: 'Nova-3', role: 'Security', netUid: 'net_sector1', status: 'Connected' },
    { id: 'mock-005', userId: 'mock-005', name: 'Echo-9', role: 'Logistics', netUid: 'net_logistics', status: 'Connected' },
    { id: 'mock-006', userId: 'mock-006', name: 'Orion-4', role: 'Pilot', netUid: 'net_ops', status: 'Connected' }
  ],
  readyCheck: { active: false, ready: 0, declined: 0, afk: 0, total: 6 },
  events: [
    { time: '03:41', type: 'API', text: 'GET /api/v1/status // simulated response loaded.' },
    { time: '03:40', type: 'API', text: 'GET /api/v1/roster // 6 simulated connected users.' },
    { time: '03:39', type: 'SSE', text: 'GET /api/v1/stream // simulated PTT event on COMMAND.' }
  ]
};

let state = clone(mockState);

function stamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function event(type, text) {
  state.events.unshift({ time: stamp(), type, text });
  state.events = state.events.slice(0, 12);
}

function arrayFrom(payload, names) {
  if (Array.isArray(payload)) return payload;
  for (const name of names) {
    if (Array.isArray(payload?.[name])) return payload[name];
    if (Array.isArray(payload?.data?.[name])) return payload.data[name];
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
        ? String(value)
        : String(value?.netUid ?? value?.uid ?? value?.netId ?? '');
      if (netUid) map.set(String(userId), netUid);
    }
  }
  return map;
}

function roleLabel(user) {
  if (typeof user?.roleName === 'string') return user.roleName;
  if (typeof user?.role === 'string') return user.role;
  if (Array.isArray(user?.roles) && user.roles.length) {
    const first = user.roles[0];
    return typeof first === 'string' ? first : String(first?.name ?? 'Member');
  }
  return 'Member';
}

function normalizeReadyCheck(payload, fallbackTotal) {
  const body = objectFrom(payload, ['readyCheck', 'session', 'active']);
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
  const active = Boolean(body?.active ?? body?.isActive ?? payload?.active);
  return {
    active,
    ready: Number(body?.ready ?? payload?.ready ?? 0),
    declined: Number(body?.declined ?? payload?.declined ?? 0),
    afk: Number(body?.afk ?? payload?.afk ?? 0),
    total: Number(body?.total ?? payload?.total ?? fallbackTotal ?? 0)
  };
}

function normalizeLiveState(statusPayload, rosterPayload, assignmentsPayload, readyPayload, health) {
  const status = objectFrom(statusPayload, ['status']);
  const rawRoster = arrayFrom(rosterPayload, ['roster', 'members', 'users', 'clients']);
  const assignments = assignmentMap(assignmentsPayload);

  const roster = rawRoster.map((user, index) => {
    const userId = String(user?.userId ?? user?.discordId ?? user?.id ?? `user-${index + 1}`);
    return {
      id: userId,
      userId,
      name: String(user?.displayName ?? user?.name ?? user?.username ?? user?.globalName ?? userId),
      role: roleLabel(user),
      netUid: String(user?.netUid ?? user?.net?.uid ?? assignments.get(userId) ?? ''),
      status: String(user?.status ?? 'Connected')
    };
  });

  const rawNets = arrayFrom(status, ['nets', 'networks', 'channels']);
  const nets = rawNets.map((net, index) => {
    const uid = String(net?.netUid ?? net?.uid ?? net?.id ?? `net-${index + 1}`);
    const countedMembers = roster.filter(user => user.netUid === uid).length;
    const members = Number(net?.members ?? net?.memberCount ?? net?.occupancy ?? countedMembers ?? 0);
    return {
      uid,
      netUid: uid,
      name: String(net?.name ?? net?.label ?? net?.netName ?? `NET ${index + 1}`),
      members: Number.isFinite(members) ? members : countedMembers,
      tx: Boolean(net?.tx ?? net?.transmitting ?? net?.activeTx ?? net?.pttActive)
    };
  });

  const operationOpen = Boolean(
    status?.operationOpen ?? status?.operation?.open ?? status?.op?.open ?? status?.open ?? false
  );
  const shard = String(
    status?.shardName ?? status?.shard?.name ?? status?.guildName ?? status?.guild?.name ?? 'CONNECTED'
  );

  return {
    mode: 'STAR COMMS LIVE VIA CLOUDFLARE WORKER',
    live: true,
    writesEnabled: Boolean(health?.writesEnabled),
    shard,
    apiBase: STAR_COMMS_API.basePath,
    operationOpen,
    txNow: nets.filter(net => net.tx).length,
    nets,
    roster,
    readyCheck: normalizeReadyCheck(readyPayload, roster.length),
    events: state.events?.length ? state.events : []
  };
}

async function proxyRequest(path, options = {}) {
  if (!proxyUrl) throw new Error('Star Comms proxy is not configured.');
  const response = await fetch(`${proxyUrl}${path}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });
  const contentType = response.headers.get('Content-Type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error ? payload.error : String(payload || response.statusText);
    throw new Error(`${response.status} ${message}`.trim());
  }
  return payload;
}

export function getStarCommsApiContract() {
  return clone(STAR_COMMS_API);
}

export function getStarCommsProxyUrl() {
  return proxyUrl;
}

export function setStarCommsProxyUrl(value) {
  proxyUrl = normalizeProxyUrl(value);
  storageSet(proxyUrl);
  state = clone(mockState);
  if (proxyUrl) event('CONFIG', `Cloudflare Worker configured: ${proxyUrl}`);
  return proxyUrl;
}

export function clearStarCommsProxyUrl() {
  proxyUrl = '';
  storageSet('');
  state = clone(mockState);
  event('CONFIG', 'Cloudflare Worker disconnected. Simulation restored.');
}

export function getCommsSnapshot() {
  return clone(state);
}

export async function refreshComms() {
  if (!proxyUrl) return getCommsSnapshot();
  const health = await proxyRequest('/health');
  if (!health?.configured) throw new Error('Cloudflare Worker is online but Star Comms secrets are not configured.');

  const [status, roster, assignments, ready] = await Promise.all([
    proxyRequest('/api/v1/status'),
    proxyRequest('/api/v1/roster'),
    proxyRequest('/api/v1/assignments').catch(() => ({})),
    proxyRequest('/api/v1/ready-checks/status').catch(() => ({}))
  ]);

  state = normalizeLiveState(status, roster, assignments, ready, health);
  event('LIVE', 'Star Comms status and roster refreshed through Cloudflare Worker.');
  return getCommsSnapshot();
}

function ensureWritesEnabled() {
  if (!state.live) return;
  if (!state.writesEnabled) throw new Error('Live Star Comms writes are disabled on the Cloudflare Worker.');
}

export function createMockNet(name) {
  const clean = String(name || '').trim().toUpperCase().slice(0, 28);
  if (!clean) return getCommsSnapshot();
  const request = buildNetCreateBody(clean);
  const uid = `net_mock_${Date.now()}`;
  state.nets.push({ uid, netUid: uid, name: request.name, members: 0, tx: false });
  event('API', `POST ${STAR_COMMS_API.endpoints.netsCreate.path} ${JSON.stringify(request)} // simulated.`);
  return getCommsSnapshot();
}

export async function createNet(name) {
  if (!proxyUrl) return createMockNet(name);
  ensureWritesEnabled();
  const request = buildNetCreateBody(String(name || '').trim());
  await proxyRequest(STAR_COMMS_API.endpoints.netsCreate.path, { method: 'POST', body: request });
  event('LIVE', `Created Star Comms net: ${request.name}`);
  return refreshComms();
}

export function assignMockUser(userId, netUid) {
  const user = state.roster.find(item => item.userId === userId || item.id === userId);
  const net = state.nets.find(item => item.netUid === netUid || item.uid === netUid);
  if (!user || !net) return getCommsSnapshot();
  const request = buildAssignmentBody(user.userId, net.netUid, 'assign');
  user.netUid = net.netUid;
  for (const item of state.nets) item.members = state.roster.filter(member => member.netUid === item.netUid).length;
  event('API', `POST ${STAR_COMMS_API.endpoints.assignmentWrite.path} ${JSON.stringify(request)} // simulated.`);
  return getCommsSnapshot();
}

export async function assignUser(userId, netUid) {
  if (!proxyUrl) return assignMockUser(userId, netUid);
  ensureWritesEnabled();
  const request = buildAssignmentBody(userId, netUid, 'assign');
  await proxyRequest(STAR_COMMS_API.endpoints.assignmentWrite.path, { method: 'POST', body: request });
  event('LIVE', `Assigned ${request.userId} to ${request.netUid}.`);
  return refreshComms();
}

export function startMockReadyCheck() {
  const templateId = 'dni_mock_ready';
  const template = buildReadyCheckTemplateBody('DNI Launch');
  const start = buildReadyCheckStartBody(templateId, 'DNI Ops');
  state.readyCheck = { active: true, ready: 4, declined: 1, afk: 1, total: state.roster.length };
  event('API', `POST ${STAR_COMMS_API.endpoints.readyCheckStart.path} ${JSON.stringify(start)} // simulated.`);
  event('API', `POST ${STAR_COMMS_API.endpoints.readyCheckCreate.path} ${JSON.stringify(template)} // simulated template.`);
  return getCommsSnapshot();
}

export async function startReadyCheck() {
  if (!proxyUrl) return startMockReadyCheck();
  ensureWritesEnabled();
  const template = buildReadyCheckTemplateBody('DNI Launch');
  const created = await proxyRequest(STAR_COMMS_API.endpoints.readyCheckCreate.path, { method: 'POST', body: template });
  const templateId = created?.readyCheck?.id ?? created?.template?.id ?? created?.id;
  if (!templateId) throw new Error('Star Comms did not return a ready-check template ID.');
  await proxyRequest(STAR_COMMS_API.endpoints.readyCheckStart.path, {
    method: 'POST',
    body: buildReadyCheckStartBody(templateId, 'DNI Ops')
  });
  event('LIVE', 'Star Comms ready check started.');
  return refreshComms();
}

export function sendMockAcars(text, senderName = 'DNI Ops') {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  const request = buildAcarsBody(clean, senderName);
  event('API', `POST ${STAR_COMMS_API.endpoints.acars.path} ${JSON.stringify(request)} // simulated.`);
  return getCommsSnapshot();
}

export async function sendAcars(text, senderName = 'DNI Ops') {
  if (!proxyUrl) return sendMockAcars(text, senderName);
  ensureWritesEnabled();
  const request = buildAcarsBody(String(text || '').trim().slice(0, 180), senderName);
  await proxyRequest(STAR_COMMS_API.endpoints.acars.path, { method: 'POST', body: request });
  event('LIVE', 'ACARS alert sent through Star Comms.');
  return refreshComms();
}

export function simulateMockPulse() {
  const candidates = state.nets.filter(net => net.members > 0);
  if (!candidates.length) return getCommsSnapshot();
  for (const net of state.nets) net.tx = false;
  const net = candidates[Math.floor(Math.random() * candidates.length)];
  net.tx = true;
  state.txNow = 1;
  event('SSE', `GET ${STAR_COMMS_API.endpoints.stream.path} // simulated PTT event on ${net.name}.`);
  return getCommsSnapshot();
}
