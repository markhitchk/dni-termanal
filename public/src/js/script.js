import { getDniRecord, listDniRecords } from './access.js';
import { getCommsSnapshot, refreshComms, createNet, assignUser, startReadyCheck, sendAcars } from './comms-provider.js';
import { initializeMail, openMail, handleMailCommand } from './mail.js';

const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const windowEl = document.querySelector('#terminal-window');
const tabs = [...document.querySelectorAll('.nav-tab')];
const shell = document.querySelector('.terminal-shell');
const terminalNumber = document.querySelector('#terminal-number');
const separator = '------------------------------------------------------------';
const COMMAND_HISTORY_KEY = 'dni.terminal.history.v1';
const COMMAND_HISTORY_LIMIT = 50;
const COMMS_REFRESH_MS = 20000;
const COMMAND_COMPLETIONS = Object.freeze([
  'help', 'access ', 'list', 'mail', 'mail unread', 'mail announcements', 'mail service', 'mail read ', 'inbox',
  'terminal', 'dashboard', 'services', 'communication', 'starcomms', 'sectors', 'history', 'history clear', 'status',
  'developer', 'credits', 'creator', 'clear', 'about'
]);
const developerLogo = 'https://cdn.jsdelivr.net/gh/markhitchk/hcf@main/assets/logos/HTG.svg';

let terminalIndex = 1;
let commsWritable = false;
let communicationActive = false;
let commsRefreshTimer = null;
let commsSyncing = false;
let commsConnectionState = 'idle';
let commsLastError = '';
let commandHistory = loadCommandHistory();
let historyCursor = commandHistory.length;
let historyDraft = '';
let autocompletePrefix = '';
let autocompleteMatches = [];
let autocompleteIndex = -1;

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
  row('HISTORY [CLEAR]     Show or clear terminal command history', 'muted');
  row('STATUS              Show browser and DNI link status', 'muted');
  row('DEVELOPER           Show website developer credits and logo', 'muted');
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

function loadCommandHistory() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(COMMAND_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(-COMMAND_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}
function saveCommandHistory() {
  try {
    sessionStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(commandHistory));
  } catch {
    // History stays in memory when browser storage is unavailable.
  }
}
function rememberCommand(value) {
  const clean = String(value || '').trim();
  if (!clean) return;
  if (commandHistory[commandHistory.length - 1] !== clean) commandHistory.push(clean);
  if (commandHistory.length > COMMAND_HISTORY_LIMIT) commandHistory = commandHistory.slice(-COMMAND_HISTORY_LIMIT);
  saveCommandHistory();
  historyCursor = commandHistory.length;
  historyDraft = '';
}
function showHistory(args = []) {
  if (String(args[0] || '').toLowerCase() === 'clear') {
    commandHistory = [];
    historyCursor = 0;
    historyDraft = '';
    saveCommandHistory();
    row('TERMINAL COMMAND HISTORY CLEARED', 'muted');
    return;
  }
  row('TERMINAL COMMAND HISTORY');
  if (!commandHistory.length) {
    row('NO COMMAND HISTORY IN THIS BROWSER SESSION', 'muted');
    return;
  }
  commandHistory.forEach((entry, index) => row(`${String(index + 1).padStart(2, '0')}  ${entry}`, 'muted'));
}
function resetAutocomplete() {
  autocompletePrefix = '';
  autocompleteMatches = [];
  autocompleteIndex = -1;
}
function navigateHistory(delta) {
  if (!commandHistory.length) return false;
  if (historyCursor === commandHistory.length) historyDraft = input.value;
  historyCursor = Math.max(0, Math.min(commandHistory.length, historyCursor + delta));
  input.value = historyCursor === commandHistory.length ? historyDraft : commandHistory[historyCursor];
  input.setSelectionRange(input.value.length, input.value.length);
  resetAutocomplete();
  return true;
}
function autocompleteCommand() {
  if (input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) return false;
  const prefix = input.value.toLowerCase();
  if (!prefix.trim()) return false;
  if (prefix !== autocompletePrefix) {
    autocompletePrefix = prefix;
    autocompleteMatches = COMMAND_COMPLETIONS.filter(candidate => candidate.startsWith(prefix));
    autocompleteIndex = -1;
  }
  if (!autocompleteMatches.length) return false;
  autocompleteIndex = (autocompleteIndex + 1) % autocompleteMatches.length;
  input.value = autocompleteMatches[autocompleteIndex];
  input.setSelectionRange(input.value.length, input.value.length);
  return true;
}

