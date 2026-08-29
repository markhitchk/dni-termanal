const shell = document.querySelector('.terminal-shell');
const tabs = [...document.querySelectorAll('.nav-tab')];
const inboxButton = document.querySelector('#terminal-inbox');
const MAIL_URL = '/mail-data.php';

const CLEARANCES = Object.freeze([
  { level: 0, code: 'CL/NON', name: 'Unclassified' },
  { level: 1, code: 'CL0/UTO', name: 'Official' },
  { level: 2, code: 'CL1/FOR', name: 'Level 1' },
  { level: 3, code: 'CL2/VER', name: 'Level 2' },
  { level: 4, code: 'CL3/CON', name: 'Level 3' },
  { level: 5, code: 'CL4/MET', name: 'Level 4' },
  { level: 6, code: 'CLA/DIS', name: 'Absolute' }
]);

const state = {
  initialized: false,
  loading: false,
  authenticated: false,
  permissions: [],
  clearance: null,
  csrfToken: '',
  messages: [],
  directory: [],
  activeFilter: 'all',
  selectedMessageId: null,
  selectedMessage: null,
  error: ''
};

function has(permission) {
  return state.permissions.includes('admin') || state.permissions.includes(permission);
}

function canSendAny() {
  return has('mail.send') || has('mail.announce') || has('mail.service_announce');
}

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

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `DNI Mail HTTP ${response.status}`);
    error.status = response.status;
    error.loginUrl = payload.loginUrl || '';
    throw error;
  }
  return payload;
}

