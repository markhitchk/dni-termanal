// DNI Admin workspace/control hardener.
//
// admin.js remains the canonical owner of Users, Sectors & Assets, and System.
// This helper only provides a post-click fallback when the Sectors & Assets
// workspace is swallowed by another listener, and adds the admin-only document
// archive/remove workspace.

const hardenedPanels = new WeakMap();
const documentsState = {
  csrfToken: '',
  documents: [],
  busy: false,
  error: ''
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function hardenAdminPanel(panel) {
  if (!(panel instanceof HTMLElement)) return;

  // Keep admin.js property handlers intact. Earlier hardening revisions moved
  // these handlers between onclick/addEventListener across re-renders, which
  // could leave the Sectors & Assets tab pointing at a stale handler.
  hardenedPanels.set(panel, {
    click: typeof panel.onclick === 'function' ? panel.onclick : hardenedPanels.get(panel)?.click || null,
    submit: typeof panel.onsubmit === 'function' ? panel.onsubmit : hardenedPanels.get(panel)?.submit || null
  });

  panel.dataset.adminControlsHardened = '2';
  bindDocumentsEvents(panel);
  ensureDocumentsTab(panel);
}

function currentAdminPanel(eventTarget = null) {
  if (eventTarget instanceof Element) {
    const direct = eventTarget.closest('[data-module="admin"]');
    if (direct) return direct;
  }
  return document.querySelector('[data-module="admin"]');
}

function removeLegacyPrimaryAction(panel) {
  if (!(panel instanceof HTMLElement)) return;
  panel.querySelector('[data-admin-primary-actions]')?.remove();
}

function primaryClickHandler(panel) {
  if (!(panel instanceof HTMLElement)) return null;
  if (typeof panel.onclick === 'function') return panel.onclick;
  const durable = hardenedPanels.get(panel)?.click;
  return typeof durable === 'function' ? durable : null;
}

function sectorsWorkspaceReady(panel) {
  if (!(panel instanceof HTMLElement)) return false;
  const button = panel.querySelector('[data-admin-workspace="sectors"]');
  const host = panel.querySelector('.dni-admin-workspace');
  if (!button?.classList.contains('is-active') || !host) return false;
  return host.textContent.includes('SECTOR DATABASE') && host.textContent.includes('ASSET DATABASE');
}

function routeSectorsFallback(event) {
  const workspaceButton = event.target instanceof Element
    ? event.target.closest('[data-admin-workspace="sectors"]')
    : null;
  if (!(workspaceButton instanceof HTMLButtonElement)) return;

  const panel = workspaceButton.closest('[data-module="admin"]');
  if (!(panel instanceof HTMLElement)) return;

  // Let the normal admin.js click handler run first. If another listener ate
  // the event, retry the canonical handler after dispatch has completed.
  queueMicrotask(() => {
    if (sectorsWorkspaceReady(panel)) return;
    const handler = primaryClickHandler(panel);
    if (typeof handler !== 'function') return;
    void handler.call(panel, event);
    panel.dataset.adminWorkspaceRouted = 'sectors';
  });
}

async function adminDocumentsRequest(action = 'list', body = null) {
  const options = {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  };

  if (body !== null) {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.headers['X-DNI-CSRF'] = documentsState.csrfToken;
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`/admin-documents.php?action=${encodeURIComponent(action)}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI Admin documents HTTP ${response.status}`);
  documentsState.csrfToken = String(payload.csrfToken || documentsState.csrfToken || '');
  documentsState.documents = Array.isArray(payload.documents) ? payload.documents : [];
  return payload;
}

function activeDocuments() {
  return documentsState.documents.filter(document => String(document.status || '').toUpperCase() !== 'ARCHIVED');
}

function documentCard(document) {
  const code = String(document.file_code || document.fileCode || document.id || 'DNI RECORD');
  const clearance = document.clearance?.code || document.classification || 'CLASSIFIED';
  const status = String(document.status || 'UNKNOWN').toUpperCase();
  const updated = document.updated_at ? new Date(document.updated_at).toLocaleString() : 'NO UPDATE TIME';
  return `<section class="dni-admin-editor" data-admin-document="${esc(code)}">
    <h3>${esc(code)} · ${esc(document.title || 'Untitled DNI Document')}</h3>
    <p>${esc(clearance)} · ${esc(status)} · UPDATED ${esc(updated)}</p>
    ${document.summary ? `<div class="dni-admin-notice">${esc(document.summary)}</div>` : ''}
    <div class="dni-admin-actions">
      <button class="dni-admin-action is-danger" type="button" data-admin-remove-document="${esc(code)}">REMOVE DOCUMENT</button>
    </div>
  </section>`;
}

function renderDocumentsWorkspace(panel) {
  const host = panel?.querySelector('.dni-admin-workspace');
  if (!host) return;

  if (documentsState.busy) {
    host.innerHTML = '<section class="dni-admin-block"><div class="dni-admin-notice">Loading DNI document administration…</div></section>';
    return;
  }

  if (documentsState.error) {
    host.innerHTML = `<section class="dni-admin-block"><div class="dni-admin-notice is-error"><strong>DOCUMENT ADMINISTRATION UNAVAILABLE</strong> · ${esc(documentsState.error)}</div></section>`;
    return;
  }

  const documents = activeDocuments();
  host.innerHTML = `<section class="dni-admin-block">
    <div class="dni-admin-section-title"><span>DOCUMENT DATABASE</span><span>${documents.length} ACTIVE RECORDS</span></div>
    <div class="dni-admin-notice"><strong>ADMIN REMOVE</strong> · Removing a document archives it from active DNI document views while preserving its workflow history.</div>
    <div class="dni-admin-split">
      ${documents.length ? documents.map(documentCard).join('') : '<div class="dni-admin-notice">No active DNI documents are stored in the embedded database.</div>'}
    </div>
  </section>`;
}

async function openDocumentsWorkspace(panel) {
  if (!(panel instanceof HTMLElement)) return;
  for (const button of panel.querySelectorAll('[data-admin-workspace]')) button.classList.remove('is-active');
  panel.querySelector('[data-admin-documents-workspace]')?.classList.add('is-active');

  documentsState.busy = true;
  documentsState.error = '';
  renderDocumentsWorkspace(panel);
  try {
    await adminDocumentsRequest('list');
  } catch (error) {
    documentsState.error = error.message || String(error);
  } finally {
    documentsState.busy = false;
    renderDocumentsWorkspace(panel);
  }
}

async function removeDocument(panel, fileCode) {
  if (documentsState.busy || !fileCode) return;
  const approved = window.confirm(`Remove ${fileCode} from active DNI documents? The record will be archived and its workflow history preserved.`);
  if (!approved) return;

  documentsState.busy = true;
  documentsState.error = '';
  renderDocumentsWorkspace(panel);
  try {
    await adminDocumentsRequest('archive', { number: fileCode });
  } catch (error) {
    documentsState.error = error.message || String(error);
  } finally {
    documentsState.busy = false;
    renderDocumentsWorkspace(panel);
  }
}

function ensureDocumentsTab(panel) {
  if (!(panel instanceof HTMLElement)) return;
  const tabs = panel.querySelector('.dni-admin-worktabs');
  if (!tabs || tabs.querySelector('[data-admin-documents-workspace]')) return;

  const button = document.createElement('button');
  button.className = 'dni-admin-worktab';
  button.type = 'button';
  button.dataset.adminDocumentsWorkspace = 'documents';
  button.textContent = 'DOCUMENTS';

  const system = tabs.querySelector('[data-admin-workspace="system"]');
  if (system) tabs.insertBefore(button, system);
  else tabs.append(button);
}

function bindDocumentsEvents(panel) {
  if (!(panel instanceof HTMLElement) || panel.dataset.adminDocumentsBound === '1') return;
  panel.dataset.adminDocumentsBound = '1';

  panel.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-admin-workspace]')) {
      panel.querySelector('[data-admin-documents-workspace]')?.classList.remove('is-active');
      return;
    }

    if (target.closest('[data-admin-documents-workspace]')) {
      void openDocumentsWorkspace(panel);
      return;
    }

    const removeButton = target.closest('[data-admin-remove-document]');
    if (removeButton) {
      void removeDocument(panel, removeButton.dataset.adminRemoveDocument || '');
    }
  });
}

function hardenAfterRender(eventTarget = null) {
  queueMicrotask(() => {
    const panel = currentAdminPanel(eventTarget);
    hardenAdminPanel(panel);
    removeLegacyPrimaryAction(panel);
  });
}

// Only retry Sectors & Assets after the normal click path has had a chance to
// render. This avoids the double-routing behavior from the previous hardener.
document.addEventListener('click', routeSectorsFallback, true);

document.addEventListener('dni:admin-mounted', event => {
  hardenAfterRender(event.target);
});

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') hardenAfterRender();
});

hardenAfterRender();
