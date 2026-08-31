const ADMIN_AUTH_CONFIG = Object.freeze({
  // Keep empty until final role names/IDs are approved. The server remains authoritative.
  authorizedRoles: Object.freeze([])
});

const MEMBER_ONLY_PATHS = new Set([
  '/dashboard',
  '/documents',
  '/services',
  '/communication',
  '/sectors'
]);

const ADMIN_SECTORS_RUNTIME_RECOVERY_KEY = 'dni-admin-sectors-runtime-repair-v2';
const DEFAULT_LOGIN_URL = '/auth/discord/login';

const authState = {
  loaded: false,
  authenticated: false,
  authorized: false,
  status: null
};

let loginPromptRestoreFocus = null;

function strings(values) {
  return Array.isArray(values) ? values.map(value => String(value)) : [];
}

export function isAdminAuthorized(user, status = null) {
  if (status?.admin === true) return true;

  const permissions = strings(status?.permissions || user?.permissions);
  if (permissions.includes('admin')) return true;

  const claims = user?.customClaims || user?.claims || {};
  if (claims.admin === true || claims.isAdmin === true) return true;

  const roles = [
    ...strings(user?.roles),
    ...strings(claims.roles),
    ...(user?.role ? [String(user.role)] : []),
    ...(claims.role ? [String(claims.role)] : [])
  ];

  return ADMIN_AUTH_CONFIG.authorizedRoles.some(role => roles.includes(String(role)));
}

function currentPath() {
  return String(window.location.pathname || '').replace(/\/+$/, '') || '/';
}

function installGuestTabSuppression() {
  const style = document.createElement('style');
  style.id = 'dni-guest-tab-suppression';
  style.textContent = 'html:not([data-dni-auth="authenticated"]) .nav-tab:not([data-panel="terminal"]){display:none!important}';
  document.head.append(style);
}

function syncGuestNavigationState() {
  document.documentElement.dataset.dniAuth = authState.loaded
    ? (authState.authenticated ? 'authenticated' : 'guest')
    : 'pending';
}

function installLoginPromptStyles() {
  if (document.querySelector('link[data-dni-login-prompt-style]')) return;
  const source = new URL(import.meta.url);
  const stylesheet = source.pathname.includes('/dist/')
    ? new URL(`./mail-ux.css${source.search}`, source)
    : new URL(`../css/mail-ux.css${source.search}`, source);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = stylesheet.href;
  link.dataset.dniLoginPromptStyle = 'true';
  document.head.append(link);
}

function ensureLoginPrompt() {
  let root = document.querySelector('#dni-login-confirmation');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'dni-login-confirmation';
  root.className = 'dni-mail-gate';
  root.dataset.mode = 'error';
  root.hidden = true;
  root.innerHTML = `
    <div class="dni-mail-gate-backdrop" data-dni-login-backdrop></div>
    <section class="dni-mail-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dni-login-title" aria-describedby="dni-login-copy">
      <div class="dni-mail-error-caption"><span>ERROR</span></div>
      <div class="dni-mail-error-banner">
        <span class="dni-mail-error-icon" aria-hidden="true"><i>!</i></span>
        <strong id="dni-login-title">AUTHENTICATION REQUIRED</strong>
      </div>
      <div class="dni-mail-error-body">
        <p id="dni-login-copy" data-dni-login-copy>Would you like to login with Discord?</p>
      </div>
      <div class="dni-mail-error-actions">
        <a class="dni-mail-error-login" data-dni-login-confirm data-dni-discord-login-direct href="${DEFAULT_LOGIN_URL}">LOGIN WITH DISCORD</a>
        <button class="dni-mail-error-ok" data-dni-login-cancel type="button">CANCEL</button>
      </div>
    </section>`;

  document.body.append(root);
  root.querySelector('[data-dni-login-cancel]')?.addEventListener('click', hideDiscordLoginPrompt);
  root.querySelector('[data-dni-login-backdrop]')?.addEventListener('click', hideDiscordLoginPrompt);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !root.hidden) hideDiscordLoginPrompt();
  });
  return root;
}

function hideDiscordLoginPrompt() {
  const root = document.querySelector('#dni-login-confirmation');
  if (!root) return;
  root.hidden = true;
  document.documentElement.classList.remove('dni-mail-gate-open');
  if (loginPromptRestoreFocus?.isConnected) loginPromptRestoreFocus.focus({ preventScroll: true });
  loginPromptRestoreFocus = null;
}

