const CONTROL_URL = '/mail-controls.php';
const DIRECTORY_URL = '/mail-data.php?action=directory';
const SESSION_URL = '/mail-data.php?action=session';
const FALLBACK_SUPPORT_ROUTES = Object.freeze([
  { id: -9101, key: 'developer', name: 'Developer Support', address: 'dev@support.dni.org', label: 'Developer Support <dev@support.dni.org> · ROUTED CHANNEL' },
  { id: -9102, key: 'support', name: 'General Support', address: 'general@support.dni.org', label: 'General Support <general@support.dni.org> · ROUTED CHANNEL' },
  { id: -9103, key: 'admin', name: 'Administration', address: 'admin@support.dni.org', label: 'Administration <admin@support.dni.org> · ROUTED CHANNEL' }
]);
const ROUTES = new Set(FALLBACK_SUPPORT_ROUTES.map(route => route.id));
const PROTECTED = new Set([
  'system@dni.org',
  'noreply@dni.org',
  ...FALLBACK_SUPPORT_ROUTES.map(route => route.address)
]);
const NO_REPLY = new Set(['system@dni.org', 'noreply@dni.org']);
const nativeFetch = window.fetch.bind(window);

let prefs = [];
let supportRoutes = [...FALLBACK_SUPPORT_ROUTES];
let directoryEntries = [];
let csrf = '';
let messages = [];
let loading = null;
let sessionLoading = null;
let directoryLoading = null;
let directoryAttempted = false;
let queued = false;
let scanFrame = 0;
let supportRoutesLoaded = false;
let lastDirectoryError = '';

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function mergeSupportRoutes(routes) {
  const incoming = Array.isArray(routes) ? routes : [];
  const merged = new Map(FALLBACK_SUPPORT_ROUTES.map(route => [Number(route.id), { ...route }]));

  for (const route of incoming) {
    if (!route || !Number.isInteger(Number(route.id))) continue;
    const id = Number(route.id);
    const previous = merged.get(id) || {};
    merged.set(id, { ...previous, ...route, id });
  }

  supportRoutes = [...merged.values()];
  for (const route of supportRoutes) {
    ROUTES.add(Number(route.id));
    const address = normalizeAddress(route.address);
    if (address) PROTECTED.add(address);
  }
}

function rememberControlPayload(payload = {}) {
  if (Array.isArray(payload.preferences)) prefs = payload.preferences;
  if (Array.isArray(payload.routes)) {
    mergeSupportRoutes(payload.routes);
    supportRoutesLoaded = true;
  }
  if (Array.isArray(payload.protectedAddresses)) {
    for (const address of payload.protectedAddresses) {
      const normalized = normalizeAddress(address);
      if (normalized) PROTECTED.add(normalized);
    }
  }
  csrf = String(payload.csrfToken || csrf);
}

async function loadSession(force = false) {
  if (sessionLoading && !force) return sessionLoading;
  sessionLoading = (async () => {
    const response = await nativeFetch(SESSION_URL, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `DNI Mail session HTTP ${response.status}`);
      error.status = response.status;
      error.loginUrl = payload.loginUrl || '';
      throw error;
    }
    csrf = String(payload.csrfToken || csrf);
    return payload;
  })().finally(() => {
    sessionLoading = null;
  });
  return sessionLoading;
}