function showDeveloperCredits() {
  row(separator, 'separator');
  row('DNI DEVELOPMENT CREDITS');
  row('DREADNOUGHT IMPERIUM DATABASE NETWORK', 'muted');

  const card = document.createElement('section');
  card.setAttribute('aria-label', 'DNI Terminal developer credits');
  card.style.display = 'grid';
  card.style.gridTemplateColumns = 'minmax(110px, 190px) minmax(0, 1fr)';
  card.style.gap = '18px';
  card.style.alignItems = 'center';
  card.style.margin = '14px 0';
  card.style.padding = '16px';
  card.style.border = '1px solid currentColor';
  card.style.background = 'rgba(0, 0, 0, 0.28)';
  card.style.boxSizing = 'border-box';

  const logo = document.createElement('img');
  logo.src = developerLogo;
  logo.alt = 'Harley-The-Gamer logo';
  logo.loading = 'eager';
  logo.decoding = 'async';
  logo.style.display = 'block';
  logo.style.width = '100%';
  logo.style.maxWidth = '190px';
  logo.style.height = 'auto';
  logo.style.margin = '0 auto';

  const details = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = "MADE & DEVELOPED BY HARLEY'S STUDIOS";
  heading.style.display = 'block';
  heading.style.marginBottom = '10px';
  const creator = document.createElement('div');
  creator.textContent = 'CREATOR / DEVELOPER // HarleyTG';
  const studio = document.createElement('div');
  studio.textContent = "STUDIO // Harley's Studios";
  const project = document.createElement('div');
  project.textContent = 'PROJECT // Dreadnought Imperium Database Network';
  const terminal = document.createElement('div');
  terminal.textContent = 'SYSTEM // DNI Terminal v4.3.0';
  const note = document.createElement('div');
  note.className = 'muted';
  note.style.marginTop = '10px';
  note.textContent = 'Website and DNI Terminal developed for the Dreadnought Imperium organization.';
  details.append(heading, creator, studio, project, terminal, note);
  card.append(logo, details);
  output.append(card);

  if (window.matchMedia('(max-width: 620px)').matches) {
    card.style.gridTemplateColumns = '1fr';
    card.style.textAlign = 'center';
    logo.style.maxWidth = '170px';
  }
  row("ALIASES // 'credits' or 'creator'", 'muted');
  row(separator, 'separator');
  windowEl.scrollTop = windowEl.scrollHeight;
}