export function showDiscordLoginPrompt(loginUrl = DEFAULT_LOGIN_URL, message = 'Would you like to login with Discord?') {
  installLoginPromptStyles();
  const root = ensureLoginPrompt();
  if (root.hidden) loginPromptRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const copy = root.querySelector('[data-dni-login-copy]');
  const login = root.querySelector('[data-dni-login-confirm]');
  if (copy) copy.textContent = String(message || 'Would you like to login with Discord?');
  if (login) login.href = String(loginUrl || DEFAULT_LOGIN_URL);
  root.hidden = false;
  document.documentElement.classList.add('dni-mail-gate-open');
  requestAnimationFrame(() => root.querySelector('[data-dni-login-confirm]')?.focus({ preventScroll: true }));
}

function installDiscordLoginInterception() {
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('a[href*="/auth/discord/login"], [data-dni-login]');
    if (!link || link.hasAttribute('data-dni-discord-login-direct')) return;
    if (authState.authenticated) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const loginUrl = link instanceof HTMLAnchorElement ? link.href : DEFAULT_LOGIN_URL;
    showDiscordLoginPrompt(loginUrl);
  }, true);
}

function appendTerminalRow(text, className = '') {
  const output = document.querySelector('#terminal-output');
  if (!output) return;
  const line = document.createElement('div');
  line.textContent = text;
  if (className) line.className = className;
  output.append(line);
  const terminalWindow = document.querySelector('#terminal-window');
  if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
}

function echoTerminalCommand(value) {
  const output = document.querySelector('#terminal-output');
  if (!output) return;
  const line = document.createElement('div');
  const user = document.createElement('span');
  user.className = 'prompt-admin';
  user.textContent = document.querySelector('.terminal-prompt .prompt-admin')?.textContent || 'guest';
  const host = document.createElement('span');
  host.className = 'prompt-host';
  host.textContent = document.querySelector('.terminal-prompt .prompt-host')?.textContent || 'dni';
  line.append(user, document.createTextNode('@'), host, document.createTextNode(`:~$ ${value}`));
  output.append(line);
}

function installGuestLoginCommand() {
  document.addEventListener('keydown', event => {
    const input = document.querySelector('#command-input');
    if (!input || event.target !== input) return;

    const command = String(input.value || '').trim().toLowerCase();

    if (event.key === 'Tab' && !authState.authenticated && command && 'login'.startsWith(command)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = 'login';
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    if (event.key !== 'Enter') return;

    if (command === 'help' && !authState.authenticated) {
      queueMicrotask(() => appendTerminalRow('LOGIN               Sign in with Discord', 'muted'));
      return;
    }

    if (command !== 'login') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    echoTerminalCommand('login');

    if (authState.authenticated) {
      appendTerminalRow('DNI SESSION ALREADY AUTHENTICATED', 'muted');
      return;
    }

    appendTerminalRow('AUTHENTICATION REQUIRED // USER CONFIRMATION REQUESTED', 'muted');
    showDiscordLoginPrompt(DEFAULT_LOGIN_URL);
  }, true);
}

function installGuestPanelGuard() {
  window.addEventListener('dni:panel', event => {
    const panel = String(event.detail?.panel || 'terminal');
    if (panel === 'terminal' || authState.authenticated) return;
    event.stopImmediatePropagation();
    queueMicrotask(() => document.querySelector('#tab-terminal')?.click());
  });
}

function enforceGuestRoute() {
  const path = currentPath();
  if (!authState.authenticated && (MEMBER_ONLY_PATHS.has(path) || path === '/admin')) {
    window.location.replace('/terminal');
    return true;
  }
  if (path === '/admin' && !authState.authorized) {
    window.location.replace('/dashboard');
    return true;
  }
  return false;
}

function syncAdminTabSuppression() {
  const existing = document.querySelector('#dni-admin-tab-suppression');
  if (!authState.loaded || !authState.authorized) {
    if (existing) return;
    const style = document.createElement('style');
    style.id = 'dni-admin-tab-suppression';
    style.textContent = '.nav-tab[data-panel="admin"]{display:none!important}';
    document.head.append(style);
    return;
  }
  existing?.remove();
}

function installAdminTabSuppression() {
  syncAdminTabSuppression();
}

function dashboardAdminMarkup() {
  return `<section class="dni-section-block" data-dni-admin-entry>
    <div class="dni-section-heading">
      <div><span>AUTHORIZED COMMAND ACCESS</span><h3>Administration</h3></div>
      <a class="dni-primary-action" href="/admin" data-dni-admin-link>ADMIN CONTROL PANEL</a>
    </div>
  </section>`;
}

function syncDashboardAdminEntry() {
  const dashboard = document.querySelector('[data-module="dashboard"]');
  if (!dashboard) return;
  for (const entry of dashboard.querySelectorAll('[data-dni-admin-entry]')) {
    if (!authState.authorized) entry.remove();
  }
  if (!authState.loaded || !authState.authorized || dashboard.querySelector('[data-dni-admin-entry]')) return;
  dashboard.insertAdjacentHTML('beforeend', dashboardAdminMarkup());
}

function observeDashboard() {
  const dashboard = document.querySelector('[data-module="dashboard"]');
  if (!dashboard) return;
  const observer = new MutationObserver(() => syncDashboardAdminEntry());
  observer.observe(dashboard, { childList: true, subtree: true });
  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel === 'dashboard') queueMicrotask(syncDashboardAdminEntry);
  });
}

