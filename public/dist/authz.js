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

const authState = {
  loaded: false,
  authenticated: false,
  authorized: false,
  status: null
};

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

    appendTerminalRow('AUTHENTICATION REQUIRED // REDIRECTING TO DISCORD SIGN-IN', 'muted');
    window.location.assign('/auth/discord/login');
  }, true);
}

function installGuestPanelGuard() {
  window.addEventListener('dni:panel', event => {
    const panel = String(event.detail?.panel || 'terminal');
    if (panel === 'terminal' || authState.authenticated) return;

    // Guest sessions are Terminal-only. Stop routing listeners from turning a
    // command or synthetic panel event into a member-only route.
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

  // Keep Admin hidden while authorization is unresolved and for users who are
  // not admins, but never remove the actual tab from the DOM. Removing it broke
  // the router because /admin activation requires the dynamic admin tab.
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
  if (currentPath() !== '/admin' || !authState.authorized) return;
  try {
    await import('/src/js/admin-controls.js?v=20260829-admin-controls-v2');
  } catch (error) {
    console.error('DNI Admin control hardener failed to load', error);
  }
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
installGuestLoginCommand();
installGuestPanelGuard();
installAdminTabSuppression();
observeDashboard();

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
