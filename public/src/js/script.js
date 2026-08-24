import { getDniRecord, listDniRecords } from './access.js';
import {
  getCommsSnapshot,
  getStarCommsTestConfig,
  setStarCommsTestSession,
  clearStarCommsTestSession,
  refreshComms,
  createNet,
  assignUser,
  startReadyCheck,
  sendAcars,
  simulateMockPulse
} from './comms-provider.js';

const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const windowEl = document.querySelector('#terminal-window');
const tabs = [...document.querySelectorAll('.nav-tab')];
const shell = document.querySelector('.terminal-shell');
const terminalNumber = document.querySelector('#terminal-number');
let terminalIndex = 1;
const separator = '------------------------------------------------------------';

function row(text = '', className = '') {
  const el = document.createElement('div');
  el.textContent = text;
  if (className) el.className = className;
  output.append(el);
  windowEl.scrollTop = windowEl.scrollHeight;
  return el;
}
function gap() { const el = document.createElement('div'); el.className = 'terminal-gap'; output.append(el); }
function commandLine(parts) {
  const el = document.createElement('div');
  for (const part of parts) {
    const span = document.createElement('span'); span.textContent = part.text;
    if (part.highlight) span.className = 'command-highlight';
    el.append(span);
  }
  output.append(el);
}
function accessTime() {
  return new Date().toLocaleString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
}
function boot() {
  output.replaceChildren();
  row('---------------------- DNI TERMINAL v4.1.6 ----------------------', 'separator');
  gap(); row('DREADNOUGHT IMPERIUM'); row('DREADNOUGHT IMPERIUM DATABASE NETWORK'); gap();
  row(`Access Time: ${accessTime()}`); gap();
  commandLine([{ text: "Enter '" }, { text: 'help', highlight: true }, { text: "' for available commands or" }]);
  commandLine([{ text: "'" }, { text: 'access', highlight: true }, { text: "' to quickly access DNI files." }]);
  commandLine([{ text: "Example: '" }, { text: 'access 173', highlight: true }, { text: "' to access DNI-173." }]);
  gap(); row(separator, 'separator'); gap();
}
function showHelp() {
  row('AVAILABLE COMMANDS');
  row('HELP             Display this command list', 'muted');
  row('ACCESS <number>  Open a local DNI archive record', 'muted');
  row('LIST             List local DNI archive records', 'muted');
  row('TERMINAL         Open DNI Terminal', 'muted');
  row('DASHBOARD        Open DNI Dashboard', 'muted');
  row('SERVICES         Open DNI Services', 'muted');
  row('COMMUNICATION    Open DNI Communication', 'muted');
  row('STARCOMMS        Show GitHub Pages test connection status', 'muted');
  row('SECTORS          Open DNI Sectors', 'muted');
  row('CLEAR            Clear and restart the terminal', 'muted');
  row('ABOUT            Display DNI Terminal information', 'muted');
}
function showList() { row('DNI DATABASE INDEX'); for (const record of listDniRecords()) row(`${record.id}  ${record.sector}  ${record.classification}  ${record.status}`, 'muted'); }
function showRecord(value) {
  const record = getDniRecord(value);
  if (!record) { row('ERROR: ENTER A DNI DOCUMENT NUMBER. EXAMPLE: ACCESS 173'); return; }
  row(separator, 'separator'); row(`DOCUMENT: ${record.id}`); row(`SECTOR: ${record.sector}`, 'muted');
  row(`CLASSIFICATION: ${record.classification}`, 'muted'); row(`STATUS: ${record.status}`, 'muted');
  row(`SUMMARY: ${record.summary}`, 'muted'); row(separator, 'separator');
}
function echoCommand(value) {
  const line = document.createElement('div');
  const admin = document.createElement('span'); admin.className = 'prompt-admin'; admin.textContent = 'admin';
  const host = document.createElement('span'); host.className = 'prompt-host'; host.textContent = 'dni';
  line.append(admin, document.createTextNode('@'), host, document.createTextNode(`:~$ ${value}`)); output.append(line);
}
function netName(snapshot, uid) { return snapshot.nets.find(net => net.uid === uid || net.netUid === uid)?.name || 'UNASSIGNED'; }

