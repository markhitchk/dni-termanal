const clone = value => JSON.parse(JSON.stringify(value));

const state = {
  mode: 'MOCK / SIMULATION',
  shard: 'DNI-MOCK-01',
  operationOpen: true,
  txNow: 2,
  nets: [
    { uid: 'net_command', name: 'COMMAND', members: 3, tx: true },
    { uid: 'net_ops', name: 'OPERATIONS', members: 4, tx: true },
    { uid: 'net_sector1', name: 'SECTOR 01', members: 2, tx: false },
    { uid: 'net_logistics', name: 'LOGISTICS', members: 2, tx: false }
  ],
  roster: [
    { id: 'mock-001', name: 'HarleyTG', role: 'Command', netUid: 'net_command', status: 'Connected' },
    { id: 'mock-002', name: 'Vanguard-2', role: 'Operations', netUid: 'net_ops', status: 'Connected' },
    { id: 'mock-003', name: 'Atlas-7', role: 'Pilot', netUid: 'net_ops', status: 'Connected' },
    { id: 'mock-004', name: 'Nova-3', role: 'Security', netUid: 'net_sector1', status: 'Connected' },
    { id: 'mock-005', name: 'Echo-9', role: 'Logistics', netUid: 'net_logistics', status: 'Connected' },
    { id: 'mock-006', name: 'Orion-4', role: 'Pilot', netUid: 'net_ops', status: 'Connected' }
  ],
  readyCheck: { active: false, ready: 0, declined: 0, afk: 0, total: 6 },
  events: [
    { time: '03:41', type: 'SYSTEM', text: 'DNI Communication mock provider initialized.' },
    { time: '03:40', type: 'JOIN', text: 'Orion-4 connected to OPERATIONS.' },
    { time: '03:39', type: 'PTT', text: 'COMMAND transmission activity detected.' }
  ]
};

function stamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function event(type, text) {
  state.events.unshift({ time: stamp(), type, text });
  state.events = state.events.slice(0, 12);
}

export function getCommsSnapshot() {
  return clone(state);
}

export function createMockNet(name) {
  const clean = String(name || '').trim().toUpperCase().slice(0, 28);
  if (!clean) return getCommsSnapshot();
  const uid = `net_mock_${Date.now()}`;
  state.nets.push({ uid, name: clean, members: 0, tx: false });
  event('NET', `${clean} created in simulation.`);
  return getCommsSnapshot();
}

export function assignMockUser(userId, netUid) {
  const user = state.roster.find(item => item.id === userId);
  const net = state.nets.find(item => item.uid === netUid);
  if (!user || !net) return getCommsSnapshot();
  user.netUid = net.uid;
  for (const item of state.nets) item.members = state.roster.filter(member => member.netUid === item.uid).length;
  event('ASSIGN', `${user.name} assigned to ${net.name}.`);
  return getCommsSnapshot();
}

export function startMockReadyCheck() {
  state.readyCheck = { active: true, ready: 4, declined: 1, afk: 1, total: state.roster.length };
  event('READY', `Ready check started for ${state.roster.length} personnel.`);
  return getCommsSnapshot();
}

export function sendMockAcars(text, senderName = 'DNI Ops') {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return getCommsSnapshot();
  event('ACARS', `${senderName}: ${clean}`);
  return getCommsSnapshot();
}

export function simulateMockPulse() {
  const candidates = state.nets.filter(net => net.members > 0);
  if (!candidates.length) return getCommsSnapshot();
  for (const net of state.nets) net.tx = false;
  const net = candidates[Math.floor(Math.random() * candidates.length)];
  net.tx = true;
  state.txNow = 1;
  event('PTT', `${net.name} transmission activity detected.`);
  return getCommsSnapshot();
}
