const ORGANIZER_URL = '/mail-organizer.php';
const MAIL_URL = '/mail-data.php';
const NOTIFY_KEY = 'dni.mail.browserNotifications.v1';
const SW_URL = '/dni-mail-sw.js';
const CDN_BLOCK = '--- DNI CDN ATTACHMENTS ---';

const organizer = {
  csrfToken: '',
  loaded: false,
  loading: null,
  folders: { support: [], system: [], specialIds: {}, counts: {} },
  broadcastAllowed: false,
  broadcastTargets: [],
  specialActive: '',
  sendAllMode: false,
  sendAllAudience: '',
  previousClearance: '',
  knownNotificationIds: new Set(),
  coreModulePromise: null
};

function installOrganizerStyles() {
  if (document.querySelector('style[data-dni-mail-organizer-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailOrganizerStyle = 'true';
  style.textContent = `
    .dni-mail-organizer-folder.is-active{border-color:#c8a866!important;background:#17140d!important;color:#f0d89f!important}
    .dni-mail-organizer-unread{display:inline-block;min-width:16px;margin-left:4px;color:#c8a866;font-size:8px;text-align:center}
    .dni-mail-sendall-panel{display:none;gap:7px;border:1px solid #3a3427;background:#070707;padding:9px}
    .dni-mail-v2-recipient-ui.is-sendall .dni-mail-sendall-panel{display:grid}
    .dni-mail-v2-recipient-ui.is-sendall .dni-mail-v2-tools,
    .dni-mail-v2-recipient-ui.is-sendall .dni-mail-v2-directory,
    .dni-mail-v2-recipient-ui.is-sendall .dni-mail-v2-selected,
    .dni-mail-v2-recipient-ui.is-sendall>.dni-mail-v2-help{display:none!important}
    .dni-mail-sendall-target{display:grid;gap:3px;width:100%;appearance:none;border:1px solid #292929;background:#0d0d0d;color:#ddd;text-align:left;padding:10px;font:700 10px/1.35 "Courier New",monospace;cursor:pointer}
    .dni-mail-sendall-target:hover,.dni-mail-sendall-target.is-selected{border-color:#c8a866;background:#17140d;color:#fff}
    .dni-mail-sendall-target strong{color:#d9c38f}.dni-mail-sendall-target small{color:#858585;overflow-wrap:anywhere}
    .dni-mail-sendall-warning{color:#8a8a8a;font:700 8px/1.45 "Courier New",monospace}.dni-mail-sendall-warning b{color:#c8a866}
    .dni-mail-sendall-status{min-height:15px;color:#858585;font:700 9px/1.4 "Courier New",monospace}.dni-mail-sendall-status.is-error{color:#e45d62}.dni-mail-sendall-status.is-success{color:#c8a866}
    .dni-mail-notify-section{margin-top:10px;padding-top:9px;border-top:1px solid #242424}.dni-mail-notify-section .dni-mail-folder-label{margin-bottom:5px}
    .dni-mail-notify-toggle{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;border:1px solid #303030;background:#0b0b0b;color:#aaa;padding:8px 9px;font:700 9px/1.2 "Courier New",monospace;cursor:pointer;text-align:left}
    .dni-mail-notify-toggle:hover{border-color:#c8a866;color:#fff}.dni-mail-notify-toggle strong{color:#c8a866;font-size:8px}.dni-mail-notify-toggle.is-on strong{color:#8fcf9a}.dni-mail-notify-toggle.is-blocked strong{color:#e45d62}
    @media(max-width:700px){.dni-mail-sendall-target{min-height:54px;font-size:11px}.dni-mail-notify-toggle{min-height:44px;font-size:10px}}
  `;
  document.head.append(style);
}

async function organizerRequest(action, { method = 'GET', body = null } = {}) {
  const options = {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  };
  if (method !== 'GET') {
    if (!organizer.csrfToken) await refreshOrganizerState();
    options.headers['Content-Type'] = 'application/json';
    options.headers['X-DNI-CSRF'] = organizer.csrfToken;
    options.body = JSON.stringify(body || {});
  }
  const response = await fetch(`${ORGANIZER_URL}?action=${encodeURIComponent(action)}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI Mail organizer HTTP ${response.status}`);
  if (payload.csrfToken) organizer.csrfToken = String(payload.csrfToken);
  return payload;
}

async function refreshOrganizerState({ render = true } = {}) {
  if (organizer.loading) return organizer.loading;
  organizer.loading = organizerRequest('state').then(payload => {
    organizer.loaded = true;
    organizer.folders = payload.folders || { support: [], system: [], specialIds: {}, counts: {} };
    organizer.broadcastAllowed = payload.broadcastAllowed === true;
    organizer.broadcastTargets = Array.isArray(payload.broadcastTargets) ? payload.broadcastTargets : [];
    ensureOrganizerFolders();
    updateFolderCounts();
    enhanceSendAllUi();
    if (render) {
      if (organizer.specialActive) renderSpecialFolder(organizer.specialActive, { preserveReader: true });
      else applyNormalInboxFilter();
    }
    return payload;
  }).finally(() => {
    organizer.loading = null;
  });
  return organizer.loading;
}

function panel() {
  return document.querySelector('#dni-mail-panel');
}

function folderBar() {
  return panel()?.querySelector('.dni-mail-folders');
}

function makeSpecialFolder(name, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dni-mail-folder dni-mail-organizer-folder';
  button.dataset.mailOrganizerFolder = name;
  button.innerHTML = `<span class="dni-mail-folder-icon"></span><span>${label}</span><span class="dni-mail-folder-count" data-mail-organizer-count="${name}">0</span>`;
  button.addEventListener('click', () => openSpecialFolder(name));
  return button;
}

function ensureOrganizerFolders() {
  const folders = folderBar();
  if (!(folders instanceof HTMLElement)) return;
  let support = folders.querySelector('[data-mail-organizer-folder="support"]');
  let system = folders.querySelector('[data-mail-organizer-folder="system"]');
  if (!support) support = makeSpecialFolder('support', 'Support');
  if (!system) system = makeSpecialFolder('system', 'System Messages');

  const unread = folders.querySelector('[data-mail-filter="unread"]');
  const sent = folders.querySelector('[data-mail-v2-sent]');
  const anchor = sent || unread;
  if (anchor?.nextSibling !== support) folders.insertBefore(support, anchor?.nextSibling || null);
  if (support.nextSibling !== system) folders.insertBefore(system, support.nextSibling);

  ensureNotificationControl(folders);
  setSpecialFolderActive(organizer.specialActive);
}

function updateFolderCounts() {
  const p = panel();
  if (!p) return;
  const counts = organizer.folders?.counts || {};
  const set = (selector, value) => {
    const node = p.querySelector(selector);
    if (node && Number.isFinite(Number(value))) node.textContent = String(Number(value));
  };
  set('[data-mail-count="all"]', counts.normal);
  set('[data-mail-count="unread"]', counts.normalUnread);
  set('[data-mail-count="announcements"]', counts.normalAnnouncements);
  set('[data-mail-count="service"]', counts.normalService);
  set('[data-mail-organizer-count="support"]', counts.support);
  set('[data-mail-organizer-count="system"]', counts.system);
  set('#dni-mail-unread', counts.totalUnread);
}

function messageIdFromItem(item) {
  return String(item?.querySelector('.dni-mail-id')?.textContent || '').trim().toUpperCase();
}

function applyNormalInboxFilter() {
  if (organizer.specialActive) return;
  const p = panel();
  const list = p?.querySelector('#dni-mail-list');
  if (!(list instanceof HTMLElement)) return;
  const special = organizer.folders?.specialIds || {};
  let visible = 0;
  for (const item of list.querySelectorAll('.dni-mail-message')) {
    const id = messageIdFromItem(item);
    const hidden = Boolean(id && special[id]);
    item.hidden = hidden;
    if (!hidden) visible++;
  }
  const paneCount = p.querySelector('#dni-mail-pane-count');
  if (paneCount) paneCount.textContent = `${visible} message${visible === 1 ? '' : 's'}`;
  updateFolderCounts();
}

function setSpecialFolderActive(name = '') {
  organizer.specialActive = name;
  const p = panel();
  if (!p) return;
  p.querySelectorAll('[data-mail-organizer-folder]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mailOrganizerFolder === name);
  });
  if (name) {
    p.querySelectorAll('[data-mail-filter],[data-mail-v2-sent]').forEach(button => button.classList.remove('is-active'));
  }
}

function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return String(value || 'DNI NETWORK');
  return date.toLocaleString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderSpecialFolder(name, { preserveReader = false } = {}) {
  const p = panel();
  const list = p?.querySelector('#dni-mail-list');
  if (!(list instanceof HTMLElement)) return;
  setSpecialFolderActive(name);
  const messages = Array.isArray(organizer.folders?.[name]) ? organizer.folders[name] : [];
  const label = p.querySelector('#dni-mail-filter-label');
  const count = p.querySelector('#dni-mail-pane-count');
  if (label) label.textContent = name === 'support' ? 'SUPPORT INBOX' : 'SYSTEM MESSAGES';
  if (count) count.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'}`;
  list.replaceChildren();

  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'dni-mail-empty';
    empty.textContent = name === 'support' ? 'No routed support mail.' : 'No system messages.';
    list.append(empty);
    if (!preserveReader) setReaderEmpty(name === 'support' ? 'Select a support message.' : 'Select a system message.');
    updateFolderCounts();
    return;
  }

  for (const message of messages) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dni-mail-message';
    if (!message.read) item.classList.add('is-unread');
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
    sender.textContent = message.from || (name === 'system' ? 'DNI AUTOMATED SYSTEM' : 'DNI SUPPORT');
    const date = document.createElement('span');
    date.className = 'dni-mail-message-date';
    date.textContent = formatDate(message.sent_at);
    top.append(sender, date);
    const subject = document.createElement('div');
    subject.className = 'dni-mail-message-subject';
    subject.textContent = message.subject || 'DNI Mail';
    const preview = document.createElement('div');
    preview.className = 'dni-mail-message-preview';
    preview.textContent = message.preview || '';
    const meta = document.createElement('div');
    meta.className = 'dni-mail-message-meta';
    for (const value of [name === 'support' ? 'SUPPORT' : 'SYSTEM MESSAGE', message.clearance?.code || 'CL/NON', message.id]) {
      const chip = document.createElement('span');
      chip.className = value === message.id ? 'dni-mail-id' : 'dni-mail-type';
      chip.textContent = value;
      meta.append(chip);
    }
    item.append(top, subject, preview, meta);
    item.addEventListener('click', () => void openSpecialMessage(name, message.id));
    list.append(item);
  }
  if (!preserveReader) setReaderEmpty(name === 'support' ? 'Select a support message.' : 'Select a system message.');
  updateFolderCounts();
}