async function post(action, body = {}) {
  if (!state.csrfToken) throw new Error('DNI security token unavailable. Reload DNI Mail.');
  const payload = await jsonRequest(`${MAIL_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DNI-CSRF': state.csrfToken
    },
    body: JSON.stringify(body)
  });
  if (payload.csrfToken) state.csrfToken = String(payload.csrfToken);
  return payload;
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

function normalizeMailFilter(value = '') {
  const filter = String(value).toLowerCase();
  if (filter === 'unread') return 'unread';
  if (filter === 'announcement' || filter === 'announcements') return 'announcements';
  if (filter === 'service' || filter === 'services') return 'service';
  return 'all';
}

function messageMatchesFilter(message, filter) {
  if (filter === 'unread') return !message.read;
  if (filter === 'announcements') return message.message_type === 'announcement';
  if (filter === 'service') return message.message_type === 'service_announcement';
  return true;
}

function filterCount(filter) {
  return state.messages.filter(message => messageMatchesFilter(message, filter)).length;
}

function unreadCount() {
  return filterCount('unread');
}

function senderInitials(sender) {
  const clean = String(sender || 'DNI').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(part => part[0]).join('') || 'DN').toUpperCase();
}

function dateText(value) {
  if (!value) return 'DNI NETWORK';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function clearanceText(message) {
  if (message?.clearance?.code) return `${message.clearance.code} — ${message.clearance.name || ''}`.trim();
  const found = CLEARANCES.find(item => item.level === Number(message?.clearance_level));
  return found ? `${found.code} — ${found.name}` : 'CLASSIFICATION UNKNOWN';
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
        <p class="module-subtitle">Clearance-controlled internal messages, official announcements, and service notices.</p>
      </div>
      <div class="provider-badge" data-mail-provider>MAIL SECURE LINK</div>
    </header>

    <div class="dni-mail-statusbar" aria-label="DNI Mail status">
      <span><b>ACCOUNT</b> <span data-mail-account>DNI AUTH REQUIRED</span></span>
      <span><b>CLEARANCE</b> <span data-mail-clearance>CHECKING</span></span>
      <span><b>UNREAD</b> <span id="dni-mail-unread">0</span></span>
      <span class="dni-mail-online" data-mail-online><i></i> CONNECTING</span>
    </div>

    <section class="dni-mail-security-notice">
      <strong>MANDATORY MAIL CLASSIFICATION</strong>
      <span>Mail is returned only when your current clearance and required permissions authorize it. Restricted message metadata is not sent to unauthorized clients.</span>
    </section>

    <section class="dni-mail-compose-shell" data-mail-compose-shell hidden>
      <div class="dni-mail-pane-head">
        <div><span>AUTHORIZED SENDER</span><h3>Compose DNI Mail</h3></div>
        <button type="button" class="dni-mail-compose-close" data-mail-compose-close>CLOSE</button>
      </div>
      <form class="dni-mail-compose" data-mail-compose>
        <label>Message Type<select name="messageType" data-mail-type></select></label>
        <label data-mail-recipient-field>Recipients<select name="recipients" multiple size="5" data-mail-recipients></select></label>
        <label>Classification<select name="clearanceLevel" data-mail-classification></select></label>
        <label class="dni-mail-compose-wide" data-mail-attachment-field>Document Attachments<input name="attachments" autocomplete="off" placeholder="DNI-173, DNI-204"></label>
        <label class="dni-mail-compose-wide">Subject<input name="subject" maxlength="180" required autocomplete="off"></label>
        <label class="dni-mail-compose-wide">Message Body<textarea name="body" maxlength="100000" rows="8" required></textarea></label>
        <div class="dni-mail-compose-wide dni-mail-compose-security" data-mail-compose-security></div>
        <div class="dni-mail-compose-wide dni-mail-compose-actions">
          <button class="dni-primary-action" type="submit">SEND SECURE MAIL</button>
        </div>
      </form>
    </section>

    <div class="dni-mail-client">
      <aside class="dni-mail-folders" aria-label="DNI Mail folders">
        <div class="dni-mail-folder-label">MAILBOXES</div>
        <button class="dni-mail-folder is-active" type="button" data-mail-filter="all"><span class="dni-mail-folder-icon"></span><span>Inbox</span><span class="dni-mail-folder-count" data-mail-count="all">0</span></button>
        <button class="dni-mail-folder" type="button" data-mail-filter="unread"><span class="dni-mail-folder-icon"></span><span>Unread</span><span class="dni-mail-folder-count" data-mail-count="unread">0</span></button>
        <button class="dni-mail-folder" type="button" data-mail-filter="announcements"><span class="dni-mail-folder-icon"></span><span>Announcements</span><span class="dni-mail-folder-count" data-mail-count="announcements">0</span></button>
        <button class="dni-mail-folder" type="button" data-mail-filter="service"><span class="dni-mail-folder-icon"></span><span>Service</span><span class="dni-mail-folder-count" data-mail-count="service">0</span></button>
        <button class="dni-mail-compose-launch" type="button" data-mail-compose-launch hidden>COMPOSE</button>
        <div class="dni-mail-readonly" data-mail-mode>READ-ONLY MAILBOX<br>Operational send privileges are role controlled.</div>
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

    <footer class="dni-mail-footer">DNI Mail authorization is enforced by the server on list, open, read, send, and attachment access. Notification previews never contain classified message content.</footer>`;

  shell.append(panel);
  panel.querySelectorAll('[data-mail-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeFilter = normalizeMailFilter(button.dataset.mailFilter || 'all');
      state.selectedMessageId = null;
      state.selectedMessage = null;
      renderMailList();
      renderReaderEmpty();
    });
  });
  panel.querySelector('[data-mail-compose-launch]')?.addEventListener('click', () => void openCompose());
  panel.querySelector('[data-mail-compose-close]')?.addEventListener('click', closeCompose);
  panel.querySelector('[data-mail-type]')?.addEventListener('change', updateComposeMode);
  panel.querySelector('[data-mail-classification]')?.addEventListener('change', updateComposeSecurity);
  panel.querySelector('[data-mail-compose]')?.addEventListener('submit', event => {
    event.preventDefault();
    void sendCompose();
  });
  return panel;
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

function setMailError(message = '') {
  state.error = String(message || '');
  const online = document.querySelector('[data-mail-online]');
  if (!online) return;
  if (state.error) {
    online.className = 'dni-mail-online is-error';
    online.innerHTML = '<i></i> LINK ERROR';
  } else if (state.authenticated) {
    online.className = 'dni-mail-online';
    online.innerHTML = '<i></i> SECURE LINK';
  } else {
    online.className = 'dni-mail-online is-error';
    online.innerHTML = '<i></i> SIGN IN REQUIRED';
  }
}

