import { STAR_COMMS_API } from './star-comms-api.js';

const SHARD_STORAGE_KEY = 'dni.starCommsShardUrl';
const TOKEN_STORAGE_KEY = 'dni.starCommsPublicToken';
const clone = value => JSON.parse(JSON.stringify(value));

function safeStorageGet(key) {
  try { return globalThis.localStorage?.getItem(key) || ''; } catch { return ''; }
}

function safeStorageSet(key, value) {
  try {
    if (value) globalThis.localStorage?.setItem(key, value);
    else globalThis.localStorage?.removeItem(key);
  } catch {}
}

function normalizeShardUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new URL(raw);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new Error('Star Comms shard URL must use HTTPS.');
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

function normalizePublicToken(value) {
  const token = String(value || '').trim();
  if (!token) return '';
  if (/^scok_/i.test(token)) throw new Error('Owner API keys cannot be used in DNI browser code. Use a Star Comms public token.');
  return token;
}

let shardUrl = (() => {
  try { return normalizeShardUrl(safeStorageGet(SHARD_STORAGE_KEY)); } catch { return ''; }
})();
let publicToken = (() => {
  try { return normalizePublicToken(safeStorageGet(TOKEN_STORAGE_KEY)); } catch { return ''; }
})();

const mockState = {
  mode: 'STAR COMMS API CONTRACT / SIMULATION',
  live: false,
  publicReadOnly: false,
  shard: 'NOT CONNECTED',
  apiBase: STAR_COMMS_API.basePath,
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
    { id: 'mock-001', name: 'HarleyTG', role: 'Command', netUid: 'net_command' },
    { id: 'mock-002', name: 'Vanguard-2', role: 'Operations', netUid: 'net_ops' },
    { id: 'mock-003', name: 'Atlas-7', role: 'Pilot', netUid: 'net_ops' },
    { id: 'mock-004', name: 'Nova-3', role: 'Security', netUid: 'net_sector1' },
    { id: 'mock-005', name: 'Echo-9', role: 'Logistics', netUid: 'net_logistics' },
    { id: 'mock-006', name: 'Orion-4', role: 'Pilot', netUid: 'net_ops' }
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

function addEvent(type, text) {
  state.events.unshift({ time: stamp(), type, text });
  state.events = state.events.slice(0, 12);
}

function findArray(payload, names) {
  if (Array.isArray(payload)) return payload;
  for (const name of names) {
    if (Array.isArray(payload?.[name])) return payload[name];
    if (Array.isArray(payload?.data?.[name])) return payload.data[name];
    if (Array.isArray(payload?.status?.[name])) return payload.status[name];
  }
  return [];
}

function findValue(payload, names, fallback) {
  for (const name of names) {
    if (payload?.[name] !== undefined) return payload[name];
    if (payload?.data?.[name] !== undefined) return payload.data[name];
    if (payload?.status?.[name] !== undefined) return payload.status[name];
  }
  return fallback;
}

function normalizePublicStatus(payload) {
  const rawNets = findArray(payload, ['nets', 'networks', 'channels']);
  const nets = rawNets.map((net, index) => {
    const uid = String(net?.netUid ?? net?.uid ?? net?.id ?? `net-${index + 1}`);
    const members = Number(net?.members ?? net?.memberCount ?? net?.occupancy ?? 0);
    return {
      uid,
      netUid: uid,
      name: String(net?.name ?? net?.label ?? net?.netName ?? `NET ${index + 1}`),
      members: Number.isFinite(members) ? members : 0,
      tx: Boolean(net?.tx ?? net?.transmitting ?? net?.activeTx ?? net?.pttActive)
    };
  });

  const connectedCount = Number(findValue(payload, ['connected', 'connectedCount', 'online', 'onlineCount', 'users'], 0));
  const operationOpen = Boolean(findValue(payload, ['operationOpen', 'open'], false));
  const shardName = String(findValue(payload, ['shardName', 'guildName', 'name'], 'CONNECTED'));

  return {
    mode: 'STAR COMMS PUBLIC WEBSITE API',
    live: true,
    publicReadOnly: true,
    shard: shardName,
    apiBase: STAR_COMMS_API.basePath,
    connectedCount: Number.isFinite(connectedCount) ? connectedCount : 0,
    operationOpen,
    txNow: nets.filter(net => net.tx).length,
    nets,
    roster: [],
    readyCheck: { active: false, ready: 0, declined: 0, afk: 0, total: 0 },
    events: [
      { time: stamp(), type: 'PUBLIC', text: 'GET /api/v1/embed/status // live read-only status loaded.' }
    ]
  };
}

export function getStarCommsPublicConfig() {
  return { shardUrl, publicTokenConfigured: Boolean(publicToken) };
}

export function setStarCommsPublicConfig(nextShardUrl, nextPublicToken) {
  shardUrl = normalizeShardUrl(nextShardUrl);
  publicToken = normalizePublicToken(nextPublicToken);
  if (!shardUrl || !publicToken) throw new Error('Both shard URL and public token are required.');
  safeStorageSet(SHARD_STORAGE_KEY, shardUrl);
  safeStorageSet(TOKEN_STORAGE_KEY, publicToken);
  state = clone(mockState);
  addEvent('CONFIG', 'Star Comms public website API configured.');
  return getStarCommsPublicConfig();
}

export function clearStarCommsPublicConfig() {
  shardUrl = '';
  publicToken = '';
  safeStorageSet(SHARD_STORAGE_KEY, '');
  safeStorageSet(TOKEN_STORAGE_KEY, '');
  state = clone(mockState);
}

export function getCommsSnapshot() {
  return clone(state);
}

export async function refreshComms() {
  if (!shardUrl || !publicToken) return getCommsSnapshot();
  const endpoint = `${shardUrl}${STAR_COMMS_API.endpoints.publicStatus.path}?token=${encodeURIComponent(publicToken)}`;
  const response = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
  if (!response.ok) throw new Error(`Star Comms public status failed (${response.status}).`);
  const payload = await response.json();
  state = normalizePublicStatus(payload);
  return getCommsSnapshot();
}

export function createMockNet(name) {
  if (state.live) throw new Error('Star Comms public website API is read-only.');
  const clean = String(name || '').trim().toUpperCase().slice(0, 28);
  if (!clean) return getCommsSnapshot();
  const uid = `net_mock_${Date.now()}`;
  state.nets.push({ uid, netUid: uid, name: clean, members: 0, tx: false });
  addEvent('API', `POST /api/v1/nets {"name":"${clean}"} // simulated only.`);
  return getCommsSnapshot();
}

export function assignMockUser(userId, netUid) {
  if (state.live) throw new Error('Star Comms public website API is read-only.');
  const user = state.roster.find(item => item.id === userId);
  const net = state.nets.find(item => item.uid === netUid);
  if (!user || !net) return getCommsSnapshot();
  user.netUid = netUid;
  for (const item of state.nets) item.members = state.roster.filter(member => member.netUid === item.uid).length;
  addEvent('API', `POST /api/v1/assignments // simulated assignment for ${user.name}.`);
  return getCommsSnapshot();
}

export function startMockReadyCheck() {
  if (state.live) throw new Error('Star Comms public website API is read-only.');
  state.readyCheck = { active: true, ready: 4, declined: 1, afk: 1, total: state.roster.length };
  addEvent('API', 'POST /api/v1/ready-checks/start // simulated only.');
  return getCommsSnapshot();
}

export function sendMockAcars(text) {
  if (state.live) throw new Error('Star Comms public website API is read-only.');
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  addEvent('API', `POST /api/v1/acars // simulated: ${clean}`);
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
  addEvent('SSE', `GET /api/v1/stream // simulated PTT event on ${net.name}.`);
  return getCommsSnapshot();
}
