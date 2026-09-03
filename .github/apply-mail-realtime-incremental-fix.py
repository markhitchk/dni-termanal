from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    p.write_text(text.replace(old, new, 1))


replace_once(
    'server/php/dni-mail-realtime.php',
    """            'read' => (bool)($message['read'] ?? false),
            'sentAt' => (string)($message['sent_at'] ?? ''),
        ];""",
    """            'read' => (bool)($message['read'] ?? false),
            'sentAt' => (string)($message['sent_at'] ?? ''),
            'summary' => $message,
        ];"""
)

replace_once(
    'public/src/js/mail/mail-realtime.js',
    """  typingByField: new WeakMap(),
  reconcileTimer: 0,
  reconcileInFlight: false,
  reconnecting: false,
  initialized: false
};""",
    """  typingByField: new WeakMap(),
  reconcileTimer: 0,
  deltaTimer: 0,
  pendingRevision: '',
  pendingCounts: null,
  pendingChanges: [],
  lastRevision: '',
  reconnecting: false,
  initialized: false
};"""
)

replace_once(
    'public/src/js/mail/mail-realtime.js',
    """function restoreSelectedMessage(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^MAIL-\\d+$/.test(normalized)) return;

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
  if (!activeMailPanel()) return;
  window.clearTimeout(realtime.reconcileTimer);
  realtime.reconcileTimer = window.setTimeout(authoritativeMailRefresh, 35);
}
""",
    """function authoritativeMailRefresh() {
  if (!activeMailPanel()) return;
  window.dispatchEvent(new CustomEvent('dni:mail-realtime-resync', {
    detail: { source: 'sse-recovery' }
  }));
}

function queueReconcile() {
  if (!activeMailPanel()) return;
  window.clearTimeout(realtime.reconcileTimer);
  realtime.reconcileTimer = window.setTimeout(authoritativeMailRefresh, 35);
}

function flushRealtimeDelta() {
  window.clearTimeout(realtime.deltaTimer);
  realtime.deltaTimer = 0;
  if (!realtime.pendingChanges.length) return;

  const detail = {
    source: 'sse',
    revision: realtime.pendingRevision,
    counts: realtime.pendingCounts,
    changes: realtime.pendingChanges
  };
  realtime.pendingRevision = '';
  realtime.pendingCounts = null;
  realtime.pendingChanges = [];

  if (!activeMailPanel()) return;
  if (detail.revision) realtime.lastRevision = detail.revision;
  window.dispatchEvent(new CustomEvent('dni:mail-realtime-delta', { detail }));
  window.dispatchEvent(new CustomEvent('dni:mail-realtime-sync', { detail }));
}

function queueRealtimeDelta(eventName, payload = {}) {
  const revision = String(payload?.revision || '');
  if (realtime.pendingRevision && revision && realtime.pendingRevision !== revision) flushRealtimeDelta();
  if (revision) realtime.pendingRevision = revision;
  if (payload?.counts && typeof payload.counts === 'object') realtime.pendingCounts = payload.counts;
  realtime.pendingChanges.push({
    event: eventName,
    items: Array.isArray(payload?.items) ? payload.items : []
  });
  window.clearTimeout(realtime.deltaTimer);
  realtime.deltaTimer = window.setTimeout(flushRealtimeDelta, 20);
}
"""
)

replace_once(
    'public/src/js/mail/mail-realtime.js',
    """  for (const name of ['sync', 'new-mail', 'thread-update', 'state-update', 'delete']) {
    source.addEventListener(name, event => {
      parseEvent(event);
      queueReconcile();
    });
  }
""",
    """  source.addEventListener('sync', event => {
    const payload = parseEvent(event);
    const revision = String(payload?.revision || '');
    if (revision) realtime.lastRevision = revision;
    window.dispatchEvent(new CustomEvent('dni:mail-realtime-sync', {
      detail: { source: 'sse-handshake', event: 'sync', revision, counts: payload?.counts || null }
    }));
  });

  for (const name of ['new-mail', 'thread-update', 'state-update', 'delete']) {
    source.addEventListener(name, event => {
      queueRealtimeDelta(name, parseEvent(event));
    });
  }
"""
)

replace_once(
    'public/src/js/mail/mail.js',
    'function renderMailList() {',
    'function renderMailList({ preserveReader = false } = {}) {'
)
replace_once(
    'public/src/js/mail/mail.js',
    "    renderReaderEmpty('Discord sign-in is required before mail metadata is returned.');",
    "    if (!preserveReader) renderReaderEmpty('Discord sign-in is required before mail metadata is returned.');"
)
replace_once(
    'public/src/js/mail/mail.js',
    "    renderReaderEmpty('DNI Mail secure link unavailable.');",
    "    if (!preserveReader) renderReaderEmpty('DNI Mail secure link unavailable.');"
)
replace_once(
    'public/src/js/mail/mail.js',
    "    renderReaderEmpty(state.activeFilter === 'unread' ? 'No unread messages.' : 'No authorized message selected.');",
    "    if (!preserveReader) renderReaderEmpty(state.activeFilter === 'unread' ? 'No unread messages.' : 'No authorized message selected.');"
)

