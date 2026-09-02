const MAIL_API = '/mail-data.php';

let cachedSession = null;
let scanQueued = false;
let keepMailUntil = 0;

function installStyles() {
  if (document.querySelector('style[data-dni-mail-actions-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailActionsStyle = 'true';
  style.textContent = `
    .dni-mail-reader-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 0;padding-top:12px;border-top:1px solid #292929}
    .dni-mail-reader-actions button{min-height:36px;padding:8px 13px;border:1px solid #575757;background:#111;color:#d7d7d7;font:700 10px/1 "Courier New",monospace;letter-spacing:.65px;cursor:pointer}
    .dni-mail-reader-actions button:hover:not(:disabled){border-color:#c8a866;color:#fff;background:#17140d}
    .dni-mail-reader-actions button:disabled{opacity:.45;cursor:not-allowed}
    .dni-mail-reader-actions .dni-mail-reply-action{border-color:rgba(200,168,102,.58);color:#e2c98f}
    .dni-mail-reader-actions .dni-mail-delete-action{border-color:rgba(212,78,83,.6);color:#e98589}
    .dni-mail-reader-actions .dni-mail-delete-action[data-confirm="true"]{background:#431416;border-color:#e45d62;color:#fff}
    .dni-mail-reader-action-status{flex:1 1 220px;min-width:180px;color:#888;font:700 9px/1.4 "Courier New",monospace;letter-spacing:.3px}
    .dni-mail-reader-action-status.is-error{color:#e45d62}
    .dni-mail-reader-action-status.is-success{color:#c8a866}
    @media(max-width:700px){.dni-mail-reader-actions button{flex:1 1 120px}.dni-mail-reader-action-status{flex-basis:100%;min-width:0}}
  `;
  document.head.append(style);
}

function keepMailContext() {
  const shell = document.querySelector('.terminal-shell');
  const panel = document.querySelector('#dni-mail-panel');

  if (shell instanceof HTMLElement) shell.dataset.panel = 'mail';
  if (panel instanceof HTMLElement) panel.style.display = 'block';

  for (const tab of document.querySelectorAll('.nav-tab')) {
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
  }

  const normalized = String(window.location.pathname || '/').replace(/\/+$/, '') || '/';
  if (normalized !== '/mail') {
    history.replaceState(
      { ...(history.state || {}), panel: 'mail' },
      '',
      `/mail${window.location.search || ''}${window.location.hash || ''}`
    );
  }
}

function holdMailContext(durationMs = 1800) {
  keepMailUntil = Math.max(keepMailUntil, Date.now() + durationMs);
  keepMailContext();
}

function refreshMailInPlace() {
  holdMailContext(2500);
  const inbox = document.querySelector('#terminal-inbox');
  if (inbox instanceof HTMLElement) {
    inbox.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    return;
  }

  window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel: 'mail' } }));
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI Mail HTTP ${response.status}`);
  return payload;
}

async function getMailSession(force = false) {
  if (!force && cachedSession?.csrfToken) return cachedSession;
  const session = await jsonRequest(`${MAIL_API}?action=session`);
  if (session.authenticated !== true || !session.csrfToken) {
    throw new Error('DNI Mail authentication is unavailable.');
  }
  cachedSession = session;
  return session;
}

function setStatus(target, text, state = '') {
  if (!target) return;
  target.className = 'dni-mail-reader-action-status';
  if (state) target.classList.add(`is-${state}`);
  target.textContent = text;
}

function readerMetadata(reader) {
  const metaValues = [...reader.querySelectorAll('.dni-mail-reader-meta span')]
    .map(node => String(node.textContent || '').trim())
    .filter(Boolean);
  const messageId = metaValues.find(value => /^MAIL-\d+$/i.test(value)) || '';
  const clearance = metaValues.find(value => /^CL(?:\/NON|\d|A\/DIS)/i.test(value)) || '';
  return {
    messageId,
    subject: String(reader.querySelector('.dni-mail-reader-subject')?.textContent || '').trim(),
    fromAddress: String(reader.querySelector('.dni-mail-sender-address')?.textContent || '').trim().toLowerCase(),
    clearanceCode: clearance.split(/\s|—/, 1)[0] || ''
  };
}

function waitFor(check, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const value = check();
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error('DNI Mail composer did not become ready.'));
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

async function startReply(meta, status) {
  holdMailContext(3000);
  setStatus(status, 'PREPARING SECURE REPLY…');
  const session = await getMailSession();
  const permissions = Array.isArray(session.permissions) ? session.permissions.map(String) : [];
  if (!permissions.includes('admin') && !permissions.includes('mail.send')) {
    throw new Error('Your DNI account does not have mail.send permission.');
  }
  if (!meta.fromAddress) throw new Error('This network message does not have a reply address.');

  const launch = document.querySelector('[data-mail-compose-launch]');
  if (!(launch instanceof HTMLButtonElement)) throw new Error('DNI Mail composer is unavailable.');
  keepMailContext();
  launch.click();
  holdMailContext(3000);

  const compose = await waitFor(() => {
    const shell = document.querySelector('[data-mail-compose-shell]');
    const form = document.querySelector('[data-mail-compose]');
    const recipients = form?.querySelector('[data-mail-recipients]');
    return shell instanceof HTMLElement && !shell.hidden && form instanceof HTMLFormElement && recipients?.options?.length
      ? { shell, form, recipients }
      : null;
  });

  const { shell, form, recipients } = compose;
  const target = [...recipients.options].find(option =>
    String(option.textContent || '').toLowerCase().includes(meta.fromAddress)
  );
  if (!target) throw new Error(`Reply recipient ${meta.fromAddress} is not available in the DNI directory.`);

  for (const option of recipients.options) option.selected = option === target;
  recipients.dispatchEvent(new Event('change', { bubbles: true }));

  const type = form.querySelector('[data-mail-type]');
  if (type instanceof HTMLSelectElement) {
    type.value = 'message';
    type.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const subject = form.elements.namedItem('subject');
  if (subject instanceof HTMLInputElement) {
    const original = meta.subject || meta.messageId || 'DNI Mail';
    subject.value = /^re:/i.test(original) ? original : `Re: ${original}`;
  }

  const classification = form.querySelector('[data-mail-classification]');
  if (classification instanceof HTMLSelectElement && meta.clearanceCode) {
    const option = [...classification.options].find(item =>
      String(item.textContent || '').trim().toUpperCase().startsWith(meta.clearanceCode.toUpperCase())
    );
    if (option) classification.value = option.value;
    classification.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const body = form.elements.namedItem('body');
  if (body instanceof HTMLTextAreaElement) {
    body.value = '';
    body.placeholder = `Reply to ${meta.messageId || meta.fromAddress}`;
    body.focus({ preventScroll: true });
  }

  keepMailContext();
  shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setStatus(status, `REPLY READY // TO ${meta.fromAddress}`, 'success');
}