function updateMailStatus() {
  const panel = ensureMailPanel();
  const unread = unreadCount();
  const unreadEl = panel?.querySelector('#dni-mail-unread');
  if (unreadEl) unreadEl.textContent = String(unread);

  for (const filter of ['all', 'unread', 'announcements', 'service']) {
    const counter = panel?.querySelector(`[data-mail-count="${filter}"]`);
    if (counter) counter.textContent = String(filterCount(filter));
  }

  const badge = ensureLaunchBadge();
  if (badge) {
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
  }
  if (inboxButton) inboxButton.setAttribute('aria-label', `DNI Mail, ${unread} unread message${unread === 1 ? '' : 's'}`);

  const account = panel?.querySelector('[data-mail-account]');
  if (account) account.textContent = state.authenticated ? 'DREADNOUGHT IMPERIUM' : 'DISCORD SIGN-IN REQUIRED';
  const clearance = panel?.querySelector('[data-mail-clearance]');
  if (clearance) clearance.textContent = state.clearance?.code ? `${state.clearance.code} — ${state.clearance.name}` : 'UNAVAILABLE';
  const provider = panel?.querySelector('[data-mail-provider]');
  if (provider) provider.textContent = state.authenticated ? 'MAIL / CLEARANCE ENFORCED' : 'MAIL AUTH REQUIRED';

  const compose = panel?.querySelector('[data-mail-compose-launch]');
  if (compose) compose.hidden = !canSendAny();
  const mode = panel?.querySelector('[data-mail-mode]');
  if (mode) mode.innerHTML = canSendAny()
    ? 'SECURE SEND ENABLED<br>Server classification rules apply.'
    : 'READ-ONLY MAILBOX<br>Operational send privileges are role controlled.';
  setMailError(state.error);
}

async function loadMailbox({ quiet = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  if (!quiet) setMailError('');
  try {
    const payload = await jsonRequest(`${MAIL_URL}?action=list&filter=all`);
    state.authenticated = true;
    state.permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
    state.clearance = payload.effectiveClearance || null;
    state.csrfToken = String(payload.csrfToken || state.csrfToken || '');
    state.messages = Array.isArray(payload.messages) ? payload.messages : [];
    state.error = '';
  } catch (error) {
    state.authenticated = false;
    state.permissions = [];
    state.clearance = null;
    state.messages = [];
    if (!quiet || error?.status !== 401) state.error = String(error?.message || error || 'DNI Mail unavailable.');
  } finally {
    state.loading = false;
    updateMailStatus();
    if (!quiet) renderMailList();
  }
}

function renderMailList() {
  const panel = ensureMailPanel();
  const list = panel?.querySelector('#dni-mail-list');
  const label = panel?.querySelector('#dni-mail-filter-label');
  const paneCount = panel?.querySelector('#dni-mail-pane-count');
  if (!list) return;

  const messages = state.messages.filter(message => messageMatchesFilter(message, state.activeFilter));
  const labels = { all: 'INBOX', unread: 'UNREAD', announcements: 'ANNOUNCEMENTS', service: 'SERVICE' };
  if (label) label.textContent = labels[state.activeFilter] || 'INBOX';
  if (paneCount) paneCount.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'}`;
  panel.querySelectorAll('[data-mail-filter]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mailFilter === state.activeFilter);
  });

  list.replaceChildren();
  if (!state.authenticated) {
    const card = document.createElement('div');
    card.className = 'dni-mail-empty';
    const link = document.createElement('a');
    link.href = '/auth/discord/login';
    link.className = 'dni-primary-action';
    link.textContent = 'SIGN IN WITH DISCORD';
    const text = document.createElement('p');
    text.textContent = 'DNI Mail is available only to authenticated Dreadnought Imperium personnel.';
    card.append(text, link);
    list.append(card);
    renderReaderEmpty('Discord sign-in is required before mail metadata is returned.');
    updateMailStatus();
    return;
  }
  if (state.error) {
    const empty = document.createElement('div');
    empty.className = 'dni-mail-empty';
    empty.textContent = state.error;
    list.append(empty);
    renderReaderEmpty('DNI Mail secure link unavailable.');
    updateMailStatus();
    return;
  }
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'dni-mail-empty';
    empty.textContent = state.activeFilter === 'unread' ? 'No unread DNI Mail.' : 'No authorized messages in this mailbox.';
    list.append(empty);
    renderReaderEmpty(state.activeFilter === 'unread' ? 'No unread messages.' : 'No authorized message selected.');
    updateMailStatus();
    return;
  }

  for (const message of messages) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dni-mail-message';
    if (!message.read) item.classList.add('is-unread');
    if (state.selectedMessageId === message.id) item.classList.add('is-active');

    if (!message.read) {
      const dot = document.createElement('span');
      dot.className = 'dni-mail-unread-dot';
      dot.setAttribute('aria-label', 'Unread');
      item.append(dot);
    }

    const top = document.createElement('div');
    top.className = 'dni-mail-message-top';
    const sender = document.createElement('span');
    sender.className = 'dni-mail-message-sender';
    sender.textContent = message.from || 'DNI NETWORK';
    const date = document.createElement('span');
    date.className = 'dni-mail-message-date';
    date.textContent = dateText(message.sent_at);
    top.append(sender, date);

    const subject = document.createElement('div');
    subject.className = 'dni-mail-message-subject';
    subject.textContent = message.subject || 'DNI Mail';
    const preview = document.createElement('div');
    preview.className = 'dni-mail-message-preview';
    preview.textContent = message.preview || '';

    const meta = document.createElement('div');
    meta.className = 'dni-mail-message-meta';
    for (const value of [message.type || 'DNI MAIL', clearanceText(message), message.id]) {
      const chip = document.createElement('span');
      chip.className = value === message.id ? 'dni-mail-id' : 'dni-mail-type';
      chip.textContent = value;
      meta.append(chip);
    }

    item.append(top, subject, preview, meta);
    item.addEventListener('click', () => void openMessage(message.id));
    list.append(item);
  }
  updateMailStatus();
}

