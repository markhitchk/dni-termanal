const CONTROL_URL = '/mail-controls.php';
const DIRECTORY_URL = '/mail-data.php?action=directory';
const SESSION_URL = '/mail-data.php?action=session';

let csrfToken = '';
let preferences = [];
let protectedAddresses = new Set(['system@dni.org', 'noreply@dni.org']);
let directoryEntries = [];
let messages = [];
let directoryAttempted = false;
let directoryLoading = null;
let preferencesLoading = null;
let preferencesAttempted = false;
let scanQueued = false;

const normalizeAddress = value => String(value || '').trim().toLowerCase();

function installControlStyles() {
  if (document.querySelector('style[data-dni-mail-controls-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailControlsStyle = 'true';
  style.textContent = `
    .dni-mail-sender-controls{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-left:auto}
    .dni-mail-sender-controls button{min-height:36px;padding:8px 10px;border:1px solid #444;background:#0d0d0d;color:#aaa;font:700 8px/1 "Courier New",monospace;letter-spacing:.45px;cursor:pointer}
    .dni-mail-sender-controls button:hover:not(:disabled){border-color:#c8a866;color:#eee}
    .dni-mail-sender-controls button[data-pref="blocked"]{border-color:rgba(210,76,80,.55);color:#dc7e81}
    .dni-mail-sender-controls button[data-confirm="true"]{background:#451517;border-color:#e45d62;color:#fff}
    .dni-mail-sender-controls button:disabled{opacity:.45;cursor:not-allowed}
    .dni-mail-sender-controls-status{flex-basis:100%;min-height:13px;color:#858585;font:700 8px/1.35 "Courier New",monospace}
    .dni-mail-sender-controls-status.is-error{color:#e45d62}
    .dni-mail-message.is-mail-muted{opacity:.7}
    .dni-mail-message.is-mail-muted .dni-mail-message-sender:after{content:" · MUTED";color:#777;font-size:8px}
    .dni-mail-controls-settings{margin-top:18px;padding:14px;border:1px solid #343434;background:#090909;font-family:"Courier New",monospace}
    .dni-mail-controls-settings h3{margin:0;color:#c8a866;font-size:12px}
    .dni-mail-controls-settings p{color:#888;font-size:9px}
    .dni-mail-pref-row{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:7px;padding:8px;border:1px solid #2d2d2d;font-size:9px;overflow-wrap:anywhere}
    .dni-mail-pref-row button{border:1px solid #555;background:#111;color:#ddd;padding:6px 9px;font:700 8px "Courier New",monospace}
    @media(max-width:768px){
      .dni-mail-sender-controls{width:100%;margin-left:0}
      .dni-mail-sender-controls button{min-height:44px;flex:1 1 132px;font-size:10px}
    }`;
  document.head.append(style);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error || `DNI Mail HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (payload.csrfToken) csrfToken = String(payload.csrfToken);
  return payload;
}

async function loadSession() {
  try {
    const payload = await jsonRequest(SESSION_URL);
    csrfToken = String(payload.csrfToken || csrfToken || '');
    return payload;
  } catch (error) {
    if (error?.status === 401) {
      csrfToken = '';
      directoryAttempted = false;
      preferencesAttempted = false;
    }
    throw error;
  }
}

function normalizeDirectoryEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.id);
  const address = normalizeAddress(raw.address);
  if (!Number.isInteger(id) || !address) return null;
  const name = String(raw.name || raw.displayName || raw.username || address).trim();
  const username = String(raw.username || '').trim();
  const description = String(raw.description || raw.serviceDescription || '').trim();
  return {
    id,
    address,
    name,
    username,
    description,
    service: raw.service === true || String(raw.accountType || raw.kind || '').toLowerCase().includes('service') || id < 0,
    accountType: String(raw.accountType || ''),
    identityType: String(raw.identityType || raw.kind || ''),
    label: String(raw.label || `${name} <${address}>`).trim()
  };
}

function setDirectory(rawUsers) {
  const byAddress = new Map();
  for (const raw of Array.isArray(rawUsers) ? rawUsers : []) {
    const entry = normalizeDirectoryEntry(raw);
    if (!entry) continue;
    byAddress.set(entry.address, entry);
  }
  directoryEntries = [...byAddress.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
    a.address.localeCompare(b.address)
  );
}

async function loadDirectory({ force = false } = {}) {
  if (directoryLoading) return directoryLoading;
  if (directoryAttempted && !force) {
    mergeRecipientOptions();
    return directoryEntries;
  }
  directoryAttempted = true;
  directoryLoading = (async () => {
    try {
      await loadSession();
      const payload = await jsonRequest(DIRECTORY_URL);
      setDirectory(payload.users);
      mergeRecipientOptions();
      window.dispatchEvent(new CustomEvent('dni:mail-directory-ready', {
        detail: { count: directoryEntries.length, source: payload.directorySource || 'server' }
      }));
      return directoryEntries;
    } catch (error) {
      if (error?.status === 401) directoryAttempted = false;
      throw error;
    } finally {
      directoryLoading = null;
    }
  })();
  return directoryLoading;
}

async function loadPreferences({ force = false } = {}) {
  if (preferencesLoading) return preferencesLoading;
  if (!force && preferencesAttempted) return preferences;

  preferencesAttempted = true;
  preferencesLoading = (async () => {
    try {
      const payload = await jsonRequest(`${CONTROL_URL}?action=preferences`);
      const nextPreferences = Array.isArray(payload.preferences) ? payload.preferences : [];
      const nextProtectedAddresses = new Set(
        (Array.isArray(payload.protectedAddresses) ? payload.protectedAddresses : [])
          .map(normalizeAddress)
          .filter(Boolean)
      );
      const changed = JSON.stringify(nextPreferences) !== JSON.stringify(preferences)
        || [...nextProtectedAddresses].sort().join('|') !== [...protectedAddresses].sort().join('|');

      preferences = nextPreferences;
      protectedAddresses = nextProtectedAddresses;
      if (changed) queueScan();
      return preferences;
    } catch (error) {
      if (error?.status === 401) preferencesAttempted = false;
      throw error;
    } finally {
      preferencesLoading = null;
    }
  })();
  return preferencesLoading;
}

function mergeRecipientOptions() {
  const select = document.querySelector('#dni-mail-panel [data-mail-recipients]');
  if (!(select instanceof HTMLSelectElement) || !directoryEntries.length) return;

  // This select lives below the mail-panel MutationObserver. Replacing the
  // same options again would requeue scan() forever for authenticated users.
  const currentOptions = [...select.options];
  const directoryIsCurrent = currentOptions.length === directoryEntries.length
    && directoryEntries.every((entry, index) => {
      const option = currentOptions[index];
      return option instanceof HTMLOptionElement
        && option.value === String(entry.id)
        && option.textContent === entry.label
        && normalizeAddress(option.dataset.mailAddress || option.dataset.dniMailAddress) === entry.address
        && option.dataset.mailName === entry.name
        && option.dataset.mailUsername === entry.username
        && option.dataset.mailDescription === entry.description
        && option.dataset.mailService === (entry.service ? 'true' : 'false')
        && option.dataset.dniDirectorySource === 'server';
    });
  if (directoryIsCurrent) return;

  const selectedAddresses = new Set(
    [...select.selectedOptions]
      .map(option => normalizeAddress(option.dataset.mailAddress || option.textContent?.match(/<([^>]+)>/)?.[1] || ''))
      .filter(Boolean)
  );
  const fragment = document.createDocumentFragment();
  for (const entry of directoryEntries) {
    const option = document.createElement('option');
    option.value = String(entry.id);
    option.textContent = entry.label;
    option.dataset.mailAddress = entry.address;
    option.dataset.dniMailAddress = entry.address;
    option.dataset.dniDirectorySource = 'server';
    option.dataset.mailName = entry.name;
    option.dataset.mailUsername = entry.username;
    option.dataset.mailDescription = entry.description;
    option.dataset.mailService = entry.service ? 'true' : 'false';
    option.dataset.mailSearch = [entry.name, entry.username, entry.address, entry.description].filter(Boolean).join(' ');
    option.selected = selectedAddresses.has(entry.address);
    fragment.append(option);
  }
  select.replaceChildren(fragment);
  select.dispatchEvent(new CustomEvent('dni:mail-directory-options', { bubbles: true }));
}

function installMailResponseBridge() {
  if (window.fetch?.dniMailControlsBridge) return;
  const previousFetch = window.fetch.bind(window);
  const wrapped = async (input, init = {}) => {
    const response = await previousFetch(input, init);
    try {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, location.href);
      if (url.origin === location.origin && url.pathname === '/mail-data.php' && String(url.searchParams.get('action') || '').toLowerCase() === 'list' && response.ok) {
        void response.clone().json().then(payload => {
          if (Array.isArray(payload.messages)) messages = payload.messages;
          if (Array.isArray(payload.mailPreferences)) preferences = payload.mailPreferences;
          queueScan();
        }).catch(() => {});
      }
    } catch {}
    return response;
  };
  wrapped.dniMailControlsBridge = true;
  window.fetch = wrapped;
}

function prefEnabled(address, preference) {
  const key = normalizeAddress(address);
  return preferences.some(item =>
    String(item?.targetType || '') === 'sender' &&
    normalizeAddress(item?.targetKey) === key &&
    String(item?.preference || '') === preference
  );
}

async function setPreference(address, preference, enabled) {
  const key = normalizeAddress(address);
  if (!key) throw new Error('DNI Mail sender address is unavailable.');
  if (!csrfToken) await loadSession();
  const payload = await jsonRequest(`${CONTROL_URL}?action=preference`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DNI-CSRF': csrfToken
    },
    body: JSON.stringify({
      targetType: 'sender',
      targetKey: key,
      preference,
      enabled
    })
  });
  preferences = Array.isArray(payload.preferences) ? payload.preferences : preferences;
  preferencesAttempted = true;
  queueScan();
  window.dispatchEvent(new CustomEvent('dni:mail-preferences-changed', {
    detail: { address: key, preference, enabled }
  }));
}

function readerAddress(reader) {
  return normalizeAddress(reader?.querySelector('.dni-mail-sender-address')?.textContent || '');
}

function setControlStatus(root, text = '', error = false) {
  const status = root?.querySelector('.dni-mail-sender-controls-status');
  if (!(status instanceof HTMLElement)) return;
  status.textContent = String(text || '');
  status.classList.toggle('is-error', Boolean(error));
}

function setTextIfChanged(node, text) {
  const next = String(text ?? '');
  if (node?.textContent !== next) node.textContent = next;
}

function setAttributeIfChanged(node, name, value) {
  const next = String(value ?? '');
  if (node?.getAttribute?.(name) !== next) node.setAttribute(name, next);
}

function decorateReaderControls() {
  const reader = document.querySelector('#dni-mail-reader.dni-mail-reader');
  if (!(reader instanceof HTMLElement)) return;
  const address = readerAddress(reader);
  if (!address) return;

  const actions = reader.querySelector('.dni-mail-reader-actions');
  if (!(actions instanceof HTMLElement)) return;

  let controls = actions.querySelector('.dni-mail-sender-controls');
  if (!(controls instanceof HTMLElement)) {
    controls = document.createElement('div');
    controls.className = 'dni-mail-sender-controls';
    const mute = document.createElement('button');
    mute.type = 'button';
    mute.dataset.pref = 'muted';
    const block = document.createElement('button');
    block.type = 'button';
    block.dataset.pref = 'blocked';
    const status = document.createElement('span');
    status.className = 'dni-mail-sender-controls-status';
    status.setAttribute('aria-live', 'polite');
    controls.append(mute, block, status);
    actions.append(controls);

    mute.addEventListener('click', async () => {
      const current = readerAddress(reader);
      if (!current) return;
      mute.disabled = true;
      try {
        await setPreference(current, 'muted', !prefEnabled(current, 'muted'));
        setControlStatus(controls, prefEnabled(current, 'muted') ? 'SENDER MUTED' : 'SENDER UNMUTED');
      } catch (error) {
        setControlStatus(controls, String(error?.message || error), true);
      } finally {
        mute.disabled = false;
      }
    });

    block.addEventListener('click', async () => {
      const current = readerAddress(reader);
      if (!current || protectedAddresses.has(current)) return;
      const alreadyBlocked = prefEnabled(current, 'blocked');
      if (!alreadyBlocked && block.dataset.confirm !== 'true') {
        block.dataset.confirm = 'true';
        block.textContent = 'CONFIRM BLOCK';
        window.setTimeout(() => {
          if (block.dataset.confirm === 'true') {
            delete block.dataset.confirm;
            queueScan();
          }
        }, 4000);
        return;
      }
      delete block.dataset.confirm;
      block.disabled = true;
      try {
        await setPreference(current, 'blocked', !alreadyBlocked);
        setControlStatus(controls, alreadyBlocked ? 'SENDER UNBLOCKED' : 'SENDER BLOCKED');
      } catch (error) {
        setControlStatus(controls, String(error?.message || error), true);
      } finally {
        block.disabled = false;
      }
    });
  }

  const mute = controls.querySelector('[data-pref="muted"]');
  const block = controls.querySelector('[data-pref="blocked"]');
  const muted = prefEnabled(address, 'muted');
  const blocked = prefEnabled(address, 'blocked');
  const isProtected = protectedAddresses.has(address);

  if (mute instanceof HTMLButtonElement) {
    setTextIfChanged(mute, muted ? 'UNMUTE SENDER' : 'MUTE SENDER');
    setAttributeIfChanged(mute, 'aria-pressed', muted ? 'true' : 'false');
  }
  if (block instanceof HTMLButtonElement) {
    block.disabled = isProtected;
    if (block.dataset.confirm !== 'true') {
      setTextIfChanged(block, blocked ? 'UNBLOCK SENDER' : (isProtected ? 'PROTECTED SENDER' : 'BLOCK SENDER'));
    }
    setAttributeIfChanged(block, 'aria-pressed', blocked ? 'true' : 'false');
    const title = isProtected ? 'Protected DNI system and support identities cannot be blocked.' : '';
    if (block.title !== title) block.title = title;
  }
}

function mutedUi() {
  const muted = new Set(messages.filter(message => message?.mail_muted === true).map(message => String(message?.id || '')));
  document.querySelectorAll('.dni-mail-message').forEach(row => {
    const id = String(row.querySelector('.dni-mail-id')?.textContent || '');
    const yes = muted.has(id);
    row.classList.toggle('is-mail-muted', yes);
    if (yes) row.querySelector('.dni-mail-unread-dot')?.remove();
  });

  const count = messages.filter(message => !message?.read && message?.mail_muted !== true).length;
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
  try { await loadPreferences(); } catch { return; }

  let section = body.querySelector('[data-mail-controls-settings]');
  if (!(section instanceof HTMLElement)) {
    section = document.createElement('section');
    section.className = 'dni-mail-controls-settings';
    section.dataset.mailControlsSettings = '1';
    section.innerHTML = '<h3>Mail Blocks & Mutes</h3><p>Blocked messages stay retained in DNI Mail. Muted senders still deliver mail without unread alerts.</p><div data-mail-pref-list></div>';
    body.append(section);
  }

  const signature = JSON.stringify(preferences);
  if (section.dataset.state === signature) return;
  section.dataset.state = signature;
  const list = section.querySelector('[data-mail-pref-list]');
  if (!(list instanceof HTMLElement)) return;
  list.replaceChildren();
  if (!preferences.length) {
    list.textContent = 'No blocked or muted senders.';
    return;
  }

  for (const pref of preferences) {
    const row = document.createElement('div');
    row.className = 'dni-mail-pref-row';
    const text = document.createElement('span');
    text.textContent = `${String(pref.preference).toUpperCase()} // ${pref.targetKey}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = pref.preference === 'blocked' ? 'UNBLOCK' : 'UNMUTE';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await setPreference(pref.targetKey, pref.preference, false);
        await settings();
      } catch {
        button.disabled = false;
        button.textContent = 'ERROR';
      }
    });
    row.append(text, button);
    list.append(row);
  }
}

