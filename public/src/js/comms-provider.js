import {
  STAR_COMMS_API,
  buildAssignmentBody,
  buildNetCreateBody,
  buildReadyCheckTemplateBody,
  buildReadyCheckStartBody,
  buildAcarsBody
} from './star-comms-api.js';

const LAUNCH_SESSION = 'dni.starCommsLaunchUrl';
const OWNER_KEY_SESSION = 'dni.starCommsOwnerKey';
const clone = value => JSON.parse(JSON.stringify(value));

function sessionGet(key) {
  try { return globalThis.sessionStorage?.getItem(key) || ''; } catch { return ''; }
}
function sessionSet(key, value) {
  try {
    if (value) globalThis.sessionStorage?.setItem(key, value);
    else globalThis.sessionStorage?.removeItem(key);
  } catch {}
}

function normalizeOwnerKey(value) {
  const key = String(value || '').trim();
  if (!/^scok_[A-Za-z0-9_-]+$/.test(key)) throw new Error('Enter a valid Star Comms Owner API key.');
  return key;
}

export function parseStarCommsLaunchUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Enter the full Star Comms launch URL.');
  const outer = new URL(raw);
  if (!['star-comms.org', 'www.star-comms.org'].includes(outer.hostname) || outer.pathname !== '/launch') {
    throw new Error('Expected a https://star-comms.org/launch?... URL.');
  }
  const innerValue = outer.searchParams.get('uri');
  if (!innerValue) throw new Error('Launch URL is missing the uri parameter.');
  const inner = new URL(innerValue);
  if (inner.protocol !== 'starcomms:' || inner.hostname !== 'launch') {
    throw new Error('Launch URL does not contain a starcomms://launch URI.');
  }
  const shardValue = String(inner.searchParams.get('shard') || '').trim();
  const launchId = String(inner.searchParams.get('id') || '').trim();
  const launchToken = String(inner.searchParams.get('token') || '').trim();
  if (!shardValue || !launchId || !launchToken) throw new Error('Launch URI must include shard, id, and token.');
  const shard = new URL(shardValue);
  if (shard.protocol !== 'https:' || !shard.hostname.endsWith('.star-comms.org')) {
    throw new Error('Launch shard must be an HTTPS Star Comms shard.');
  }
  return {
    fullLaunchUrl: raw,
    launchUri: innerValue,
    shardUrl: shard.origin,
    apiBase: `${shard.origin}${STAR_COMMS_API.basePath}`,
    launchId,
    launchTokenPresent: true
  };
}

let launchUrl = sessionGet(LAUNCH_SESSION);
let ownerKey = sessionGet(OWNER_KEY_SESSION);
let launchInfo = null;
try { if (launchUrl) launchInfo = parseStarCommsLaunchUrl(launchUrl); } catch { launchUrl = ''; }
try { if (ownerKey) ownerKey = normalizeOwnerKey(ownerKey); } catch { ownerKey = ''; }

