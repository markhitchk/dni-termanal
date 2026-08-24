import {
  STAR_COMMS_API,
  buildAssignmentBody,
  buildNetCreateBody,
  buildReadyCheckTemplateBody,
  buildReadyCheckStartBody,
  buildAcarsBody
} from './star-comms-api.js';

const OWNER_KEY_SESSION = 'dni.starCommsOwnerKey';
const clone = value => JSON.parse(JSON.stringify(value));

function sessionGet() {
  try { return globalThis.sessionStorage?.getItem(OWNER_KEY_SESSION) || ''; } catch { return ''; }
}

function sessionSet(value) {
  try {
    if (value) globalThis.sessionStorage?.setItem(OWNER_KEY_SESSION, value);
    else globalThis.sessionStorage?.removeItem(OWNER_KEY_SESSION);
  } catch {}
}

function normalizeOwnerKey(value) {
  const key = String(value || '').trim();
  if (!/^scok_[A-Za-z0-9_-]+$/.test(key)) throw new Error('Enter a valid Star Comms Owner API key.');
  return key;
}

let ownerKey = (() => {
  try { return normalizeOwnerKey(sessionGet()); } catch { return ''; }
})();

const mockState = {
  mode: 'STAR COMMS API CONTRACT / SIMULATION',
  live: false,
  shard: 'DREADNOUGHT IMPERIUM',
  shardUrl: STAR_COMMS_API.shardUrl,
  apiBase: `${STAR_COMMS_API.shardUrl}${STAR_COMMS_API.basePath}`,
  connectedCount: 6,
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
    { time: '03:40', type: 'API', text: 'GET /api/v1/roster // simulated connected users.' },
    { time: '03:39', type: 'SSE', text: 'GET /api/v1/stream // simulated PTT event.' }
  ]
};

let state = clone(mockState);

function stamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function pushEvent(type, text) {
  state.events.unshift({ time: stamp(), type, text });
  state.events = state.events.slice(0, 12);
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
        ? String(value)
        : String(value?.netUid ?? value?.uid ?? value?.netId ?? '');
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
      ready: values.filter(v => v === 'ready').length,
      declined: values.filter(v => v === 'declined' || v === 'decline').length,
      afk: values.filter(v => v === 'afk').length,
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

function roleLabel(user) {
  if (typeof user?.roleName === 'string') return user.roleName;
  if (typeof user?.role === 'string') return user.role;
  if (Array.isArray(user?.roles) && user.roles.length) {
    const first = user.roles[0];
    return typeof first === 'string' ? first : String(first?.name ?? 'Member');
  }
  return 'Member';
}

function normalizeOwnerState(statusPayload, rosterPayload, assignmentsPayload, readyPayload, metricsPayload) {
  const status = objectFrom(statusPayload, ['status']);
  const assignments = assignmentMap(assignmentsPayload);
  const rawRoster = arrayFrom(rosterPayload, ['roster', 'members', 'users', 'clients']);
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
    const members = Number(net?.members ?? net?.memberCount ?? net?.occupancy ?? countedMembers);
    return {
      uid,
      netUid: uid,
      name: String(net?.name ?? net?.label ?? net?.netName ?? `NET ${index + 1}`),
      members: Number.isFinite(members) ? members : countedMembers,
      tx: Boolean(net?.tx ?? net?.transmitting ?? net?.activeTx ?? net?.pttActive)
    };
  });

  const connectedCount = Number(
    status?.connected ?? status?.connectedCount ?? status?.online ?? status?.onlineCount ?? roster.length
  );
  const operationOpen = Boolean(
    status?.operationOpen ?? status?.operation?.open ?? status?.op?.open ?? status?.open ?? false
  );
  const shard = String(
    status?.shardName ?? status?.shard?.name ?? status?.guildName ?? status?.guild?.name ?? 'DREADNOUGHT IMPERIUM'
  );

  return {
    mode: 'STAR COMMS OWNER API / LIVE',
    live: true,
    shard,
    shardUrl: STAR_COMMS_API.shardUrl,
    apiBase: `${STAR_COMMS_API.shardUrl}${STAR_COMMS_API.basePath}`,
    connectedCount: Number.isFinite(connectedCount) ? connectedCount : roster.length,
    operationOpen,
    txNow: nets.filter(net => net.tx).length,
    nets,
    roster,
    readyCheck: normalizeReadyCheck(readyPayload, roster.length),
    metrics: metricsPayload || {},
    events: state.events?.length ? state.events : []
  };
}