function ensureTestControls() {
  if (document.querySelector('#starcomms-test-form')) return;
  const actionCard = document.querySelector('.action-card');
  const readyButton = document.querySelector('#ready-check-button');
  if (!actionCard || !readyButton) return;

  const wrap = document.createElement('div');
  wrap.id = 'starcomms-test-wrap';
  wrap.innerHTML = `
    <form id="starcomms-test-form" class="stack-form" autocomplete="off">
      <label for="starcomms-launch-url">Full Star Comms launch URL · test session</label>
      <textarea id="starcomms-launch-url" rows="3" spellcheck="false" autocapitalize="off" placeholder="https://star-comms.org/launch?uri=..."></textarea>
      <label for="starcomms-owner-key" style="margin-top:8px">Owner API key · current tab only</label>
      <input id="starcomms-owner-key" type="password" spellcheck="false" autocapitalize="off" placeholder="scok_…" style="width:100%;border:1px solid #333;background:#050505;color:#eee;padding:9px;font:12px/1.3 Courier New,monospace">
      <button type="submit">Connect Full Launch Test</button>
      <button type="button" id="starcomms-open-launch">Open Star Comms</button>
      <button type="button" id="starcomms-disconnect">Disconnect Test</button>
      <div id="starcomms-test-state" class="ready-state">NOT CONNECTED</div>
    </form>`;
  actionCard.insertBefore(wrap, readyButton);

  document.querySelector('#starcomms-test-form').addEventListener('submit', event => {
    event.preventDefault();
    const launch = document.querySelector('#starcomms-launch-url').value.trim();
    const key = document.querySelector('#starcomms-owner-key').value.trim();
    try {
      setStarCommsTestSession(launch, key);
      document.querySelector('#starcomms-owner-key').value = '';
      renderComms();
      void syncComms();
    } catch (error) { showCommsError(error); }
  });
  document.querySelector('#starcomms-disconnect').addEventListener('click', () => {
    clearStarCommsTestSession();
    document.querySelector('#starcomms-launch-url').value = '';
    document.querySelector('#starcomms-owner-key').value = '';
    renderComms();
  });
  document.querySelector('#starcomms-open-launch').addEventListener('click', () => {
    const config = getStarCommsTestConfig();
    const launch = config.launchUrl || document.querySelector('#starcomms-launch-url').value.trim();
    if (!launch) { showCommsError(new Error('Enter/connect the full Star Comms launch URL first.')); return; }
    window.location.href = launch;
  });
}

function setLiveUi(snapshot) {
  const config = getStarCommsTestConfig();
  ensureTestControls();
  const subtitle = document.querySelector('.module-subtitle');
  if (subtitle) subtitle.textContent = 'GitHub Pages test mode can use the complete Star Comms launch URL plus an Owner API key for direct Dreadnought Imperium API testing. Session values are kept only in this browser tab.';
  document.querySelector('#pulse-comms').textContent = snapshot.live ? 'Refresh Live' : 'Simulate SSE';
  document.querySelector('.mock-badge').textContent = snapshot.live ? 'LIVE / GITHUB PAGES TEST' : (config.connected ? 'TEST SESSION READY' : 'API CONTRACT / SIMULATION');
  document.querySelector('.status-online').innerHTML = snapshot.live ? '<i></i> LIVE OWNER API TEST' : (config.connected ? '<i></i> TEST SESSION READY' : '<i></i> CONTRACT SIMULATION');
  const stateEl = document.querySelector('#starcomms-test-state');
  if (stateEl) stateEl.textContent = config.connected ? `${config.apiBase} · ${config.launchId}` : 'NOT CONNECTED';
  if (config.launchConfigured) document.querySelector('#starcomms-launch-url').value = config.launchUrl;
  document.querySelector('.comms-footnote').textContent = snapshot.live
    ? 'LIVE TEST: the full Star Comms launch URL is the session context and the Owner API key authenticates /api/v1 requests. Both are held only for this browser tab and are not committed to GitHub.'
    : 'DNI is in simulation until the full Star Comms launch URL and Owner API key are connected in the test controls above.';
}

