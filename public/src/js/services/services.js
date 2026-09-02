const root = document.querySelector('[data-module="services"]');

if (root) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const REFRESH_MS = 15000;
  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };

  let csrfToken = '';
  let servicesResponder = false;
  let flashMessage = '';
  let flashError = false;
  let refreshTimer = null;
  let loading = false;
  let panelActive = false;
  let lastSync = null;
  let currentTypes = [];
  let currentRequests = [];
  let databaseMode = 'server';
  let clearDraftOnNextRender = false;

  function normalizePath(pathname) {
    const clean = String(pathname || '/').replace(/\/+$/, '');
    return clean === '' ? '/' : clean;
  }

  function isDispatchView() {
    return normalizePath(window.location.pathname) === '/services/dispatch';
  }

  function serviceNextPath() {
    return isDispatchView() ? '/services/dispatch' : '/services';
  }

  async function request(action, options = {}, extra = '') {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.method && options.method !== 'GET' && csrfToken) headers['X-DNI-CSRF'] = csrfToken;
    const suffix = extra ? `&${extra}` : '';
    const response = await fetch(`/services-data.php?action=${encodeURIComponent(action)}${suffix}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || `${response.status} ${response.statusText}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    if (payload?.csrfToken) csrfToken = payload.csrfToken;
    if (payload?.serverTime) lastSync = new Date(payload.serverTime);
    if (payload?.databaseMode && action !== 'types') databaseMode = String(payload.databaseMode);
    return payload;
  }

  function signIn(message = 'Discord sign-in is required to submit or respond to DNI service requests.') {
    stopRefresh();
    const next = encodeURIComponent(serviceNextPath());
    root.className = 'module-panel dni-module-panel';
    root.innerHTML = `<header class="dni-module-header"><div><span>DNI SERVICE DISPATCH</span><h2>${isDispatchView() ? 'Dispatch Command' : 'DNI Services'}</h2><p>Operational support request and responder workflow.</p></div><strong class="dni-state-badge">AUTH REQUIRED</strong></header><section class="dni-auth-card"><p>${esc(message)}</p><a class="dni-primary-action" href="/auth/discord/login?next=${next}">SIGN IN WITH DISCORD</a></section>`;
  }

  function statusLabel(status) {
    return String(status || '').replaceAll('_', ' ').toUpperCase();
  }

  function statusTime(item) {
    const value = item.completedAt || item.inProgressAt || item.claimedAt || item.updatedAt || item.createdAt;
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }

  function sortRequests(items) {
    return [...items].sort((a, b) => {
      const priorityDelta = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }

  function requestCard(item) {
    const controls = [];
    if (item.canClaim) controls.push(`<button data-service-action="claim" data-request-id="${item.id}">CLAIM</button>`);
    if (item.canStart) controls.push(`<button data-service-action="start" data-request-id="${item.id}">START WORK</button>`);
    if (item.canComplete) controls.push(`<button data-service-action="complete" data-request-id="${item.id}">COMPLETE</button>`);
    const when = statusTime(item);
    const ownerBadge = item.isOwner ? '<span>REQUEST <b>YOURS</b></span>' : '';
    const claimantBadge = item.isClaimant ? '<span>ASSIGNMENT <b>YOU</b></span>' : '';
    return `<article class="dni-service-card priority-${esc(item.priority)}" data-service-id="${item.id}">
      <header><span>#${item.id} · ${esc(item.typeName)}</span><em class="dni-status-${esc(item.status)}">${esc(statusLabel(item.status))}</em></header>
      <h4>${esc(item.location)}</h4>
      <p>${esc(item.notes || 'No additional details provided.')}</p>
      <div class="dni-service-meta"><span>REQUESTER <b>${esc(item.requesterName)}</b></span><span>RESPONDER <b>${esc(item.claimantName || 'UNCLAIMED')}</b></span><span>PRIORITY <b>${esc(item.priority).toUpperCase()}</b></span>${ownerBadge}${claimantBadge}${when ? `<span>UPDATED <b>${esc(when)}</b></span>` : ''}</div>
      ${controls.length ? `<div class="dni-service-actions">${controls.join('')}</div>` : ''}
    </article>`;
  }

  function flashMarkup() {
    if (!flashMessage) return '';
    const className = flashError ? 'dni-error' : 'dni-loading';
    const label = flashError ? 'DISPATCH ERROR' : 'DISPATCH UPDATE';
    return `<div class="${className}" data-service-flash><span>${label}</span><b>${esc(flashMessage)}</b></div>`;
  }

  function captureDraft() {
    const form = root.querySelector('#dni-service-request-form');
    if (!form) return null;
    const values = new FormData(form);
    return {
      typeKey: String(values.get('typeKey') || ''),
      priority: String(values.get('priority') || 'normal'),
      location: String(values.get('location') || ''),
      notes: String(values.get('notes') || '')
    };
  }

  function restoreDraft(draft) {
    if (!draft) return;
    const form = root.querySelector('#dni-service-request-form');
    if (!form) return;
    if (form.elements.typeKey && draft.typeKey) form.elements.typeKey.value = draft.typeKey;
    if (form.elements.priority && draft.priority) form.elements.priority.value = draft.priority;
    if (form.elements.location) form.elements.location.value = draft.location;
    if (form.elements.notes) form.elements.notes.value = draft.notes;
  }

  function databaseLabel() {
    const mode = String(databaseMode || '').toLowerCase();
    if (mode === 'mariadb') return 'MARIADB';
    if (mode === 'embedded-server') return 'SERVER STORE';
    return 'SERVER';
  }

  function syncLabel() {
    if (!(lastSync instanceof Date) || Number.isNaN(lastSync.getTime())) return 'LIVE';
    return `SYNC ${lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
  }

  function serviceCounts(items) {
    return {
      open: items.filter(item => item.status === 'open').length,
      claimed: items.filter(item => item.status === 'claimed').length,
      progress: items.filter(item => item.status === 'in_progress').length,
      active: items.filter(item => item.status !== 'completed').length
    };
  }

  function serviceCatalogMarkup(types, requests) {
    return types.map(type => {
      const matching = requests.filter(item => item.typeKey === type.typeKey && item.status !== 'completed');
      const count = serviceCounts(matching);
      return `<span>${esc(type.name)} <b>${count.active} ACTIVE · ${count.open} OPEN</b></span>`;
    }).join('');
  }

  function wireServiceActions() {
    for (const button of root.querySelectorAll('[data-service-action]')) {
      button.addEventListener('click', async () => {
        const id = button.dataset.requestId;
        const action = button.dataset.serviceAction;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'UPDATING…';
        try {
          const result = await request(action, { method: 'POST', body: '{}' }, `id=${encodeURIComponent(id)}`);
          const labels = { claim: 'claimed', start: 'moved to IN PROGRESS', complete: 'completed' };
          flashMessage = `Service request #${result.requestId || id} ${labels[action] || 'updated'}.`;
          await load({ forceLoading: false, preserveDraft: !isDispatchView() });
        } catch (error) {
          flashMessage = error.message || String(error);
          flashError = true;
          button.disabled = false;
          button.textContent = original;
          await load({ forceLoading: false, preserveDraft: !isDispatchView() });
        }
      });
    }
  }

  function renderDispatch(active, completed, stats = null) {
    const openCount = stats?.open ?? active.filter(item => item.status === 'open').length;
    const claimedCount = stats?.claimed ?? active.filter(item => item.status === 'claimed').length;
    const progressCount = stats?.in_progress ?? active.filter(item => item.status === 'in_progress').length;

    if (!servicesResponder) {
      root.innerHTML = `
        <header class="dni-module-header">
          <div><span>DNI SERVICE DISPATCH</span><h2>Dispatch Command</h2><p>Responder workboard for Dreadnought Imperium service operations in Star Citizen.</p></div>
          <strong class="dni-state-badge">RESPONDER AUTH REQUIRED</strong>
        </header>
        <div class="comms-statusbar" aria-label="DNI Services status">
          <span><b>OPEN</b> ${openCount}</span>
          <span><b>CLAIMED</b> ${claimedCount}</span>
          <span><b>IN PROGRESS</b> ${progressCount}</span>
          <span class="status-online is-online"><i></i> ${esc(syncLabel())}</span>
        </div>
        <section class="dni-auth-card">
          <p>Dedicated dispatch is restricted to authorized DNI service responders and administrators.</p>
          <a class="dni-primary-action" href="/services">RETURN TO SERVICE REQUESTS</a>
        </section>`;
      return;
    }

    const groups = currentTypes.map(type => ({
      type,
      items: sortRequests(active.filter(item => item.typeKey === type.typeKey))
    }));
    const knownKeys = new Set(currentTypes.map(type => type.typeKey));
    const unclassified = sortRequests(active.filter(item => !knownKeys.has(item.typeKey)));

    root.innerHTML = `
      <header class="dni-module-header">
        <div><span>DNI SERVICE DISPATCH</span><h2>Dispatch Command</h2><p>Dedicated responder workboard for medical, rescue, engineering, refueling, logistics, security, recovery, transport, reconnaissance, salvage, mining support, and general org operations.</p></div>
        <strong class="dni-state-badge is-online">RESPONDER ONLINE</strong>
      </header>
      <div class="comms-statusbar" aria-label="DNI Dispatch status">
        <span><b>DATABASE</b> ${esc(databaseLabel())}</span>
        <span><b>OPEN</b> ${openCount}</span>
        <span><b>CLAIMED</b> ${claimedCount}</span>
        <span><b>IN PROGRESS</b> ${progressCount}</span>
        <span class="status-online is-online"><i></i> ${esc(syncLabel())}</span>
      </div>
      ${flashMarkup()}
      <section class="dni-section-block">
        <div class="dni-section-heading"><div><span>ORG SERVICE NETWORK</span><h3>Dispatch Channels</h3></div><div><a class="small-action" href="/services">REQUEST FORM</a> <button class="small-action" type="button" id="dni-services-refresh">REFRESH</button></div></div>
        <div class="dni-service-meta">${serviceCatalogMarkup(currentTypes, active)}</div>
      </section>
      ${groups.map(({ type, items }) => {
        const count = serviceCounts(items);
        return `<section class="dni-dispatch-panel" data-dispatch-channel="${esc(type.typeKey)}">
          <div class="dni-section-heading"><div><span>${esc(type.name)}</span><h3>${esc(type.description || `${type.name} dispatch queue`)}</h3></div><b>${count.active} ACTIVE · ${count.open} OPEN · ${count.claimed} CLAIMED · ${count.progress} IN PROGRESS</b></div>
          <div class="dni-service-board">${items.length ? items.map(requestCard).join('') : '<div class="dni-empty">No active requests in this channel.</div>'}</div>
        </section>`;
      }).join('')}
      ${unclassified.length ? `<section class="dni-dispatch-panel"><div class="dni-section-heading"><div><span>OTHER</span><h3>Unclassified Dispatch</h3></div><b>${unclassified.length} ACTIVE</b></div><div class="dni-service-board">${unclassified.map(requestCard).join('')}</div></section>` : ''}
      <section class="dni-section-block">
        <div class="dni-section-heading"><div><span>RECENTLY CLOSED</span><h3>Completed Dispatches</h3></div><b>${completed.slice(0, 20).length} SHOWN</b></div>
        <div class="dni-service-history">${completed.slice(0, 20).map(requestCard).join('') || '<div class="dni-empty">No completed requests yet.</div>'}</div>
      </section>`;

    flashMessage = '';
    flashError = false;
    root.querySelector('#dni-services-refresh')?.addEventListener('click', () => void load({ forceLoading: true, preserveDraft: false }));
    wireServiceActions();
  }

  function render(types, requests, stats = null, draft = null) {
    currentTypes = Array.isArray(types) ? types : [];
    currentRequests = Array.isArray(requests) ? requests : [];

    root.className = 'module-panel dni-module-panel';
    const active = sortRequests(currentRequests.filter(item => item.status !== 'completed'));
    const completed = [...currentRequests]
      .filter(item => item.status === 'completed')
      .sort((a, b) => new Date(b.completedAt || b.updatedAt || 0).getTime() - new Date(a.completedAt || a.updatedAt || 0).getTime());

    if (isDispatchView()) {
      renderDispatch(active, completed, stats);
      return;
    }

    const openCount = stats?.open ?? active.filter(item => item.status === 'open').length;
    const claimedCount = stats?.claimed ?? active.filter(item => item.status === 'claimed').length;
    const progressCount = stats?.in_progress ?? active.filter(item => item.status === 'in_progress').length;
    const draftToRestore = clearDraftOnNextRender ? null : draft;
    clearDraftOnNextRender = false;

    root.innerHTML = `
      <header class="dni-module-header">
        <div><span>DNI SERVICE NETWORK</span><h2>DNI Services</h2><p>Submit operational support requests and track responder workflow.</p></div>
        <strong class="dni-state-badge is-online">${servicesResponder ? 'RESPONDER ONLINE' : 'DISPATCH ONLINE'}</strong>
      </header>
      <div class="comms-statusbar" aria-label="DNI Services status">
        <span><b>DATABASE</b> ${esc(databaseLabel())}</span>
        <span><b>OPEN</b> ${openCount}</span>
        <span><b>CLAIMED</b> ${claimedCount}</span>
        <span><b>IN PROGRESS</b> ${progressCount}</span>
        <span class="status-online is-online"><i></i> ${esc(syncLabel())}</span>
      </div>
      ${flashMarkup()}
      <div class="dni-services-layout">
        <section class="dni-request-panel">
          <div class="dni-section-heading"><div><span>NEW REQUEST</span><h3>Request Support</h3></div><div>${servicesResponder ? '<a class="small-action" href="/services/dispatch">OPEN DISPATCH</a> ' : ''}<b>OPEN → CLAIMED → IN PROGRESS → COMPLETED</b></div></div>
          <form id="dni-service-request-form" class="dni-form">
            <label>Service Type<select name="typeKey" required>${currentTypes.map(type => `<option value="${esc(type.typeKey)}" title="${esc(type.description || '')}">${esc(type.name)}</option>`).join('')}</select></label>
            <label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option><option value="low">Low</option></select></label>
            <label class="dni-form-wide">Location<input name="location" maxlength="180" required placeholder="System / planet / moon / station / coordinates"></label>
            <label class="dni-form-wide">Request Details<textarea name="notes" rows="5" maxlength="1200" placeholder="Describe the assistance required, ship/vehicle, party size, and any immediate hazards"></textarea></label>
            <button class="dni-primary-action dni-form-wide" type="submit" ${currentTypes.length ? '' : 'disabled'}>SUBMIT SERVICE REQUEST</button>
          </form>
          <div class="dni-service-meta">${currentTypes.map(type => `<span>${esc(type.name)} <b>${esc(type.description || '')}</b></span>`).join('')}</div>
        </section>
        <section class="dni-dispatch-panel">
          <div class="dni-section-heading"><div><span>REQUEST STATUS</span><h3>Active Requests</h3></div><div><b>${active.length} ACTIVE</b> <button class="small-action" type="button" id="dni-services-refresh">REFRESH</button></div></div>
          <div class="dni-service-board">${active.length ? active.map(requestCard).join('') : '<div class="dni-empty">No active service requests.</div>'}</div>
        </section>
      </div>
      <section class="dni-section-block">
        <div class="dni-section-heading"><div><span>RECENTLY CLOSED</span><h3>Completed Requests</h3></div><b>${completed.slice(0, 12).length} SHOWN</b></div>
        <div class="dni-service-history">${completed.slice(0, 12).map(requestCard).join('') || '<div class="dni-empty">No completed requests yet.</div>'}</div>
      </section>`;

    restoreDraft(draftToRestore);
    flashMessage = '';
    flashError = false;

    root.querySelector('#dni-services-refresh')?.addEventListener('click', () => void load({ forceLoading: true }));

    root.querySelector('#dni-service-request-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'SUBMITTING…';
      try {
        const result = await request('requests', {
          method: 'POST',
          body: JSON.stringify({
            typeKey: String(values.get('typeKey') || ''),
            priority: String(values.get('priority') || 'normal'),
            location: String(values.get('location') || '').trim(),
            notes: String(values.get('notes') || '').trim()
          })
        });
        form.reset();
        clearDraftOnNextRender = true;
        flashMessage = `Service request #${result.requestId || '?'} opened and added to Active Dispatch.`;
        await load({ forceLoading: false, preserveDraft: false });
      } catch (error) {
        flashMessage = error.message || String(error);
        flashError = true;
        await load({ forceLoading: false, preserveDraft: true });
      }
    });

    wireServiceActions();
  }

  async function load({ forceLoading = false, preserveDraft = true } = {}) {
    if (loading) return;
    loading = true;
    const draft = preserveDraft ? captureDraft() : null;

    if (forceLoading || !currentTypes.length) {
      root.className = 'module-panel dni-module-panel';
      root.innerHTML = `<div class="dni-loading"><span>${isDispatchView() ? 'DNI DISPATCH' : 'DNI SERVICES'}</span><b>Synchronizing DNI service network…</b></div>`;
    }

    try {
      const session = await request('session', { method: 'GET' });
      if (!session.authenticated) {
        loading = false;
        return signIn(session.message);
      }
      csrfToken = String(session.csrfToken || csrfToken);
      servicesResponder = Boolean(session.servicesResponder);

      const [typesPayload, requestsPayload] = await Promise.all([
        request('types', { method: 'GET' }),
        request('requests', { method: 'GET' })
      ]);

      servicesResponder = Boolean(requestsPayload.servicesResponder ?? servicesResponder);
      render(typesPayload.types || [], requestsPayload.requests || [], requestsPayload.stats || null, draft);
    } catch (error) {
      if (error.status === 401) {
        loading = false;
        return signIn(error.payload?.error);
      }
      root.className = 'module-panel dni-module-panel';
      root.innerHTML = `<header class="dni-module-header"><div><span>DNI SERVICE DISPATCH</span><h2>${isDispatchView() ? 'Dispatch Command' : 'DNI Services'}</h2></div><strong class="dni-state-badge is-error">UNAVAILABLE</strong></header><div class="dni-error">${esc(error.message || error)}</div><button class="dni-primary-action" type="button" id="dni-services-retry">RETRY DISPATCH LINK</button>`;
      root.querySelector('#dni-services-retry')?.addEventListener('click', () => void load({ forceLoading: true }));
    } finally {
      loading = false;
    }
  }

  function stopRefresh() {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function startRefresh() {
    stopRefresh();
    refreshTimer = window.setInterval(() => {
      if (!panelActive || document.hidden || loading) return;
      void load({ forceLoading: false, preserveDraft: !isDispatchView() });
    }, REFRESH_MS);
  }

  window.addEventListener('dni:panel', event => {
    panelActive = event.detail?.panel === 'services';
    if (panelActive) {
      void load({ forceLoading: !currentTypes.length, preserveDraft: !isDispatchView() });
      startRefresh();
    } else {
      stopRefresh();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopRefresh();
    } else if (panelActive) {
      void load({ forceLoading: false, preserveDraft: !isDispatchView() });
      startRefresh();
    }
  });

  panelActive = document.querySelector('.terminal-shell')?.dataset?.panel === 'services';
  void load({ forceLoading: true, preserveDraft: !isDispatchView() });
  if (panelActive) startRefresh();
}
