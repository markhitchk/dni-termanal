const CONTROL_URL = '/mail-controls.php';
const ROUTES = new Set([-9101, -9102, -9103]);
const PROTECTED = new Set([
  'system@dni.org',
  'noreply@dni.org',
  'dev@support.dni.org',
  'support@support.dni.org',
  'admin@support.dni.org'
]);
const NO_REPLY = new Set(['system@dni.org', 'noreply@dni.org']);
const nativeFetch = window.fetch.bind(window);

let prefs = [];
let supportRoutes = [];
let csrf = '';
let messages = [];
let loading = null;
let queued = false;
let scanFrame = 0;
let supportRoutesLoaded = false;

function rememberControlPayload(payload = {}) {
  if (Array.isArray(payload.preferences)) prefs = payload.preferences;
  if (Array.isArray(payload.routes)) {
    supportRoutes = payload.routes.filter(route => route && Number.isInteger(Number(route.id)));
    for (const route of supportRoutes) {
      ROUTES.add(Number(route.id));
      const address = String(route.address || '').trim().toLowerCase();
      if (address) PROTECTED.add(address);
    }
    supportRoutesLoaded = true;
  }
  if (Array.isArray(payload.protectedAddresses)) {
    for (const address of payload.protectedAddresses) {
      const normalized = String(address || '').trim().toLowerCase();
      if (normalized) PROTECTED.add(normalized);
    }
  }
  csrf = String(payload.csrfToken || csrf);
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
  if (same && action === 'list' && response.ok) {
    response.clone().json().then(payload => {
      if (Array.isArray(payload.messages)) messages = payload.messages;
      if (Array.isArray(payload.mailPreferences)) prefs = payload.mailPreferences;
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

function hideSystemRecipients() {
  const recipients = document.querySelector('#dni-mail-panel [data-mail-recipients]');
  if (!(recipients instanceof HTMLSelectElement)) return;

  for (const option of [...recipients.options]) {
    if (option.dataset.dniSupportRoute === 'true') continue;
    const dataAddress = String(option.dataset.dniMailAddress || '').trim().toLowerCase();
    const label = String(option.textContent || '').toLowerCase();
    const isSystemIdentity = [...NO_REPLY].some(address => dataAddress === address || label.includes(address));
    if (isSystemIdentity) option.remove();
  }
}

function injectSupportRoutes() {
  const recipients = document.querySelector('#dni-mail-panel [data-mail-recipients]');
  if (!(recipients instanceof HTMLSelectElement) || !supportRoutes.length) return;

  for (const route of supportRoutes) {
    const id = Number(route.id);
    if (!Number.isInteger(id) || id >= 0) continue;

    const value = String(id);
    const address = String(route.address || '').trim().toLowerCase();
    const name = String(route.name || route.key || 'DNI Support').trim();
    const label = String(route.label || `${name} <${address}> · ROUTED CHANNEL`).trim();
    let option = [...recipients.options].find(candidate => candidate.value === value);

    if (!(option instanceof HTMLOptionElement)) {
      option = document.createElement('option');
      option.value = value;
      recipients.append(option);
    }

    // Keep this idempotent. The mail panel is watched by a MutationObserver;
    // rewriting textContent on every scan creates a self-triggering observer loop
    // that can lock the browser UI.
    if (option.textContent !== label) option.textContent = label;
    if (option.dataset.dniSupportRoute !== 'true') option.dataset.dniSupportRoute = 'true';
    if (address) {
      if (option.dataset.dniMailAddress !== address) option.dataset.dniMailAddress = address;
    } else if (option.dataset.dniMailAddress) {
      delete option.dataset.dniMailAddress;
    }
  }
}

async function ensureSupportRoutes() {
  if (!supportRoutesLoaded) {
    try {
      await loadPrefs();
    } catch {
      return;
    }
  }
  injectSupportRoutes();
}

async function readerControls() {
  const reader = document.querySelector('#dni-mail-reader.dni-mail-reader');
  const actions = reader?.querySelector('[data-mail-message-actions]');
  if (!(reader instanceof HTMLElement) || !(actions instanceof HTMLElement)) return;

  const address = String(reader.querySelector('.dni-mail-sender-address')?.textContent || '').trim().toLowerCase();
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
  hideSystemRecipients();
  void ensureSupportRoutes();
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
queue();