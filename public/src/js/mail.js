const separator = '------------------------------------------------------------';
const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const windowEl = document.querySelector('#terminal-window');
const shell = document.querySelector('.terminal-shell');
const tabs = [...document.querySelectorAll('.nav-tab')];
const inboxButton = document.querySelector('#terminal-inbox');

const MAIL_STORAGE_KEY = 'dni.mail.read.v2';
let activeFilter = 'all';
let selectedMessageId = null;

const mailMessages = Object.freeze([
  {
    id: '001',
    type: 'ANNOUNCEMENT',
    from: "HARLEY'S STUDIOS / HARLEYTG",
    date: '08/28/2026',
    subject: '🚧 UNDER CONSTRUCTION 🚧',
    body: "DREADNOUGHT IMPERIUM DATABASE NETWORK is currently under construction.\n\nMade by Harley's Studios aka HarleyTG.\n\nPlease send all feedback to a support ticket within the Discord server or by DM to HarleyTG (temp)."
  },
  {
    id: '002',
    type: 'SERVICE ANNOUNCEMENT',
    from: 'DNI SERVICE OPERATIONS',
    date: '08/28/2026',
    subject: 'Service Announcement Channel Online',
    body: 'DNI service announcements will be delivered here when network services require maintenance, experience availability changes, or return to normal operation.'
  }
]);

function installMailStyles() {
  if (document.querySelector('link[data-dni-mail-style]')) return;
  const source = new URL(import.meta.url);
  const stylesheet = source.pathname.includes('/dist/')
    ? new URL(`./mail.css${source.search}`, source)
    : new URL(`../css/mail.css${source.search}`, source);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = stylesheet.href;
  link.dataset.dniMailStyle = 'true';
  document.head.append(link);
}

function accessTime() {
  return new Date().toLocaleString(undefined, {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit'
  });
}

function row(text = '', className = '') {
  if (!output) return null;
  const el = document.createElement('div');
  el.textContent = text;
  if (className) el.className = className;
  output.append(el);
  if (windowEl) windowEl.scrollTop = windowEl.scrollHeight;
  return el;
}

function gap() {
  if (!output) return;
  const el = document.createElement('div');
  el.className = 'terminal-gap';
  output.append(el);
}

function commandLine(parts) {
  if (!output) return;
  const el = document.createElement('div');
  for (const part of parts) {
    const span = document.createElement('span');
    span.textContent = part.text;
    if (part.highlight) span.className = 'command-highlight';
    el.append(span);
  }
  output.append(el);
}

function renderBoot() {
  if (!output) return;
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

function readMessageIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MAIL_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveReadMessageIds(ids) {
  try {
    localStorage.setItem(MAIL_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // DNI Mail still functions when local storage is unavailable.
  }
}

function unreadCount() {
  const read = readMessageIds();
  return mailMessages.filter(message => !read.has(message.id)).length;
}

function previewText(message) {
  return String(message.body || '').replace(/\s+/g, ' ').trim();
}

function senderInitials(sender) {
  const clean = String(sender || 'DNI').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(part => part[0]).join('') || 'DN').toUpperCase();
}

function filterCount(filter, read = readMessageIds()) {
  return mailMessages.filter(message => messageMatchesFilter(message, filter, read)).length;
}

function ensureLaunchBadge() {
  if (!inboxButton) return null;
  let badge = inboxButton.querySelector('.dni-mail-launch-count');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'dni-mail-launch-count';
    inboxButton.append(badge);
  }
  return badge;
}

