const shell = document.querySelector('.terminal-shell');
const nav = document.querySelector('.nav-tabs');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmtUptime = seconds => {
  const value = Math.max(0, Number(seconds || 0));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

let surface = null;
let lastPayload = null;
let commandLog = [];

function addLog(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  commandLog.unshift({ timestamp, message: String(message), level });
  commandLog = commandLog.slice(0, 12);
}

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
      .dni-admin-panel{--admin-line:#303030;--admin-panel:#080808;--admin-panel-2:#0d0d0d;--admin-muted:#858585;--admin-text:#efefef;--admin-ok:#6cff9d;--admin-warn:#ffc85a;--admin-bad:#ff6868}
      .dni-admin-hero{border:1px solid var(--admin-line);background:linear-gradient(180deg,#0c0c0c,#070707);padding:16px;margin-top:14px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center}
      .dni-admin-hero-kicker,.dni-admin-section-title,.dni-admin-card span,.dni-admin-kv dt,.dni-admin-log time{color:#777;font:700 8px/1.2 "Courier New",monospace;letter-spacing:1.3px;text-transform:uppercase}
      .dni-admin-hero h3{margin:6px 0 0;color:#f2f2f2;font:700 22px/1.05 Arial,sans-serif;letter-spacing:.2px}
      .dni-admin-hero p{margin:7px 0 0;color:#999;font:10px/1.55 "Courier New",monospace;max-width:680px}
      .dni-admin-live{display:flex;align-items:center;gap:8px;color:var(--admin-ok);font:700 9px/1 "Courier New",monospace;letter-spacing:1px;white-space:nowrap}
      .dni-admin-live::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 12px currentColor}
      .dni-admin-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}
      .dni-admin-card{border:1px solid var(--admin-line);background:var(--admin-panel);padding:14px;min-width:0;position:relative;overflow:hidden}
      .dni-admin-card::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:#252525}
      .dni-admin-card.is-online::after{background:var(--admin-ok)}
      .dni-admin-card.is-warning::after{background:var(--admin-warn)}
      .dni-admin-card.is-error::after{background:var(--admin-bad)}
      .dni-admin-card strong{display:block;margin-top:8px;font:700 16px/1.15 Arial,sans-serif;color:var(--admin-text);overflow-wrap:anywhere}
      .dni-admin-card small{display:block;margin-top:7px;color:#8f8f8f;font:9px/1.45 "Courier New",monospace}
      .dni-admin-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:10px;margin-top:10px}
      .dni-admin-block{border:1px solid var(--admin-line);background:var(--admin-panel);padding:14px;min-width:0}
      .dni-admin-section-title{display:flex;justify-content:space-between;gap:10px;margin-bottom:12px;color:#aaa}
      .dni-admin-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border:1px solid #232323}
      .dni-admin-kv div{padding:10px;border-bottom:1px solid #1f1f1f;min-width:0}
      .dni-admin-kv div:nth-last-child(-n+2){border-bottom:0}
      .dni-admin-kv dd{margin:5px 0 0;color:#ddd;font:700 11px/1.35 "Courier New",monospace;overflow-wrap:anywhere}
      .dni-admin-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .dni-admin-control,.dni-admin-link{appearance:none;border:1px solid #454545;background:#101010;color:#eee;padding:11px;text-align:left;text-decoration:none;font:700 9px/1.25 "Courier New",monospace;letter-spacing:.8px;text-transform:uppercase;cursor:pointer;min-height:42px}
      .dni-admin-control:hover,.dni-admin-link:hover{border-color:#777;background:#151515}
      .dni-admin-control:disabled{opacity:.45;cursor:not-allowed}
      .dni-admin-control b,.dni-admin-link b{display:block;color:#777;font-size:7px;margin-top:5px;letter-spacing:.6px}
      .dni-admin-route-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
      .dni-admin-route-grid .dni-admin-link{text-align:center}
      .dni-admin-log{margin-top:10px;border:1px solid var(--admin-line);background:#050505;max-height:210px;overflow:auto}
      .dni-admin-log-row{display:grid;grid-template-columns:74px 66px minmax(0,1fr);gap:8px;padding:8px 10px;border-bottom:1px solid #181818;font:9px/1.45 "Courier New",monospace;color:#bdbdbd}
      .dni-admin-log-row:last-child{border-bottom:0}
      .dni-admin-log-row b{color:#777;font-size:8px;letter-spacing:.8px}
      .dni-admin-log-row.is-ok b{color:var(--admin-ok)}
      .dni-admin-log-row.is-warning b{color:var(--admin-warn)}
      .dni-admin-log-row.is-error b{color:var(--admin-bad)}
      .dni-admin-notice{border:1px solid #5c4720;background:#171208;color:#cbb37c;padding:10px 12px;margin-top:10px;font:9px/1.55 "Courier New",monospace}
      .dni-admin-notice strong{color:var(--admin-warn);letter-spacing:.7px}
      .dni-state-badge{display:inline-flex;align-items:center;border:1px solid #575757;padding:7px 9px;color:#ddd;background:#101010;font:700 8px/1 "Courier New",monospace;letter-spacing:1px;white-space:nowrap}
      .dni-state-badge.is-online{border-color:#285f3c;color:var(--admin-ok)}
      .dni-state-badge.is-warning{border-color:#66501f;color:var(--admin-warn)}
      .dni-state-badge.is-error{border-color:#6c2929;color:var(--admin-bad)}
      @media(max-width:980px){.dni-admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dni-admin-layout{grid-template-columns:1fr}.dni-admin-route-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:620px){.dni-admin-hero{grid-template-columns:1fr}.dni-admin-grid,.dni-admin-kv,.dni-admin-controls,.dni-admin-route-grid{grid-template-columns:1fr}.dni-admin-kv div{border-bottom:1px solid #1f1f1f!important}.dni-admin-kv div:last-child{border-bottom:0!important}.dni-admin-log-row{grid-template-columns:62px 54px minmax(0,1fr)}}
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

async function getJson(url) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function probeControlPlane() {
  const [adminResult, healthResult, runtimeResult, commsResult] = await Promise.all([
    getJson('/api/dni/admin/status?dni_route=admin/status'),
    getJson('/api/dni/health'),
    getJson('/api/dni/runtime'),
    getJson('/sync-runtime-secrets.php?mode=snapshot')
  ]);

  return {
    adminResponse: adminResult.response,
    admin: adminResult.payload,
    health: healthResult.response.ok ? healthResult.payload : {},
    runtime: runtimeResult.response.ok ? runtimeResult.payload : {},
    comms: commsResult.response.ok ? commsResult.payload : { ok: false, error: commsResult.payload?.error || `HTTP ${commsResult.response.status}` }
  };
}

function card(label, value, detail, state) {
  return `<article class="dni-admin-card ${state || ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`;
}

function logMarkup() {
  if (!commandLog.length) return '<div class="dni-admin-log-row"><time>--:--:--</time><b>READY</b><span>Command Control initialized.</span></div>';
  return commandLog.map(entry => `<div class="dni-admin-log-row ${entry.level === 'error' ? 'is-error' : entry.level === 'warning' ? 'is-warning' : 'is-ok'}"><time>${esc(entry.timestamp)}</time><b>${esc(entry.level.toUpperCase())}</b><span>${esc(entry.message)}</span></div>`).join('');
}

function renderControlPanel(panel, bundle) {
  const data = bundle.admin || {};
  const health = bundle.health || {};
  const runtime = bundle.runtime || {};
  const comms = bundle.comms || {};
  const counts = data.counts || {};
  const migrations = data.migrations || {};
  const setupRequired = data.setupRequired === true;
  const databaseReady = data.databaseConfigured === true;
  const discordReady = data.discordConfigured === true;
  const starReady = data.starCommsConfigured === true || comms.ok === true;
  const adminActive = data.admin === true;
  const identity = data.user?.guildNick || data.user?.globalName || data.user?.username || 'DNI COMMAND';
  const overallLabel = setupRequired ? 'SETUP REQUIRED' : adminActive ? 'ADMIN ACTIVE' : 'AUTH REQUIRED';
  const overallState = setupRequired ? 'is-warning' : adminActive ? 'is-online' : 'is-error';
  const uptime = health.uptimeSeconds == null ? 'UNKNOWN' : fmtUptime(health.uptimeSeconds);
  const nodeName = health.hostname || 'OVH-DNI-01';
  const version = health.version || '4.4.0-vps';
  const persistence = runtime.persistence || (databaseReady ? 'mariadb-configured' : 'server-json-fallback');

  panel.innerHTML = `
    <header class="dni-module-header">
      <div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2><p>Rocky Linux 9 command surface · ${esc(identity)}</p></div>
      ${statusBadge(overallLabel, overallState)}
    </header>

    <section class="dni-admin-hero">
      <div><span class="dni-admin-hero-kicker">COMMAND NODE</span><h3>${esc(nodeName)}</h3><p>Operational control plane for the DNI terminal runtime. Configuration state is shown here without exposing server credentials to the browser.</p></div>
      <div class="dni-admin-live">NODE API ONLINE</div>
    </section>

    ${setupRequired ? `<div class="dni-admin-notice"><strong>SETUP REQUIRED</strong> · ${esc(data.message || 'Initial application credentials are not configured yet.')} Command Control remains available while integrations are brought online.</div>` : ''}

    <div class="dni-admin-grid">
      ${card('Database', databaseReady ? 'ONLINE' : 'NOT CONFIGURED', databaseReady ? `${Number(counts.users || 0)} users · ${Number(counts.sectors || 0)} sectors` : 'MariaDB application credentials required.', databaseReady ? 'is-online' : 'is-warning')}
      ${card('Discord OAuth', discordReady ? 'READY' : 'NOT CONFIGURED', discordReady ? 'Personnel identity and admin authorization available.' : 'OAuth client configuration required.', discordReady ? 'is-online' : 'is-warning')}
      ${card('Star Comms', starReady ? 'ONLINE' : 'NOT CONFIGURED', starReady ? 'Private server-side Owner API bridge responding.' : 'Owner API credential is not active.', starReady ? 'is-online' : 'is-warning')}
      ${card('Runtime', health.ok === false ? 'DEGRADED' : 'ONLINE', `${esc(data.runtime || 'ovh-vps-node')} · uptime ${uptime}`, health.ok === false ? 'is-error' : 'is-online')}
    </div>

    <div class="dni-admin-layout">
      <section class="dni-admin-block">
        <div class="dni-admin-section-title"><span>SYSTEM TELEMETRY</span><span>LIVE</span></div>
        <dl class="dni-admin-kv">
          <div><dt>Node</dt><dd>${esc(nodeName)}</dd></div>
          <div><dt>Version</dt><dd>${esc(version)}</dd></div>
          <div><dt>Persistence</dt><dd>${esc(persistence)}</dd></div>
          <div><dt>Uptime</dt><dd>${esc(uptime)}</dd></div>
          <div><dt>Migrations</dt><dd>${Number(migrations.applied || 0)} APPLIED · ${migrations.trackingTable ? 'TRACKING ACTIVE' : 'TRACKING NOT READY'}</dd></div>
          <div><dt>Audit</dt><dd>${Number(counts.auditEntries || 0)} EVENTS</dd></div>
          <div><dt>Services</dt><dd>${Number(counts.serviceRequests || 0)} REQUESTS</dd></div>
          <div><dt>Secrets</dt><dd>SERVER SIDE · NOT EXPOSED</dd></div>
        </dl>
      </section>

      <section class="dni-admin-block">
        <div class="dni-admin-section-title"><span>CONTROL STATION</span><span>${adminActive ? 'AUTHORIZED' : 'READ-ONLY'}</span></div>
        <div class="dni-admin-controls">
          <button class="dni-admin-control" type="button" data-admin-action="refresh">REFRESH SYSTEM<b>Recheck API, runtime, and integrations</b></button>
          <button class="dni-admin-control" type="button" data-admin-action="test-comms">TEST STAR COMMS<b>Probe private read-only bridge</b></button>
          ${discordReady ? `<a class="dni-admin-link" href="${esc(data.loginUrl || '/auth/discord/login?next=/admin')}">DISCORD AUTH<b>Open administrator authorization</b></a>` : '<button class="dni-admin-control" type="button" disabled>DISCORD AUTH<b>Configure OAuth on server first</b></button>'}
          ${databaseReady ? '<a class="dni-admin-link" href="/dashboard">DATABASE OPS<b>Open MariaDB-backed dashboard</b></a>' : '<button class="dni-admin-control" type="button" disabled>DATABASE OPS<b>Provision database credentials first</b></button>'}
        </div>
      </section>
    </div>

    <section class="dni-admin-block" style="margin-top:10px">
      <div class="dni-admin-section-title"><span>OPERATIONS LAUNCHER</span><span>DNI NETWORK</span></div>
      <div class="dni-admin-route-grid">
        <a class="dni-admin-link" href="/dashboard">DASHBOARD<b>Personnel & clearance</b></a>
        <a class="dni-admin-link" href="/services">SERVICES<b>Dispatch control</b></a>
        <a class="dni-admin-link" href="/communication">COMMUNICATION<b>Star Comms bridge</b></a>
        <a class="dni-admin-link" href="/sectors">SECTORS<b>Fleet & asset network</b></a>
      </div>
    </section>

    <section class="dni-admin-block" style="margin-top:10px">
      <div class="dni-admin-section-title"><span>COMMAND LOG</span><span>LOCAL SESSION</span></div>
      <div class="dni-admin-log" data-admin-log>${logMarkup()}</div>
    </section>`;

  bindControls(panel);
}

function renderSignIn(panel, payload) {
  panel.innerHTML = `
    <header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2></div>${statusBadge('AUTH REQUIRED', 'is-warning')}</header>
    <section class="dni-auth-card"><p>${esc(payload.error || 'Discord administrator sign-in is required.')}</p><a class="dni-primary-action" href="${esc(payload.loginUrl || '/auth/discord/login?next=/admin')}">SIGN IN WITH DISCORD</a></section>`;
}

function renderDenied(panel, payload) {
  panel.innerHTML = `
    <header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2></div>${statusBadge('ACCESS DENIED', 'is-error')}</header>
    <div class="dni-error">${esc(payload.error || 'DNI administrator permission required.')}</div>`;
}

function bindControls(panel) {
  panel.querySelector('[data-admin-action="refresh"]')?.addEventListener('click', async button => {
    const target = button.currentTarget;
    target.disabled = true;
    addLog('Manual system refresh requested.');
    try {
      await loadAdmin(surface, true);
    } finally {
      target.disabled = false;
    }
  });

  panel.querySelector('[data-admin-action="test-comms"]')?.addEventListener('click', async button => {
    const target = button.currentTarget;
    target.disabled = true;
    addLog('Testing Star Comms private bridge.');
    updateLog(panel);
    try {
      const result = await getJson('/sync-runtime-secrets.php?mode=snapshot');
      if (!result.response.ok || result.payload?.ok === false) throw new Error(result.payload?.error || `HTTP ${result.response.status}`);
      addLog('Star Comms bridge responded successfully.');
    } catch (error) {
      addLog(`Star Comms test failed: ${error.message || error}`, 'error');
    } finally {
      target.disabled = false;
      updateLog(panel);
    }
  });
}

function updateLog(panel) {
  const target = panel?.querySelector('[data-admin-log]');
  if (target) target.innerHTML = logMarkup();
}

async function loadAdmin(activeSurface, manual = false) {
  if (!activeSurface) return;
  if (!manual) activeSurface.panel.innerHTML = '<div class="dni-loading"><span>DNI COMMAND CONTROL</span><b>Establishing command telemetry…</b></div>';
  try {
    const bundle = await probeControlPlane();
    lastPayload = bundle;
    const response = bundle.adminResponse;
    const payload = bundle.admin || {};
    if (response.status === 401 && payload.setupRequired !== true) return renderSignIn(activeSurface.panel, payload);
    if (response.status === 403) return renderDenied(activeSurface.panel, payload);
    if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
    addLog(manual ? 'Command telemetry refreshed.' : 'DNI Command Control connected.');
    if (bundle.comms?.ok === true) addLog('Star Comms bridge online.');
    else if (payload.starCommsConfigured === false) addLog('Star Comms is not configured.', 'warning');
    if (payload.databaseConfigured === false) addLog('MariaDB application credentials are not configured.', 'warning');
    if (payload.discordConfigured === false) addLog('Discord OAuth is not configured.', 'warning');
    renderControlPanel(activeSurface.panel, bundle);
  } catch (error) {
    addLog(`Command Control unavailable: ${error.message || error}`, 'error');
    activeSurface.panel.innerHTML = `<header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2></div>${statusBadge('UNAVAILABLE', 'is-error')}</header><div class="dni-error">${esc(error.message || error)}</div>`;
  }
}

const onAdminPath = String(window.location.pathname || '').replace(/\/+$/, '') === '/admin';
if (onAdminPath) {
  surface = ensureAdminSurface();
  if (surface) {
    surface.activate();
    void loadAdmin(surface);
  }
}

getJson('/api/dni/admin/status?dni_route=admin/status')
  .then(({ payload }) => {
    if (payload.admin === true || onAdminPath || payload.setupRequired === true) {
      surface = surface || ensureAdminSurface();
      if (!surface) return;
      if (payload.admin === true && !onAdminPath && lastPayload) renderControlPanel(surface.panel, lastPayload);
    }
  })
  .catch(() => {});

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel !== 'admin') return;
  surface = surface || ensureAdminSurface();
  if (surface) void loadAdmin(surface);
});
