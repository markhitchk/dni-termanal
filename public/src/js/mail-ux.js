import './mail-address-client.js?v=20260831-mail2';
import './mail-upload-button.js?v=20260831-mail2';
import { openMail } from './mail.js?v=20260831-mail2';

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

function bindFallbackGateEvents(root) {
  if (root.dataset.dniMailFallbackBound === 'true') return;
  root.dataset.dniMailFallbackBound = 'true';
  root.addEventListener('click', event => {
    const close = event.target instanceof Element ? event.target.closest('[data-mail-error-ok]') : null;
    if (!close || !root.contains(close)) return;
    event.preventDefault();
    hideGate();
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
    bindFallbackGateEvents(root);
    return root;
  }

  root = document.createElement('div');
  root.id = 'dni-mail-gate';
  root.className = 'dni-mail-gate dni-alert';
  root.hidden = true;
  root.dataset.mode = 'loading';
  root.innerHTML = `
    <div class="dni-mail-gate-backdrop dni-alert-backdrop" data-mail-gate-backdrop aria-hidden="true"></div>

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

    <section class="dni-mail-error-dialog dni-alert-dialog" data-mail-error data-type="error" role="alertdialog" aria-modal="true" aria-labelledby="dni-mail-error-title" aria-describedby="dni-mail-error-copy">
      <header class="dni-alert-hazard"><span class="dni-alert-classification" data-dni-alert-label data-label="ERROR">ERROR</span></header>
      <div class="dni-mail-error-banner dni-alert-titleband">
        <span class="dni-alert-band-scan" aria-hidden="true"></span>
        <span class="dni-mail-error-icon dni-alert-icon" aria-hidden="true"><i data-dni-alert-icon>!</i></span>
        <h2 class="dni-alert-title" id="dni-mail-error-title" data-mail-error-title>DNI MAIL LOCKED</h2>
        <span class="dni-alert-corner dni-alert-corner-a" aria-hidden="true"></span>
        <span class="dni-alert-corner dni-alert-corner-b" aria-hidden="true"></span>
      </div>
      <div class="dni-mail-error-body dni-alert-body">
        <span class="dni-alert-body-scan" aria-hidden="true"></span>
        <p class="dni-alert-copy" id="dni-mail-error-copy" data-mail-error-copy>DNI Mail is unavailable.</p>
        <div class="dni-alert-meta" data-dni-alert-meta>DNI MAIL // ACCESS ERROR</div>
      </div>
      <footer class="dni-mail-error-actions dni-alert-actions">
        <a class="dni-mail-error-login dni-alert-btn primary" data-mail-error-login data-dni-discord-login-direct href="${DEFAULT_LOGIN_URL}" hidden>LOGIN WITH DISCORD</a>
        <button class="dni-mail-error-ok dni-alert-btn" data-mail-error-ok type="button">CANCEL</button>
      </footer>
    </section>`;

  document.body.append(root);
  bindFallbackGateEvents(root);
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
  document.documentElement.style.overflow = '';
  const target = root.__dniRestoreFocus;
  root.__dniRestoreFocus = null;
  if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
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
  const needsLogin = Boolean(loginUrl);
  if (window.DNIAlerts?.show) {
    window.DNIAlerts.show({
      type: 'error',
      title: String(title),
      message: String(message),
      meta: needsLogin
        ? 'DNI AUTHORIZATION GATE // USER ACTION REQUIRED'
        : 'DNI MAIL // SECURE LINK ERROR',
      login: needsLogin,
      loginUrl: String(loginUrl || DEFAULT_LOGIN_URL),
      trigger,
      buttonText: needsLogin ? 'CANCEL' : 'OK'
    });
    return;
  }

  const root = showGate('error', trigger);
  const dialog = root.querySelector('[data-mail-error]');
  const label = root.querySelector('[data-dni-alert-label]');
  const titleNode = root.querySelector('[data-mail-error-title]');
  const copy = root.querySelector('[data-mail-error-copy]');
  const meta = root.querySelector('[data-dni-alert-meta]');
  const login = root.querySelector('[data-mail-error-login]');
  const cancel = root.querySelector('[data-mail-error-ok]');
  if (dialog) dialog.dataset.type = 'error';
  if (label) { label.textContent = 'ERROR'; label.dataset.label = 'ERROR'; }
  if (titleNode) titleNode.textContent = String(title);
  if (copy) copy.textContent = String(message);
  if (meta) meta.textContent = needsLogin ? 'DNI AUTHORIZATION GATE // USER ACTION REQUIRED' : 'DNI MAIL // SECURE LINK ERROR';
  if (login) {
    login.href = String(loginUrl || DEFAULT_LOGIN_URL);
    login.hidden = !needsLogin;
    login.textContent = 'LOGIN WITH DISCORD';
  }
  if (cancel) cancel.textContent = needsLogin ? 'CANCEL' : 'OK';
  requestAnimationFrame(() => (needsLogin ? login : cancel)?.focus({ preventScroll: true }));
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
  if (response.status === 401) return { authenticated: false, loginUrl: payload.loginUrl || DEFAULT_LOGIN_URL };
  if (!response.ok) throw new Error(payload.error || `DNI Mail HTTP ${response.status}`);
  return { authenticated: true };
}

async function launchMail(filter = 'all', trigger = null) {
  if (checking) return;
  checking = true;
  showLoading(trigger);

  const slowStage = window.setTimeout(() => setLoadingStage('NEGOTIATING CLEARANCE-CONTROLLED CHANNEL'), 450);
  const slowerStage = window.setTimeout(() => setLoadingStage('WAITING FOR DNI MAIL AUTHORIZATION'), 1400);

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
window.DNIMailUx = Object.freeze({ showError: showErrorDialog, hide: hideGate });

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('#terminal-inbox') : null;
  if (!target) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void launchMail('all', target);
}, true);

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel !== 'mail') return;
  if (Date.now() < gatePassUntil) return;
  if (document.documentElement.dataset.dniAuth === 'authenticated') return;
  queueMicrotask(() => {
    restoreTerminalBehindGate();
    if (!checking) void launchMail('all', document.querySelector('#command-input'));
  });
});