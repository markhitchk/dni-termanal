const separator = '------------------------------------------------------------';
const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const windowEl = document.querySelector('#terminal-window');
const shell = document.querySelector('.terminal-shell');
const tabs = [...document.querySelectorAll('.nav-tab')];
const inboxButton = document.querySelector('#terminal-inbox');

const MAIL_STORAGE_KEY = 'dni.mail.read.v1';
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
  row('SYSTEM STATUS: ONLINE');
  row('NETWORK: DNI SECURE NETWORK');
  row(`Access Time: ${accessTime()}`);
  gap();
  commandLine([{ text: "Enter '" }, { text: 'help', highlight: true }, { text: "' for available commands." }]);
  commandLine([{ text: "Enter '" }, { text: 'access <number>', highlight: true }, { text: "' to access a DNI archive file." }]);
  commandLine([{ text: "Example: '" }, { text: 'access 173', highlight: true }, { text: "' opens DNI-173." }]);
  gap();
  commandLine([{ text: "Enter '" }, { text: 'mail', highlight: true }, { text: "' to open DNI Mail." }]);
  gap();
  row(separator, 'separator');
  gap();
}

function showHelp() {
  row('AVAILABLE COMMANDS');
  row('HELP             Display this command list', 'muted');
  row('ACCESS <number>  Open a local DNI archive record', 'muted');
  row('LIST             List local DNI archive records', 'muted');
  row('MAIL             Open DNI Mail', 'muted');
  row('MAIL UNREAD      Show unread DNI Mail', 'muted');
  row('MAIL ANNOUNCEMENTS  Show official announcements', 'muted');
  row('MAIL SERVICE     Show service announcements', 'muted');
  row('INBOX            Alias for DNI Mail', 'muted');
  row('TERMINAL         Open DNI Terminal', 'muted');
  row('DASHBOARD        Open DNI Dashboard', 'muted');
  row('SERVICES         Open DNI Services', 'muted');
  row('COMMUNICATION    Open DNI Communication', 'muted');
  row('STARCOMMS        Show server bridge status', 'muted');
  row('SECTORS          Open DNI Sectors', 'muted');
  row('CLEAR            Clear and restart the terminal', 'muted');
  row('ABOUT            Display DNI Terminal information', 'muted');
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

function ensureMailPanel() {
  if (!shell) return null;
  let panel = document.querySelector('#dni-mail-panel');
  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'dni-mail-panel';
  panel.className = 'module-panel communication-panel';
  panel.dataset.module = 'mail';
  panel.setAttribute('aria-labelledby', 'dni-mail-title');
  panel.style.display = 'none';
  panel.innerHTML = `
    <header class="module-header">
      <div>
        <div class="module-kicker">DNI INTERNAL MESSAGE NETWORK</div>
        <h2 id="dni-mail-title">DNI Mail</h2>
        <p class="module-subtitle">Official Dreadnought Imperium announcements and DNI service announcements.</p>
      </div>
      <div class="provider-badge" id="dni-mail-status">MAIL ONLINE</div>
    </header>
    <div class="comms-statusbar" aria-label="DNI Mail status">
      <span><b>SYSTEM</b> DNI MAIL</span>
      <span><b>DELIVERY</b> INTERNAL NETWORK</span>
      <span><b>UNREAD</b> <span id="dni-mail-unread">0</span></span>
      <span class="status-online is-online"><i></i> ONLINE</span>
    </div>
    <div class="comms-grid">
      <section class="console-card" aria-labelledby="dni-mail-list-title">
        <div class="card-heading">
          <div><span>MAILBOX</span><h3 id="dni-mail-list-title">Messages</h3></div>
          <span class="card-meta" id="dni-mail-filter-label">ALL</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
          <button class="small-action" type="button" data-mail-filter="all">All</button>
          <button class="small-action" type="button" data-mail-filter="unread">Unread</button>
          <button class="small-action" type="button" data-mail-filter="announcements">Announcements</button>
          <button class="small-action" type="button" data-mail-filter="service">Service</button>
        </div>
        <div class="net-list" id="dni-mail-list"></div>
      </section>
      <section class="console-card" aria-labelledby="dni-mail-reader-title">
        <div class="card-heading">
          <div><span>SECURE MESSAGE READER</span><h3 id="dni-mail-reader-title">Message</h3></div>
          <span class="card-meta" id="dni-mail-reader-state">SELECT MESSAGE</span>
        </div>
        <div id="dni-mail-reader" class="ready-state">Select an announcement or service announcement to read it.</div>
      </section>
    </div>
    <footer class="comms-footnote">DNI Mail is a read-only announcement channel for standard users. Operational communications remain under DNI Communication.</footer>`;

  shell.append(panel);
  panel.querySelectorAll('[data-mail-filter]').forEach(button => {
    button.addEventListener('click', () => renderMailList(button.dataset.mailFilter || 'all'));
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
  const count = unreadCount();
  const unread = document.querySelector('#dni-mail-unread');
  if (unread) unread.textContent = String(count);
  if (inboxButton) inboxButton.setAttribute('aria-label', `DNI Mail, ${count} unread message${count === 1 ? '' : 's'}`);
}

function renderMailList(filter = 'all') {
  const panel = ensureMailPanel();
  const list = panel?.querySelector('#dni-mail-list');
  const label = panel?.querySelector('#dni-mail-filter-label');
  if (!list) return;

  const read = readMessageIds();
  const messages = mailMessages.filter(message => messageMatchesFilter(message, filter, read));
  list.replaceChildren();
  if (label) label.textContent = filter.toUpperCase();

  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'ready-state';
    empty.textContent = filter === 'unread' ? 'No unread DNI Mail.' : 'No messages in this category.';
    list.append(empty);
    updateMailStatus();
    return;
  }

  for (const message of messages) {
    const isRead = read.has(message.id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'net-row';
    item.innerHTML = '<span class="net-signal"></span><span class="net-name"></span><span class="net-members"></span><span class="net-state"></span>';
    if (!isRead) item.querySelector('.net-signal')?.classList.add('is-tx');
    item.querySelector('.net-name').textContent = message.subject;
    item.querySelector('.net-members').textContent = `${message.id} · ${message.type}`;
    item.querySelector('.net-state').textContent = isRead ? 'READ' : 'NEW';
    item.addEventListener('click', () => openMessage(message, filter));
    list.append(item);
  }
  updateMailStatus();
}

function openMessage(message, currentFilter = 'all') {
  const panel = ensureMailPanel();
  const reader = panel?.querySelector('#dni-mail-reader');
  const state = panel?.querySelector('#dni-mail-reader-state');
  if (!reader || !message) return;

  const read = readMessageIds();
  read.add(message.id);
  saveReadMessageIds(read);

  reader.className = '';
  reader.replaceChildren();

  const meta = document.createElement('div');
  meta.className = 'comms-statusbar';
  meta.style.marginTop = '0';
  for (const [label, value] of [['ID', message.id], ['TYPE', message.type], ['FROM', message.from], ['DATE', message.date]]) {
    const span = document.createElement('span');
    const bold = document.createElement('b');
    bold.textContent = label;
    span.append(bold, document.createTextNode(` ${value}`));
    meta.append(span);
  }

  const subject = document.createElement('h3');
  subject.textContent = message.subject;
  subject.style.margin = '14px 0 8px';

  const body = document.createElement('div');
  body.className = 'dni-document-body';
  body.textContent = message.body;
  body.style.padding = '12px';
  body.style.whiteSpace = 'pre-wrap';

  reader.append(meta, subject, body);
  if (state) state.textContent = 'READ';
  renderMailList(currentFilter);
  updateMailStatus();
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
  renderMailList(filter);
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
  if (text.includes('DNI TERMINAL v4.3.0') && text.includes("'access' to quickly access DNI files.") && !text.includes("Enter 'mail' to open DNI Mail.")) {
    renderBoot();
  }
}

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
