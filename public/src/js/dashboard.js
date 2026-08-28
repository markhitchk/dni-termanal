const root = document.querySelector('[data-module="dashboard"]');

if (root) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function loading() {
    root.className = 'module-panel dni-module-panel';
    root.innerHTML = '<div class="dni-loading"><span>DNI DASHBOARD</span><b>Loading personnel network…</b></div>';
  }

  function signIn(message = 'Discord sign-in is required to load your personnel dashboard.') {
    root.className = 'module-panel dni-module-panel';
    root.innerHTML = `<header class="dni-module-header"><div><span>DNI PERSONNEL NETWORK</span><h2>DNI Dashboard</h2><p>Personnel identity, assignment, clearance, and document access.</p></div><strong class="dni-state-badge">AUTH REQUIRED</strong></header><section class="dni-auth-card"><p>${esc(message)}</p><a class="dni-primary-action" href="/auth/discord/login?next=/dashboard">SIGN IN WITH DISCORD</a></section>`;
  }

  function value(label, text) {
    return `<div class="dni-value"><span>${esc(label)}</span><b>${esc(text || 'UNASSIGNED')}</b></div>`;
  }

  function renderFallback(data) {
    const totals = data.totals || {};
    const sectors = Array.isArray(data.sectors) ? data.sectors : [];
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const personnel = Array.isArray(data.personnel) ? data.personnel : [];
    const priorityAssets = assets.slice(0, 10);

    root.className = 'module-panel dni-module-panel';
    root.innerHTML = `
      <header class="dni-module-header">
        <div><span>DNI PERSONNEL NETWORK</span><h2>DNI Dashboard</h2><p>Embedded server database strategic overview.</p></div>
        <strong class="dni-state-badge is-online">DATABASE ONLINE</strong>
      </header>
      <section class="dni-auth-card"><p>${esc(data.message || 'The DNI embedded database is online. Sign in with Discord to load your personal personnel record, permissions, and service history.')}</p><a class="dni-primary-action" href="/auth/discord/login?next=/dashboard">SIGN IN WITH DISCORD</a></section>
      <section class="dni-profile-grid">
        <article class="dni-profile-card dni-profile-primary">
          <span class="dni-card-kicker">STRATEGIC NETWORK</span>
          <h3>${esc(data.network?.name || 'IMPERIUM STRATEGIC NETWORK')}</h3>
          <p>${esc(data.network?.status || 'EMBEDDED DATABASE ONLINE')}</p>
          <div class="dni-value-grid">
            ${value('ACTIVE SECTORS', String(Number(totals.sectors || 0)))}
            ${value('FLEETS', String(Number(totals.fleets || 0)))}
            ${value('BASES', String(Number(totals.bases || 0)))}
            ${value('STATIONS / INSTALLATIONS', String(Number(totals.stations || 0)))}
            ${value('PERSONNEL RECORDS', String(Number(totals.personnel || personnel.length || 0)))}
            ${value('DATA SOURCE', 'EMBEDDED SERVER DB')}
          </div>
        </article>
        <article class="dni-profile-card">
          <span class="dni-card-kicker">PERSONNEL DATABASE</span>
          <h3>READY FOR SIGN-IN</h3>
          <p>User and personnel records are stored server-side. Discord sign-in creates or updates your DNI account without requiring MariaDB or a shell setup step.</p>
          <div class="dni-chip-list"><span class="dni-chip is-muted">AUTHENTICATION REQUIRED FOR PERSONAL DATA</span></div>
        </article>
      </section>
      <section class="dni-section-block">
        <div class="dni-section-heading"><div><span>STRATEGIC OVERVIEW</span><h3>Sector Status</h3></div><a href="/sectors" data-dni-panel-link="sectors">OPEN SECTORS</a></div>
        <div class="dni-activity-table">${sectors.length ? sectors.map(item => `<div><span>${esc(item.code || '--')}</span><b>${esc(item.name || item.id)}</b><em>${esc(item.status || 'UNKNOWN')}</em><small>${Number(item.control ?? 0).toFixed(0)}% CONTROL · ${Number(item.personnel || 0)} PERSONNEL</small></div>`).join('') : '<div class="dni-empty">No sector records are available.</div>'}</div>
      </section>
      <section class="dni-section-block">
        <div class="dni-section-heading"><div><span>NETWORK ASSETS</span><h3>Fleet & Installation Status</h3></div><b>${assets.length} ASSETS</b></div>
        <div class="dni-activity-table">${priorityAssets.length ? priorityAssets.map(item => `<div><span>${esc(String(item.type || 'asset').toUpperCase())}</span><b>${esc(item.name || item.id)}</b><em>${esc(item.status || 'UNKNOWN')}</em><small>${esc(item.location || item.sectorId || 'UNASSIGNED')}</small></div>`).join('') : '<div class="dni-empty">No operational assets are available.</div>'}</div>
      </section>`;
  }

  function render(data) {
    const user = data.user || {};
    const profile = data.profile || null;
    const name = profile?.display_name || user.guild_nick || user.global_name || user.username || 'DNI MEMBER';
    const clearances = Array.isArray(data.clearances) ? data.clearances : [];
    const documents = Array.isArray(data.documents) ? data.documents : [];
    const services = Array.isArray(data.recentServices) ? data.recentServices : [];
    root.className = 'module-panel dni-module-panel';
    root.innerHTML = `
      <header class="dni-module-header"><div><span>DNI PERSONNEL NETWORK</span><h2>DNI Dashboard</h2><p>Authenticated personnel identity, assignment, clearance, and document access.</p></div><strong class="dni-state-badge is-online">SESSION ACTIVE</strong></header>
      <section class="dni-profile-grid">
        <article class="dni-profile-card dni-profile-primary"><span class="dni-card-kicker">PERSONNEL RECORD</span><h3>${esc(name)}</h3><p>${esc(profile?.rank_name || 'UNRANKED')} · ${esc(profile?.corp_name || 'CORPS UNASSIGNED')}</p><div class="dni-value-grid">${value('SERVICE NUMBER', profile?.service_number || 'PENDING')}${value('STATUS', profile?.status || 'ACTIVE')}${value('SECTOR', profile?.sector_name)}${value('FLEET', profile?.fleet_name)}${value('DUTY STATION', profile?.duty_station_name)}${value('OTHER STATUS', profile?.other_status || 'NOMINAL')}</div></article>
        <article class="dni-profile-card"><span class="dni-card-kicker">CLEARANCE MATRIX</span><h3>AUTHORIZED ACCESS</h3><div class="dni-chip-list">${clearances.length ? clearances.map(item => `<span class="dni-chip">${esc(item.code)} · ${esc(item.name)}</span>`).join('') : '<span class="dni-chip is-muted">PUBLIC ONLY</span>'}</div><div class="dni-clearance-level"><span>MAX CLEARANCE</span><b>${Number(data.maxClearance || 0)}</b></div></article>
      </section>
      <section class="dni-section-block"><div class="dni-section-heading"><div><span>CLEARANCE-GATED ARCHIVE</span><h3>Documentation Browser</h3></div><b>${documents.length} FILES</b></div><div class="dni-document-grid">${documents.length ? documents.map(doc => `<details class="dni-document-card"><summary><span><small>${esc(doc.file_code)} · ${esc(doc.classification)}</small><b>${esc(doc.title)}</b><em>CLR ${Number(doc.minimum_clearance || 0)}</em></span></summary><p>${esc(doc.summary)}</p><div class="dni-document-body">${esc(doc.body)}</div></details>`).join('') : '<div class="dni-empty">No documents are authorized for the current clearance.</div>'}</div></section>
      <section class="dni-section-block"><div class="dni-section-heading"><div><span>PERSONAL OPERATIONS</span><h3>Recent Service Activity</h3></div><a href="/services" data-dni-panel-link="services">OPEN SERVICES</a></div><div class="dni-activity-table">${services.length ? services.map(item => `<div><span>#${item.id}</span><b>${esc(item.type_name)}</b><em class="dni-status-${esc(item.status)}">${esc(item.status).replace('_', ' ').toUpperCase()}</em><small>${esc(item.location)}</small></div>`).join('') : '<div class="dni-empty">No service activity is associated with this account.</div>'}</div></section>`;
  }

  async function load() {
    loading();
    try {
      const response = await fetch('/dashboard-data.php', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (payload.fallbackMode === true && response.ok) return renderFallback(payload);
      if (response.status === 401) return signIn(payload?.error || payload?.message);
      if (!response.ok) throw new Error(payload?.error || `${response.status} ${response.statusText}`);
      render(payload);
    } catch (error) {
      root.className = 'module-panel dni-module-panel';
      root.innerHTML = `<header class="dni-module-header"><div><span>DNI PERSONNEL NETWORK</span><h2>DNI Dashboard</h2></div><strong class="dni-state-badge is-error">UNAVAILABLE</strong></header><div class="dni-error">${esc(error.message || error)}</div>`;
    }
  }

  window.addEventListener('dni:panel', event => { if (event.detail?.panel === 'dashboard') void load(); });
  void load();
}