async function openMessage(messageId) {
  if (!state.authenticated || !messageId) return;
  state.selectedMessageId = String(messageId);
  renderMailList();
  renderReaderEmpty('VERIFYING CURRENT CLEARANCE…');
  try {
    const payload = await post('mark-read', { id: messageId });
    const message = payload.message;
    if (!message) throw new Error('DNI Mail record unavailable.');
    state.selectedMessage = message;
    const summary = state.messages.find(item => item.id === message.id);
    if (summary) summary.read = true;
    renderReader(message);
    renderMailList();
  } catch (error) {
    state.selectedMessageId = null;
    state.selectedMessage = null;
    renderReaderEmpty(String(error?.message || error || 'DNI Mail record unavailable.'));
    await loadMailbox({ quiet: true });
    renderMailList();
  }
}

function renderReader(message) {
  const reader = document.querySelector('#dni-mail-reader');
  if (!reader || !message) return;
  reader.className = 'dni-mail-reader';
  reader.replaceChildren();

  const header = document.createElement('div');
  header.className = 'dni-mail-reader-header';
  const kicker = document.createElement('div');
  kicker.className = 'dni-mail-reader-kicker';
  kicker.textContent = message.type || 'DNI MAIL';
  const subject = document.createElement('h3');
  subject.id = 'dni-mail-reader-title';
  subject.className = 'dni-mail-reader-subject';
  subject.textContent = message.subject || 'DNI Mail';

  const senderRow = document.createElement('div');
  senderRow.className = 'dni-mail-sender-row';
  const avatar = document.createElement('div');
  avatar.className = 'dni-mail-avatar';
  avatar.textContent = senderInitials(message.from);
  const sender = document.createElement('div');
  sender.className = 'dni-mail-sender';
  const senderName = document.createElement('strong');
  senderName.textContent = message.from || 'DNI NETWORK';
  const recipient = document.createElement('small');
  recipient.textContent = message.audience_type === 'all_members' ? 'to authorized Dreadnought Imperium personnel' : 'to authorized recipient';
  sender.append(senderName, recipient);
  const date = document.createElement('div');
  date.className = 'dni-mail-reader-date';
  date.textContent = dateText(message.sent_at);
  senderRow.append(avatar, sender, date);

  const meta = document.createElement('div');
  meta.className = 'dni-mail-reader-meta';
  for (const text of [message.id, message.type || 'DNI MAIL', clearanceText(message), 'SERVER AUTHORIZED']) {
    const chip = document.createElement('span');
    chip.textContent = text;
    meta.append(chip);
  }
  header.append(kicker, subject, senderRow, meta);

  const body = document.createElement('div');
  body.className = 'dni-mail-reader-body';
  body.textContent = message.body || '';

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (attachments.length) {
    const section = document.createElement('section');
    section.className = 'dni-mail-attachments';
    const title = document.createElement('strong');
    title.textContent = 'AUTHORIZED DOCUMENT ATTACHMENTS';
    section.append(title);
    for (const attachment of attachments) {
      const link = document.createElement('a');
      link.href = attachment.download_url || '#';
      link.textContent = `${attachment.file_code || 'DNI'} — ${attachment.title || attachment.name || 'Document'}`;
      const clearance = document.createElement('span');
      clearance.textContent = attachment.clearance?.code || 'CLASSIFIED';
      const row = document.createElement('div');
      row.append(link, clearance);
      section.append(row);
    }
    body.append(document.createElement('br'), section);
  }

  const notice = document.createElement('div');
  notice.className = 'dni-mail-reader-security';
  notice.textContent = 'CLASSIFICATION CHECKED AT OPEN TIME // ACCESS MAY CHANGE IMMEDIATELY IF YOUR CLEARANCE OR REQUIRED PERMISSIONS CHANGE';
  reader.append(header, body, notice);

  if (window.matchMedia('(max-width: 700px)').matches) reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function availableMessageTypes() {
  const out = [];
  if (has('mail.send')) out.push(['message', 'DIRECT DNI MAIL']);
  if (has('mail.announce')) out.push(['announcement', 'NETWORK ANNOUNCEMENT']);
  if (has('mail.service_announce')) out.push(['service_announcement', 'SERVICE ANNOUNCEMENT']);
  return out;
}

async function loadDirectory() {
  if (state.directory.length || !has('mail.send')) return;
  const payload = await jsonRequest(`${MAIL_URL}?action=directory`);
  state.directory = Array.isArray(payload.users) ? payload.users : [];
}

function populateCompose() {
  const panel = ensureMailPanel();
  const type = panel?.querySelector('[data-mail-type]');
  const recipients = panel?.querySelector('[data-mail-recipients]');
  const classification = panel?.querySelector('[data-mail-classification]');
  if (!type || !recipients || !classification) return;

  type.replaceChildren();
  for (const [value, label] of availableMessageTypes()) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    type.append(option);
  }

  recipients.replaceChildren();
  for (const user of state.directory) {
    const option = document.createElement('option');
    option.value = String(user.id);
    option.textContent = user.label || `DNI USER ${user.id}`;
    recipients.append(option);
  }

  classification.replaceChildren();
  const maxLevel = Number(state.clearance?.level ?? 0);
  for (const item of CLEARANCES.filter(entry => entry.level <= maxLevel)) {
    const option = document.createElement('option');
    option.value = String(item.level);
    option.textContent = `${item.code} — ${item.name}`;
    option.selected = item.level === maxLevel;
    classification.append(option);
  }
  updateComposeMode();
  updateComposeSecurity();
}

