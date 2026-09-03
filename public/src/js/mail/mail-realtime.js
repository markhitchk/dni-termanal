const REALTIME_URL = '/mail-events.php';
const MAIL_URL = '/mail-data.php';
const HEARTBEAT_MS = 1400;
const TYPING_IDLE_MS = 3800;

const realtime = {
  source: null,
  csrfToken: '',
  directoryRevision: '',
  directorySyncing: false,
  typing: [],
  typingByField: new WeakMap(),
  reconcileTimer: 0,
  reconcileInFlight: false,
  reconnecting: false,
  initialized: false
};

function moduleStylesheetUrl() {
  const source = new URL(import.meta.url);
  return new URL(`../../css/mail/mail-live.css${source.search}`, source);
}

function installStyles() {
  if (document.querySelector('link[data-dni-mail-live-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = moduleStylesheetUrl().href;
  link.dataset.dniMailLiveStyle = 'true';
  document.head.append(link);
}

function normalizeAddress(value = '') {
  let address = String(value || '').trim().toLowerCase();
  const bracket = address.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/i);
  if (bracket) address = bracket[1].trim().toLowerCase();
  return address.replace(/^[<(\[{'\"`]+|[>)\]}'\"`,.;:]+$/g, '').trim();
}

function optionAddress(option) {
  if (!(option instanceof HTMLOptionElement)) return '';
  const declared = normalizeAddress(
    option.dataset.dniMailAddress
      || option.dataset.mailAddress
      || option.dataset.address
      || ''
  );
  if (declared) return declared;
  const match = String(option.textContent || '').match(/<([^<>\s]+@[^<>\s]+)>/);
  return normalizeAddress(match?.[1] || '');
}

function activeMailPanel() {
  const panel = document.querySelector('#dni-mail-panel');
  return panel instanceof HTMLElement && panel.style.display !== 'none' && !panel.hidden;
}

function currentMessageCode() {
  const active = document.querySelector('#dni-mail-list .dni-mail-message.is-active .dni-mail-id');
  const fromList = String(active?.textContent || '').trim().toUpperCase();
  if (/^MAIL-\d+$/.test(fromList)) return fromList;

  const meta = document.querySelector('#dni-mail-reader .dni-mail-reader-meta');
  if (!(meta instanceof HTMLElement)) return '';
  return [...meta.querySelectorAll('span')]
    .map(node => String(node.textContent || '').trim().toUpperCase())
    .find(value => /^MAIL-\d+$/.test(value)) || '';
}

function threadMessageCodes() {
  const codes = new Set();
  for (const node of document.querySelectorAll('#dni-mail-reader [data-message-id]')) {
    const value = String(node.getAttribute('data-message-id') || '').trim().toUpperCase();
    if (/^MAIL-\d+$/.test(value)) codes.add(value);
  }
  const current = currentMessageCode();
  if (current) codes.add(current);
  return codes;
}

function restoreSelectedMessage(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^MAIL-\d+$/.test(normalized)) return;

  const tryRestore = () => {
    const items = [...document.querySelectorAll('#dni-mail-list .dni-mail-message')];
    const match = items.find(item => {
      const id = String(item.querySelector('.dni-mail-id')?.textContent || '').trim().toUpperCase();
      return id === normalized;
    });
    if (match instanceof HTMLButtonElement && !match.classList.contains('is-active')) {
      match.click();
      return true;
    }
    return false;
  };

  for (const delay of [90, 220, 480, 900]) window.setTimeout(tryRestore, delay);
}

function authoritativeMailRefresh() {
  if (!activeMailPanel() || realtime.reconcileInFlight) return;
  realtime.reconcileInFlight = true;
  const selected = currentMessageCode();
  const inbox = document.querySelector('#terminal-inbox');

  try {
    if (inbox instanceof HTMLElement) {
      inbox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      if (selected) restoreSelectedMessage(selected);
    } else {
      window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel: 'mail' } }));
    }
    window.dispatchEvent(new CustomEvent('dni:mail-realtime-sync', { detail: { source: 'sse' } }));
  } finally {
    window.setTimeout(() => {
      realtime.reconcileInFlight = false;
    }, 120);
  }
}

function queueReconcile() {
  window.clearTimeout(realtime.reconcileTimer);
  realtime.reconcileTimer = window.setTimeout(authoritativeMailRefresh, 35);
}

function parseEvent(event) {
  try {
    return JSON.parse(String(event.data || '{}'));
  } catch {
    return {};
  }
}

function setLiveStatus(text, failed = false) {
  const node = document.querySelector('#dni-mail-panel [data-mail-online]');
  if (!(node instanceof HTMLElement)) return;
  node.className = failed ? 'dni-mail-online is-error' : 'dni-mail-online';
  node.innerHTML = `<i></i> ${text}`;
}

function eventSourceUrl() {
  return `${REALTIME_URL}?action=stream`;
}

function closeSource() {
  if (realtime.source) {
    realtime.source.close();
    realtime.source = null;
  }
}

function connect() {
  if (!('EventSource' in window) || realtime.source) return;

  const source = new EventSource(eventSourceUrl(), { withCredentials: true });
  realtime.source = source;

  source.onopen = () => {
    realtime.reconnecting = false;
    setLiveStatus('LIVE MAIL LINK');
    queueReconcile();
  };

  source.onerror = () => {
    setLiveStatus('RECONNECTING', true);
    realtime.reconnecting = true;
    stopAllTyping({ bestEffort: true });
  };

  for (const name of ['sync', 'new-mail', 'thread-update', 'state-update', 'delete']) {
    source.addEventListener(name, event => {
      parseEvent(event);
      queueReconcile();
    });
  }

  source.addEventListener('typing', event => {
    const payload = parseEvent(event);
    realtime.typing = Array.isArray(payload.typing) ? payload.typing : [];
    renderTyping();
  });

  source.addEventListener('auth-expired', () => {
    closeSource();
    setLiveStatus('SIGN IN REQUIRED', true);
  });

  source.addEventListener('mail-error', () => {
    setLiveStatus('LIVE LINK DEGRADED', true);
  });
}

async function loadSession() {
  const response = await fetch(`${MAIL_URL}?action=session`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI Mail session HTTP ${response.status}`);
  realtime.csrfToken = String(payload.csrfToken || realtime.csrfToken || '');
  return payload;
}

function directorySignature(users) {
  return JSON.stringify((Array.isArray(users) ? users : []).map(item => [
    Number(item?.id || 0),
    normalizeAddress(item?.address || ''),
    String(item?.name || item?.username || ''),
    String(item?.description || item?.label || '')
  ]));
}

function applyAuthoritativeDirectory(users) {
  const select = document.querySelector('#dni-mail-panel [data-mail-recipients]');
  if (!(select instanceof HTMLSelectElement) || !Array.isArray(users)) return;

  const signature = directorySignature(users);
  if (signature === realtime.directoryRevision) return;

  const selectedAddresses = new Set(
    [...select.selectedOptions].map(optionAddress).filter(Boolean)
  );
  const selectedIds = new Set(
    [...select.selectedOptions].map(option => Number(option.value)).filter(Number.isInteger)
  );

  const fragment = document.createDocumentFragment();
  for (const entry of users) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id)) continue;
    const address = normalizeAddress(entry?.address || '');
    if (!address) continue;

    const name = String(entry?.name || entry?.username || entry?.description || `DNI USER ${id}`).trim();
    const description = String(entry?.description || '').trim();
    const option = document.createElement('option');
    option.value = String(id);
    option.dataset.dniMailAddress = address;
    option.dataset.dniDirectorySource = 'server';
    if (entry?.kind) option.dataset.dniDirectoryKind = String(entry.kind);
    if (id < 0) option.dataset.dniSupportRoute = 'true';

    const readable = description && description.toLowerCase() !== name.toLowerCase()
      ? `${name} — ${description} <${address}>`
      : `${name} <${address}>`;
    option.textContent = readable;
    option.selected = selectedIds.has(id) || selectedAddresses.has(address);
    fragment.append(option);
  }

  select.replaceChildren(fragment);
  realtime.directoryRevision = signature;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

async function syncAuthoritativeDirectory() {
  if (realtime.directorySyncing) return;
  const select = document.querySelector('#dni-mail-panel [data-mail-recipients]');
  if (!(select instanceof HTMLSelectElement)) return;

  realtime.directorySyncing = true;
  try {
    const response = await fetch(`${MAIL_URL}?action=directory`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `DNI Mail directory HTTP ${response.status}`);
    applyAuthoritativeDirectory(Array.isArray(payload.users) ? payload.users : []);
  } catch (error) {
    console.warn('DNI Mail authoritative recipient directory unavailable', error);
  } finally {
    realtime.directorySyncing = false;
  }
}

function typingText(typers) {
  const names = [...new Set(typers.map(item => String(item?.name || '').trim()).filter(Boolean))];
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others are typing…`;
}

function ensureTypingIndicator(field, className) {
  if (!(field instanceof HTMLElement)) return null;
  const parent = field.parentElement;
  if (!(parent instanceof HTMLElement)) return null;

  let indicator = parent.querySelector(`:scope > .${className}`);
  if (!(indicator instanceof HTMLElement)) {
    indicator = document.createElement('div');
    indicator.className = `dni-mail-typing-indicator ${className}`;
    indicator.setAttribute('aria-live', 'polite');
    indicator.setAttribute('aria-atomic', 'true');
    parent.insertBefore(indicator, field);
  }
  return indicator;
}

function renderTyping() {
  const now = Math.floor(Date.now() / 1000);
  realtime.typing = realtime.typing.filter(item => Number(item?.expiresAt || 0) > now);

  const threadTextarea = document.querySelector('[data-mail-thread-inline-reply].is-open textarea');
  if (threadTextarea instanceof HTMLTextAreaElement) {
    const codes = threadMessageCodes();
    const typers = realtime.typing.filter(item => item?.scopeType === 'thread' && codes.has(String(item?.threadRoot || '').toUpperCase()));
    const indicator = ensureTypingIndicator(threadTextarea, 'dni-mail-thread-typing');
    if (indicator) {
      indicator.textContent = typingText(typers);
      indicator.hidden = !indicator.textContent;
    }
  }

  const composeBody = document.querySelector('#dni-mail-panel [data-mail-compose-shell]:not([hidden]) textarea[name="body"]');
  if (composeBody instanceof HTMLTextAreaElement) {
    const typers = realtime.typing.filter(item => item?.scopeType === 'direct');
    const indicator = ensureTypingIndicator(composeBody, 'dni-mail-compose-typing');
    if (indicator) {
      indicator.textContent = typingText(typers);
      indicator.hidden = !indicator.textContent;
    }
  }
}

function typingContextFor(field) {
  if (!(field instanceof HTMLTextAreaElement)) return null;

  const threadForm = field.closest('[data-mail-thread-reply-form]');
  if (threadForm) {
    const code = currentMessageCode();
    return code ? { threadId: code, recipientUserIds: [] } : null;
  }

  const compose = field.closest('[data-mail-compose]');
  if (compose && field.name === 'body') {
    const type = compose.elements.namedItem('messageType');
    if (type instanceof HTMLSelectElement && type.value !== 'message') return null;
    const recipients = compose.querySelector('[data-mail-recipients]');
    if (!(recipients instanceof HTMLSelectElement)) return null;
    const ids = [...recipients.selectedOptions]
      .map(option => Number(option.value))
      .filter(Number.isInteger);
    if (!ids.length) return null;
    return { threadId: '', recipientUserIds: ids };
  }
  return null;
}

function contextKey(context) {
  if (!context) return '';
  if (context.threadId) return `thread:${String(context.threadId).toUpperCase()}`;
  return `direct:${[...(context.recipientUserIds || [])].map(Number).sort((a, b) => a - b).join(',')}`;
}

async function postTyping(context, state) {
  if (!context) return;
  if (!realtime.csrfToken) {
    try {
      await loadSession();
    } catch {
      return;
    }
  }
  try {
    const response = await fetch(`${REALTIME_URL}?action=typing`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: state === 'stop',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-DNI-CSRF': realtime.csrfToken
      },
      body: JSON.stringify({
        state,
        threadId: context.threadId || '',
        recipientUserIds: context.recipientUserIds || []
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (payload.csrfToken) realtime.csrfToken = String(payload.csrfToken);
  } catch {
  }
}

function stopTypingField(field, { bestEffort = false } = {}) {
  if (!(field instanceof HTMLTextAreaElement)) return;
  const active = realtime.typingByField.get(field);
  if (!active) return;

  window.clearTimeout(active.idleTimer);
  realtime.typingByField.delete(field);
  void postTyping(active.context, 'stop');
  if (!bestEffort) renderTyping();
}

function stopAllTyping(options = {}) {
  const fields = [
    ...document.querySelectorAll('#dni-mail-panel textarea[name="body"]'),
    ...document.querySelectorAll('[data-mail-thread-reply-form] textarea')
  ];
  for (const field of fields) stopTypingField(field, options);
}

function heartbeatTyping(field) {
  const context = typingContextFor(field);
  if (!context || !String(field.value || '').trim()) {
    stopTypingField(field);
    return;
  }

  const key = contextKey(context);
  const now = Date.now();
  let active = realtime.typingByField.get(field);

  if (active && active.key !== key) {
    stopTypingField(field);
    active = null;
  }

  if (!active) {
    active = { context, key, lastSentAt: 0, idleTimer: 0 };
    realtime.typingByField.set(field, active);
  } else {
    active.context = context;
  }

  if (now - active.lastSentAt >= HEARTBEAT_MS) {
    active.lastSentAt = now;
    void postTyping(context, 'start');
  }

  window.clearTimeout(active.idleTimer);
  active.idleTimer = window.setTimeout(() => stopTypingField(field), TYPING_IDLE_MS);
}

function addOptimisticComposeStatus(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const actions = form.querySelector('.dni-mail-compose-actions');
  if (!(actions instanceof HTMLElement)) return;
  let status = actions.querySelector('.dni-mail-optimistic-status');
  if (!(status instanceof HTMLElement)) {
    status = document.createElement('span');
    status.className = 'dni-mail-optimistic-status';
    status.setAttribute('aria-live', 'polite');
    actions.prepend(status);
  }
  status.textContent = 'SENDING…';
}

function addOptimisticThreadReply(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const textarea = form.querySelector('textarea');
  const list = document.querySelector('#dni-mail-reader .dni-mail-thread-list');
  const body = String(textarea?.value || '').trim();
  if (!(list instanceof HTMLElement) || !body) return;

  const pending = document.createElement('article');
  pending.className = 'dni-mail-thread-message is-own dni-mail-message-optimistic';
  pending.dataset.optimistic = 'true';
  pending.innerHTML = `
    <div class="dni-mail-thread-message-head">
      <div class="dni-mail-thread-sender"><strong>YOU · SENDING…</strong></div>
    </div>
    <div class="dni-mail-thread-body"></div>`;
  const bodyNode = pending.querySelector('.dni-mail-thread-body');
  if (bodyNode) bodyNode.textContent = body;
  list.append(pending);
  pending.scrollIntoView({ block: 'nearest' });
}

function installInteractionHooks() {
  document.addEventListener('input', event => {
    const field = event.target;
    if (!(field instanceof HTMLTextAreaElement)) return;
    if (
      field.matches('#dni-mail-panel [data-mail-compose] textarea[name="body"]')
      || field.matches('[data-mail-thread-reply-form] textarea')
    ) {
      heartbeatTyping(field);
    }
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    if (form.matches('#dni-mail-panel [data-mail-compose]')) {
      const body = form.querySelector('textarea[name="body"]');
      if (body instanceof HTMLTextAreaElement) stopTypingField(body, { bestEffort: true });
      addOptimisticComposeStatus(form);
    } else if (form.matches('[data-mail-thread-reply-form]')) {
      const body = form.querySelector('textarea');
      if (body instanceof HTMLTextAreaElement) stopTypingField(body, { bestEffort: true });
      addOptimisticThreadReply(form);
    }
  }, true);

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (
      target.closest('[data-mail-compose-close]')
      || target.closest('[data-mail-thread-inline-reply] button[type="button"]')
      || target.closest('#dni-mail-list .dni-mail-message')
    ) {
      stopAllTyping({ bestEffort: true });
    }

    if (target.closest('[data-mail-compose-launch]')) {
      window.setTimeout(() => void syncAuthoritativeDirectory(), 0);
    }
  }, true);

  document.addEventListener('focusin', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('.dni-mail-to-input')) {
      void syncAuthoritativeDirectory();
    }
  }, true);

  const observer = new MutationObserver(() => {
    const composeShell = document.querySelector('#dni-mail-panel [data-mail-compose-shell]');
    const recipients = document.querySelector('#dni-mail-panel [data-mail-recipients]');
    const needsDirectory = recipients instanceof HTMLSelectElement
      && composeShell instanceof HTMLElement
      && !composeShell.hidden
      && [...recipients.options].some(option => option.dataset.dniDirectorySource !== 'server');
    if (needsDirectory) void syncAuthoritativeDirectory();

    renderTyping();

    if (!document.querySelector('.dni-mail-message-optimistic')) return;
    const authoritativeThread = document.querySelector('#dni-mail-reader .dni-mail-thread-list');
    if (authoritativeThread?.querySelector('.dni-mail-thread-message:not(.dni-mail-message-optimistic):last-child')) {
      for (const node of document.querySelectorAll('.dni-mail-message-optimistic')) {
        window.setTimeout(() => node.remove(), 2500);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopAllTyping({ bestEffort: true });
      return;
    }
    if (!realtime.source) connect();
    queueReconcile();
  });

  window.addEventListener('focus', () => {
    if (!realtime.source) connect();
    queueReconcile();
  });

  window.addEventListener('pagehide', () => {
    stopAllTyping({ bestEffort: true });
    closeSource();
  });
}

function installSendAddressBridge() {
  if (window.fetch?.dniMailRealtimeAddressBridge) return;
  const previousFetch = window.fetch.bind(window);

  const wrapped = async (input, init = {}) => {
    let requestInit = init;
    try {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, location.href);
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.origin === location.origin && url.pathname === MAIL_URL && url.searchParams.get('action') === 'send' && method === 'POST' && typeof init.body === 'string') {
        const body = JSON.parse(init.body);
        const inputNode = document.querySelector('#dni-mail-panel .dni-mail-to-input');
        if (inputNode instanceof HTMLInputElement) {
          const addresses = [...new Set(
            (String(inputNode.value || '').match(/[a-z0-9][a-z0-9._-]{0,63}@[a-z0-9.-]+/gi) || [])
              .map(normalizeAddress)
              .filter(Boolean)
          )];
          if (addresses.length) {
            body.recipientAddresses = addresses;
            requestInit = { ...init, body: JSON.stringify(body) };
          }
        }
      }
    } catch {}
    return previousFetch(input, requestInit);
  };
  wrapped.dniMailRealtimeAddressBridge = true;
  window.fetch = wrapped;
}

async function init() {
  if (realtime.initialized) return;
  realtime.initialized = true;
  installStyles();
  installSendAddressBridge();
  installInteractionHooks();

  try {
    await loadSession();
    connect();
  } catch {
    setLiveStatus('SIGN IN REQUIRED', true);
  }

  if (document.querySelector('#dni-mail-panel [data-mail-recipients]')) {
    void syncAuthoritativeDirectory();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  void init();
}