async function deleteMail(meta, status, button) {
  holdMailContext(3000);
  if (!meta.messageId) throw new Error('DNI Mail message ID is unavailable.');

  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = 'CONFIRM DELETE';
    setStatus(status, 'DELETE HIDES THIS MESSAGE FROM YOUR MAILBOX ONLY. PRESS CONFIRM DELETE.', 'error');
    window.setTimeout(() => {
      if (button.isConnected && button.dataset.confirm === 'true') {
        button.dataset.confirm = 'false';
        button.textContent = 'DELETE';
        setStatus(status, '');
      }
    }, 5000);
    return;
  }

  button.disabled = true;
  setStatus(status, `DELETING ${meta.messageId}…`);
  const session = await getMailSession(true);
  const result = await jsonRequest(`${MAIL_API}?action=delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DNI-CSRF': String(session.csrfToken)
    },
    body: JSON.stringify({ id: meta.messageId })
  });
  if (result?.deleted?.deleted !== true) throw new Error('DNI Mail delete did not complete.');

  setStatus(status, `${meta.messageId} DELETED FROM YOUR MAILBOX`, 'success');
  refreshMailInPlace();
}

function installReaderActions(reader) {
  if (!(reader instanceof HTMLElement)) return;
  if (!reader.classList.contains('dni-mail-reader')) return;
  if (reader.querySelector('[data-mail-message-actions]')) return;

  const meta = readerMetadata(reader);
  if (!meta.messageId) return;

  const actions = document.createElement('div');
  actions.className = 'dni-mail-reader-actions';
  actions.dataset.mailMessageActions = 'true';

  const reply = document.createElement('button');
  reply.type = 'button';
  reply.className = 'dni-mail-reply-action';
  reply.textContent = 'REPLY';
  reply.disabled = !meta.fromAddress;
  if (!meta.fromAddress) reply.title = 'This system/network message has no reply address.';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'dni-mail-delete-action';
  remove.textContent = 'DELETE';
  remove.dataset.confirm = 'false';

  const status = document.createElement('span');
  status.className = 'dni-mail-reader-action-status';
  status.setAttribute('aria-live', 'polite');

  reply.addEventListener('click', async () => {
    holdMailContext(3000);
    reply.disabled = true;
    try {
      await startReply(meta, status);
    } catch (error) {
      setStatus(status, String(error?.message || error || 'Unable to prepare reply.'), 'error');
    } finally {
      keepMailContext();
      if (reply.isConnected && meta.fromAddress) reply.disabled = false;
    }
  });

  remove.addEventListener('click', async () => {
    holdMailContext(3000);
    try {
      await deleteMail(meta, status, remove);
    } catch (error) {
      remove.disabled = false;
      remove.dataset.confirm = 'false';
      remove.textContent = 'DELETE';
      setStatus(status, String(error?.message || error || 'Unable to delete DNI Mail.'), 'error');
    } finally {
      keepMailContext();
    }
  });

  actions.append(reply, remove, status);
  const security = reader.querySelector('.dni-mail-reader-security');
  if (security) reader.insertBefore(actions, security);
  else reader.append(actions);
}

function scanReader() {
  scanQueued = false;
  installReaderActions(document.querySelector('#dni-mail-reader'));
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  queueMicrotask(scanReader);
}

installStyles();
queueScan();

const observer = new MutationObserver(queueScan);
observer.observe(document.body, { childList: true, subtree: true });

const shell = document.querySelector('.terminal-shell');
if (shell instanceof HTMLElement) {
  const mailContextObserver = new MutationObserver(() => {
    if (Date.now() >= keepMailUntil) return;
    if (shell.dataset.panel !== 'mail') keepMailContext();
  });
  mailContextObserver.observe(shell, { attributes: true, attributeFilter: ['data-panel'] });
}

document.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches('[data-mail-compose]')) return;
  holdMailContext(3000);
  for (const delay of [0, 100, 350, 900, 1800]) {
    window.setTimeout(() => {
      if (Date.now() < keepMailUntil) keepMailContext();
    }, delay);
  }
}, true);

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'mail') queueScan();
});