async function ownerRequest(path, options = {}) {
  if (!ownerKey) throw new Error('Owner API key is not connected for this tab.');
  const headers = new Headers({ Authorization: `Bearer ${ownerKey}` });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  let response;
  try {
    response = await fetch(`${STAR_COMMS_API.shardUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store'
    });
  } catch (error) {
    throw new Error(`Browser could not reach the Star Comms Owner API. ${error?.message || error}`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  let payload = null;
  if (response.status !== 204) {
    payload = contentType.includes('application/json') ? await response.json() : await response.text();
  }
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload?.error ? payload.error : String(payload || response.statusText);
    throw new Error(`${response.status} ${detail}`.trim());
  }
  return payload;
}

export function getStarCommsOwnerConfig() {
  return {
    shardUrl: STAR_COMMS_API.shardUrl,
    apiBase: `${STAR_COMMS_API.shardUrl}${STAR_COMMS_API.basePath}`,
    keyConfigured: Boolean(ownerKey)
  };
}

export function setStarCommsOwnerKey(value) {
  ownerKey = normalizeOwnerKey(value);
  sessionSet(ownerKey);
  state = clone(mockState);
  pushEvent('CONFIG', 'Star Comms Owner API key connected for this browser tab.');
  return getStarCommsOwnerConfig();
}

export function clearStarCommsOwnerKey() {
  ownerKey = '';
  sessionSet('');
  state = clone(mockState);
  pushEvent('CONFIG', 'Star Comms Owner API session disconnected.');
  return getStarCommsOwnerConfig();
}

export function getCommsSnapshot() {
  return clone(state);
}

export async function refreshComms() {
  if (!ownerKey) return getCommsSnapshot();
  const [status, roster, assignments, ready, metrics] = await Promise.all([
    ownerRequest(STAR_COMMS_API.endpoints.status.path),
    ownerRequest(STAR_COMMS_API.endpoints.roster.path).catch(() => ({})),
    ownerRequest(STAR_COMMS_API.endpoints.assignments.path).catch(() => ({})),
    ownerRequest(STAR_COMMS_API.endpoints.readyCheckStatus.path).catch(() => ({})),
    ownerRequest(STAR_COMMS_API.endpoints.metrics.path).catch(() => ({}))
  ]);
  state = normalizeOwnerState(status, roster, assignments, ready, metrics);
  pushEvent('LIVE', 'Star Comms Owner API data refreshed.');
  return getCommsSnapshot();
}

export async function createNet(name) {
  const clean = String(name || '').trim().slice(0, 64);
  if (!clean) return getCommsSnapshot();
  if (!ownerKey) return createMockNet(clean);
  await ownerRequest(STAR_COMMS_API.endpoints.netsCreate.path, {
    method: 'POST',
    body: buildNetCreateBody(clean)
  });
  pushEvent('LIVE', `Created Star Comms net: ${clean}`);
  return refreshComms();
}

export async function assignUser(userId, netUid) {
  if (!ownerKey) return assignMockUser(userId, netUid);
  const body = buildAssignmentBody(userId, netUid, 'assign');
  await ownerRequest(STAR_COMMS_API.endpoints.assignmentWrite.path, { method: 'POST', body });
  pushEvent('LIVE', `Assigned ${body.userId} to ${body.netUid}.`);
  return refreshComms();
}

export async function startReadyCheck() {
  if (!ownerKey) return startMockReadyCheck();
  const template = buildReadyCheckTemplateBody('DNI Launch');
  const created = await ownerRequest(STAR_COMMS_API.endpoints.readyCheckCreate.path, {
    method: 'POST', body: template
  });
  const templateId = created?.readyCheck?.id ?? created?.template?.id ?? created?.id;
  if (!templateId) throw new Error('Star Comms did not return a ready-check template ID.');
  await ownerRequest(STAR_COMMS_API.endpoints.readyCheckStart.path, {
    method: 'POST', body: buildReadyCheckStartBody(templateId, 'DNI Ops')
  });
  pushEvent('LIVE', 'Star Comms ready check started.');
  return refreshComms();
}

export async function sendAcars(text, senderName = 'DNI Ops') {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  if (!ownerKey) return sendMockAcars(clean);
  await ownerRequest(STAR_COMMS_API.endpoints.acars.path, {
    method: 'POST', body: buildAcarsBody(clean, senderName)
  });
  pushEvent('LIVE', 'ACARS alert sent through Star Comms.');
  return refreshComms();
}

export function createMockNet(name) {
  const clean = String(name || '').trim().toUpperCase().slice(0, 28);
  if (!clean) return getCommsSnapshot();
  const uid = `net_mock_${Date.now()}`;
  state.nets.push({ uid, netUid: uid, name: clean, members: 0, tx: false });
  pushEvent('API', `POST /api/v1/nets {"name":"${clean}"} // simulated.`);
  return getCommsSnapshot();
}

export function assignMockUser(userId, netUid) {
  const user = state.roster.find(item => item.userId === userId || item.id === userId);
  const net = state.nets.find(item => item.netUid === netUid || item.uid === netUid);
  if (!user || !net) return getCommsSnapshot();
  user.netUid = net.netUid;
  for (const item of state.nets) item.members = state.roster.filter(member => member.netUid === item.netUid).length;
  pushEvent('API', `POST /api/v1/assignments // simulated assignment for ${user.name}.`);
  return getCommsSnapshot();
}

export function startMockReadyCheck() {
  state.readyCheck = { active: true, ready: 4, declined: 1, afk: 1, total: state.roster.length };
  pushEvent('API', 'POST /api/v1/ready-checks/start // simulated.');
  return getCommsSnapshot();
}

export function sendMockAcars(text) {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  pushEvent('API', `POST /api/v1/acars // simulated: ${clean}`);
  return getCommsSnapshot();
}

export function simulateMockPulse() {
  if (state.live) return getCommsSnapshot();
  const candidates = state.nets.filter(net => net.members > 0);
  if (!candidates.length) return getCommsSnapshot();
  for (const net of state.nets) net.tx = false;
  const net = candidates[Math.floor(Math.random() * candidates.length)];
  net.tx = true;
  state.txNow = 1;
  pushEvent('SSE', `GET /api/v1/stream // simulated PTT event on ${net.name}.`);
  return getCommsSnapshot();
}
