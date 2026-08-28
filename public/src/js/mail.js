const shell = document.querySelector('.terminal-shell');
const tabs = [...document.querySelectorAll('.nav-tab')];
const inboxButton = document.querySelector('#terminal-inbox');

const MAIL_STORAGE_KEY = 'dni.mail.read.v2';
let activeFilter = 'all';
let selectedMessageId = null;
let initialized = false;

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
    // DNI Mail remains usable when local storage is unavailable.
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

function messageMatchesFilter(message, filter, read) {
  if (filter === 'unread') return !read.has(message.id);
  if (filter === 'announcements') return message.type === 'ANNOUNCEMENT';
  if (filter === 'service') return message.type === 'SERVICE ANNOUNCEMENT';
  return true;
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
  if (inboxButton) {
    inboxButton.setAttribute('aria-label', `DNI Mail, ${count} unread message${count === 1 ? '' : 's'}`);
  }
}

function renderReaderEmpty(text = 'Select a message from the inbox.') {
  const reader = document.querySelector('#dni-mail-reader');
  if (!reader) return;
  reader.className = 'dni-mail-reader-empty';
  reader.replaceChildren();

  const wrapper = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'module-kicker';
  kicker.textContent = 'SECURE MESSAGE READER';
  const copy = document.createElement('p');
  copy.textContent = text;
  wrapper.append(kicker, copy);
  reader.append(wrapper);
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

  const labels = {
    all: 'INBOX',
    unread: 'UNREAD',
    announcements: 'ANNOUNCEMENTS',
    service: 'SERVICE'
  };
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

export function openMail(filter = 'all') {
  const panel = ensureMailPanel();
  if (!shell || !panel) return;
  shell.dataset.panel = 'mail';
  for (const tab of tabs) {
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
  }
  panel.style.display = 'block';
  selectedMessageId = null;
  renderMailList(normalizeMailFilter(filter), true);
  window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel: 'mail' } }));
}

export function handleMailCommand(args = []) {
  const firstArg = String(args[0] || '').toLowerCase();

  if (firstArg === 'read') {
    if (!args[1]) {
      return { ok: false, message: 'DNI MAIL: MESSAGE ID REQUIRED. EXAMPLE: MAIL READ 001' };
    }
    const id = String(args[1]).replace(/^msg-?/i, '').padStart(3, '0');
    const message = mailMessages.find(entry => entry.id === id);
    openMail('all');
    if (!message) {
      return { ok: false, message: `DNI MAIL: MESSAGE ${id} NOT FOUND.` };
    }
    openMessage(message, 'all');
    return { ok: true };
  }

  openMail(normalizeMailFilter(firstArg));
  return { ok: true };
}

export function initializeMail() {
  if (initialized) return;
  initialized = true;

  installMailStyles();
  const panel = ensureMailPanel();
  updateMailStatus();

  if (inboxButton) {
    const textNode = [...inboxButton.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.nodeValue = 'MAIL';
    inboxButton.title = 'Open DNI Mail';
  }

  window.addEventListener('dni:panel', event => {
    if (!panel) return;
    panel.style.display = event.detail?.panel === 'mail' ? 'block' : 'none';
  });
}
