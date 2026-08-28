import { getDniRecord, listDniRecords } from './access.js';
import { getCommsSnapshot, refreshComms, createNet, assignUser, startReadyCheck, sendAcars } from './comms-provider.js';
import { initializeMail, openMail, handleMailCommand } from './mail.js';

const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const windowEl = document.querySelector('#terminal-window');
const tabs = [...document.querySelectorAll('.nav-tab')];
const shell = document.querySelector('.terminal-shell');
const terminalNumber = document.querySelector('#terminal-number');
let terminalIndex = 1;
let commsWritable = false;
const separator = '------------------------------------------------------------';

function row(text = '', className = '') {
  const el = document.createElement('div');
  el.textContent = text;
  if (className) el.className = className;
  output.append(el);
  windowEl.scrollTop = windowEl.scrollHeight;
  return el;
}
function gap() {
  const el = document.createElement('div');
  el.className = 'terminal-gap';
  output.append(el);
}
function commandLine(parts) {
  const el = document.createElement('div');
  for (const part of parts) {
    const span = document.createElement('span');
    span.textContent = part.text;
    if (part.highlight) span.className = 'command-highlight';
    el.append(span);
  }
  output.append(el);
}
function accessTime() {
  return new Date().toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
}
function boot() {
  output.replaceChildren();
  row('---------------------- DNI TERMINAL v4.3.0 ----------------------', 'separator');
  gap();
  row('DREADNOUGHT IMPERIUM');
  row('DREADNOUGHT IMPERIUM DATABASE NETWORK');
  gap();
  row('DNI COMMAND NETWORK // ONLINE');
  row('IMPERIAL DATABASE LINK // ESTABLISHED');
  row('SECURE TERMINAL SESSION // ACTIVE');
  gap();
  row(`Access Time: ${accessTime()}`);
  gap();
  row('Welcome to the Dreadnought Imperium Database Network.');
  gap();
  row('Authorized personnel may access DNI records, operational services,');
  row('communications, sector data, and official network announcements.');
  gap();
  commandLine([{ text: "Enter '" }, { text: 'help', highlight: true }, { text: "' to display available terminal commands." }]);
  commandLine([{ text: "Enter '" }, { text: 'access <number>', highlight: true }, { text: "' to retrieve a DNI database record." }]);
  commandLine([{ text: "Example: '" }, { text: 'access 173', highlight: true }, { text: "' retrieves DNI-173." }]);
  commandLine([{ text: "Enter '" }, { text: 'mail', highlight: true }, { text: "' to access DNI Mail and official announcements." }]);
  gap();
  row('------------------- DREADNOUGHT IMPERIUM -------------------', 'separator');
  gap();
}
function showHelp() {
  row('AVAILABLE COMMANDS');
  row('HELP                Display this command list', 'muted');
  row('ACCESS <number>     Open a local DNI archive record', 'muted');
  row('LIST                List local DNI archive records', 'muted');
  row('MAIL                Open DNI Mail', 'muted');
  row('MAIL UNREAD         Show unread DNI Mail', 'muted');
  row('MAIL ANNOUNCEMENTS  Show official announcements', 'muted');
  row('MAIL SERVICE        Show service announcements', 'muted');
  row('MAIL READ <id>      Read a DNI Mail message', 'muted');
  row('INBOX               Alias for DNI Mail', 'muted');
  row('TERMINAL            Open DNI Terminal', 'muted');
  row('DASHBOARD           Open DNI Dashboard', 'muted');
  row('SERVICES            Open DNI Services', 'muted');
  row('COMMUNICATION       Open DNI Communication', 'muted');
  row('STARCOMMS           Show server bridge status', 'muted');
  row('SECTORS             Open DNI Sectors', 'muted');
  row('CLEAR               Clear and restart the terminal', 'muted');
  row('ABOUT               Display DNI Terminal information', 'muted');
}
function showList() {
  row('DNI DATABASE INDEX');
  for (const record of listDniRecords()) {
    row(`${record.id}  ${record.sector}  ${record.classification}  ${record.status}`, 'muted');
  }
}
function showRecord(value) {
  const record = getDniRecord(value);
  if (!record) {
    row('ERROR: ENTER A DNI DOCUMENT NUMBER. EXAMPLE: ACCESS 173');
    return;
  }
  row(separator, 'separator');
  row(`DOCUMENT: ${record.id}`);
  row(`SECTOR: ${record.sector}`, 'muted');
  row(`CLASSIFICATION: ${record.classification}`, 'muted');
  row(`STATUS: ${record.status}`, 'muted');
  row(`SUMMARY: ${record.summary}`, 'muted');
  row(separator, 'separator');
}
function echoCommand(value) {
  const line = document.createElement('div');
  const admin = document.createElement('span');
  admin.className = 'prompt-admin';
  admin.textContent = document.querySelector('.terminal-prompt .prompt-admin')?.textContent || 'guest';
  const host = document.createElement('span');
  host.className = 'prompt-host';
  host.textContent = document.querySelector('.terminal-prompt .prompt-host')?.textContent || 'dni';
  line.append(admin, document.createTextNode('@'), host, document.createTextNode(`:~$ ${value}`));
  output.append(line);
}
function netName(snapshot, uid) {
  return snapshot.nets.find(net => net.uid === uid || net.netUid === uid)?.name || 'UNASSIGNED';
}

