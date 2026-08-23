import {
  STAR_COMMS_API,
  buildAssignmentBody,
  buildNetCreateBody,
  buildReadyCheckTemplateBody,
  buildReadyCheckStartBody,
  buildAcarsBody
} from './star-comms-api.js';

const clone = value => JSON.parse(JSON.stringify(value));

const state = {
  mode: 'STAR COMMS API CONTRACT / SIMULATION',
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

function stamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function event(type, text) {
  state.events.unshift({ time: stamp(), type, text });
  state.events = state.events.slice(0, 12);
}

export function getStarCommsApiContract() {
  return clone(STAR_COMMS_API);
}

export function getCommsSnapshot() {
  return clone(state);
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

export function startMockReadyCheck() {
  const templateId = 'dni_mock_ready';
  const template = buildReadyCheckTemplateBody('DNI Launch');
  const start = buildReadyCheckStartBody(templateId, 'DNI Ops');
  state.readyCheck = { active: true, ready: 4, declined: 1, afk: 1, total: state.roster.length };
  event('API', `POST ${STAR_COMMS_API.endpoints.readyCheckStart.path} ${JSON.stringify(start)} // simulated.`);
  event('API', `POST ${STAR_COMMS_API.endpoints.readyCheckCreate.path} ${JSON.stringify(template)} // simulated template.`);
  return getCommsSnapshot();
}

export function sendMockAcars(text, senderName = 'DNI Ops') {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  const request = buildAcarsBody(clean, senderName);
  event('API', `POST ${STAR_COMMS_API.endpoints.acars.path} ${JSON.stringify(request)} // simulated.`);
  return getCommsSnapshot();
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
