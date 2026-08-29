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

function isAdminPath() {
  return currentPath() === '/admin';
}

function syncGuestNavigationState() {
  document.documentElement.dataset.dniAuth = authState.loaded
    ? (authState.authenticated ? 'authenticated' : 'guest')
    : 'pending';
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

function installAdminTabSuppression() {
  const style = document.createElement('style');
  style.id = 'dni-admin-tab-suppression';
  style.textContent = '.nav-tab[data-panel="admin"]{display:none!important}';
  document.head.append(style);

  const removeAdminTabs = root => {
    if (root?.matches?.('.nav-tab[data-panel="admin"]')) root.remove();
    for (const tab of root?.querySelectorAll?.('.nav-tab[data-panel="admin"]') || []) tab.remove();
  };

  removeAdminTabs(document);
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) removeAdminTabs(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
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

async function loadAdminSectorWorkspaceBridge() {
  if (!isAdminPath() || !authState.authorized) return;
  try {
    await import('/src/js/admin-edit-bridge.js?v=20260828-admin-sectors-v2');
  } catch (error) {
    console.error('DNI Admin sector/asset editor failed to load', error);
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
  window.dispatchEvent(new CustomEvent('dni:authz', { detail: { ...authState } }));
  syncDashboardAdminEntry();

  if (enforceGuestRoute()) return false;

  await loadAdminSectorWorkspaceBridge();
  return true;
}

syncGuestNavigationState();
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
  console.error('DNI authorization check failed', error);
  syncDashboardAdminEntry();
  enforceGuestRoute();
}