function netName(snapshot, uid) {
  return snapshot.nets.find(net => net.uid === uid || net.netUid === uid)?.name || 'UNASSIGNED';
}
function setStatusElementState(status, state) {
  if (!status) return;
  status.dataset.state = state;
}
function renderProviderState(snapshot) {
  const badge = document.querySelector('.provider-badge');
  const status = document.querySelector('.status-online');
  const footnote = document.querySelector('.comms-footnote');

  if (navigator.onLine === false || commsConnectionState === 'offline') {
    if (badge) badge.textContent = 'BROWSER OFFLINE';
    if (status) status.innerHTML = '<i></i> NETWORK OFFLINE';
    setStatusElementState(status, 'offline');
    if (footnote) footnote.textContent = 'This browser is offline. DNI will reconnect the Star Comms bridge automatically when network access returns.';
    return;
  }
  if (commsConnectionState === 'connecting' || commsConnectionState === 'reconnecting') {
    if (badge) badge.textContent = commsConnectionState === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING';
    if (status) status.innerHTML = '<i></i> LINK NEGOTIATING';
    setStatusElementState(status, 'connecting');
    if (footnote) footnote.textContent = 'DNI is establishing the server-side Star Comms bridge. Existing displayed data remains read-only until the link is confirmed.';
    return;
  }
  if (commsConnectionState === 'error') {
    if (badge) badge.textContent = 'OWNER API UNAVAILABLE';
    if (status) status.innerHTML = '<i></i> LINK DEGRADED';
    setStatusElementState(status, 'error');
    if (footnote) footnote.textContent = `Star Comms bridge unavailable: ${commsLastError || 'server link error'}`;
    return;
  }
  if (snapshot.available) {
    if (badge) badge.textContent = 'LIVE / OWNER API';
    if (status) status.innerHTML = '<i></i> LIVE SERVER BRIDGE';
    setStatusElementState(status, 'online');
    if (footnote) footnote.textContent = 'Live Star Comms data is being proxied by the DNI Rocky Linux server. Owner credentials remain server-side and are never exposed to this browser.';
    return;
  }
  if (badge) badge.textContent = 'OWNER API UNAVAILABLE';
  if (status) status.innerHTML = '<i></i> API UNAVAILABLE';
  setStatusElementState(status, 'idle');
  if (footnote) footnote.textContent = 'The Star Comms Owner API bridge has not returned a live snapshot yet.';
}
function updateCommsControls() {
  const enabled = commsWritable && commsConnectionState === 'online' && navigator.onLine !== false;
  const create = document.querySelector('#create-net-form button');
  const ready = document.querySelector('#ready-check-button');
  const acars = document.querySelector('#acars-form button');
  if (create) create.disabled = !enabled;
  if (ready) ready.disabled = !enabled;
  if (acars) acars.disabled = !enabled;
  for (const select of document.querySelectorAll('.net-select')) select.disabled = !enabled;
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
  updateCommsControls();
}
function showCommsError(error) {
  console.error(error);
  commsLastError = String(error?.message || error || 'server link error');
  commsConnectionState = navigator.onLine === false ? 'offline' : 'error';
  renderProviderState(getCommsSnapshot());
  updateCommsControls();
}
async function syncComms({ reconnecting = false } = {}) {
  if (commsSyncing) return;
  if (navigator.onLine === false) {
    commsConnectionState = 'offline';
    renderProviderState(getCommsSnapshot());
    updateCommsControls();
    return;
  }
  commsSyncing = true;
  commsConnectionState = reconnecting || getCommsSnapshot().available ? 'reconnecting' : 'connecting';
  renderProviderState(getCommsSnapshot());
  updateCommsControls();
  try {
    const snapshot = await refreshComms();
    commsConnectionState = 'online';
    commsLastError = '';
    renderComms(snapshot);
  } catch (error) {
    showCommsError(error);
  } finally {
    commsSyncing = false;
  }
}
async function runCommsAction(action) {
  if (navigator.onLine === false) {
    showCommsError(new Error('Browser is offline. Reconnect before performing Star Comms actions.'));
    return;
  }
  try {
    const snapshot = await action();
    commsConnectionState = 'online';
    commsLastError = '';
    renderComms(snapshot);
  } catch (error) {
    showCommsError(error);
  }
}
function stopCommsRefresh() {
  if (commsRefreshTimer !== null) {
    clearInterval(commsRefreshTimer);
    commsRefreshTimer = null;
  }
}
function startCommsRefresh() {
  stopCommsRefresh();
  if (!communicationActive || document.hidden || navigator.onLine === false) return;
  commsRefreshTimer = window.setInterval(() => {
    if (!communicationActive || document.hidden || navigator.onLine === false || commsSyncing) return;
    void syncComms({ reconnecting: true });
  }, COMMS_REFRESH_MS);
}
function showStarCommsCommand() {
  const snapshot = getCommsSnapshot();
  const state = navigator.onLine === false ? 'BROWSER OFFLINE' : (snapshot.available && commsConnectionState === 'online' ? 'ONLINE' : commsConnectionState.toUpperCase());
  row(`STAR COMMS SERVER BRIDGE: ${state || 'UNAVAILABLE'}`);
  row(`SHARD: ${snapshot.shard || 'UNAVAILABLE'}`, 'muted');
  if (snapshot.fetchedAt) row(`LAST SYNC: ${new Date(snapshot.fetchedAt).toLocaleString()}`, 'muted');
  row('Owner API credentials are stored only on the DNI server.', 'muted');
}
function showStatus() {
  const snapshot = getCommsSnapshot();
  const panel = String(shell?.dataset?.panel || 'terminal').toUpperCase();
  row('DNI LINK STATUS');
  row(`BROWSER NETWORK: ${navigator.onLine === false ? 'OFFLINE' : 'ONLINE'}`, 'muted');
  row(`ACTIVE PANEL: ${panel}`, 'muted');
  row(`STAR COMMS: ${commsConnectionState.toUpperCase()}${snapshot.available ? ' / SNAPSHOT AVAILABLE' : ''}`, 'muted');
  row(`AUTO COMMS REFRESH: ${communicationActive && !document.hidden && navigator.onLine !== false ? 'ACTIVE' : 'PAUSED'}`, 'muted');
  row(`COMMAND HISTORY: ${commandHistory.length}/${COMMAND_HISTORY_LIMIT}`, 'muted');
  if (snapshot.fetchedAt) row(`LAST COMMS SYNC: ${new Date(snapshot.fetchedAt).toLocaleString()}`, 'muted');
  if (commsLastError) row(`LAST LINK ERROR: ${commsLastError}`, 'muted');
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
  if (panel === 'terminal') input.focus({ preventScroll: true });
}
function execute(raw) {
  const value = raw.trim();
  if (!value) return;
  rememberCommand(value);
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
    case 'history':
      showHistory(args);
      break;
    case 'status':
      showStatus();
      break;
    case 'developer':
    case 'credits':
    case 'creator':
      showDeveloperCredits();
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

input.addEventListener('input', () => {
  resetAutocomplete();
  if (historyCursor !== commandHistory.length) {
    historyCursor = commandHistory.length;
    historyDraft = input.value;
  }
});
input.addEventListener('keydown', event => {
  if (event.key === 'ArrowUp') {
    if (navigateHistory(-1)) event.preventDefault();
    return;
  }
  if (event.key === 'ArrowDown') {
    if (navigateHistory(1)) event.preventDefault();
    return;
  }
  if (event.key === 'Tab') {
    if (autocompleteCommand()) event.preventDefault();
    return;
  }
  if (event.key !== 'Enter') return;
  const value = input.value;
  input.value = '';
  resetAutocomplete();
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
document.querySelector('#refresh-comms').addEventListener('click', () => void syncComms({ reconnecting: getCommsSnapshot().available }));
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

window.addEventListener('dni:panel', event => {
  communicationActive = event.detail?.panel === 'communication';
  if (communicationActive) {
    void syncComms({ reconnecting: getCommsSnapshot().available });
    startCommsRefresh();
  } else {
    stopCommsRefresh();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopCommsRefresh();
  } else if (communicationActive) {
    void syncComms({ reconnecting: getCommsSnapshot().available });
    startCommsRefresh();
  }
});
window.addEventListener('offline', () => {
  stopCommsRefresh();
  commsConnectionState = 'offline';
  renderProviderState(getCommsSnapshot());
  updateCommsControls();
});
window.addEventListener('online', () => {
  if (!communicationActive) return;
  commsConnectionState = getCommsSnapshot().available ? 'reconnecting' : 'connecting';
  renderProviderState(getCommsSnapshot());
  void syncComms({ reconnecting: true });
  startCommsRefresh();
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
  .catch(() => {
    commsWritable = false;
    updateCommsControls();
  });

initializeMail();
boot();
renderComms();
selectPanel('terminal');