function ensureMailPanel() {
  if (!shell) return null;
  let panel = document.querySelector('#dni-mail-panel');
  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'dni-mail-panel';
  panel.className = 'module-panel dni-mail-panel';
  panel.dataset.module = 'mail';
  panel.setAttribute('aria-labelledby', 'dni-mail-title');
  panel.style.display = 'none';
  panel.innerHTML = `
    <header class="dni-mail-header">
      <div>
        <div class="module-kicker">DNI INTERNAL MESSAGE NETWORK</div>
        <div class="dni-mail-title-row">
          <span class="dni-mail-envelope" aria-hidden="true"></span>
          <h2 id="dni-mail-title">DNI Mail</h2>
        </div>
        <p class="module-subtitle">Official Dreadnought Imperium announcements and DNI service announcements.</p>
      </div>
      <div class="provider-badge">MAIL ONLINE</div>
    </header>

    <div class="dni-mail-statusbar" aria-label="DNI Mail status">
      <span><b>ACCOUNT</b> DREADNOUGHT IMPERIUM</span>
      <span><b>DELIVERY</b> INTERNAL NETWORK</span>
      <span><b>UNREAD</b> <span id="dni-mail-unread">0</span></span>
      <span class="dni-mail-online"><i></i> CONNECTED</span>
    </div>

    <div class="dni-mail-client">
      <aside class="dni-mail-folders" aria-label="DNI Mail folders">
        <div class="dni-mail-folder-label">MAILBOXES</div>
        <button class="dni-mail-folder is-active" type="button" data-mail-filter="all"><span class="dni-mail-folder-icon"></span><span>Inbox</span><span class="dni-mail-folder-count" data-mail-count="all">0</span></button>
        <button class="dni-mail-folder" type="button" data-mail-filter="unread"><span class="dni-mail-folder-icon"></span><span>Unread</span><span class="dni-mail-folder-count" data-mail-count="unread">0</span></button>
        <button class="dni-mail-folder" type="button" data-mail-filter="announcements"><span class="dni-mail-folder-icon"></span><span>Announcements</span><span class="dni-mail-folder-count" data-mail-count="announcements">0</span></button>
        <button class="dni-mail-folder" type="button" data-mail-filter="service"><span class="dni-mail-folder-icon"></span><span>Service</span><span class="dni-mail-folder-count" data-mail-count="service">0</span></button>
        <div class="dni-mail-readonly">READ-ONLY MAILBOX<br>Announcements and service notices only.</div>
      </aside>

      <section class="dni-mail-list-pane" aria-labelledby="dni-mail-list-title">
        <div class="dni-mail-pane-head">
          <div><span id="dni-mail-filter-label">INBOX</span><h3 id="dni-mail-list-title">Messages</h3></div>
          <span class="dni-mail-pane-count" id="dni-mail-pane-count">0 messages</span>
        </div>
        <div class="dni-mail-message-list" id="dni-mail-list"></div>
      </section>

      <section class="dni-mail-reader-pane" aria-labelledby="dni-mail-reader-title">
        <div id="dni-mail-reader" class="dni-mail-reader-empty">
          <div><div class="module-kicker">SECURE MESSAGE READER</div><p>Select a message from the inbox.</p></div>
        </div>
      </section>
    </div>

    <footer class="dni-mail-footer">DNI Mail is a read-only announcement mailbox for standard users. Operational communications remain under DNI Communication.</footer>`;

  shell.append(panel);
  panel.querySelectorAll('[data-mail-filter]').forEach(button => {
    button.addEventListener('click', () => {
      selectedMessageId = null;
      renderMailList(button.dataset.mailFilter || 'all', true);
    });
  });
  return panel;
}

function messageMatchesFilter(message, filter, read) {
  if (filter === 'unread') return !read.has(message.id);
  if (filter === 'announcements') return message.type === 'ANNOUNCEMENT';
  if (filter === 'service') return message.type === 'SERVICE ANNOUNCEMENT';
  return true;
}

function updateMailStatus() {
  const read = readMessageIds();
  const count = unreadCount();
  const unread = document.querySelector('#dni-mail-unread');
  if (unread) unread.textContent = String(count);

  for (const filter of ['all', 'unread', 'announcements', 'service']) {
    const counter = document.querySelector(`[data-mail-count="${filter}"]`);
    if (counter) counter.textContent = String(filterCount(filter, read));
  }

  const badge = ensureLaunchBadge();
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
  if (inboxButton) inboxButton.setAttribute('aria-label', `DNI Mail, ${count} unread message${count === 1 ? '' : 's'}`);
}