function setReaderEmpty(text) {
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

async function coreMailModule() {
  if (organizer.coreModulePromise) return organizer.coreModulePromise;
  const source = new URL(import.meta.url);
  const url = new URL(`./mail.js${source.search}`, source);
  organizer.coreModulePromise = import(url.href);
  return organizer.coreModulePromise;
}

async function openSpecialMessage(folder, id) {
  try {
    const core = await coreMailModule();
    core.handleMailCommand(['read', id]);
    for (const delay of [180, 500, 1000, 1700]) {
      window.setTimeout(() => {
        setSpecialFolderActive(folder);
        renderSpecialFolder(folder, { preserveReader: true });
      }, delay);
    }
    window.setTimeout(() => void refreshOrganizerState(), 1200);
  } catch (error) {
    setReaderEmpty(String(error?.message || error || 'Unable to open DNI Mail record.'));
  }
}

async function openSpecialFolder(name) {
  setSpecialFolderActive(name);
  renderSpecialFolder(name);
  try {
    await refreshOrganizerState({ render: false });
    renderSpecialFolder(name);
  } catch (error) {
    const list = panel()?.querySelector('#dni-mail-list');
    if (list) list.textContent = String(error?.message || error || 'Unable to load organized DNI Mail.');
  }
}

function sendAllTargetPanel(root) {
  let box = root.querySelector('[data-mail-sendall-panel]');
  if (box) return box;
  box = document.createElement('div');
  box.className = 'dni-mail-sendall-panel';
  box.dataset.mailSendallPanel = 'true';
  const tools = root.querySelector('.dni-mail-v2-tools');
  root.insertBefore(box, tools || root.firstChild);
  return box;
}

function renderSendAllTargets(root) {
  const box = sendAllTargetPanel(root);
  box.replaceChildren();
  for (const target of organizer.broadcastTargets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dni-mail-sendall-target';
    button.classList.toggle('is-selected', organizer.sendAllAudience === target.audience);
    button.dataset.mailSendallAudience = target.audience;
    const name = document.createElement('strong');
    name.textContent = `${target.name} // ${Number(target.recipientCount || 0)} RECIPIENTS`;
    const address = document.createElement('small');
    address.textContent = target.address;
    const description = document.createElement('small');
    description.textContent = target.description || '';
    button.append(name, address, description);
    button.addEventListener('click', () => {
      organizer.sendAllAudience = target.audience;
      renderSendAllTargets(root);
      setSendAllStatus(`SELECTED ${target.address} // ${Number(target.recipientCount || 0)} ACTIVE RECIPIENTS`);
    });
    box.append(button);
  }
  const warning = document.createElement('div');
  warning.className = 'dni-mail-sendall-warning';
  warning.innerHTML = '<b>SEND ALL:</b> broadcasts are CL/NON only, do not allow classified DNI Document attachments, and are restricted to authorized broadcast senders.';
  const status = document.createElement('div');
  status.className = 'dni-mail-sendall-status';
  status.dataset.mailSendallStatus = 'true';
  status.setAttribute('aria-live', 'polite');
  box.append(warning, status);
}

function setSendAllStatus(text = '', kind = '') {
  const node = document.querySelector('[data-mail-sendall-status]');
  if (!node) return;
  node.className = 'dni-mail-sendall-status';
  if (kind) node.classList.add(`is-${kind}`);
  node.textContent = String(text || '');
}

function activateSendAll(root) {
  if (!organizer.broadcastAllowed || !organizer.broadcastTargets.length) return;
  organizer.sendAllMode = true;
  root.classList.add('is-sendall');
  root.querySelectorAll('[data-mail-v2-category]').forEach(button => button.classList.remove('is-active'));
  root.querySelector('[data-mail-organizer-sendall-tab]')?.classList.add('is-active');
  const classification = panel()?.querySelector('[data-mail-classification]');
  if (classification instanceof HTMLSelectElement) {
    if (!organizer.previousClearance) organizer.previousClearance = classification.value;
    if ([...classification.options].some(option => option.value === '0')) classification.value = '0';
    classification.disabled = true;
    classification.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const attachment = panel()?.querySelector('[data-mail-attachment-field]');
  if (attachment instanceof HTMLElement) attachment.hidden = true;
  renderSendAllTargets(root);
}

function deactivateSendAll() {
  organizer.sendAllMode = false;
  organizer.sendAllAudience = '';
  const root = document.querySelector('[data-mail-v2-recipient-ui]');
  root?.classList.remove('is-sendall');
  root?.querySelector('[data-mail-organizer-sendall-tab]')?.classList.remove('is-active');
  const classification = panel()?.querySelector('[data-mail-classification]');
  if (classification instanceof HTMLSelectElement) {
    classification.disabled = false;
    if (organizer.previousClearance && [...classification.options].some(option => option.value === organizer.previousClearance)) {
      classification.value = organizer.previousClearance;
    }
    organizer.previousClearance = '';
    classification.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const attachment = panel()?.querySelector('[data-mail-attachment-field]');
  if (attachment instanceof HTMLElement) attachment.hidden = false;
}

function enhanceSendAllUi() {
  if (!organizer.broadcastAllowed || !organizer.broadcastTargets.length) return;
  const root = document.querySelector('[data-mail-v2-recipient-ui]');
  const tabs = root?.querySelector('.dni-mail-v2-tabs');
  if (!(root instanceof HTMLElement) || !(tabs instanceof HTMLElement)) return;
  let button = tabs.querySelector('[data-mail-organizer-sendall-tab]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.mailOrganizerSendallTab = 'true';
    button.innerHTML = `Send All <span>${organizer.broadcastTargets.length}</span>`;
    button.addEventListener('click', () => activateSendAll(root));
    tabs.append(button);
  }
  renderSendAllTargets(root);
}

function bodyWithCdn(form, rawBody) {
  const clean = String(rawBody || '').trim();
  const uploads = [...(form.closest('[data-mail-compose-shell]')?.querySelectorAll('.dni-mail-cdn-upload a') || [])]
    .map(link => ({ name: String(link.textContent || 'DNI CDN file').trim(), url: String(link.href || '').trim() }))
    .filter(item => item.url.startsWith('https://cdn.dreadnoughtimperium.org/files/'));
  if (!uploads.length) return clean;
  return `${clean}\n\n${CDN_BLOCK}\n${uploads.map(item => `${item.name} | ${item.url}`).join('\n')}`;
}

async function sendAllCompose(form) {
  if (!organizer.sendAllAudience) {
    setSendAllStatus('SELECT ALL DNI MEMBERS OR ALL CITIZEN USERS BEFORE SENDING.', 'error');
    return;
  }
  const classifiedAttachments = String(form.elements.namedItem('attachments')?.value || '').trim();
  if (classifiedAttachments) {
    setSendAllStatus('SEND ALL CANNOT INCLUDE CLASSIFIED DNI DOCUMENT ATTACHMENTS.', 'error');
    return;
  }
  const rawBody = String(form.elements.namedItem('body')?.value || '').trim();
  const finalBody = bodyWithCdn(form, rawBody);
  const subject = String(form.elements.namedItem('subject')?.value || '').trim();
  if (!subject || !finalBody) {
    setSendAllStatus('SUBJECT AND MESSAGE BODY ARE REQUIRED.', 'error');
    return;
  }
  const submit = form.querySelector('button[type="submit"]');
  if (submit instanceof HTMLButtonElement) submit.disabled = true;
  setSendAllStatus('SENDING AUTHORIZED BROADCAST…');
  try {
    const result = await organizerRequest('sendall', {
      method: 'POST',
      body: {
        audience: organizer.sendAllAudience,
        messageType: 'message',
        clearanceLevel: 0,
        attachmentCodes: [],
        subject,
        body: finalBody
      }
    });
    const address = result.sent?.broadcast?.address || 'SEND ALL';
    const recipients = Number(result.sent?.broadcast?.recipientCount || 0);
    setSendAllStatus(`${result.sent?.message_code || 'DNI MAIL'} SENT TO ${address} // ${recipients} RECIPIENTS`, 'success');
    let remove = form.closest('[data-mail-compose-shell]')?.querySelector('[data-mail-cdn-remove]');
    while (remove instanceof HTMLButtonElement) {
      remove.click();
      remove = form.closest('[data-mail-compose-shell]')?.querySelector('[data-mail-cdn-remove]');
    }
    form.reset();
    deactivateSendAll();
    form.closest('[data-mail-compose-shell]')?.querySelector('[data-mail-compose-close]')?.click();
    window.dispatchEvent(new CustomEvent('dni:mail-realtime-resync'));
    window.setTimeout(() => {
      const sent = panel()?.querySelector('[data-mail-v2-sent]');
      if (sent instanceof HTMLButtonElement) sent.click();
    }, 250);
  } catch (error) {
    setSendAllStatus(String(error?.message || error || 'Unable to send DNI Mail broadcast.'), 'error');
  } finally {
    if (submit instanceof HTMLButtonElement) submit.disabled = false;
  }
}

function notificationsEnabled() {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  return localStorage.getItem(NOTIFY_KEY) === 'true';
}

async function registerMailServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch (error) {
    console.warn('DNI Mail notification worker registration failed', error);
    return null;
  }
}

function ensureNotificationControl(folders = folderBar()) {
  if (!(folders instanceof HTMLElement)) return;
  let section = folders.querySelector('[data-mail-notify-section]');
  if (!section) {
    section = document.createElement('div');
    section.className = 'dni-mail-notify-section';
    section.dataset.mailNotifySection = 'true';
    section.innerHTML = '<div class="dni-mail-folder-label">BROWSER</div><button type="button" class="dni-mail-notify-toggle" data-mail-notify-toggle><span>Browser Notifications</span><strong data-mail-notify-status>ENABLE</strong></button>';
    const mode = folders.querySelector('[data-mail-mode]');
    folders.insertBefore(section, mode || null);
    section.querySelector('[data-mail-notify-toggle]')?.addEventListener('click', () => void toggleBrowserNotifications());
  }
  updateNotificationControl();
}

function updateNotificationControl() {
  const button = document.querySelector('[data-mail-notify-toggle]');
  const status = document.querySelector('[data-mail-notify-status]');
  if (!(button instanceof HTMLButtonElement) || !status) return;
  button.classList.remove('is-on', 'is-blocked');
  if (!('Notification' in window)) {
    status.textContent = 'UNSUPPORTED';
    button.disabled = true;
    return;
  }
  if (Notification.permission === 'denied') {
    status.textContent = 'BLOCKED';
    button.classList.add('is-blocked');
    return;
  }
  if (notificationsEnabled()) {
    status.textContent = 'ON';
    button.classList.add('is-on');
    return;
  }
  status.textContent = Notification.permission === 'granted' ? 'OFF' : 'ENABLE';
}

async function toggleBrowserNotifications() {
  if (!('Notification' in window)) return;
  if (notificationsEnabled()) {
    localStorage.setItem(NOTIFY_KEY, 'false');
    updateNotificationControl();
    return;
  }
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission === 'granted') {
    localStorage.setItem(NOTIFY_KEY, 'true');
    await registerMailServiceWorker();
  }
  updateNotificationControl();
}

async function showSafeMailNotification(id, folder = '') {
  if (!notificationsEnabled() || !id) return;
  const title = folder === 'support' ? 'DNI Support Mail' : folder === 'system' ? 'DNI System Message' : 'DNI Mail';
  const options = {
    body: 'New DNI Mail available.',
    tag: `dni-mail-${id}`,
    renotify: false,
    data: { url: '/mail' }
  };
  const registration = await registerMailServiceWorker();
  if (registration?.showNotification) {
    await registration.showNotification(title, options);
    return;
  }
  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      window.location.assign('/mail');
      notification.close();
    };
  } catch {
    // Notification API is additive; DNI Mail continues without it.
  }
}