function scan() {
  scanQueued = false;
  mutedUi();
  mergeRecipientOptions();
  decorateReaderControls();
  void settings();
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  queueMicrotask(scan);
}

function refreshAuthoritativeDirectory() {
  directoryAttempted = false;
  return loadDirectory({ force: true }).catch(() => []);
}

function initialize() {
  installControlStyles();
  installMailResponseBridge();
  const observer = new MutationObserver(mutations => {
    const meaningful = mutations.some(mutation => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (!(target instanceof Element)) return true;
      return !target.closest('.dni-mail-sender-controls, [data-mail-controls-settings]');
    });
    if (meaningful) queueScan();
  });
  const mailPanel = document.querySelector('#dni-mail-panel');
  if (mailPanel) observer.observe(mailPanel, { childList: true, subtree: true });

  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel !== 'mail') return;
    void loadDirectory().catch(() => {});
    void loadPreferences().catch(() => {});
    queueScan();
  });
  window.addEventListener('dni:mail-realtime-reconnected', () => {
    void refreshAuthoritativeDirectory();
    void loadPreferences({ force: true }).catch(() => {});
  });
  window.addEventListener('pageshow', () => {
    void loadDirectory().catch(() => {});
    queueScan();
  });
  window.addEventListener('focus', () => {
    void loadDirectory().catch(() => {});
    queueScan();
  });
  document.addEventListener('focusin', event => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('#dni-mail-panel [data-mail-recipient-field]')) return;
    void loadDirectory().then(queueScan).catch(() => {});
  });

  void loadSession()
    .then(() => Promise.allSettled([loadDirectory(), loadPreferences()]))
    .catch(() => {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();

export { refreshAuthoritativeDirectory };
