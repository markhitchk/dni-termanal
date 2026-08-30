// DNI Admin workspace/control hardener.
//
// admin.js remains the canonical owner of Users, Sectors & Assets, and System.
// This helper keeps those workspaces visible through SPA/mobile routing and adds
// the admin-only document archive/remove workspace.

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

function revealPrimaryWorkspace(panel) {
  if (!(panel instanceof HTMLElement)) return null;
  const normal = panel.querySelector('.dni-admin-workspace');
  if (!normal) return null;
  normal.hidden = false;
  normal.removeAttribute('hidden');
  normal.style.removeProperty('display');
  return normal;
}

function closeExtensionWorkspaces(panel) {
  if (!(panel instanceof HTMLElement)) return;

  revealPrimaryWorkspace(panel);

  for (const selector of [
    '[data-operational-classification-host]',
    '[data-clearance-admin-host]'
  ]) {
    for (const host of panel.querySelectorAll(selector)) {
      host.hidden = true;
      host.setAttribute('hidden', '');
    }
  }

  panel.querySelector('[data-operational-classification-tab]')?.classList.remove('is-active');
  panel.querySelector('[data-clearance-admin-tab]')?.classList.remove('is-active');
  panel.querySelector('[data-admin-documents-workspace]')?.classList.remove('is-active');
}

function sectorsWorkspaceReady(panel) {
  if (!(panel instanceof HTMLElement)) return false;
  const button = panel.querySelector('[data-admin-workspace="sectors"]');
  const host = panel.querySelector('.dni-admin-workspace');
  if (!button?.classList.contains('is-active') || !host || host.hidden) return false;
  return host.textContent.includes('SECTOR DATABASE') && host.textContent.includes('ASSET DATABASE');
}

function sectorsWorkspaceDataUnavailable(panel) {
  const host = panel?.querySelector('.dni-admin-workspace');
  if (!host || host.hidden) return false;
  const text = String(host.textContent || '');
  return /Sectors & Assets/i.test(text) && /DATABASE UNAVAILABLE/i.test(text);
}

function friendlySectorsError(error) {
  const raw = error?.message || String(error || 'Unknown sector editor error.');
  if (/sectors is not defined/i.test(raw)) {
    return {
      code: 'stale-runtime',
      message: 'DNI Admin loaded an outdated sector editor module. Retry after Admin finishes refreshing its workspace.'
    };
  }
  if (/primary workspace handler is unavailable/i.test(raw)) {
    return {
      code: 'handler-unavailable',
      message: 'DNI Admin primary workspace handler is unavailable. Retry after Admin finishes binding its controls.'
    };
  }
  return { code: 'workspace-error', message: raw };
}

function showSectorsError(panel, error) {
  const host = revealPrimaryWorkspace(panel);
  if (!host) return;
  const failure = friendlySectorsError(error);
  for (const button of panel.querySelectorAll('[data-admin-workspace]')) {
    button.classList.toggle('is-active', button.dataset.adminWorkspace === 'sectors');
  }
  host.innerHTML = `<section class="dni-admin-block"><div class="dni-admin-section-title"><span>SECTORS & ASSETS</span><span>EDITOR ERROR</span></div><div class="dni-admin-notice is-error"><strong>SECTOR EDITOR COULD NOT OPEN</strong> · ${esc(failure.message)}</div><div class="dni-admin-actions"><button class="dni-admin-action" type="button" data-admin-retry-sectors>RETRY SECTOR EDITOR</button></div></section>`;
  panel.dataset.adminWorkspaceRouted = 'sectors-error';
  panel.dataset.adminSectorsErrorCode = failure.code;
}