function renderProviderState(snapshot) {
  const badge = document.querySelector('.provider-badge');
  const status = document.querySelector('.status-online');
  const footnote = document.querySelector('.comms-footnote');
  if (badge) badge.textContent = snapshot.available ? 'LIVE / OWNER API' : 'OWNER API UNAVAILABLE';
  if (status) status.innerHTML = snapshot.available ? '<i></i> LIVE SERVER BRIDGE' : '<i></i> API UNAVAILABLE';
  if (footnote) {
    footnote.textContent = snapshot.available
      ? 'Live Star Comms data is being proxied by the DNI Rocky Linux server. Owner credentials remain server-side and are never exposed to this browser.'
      : 'The Star Comms Owner API bridge is unavailable. Confirm STAR_COMMS_SHARD_URL and STAR_COMMS_OWNER_KEY on the server.';
  }
}

function renderComms(snapshot = getCommsSnapshot()) {
  document.querySelector('#comms-shard').textContent = snapshot.shard || 'UNAVAILABLE';
  document.querySelector('#metric-users').textContent = snapshot.connectedCount ?? snapshot.roster.length;
  document.querySelector('#metric-nets').textContent = snapshot.nets.length;
  document.querySelector('#metric-tx').textContent = snapshot.nets.filter(net => net.tx).length;
  document.querySelector('#metric-operation').textContent = snapshot.operationOpen ? 'OPEN' : 'CLOSED';
  document.querySelector('#roster-count').textContent = `${snapshot.roster.length} ONLINE`;
  renderProviderState(snapshot);

  const nets = document.querySelector('#comms-nets');
  nets.replaceChildren();
  for (const net of snapshot.nets) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'net-row';
    item.innerHTML = `<span class="net-signal ${net.tx ? 'is-tx' : ''}"></span><span class="net-name"></span><span class="net-members"></span><span class="net-state"></span>`;
    item.querySelector('.net-name').textContent = net.name;
    item.querySelector('.net-members').textContent = `${net.members} members`;
    item.querySelector('.net-state').textContent = net.tx ? 'TX' : 'IDLE';
    nets.append(item);
  }
  if (!snapshot.nets.length) nets.innerHTML = '<div class="ready-state">No live communication nets returned.</div>';

  const roster = document.querySelector('#comms-roster');
  roster.replaceChildren();
  for (const user of snapshot.roster) {
    const rowEl = document.createElement('div');
    rowEl.className = 'roster-row';
    const identity = document.createElement('div');
    identity.className = 'roster-identity';
    identity.innerHTML = '<span class="presence-dot"></span><div><strong></strong><small></small></div>';
    identity.querySelector('strong').textContent = user.name;
    identity.querySelector('small').textContent = user.role;
    const select = document.createElement('select');
    select.className = 'net-select';
    select.disabled = !commsWritable;
    select.setAttribute('aria-label', `Assign ${user.name} to Star Comms net`);
    for (const net of snapshot.nets) {
      const option = document.createElement('option');
      option.value = net.uid;
      option.textContent = net.name;
      option.selected = user.netUid === net.uid;
      select.append(option);
    }
    select.addEventListener('change', () => void runCommsAction(() => assignUser(user.userId || user.id, select.value)));
    const meta = document.createElement('span');
    meta.className = 'roster-net';
    meta.textContent = netName(snapshot, user.netUid);
    rowEl.append(identity, select, meta);
    roster.append(rowEl);
  }
  if (!snapshot.roster.length) roster.innerHTML = '<div class="ready-state">No connected Star Comms personnel returned.</div>';

  const ready = document.querySelector('#ready-check-state');
  if (snapshot.readyCheck.active) {
    ready.innerHTML = `<b>${snapshot.readyCheck.ready} READY</b><span>${snapshot.readyCheck.declined} DECLINED</span><span>${snapshot.readyCheck.afk} AFK</span>`;
  } else {
    ready.textContent = 'No ready check active.';
  }

  const events = document.querySelector('#comms-events');
  events.replaceChildren();
  for (const entry of snapshot.events) {
    const item = document.createElement('div');
    item.className = 'event-row';
    item.innerHTML = '<time></time><span class="event-type"></span><p></p>';
    item.querySelector('time').textContent = entry.time;
    item.querySelector('.event-type').textContent = entry.type;
    item.querySelector('p').textContent = entry.text;
    events.append(item);
  }
  if (!snapshot.events.length) events.innerHTML = '<div class="ready-state">No recent Star Comms activity returned.</div>';

  document.querySelector('#create-net-form button').disabled = !commsWritable;
  document.querySelector('#ready-check-button').disabled = !commsWritable;
  document.querySelector('#acars-form button').disabled = !commsWritable;
}

