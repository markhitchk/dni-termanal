const PRIORITY_URL = '/mail-priority-data.php';
const REFRESH_MS = 2000;
const nativeFetch = globalThis.fetch.bind(globalThis);

const live = {
  priorities: [],
  assignments: new Map(),
  defaultKey: 'routine',
  csrfToken: '',
  revision: '',
  loading: false,
  initialized: false,
  pendingComposeKey: ''
};

const keyOf = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
const messageCode = value => String(value || '').trim().toUpperCase();

function definition(key) {
  const normalized = keyOf(key);
  return live.priorities.find(item => keyOf(item.key) === normalized) || null;
}

function fallbackPriority() {
  return definition(live.defaultKey) || live.priorities.find(item => item.active !== false) || { key: 'routine', label: 'ROUTINE', sortOrder: 10 };
}

function priorityFor(code) {
  return live.assignments.get(messageCode(code)) || fallbackPriority();
}

function applyState(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (Array.isArray(payload.priorities)) {
    live.priorities = payload.priorities
      .filter(item => item && typeof item === 'object' && keyOf(item.key))
      .map(item => ({
        key: keyOf(item.key),
        label: String(item.label || item.key).trim().toUpperCase(),
        description: String(item.description || '').trim(),
        sortOrder: Number(item.sortOrder || 0),
        active: item.active !== false,
        isDefault: item.isDefault === true
      }))
      .sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label));
  }
  live.defaultKey = keyOf(payload.defaultPriorityKey)
    || keyOf(live.priorities.find(item => item.isDefault && item.active)?.key)
    || keyOf(live.priorities.find(item => item.active)?.key)
    || 'routine';
  live.csrfToken = String(payload.csrfToken || live.csrfToken || '');
  live.revision = String(payload.revision || live.revision || '');
  const assignments = new Map();
  for (const [rawCode, raw] of Object.entries(payload.assignments || {})) {
    const code = messageCode(rawCode);
    if (!/^MAIL-\d+$/.test(code) || !raw || typeof raw !== 'object') continue;
    const fallback = definition(raw.key) || fallbackPriority();
    assignments.set(code, {
      key: keyOf(raw.key) || fallback.key,
      label: String(raw.label || fallback.label).trim().toUpperCase(),
      sortOrder: Number(raw.sortOrder ?? fallback.sortOrder ?? 0),
      updatedAt: raw.updatedAt || null
    });
  }
  live.assignments = assignments;
  return true;
}

async function refresh({ render = false } = {}) {
  if (live.loading) return;
  live.loading = true;
  try {
    const response = await nativeFetch(`${PRIORITY_URL}?action=state&_=${Date.now()}`, {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
    });
    if (!response.ok) return;
    const payload = await response.json().catch(() => ({}));
    const previous = live.revision;
    if (applyState(payload) && (render || previous !== live.revision)) renderAll();
  } catch (error) {
    console.warn('DNI Mail live priority state unavailable', error);
  } finally {
    live.loading = false;
  }
}

