import { getDniRecord, listDniRecords } from './access.js';

const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const tabs = [...document.querySelectorAll('.nav-tab')];
const dashboardTitle = document.querySelector('.description h1');
const tinyDescription = document.querySelector('#tinyDes');

const bootLines = [
  ["Enter 'help' for available commands or 'access' to quickly access DNI files.", 'line-muted'],
  ["Example: 'access 173' to access DNI-173.", 'line-muted'],
  ['', 'line-muted'],
  ['SECURE DNI ARCHIVE LINK: READY', 'line-success'],
  ['LOCAL DOCUMENT INDEX: ONLINE', 'line-success']
];

function line(text = '', className = '') {
  const row = document.createElement('div');
  row.textContent = text;
  if (className) row.className = className;
  output.append(row);
  output.scrollTop = output.scrollHeight;
}

function block(lines) {
  lines.forEach(([text, className]) => line(text, className));
}

function boot() {
  output.replaceChildren();
  block(bootLines);
  line();
  line('root@dni:~$ ', 'line-accent');
}

function showHelp() {
  block([
    ['AVAILABLE COMMANDS', 'line-accent'],
    ['  HELP                 Show this command list', 'line-muted'],
    ['  ACCESS <number>      Open a local DNI archive record', 'line-muted'],
    ['  LIST                 List authored DNI archive records', 'line-muted'],
    ['  DASHBOARD            Open DNI Dashboard', 'line-muted'],
    ['  COMMUNICATIONS       Open DNI Communications', 'line-muted'],
    ['  SERVICES             Open DNI Services', 'line-muted'],
    ['  ABOUT                Show terminal information', 'line-muted'],
    ['  CLEAR                Clear the terminal', 'line-muted']
  ]);
}

function showRecord(value) {
  const record = getDniRecord(value);
  if (!record) {
    line('ERROR: PLEASE ENTER A DNI DOCUMENT NUMBER. EXAMPLE: ACCESS 173', 'line-danger');
    return;
  }
  line('------------------------------------------------------------', 'line-muted');
  block([
    [`DOCUMENT: ${record.id}`, 'line-accent'],
    [`SECTOR: ${record.sector}`, 'line-muted'],
    [`CLASSIFICATION: ${record.classification}`, 'line-muted'],
    [`STATUS: ${record.status}`, record.status === 'ACTIVE' ? 'line-success' : 'line-warning'],
    [`SUMMARY: ${record.summary}`, 'line-muted']
  ]);
  line('------------------------------------------------------------', 'line-muted');
}

function showList() {
  line('DNI ARCHIVE INDEX', 'line-accent');
  for (const record of listDniRecords()) {
    line(`  ${record.id}  ${record.sector}  ${record.classification}  ${record.status}`, 'line-muted');
  }
  line('Use ACCESS <number> to open a record.', 'line-muted');
}

function selectTab(name, announce = true) {
  const normalized = name.toLowerCase();
  for (const tab of tabs) {
    const active = tab.dataset.panel === normalized;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.classList.toggle('offTab', !active);
  }
  document.body.dataset.panel = normalized;
  const labels = {
    communications: ['DNI COMMUNICATIONS', 'Encrypted message routing interface • Dreadnought Imperium Network'],
    services: ['DNI SERVICES', 'Network, archive, and sector services • Dreadnought Imperium Network'],
    dashboard: ['DNI DASHBOARD', 'Dreadnought Imperium • Engineering and Technical Service Department • v4.1.6']
  };
  const selected = labels[normalized];
  if (selected) {
    dashboardTitle.textContent = selected[0];
    tinyDescription.textContent = selected[1];
    if (announce) line(`${selected[0]} — READY`, 'line-accent');
  }
  input.focus({ preventScroll: true });
}

function execute(raw) {
  const value = raw.trim();
  if (!value) return;
  line(`root@dni:~$ ${value}`, 'line-accent');
  const [command, ...args] = value.split(/\s+/);
  switch (command.toLowerCase()) {
    case 'help': showHelp(); break;
    case 'access': showRecord(args[0]); break;
    case 'list': showList(); break;
    case 'dashboard': selectTab('dashboard'); break;
    case 'communications': selectTab('communications'); break;
    case 'services': selectTab('services'); break;
    case 'about':
      block([
        ['DNI Terminal v4.1.6', 'line-accent'],
        ['Dreadnought Imperium Network', 'line-muted'],
        ['Local DNI archive runtime. No external lore feeds or mirror databases are used.', 'line-muted']
      ]);
      break;
    case 'clear': boot(); break;
    default: line(`UNKNOWN COMMAND: ${command.toUpperCase()}. TYPE HELP FOR AVAILABLE COMMANDS.`, 'line-danger');
  }
}

input.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const value = input.value;
  input.value = '';
  execute(value);
});

for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab.dataset.panel));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.indexOf(tab);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(current + delta + tabs.length) % tabs.length];
    next.focus();
    next.click();
  });
}

function updateTelemetry() {
  const time = document.querySelector('#time');
  const device = document.querySelector('#device');
  const usage = document.querySelector('#usage');
  const temperature = document.querySelector('#temperature');
  if (time) time.textContent = new Date().toLocaleTimeString([], { hour12: false });
  if (device) device.textContent = navigator.userAgentData?.mobile ? 'Mobile terminal' : /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile terminal' : 'Desktop terminal';
  if (usage) usage.textContent = `${20 + Math.floor(Math.random() * 10)}%`;
  if (temperature) temperature.textContent = `${39 + Math.floor(Math.random() * 5)}°C`;
}

document.addEventListener('pointermove', (event) => {
  const mouse = document.querySelector('#mousepo');
  if (mouse) mouse.textContent = `${Math.round(event.clientX)}, ${Math.round(event.clientY)}`;
}, { passive: true });

updateTelemetry();
setInterval(updateTelemetry, 1000);
boot();
selectTab('dashboard', false);
