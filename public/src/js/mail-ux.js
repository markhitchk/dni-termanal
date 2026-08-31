import { openMail } from './mail.js';

const MAIL_URL = '/mail-data.php';
const DEFAULT_LOGIN_URL = '/auth/discord/login';

let checking = false;
let gatePassUntil = 0;

function installMailUxStyles() {
  if (document.querySelector('link[data-dni-mail-ux-style]')) return;
  const source = new URL(import.meta.url);
  const stylesheet = source.pathname.includes('/dist/')
    ? new URL(`./mail-ux.css${source.search}`, source)
    : new URL(`../css/mail-ux.css${source.search}`, source);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = stylesheet.href;
  link.dataset.dniMailUxStyle = 'true';
  document.head.append(link);
}

function bindGateEvents(root) {
  if (root.dataset.dniSharedErrorBound === 'true') return;
  root.dataset.dniSharedErrorBound = 'true';

  root.querySelector('[data-mail-error-ok]')?.addEventListener('click', hideGate);
  root.querySelector('[data-mail-gate-backdrop]')?.addEventListener('click', () => {
    if (root.dataset.mode === 'error') hideGate();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || root.hidden || root.dataset.mode !== 'error') return;
    event.preventDefault();
    hideGate();
  });
}

function ensureGate() {
  let root = document.querySelector('#dni-mail-gate');
  if (root) {
    bindGateEvents(root);
    return root;
  }

  root = document.createElement('div');
  root.id = 'dni-mail-gate';
  root.className = 'dni-mail-gate';
  root.hidden = true;
  root.dataset.mode = 'loading';
  root.innerHTML = `
    <div class="dni-mail-gate-backdrop" data-mail-gate-backdrop></div>

    <section class="dni-mail-loader-card" data-mail-loader role="status" aria-live="polite" aria-atomic="true">
      <div class="dni-mail-loader-kicker">DNI SECURE MESSAGE NETWORK</div>
      <div class="dni-mail-loader-symbol" aria-hidden="true">
        <span class="dni-mail-loader-ring"></span>
        <span class="dni-mail-loader-diamond"></span>
        <span class="dni-mail-loader-core"></span>
      </div>
      <strong data-mail-loader-title>ESTABLISHING SECURE MAIL LINK</strong>
      <span class="dni-mail-loader-stage" data-mail-loader-stage>VERIFYING DNI SESSION</span>
      <div class="dni-mail-loader-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    </section>

    <section class="dni-mail-error-dialog" data-mail-error role="alertdialog" aria-modal="true" aria-labelledby="dni-mail-error-title" aria-describedby="dni-mail-error-copy">
      <div class="dni-mail-error-caption"><span>ERROR</span></div>
      <div class="dni-mail-error-banner">
        <span class="dni-mail-error-icon" aria-hidden="true"><i>!</i></span>
        <strong id="dni-mail-error-title" data-mail-error-title>DNI MAIL LOCKED</strong>
      </div>
      <div class="dni-mail-error-body">
        <p id="dni-mail-error-copy" data-mail-error-copy>DNI Mail is unavailable.</p>
      </div>
      <div class="dni-mail-error-actions">
        <a class="dni-mail-error-login" data-mail-error-login data-dni-discord-login-direct href="${DEFAULT_LOGIN_URL}">LOGIN WITH DISCORD</a>
        <button class="dni-mail-error-ok" data-mail-error-ok type="button">CANCEL</button>
      </div>
    </section>`;

  document.body.append(root);
  bindGateEvents(root);
  return root;
}

function showGate(mode, trigger = null) {
  const root = ensureGate();
  if (root.hidden) {
    root.__dniRestoreFocus = trigger instanceof HTMLElement
      ? trigger
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }
  root.dataset.mode = mode;
  root.hidden = false;
  document.documentElement.classList.add('dni-mail-gate-open');
  return root;
}

function hideGate() {
  const root = ensureGate();
  root.hidden = true;
  document.documentElement.classList.remove('dni-mail-gate-open');
  const target = root.__dniRestoreFocus;
  root.__dniRestoreFocus = null;
  if (target instanceof HTMLElement && target.isConnected) {
    target.focus({ preventScroll: true });
  }
}

function showLoading(trigger = null) {
  const root = showGate('loading', trigger);
  const title = root.querySelector('[data-mail-loader-title]');
  const stage = root.querySelector('[data-mail-loader-stage]');
  if (title) title.textContent = 'ESTABLISHING SECURE MAIL LINK';
  if (stage) stage.textContent = 'VERIFYING DNI SESSION';
}

