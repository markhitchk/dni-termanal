(() => {
  const ENDPOINT = '/admin-citizens.php?action=bootstrap';
  const state = {
    active: false,
    loading: false,
    loaded: false,
    error: '',
    citizens: [],
    counts: {},
    selectedId: null,
    query: ''
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const attr = value => esc(value ?? '');

  function panel() {
    return document.querySelector('.dni-admin-panel[data-module="admin"], [data-module="admin"].dni-admin-panel');
  }

  function workspaceHost(root = panel()) {
    return root?.querySelector('.dni-admin-workspace') || null;
  }

  function memberTab(root = panel()) {
    return root?.querySelector('[data-admin-workspace="users"]') || null;
  }

  function citizenTab(root = panel()) {
    return root?.querySelector('[data-admin-citizens-workspace]') || null;
  }

  function formatTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function sourceLabel(row) {
    return row?.citizen_source_label || String(row?.citizen_source || 'Citizen').replaceAll('_', ' ');
  }

  function citizenName(row) {
    return row?.display_name || row?.guild_nick || row?.global_name || row?.username || 'DNI Citizen';
  }

  async function loadCitizens(force = false) {
    if (state.loading || (state.loaded && !force)) return;
    state.loading = true;
    state.error = '';
    try {
      const response = await fetch(ENDPOINT, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      state.citizens = Array.isArray(payload.citizens) ? payload.citizens : [];
      state.counts = payload.counts && typeof payload.counts === 'object' ? payload.counts : {};
      state.loaded = true;
      if (state.selectedId == null || !state.citizens.some(row => Number(row.id) === Number(state.selectedId))) {
        state.selectedId = state.citizens.length ? Number(state.citizens[0].id) : null;
      }
    } catch (error) {
      state.error = error?.message || String(error);
      state.citizens = [];
      state.counts = {};
      state.loaded = false;
    } finally {
      state.loading = false;
    }
  }

  function filteredCitizens() {
    const query = state.query.trim().toLowerCase();
    if (!query) return state.citizens;
    return state.citizens.filter(row => [
      citizenName(row), row.username, row.discord_user_id, row.mail_address,
      sourceLabel(row), row.account_status
    ].some(value => String(value || '').toLowerCase().includes(query)));
  }

  function citizenList(rows) {
    if (!rows.length) {
      return '<div class="dni-admin-notice">No Citizen records match this view.</div>';
    }
    return rows.map(row => {
      const selected = Number(row.id) === Number(state.selectedId) ? 'is-selected' : '';
      const location = row.in_dni_discord ? 'DNI DISCORD' : 'OUTSIDE SERVER';
      return `<button type="button" data-dni-admin-citizen-id="${Number(row.id)}" class="${selected}"><strong>${esc(citizenName(row))}</strong><span>${esc(sourceLabel(row))} · ${location} · ${esc(row.account_status || 'active')}</span></button>`;
    }).join('');
  }

  function citizenEditor() {
    const row = state.citizens.find(item => Number(item.id) === Number(state.selectedId));
    if (!row) {
      return '<section class="dni-admin-editor"><h3>Citizen Database</h3><p>Select a Citizen account to inspect its authentication and DNI Mail identity.</p></section>';
    }
    const roles = Array.isArray(row.discord_roles) ? row.discord_roles : [];
    return `<section class="dni-admin-editor">
      <h3>${esc(citizenName(row))}</h3>
      <p>Citizen #${Number(row.id)} · Discord ${esc(row.discord_user_id || 'unknown')}</p>
      <div class="dni-admin-notice"><strong>CITIZEN ACCESS</strong> · This identity is separate from DNI personnel. Clearance is fixed at CL/NON and membership promotion is handled automatically by Discord/Auth detection.</div>
      <div class="dni-admin-form" data-dni-citizen-inspector>
        <label>Username<input value="${attr(row.username || '')}" readonly></label>
        <label>DNI Mail Address<input value="${attr(row.mail_address || '')}" readonly></label>
        <label>Citizen Source<input value="${attr(sourceLabel(row))}" readonly></label>
        <label>Account Status<input value="${attr(String(row.account_status || 'active').toUpperCase())}" readonly></label>
        <label>Clearance<input value="CL/NON · UNCLASSIFIED" readonly></label>
        <label>DNI Discord<input value="${row.in_dni_discord ? 'MEMBER OF SERVER' : 'OUTSIDE SERVER'}" readonly></label>
        <label>Member Shadow ID<input value="${attr(row.shadow_user_id ?? '—')}" readonly></label>
        <label>Discord Roles<input value="${attr(roles.length ? `${roles.length} detected` : 'None detected')}" readonly></label>
        <label>First Seen<input value="${attr(formatTime(row.first_seen_at))}" readonly></label>
        <label>Last Login<input value="${attr(formatTime(row.last_login_at))}" readonly></label>
        <label class="wide">Last Role Sync<input value="${attr(formatTime(row.last_role_sync_at))}" readonly></label>
      </div>
    </section>`;
  }

  function renderCitizens() {
    const root = panel();
    const host = workspaceHost(root);
    if (!root || !host) return;
    root.querySelectorAll('[data-admin-workspace]').forEach(button => button.classList.remove('is-active'));
    citizenTab(root)?.classList.add('is-active');

    if (state.loading && !state.loaded) {
      host.innerHTML = '<section class="dni-admin-block"><div class="dni-admin-section-title"><span>CITIZEN DATABASE</span><span>LOADING</span></div><div class="dni-admin-notice">Loading Citizen authentication records from dni_citizen_users…</div></section>';
      return;
    }
    if (state.error) {
      host.innerHTML = `<section class="dni-admin-block"><div class="dni-admin-section-title"><span>CITIZEN DATABASE</span><span>ERROR</span></div><div class="dni-admin-notice is-error"><strong>CITIZEN DATA UNAVAILABLE</strong> · ${esc(state.error)}</div><div class="dni-admin-actions"><button class="dni-admin-action" type="button" data-dni-admin-citizen-refresh>RETRY</button></div></section>`;
      return;
    }

    const rows = filteredCitizens();
    host.innerHTML = `
      <div class="dni-admin-grid">
        <article class="dni-admin-card is-online"><span>Citizens</span><strong>${Number(state.counts.total ?? state.citizens.length)}</strong><small>Separate Citizen identity table</small></article>
        <article class="dni-admin-card"><span>In DNI Discord</span><strong>${Number(state.counts.inDniDiscord || 0)}</strong><small>Citizen-tier users inside the server</small></article>
        <article class="dni-admin-card"><span>Outside Server</span><strong>${Number(state.counts.outsideDniDiscord || 0)}</strong><small>Citizen-tier users outside DNI Discord</small></article>
        <article class="dni-admin-card"><span>Mail Domain</span><strong>@citizen.dni.org</strong><small>CL/NON direct DNI Mail access</small></article>
      </div>
      <form class="dni-admin-filterbar" data-dni-admin-citizen-search style="grid-template-columns:minmax(0,1fr) auto;margin-top:10px">
        <input name="query" maxlength="128" value="${attr(state.query)}" placeholder="Search Citizen name, Discord ID, source, or mail address">
        <button class="dni-admin-action" type="submit">SEARCH CITIZENS</button>
      </form>
      <div class="dni-admin-manager">
        <section class="dni-admin-list"><div class="dni-admin-list-head"><strong>CITIZEN DATABASE</strong><small>${rows.length} SHOWN · ${state.citizens.length} CURRENT CITIZENS</small></div>${citizenList(rows)}</section>
        ${citizenEditor()}
      </div>
      <div class="dni-admin-actions"><button class="dni-admin-action" type="button" data-dni-admin-citizen-refresh>REFRESH CITIZENS</button></div>`;
  }

  function hideCitizenShadowsFromMembers(root = panel()) {
    if (!root || state.active || !state.loaded) return;
    const usersTab = memberTab(root);
    if (!usersTab?.classList.contains('is-active')) return;
    const host = workspaceHost(root);
    if (!host) return;

    const citizenDiscordIds = new Set(state.citizens.map(row => String(row.discord_user_id || '')).filter(Boolean));
    let visible = 0;
    let selectedHidden = false;
    for (const button of host.querySelectorAll('[data-admin-select-user]')) {
      const text = String(button.textContent || '');
      const isCitizenShadow = [...citizenDiscordIds].some(id => text.includes(`Discord ${id}`));
      button.hidden = isCitizenShadow;
      if (isCitizenShadow && button.classList.contains('is-selected')) selectedHidden = true;
      if (!isCitizenShadow) visible++;
    }

    const head = host.querySelector('.dni-admin-list-head');
    if (head) {
      const strong = head.querySelector('strong');
      const small = head.querySelector('small');
      if (strong) strong.textContent = 'MEMBER DATABASE';
      if (small) small.textContent = `${visible} MEMBERS ON THIS PAGE · CITIZENS MANAGED SEPARATELY`;
    }

    if (selectedHidden) {
      const firstMember = [...host.querySelectorAll('[data-admin-select-user]')].find(button => !button.hidden);
      if (firstMember instanceof HTMLButtonElement) queueMicrotask(() => firstMember.click());
    }
  }

  function installTab() {
    const root = panel();
    if (!root) return;
    const tabs = root.querySelector('.dni-admin-worktabs');
    const members = memberTab(root);
    if (!tabs || !members) return;

    members.textContent = 'MEMBERS & PERSONNEL';
    let citizens = citizenTab(root);
    if (!citizens) {
      citizens = document.createElement('button');
      citizens.type = 'button';
      citizens.className = 'dni-admin-worktab';
      citizens.dataset.adminCitizensWorkspace = '1';
      citizens.textContent = 'CITIZENS';
      members.insertAdjacentElement('afterend', citizens);
    }
    citizens.classList.toggle('is-active', state.active);

    hideCitizenShadowsFromMembers(root);
  }

  async function openCitizens() {
    state.active = true;
    installTab();
    if (!state.loaded) {
      void loadCitizens().then(() => {
        renderCitizens();
      });
      renderCitizens();
      return;
    }
    renderCitizens();
  }

  document.addEventListener('click', event => {
    const root = panel();
    if (!root || !root.contains(event.target)) return;

    if (event.target.closest('[data-admin-citizens-workspace]')) {
      event.preventDefault();
      void openCitizens();
      return;
    }

    const builtIn = event.target.closest('[data-admin-workspace]');
    if (builtIn) {
      state.active = false;
      queueMicrotask(() => installTab());
      return;
    }

    const citizenButton = event.target.closest('[data-dni-admin-citizen-id]');
    if (citizenButton && state.active) {
      state.selectedId = Number(citizenButton.dataset.dniAdminCitizenId);
      renderCitizens();
      return;
    }

    if (event.target.closest('[data-dni-admin-citizen-refresh]') && state.active) {
      state.loading = true;
      renderCitizens();
      void loadCitizens(true).then(() => renderCitizens());
    }
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-dni-admin-citizen-search]');
    if (!form || !state.active) return;
    event.preventDefault();
    const data = new FormData(form);
    state.query = String(data.get('query') || '');
    renderCitizens();
  }, true);

  document.addEventListener('dni:admin-mounted', () => {
    state.active = false;
    installTab();
    void loadCitizens().then(() => hideCitizenShadowsFromMembers());
  });

  const observer = new MutationObserver(() => {
    installTab();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  installTab();
  void loadCitizens().then(() => hideCitizenShadowsFromMembers());
})();