async function openCompose() {
  if (!canSendAny()) return;
  const shell = ensureMailPanel()?.querySelector('[data-mail-compose-shell]');
  if (!shell) return;
  try {
    await loadDirectory();
    populateCompose();
    shell.hidden = false;
    shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setMailError(String(error?.message || error || 'Unable to load DNI Mail composer.'));
  }
}

function closeCompose() {
  const compose = ensureMailPanel()?.querySelector('[data-mail-compose-shell]');
  if (compose) compose.hidden = true;
}

function updateComposeMode() {
  const panel = ensureMailPanel();
  const type = panel?.querySelector('[data-mail-type]')?.value || 'message';
  const recipientField = panel?.querySelector('[data-mail-recipient-field]');
  const attachmentField = panel?.querySelector('[data-mail-attachment-field]');
  if (recipientField) recipientField.hidden = type !== 'message';
  if (attachmentField) attachmentField.hidden = type !== 'message';
  updateComposeSecurity();
}

function updateComposeSecurity() {
  const panel = ensureMailPanel();
  const target = panel?.querySelector('[data-mail-compose-security]');
  const select = panel?.querySelector('[data-mail-classification]');
  const type = panel?.querySelector('[data-mail-type]')?.value || 'message';
  if (!target || !select) return;
  const selected = CLEARANCES.find(item => item.level === Number(select.value));
  target.textContent = `${selected?.code || 'CLASSIFIED'} // ${type === 'message' ? 'ATTACHMENTS CAN ONLY RAISE THIS LEVEL' : 'AUTHORIZED RECIPIENTS ARE FILTERED AT READ TIME'} // SERVER ENFORCED`;
}