const mockState = {
  mode: 'STAR COMMS API CONTRACT / SIMULATION',
  live: false,
  shard: 'NOT CONNECTED',
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
    { id: 'mock-001', userId: 'mock-001', name: 'HarleyTG', role: 'Command', netUid: 'net_command' },
    { id: 'mock-002', userId: 'mock-002', name: 'Vanguard-2', role: 'Operations', netUid: 'net_ops' },
    { id: 'mock-003', userId: 'mock-003', name: 'Atlas-7', role: 'Pilot', netUid: 'net_ops' },
    { id: 'mock-004', userId: 'mock-004', name: 'Nova-3', role: 'Security', netUid: 'net_sector1' },
    { id: 'mock-005', userId: 'mock-005', name: 'Echo-9', role: 'Logistics', netUid: 'net_logistics' },
    { id: 'mock-006', userId: 'mock-006', name: 'Orion-4', role: 'Pilot', netUid: 'net_ops' }
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
function normalizeLiveState(statusPayload, rosterPayload, assignmentsPayload, readyPayload, metricsPayload) {
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
      netUid: String(user?.netUid ?? user?.net?.uid ?? assignments.get(userId) ?? '')
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
  const connectedCount = Number(status?.connected ?? status?.connectedCount ?? status?.online ?? status?.onlineCount ?? roster.length);
  const shard = String(status?.shardName ?? status?.shard?.name ?? status?.guildName ?? status?.guild?.name ?? 'DREADNOUGHT IMPERIUM');
  return {
    mode: 'STAR COMMS OWNER API / LIVE TEST',
    live: true,
    shard,
    connectedCount: Number.isFinite(connectedCount) ? connectedCount : roster.length,
    operationOpen: Boolean(status?.operationOpen ?? status?.operation?.open ?? status?.open ?? false),
    txNow: nets.filter(net => net.tx).length,
    nets,
    roster,
    readyCheck: normalizeReadyCheck(readyPayload, roster.length),
    metrics: metricsPayload || {},
    events: state.events?.length ? state.events : []
  };
}

async function ownerRequest(path, options = {}) {
  if (!launchInfo || !ownerKey) throw new Error('Star Comms test session is not connected.');
  const headers = new Headers({ Authorization: `Bearer ${ownerKey}`, Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  let response;
  try {
    response = await fetch(`${launchInfo.shardUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store'
    });
  } catch (error) {
    throw new Error(`Browser could not reach Star Comms. ${error?.message || error}`);
  }
  const contentType = response.headers.get('content-type') || '';
  const payload = response.status === 204 ? null : contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload?.error ? payload.error : String(payload || response.statusText);
    throw new Error(`${response.status} ${detail}`.trim());
  }
  return payload;
}

export function getStarCommsTestConfig() {
  return {
    launchConfigured: Boolean(launchInfo),
    keyConfigured: Boolean(ownerKey),
    connected: Boolean(launchInfo && ownerKey),
    shardUrl: launchInfo?.shardUrl || '',
    apiBase: launchInfo?.apiBase || STAR_COMMS_API.basePath,
    launchId: launchInfo?.launchId || '',
    launchUrl: launchInfo?.fullLaunchUrl || ''
  };
}
export function setStarCommsTestSession(nextLaunchUrl, nextOwnerKey) {
  launchInfo = parseStarCommsLaunchUrl(nextLaunchUrl);
  ownerKey = normalizeOwnerKey(nextOwnerKey);
  launchUrl = launchInfo.fullLaunchUrl;
  sessionSet(LAUNCH_SESSION, launchUrl);
  sessionSet(OWNER_KEY_SESSION, ownerKey);
  state = clone(mockState);
  state.shard = 'DREADNOUGHT IMPERIUM';
  pushEvent('CONFIG', 'Full Star Comms launch URL + Owner API test session connected.');
  return getStarCommsTestConfig();
}
export function clearStarCommsTestSession() {
  launchUrl = '';
  ownerKey = '';
  launchInfo = null;
  sessionSet(LAUNCH_SESSION, '');
  sessionSet(OWNER_KEY_SESSION, '');
  state = clone(mockState);
  return getStarCommsTestConfig();
}
export function getCommsSnapshot() { return clone(state); }

export async function refreshComms() {
  if (!launchInfo || !ownerKey) return getCommsSnapshot();
  const [status, roster, assignments, ready, metrics] = await Promise.all([
    ownerRequest(STAR_COMMS_API.endpoints.status.path),
    ownerRequest(STAR_COMMS_API.endpoints.roster.path).catch(() => ({})),
    ownerRequest(STAR_COMMS_API.endpoints.assignments.path).catch(() => ({})),
    ownerRequest(STAR_COMMS_API.endpoints.readyCheckStatus.path).catch(() => ({})),
    ownerRequest(STAR_COMMS_API.endpoints.metrics.path).catch(() => ({}))
  ]);
  state = normalizeLiveState(status, roster, assignments, ready, metrics);
  pushEvent('LIVE', 'Star Comms Owner API data refreshed from the full launch context.');
  return getCommsSnapshot();
}
export async function createNet(name) {
  const clean = String(name || '').trim().slice(0, 64);
  if (!clean) return getCommsSnapshot();
  if (!launchInfo || !ownerKey) return createMockNet(clean);
  await ownerRequest(STAR_COMMS_API.endpoints.netsCreate.path, { method: 'POST', body: buildNetCreateBody(clean) });
  pushEvent('LIVE', `Created Star Comms net: ${clean}`);
  return refreshComms();
}
export async function assignUser(userId, netUid) {
  if (!launchInfo || !ownerKey) return assignMockUser(userId, netUid);
  const body = buildAssignmentBody(userId, netUid, 'assign');
  await ownerRequest(STAR_COMMS_API.endpoints.assignmentWrite.path, { method: 'POST', body });
  pushEvent('LIVE', `Assigned ${body.userId} to ${body.netUid}.`);
  return refreshComms();
}
export async function startReadyCheck() {
  if (!launchInfo || !ownerKey) return startMockReadyCheck();
  const created = await ownerRequest(STAR_COMMS_API.endpoints.readyCheckCreate.path, {
    method: 'POST', body: buildReadyCheckTemplateBody('DNI Launch Test')
  });
  const templateId = created?.readyCheck?.id ?? created?.template?.id ?? created?.id;
  if (!templateId) throw new Error('Star Comms did not return a ready-check template ID.');
  await ownerRequest(STAR_COMMS_API.endpoints.readyCheckStart.path, {
    method: 'POST', body: buildReadyCheckStartBody(templateId, 'DNI GitHub Pages Test')
  });
  pushEvent('LIVE', 'Star Comms ready check started.');
  return refreshComms();
}
export async function sendAcars(text) {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  if (!launchInfo || !ownerKey) return sendMockAcars(clean);
  await ownerRequest(STAR_COMMS_API.endpoints.acars.path, {
    method: 'POST', body: buildAcarsBody(clean, 'DNI GitHub Pages Test')
  });
  pushEvent('LIVE', 'ACARS sent through Star Comms.');
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
