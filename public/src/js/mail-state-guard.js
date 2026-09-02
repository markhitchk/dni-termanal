const MAIL_SESSION_URL = '/mail-data.php?action=session';

const probe = {
  status: 'idle',
  permissions: [],
  databaseMode: '',
  error: '',
  rendering: false
};

function mailPanelActive() {
  const shell = document.querySelector('.terminal-shell');
  const path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
  return shell?.dataset?.panel === 'mail' || path === '/mail';
}

function canSend(permissions = probe.permissions) {
  const values = Array.isArray(permissions) ? permissions.map(String) : [];
  return values.includes('admin')
    || values.includes('mail.send')
    || values.includes('mail.announce')
    || values.includes('mail.service_announce');
}

function modeElement() {
  return document.querySelector('[data-mail-mode]');
}

function setMode(html) {
  const mode = modeElement();
  if (!mode || mode.innerHTML === html) return;
  probe.rendering = true;
  mode.innerHTML = html;
  probe.rendering = false;
}

function renderAuthorizationState() {
  if (!mailPanelActive()) return;

  if (probe.status === 'checking') {
    setMode('MAIL AUTHORIZATION CHECK<br>Verifying database permissions…');
    return;
  }

  if (probe.status === 'signed-out') {
    setMode('DNI MAIL LOCKED<br>Discord sign-in required.');
    return;
  }

  if (probe.status === 'error') {
    setMode('MAIL AUTHORIZATION UNAVAILABLE<br>Permission check failed. Reload DNI Mail.');
    return;
  }

  if (probe.status !== 'ready') return;

  setMode(canSend()
    ? 'SECURE SEND ENABLED<br>200 MB CDN uploads available.'
    : 'READ-ONLY MAILBOX<br>Send permission is not present on this account.');
}

async function checkMailAuthorization() {
  if (!mailPanelActive()) return;
  probe.status = 'checking';
  probe.error = '';
  renderAuthorizationState();

  try {
    const response = await fetch(MAIL_SESSION_URL, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      probe.status = 'signed-out';
      probe.permissions = [];
      probe.databaseMode = '';
      renderAuthorizationState();
      return;
    }

    if (!response.ok) {
      throw new Error(payload.error || `DNI Mail authorization HTTP ${response.status}`);
    }

    probe.permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
    probe.databaseMode = String(payload.databaseMode || '');
    probe.status = 'ready';
    renderAuthorizationState();

    window.dispatchEvent(new CustomEvent('dni:mail-authorization', {
      detail: {
        status: probe.status,
        databaseMode: probe.databaseMode,
        canSend: canSend(),
        permissions: [...probe.permissions]
      }
    }));
  } catch (error) {
    probe.status = 'error';
    probe.permissions = [];
    probe.databaseMode = '';
    probe.error = String(error?.message || error || 'DNI Mail authorization unavailable.');
    renderAuthorizationState();
    console.error('DNI Mail authorization check failed', error);
  }
}

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel !== 'mail') return;
  queueMicrotask(() => void checkMailAuthorization());
});

window.addEventListener('dni:authz', event => {
  if (!mailPanelActive()) return;
  if (event.detail?.authenticated === false) {
    probe.status = 'signed-out';
    probe.permissions = [];
    renderAuthorizationState();
    return;
  }
  queueMicrotask(() => void checkMailAuthorization());
});

const observer = new MutationObserver(mutations => {
  if (probe.rendering || !mailPanelActive() || probe.status === 'idle' || probe.status === 'ready') return;
  for (const mutation of mutations) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target?.closest?.('[data-mail-mode]')) {
      queueMicrotask(renderAuthorizationState);
      break;
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

if (mailPanelActive()) {
  queueMicrotask(() => void checkMailAuthorization());
}