async function sendCompose() {
  const panel = ensureMailPanel();
  const form = panel?.querySelector('[data-mail-compose]');
  if (!form) return;
  const type = String(form.elements.messageType.value || 'message');
  const recipientUserIds = type === 'message'
    ? [...form.elements.recipients.selectedOptions].map(option => Number(option.value)).filter(Number.isInteger)
    : [];
  const attachmentCodes = type === 'message'
    ? String(form.elements.attachments.value || '').split(',').map(value => value.trim()).filter(Boolean)
    : [];
  const payload = {
    messageType: type,
    recipientUserIds,
    clearanceLevel: Number(form.elements.clearanceLevel.value),
    attachmentCodes,
    subject: String(form.elements.subject.value || '').trim(),
    body: String(form.elements.body.value || '').trim()
  };

  setMailError('');
  try {
    const result = await post('send', payload);
    form.reset();
    closeCompose();
    await loadMailbox({ quiet: true });
    renderMailList();
    const sentCode = result.sent?.message_code || 'DNI MAIL';
    const reader = document.querySelector('#dni-mail-reader');
    if (reader) {
      reader.className = 'dni-mail-reader-empty';
      reader.textContent = `${sentCode} SENT // ${result.sent?.clearance?.code || 'CLASSIFICATION APPLIED'} // DELIVERY AUTHORIZATION ENFORCED`;
    }
  } catch (error) {
    setMailError(String(error?.message || error || 'Unable to send DNI Mail.'));
  }
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
  state.activeFilter = normalizeMailFilter(filter);
  state.selectedMessageId = null;
  state.selectedMessage = null;
  renderReaderEmpty();
  renderMailList();
  void loadMailbox().then(() => renderMailList());
  window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel: 'mail' } }));
}

export function handleMailCommand(args = []) {
  const firstArg = String(args[0] || '').toLowerCase();
  if (firstArg === 'read') {
    const id = args[1];
    if (!id) return { ok: false, message: 'USAGE: MAIL READ <id>' };
    openMail('all');
    window.setTimeout(() => void openMessage(id), 0);
    return { ok: true, message: `OPENING DNI MAIL ${String(id).toUpperCase()} // CURRENT CLEARANCE WILL BE RECHECKED` };
  }
  if (firstArg === 'unread') {
    openMail('unread');
    return { ok: true, message: 'OPENING UNREAD DNI MAIL // SERVER AUTHORIZED' };
  }
  if (firstArg === 'announcement' || firstArg === 'announcements') {
    openMail('announcements');
    return { ok: true, message: 'OPENING DNI ANNOUNCEMENTS // SERVER AUTHORIZED' };
  }
  if (firstArg === 'service' || firstArg === 'services') {
    openMail('service');
    return { ok: true, message: 'OPENING DNI SERVICE ANNOUNCEMENTS // SERVER AUTHORIZED' };
  }
  openMail('all');
  return { ok: true, message: 'OPENING DNI MAIL // CLEARANCE ENFORCEMENT ACTIVE' };
}

export function initializeMail() {
  if (state.initialized) return;
  state.initialized = true;
  installMailStyles();
  ensureMailPanel();
  ensureLaunchBadge();
  updateMailStatus();
  void loadMailbox({ quiet: true });

  window.addEventListener('dni:panel', event => {
    const panel = ensureMailPanel();
    if (!panel) return;
    const active = event.detail?.panel === 'mail';
    panel.style.display = active ? 'block' : 'none';
  });
}
