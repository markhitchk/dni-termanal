const root = document.querySelector('[data-module="dashboard"]');

if (root) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function loading() {
    root.className = 'module-panel dni-module-panel';
    root.innerHTML = '<div class="dni-loading"><span>DNI DASHBOARD</span><b>Loading personnel record…</b></div>';
  }

  function signIn(message = 'Discord sign-in is required to load your personnel dashboard.') {
    root.className = 'module-panel dni-module-panel';
    root.innerHTML = `
      <header class="dni-module-header"><div><span>DNI PERSONNEL NETWORK</span><h2>DNI Dashboard</h2></div><strong class="dni-state-badge">AUTH REQUIRED</strong></header>
      <section class="dni-auth-card"><p>${esc(message)}</p><a class="dni-primary-action" href="/auth/discord/login?next=/dashboard">SIGN IN WITH DISCORD</a></section>`;
  }

  function value(label, text) {
    return `<div class="dni-value"><span>${esc(label)}</span><b>${esc(text || 'UNASSIGNED')}</b></div>`;
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
      <header class="dni-module-header">
        <div><span>DNI PERSONNEL NETWORK</span><h2>DNI Dashboard</h2><p>Authenticated personnel identity, assignment, clearance, and document access.</p></div>
        <strong class="dni-state-badge is-online">SESSION ACTIVE</strong>
      </header>
      <section class="dni-profile-grid">
        <article class="dni-profile-card dni-profile-primary">
          <span class="dni-card-kicker">PERSONNEL RECORD</span>
          <h3>${esc(name)}</h3>
          <p>${esc(profile?.rank_name || 'UNRANKED')} · ${esc(profile?.corp_name || 'CORPS UNASSIGNED')}</p>
          <div class="dni-value-grid">
            ${value('SERVICE NUMBER', profile?.service_number || 'PENDING')}
            ${value('STATUS', profile?.status || 'ACTIVE')}
            ${value('SECTOR', profile?.sector_name)}
            ${value('FLEET', profile?.fleet_name)}
            ${value('DUTY STATION', profile?.duty_station_name)}
            ${value('OTHER STATUS', profile?.other_status || 'NOMINAL')}
          </div>
        </article>
        <article class="dni-profile-card">
          <span class="dni-card-kicker">CLEARANCE MATRIX</span>
          <h3>AUTHORIZED ACCESS</h3>
          <div class="dni-chip-list">
            ${clearances.length ? clearances.map(item => `<span class="dni-chip">${esc(item.code)} · ${esc(item.name)}</span>`).join('') : '<span class="dni-chip is-muted">PUBLIC ONLY</span>'}
          </div>
          <div class="dni-clearance-level"><span>MAX CLEARANCE</span><b>${Number(data.maxClearance || 0)}</b></div>
        </article>
      </section>
      <section class="dni-section-block">
        <div class="dni-section-heading"><div><span>CLEARANCE-GATED ARCHIVE</span><h3>Documentation Browser</h3></div><b>${documents.length} FILES</b></div>
        <div class="dni-document-grid">
          ${documents.length ? documents.map(doc => `
            <details class="dni-document-card">
              <summary><span><small>${esc(doc.file_code)} · ${esc(doc.classification)}</small><b>${esc(doc.title)}</b><em>CLR ${Number(doc.minimum_clearance || 0)}</em></span></summary>
              <p>${esc(doc.summary)}</p><div class="dni-document-body">${esc(doc.body)}</div>
            </details>`).join('') : '<div class="dni-empty">No documents are authorized for the current clearance.</div>'}
        </div>
      </section>
      <section class="dni-section-block">
        <div class="dni-section-heading"><div><span>PERSONAL OPERATIONS</span><h3>Recent Service Activity</h3></div><a href="/services" data-dni-panel-link="services">OPEN SERVICES</a></div>
        <div class="dni-activity-table">
          ${services.length ? services.map(item => `<div><span>#${item.id}</span><b>${esc(item.type_name)}</b><em class="dni-status-${esc(item.status)}">${esc(item.status).replace('_', ' ').toUpperCase()}</em><small>${esc(item.location)}</small></div>`).join('') : '<div class="dni-empty">No service activity is associated with this account.</div>'}
        </div>
      </section>`;
  }

  async function load() {
    loading();
    try {
      const response = await fetch('/api/dni/dashboard', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) return signIn(payload?.error);
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