function setLoadingStage(text) {
  const root = ensureGate();
  if (root.hidden || root.dataset.mode !== 'loading') return;
  const stage = root.querySelector('[data-mail-loader-stage]');
  if (stage) stage.textContent = String(text || 'VERIFYING DNI SESSION');
}

function showErrorDialog({
  title = 'DNI MAIL LOCKED',
  message = 'DNI Mail is unavailable.',
  loginUrl = '',
  trigger = null
} = {}) {
  const root = showGate('error', trigger);
  const titleNode = root.querySelector('[data-mail-error-title]');
  const copy = root.querySelector('[data-mail-error-copy]');
  const login = root.querySelector('[data-mail-error-login]');
  const cancel = root.querySelector('[data-mail-error-ok]');
  const needsLogin = Boolean(loginUrl);

  if (titleNode) titleNode.textContent = String(title);
  if (copy) copy.textContent = String(message);
  if (login) {
    login.href = String(loginUrl || DEFAULT_LOGIN_URL);
    login.hidden = !needsLogin;
    login.textContent = 'LOGIN WITH DISCORD';
  }
  if (cancel) cancel.textContent = needsLogin ? 'CANCEL' : 'OK';

  requestAnimationFrame(() => {
    const focusTarget = needsLogin ? login : cancel;
    focusTarget?.focus({ preventScroll: true });
  });
}

function showAuthenticationError(loginUrl = DEFAULT_LOGIN_URL, trigger = null) {
  showErrorDialog({
    title: 'DNI MAIL LOCKED',
    message: 'Discord authentication is required to access DNI Mail.',
    loginUrl: String(loginUrl || DEFAULT_LOGIN_URL),
    trigger
  });
}

function showMailLinkError(message, trigger = null) {
  showErrorDialog({
    title: 'DNI MAIL LINK ERROR',
    message: String(message || 'The secure inbox link could not be established. Please try again.'),
    trigger
  });
}

async function verifyMailAccess() {
  const response = await fetch(`${MAIL_URL}?action=list&filter=all`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    return { authenticated: false, loginUrl: payload.loginUrl || DEFAULT_LOGIN_URL };
  }
  if (!response.ok) {
    throw new Error(payload.error || `DNI Mail HTTP ${response.status}`);
  }
  return { authenticated: true };
}

async function launchMail(filter = 'all', trigger = null) {
  if (checking) return;
  checking = true;
  showLoading(trigger);

  const slowStage = window.setTimeout(() => {
    setLoadingStage('NEGOTIATING CLEARANCE-CONTROLLED CHANNEL');
  }, 450);
  const slowerStage = window.setTimeout(() => {
    setLoadingStage('WAITING FOR DNI MAIL AUTHORIZATION');
  }, 1400);

  try {
    const result = await verifyMailAccess();
    if (!result.authenticated) {
      showAuthenticationError(result.loginUrl, trigger);
      return;
    }

    setLoadingStage('AUTHORIZATION CONFIRMED // OPENING INBOX');
    gatePassUntil = Date.now() + 2500;
    hideGate();
    openMail(filter);
  } catch (error) {
    showMailLinkError(error?.message || error || 'The secure inbox link could not be established.', trigger);
  } finally {
    window.clearTimeout(slowStage);
    window.clearTimeout(slowerStage);
    checking = false;
  }
}

function restoreTerminalBehindGate() {
  const mailPanel = document.querySelector('#dni-mail-panel');
  if (mailPanel) mailPanel.style.display = 'none';
  const shell = document.querySelector('.terminal-shell');
  if (shell) shell.dataset.panel = 'terminal';
  const terminalTab = document.querySelector('#tab-terminal');
  if (terminalTab instanceof HTMLElement) terminalTab.click();
}

installMailUxStyles();
ensureGate();
window.DNIMailUx = Object.freeze({
  showError: showErrorDialog,
  hide: hideGate
});

// Capture the Inbox button before the normal mail click handler. The loader is
// tied to the actual server authorization request instead of a fake timer.
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('#terminal-inbox') : null;
  if (!target) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void launchMail('all', target);
}, true);

// Terminal commands such as `mail` and `inbox` call openMail() directly. If a
// guest uses those commands, restore the Terminal underneath and run the same
// real authorization gate/error dialog.
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel !== 'mail') return;
  if (Date.now() < gatePassUntil) return;
  if (document.documentElement.dataset.dniAuth === 'authenticated') return;

  queueMicrotask(() => {
    restoreTerminalBehindGate();
    if (!checking) void launchMail('all', document.querySelector('#command-input'));
  });
});