helper = r'''let realtimeMailboxResyncTimer = 0;

function realtimeMailThreadKey(message) {
  return String(message?.thread_id || message?.threadId || message?.id || '').trim().toUpperCase();
}

function sortRealtimeMailbox(messages) {
  messages.sort((a, b) => {
    const at = Date.parse(String(a?.sent_at || '')) || 0;
    const bt = Date.parse(String(b?.sent_at || '')) || 0;
    if (at !== bt) return bt - at;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
  return messages;
}

function queueRealtimeMailboxResync() {
  window.clearTimeout(realtimeMailboxResyncTimer);
  realtimeMailboxResyncTimer = window.setTimeout(async () => {
    realtimeMailboxResyncTimer = 0;
    if (state.loading) {
      queueRealtimeMailboxResync();
      return;
    }
    await loadMailbox({ quiet: true });
    renderMailList({ preserveReader: true });
  }, 80);
}

function applyRealtimeMailboxDelta(detail = {}) {
  const changes = Array.isArray(detail?.changes) ? detail.changes : [];
  if (!changes.length) return;
  if (!state.authenticated) {
    queueRealtimeMailboxResync();
    return;
  }

  const selectedSummary = state.messages.find(message => String(message?.id || '') === String(state.selectedMessageId || ''));
  const selectedThreadKey = realtimeMailThreadKey(state.selectedMessage) || realtimeMailThreadKey(selectedSummary);
  const byThread = new Map();
  for (const message of state.messages) {
    const key = realtimeMailThreadKey(message);
    if (key) byThread.set(key, message);
  }

  let complete = true;
  for (const change of changes) {
    const eventName = String(change?.event || '');
    const items = Array.isArray(change?.items) ? change.items : [];
    for (const item of items) {
      if (eventName === 'delete') {
        const key = realtimeMailThreadKey(item?.summary || item);
        if (key) byThread.delete(key);
        continue;
      }

      const summary = item?.summary;
      const key = realtimeMailThreadKey(summary);
      if (!summary || !key) {
        complete = false;
        continue;
      }
      byThread.set(key, summary);
    }
  }

  if (!complete) {
    queueRealtimeMailboxResync();
    return;
  }

  state.messages = sortRealtimeMailbox([...byThread.values()]);
  if (selectedThreadKey) {
    const selected = byThread.get(selectedThreadKey);
    if (selected) {
      state.selectedMessageId = String(selected.id || state.selectedMessageId || '');
    } else {
      state.selectedMessageId = null;
      state.selectedMessage = null;
      renderReaderEmpty('This DNI Mail thread is no longer available.');
    }
  }
  renderMailList({ preserveReader: true });
}

'''
p = Path('public/src/js/mail/mail.js')
text = p.read_text()
marker = 'function scanMailUi() {\n'
if text.count(marker) != 1:
    raise SystemExit('mail.js: scanMailUi insertion point mismatch')
p.write_text(text.replace(marker, helper + marker, 1))

replace_once(
    'public/src/js/mail/mail.js',
    """  updateMailStatus();
  void loadMailbox({ quiet: true }).then(() => {""",
    """  updateMailStatus();
  window.addEventListener('dni:mail-realtime-delta', event => applyRealtimeMailboxDelta(event.detail));
  window.addEventListener('dni:mail-realtime-resync', queueRealtimeMailboxResync);
  void loadMailbox({ quiet: true }).then(() => {"""
)

replace_once(
    'public/src/js/mail/mail-threads.js',
    """let inboxQueued = false;
let directoryCache = null;""",
    """let inboxQueued = false;
let realtimeThreadRefreshTimer = 0;
let directoryCache = null;"""
)

