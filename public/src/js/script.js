import { getDniRecord, listDniRecords } from './access.js';

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
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit'
  });
}

function boot() {
  output.replaceChildren();
  row('---------------------- DNI TERMINAL v4.1.6 ----------------------', 'separator');
  gap();
  row('DREADNOUGHT IMPERIUM');
  row('DREADNOUGHT IMPERIUM DATABASE NETWORK');
  gap();
  row(`Access Time: ${accessTime()}`);
  gap();
  commandLine([
    { text: "Enter '" }, { text: 'help', highlight: true },
    { text: "' for available commands or" }
  ]);
  commandLine([
    { text: "'" }, { text: 'access', highlight: true },
    { text: "' to quickly access DNI files." }
  ]);
  commandLine([
    { text: "Example: '" }, { text: 'access 173', highlight: true },
    { text: "' to access DNI-173." }
  ]);
  gap();
  row(separator, 'separator');
  gap();
  windowEl.scrollTop = windowEl.scrollHeight;
}

function showHelp() {
  row('AVAILABLE COMMANDS');
  row('HELP             Display this command list', 'muted');
  row('ACCESS <number>  Open a local DNI archive record', 'muted');
  row('LIST             List local DNI archive records', 'muted');
  row('CLEAR            Clear and restart the terminal', 'muted');
  row('ABOUT            Display DNI Terminal information', 'muted');
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
  admin.textContent = 'admin';
  const host = document.createElement('span');
  host.className = 'prompt-host';
  host.textContent = 'dni';
  line.append(admin, document.createTextNode('@'), host, document.createTextNode(`:~$ ${value}`));
  output.append(line);
}

function execute(raw) {
  const value = raw.trim();
  if (!value) return;
  echoCommand(value);
  const [command, ...args] = value.split(/\s+/);
  switch (command.toLowerCase()) {
    case 'help': showHelp(); break;
    case 'access': showRecord(args[0]); break;
    case 'list': showList(); break;
    case 'clear': boot(); break;
    case 'about':
      row('DNI TERMINAL v4.1.6');
      row('DREADNOUGHT IMPERIUM DATABASE NETWORK', 'muted');
      row('LOCAL ARCHIVE MODE // NO EXTERNAL DATABASE FEEDS', 'muted');
      break;
    default:
      row(`UNKNOWN COMMAND: ${command.toUpperCase()} // TYPE HELP`, 'muted');
  }
  windowEl.scrollTop = windowEl.scrollHeight;
}

input.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const value = input.value;
  input.value = '';
  execute(value);
});

function selectPanel(panel, announce = true) {
  shell.dataset.panel = panel;
  for (const tab of tabs) {
    const active = tab.dataset.panel === panel;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  if (announce) {
    if (panel === 'overview') row('SITE OVERVIEW // DNI SECTOR MAP READY', 'muted');
    if (panel === 'database') row('DATABASE // DNI LOCAL ARCHIVE READY', 'muted');
  }
  input.focus({ preventScroll: true });
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectPanel(tab.dataset.panel));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.indexOf(tab);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    tabs[(current + delta + tabs.length) % tabs.length].click();
  });
}

document.querySelector('#terminal-home').addEventListener('click', () => {
  selectPanel('terminal', false);
  input.focus({ preventScroll: true });
});

document.querySelector('#terminal-inbox').addEventListener('click', () => {
  row('INBOX // NO NEW DNI MESSAGES', 'muted');
  input.focus({ preventScroll: true });
});

document.querySelector('#terminal-add').addEventListener('click', () => {
  terminalIndex += 1;
  terminalNumber.textContent = `TERMINAL ${terminalIndex}`;
  row(`TERMINAL ${terminalIndex} SESSION INITIALIZED`, 'muted');
  input.focus({ preventScroll: true });
});

boot();
selectPanel('terminal', false);
input.focus({ preventScroll: true });
