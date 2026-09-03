const CONTROL_URL = '/mail-controls.php';
const DIRECTORY_URL = '/mail-data.php?action=directory';
const SESSION_URL = '/mail-data.php?action=session';

let csrfToken = '';
let preferences = [];
let protectedAddresses = new Set(['system@dni.org', 'noreply@dni.org']);
let directoryEntries = [];
let directoryAttempted = false;
let directoryLoading = null;
let preferencesLoading = null;
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
  if (directoryAttempted && !force && directoryEntries.length) {
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
  if (!force && preferences.length) {
    queueScan();
    return preferences;
  }
  preferencesLoading = (async () => {
    try {
      const payload = await jsonRequest(`${CONTROL_URL}?action=preferences`);
      preferences = Array.isArray(payload.preferences) ? payload.preferences : [];
      protectedAddresses = new Set(
        (Array.isArray(payload.protectedAddresses) ? payload.protectedAddresses : [])
          .map(normalizeAddress)
          .filter(Boolean)
      );
      queueScan();
      return preferences;
    } finally {
      preferencesLoading = null;
    }
  })();
  return preferencesLoading;
}

function mergeRecipientOptions() {
  const select = document.querySelector('#dni-mail-panel [data-mail-recipients]');
  if (!(select instanceof HTMLSelectElement) || !directoryEntries.length) return;

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
    mute.textContent = muted ? 'UNMUTE SENDER' : 'MUTE SENDER';
    mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
  if (block instanceof HTMLButtonElement) {
    block.disabled = isProtected;
    if (block.dataset.confirm !== 'true') block.textContent = blocked ? 'UNBLOCK SENDER' : (isProtected ? 'PROTECTED SENDER' : 'BLOCK SENDER');
    block.setAttribute('aria-pressed', blocked ? 'true' : 'false');
    block.title = isProtected ? 'Protected DNI system and support identities cannot be blocked.' : '';
  }
}

function scan() {
  scanQueued = false;
  mergeRecipientOptions();
  decorateReaderControls();
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
  const observer = new MutationObserver(queueScan);
  observer.observe(document.body, { childList: true, subtree: true });

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