thread_helpers = r'''function realtimeThreadKey(message) {
  return String(message?.thread_id || message?.threadId || message?.id || '').trim().toUpperCase();
}

function queueRealtimeThreadRefresh() {
  window.clearTimeout(realtimeThreadRefreshTimer);
  realtimeThreadRefreshTimer = window.setTimeout(async () => {
    realtimeThreadRefreshTimer = 0;
    const target = String(currentThread?.replyToMessageCode || currentThread?.messages?.[0]?.id || '').trim();
    if (!target) return;
    try {
      const payload = await jsonRequest(`${MAIL_ENDPOINT}?action=record&id=${encodeURIComponent(target)}`);
      rememberThread(payload);
    } catch {
      // Core mailbox delta handling owns removal state.
    }
  }, 60);
}

function applyRealtimeThreadDelta(detail = {}) {
  const changes = Array.isArray(detail?.changes) ? detail.changes : [];
  if (!changes.length) return;

  const byThread = new Map();
  for (const message of lastList) {
    const key = realtimeThreadKey(message);
    if (key) byThread.set(key, message);
  }
  const activeThread = String(currentThread?.id || '').trim().toUpperCase();
  let refreshCurrent = false;

  for (const change of changes) {
    const eventName = String(change?.event || '');
    for (const item of Array.isArray(change?.items) ? change.items : []) {
      const key = realtimeThreadKey(item?.summary || item);
      if (!key) continue;
      if (eventName === 'delete') {
        byThread.delete(key);
        continue;
      }
      if (item?.summary) byThread.set(key, item.summary);
      if (eventName === 'thread-update' && activeThread && key === activeThread) refreshCurrent = true;
    }
  }

  lastList = [...byThread.values()];
  queueInboxDecoration();
  if (refreshCurrent) queueRealtimeThreadRefresh();
}

'''
p = Path('public/src/js/mail/mail-threads.js')
text = p.read_text()
marker = 'function installObserver() {\n'
if text.count(marker) != 1:
    raise SystemExit('mail-threads.js: installObserver insertion point mismatch')
text = text.replace(marker, thread_helpers + marker, 1)
old = """installInteractionBridge();
installObserver();"""
new = """installInteractionBridge();
window.addEventListener('dni:mail-realtime-delta', event => applyRealtimeThreadDelta(event.detail));
installObserver();"""
if text.count(old) != 1:
    raise SystemExit('mail-threads.js: startup insertion point mismatch')
p.write_text(text.replace(old, new, 1))

p = Path('tests/mail/verify-mail-realtime.js')
text = p.read_text()
old = """  'queueReconcile',
  'authoritativeMailRefresh',
  'dni:mail-realtime-sync',"""
new = """  'queueReconcile',
  'authoritativeMailRefresh',
  'queueRealtimeDelta',
  'dni:mail-realtime-delta',
  'dni:mail-realtime-resync',
  'dni:mail-realtime-sync',"""
if text.count(old) != 1:
    raise SystemExit('verify realtime marker block mismatch')
text = text.replace(old, new, 1)
old = """if (client.includes('setInterval(')) {
  throw new Error('DNI Mail realtime client must use EventSource, not a browser polling interval.');
}
"""
new = """if (client.includes('setInterval(')) {
  throw new Error('DNI Mail realtime client must use EventSource, not a browser polling interval.');
}
if (client.includes("inbox.dispatchEvent(new MouseEvent('click'")) {
  throw new Error('DNI Mail realtime must not simulate Inbox clicks for SSE reconciliation.');
}
if (client.includes('restoreSelectedMessage(')) {
  throw new Error('DNI Mail realtime must not restore selection by repeatedly clicking mailbox rows.');
}
"""
if text.count(old) != 1:
    raise SystemExit('verify realtime anti-polling block mismatch')
text = text.replace(old, new, 1)
old = """requireMarkers('server/php/dni-mail-realtime.php', [
  'DNI_MAIL_SSE_LOOP_USEC = 250000',"""
new = """requireMarkers('server/php/dni-mail-realtime.php', [
  'DNI_MAIL_SSE_LOOP_USEC = 250000',
  "'summary' => $message","""
if text.count(old) != 1:
    raise SystemExit('verify server realtime marker block mismatch')
text = text.replace(old, new, 1)
anchor = "const priority = requireMarkers('public/src/js/mail-priority-live.js', ["
addition = """const mailCore = requireMarkers('public/src/js/mail/mail.js', [
  'applyRealtimeMailboxDelta',
  'queueRealtimeMailboxResync',
  "window.addEventListener('dni:mail-realtime-delta'",
  'renderMailList({ preserveReader: true })'
]);
if (mailCore.includes("dispatchEvent(new MouseEvent('click'")) {
  throw new Error('Core DNI Mail must not use synthetic Inbox clicks for realtime refresh.');
}

const mailThreads = requireMarkers('public/src/js/mail/mail-threads.js', [
  'applyRealtimeThreadDelta',
  'queueRealtimeThreadRefresh',
  "window.addEventListener('dni:mail-realtime-delta'"
]);

"""
if text.count(anchor) != 1:
    raise SystemExit('verify priority insertion point mismatch')
p.write_text(text.replace(anchor, addition + anchor, 1))