function scrollSectorsEditorIntoView(panel) {
  const host = panel?.querySelector('.dni-admin-workspace');
  if (!host || !sectorsWorkspaceReady(panel)) return;
  requestAnimationFrame(() => {
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function waitForPrimaryHandler(panel) {
  if (!(panel instanceof HTMLElement) || panel.dataset.adminPrimaryRebindPending === '1') return;
  panel.dataset.adminPrimaryRebindPending = '1';
  const onMounted = event => {
    const mounted = currentAdminPanel(event.target);
    if (mounted !== panel) return;
    delete panel.dataset.adminPrimaryRebindPending;
    hardenAdminPanel(panel);
  };
  document.addEventListener('dni:admin-mounted', onMounted, { once: true });
}

function runCanonicalSectorsHandler(panel, event) {
  const handler = primaryClickHandler(panel);
  if (typeof handler !== 'function') {
    waitForPrimaryHandler(panel);
    showSectorsError(panel, new Error('DNI Admin primary workspace handler is unavailable.'));
    return;
  }

  Promise.resolve(handler.call(panel, event)).then(() => {
    closeExtensionWorkspaces(panel);
    const button = panel.querySelector('[data-admin-workspace="sectors"]');
    if (button) button.classList.add('is-active');
    if (sectorsWorkspaceReady(panel)) {
      delete panel.dataset.adminSectorsErrorCode;
      panel.dataset.adminWorkspaceRouted = 'sectors';
      scrollSectorsEditorIntoView(panel);
      return;
    }
    if (sectorsWorkspaceDataUnavailable(panel)) {
      panel.dataset.adminWorkspaceRouted = 'sectors-data-unavailable';
      return;
    }
    showSectorsError(panel, new Error('DNI Admin Sectors & Assets workspace did not mount. Retry after Admin finishes loading.'));
  }).catch(error => showSectorsError(panel, error));
}

function routePrimaryWorkspace(event) {
  const target = event.target instanceof Element ? event.target : null;
  const workspaceButton = target?.closest('[data-admin-workspace]');
  if (!(workspaceButton instanceof HTMLButtonElement)) return;

  const panel = workspaceButton.closest('[data-module="admin"]');
  if (!(panel instanceof HTMLElement)) return;

  // Do not stop the event. Clearance/Operational use the normal bubbling click
  // to clear their own internal active state. We only make the primary host
  // visible before/after the canonical admin.js handler runs.
  closeExtensionWorkspaces(panel);

  if (workspaceButton.dataset.adminWorkspace !== 'sectors') return;

  queueMicrotask(() => {
    closeExtensionWorkspaces(panel);
    if (sectorsWorkspaceReady(panel)) {
      delete panel.dataset.adminSectorsErrorCode;
      panel.dataset.adminWorkspaceRouted = 'sectors';
      scrollSectorsEditorIntoView(panel);
      return;
    }
    if (sectorsWorkspaceDataUnavailable(panel)) {
      panel.dataset.adminWorkspaceRouted = 'sectors-data-unavailable';
      return;
    }

    // If the normal panel onclick was swallowed or failed to run, retry it once
    // after event dispatch. The retry must either mount the real editor, preserve
    // the database-unavailable state, or surface a clear retryable error.
    runCanonicalSectorsHandler(panel, event);
  });
}

function hardenAdminPanel(panel) {
  if (!(panel instanceof HTMLElement)) return;

  hardenedPanels.set(panel, {
    click: typeof panel.onclick === 'function' ? panel.onclick : hardenedPanels.get(panel)?.click || null,
    submit: typeof panel.onsubmit === 'function' ? panel.onsubmit : hardenedPanels.get(panel)?.submit || null
  });

  panel.dataset.adminControlsHardened = '6';
  bindDocumentsEvents(panel);
  ensureDocumentsTab(panel);
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

  closeExtensionWorkspaces(panel);

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
  closeExtensionWorkspaces(panel);
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
      event.preventDefault();
      closeExtensionWorkspaces(panel);
      void openDocumentsWorkspace(panel);
      return;
    }

    const retry = target.closest('[data-admin-retry-sectors]');
    if (retry) {
      const sectorsButton = panel.querySelector('[data-admin-workspace="sectors"]');
      if (sectorsButton) runCanonicalSectorsHandler(panel, { target: sectorsButton });
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

document.addEventListener('click', routePrimaryWorkspace, true);

document.addEventListener('dni:admin-mounted', event => {
  hardenAfterRender(event.target);
});

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') hardenAfterRender();
});

hardenAfterRender();