async function primeNotificationIds() {
  try {
    const response = await fetch(`${MAIL_URL}?action=list&filter=all`, {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    for (const message of (Array.isArray(payload.messages) ? payload.messages : [])) {
      const id = String(message?.id || message?.message_code || '').trim().toUpperCase();
      if (id) organizer.knownNotificationIds.add(id);
    }
  } catch {
    // Realtime notifications can still work for future message IDs.
  }
}

function handleRealtimeNotifications(detail = {}) {
  const changes = Array.isArray(detail?.changes) ? detail.changes : [];
  for (const change of changes) {
    if (String(change?.event || '').toLowerCase() === 'delete') continue;
    for (const item of (Array.isArray(change?.items) ? change.items : [])) {
      const summary = item?.summary || item;
      const id = String(summary?.id || summary?.message_code || '').trim().toUpperCase();
      if (!id || organizer.knownNotificationIds.has(id)) continue;
      organizer.knownNotificationIds.add(id);
      const folder = organizer.folders?.specialIds?.[id] || '';
      void showSafeMailNotification(id, folder);
    }
  }
}

function scheduleOrganizerRefresh() {
  for (const delay of [60, 220, 700]) {
    window.setTimeout(() => {
      void refreshOrganizerState().catch(() => {});
      enhanceSendAllUi();
      updateNotificationControl();
    }, delay);
  }
}

function bindOrganizerEvents() {
  // Registered before mail-compose-v2.js. Only Send All is intercepted; every
  // ordinary To/CC/BCC direct send continues through the existing V2 handler.
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('#dni-mail-panel [data-mail-compose]')) return;
    const type = String(form.elements.namedItem('messageType')?.value || 'message');
    if (type !== 'message' || !organizer.sendAllMode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void sendAllCompose(form);
  }, true);

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#dni-mail-panel [data-mail-filter]')) {
      setSpecialFolderActive('');
      window.setTimeout(applyNormalInboxFilter, 60);
      window.setTimeout(applyNormalInboxFilter, 280);
      return;
    }
    if (target.closest('#dni-mail-panel [data-mail-v2-sent]')) {
      setSpecialFolderActive('');
      return;
    }
    if (target.closest('[data-mail-v2-category]') && !target.closest('[data-mail-organizer-sendall-tab]')) {
      deactivateSendAll();
      return;
    }
    if (target.closest('#dni-mail-panel [data-mail-compose-launch]')) {
      for (const delay of [100, 320, 800]) window.setTimeout(enhanceSendAllUi, delay);
      return;
    }
    if (target.closest('#dni-mail-panel [data-mail-compose-close]')) {
      deactivateSendAll();
      return;
    }
    if (!organizer.specialActive && target.closest('#dni-mail-panel #dni-mail-list .dni-mail-message')) {
      for (const delay of [120, 450, 1000]) window.setTimeout(applyNormalInboxFilter, delay);
    }
  }, true);

  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel !== 'mail') return;
    ensureOrganizerFolders();
    scheduleOrganizerRefresh();
  });

  window.addEventListener('dni:mail-realtime-delta', event => {
    handleRealtimeNotifications(event.detail);
    window.setTimeout(() => void refreshOrganizerState(), 80);
  });
  window.addEventListener('dni:mail-realtime-resync', () => {
    window.setTimeout(() => void refreshOrganizerState(), 120);
  });
}

installOrganizerStyles();
bindOrganizerEvents();
if ('Notification' in window && Notification.permission === 'granted' && localStorage.getItem(NOTIFY_KEY) === null) {
  localStorage.setItem(NOTIFY_KEY, 'true');
}
void primeNotificationIds();
void refreshOrganizerState().catch(() => {});
for (const delay of [180, 600, 1400]) {
  window.setTimeout(() => {
    ensureOrganizerFolders();
    enhanceSendAllUi();
    applyNormalInboxFilter();
  }, delay);
}
