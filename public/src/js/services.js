const root = document.querySelector('[data-module="services"]');

if (root) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  let csrfToken = '';

  async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.method && options.method !== 'GET' && csrfToken) headers['X-DNI-CSRF'] = csrfToken;
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || `${response.status} ${response.statusText}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    if (payload?.csrfToken) csrfToken = payload.csrfToken;
    return payload;
  }

  function signIn(message = 'Discord sign-in is required to submit or respond to DNI service requests.') {
    root.className = 'module-panel dni-module-panel';
    root.innerHTML = `<header class="dni-module-header"><div><span>DNI SERVICE DISPATCH</span><h2>DNI Services</h2><p>Operational support request and responder workflow.</p></div><strong class="dni-state-badge">AUTH REQUIRED</strong></header><section class="dni-auth-card"><p>${esc(message)}</p><a class="dni-primary-action" href="/auth/discord/login?next=/services">SIGN IN WITH DISCORD</a></section>`;
  }

  function setupRequired(message) {
    root.className = 'module-panel dni-module-panel';
    root.innerHTML = `<header class="dni-module-header"><div><span>DNI SERVICE DISPATCH</span><h2>DNI Services</h2><p>The Services module is installed and ready for the DNI database.</p></div><strong class="dni-state-badge">DATABASE SETUP</strong></header><section class="dni-auth-card"><p>${esc(message || 'MariaDB application credentials must be provisioned before service requests can be stored.')}</p><a class="dni-primary-action" href="/admin">OPEN DNI ADMIN</a></section>`;
  }

  function statusLabel(status) {
    return String(status || '').replaceAll('_', ' ').toUpperCase();
  }

  function render(types, requests) {
    root.className = 'module-panel dni-module-panel';
    const active = requests.filter(item => item.status !== 'completed');
    const completed = requests.filter(item => item.status === 'completed');
    root.innerHTML = `
      <header class="dni-module-header">
        <div><span>DNI SERVICE DISPATCH</span><h2>DNI Services</h2><p>Submit operational support requests and track responder workflow in real time.</p></div>
        <strong class="dni-state-badge is-online">DISPATCH ONLINE</strong>
      </header>
      <div class="dni-services-layout">
        <section class="dni-request-panel">
          <div class="dni-section-heading"><div><span>NEW REQUEST</span><h3>Request Support</h3></div><b>OPEN → CLAIMED → IN PROGRESS → COMPLETED</b></div>
          <form id="dni-service-request-form" class="dni-form">
            <label>Service Type<select name="typeKey" required>${types.map(type => `<option value="${esc(type.typeKey)}">${esc(type.name)}</option>`).join('')}</select></label>
            <label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option><option value="low">Low</option></select></label>
            <label class="dni-form-wide">Location<input name="location" maxlength="180" required placeholder="Sector / planet / station / coordinates"></label>
            <label class="dni-form-wide">Request Details<textarea name="notes" rows="5" maxlength="1200" placeholder="Describe the assistance required"></textarea></label>
            <button class="dni-primary-action dni-form-wide" type="submit">SUBMIT SERVICE REQUEST</button>
          </form>
        </section>
        <section class="dni-dispatch-panel">
          <div class="dni-section-heading"><div><span>MULTI-REQUEST BOARD</span><h3>Active Dispatch</h3></div><b>${active.length} ACTIVE</b></div>
          <div class="dni-service-board">
            ${active.length ? active.map(requestCard).join('') : '<div class="dni-empty">No active service requests.</div>'}
          </div>
        </section>
      </div>
      <section class="dni-section-block">
        <div class="dni-section-heading"><div><span>RECENTLY CLOSED</span><h3>Completed Requests</h3></div><b>${completed.length} SHOWN</b></div>
        <div class="dni-service-history">${completed.slice(0, 12).map(requestCard).join('') || '<div class="dni-empty">No completed requests yet.</div>'}</div>
      </section>`;

    root.querySelector('#dni-service-request-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await request('/api/dni/services/requests', {
          method: 'POST',
          body: JSON.stringify({
            typeKey: String(values.get('typeKey') || ''),
            priority: String(values.get('priority') || 'normal'),
            location: String(values.get('location') || '').trim(),
            notes: String(values.get('notes') || '').trim()
          })
        });
        form.reset();
        await load();
      } catch (error) {
        alert(error.message || error);
      } finally {
        button.disabled = false;
      }
    });

    for (const button of root.querySelectorAll('[data-service-action]')) {
      button.addEventListener('click', async () => {
        const id = button.dataset.requestId;
        const action = button.dataset.serviceAction;
        button.disabled = true;
        try {
          await request(`/api/dni/services/requests/${id}/${action}`, { method: 'POST', body: '{}' });
          await load();
        } catch (error) {
          alert(error.message || error);
        } finally {
          button.disabled = false;
        }
      });
    }
  }

  function requestCard(item) {
    const controls = [];
    if (item.canClaim) controls.push(`<button data-service-action="claim" data-request-id="${item.id}">CLAIM</button>`);
    if (item.canStart) controls.push(`<button data-service-action="start" data-request-id="${item.id}">START WORK</button>`);
    if (item.canComplete) controls.push(`<button data-service-action="complete" data-request-id="${item.id}">COMPLETE</button>`);
    return `<article class="dni-service-card priority-${esc(item.priority)}">
      <header><span>#${item.id} · ${esc(item.typeName)}</span><em class="dni-status-${esc(item.status)}">${esc(statusLabel(item.status))}</em></header>
      <h4>${esc(item.location)}</h4>
      <p>${esc(item.notes || 'No additional details provided.')}</p>
      <div class="dni-service-meta"><span>REQUESTER <b>${esc(item.requesterName)}</b></span><span>RESPONDER <b>${esc(item.claimantName || 'UNCLAIMED')}</b></span><span>PRIORITY <b>${esc(item.priority).toUpperCase()}</b></span></div>
      ${controls.length ? `<div class="dni-service-actions">${controls.join('')}</div>` : ''}
    </article>`;
  }

  async function load() {
    root.className = 'module-panel dni-module-panel';
    root.innerHTML = '<div class="dni-loading"><span>DNI SERVICES</span><b>Synchronizing dispatch board…</b></div>';
    try {
      const session = await request('/api/dni/session', { method: 'GET' });
      if (session.setupRequired) return setupRequired(session.message);
      if (!session.authenticated) return signIn(session.message);
      csrfToken = String(session.csrfToken || csrfToken);
      const [typesPayload, requestsPayload] = await Promise.all([
        request('/api/dni/services/types', { method: 'GET' }),
        request('/api/dni/services/requests', { method: 'GET' })
      ]);
      render(typesPayload.types || [], requestsPayload.requests || []);
    } catch (error) {
      if (error.status === 401) return signIn(error.payload?.error);
      if (error.status === 503 && error.payload?.setupRequired) return setupRequired(error.payload?.error);
      root.innerHTML = `<header class="dni-module-header"><div><span>DNI SERVICE DISPATCH</span><h2>DNI Services</h2></div><strong class="dni-state-badge is-error">UNAVAILABLE</strong></header><div class="dni-error">${esc(error.message || error)}</div>`;
    }
  }

  window.addEventListener('dni:panel', event => { if (event.detail?.panel === 'services') void load(); });
  void load();
}
