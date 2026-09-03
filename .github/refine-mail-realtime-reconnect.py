from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    p.write_text(text.replace(old, new, 1))

replace_once(
    'public/src/js/mail/mail-realtime.js',
    """  source.onopen = () => {
    realtime.reconnecting = false;
    setLiveStatus('LIVE MAIL LINK');
    queueReconcile();
  };""",
    """  source.onopen = () => {
    realtime.reconnecting = false;
    setLiveStatus('LIVE MAIL LINK');
  };"""
)

replace_once(
    'public/src/js/mail/mail-realtime.js',
    """  source.addEventListener('sync', event => {
    const payload = parseEvent(event);
    const revision = String(payload?.revision || '');
    if (revision) realtime.lastRevision = revision;
    window.dispatchEvent(new CustomEvent('dni:mail-realtime-sync', {
      detail: { source: 'sse-handshake', event: 'sync', revision, counts: payload?.counts || null }
    }));
  });""",
    """  source.addEventListener('sync', event => {
    const payload = parseEvent(event);
    const revision = String(payload?.revision || '');
    const previousRevision = realtime.lastRevision;
    if (revision && previousRevision && revision !== previousRevision) queueReconcile();
    if (revision) realtime.lastRevision = revision;
    window.dispatchEvent(new CustomEvent('dni:mail-realtime-sync', {
      detail: { source: 'sse-handshake', event: 'sync', revision, counts: payload?.counts || null }
    }));
  });"""
)

replace_once(
    'public/src/js/mail/mail-realtime.js',
    """    syncRealtimeConnection();
    queueReconcile();
    window.setTimeout(() => void syncAuthoritativeDirectory(), 0);""",
    """    syncRealtimeConnection();
    window.setTimeout(() => void syncAuthoritativeDirectory(), 0);"""
)

replace_once(
    'public/src/js/mail/mail-realtime.js',
    """    syncRealtimeConnection();
    queueReconcile();
  });

  window.addEventListener('focus', () => {
    syncRealtimeConnection();
    queueReconcile();
  });""",
    """    syncRealtimeConnection();
  });

  window.addEventListener('focus', () => {
    syncRealtimeConnection();
  });"""
)

p = Path('tests/mail/verify-mail-realtime.js')
text = p.read_text()
anchor = """if (client.includes('restoreSelectedMessage(')) {
  throw new Error('DNI Mail realtime must not restore selection by repeatedly clicking mailbox rows.');
}
"""
addition = """const onopenBody = client.match(/source\\.onopen\\s*=\\s*\\(\\)\\s*=>\\s*\\{([^}]*)\\};/)?.[1] || '';
if (onopenBody.includes('queueReconcile(')) {
  throw new Error('DNI Mail realtime must not full-resync on every EventSource reconnect.');
}
"""
if text.count(anchor) != 1:
    raise SystemExit('Realtime test reconnect insertion point mismatch')
p.write_text(text.replace(anchor, anchor + addition, 1))
