const shell = document.querySelector('.terminal-shell');
const nav = document.querySelector('.nav-tabs');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function ensureAdminSurface() {
  if (!shell || !nav) return null;
  let tab = nav.querySelector('.nav-tab[data-panel="admin"]');
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'nav-tab';
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
    tab.dataset.panel = 'admin';
    tab.textContent = 'DNI Admin';
    nav.append(tab);
  }

  let panel = shell.querySelector('[data-module="admin"]');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'module-panel dni-module-panel dni-admin-panel';
    panel.dataset.module = 'admin';
    panel.setAttribute('aria-labelledby', 'admin-title');
    shell.append(panel);
  }

  if (!document.querySelector('#dni-admin-runtime-style')) {
    const style = document.createElement('style');
    style.id = 'dni-admin-runtime-style';
    style.textContent = `
      .terminal-shell[data-panel="admin"] [data-module="admin"]{display:block}
      .dni-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
      .dni-admin-card{border:1px solid #303030;background:#080808;padding:16px;min-width:0}
      .dni-admin-card span{display:block;color:#777;font:700 8px/1.2 "Courier New",monospace;letter-spacing:1.3px;text-transform:uppercase}
      .dni-admin-card strong{display:block;margin-top:8px;font:700 18px/1.15 Arial,sans-serif;color:#efefef;overflow-wrap:anywhere}
      .dni-admin-card small{display:block;margin-top:8px;color:#999;font:10px/1.5 "Courier New",monospace}
      .dni-admin-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
      .dni-admin-actions a,.dni-admin-actions button{border:1px solid #555;background:#111;color:#eee;padding:9px 11px;text-decoration:none;font:700 9px/1 "Courier New",monospace;letter-spacing:1px;text-transform:uppercase}
      @media(max-width:720px){.dni-admin-grid{grid-template-columns:1fr}}
    `;
    document.head.append(style);
  }

  const activate = () => {
    shell.dataset.panel = 'admin';
    for (const item of document.querySelectorAll('.nav-tab')) {
      const active = item.dataset.panel === 'admin';
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    }
    window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel: 'admin' } }));
  };

  if (!tab.dataset.adminBound) {
    tab.dataset.adminBound = '1';
    tab.addEventListener('click', activate);
    for (const item of nav.querySelectorAll('.nav-tab:not([data-panel="admin"])')) {
      item.addEventListener('click', () => {
        tab.setAttribute('aria-selected', 'false');
        tab.tabIndex = -1;
      });
    }
  }

  return { tab, panel, activate };
}

function statusBadge(text, state = '') {
  return `<strong class="dni-state-badge ${state}">${esc(text)}</strong>`;
}

function renderSetup(panel, data) {
  panel.innerHTML = `
    <header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2><p>Server administration surface for the Rocky Linux 9 DNI runtime.</p></div>${statusBadge('SETUP REQUIRED')}</header>
    <section class="dni-auth-card"><p>${esc(data.message || 'Initial MariaDB application credentials must be provisioned before authenticated admin controls can load.')}</p></section>
    <div class="dni-admin-grid">
      <article class="dni-admin-card"><span>Database</span><strong>${data.databaseConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}</strong><small>Automatic migrations activate after the application database credentials exist.</small></article>
      <article class="dni-admin-card"><span>Discord OAuth</span><strong>${data.discordConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}</strong><small>Used for personnel identity and administrator authorization.</small></article>
      <article class="dni-admin-card"><span>Star Comms</span><strong>${data.starCommsConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}</strong><small>Owner API credentials remain on the server.</small></article>
      <article class="dni-admin-card"><span>Runtime</span><strong>${esc(data.runtime || 'rocky9-lamp')}</strong><small>No package installation is performed by normal DNI deploys.</small></article>
    </div>`;
}

function renderSignIn(panel, payload) {
  panel.innerHTML = `
    <header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2></div>${statusBadge('AUTH REQUIRED')}</header>
    <section class="dni-auth-card"><p>${esc(payload.error || 'Discord administrator sign-in is required.')}</p><a class="dni-primary-action" href="${esc(payload.loginUrl || '/auth/discord/login?next=/admin')}">SIGN IN WITH DISCORD</a></section>`;
}