async function loadPrefs(force = false) {
  if (loading && !force) return loading;
  loading = (async () => {
    const response = await nativeFetch(`${CONTROL_URL}?action=preferences`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `DNI Mail controls HTTP ${response.status}`);
    rememberControlPayload(payload);
    return payload;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

async function loadDirectory(force = false) {
  if (directoryLoading && !force) return directoryLoading;
  if (directoryAttempted && !force && directoryEntries.length) return directoryEntries;

  directoryAttempted = true;
  directoryLoading = (async () => {
    const response = await nativeFetch(DIRECTORY_URL, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      lastDirectoryError = payload.error || `DNI Mail directory HTTP ${response.status}`;
      const error = new Error(lastDirectoryError);
      error.status = response.status;
      error.loginUrl = payload.loginUrl || '';
      throw error;
    }
    directoryEntries = Array.isArray(payload.users) ? payload.users : [];
    lastDirectoryError = '';
    return directoryEntries;
  })().finally(() => {
    directoryLoading = null;
  });
  return directoryLoading;
}

async function postControl(action, body) {
  if (!csrf) await loadPrefs(true);
  const response = await nativeFetch(`${CONTROL_URL}?action=${action}`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-DNI-CSRF': csrf
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI Mail controls HTTP ${response.status}`);
  rememberControlPayload(payload);
  return payload;
}

function hasPref(address, type) {
  return prefs.some(pref => pref.targetType === 'sender' && pref.targetKey === address && pref.preference === type);
}

function actionOf(url, init) {
  return String(url.searchParams.get('action') || ((init.method || 'GET').toUpperCase() === 'GET' ? 'list' : '')).toLowerCase();
}

window.fetch = async (input, init = {}) => {
  const raw = input instanceof Request ? input.url : String(input);
  let url;
  try {
    url = new URL(raw, location.href);
  } catch {
    return nativeFetch(input, init);
  }

  const action = actionOf(url, init);
  const same = url.origin === location.origin && url.pathname === '/mail-data.php';

  if (same && action === 'send' && String(init.method || 'GET').toUpperCase() === 'POST' && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      if (Array.isArray(body.recipientUserIds) && body.recipientUserIds.some(id => ROUTES.has(Number(id)))) {
        const routed = new URL(CONTROL_URL, location.href);
        routed.searchParams.set('action', 'send-route');
        return nativeFetch(routed.href, init);
      }
    } catch {}
  }

  const response = await nativeFetch(input, init);
  if (same && response.ok) {
    response.clone().json().then(payload => {
      if (action === 'list') {
        if (Array.isArray(payload.messages)) messages = payload.messages;
        if (Array.isArray(payload.mailPreferences)) prefs = payload.mailPreferences;
      }
      if (action === 'directory' && Array.isArray(payload.users)) {
        directoryEntries = payload.users;
        directoryAttempted = true;
        lastDirectoryError = '';
      }
      if (action === 'session') {
        csrf = String(payload.csrfToken || csrf);
      }
      queue();
    }).catch(() => {});
  }
  return response;
};

function installStyle() {
  if (document.querySelector('[data-mail-controls-style]')) return;
  const style = document.createElement('style');
  style.dataset.mailControlsStyle = 'true';
  style.textContent = `
    .dni-mail-message.is-mail-muted{opacity:.7}
    .dni-mail-message.is-mail-muted .dni-mail-message-sender:after{content:" · MUTED";color:#777;font-size:8px}
    .dni-mail-control{border-color:rgba(126,145,160,.58)!important;color:#c4ced4!important}
    .dni-mail-block{border-color:rgba(212,78,83,.58)!important;color:#e98589!important}
    .dni-mail-controls-settings{margin-top:18px;padding:14px;border:1px solid #343434;background:#090909;font-family:"Courier New",monospace}
    .dni-mail-controls-settings h3{margin:0;color:#c8a866;font-size:12px}
    .dni-mail-controls-settings p{color:#888;font-size:9px}
    .dni-mail-pref-row{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:7px;padding:8px;border:1px solid #2d2d2d;font-size:9px;overflow-wrap:anywhere}
    .dni-mail-pref-row button{border:1px solid #555;background:#111;color:#ddd;padding:6px 9px;font:700 8px "Courier New",monospace}
    @media(max-width:700px){.dni-mail-pref-row{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function setStatus(reader, text, error = false) {
  const node = reader.querySelector('.dni-mail-reader-action-status');
  if (!node) return;
  node.className = 'dni-mail-reader-action-status' + (error ? ' is-error' : ' is-success');
  node.textContent = text;
}

function refresh() {
  setTimeout(() => document.querySelector('#terminal-inbox')?.click(), 150);
}

async function toggle(address, type, enabled) {
  await postControl('preference', { targetType: 'sender', targetKey: address, preference: type, enabled });
  await loadPrefs(true);
  refresh();
}

function optionAddress(option) {
  const dataAddress = normalizeAddress(option.dataset.dniMailAddress);
  if (dataAddress) return dataAddress;
  const text = String(option.textContent || '');
  const match = text.match(/<([^<>\s]+@[^<>\s]+)>/);
  return normalizeAddress(match?.[1] || '');
}

function hideSystemRecipients(recipients) {
  for (const option of [...recipients.options]) {
    const address = optionAddress(option);
    if (NO_REPLY.has(address)) option.remove();
  }
}

function mergeRecipientOptions() {
  const recipients = document.querySelector('#dni-mail-panel [data-mail-recipients]');
  if (!(recipients instanceof HTMLSelectElement)) return;

  const entries = [...directoryEntries, ...supportRoutes];
  const seen = new Set();

  for (const entry of entries) {
    if (!entry || !Number.isInteger(Number(entry.id))) continue;
    const id = Number(entry.id);
    const value = String(id);
    const address = normalizeAddress(entry.address);
    if (NO_REPLY.has(address)) continue;

    const key = `${value}|${address}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const name = String(entry.name || entry.username || entry.key || `DNI USER ${value}`).trim();
    const label = String(entry.label || (address ? `${name} <${address}>` : name)).trim();
    let option = [...recipients.options].find(candidate => candidate.value === value);

    if (!(option instanceof HTMLOptionElement) && address) {
      option = [...recipients.options].find(candidate => optionAddress(candidate) === address);
    }

    if (!(option instanceof HTMLOptionElement)) {
      option = document.createElement('option');
      option.value = value;
      recipients.append(option);
    }

    if (option.textContent !== label) option.textContent = label;
    if (address && option.dataset.dniMailAddress !== address) option.dataset.dniMailAddress = address;

    if (id < 0 || ROUTES.has(id)) {
      if (option.dataset.dniSupportRoute !== 'true') option.dataset.dniSupportRoute = 'true';
    }
  }

  hideSystemRecipients(recipients);
}

async function ensureRecipientDirectory() {
  const recipients = document.querySelector('#dni-mail-panel [data-mail-recipients]');
  if (!(recipients instanceof HTMLSelectElement)) return;

  // Always expose the known support routes immediately. They are synthetic
  // routing identities and do not require the personnel directory to succeed.
  mergeRecipientOptions();

  // A guest cannot load the private personnel directory. Verify the session
  // first so a 401 does not leave the UI permanently stuck in an attempted
  // directory state; a successful login/reload can then retry cleanly.
  try {
    await loadSession();
  } catch (error) {
    if (Number(error?.status) === 401) directoryAttempted = false;
    mergeRecipientOptions();
    return;
  }

  if (!supportRoutesLoaded) {
    try {
      await loadPrefs();
    } catch {
      // Preserve canonical fallback routes if the preference/control service
      // is unavailable. Support addressing must still remain usable.
      mergeSupportRoutes([]);
    }
  }

  if (!directoryEntries.length && !directoryLoading) {
    try {
      await loadDirectory();
    } catch (error) {
      // Do not poison future retries after transient auth/network failures.
      directoryAttempted = false;
      lastDirectoryError = String(error?.message || error || '');
    }
  }

  mergeRecipientOptions();
}

async function readerControls() {
  const reader = document.querySelector('#dni-mail-reader.dni-mail-reader');
  const actions = reader?.querySelector('[data-mail-message-actions]');
  if (!(reader instanceof HTMLElement) || !(actions instanceof HTMLElement)) return;

  const address = normalizeAddress(reader.querySelector('.dni-mail-sender-address')?.textContent);
  if (!address) return;

  const reply = actions.querySelector('.dni-mail-reply-action');
  if (reply instanceof HTMLButtonElement && NO_REPLY.has(address)) {
    reply.disabled = true;
    reply.title = 'This automated DNI Mail identity does not accept replies.';
  }

  try {
    await loadPrefs();
  } catch {
    return;
  }

  const prefState = `${address}|${hasPref(address, 'muted')}|${PROTECTED.has(address)}`;
  let wrap = actions.querySelector('[data-mail-control-wrap]');
  if (!(wrap instanceof HTMLElement)) {
    wrap = document.createElement('span');
    wrap.dataset.mailControlWrap = '1';
    wrap.style.display = 'contents';
    const status = actions.querySelector('.dni-mail-reader-action-status');
    status ? actions.insertBefore(wrap, status) : actions.append(wrap);
  }
  if (wrap.dataset.state === prefState) return;
  wrap.dataset.state = prefState;
  wrap.replaceChildren();

  const muted = hasPref(address, 'muted');
  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'dni-mail-control';
  mute.textContent = muted ? 'UNMUTE SENDER' : 'MUTE SENDER';
  mute.onclick = async () => {
    mute.disabled = true;
    try {
      await toggle(address, 'muted', !muted);
      setStatus(reader, muted ? 'SENDER UNMUTED' : 'SENDER MUTED // MAIL STILL DELIVERS');
    } catch (error) {
      mute.disabled = false;
      setStatus(reader, String(error.message || error), true);
    }
  };
  wrap.append(mute);

  const block = document.createElement('button');
  block.type = 'button';
  block.className = 'dni-mail-block';
  block.textContent = PROTECTED.has(address) ? 'PROTECTED SENDER' : 'BLOCK SENDER';
  block.disabled = PROTECTED.has(address);
  block.title = block.disabled
    ? 'DNI system/support identities cannot be blocked.'
    : 'Hide this sender without notifying them.';
  block.onclick = async () => {
    if (block.dataset.confirm !== '1') {
      block.dataset.confirm = '1';
      block.textContent = 'CONFIRM BLOCK';
      setStatus(reader, 'BLOCKING HIDES THIS SENDER FROM YOUR INBOX. THE SENDER IS NOT NOTIFIED.', true);
      setTimeout(() => {
        if (block.isConnected && block.dataset.confirm === '1') {
          block.dataset.confirm = '';
          block.textContent = 'BLOCK SENDER';
        }
      }, 5000);
      return;
    }
    block.disabled = true;
    try {
      await toggle(address, 'blocked', true);
      setStatus(reader, `${address} BLOCKED // RECORD RETAINED FOR RECOVERY`);
    } catch (error) {
      block.disabled = false;
      setStatus(reader, String(error.message || error), true);
    }
  };
  wrap.append(block);
}

function mutedUi() {
  const muted = new Set(messages.filter(message => message.mail_muted === true).map(message => String(message.id)));
  document.querySelectorAll('.dni-mail-message').forEach(row => {
    const id = String(row.querySelector('.dni-mail-id')?.textContent || '');
    const yes = muted.has(id);
    row.classList.toggle('is-mail-muted', yes);
    if (yes) row.querySelector('.dni-mail-unread-dot')?.remove();
  });

  const count = messages.filter(message => !message.read && message.mail_muted !== true).length;
  for (const node of [
    document.querySelector('#dni-mail-unread'),
    document.querySelector('[data-mail-count="unread"]'),
    document.querySelector('.dni-mail-launch-count')
  ]) {
    if (node && node.textContent !== String(count)) node.textContent = String(count);
  }
  const badge = document.querySelector('.dni-mail-launch-count');
  if (badge) badge.hidden = count === 0;
}

async function settings() {
  const body = document.querySelector('#dni-user-settings .dni-user-settings-body');
  if (!(body instanceof HTMLElement)) return;
  try {
    await loadPrefs();
  } catch {
    return;
  }

  let section = body.querySelector('[data-mail-controls-settings]');
  if (!(section instanceof HTMLElement)) {
    section = document.createElement('section');
    section.className = 'dni-mail-controls-settings';
    section.dataset.mailControlsSettings = '1';
    section.innerHTML = '<h3>Mail Blocks & Mutes</h3><p>Blocked messages stay retained in DNI Mail. Muted senders still deliver mail without unread alerts.</p><div data-mail-pref-list></div>';
    body.append(section);
  }

  const signature = JSON.stringify(prefs);
  if (section.dataset.state === signature) return;
  section.dataset.state = signature;
  const list = section.querySelector('[data-mail-pref-list]');
  list.replaceChildren();
  if (!prefs.length) {
    list.textContent = 'No blocked or muted senders.';
    return;
  }

  for (const pref of prefs) {
    const row = document.createElement('div');
    row.className = 'dni-mail-pref-row';
    const text = document.createElement('span');
    text.textContent = `${String(pref.preference).toUpperCase()} // ${pref.targetKey}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = pref.preference === 'blocked' ? 'UNBLOCK' : 'UNMUTE';
    button.onclick = async () => {
      button.disabled = true;
      try {
        await toggle(pref.targetKey, pref.preference, false);
        await settings();
      } catch {
        button.disabled = false;
        button.textContent = 'ERROR';
      }
    };
    row.append(text, button);
    list.append(row);
  }
}

function scan() {
  queued = false;
  scanFrame = 0;
  mutedUi();
  void ensureRecipientDirectory();
  void readerControls();
  void settings();
}

function queue() {
  if (queued) return;
  queued = true;
  scanFrame = requestAnimationFrame(scan);
}

installStyle();
new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
window.addEventListener('pageshow', queue);
window.addEventListener('focus', queue);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    directoryAttempted = false;
    queue();
  }
});
queue();