async function loadAdminControlHardener() {
  if (!authState.authorized) return;
  try {
    await import('./admin-controls.js?v=20260831-admin-controls-v7');
  } catch (error) {
    console.error('DNI Admin control hardener failed to load', error);
  }
}

function staleSectorsRuntimeVisible() {
  const panel = document.querySelector('[data-module="admin"]');
  if (!(panel instanceof HTMLElement)) return false;
  if (panel.dataset.adminSectorsErrorCode === 'stale-runtime') return true;
  const message = String(panel.querySelector('.dni-admin-notice.is-error')?.textContent || '');
  return /sector editor could not open/i.test(message) && /sectors is not defined/i.test(message);
}

function recoverStaleSectorsRuntime() {
  if (!authState.authorized || !staleSectorsRuntimeVisible()) return false;
  try {
    if (window.sessionStorage.getItem(ADMIN_SECTORS_RUNTIME_RECOVERY_KEY) === 'reloaded') return false;
    window.sessionStorage.setItem(ADMIN_SECTORS_RUNTIME_RECOVERY_KEY, 'reloaded');
  } catch {
    const current = new URL(window.location.href);
    if (current.searchParams.has('dniAdminRepair')) return false;
  }
  const target = new URL('/admin', window.location.origin);
  target.searchParams.set('dniAdminRepair', String(Date.now()));
  window.location.replace(target.toString());
  return true;
}

function installAdminRuntimeRecovery() {
  document.addEventListener('click', event => {
    if (!authState.authorized) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('[data-admin-workspace="sectors"], [data-admin-retry-sectors]')) return;
    window.setTimeout(() => {
      recoverStaleSectorsRuntime();
    }, 80);
  });
}

function installAdminControlLifecycle() {
  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel !== 'admin' || !authState.authorized) return;
    void loadAdminControlHardener();
  });
}

async function loadAuthorization() {
  const response = await fetch('/embedded-status.php', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const status = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(status.error || `Authorization status HTTP ${response.status}`);

  authState.status = status;
  authState.authenticated = status.authenticated === true;
  authState.authorized = authState.authenticated && isAdminAuthorized(status.user || {}, status);
  authState.loaded = true;
  syncGuestNavigationState();
  syncAdminTabSuppression();
  window.dispatchEvent(new CustomEvent('dni:authz', { detail: { ...authState } }));
  syncDashboardAdminEntry();

  if (enforceGuestRoute()) return false;
  await loadAdminControlHardener();
  return true;
}

installGuestTabSuppression();
syncGuestNavigationState();
installLoginPromptStyles();
ensureLoginPrompt();
installDiscordLoginInterception();
installGuestLoginCommand();
installGuestPanelGuard();
installAdminTabSuppression();
observeDashboard();
installAdminRuntimeRecovery();
installAdminControlLifecycle();

try {
  await loadAuthorization();
} catch (error) {
  authState.loaded = true;
  authState.authenticated = false;
  authState.authorized = false;
  syncGuestNavigationState();
  syncAdminTabSuppression();
  console.error('DNI authorization check failed', error);
  syncDashboardAdminEntry();
  enforceGuestRoute();
}