function renderMailList(filter = 'all', autoOpen = false) {
  activeFilter = filter;
  const panel = ensureMailPanel();
  const list = panel?.querySelector('#dni-mail-list');
  const label = panel?.querySelector('#dni-mail-filter-label');
  const paneCount = panel?.querySelector('#dni-mail-pane-count');
  if (!list) return;

  const read = readMessageIds();
  const messages = mailMessages.filter(message => messageMatchesFilter(message, filter, read));
  list.replaceChildren();

  const labels = { all: 'INBOX', unread: 'UNREAD', announcements: 'ANNOUNCEMENTS', service: 'SERVICE' };
  if (label) label.textContent = labels[filter] || 'INBOX';
  if (paneCount) paneCount.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'}`;

  panel.querySelectorAll('[data-mail-filter]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mailFilter === filter);
  });

  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'dni-mail-empty';
    empty.textContent = filter === 'unread' ? 'No unread DNI Mail.' : 'No messages in this mailbox.';
    list.append(empty);
    renderReaderEmpty(filter === 'unread' ? 'No unread messages.' : 'Select another mailbox.');
    updateMailStatus();
    return;
  }

  for (const message of messages) {
    const isRead = read.has(message.id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dni-mail-message';
    if (!isRead) item.classList.add('is-unread');
    if (selectedMessageId === message.id) item.classList.add('is-active');

    if (!isRead) {
      const dot = document.createElement('span');
      dot.className = 'dni-mail-unread-dot';
      dot.setAttribute('aria-label', 'Unread');
      item.append(dot);
    }

    const top = document.createElement('div');
    top.className = 'dni-mail-message-top';
    const sender = document.createElement('span');
    sender.className = 'dni-mail-message-sender';
    sender.textContent = message.from;
    const date = document.createElement('span');
    date.className = 'dni-mail-message-date';
    date.textContent = message.date;
    top.append(sender, date);

    const subject = document.createElement('div');
    subject.className = 'dni-mail-message-subject';
    subject.textContent = message.subject;

    const preview = document.createElement('div');
    preview.className = 'dni-mail-message-preview';
    preview.textContent = previewText(message);

    const meta = document.createElement('div');
    meta.className = 'dni-mail-message-meta';
    const type = document.createElement('span');
    type.className = 'dni-mail-type';
    type.textContent = message.type;
    const id = document.createElement('span');
    id.className = 'dni-mail-id';
    id.textContent = `MSG-${message.id}`;
    meta.append(type, id);

    item.append(top, subject, preview, meta);
    item.addEventListener('click', () => openMessage(message, filter));
    list.append(item);
  }

  updateMailStatus();

  if (autoOpen && filter !== 'unread') {
    const preferred = messages.find(message => message.id === selectedMessageId) || messages[0];
    if (preferred) openMessage(preferred, filter, true);
  }
}

function renderReaderEmpty(text = 'Select a message from the inbox.') {
  const reader = document.querySelector('#dni-mail-reader');
  if (!reader) return;
  reader.className = 'dni-mail-reader-empty';
  reader.innerHTML = '';
  const wrapper = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'module-kicker';
  kicker.textContent = 'SECURE MESSAGE READER';
  const copy = document.createElement('p');
  copy.textContent = text;
  wrapper.append(kicker, copy);
  reader.append(wrapper);
}