function installStyles() {
  if (document.querySelector('style[data-dni-mail-priority-live-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailPriorityLiveStyle = 'true';
  style.textContent = `
    .dni-mail-priority-field small{display:block;margin-top:5px;color:#737373;font:700 8px/1.35 "Courier New",monospace;letter-spacing:.25px}
    .dni-mail-priority-field small::before{content:"● ";color:#c8a866}
    .dni-mail-priority-chip{border-color:rgba(200,168,102,.5)!important;color:#d7be84!important}
    .dni-mail-priority-chip[data-priority="immediate"]{border-color:rgba(218,113,75,.78)!important;color:#e99b79!important}
    .dni-mail-priority-chip[data-priority="flash"]{border-color:rgba(222,74,78,.85)!important;color:#ef8588!important}
    .dni-mail-message[data-mail-priority="immediate"],.dni-mail-message[data-mail-priority="flash"]{box-shadow:inset 2px 0 0 rgba(200,168,102,.55)}
  `;
  document.head.append(style);
}

function ensureField() {
  const form = document.querySelector('[data-mail-compose]');
  if (!(form instanceof HTMLFormElement)) return null;
  let field = form.querySelector('[data-mail-priority-field]');
  if (field) return field;
  field = document.createElement('label');
  field.className = 'dni-mail-priority-field';
  field.dataset.mailPriorityField = 'true';
  field.append(document.createTextNode('Priority'));
  const select = document.createElement('select');
  select.name = 'priorityKey';
  select.dataset.mailPriority = 'true';
  select.setAttribute('aria-label', 'DNI Mail priority');
  field.append(select);
  const help = document.createElement('small');
  help.textContent = 'LIVE DNI DATABASE DATA // refreshes while Mail is open';
  field.append(help);
  const classification = form.querySelector('[data-mail-classification]')?.closest('label');
  if (classification?.parentElement === form) classification.after(field);
  else form.prepend(field);
  return field;
}

function populateSelect() {
  const select = ensureField()?.querySelector('[data-mail-priority]');
  if (!(select instanceof HTMLSelectElement)) return;
  const previous = keyOf(select.value);
  const desired = keyOf(live.pendingComposeKey) || previous || live.defaultKey;
  select.replaceChildren();
  for (const item of live.priorities.filter(item => item.active !== false)) {
    const option = document.createElement('option');
    option.value = item.key;
    option.textContent = item.description ? `${item.label} — ${item.description}` : item.label;
    select.append(option);
  }
  const match = [...select.options].find(option => keyOf(option.value) === desired)
    || [...select.options].find(option => keyOf(option.value) === live.defaultKey)
    || select.options[0];
  if (match) select.value = match.value;
  const shell = select.closest('[data-mail-compose-shell]');
  if (shell && !shell.hidden && live.pendingComposeKey) live.pendingComposeKey = '';
}

function chip(priority) {
  const node = document.createElement('span');
  node.className = 'dni-mail-priority-chip';
  node.dataset.mailPriorityChip = 'true';
  node.dataset.priority = keyOf(priority.key) || live.defaultKey;
  node.textContent = `PRI ${String(priority.label || priority.key || live.defaultKey).toUpperCase()}`;
  node.title = 'Live priority from the DNI database';
  return node;
}

function decorateList() {
  document.querySelectorAll('.dni-mail-message').forEach(item => {
    const meta = item.querySelector('.dni-mail-message-meta');
    const id = messageCode(meta?.querySelector('.dni-mail-id')?.textContent);
    if (!meta || !/^MAIL-\d+$/.test(id)) return;
    const value = priorityFor(id);
    item.dataset.mailPriority = keyOf(value.key);
    meta.querySelector('[data-mail-priority-chip]')?.remove();
    const idNode = meta.querySelector('.dni-mail-id');
    const node = chip(value);
    if (idNode) meta.insertBefore(node, idNode);
    else meta.append(node);
  });
}

function decorateReader() {
  const meta = document.querySelector('.dni-mail-reader-meta');
  if (!(meta instanceof HTMLElement)) return;
  const idNode = [...meta.querySelectorAll('span')].find(node => /^MAIL-\d+$/.test(messageCode(node.textContent)));
  if (!idNode) return;
  const id = messageCode(idNode.textContent);
  meta.querySelector('[data-mail-priority-chip]')?.remove();
  const node = chip(priorityFor(id));
  if (idNode.nextSibling) meta.insertBefore(node, idNode.nextSibling);
  else meta.append(node);
}

function renderAll() {
  installStyles();
  populateSelect();
  decorateList();
  decorateReader();
}

function currentReaderCode() {
  const meta = document.querySelector('.dni-mail-reader-meta');
  if (!(meta instanceof HTMLElement)) return '';
  return [...meta.querySelectorAll('span')].map(node => messageCode(node.textContent)).find(value => /^MAIL-\d+$/.test(value)) || '';
}

function selectedPriorityKey() {
  const select = document.querySelector('[data-mail-compose] [data-mail-priority]');
  return keyOf(select instanceof HTMLSelectElement ? select.value : '') || live.defaultKey;
}

async function assign(code, priorityKey) {
  const id = messageCode(code);
  const key = keyOf(priorityKey);
  if (!/^MAIL-\d+$/.test(id) || !key) return false;
  if (!live.csrfToken) await refresh();
  if (!live.csrfToken) return false;
  try {
    const response = await nativeFetch(`${PRIORITY_URL}?action=assign`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-DNI-CSRF': live.csrfToken },
      body: JSON.stringify({ messageCode: id, priorityKey: key })
    });
    const payload = await response.json().catch(() => ({}));
    if (payload.csrfToken) live.csrfToken = String(payload.csrfToken);
    if (!response.ok) return false;
    applyState(payload);
    renderAll();
    return true;
  } catch (error) {
    console.warn(`DNI Mail priority assignment failed for ${id}`, error);
    return false;
  }
}

function isSend(input, init) {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'POST') return false;
  try {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw, location.href);
    return url.pathname === '/mail-data.php' && url.searchParams.get('action') === 'send';
  } catch {
    return false;
  }
}

function installSendHook() {
  if (globalThis.fetch?.dniMailPriorityLive) return;
  const wrapped = async (input, init) => {
    const intercept = isSend(input, init);
    const priorityKey = intercept ? selectedPriorityKey() : '';
    const response = await nativeFetch(input, init);
    if (intercept && response.ok) {
      try {
        const payload = await response.clone().json();
        const code = messageCode(payload?.sent?.message_code);
        if (code && priorityKey) await assign(code, priorityKey);
      } catch (error) {
        console.warn('DNI Mail priority response hook failed', error);
      }
    }
    return response;
  };
  wrapped.dniMailPriorityLive = true;
  globalThis.fetch = wrapped;
}

function installUiHooks() {
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.matches('[data-mail-compose-launch]')) {
      live.pendingComposeKey = live.defaultKey;
      queueMicrotask(renderAll);
    } else if (button.matches('.dni-mail-reply-action')) {
      live.pendingComposeKey = priorityFor(currentReaderCode()).key || live.defaultKey;
      for (const delay of [0, 60, 180, 360]) setTimeout(renderAll, delay);
    }
  }, true);

  let queued = false;
  const observeOptions = { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style'] };
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      observer.disconnect();
      try {
        renderAll();
      } finally {
        observer.observe(document.body, observeOptions);
      }
    });
  });
  observer.observe(document.body, observeOptions);
}

function panelVisible() {
  const panel = document.querySelector('#dni-mail-panel');
  return panel instanceof HTMLElement && panel.style.display !== 'none' && !panel.hidden && document.visibilityState !== 'hidden';
}

function init() {
  if (live.initialized) return;
  live.initialized = true;
  installStyles();
  installSendHook();
  installUiHooks();
  renderAll();
  void refresh({ render: true });
  setInterval(() => { if (panelVisible()) void refresh(); }, REFRESH_MS);
  addEventListener('dni:panel', event => { if (event.detail?.panel === 'mail') void refresh({ render: true }); });
  document.addEventListener('visibilitychange', () => { if (panelVisible()) void refresh({ render: true }); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