function renderComms(snapshot = getCommsSnapshot()) {
  const config = getStarCommsTestConfig();
  document.querySelector('#comms-shard').textContent = snapshot.shard || (config.shardUrl ? new URL(config.shardUrl).hostname : 'NOT CONNECTED');
  document.querySelector('#metric-users').textContent = snapshot.connectedCount ?? snapshot.roster.length;
  document.querySelector('#metric-nets').textContent = snapshot.nets.length;
  document.querySelector('#metric-tx').textContent = snapshot.nets.filter(net => net.tx).length;
  document.querySelector('#metric-operation').textContent = snapshot.operationOpen ? 'OPEN' : 'CLOSED';
  document.querySelector('#roster-count').textContent = `${snapshot.roster.length} ONLINE`;
  setLiveUi(snapshot);

  const nets = document.querySelector('#comms-nets'); nets.replaceChildren();
  for (const net of snapshot.nets) {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'net-row';
    item.innerHTML = `<span class="net-signal ${net.tx ? 'is-tx' : ''}"></span><span class="net-name"></span><span class="net-members"></span><span class="net-state"></span>`;
    item.querySelector('.net-name').textContent = net.name; item.querySelector('.net-members').textContent = `${net.members} members`; item.querySelector('.net-state').textContent = net.tx ? 'TX' : 'IDLE'; nets.append(item);
  }

  const roster = document.querySelector('#comms-roster'); roster.replaceChildren();
  for (const user of snapshot.roster) {
    const rowEl = document.createElement('div'); rowEl.className = 'roster-row';
    const identity = document.createElement('div'); identity.className = 'roster-identity'; identity.innerHTML = '<span class="presence-dot"></span><div><strong></strong><small></small></div>';
    identity.querySelector('strong').textContent = user.name; identity.querySelector('small').textContent = user.role;
    const select = document.createElement('select'); select.className = 'net-select'; select.setAttribute('aria-label', `Assign ${user.name} to Star Comms net`);
    for (const net of snapshot.nets) { const option = document.createElement('option'); option.value = net.uid; option.textContent = net.name; option.selected = user.netUid === net.uid; select.append(option); }
    select.addEventListener('change', () => void runCommsAction(() => assignUser(user.userId || user.id, select.value)));
    const meta = document.createElement('span'); meta.className = 'roster-net'; meta.textContent = netName(snapshot, user.netUid);
    rowEl.append(identity, select, meta); roster.append(rowEl);
  }

  const ready = document.querySelector('#ready-check-state');
  if (snapshot.readyCheck.active) ready.innerHTML = `<b>${snapshot.readyCheck.ready} READY</b><span>${snapshot.readyCheck.declined} DECLINED</span><span>${snapshot.readyCheck.afk} AFK</span>`;
  else ready.textContent = 'No ready check active.';

  const events = document.querySelector('#comms-events'); events.replaceChildren();
  for (const entry of snapshot.events) {
    const item = document.createElement('div'); item.className = 'event-row'; item.innerHTML = '<time></time><span class="event-type"></span><p></p>';
    item.querySelector('time').textContent = entry.time; item.querySelector('.event-type').textContent = entry.type; item.querySelector('p').textContent = entry.text; events.append(item);
  }
}
function showCommsError(error) {
  console.error(error);
  document.querySelector('.mock-badge').textContent = 'STAR COMMS TEST ERROR';
  document.querySelector('.comms-footnote').textContent = `Star Comms test: ${error.message || error}`;
}
async function syncComms() { try { renderComms(await refreshComms()); } catch (error) { renderComms(); showCommsError(error); } }
async function runCommsAction(action) { try { renderComms(await action()); } catch (error) { showCommsError(error); } }
function showStarCommsCommand() {
  const config = getStarCommsTestConfig();
  row(`STAR COMMS TEST: ${config.connected ? 'CONNECTED' : 'NOT CONNECTED'}`);
  row(`API BASE: ${config.apiBase}`, 'muted');
  if (config.launchId) row(`LAUNCH ID: ${config.launchId}`, 'muted');
  row('Open DNI Communication to configure the full launch URL + Owner key.', 'muted');
}
function selectPanel(panel) {
  shell.dataset.panel = panel;
  for (const tab of tabs) {
    const active = tab.dataset.panel === panel; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    if (active) tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
  if (panel === 'communication') void syncComms();
  if (panel === 'terminal') input.focus({ preventScroll: true });
}
function execute(raw) {
  const value = raw.trim(); if (!value) return; echoCommand(value); const [command, ...args] = value.split(/\s+/);
  switch (command.toLowerCase()) {
    case 'help': showHelp(); break; case 'access': showRecord(args[0]); break; case 'list': showList(); break;
    case 'terminal': selectPanel('terminal'); break; case 'dashboard': selectPanel('dashboard'); break; case 'services': selectPanel('services'); break;
    case 'communication': case 'communications': selectPanel('communication'); break; case 'starcomms': showStarCommsCommand(); break; case 'sectors': selectPanel('sectors'); break;
    case 'clear': boot(); break;
    case 'about': row('DNI TERMINAL v4.1.6'); row('DREADNOUGHT IMPERIUM DATABASE NETWORK', 'muted'); row('DNI COMMUNICATION // STAR COMMS GITHUB PAGES TEST MODE', 'muted'); break;
    default: row(`UNKNOWN COMMAND: ${command.toUpperCase()} // TYPE HELP`, 'muted');
  }
}

input.addEventListener('keydown', event => { if (event.key !== 'Enter') return; const value = input.value; input.value = ''; execute(value); });
for (const tab of tabs) {
  tab.addEventListener('click', () => selectPanel(tab.dataset.panel));
  tab.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const current = tabs.indexOf(tab); const delta = event.key === 'ArrowRight' ? 1 : -1; tabs[(current + delta + tabs.length) % tabs.length].click(); });
}
document.querySelector('#terminal-home').addEventListener('click', () => selectPanel('terminal'));
document.querySelector('#terminal-inbox').addEventListener('click', () => selectPanel('communication'));
document.querySelector('#terminal-add').addEventListener('click', () => { terminalIndex += 1; terminalNumber.textContent = `TERMINAL ${terminalIndex}`; row(`TERMINAL ${terminalIndex} SESSION INITIALIZED`, 'muted'); input.focus({ preventScroll: true }); });
document.querySelector('#create-net-form').addEventListener('submit', event => { event.preventDefault(); const field = document.querySelector('#new-net-name'); const value = field.value.trim(); if (!value) return; void runCommsAction(async () => { const snapshot = await createNet(value); field.value = ''; return snapshot; }); });
document.querySelector('#ready-check-button').addEventListener('click', () => void runCommsAction(() => startReadyCheck()));
document.querySelector('#pulse-comms').addEventListener('click', () => { if (getStarCommsTestConfig().connected) void syncComms(); else renderComms(simulateMockPulse()); });
document.querySelector('#acars-form').addEventListener('submit', event => { event.preventDefault(); const field = document.querySelector('#acars-text'); const value = field.value.trim(); if (!value) return; void runCommsAction(async () => { const snapshot = await sendAcars(value); field.value = ''; return snapshot; }); });

boot(); ensureTestControls(); renderComms(); selectPanel('terminal');