function openMessage(message, currentFilter = 'all', fromAutoOpen = false) {
  const panel = ensureMailPanel();
  const reader = panel?.querySelector('#dni-mail-reader');
  if (!reader || !message) return;

  selectedMessageId = message.id;
  const read = readMessageIds();
  read.add(message.id);
  saveReadMessageIds(read);

  reader.className = 'dni-mail-reader';
  reader.replaceChildren();

  const header = document.createElement('div');
  header.className = 'dni-mail-reader-header';

  const kicker = document.createElement('div');
  kicker.className = 'dni-mail-reader-kicker';
  kicker.textContent = message.type;

  const subject = document.createElement('h3');
  subject.id = 'dni-mail-reader-title';
  subject.className = 'dni-mail-reader-subject';
  subject.textContent = message.subject;

  const senderRow = document.createElement('div');
  senderRow.className = 'dni-mail-sender-row';
  const avatar = document.createElement('div');
  avatar.className = 'dni-mail-avatar';
  avatar.textContent = senderInitials(message.from);
  const sender = document.createElement('div');
  sender.className = 'dni-mail-sender';
  const senderName = document.createElement('strong');
  senderName.textContent = message.from;
  const recipient = document.createElement('small');
  recipient.textContent = 'to Dreadnought Imperium Network';
  sender.append(senderName, recipient);
  const date = document.createElement('div');
  date.className = 'dni-mail-reader-date';
  date.textContent = message.date;
  senderRow.append(avatar, sender, date);

  const meta = document.createElement('div');
  meta.className = 'dni-mail-reader-meta';
  for (const text of [`MESSAGE ${message.id}`, message.type, 'DNI SECURE MAIL']) {
    const chip = document.createElement('span');
    chip.textContent = text;
    meta.append(chip);
  }

  header.append(kicker, subject, senderRow, meta);

  const body = document.createElement('div');
  body.className = 'dni-mail-reader-body';
  body.textContent = message.body;

  if (message.id === '001') {
    const signature = document.createElement('div');
    signature.className = 'dni-mail-reader-signature';
    signature.textContent = "— Harley's Studios / HarleyTG";
    body.append(document.createElement('br'), signature);
  }

  reader.append(header, body);

  renderMailList(currentFilter, false);
  updateMailStatus();

  if (!fromAutoOpen && window.matchMedia('(max-width: 700px)').matches) {
    reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function normalizeMailFilter(value = '') {
  const filter = String(value).toLowerCase();
  if (filter === 'unread') return 'unread';
  if (filter === 'announcement' || filter === 'announcements') return 'announcements';
  if (filter === 'service' || filter === 'services') return 'service';
  return 'all';
}

function openMail(filter = 'all') {
  const panel = ensureMailPanel();
  if (!shell || !panel) return;
  shell.dataset.panel = 'mail';
  for (const tab of tabs) {
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
  }
  panel.style.display = 'block';
  selectedMessageId = null;
  renderMailList(filter, true);
  window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel: 'mail' } }));
}

function echoCommand(value) {
  if (!output) return;
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

function rewriteLegacyBoot() {
  if (!output) return;
  const text = output.textContent || '';
  if (text.includes('DNI TERMINAL v4.3.0') && text.includes("'access' to quickly access DNI files.") && !text.includes('DNI COMMAND NETWORK // ONLINE')) {
    renderBoot();
  }
}

installMailStyles();

if (output) {
  let rewriting = false;
  const observer = new MutationObserver(() => {
    if (rewriting) return;
    const text = output.textContent || '';
    if (!text.includes("'access' to quickly access DNI files.")) return;
    rewriting = true;
    renderBoot();
    queueMicrotask(() => { rewriting = false; });
  });
  observer.observe(output, { childList: true, subtree: true });
  queueMicrotask(rewriteLegacyBoot);
}

if (shell) {
  const observer = new MutationObserver(() => {
    const panel = ensureMailPanel();
    if (panel) panel.style.display = shell.dataset.panel === 'mail' ? 'block' : 'none';
  });
  observer.observe(shell, { attributes: true, attributeFilter: ['data-panel'] });
}

if (inboxButton) {
  const textNode = [...inboxButton.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.nodeValue = 'MAIL';
  inboxButton.title = 'Open DNI Mail';
  inboxButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    openMail('all');
  }, true);
}

if (input) {
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const raw = input.value.trim();
    if (!raw) return;
    const [command, ...args] = raw.split(/\s+/);
    const normalized = command.toLowerCase();
    if (!['mail', 'inbox', 'help', 'clear'].includes(normalized)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    echoCommand(raw);

    if (normalized === 'clear') {
      renderBoot();
      return;
    }
    if (normalized === 'help') {
      showHelp();
      return;
    }

    const firstArg = String(args[0] || '').toLowerCase();
    if (firstArg === 'read' && args[1]) {
      openMail('all');
      const message = mailMessages.find(entry => entry.id === String(args[1]).padStart(3, '0'));
      if (message) openMessage(message, 'all');
      return;
    }
    openMail(normalizeMailFilter(firstArg));
  }, true);
}

ensureMailPanel();
updateMailStatus();