function renderDenied(panel, payload) {
  panel.innerHTML = `
    <header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2></div>${statusBadge('ACCESS DENIED', 'is-error')}</header>
    <div class="dni-error">${esc(payload.error || 'DNI administrator permission required.')}</div>`;
}

function renderAdmin(panel, data) {
  const counts = data.counts || {};
  const migrations = data.migrations || {};
  const identity = data.user?.guildNick || data.user?.globalName || data.user?.username || 'DNI ADMIN';
  panel.innerHTML = `
    <header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2><p>Authenticated administration and runtime status for ${esc(identity)}.</p></div>${statusBadge('ADMIN ACTIVE', 'is-online')}</header>
    <div class="dni-admin-grid">
      <article class="dni-admin-card"><span>Database</span><strong>${data.databaseConfigured ? 'ONLINE' : 'UNAVAILABLE'}</strong><small>${Number(counts.users || 0)} users · ${Number(counts.sectors || 0)} active sectors</small></article>
      <article class="dni-admin-card"><span>Services</span><strong>${Number(counts.serviceRequests || 0)} REQUESTS</strong><small>MariaDB-backed dispatch records.</small></article>
      <article class="dni-admin-card"><span>Audit</span><strong>${Number(counts.auditEntries || 0)} EVENTS</strong><small>Administrative and operational activity log.</small></article>
      <article class="dni-admin-card"><span>Migrations</span><strong>${Number(migrations.applied || 0)} APPLIED</strong><small>Tracking table: ${migrations.trackingTable ? 'ACTIVE' : 'NOT READY'}</small></article>
      <article class="dni-admin-card"><span>Discord OAuth</span><strong>${data.discordConfigured ? 'READY' : 'NOT CONFIGURED'}</strong><small>Administrator authorization provider.</small></article>
      <article class="dni-admin-card"><span>Star Comms</span><strong>${data.starCommsConfigured ? 'READY' : 'NOT CONFIGURED'}</strong><small>Server-side Owner API bridge.</small></article>
    </div>
    <div class="dni-admin-actions"><a href="/dashboard">Dashboard</a><a href="/services">Services</a><a href="/communication">Communication</a><a href="/sectors">Sectors</a></div>`;
}

async function loadAdmin(surface) {
  surface.panel.innerHTML = '<div class="dni-loading"><span>DNI ADMIN</span><b>Checking command authorization…</b></div>';
  try {
    const response = await fetch('/api/dni/admin/status?dni_route=admin/status', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) return renderSignIn(surface.panel, payload);
    if (response.status === 403) return renderDenied(surface.panel, payload);
    if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
    if (payload.setupRequired) return renderSetup(surface.panel, payload);
    renderAdmin(surface.panel, payload);
  } catch (error) {
    surface.panel.innerHTML = `<header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2></div>${statusBadge('UNAVAILABLE', 'is-error')}</header><div class="dni-error">${esc(error.message || error)}</div>`;
  }
}

const onAdminPath = String(window.location.pathname || '').replace(/\/+$/, '') === '/admin';
let surface = null;
if (onAdminPath) {
  surface = ensureAdminSurface();
  if (surface) {
    surface.activate();
    void loadAdmin(surface);
  }
}

fetch('/api/dni/admin/status?dni_route=admin/status', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
  .then(async response => ({ response, payload: await response.json().catch(() => ({})) }))
  .then(({ response, payload }) => {
    if (payload.admin === true || onAdminPath || payload.setupRequired === true) {
      surface = surface || ensureAdminSurface();
      if (!surface) return;
      if (payload.admin === true && !onAdminPath) renderAdmin(surface.panel, payload);
    }
  })
  .catch(() => {});

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel !== 'admin') return;
  surface = surface || ensureAdminSurface();
  if (surface) void loadAdmin(surface);
});