function showCommsError(error) {
  console.error(error);
  const badge = document.querySelector('.provider-badge');
  if (badge) badge.textContent = 'OWNER API UNAVAILABLE';
  const footnote = document.querySelector('.comms-footnote');
  if (footnote) footnote.textContent = `Star Comms bridge: ${error.message || error}`;
}
async function syncComms() {
  try {
    renderComms(await refreshComms());
  } catch (error) {
    renderComms();
    showCommsError(error);
  }
}
async function runCommsAction(action) {
  try {
    renderComms(await action());
  } catch (error) {
    showCommsError(error);
  }
}
function showStarCommsCommand() {
  const snapshot = getCommsSnapshot();
  row(`STAR COMMS SERVER BRIDGE: ${snapshot.available ? 'ONLINE' : 'UNAVAILABLE'}`);
  row(`SHARD: ${snapshot.shard || 'UNAVAILABLE'}`, 'muted');
  row('Owner API credentials are stored only on the DNI server.', 'muted');
}
function selectPanel(panel) {
  shell.dataset.panel = panel;
  for (const tab of tabs) {
    const active = tab.dataset.panel === panel;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active) tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
  window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel } }));
  if (panel === 'communication') void syncComms();
  if (panel === 'terminal') input.focus({ preventScroll: true });
}
function execute(raw) {
  const value = raw.trim();
  if (!value) return;
  echoCommand(value);
  const [command, ...args] = value.split(/\s+/);

  switch (command.toLowerCase()) {
    case 'help':
      showHelp();
      break;
    case 'access':
      showRecord(args[0]);
      break;
    case 'list':
      showList();
      break;
    case 'mail':
    case 'inbox': {
      const result = handleMailCommand(args);
      if (result?.message) row(result.message, result.ok === false ? 'muted' : '');
      break;
    }
    case 'terminal':
      selectPanel('terminal');
      break;
    case 'dashboard':
      selectPanel('dashboard');
      break;
    case 'services':
      selectPanel('services');
      break;
    case 'communication':
    case 'communications':
      selectPanel('communication');
      break;
    case 'starcomms':
      showStarCommsCommand();
      break;
    case 'sectors':
      selectPanel('sectors');
      break;
    case 'clear':
      boot();
      break;
    case 'about':
      row('DNI TERMINAL v4.3.0');
      row('DREADNOUGHT IMPERIUM DATABASE NETWORK', 'muted');
      row('DNI COMMUNICATION // SERVER-SIDE STAR COMMS OWNER API', 'muted');
      break;
    default:
      row(`UNKNOWN COMMAND: ${command.toUpperCase()} // TYPE HELP`, 'muted');
  }
}

input.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  const value = input.value;
  input.value = '';
  execute(value);
});
for (const tab of tabs) {
  tab.addEventListener('click', () => selectPanel(tab.dataset.panel));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.indexOf(tab);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    tabs[(current + delta + tabs.length) % tabs.length].click();
  });
}
document.querySelector('#terminal-home').addEventListener('click', () => selectPanel('terminal'));
document.querySelector('#terminal-inbox').addEventListener('click', () => openMail('all'));
document.querySelector('#terminal-add').addEventListener('click', () => {
  terminalIndex += 1;
  terminalNumber.textContent = `TERMINAL ${terminalIndex}`;
  row(`TERMINAL ${terminalIndex} SESSION INITIALIZED`, 'muted');
  input.focus({ preventScroll: true });
});
document.querySelector('#create-net-form').addEventListener('submit', event => {
  event.preventDefault();
  const field = document.querySelector('#new-net-name');
  const value = field.value.trim();
  if (!value) return;
  void runCommsAction(async () => {
    const snapshot = await createNet(value);
    field.value = '';
    return snapshot;
  });
});
document.querySelector('#ready-check-button').addEventListener('click', () => void runCommsAction(() => startReadyCheck()));
document.querySelector('#refresh-comms').addEventListener('click', () => void syncComms());
document.querySelector('#acars-form').addEventListener('submit', event => {
  event.preventDefault();
  const field = document.querySelector('#acars-text');
  const value = field.value.trim();
  if (!value) return;
  void runCommsAction(async () => {
    const snapshot = await sendAcars(value);
    field.value = '';
    return snapshot;
  });
});

fetch('/api/dni/session', {
  credentials: 'same-origin',
  cache: 'no-store',
  headers: { Accept: 'application/json' }
})
  .then(response => response.json())
  .then(session => {
    const permissions = Array.isArray(session.permissions) ? session.permissions : [];
    commsWritable = Boolean(session.authenticated && (permissions.includes('admin') || permissions.includes('communication.write')));
    renderComms();
  })
  .catch(() => {});

initializeMail();
boot();
renderComms();
selectPanel('terminal');
