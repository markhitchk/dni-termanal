const DOCUMENTS_URL = '/documents-data.php';
const WORKFLOW_URL = '/documents-workflow.php';

const CLEARANCES = Object.freeze([
  { level: 0, code: 'CL/NON', name: 'Unclassified' },
  { level: 1, code: 'CL0/UTO', name: 'Official' },
  { level: 2, code: 'CL1/FOR', name: 'Level 1' },
  { level: 3, code: 'CL2/VER', name: 'Level 2' },
  { level: 4, code: 'CL3/CON', name: 'Level 3' },
  { level: 5, code: 'CL4/MET', name: 'Level 4' },
  { level: 6, code: 'CLA/DIS', name: 'Absolute' }
]);

const viewerState = {
  loaded: false,
  busy: false,
  error: '',
  query: '',
  clearance: null,
  documents: [],
  selected: null
};

const adminState = {
  busy: false,
  error: '',
  csrfToken: '',
  permissions: [],
  clearance: null,
  own: [],
  review: [],
  editing: null
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const attr = value => esc(value ?? '');

function clearanceText(value) {
  const descriptor = value?.clearance || value;
  if (descriptor?.code) return `${descriptor.code} — ${descriptor.name || ''}`.trim();
  const found = CLEARANCES.find(item => item.level === Number(value?.minimum_clearance));
  return found ? `${found.code} — ${found.name}` : 'CLASSIFICATION UNKNOWN';
}

function statusText(value) {
  return String(value || 'unknown').replaceAll('_', ' ').toUpperCase();
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `DNI document service HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function viewerPanel() {
  return document.querySelector('[data-module="documents"]');
}

function viewerTab() {
  return document.querySelector('.nav-tab[data-panel="documents"]');
}

function makeDocumentsUrl(action, values = {}) {
  const url = new URL(DOCUMENTS_URL, window.location.origin);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

function viewerMarkup() {
  return `
    <header class="documents-header docs-browser-header">
      <div>
        <div class="module-kicker">DNI CLASSIFIED RECORDS NETWORK</div>
        <h2>DNI Documents</h2>
        <p class="module-subtitle">Clearance-filtered classified records archive. The server only discloses records authorized for your current effective CL.</p>
      </div>
      <div class="doc-clearance-badge" data-doc-viewer-clearance>CHECKING CLEARANCE</div>
    </header>
    <div class="docs-network-line">
      <span>CLASSIFIED RECORDS LINK</span>
      <strong data-doc-viewer-status>CONNECTING…</strong>
    </div>
    <form class="docs-search" data-doc-search>
      <label for="dni-doc-search">ARCHIVE SEARCH</label>
      <div><input id="dni-doc-search" name="q" maxlength="100" autocomplete="off" placeholder="DNI number, title, summary, keyword"><button type="submit">SEARCH</button><button type="button" data-doc-clear-search>CLEAR</button></div>
    </form>
    <div class="docs-browser">
      <aside class="docs-index" aria-label="Authorized DNI document index">
        <div class="docs-index-head"><div><span>AUTHORIZED INDEX</span><strong data-doc-result-title>AVAILABLE RECORDS</strong></div><span data-doc-count>0</span></div>
        <div class="docs-index-list" data-doc-index></div>
      </aside>
      <section class="docs-reader" data-doc-reader aria-live="polite">
        <div class="docs-reader-empty">
          <span>DNI ARCHIVE READER</span>
          <strong>SELECT AN AUTHORIZED RECORD</strong>
          <p>Document contents are retrieved only after the server confirms your current clearance and any required permissions.</p>
        </div>
      </section>
    </div>
    <footer class="docs-security-foot">SERVER CLEARANCE ENFORCEMENT ACTIVE // HIGHER-CLASSIFIED RECORDS ARE NOT DISCLOSED OR COUNTED</footer>`;
}

function installViewer() {
  const panel = viewerPanel();
  if (!panel || panel.dataset.dniDocsViewerInstalled === 'true') return;
  panel.dataset.dniDocsViewerInstalled = 'true';
  panel.innerHTML = viewerMarkup();

  panel.querySelector('[data-doc-search]')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    viewerState.query = String(data.get('q') || '').trim();
    void refreshViewer();
  });

  panel.querySelector('[data-doc-clear-search]')?.addEventListener('click', () => {
    viewerState.query = '';
    const input = panel.querySelector('#dni-doc-search');
    if (input) input.value = '';
    void refreshViewer();
  });

  panel.querySelector('[data-doc-index]')?.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-doc-open]') : null;
    if (!button) return;
    void openRecord(button.dataset.docOpen || '');
  });
}

function setViewerTabVisible(visible) {
  const tab = viewerTab();
  if (!tab) return;
  tab.hidden = !visible;
  tab.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (visible && tab.tabIndex < -1) tab.tabIndex = -1;
}

function renderViewerStatus() {
  const panel = viewerPanel();
  if (!panel) return;
  const status = panel.querySelector('[data-doc-viewer-status]');
  const badge = panel.querySelector('[data-doc-viewer-clearance]');
  if (badge) badge.textContent = viewerState.clearance?.code
    ? `${viewerState.clearance.code} // ${viewerState.clearance.name}`
    : 'CL/NON // UNCLASSIFIED';
  if (!status) return;
  if (viewerState.busy) status.textContent = 'QUERYING SECURE ARCHIVE…';
  else if (viewerState.error) status.textContent = viewerState.error;
  else status.textContent = viewerState.loaded ? 'ONLINE // CLEARANCE FILTER ACTIVE' : 'CONNECTING…';
}

function renderViewerList() {
  const panel = viewerPanel();
  const target = panel?.querySelector('[data-doc-index]');
  const count = panel?.querySelector('[data-doc-count]');
  const title = panel?.querySelector('[data-doc-result-title]');
  if (!target) return;
  if (count) count.textContent = String(viewerState.documents.length);
  if (title) title.textContent = viewerState.query ? `SEARCH // ${viewerState.query.toUpperCase()}` : 'AVAILABLE RECORDS';
  target.replaceChildren();

  if (!viewerState.documents.length) {
    const empty = document.createElement('div');
    empty.className = 'docs-index-empty';
    empty.textContent = viewerState.query ? 'NO MATCHING AUTHORIZED RECORDS' : 'NO PUBLISHED RECORDS AUTHORIZED FOR CURRENT CLEARANCE';
    target.append(empty);
    return;
  }

  for (const record of viewerState.documents) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'docs-index-record';
    button.dataset.docOpen = String(record.file_code || record.id || '');
    if (viewerState.selected?.file_code === record.file_code) button.classList.add('is-selected');
    button.innerHTML = `<span class="docs-record-code">${esc(record.file_code || 'DNI-???')}</span><strong>${esc(record.title || 'Untitled DNI Record')}</strong><small>${esc(clearanceText(record))}</small><p>${esc(record.summary || '')}</p>`;
    target.append(button);
  }
}

function renderRecord(record) {
  const reader = viewerPanel()?.querySelector('[data-doc-reader]');
  if (!reader) return;
  if (!record) {
    reader.innerHTML = '<div class="docs-reader-empty"><span>DNI ARCHIVE READER</span><strong>RECORD UNAVAILABLE</strong><p>The record does not exist or is not authorized for the current clearance.</p></div>';
    return;
  }
  const code = String(record.file_code || record.id || 'DNI RECORD');
  const download = makeDocumentsUrl('download', { number: code });
  reader.innerHTML = `
    <header class="docs-record-header">
      <div><span>DNI CLASSIFIED RECORD</span><h3>${esc(code)}</h3><strong>${esc(record.title || 'Untitled DNI Record')}</strong></div>
      <span class="docs-classification">${esc(clearanceText(record))}</span>
    </header>
    <div class="docs-record-meta"><span>STATUS // ${esc(statusText(record.status || 'PUBLISHED'))}</span><span>CLASSIFICATION // ${esc(statusText(record.classification_status || 'FINAL'))}</span>${record.sector ? `<span>SECTOR // ${esc(record.sector)}</span>` : ''}</div>
    <section class="docs-record-summary"><span>SUMMARY</span><p>${esc(record.summary || 'No summary available.')}</p></section>
    <article class="docs-record-body">${esc(record.body || '').replace(/\r?\n/g, '<br>')}</article>
    <footer class="docs-record-actions"><a href="${attr(download)}" download>DOWNLOAD AUTHORIZED COPY</a></footer>`;
}

async function refreshViewer() {
  installViewer();
  viewerState.busy = true;
  viewerState.error = '';
  renderViewerStatus();
  try {
    const action = viewerState.query ? 'search' : 'list';
    const payload = await jsonRequest(makeDocumentsUrl(action, viewerState.query ? { q: viewerState.query } : {}));
    viewerState.clearance = payload.effectiveClearance || null;
    viewerState.documents = Array.isArray(payload.documents) ? payload.documents : [];
    viewerState.loaded = true;
    setViewerTabVisible(true);
    if (viewerState.selected && !viewerState.documents.some(item => item.file_code === viewerState.selected.file_code)) {
      viewerState.selected = null;
      renderRecord(null);
    }
    renderViewerList();
  } catch (error) {
    viewerState.error = error.message || 'DNI DOCUMENT NETWORK UNAVAILABLE';
    viewerState.documents = [];
    viewerState.loaded = true;
    setViewerTabVisible(error.status !== 401 && error.status !== 403);
    renderViewerList();
  } finally {
    viewerState.busy = false;
    renderViewerStatus();
  }
}

async function openRecord(number) {
  if (!number || viewerState.busy) return;
  viewerState.busy = true;
  viewerState.error = '';
  renderViewerStatus();
  try {
    const payload = await jsonRequest(makeDocumentsUrl('record', { number }));
    viewerState.clearance = payload.effectiveClearance || viewerState.clearance;
    viewerState.selected = payload.document || null;
    renderRecord(viewerState.selected);
    renderViewerList();
  } catch (error) {
    viewerState.selected = null;
    renderRecord(null);
    if (error.status !== 404) viewerState.error = error.message || 'DNI RECORD UNAVAILABLE';
  } finally {
    viewerState.busy = false;
    renderViewerStatus();
  }
}

function adminHas(permission) {
  return adminState.permissions.includes('admin') || adminState.permissions.includes(permission);
}

async function workflowPost(action, body) {
  if (!adminState.csrfToken) throw new Error('DNI security token unavailable. Reload the Documents admin workspace.');
  const payload = await jsonRequest(`${WORKFLOW_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DNI-CSRF': adminState.csrfToken },
    body: JSON.stringify(body || {})
  });
  if (payload.csrfToken) adminState.csrfToken = String(payload.csrfToken);
  return payload;
}

function adminPanel() {
  return document.querySelector('[data-module="admin"]');
}

function adminHost() {
  return adminPanel()?.querySelector('.dni-admin-workspace');
}

function adminEditorMarkup() {
  const editing = adminState.editing;
  return `<section class="dni-admin-editor docs-admin-editor">
    <h3>${editing ? `Edit ${esc(editing.file_code || editing.id)}` : 'New Document Draft'}</h3>
    <p>Every new draft is provisionally classified at the creator's current effective clearance until ISB finalizes it.</p>
    <form class="dni-admin-form" data-doc-admin-editor>
      <label class="wide">Title<input name="title" maxlength="180" required value="${attr(editing?.title || '')}"></label>
      <label class="wide">Summary<textarea name="summary" maxlength="500" rows="3" required>${esc(editing?.summary || '')}</textarea></label>
      <label class="wide">Document Body<textarea name="body" maxlength="200000" rows="14" required>${esc(editing?.body || '')}</textarea></label>
      <div class="doc-editor-security wide">${editing ? `CURRENT SAFEGUARD // ${esc(clearanceText(editing))} // ${esc(statusText(editing.classification_status))}` : `NEW DRAFT SAFEGUARD // ${esc(clearanceText(adminState.clearance))} // PROVISIONAL`}</div>
      <div class="dni-admin-actions wide"><button class="dni-admin-action" type="submit">${editing ? 'SAVE CHANGES' : 'SAVE DRAFT'}</button>${editing ? '<button class="dni-admin-action" type="button" data-doc-admin-cancel>CANCEL EDIT</button>' : ''}</div>
    </form>
  </section>`;
}

function adminOwnCard(record, index) {
  const editable = ['DRAFT', 'CHANGES_REQUESTED'].includes(statusText(record.status));
  return `<article class="doc-card docs-admin-card">
    <div class="doc-card-top"><div class="doc-card-identity"><span class="doc-file-code">${esc(record.file_code || record.id)}</span><h4>${esc(record.title || 'Untitled DNI Document')}</h4></div><div class="doc-badges"><span class="doc-badge">${esc(clearanceText(record))}</span><span class="doc-badge is-status">${esc(statusText(record.status))}</span><span class="doc-badge is-classification">${esc(statusText(record.classification_status))}</span></div></div>
    <p class="doc-summary">${esc(record.summary || '')}</p>
    <pre class="doc-body">${esc(record.body || '')}</pre>
    <div class="doc-actions">${adminHas('documents.edit_own') && editable ? `<button class="doc-secondary-action" type="button" data-doc-admin-edit="${index}">EDIT DRAFT</button>` : ''}${adminHas('documents.submit_review') && editable && String(record.classification_status || '').toLowerCase() === 'provisional' ? `<button class="dni-primary-action" type="button" data-doc-admin-submit="${index}">SUBMIT TO ISB</button>` : ''}</div>
  </article>`;
}

function clearanceOptions(selected) {
  const maxLevel = Math.max(0, Math.min(6, Number(adminState.clearance?.level ?? 0)));
  return CLEARANCES.filter(item => item.level <= maxLevel).map(item => `<option value="${item.level}" ${item.level === Number(selected) ? 'selected' : ''}>${esc(item.code)} — ${esc(item.name)}</option>`).join('');
}

function adminReviewCard(record, index) {
  const status = String(record.status || '').toLowerCase();
  const controls = status === 'in_review' && adminHas('documents.review') ? `
    <div class="doc-review-controls" data-doc-review-controls="${index}">
      <label>Final Clearance<select class="doc-clearance-select" data-doc-review-clearance>${clearanceOptions(record.minimum_clearance)}</select></label>
      <label>ISB Review Reason<textarea class="doc-review-reason" data-doc-review-reason rows="3" maxlength="1000" placeholder="Required audit reason"></textarea></label>
      <div class="doc-actions"><button class="doc-secondary-action" type="button" data-doc-admin-review="changes_requested" data-doc-index="${index}">REQUEST CHANGES</button><button class="doc-danger-action" type="button" data-doc-admin-review="rejected" data-doc-index="${index}">REJECT</button>${adminHas('documents.classify') ? `<button class="dni-primary-action" type="button" data-doc-admin-review="approved" data-doc-index="${index}">APPROVE + CLASSIFY</button>` : ''}</div>
    </div>` : '';
  const publish = status === 'approved' && String(record.classification_status || '').toLowerCase() === 'final' && adminHas('documents.publish')
    ? `<div class="doc-actions"><button class="dni-primary-action" type="button" data-doc-admin-publish="${index}">PUBLISH FINAL DOCUMENT</button></div>` : '';
  return `<article class="doc-card docs-admin-card"><div class="doc-card-top"><div class="doc-card-identity"><span class="doc-file-code">${esc(record.file_code || record.id)}</span><h4>${esc(record.title || 'Untitled DNI Document')}</h4></div><div class="doc-badges"><span class="doc-badge">${esc(clearanceText(record))}</span><span class="doc-badge is-status">${esc(statusText(record.status))}</span></div></div><p class="doc-summary">${esc(record.summary || '')}</p><pre class="doc-body">${esc(record.body || '')}</pre>${controls}${publish}</article>`;
}

function adminDocumentsMarkup() {
  const own = adminState.own.length ? adminState.own.map(adminOwnCard).join('') : '<div class="doc-empty">NO CONTROLLED DRAFTS OR REVIEW RECORDS.</div>';
  const review = adminState.review.length ? adminState.review.map(adminReviewCard).join('') : '<div class="doc-empty">NO DOCUMENTS CURRENTLY AVAILABLE FOR ISB REVIEW.</div>';
  return `<section class="docs-admin-shell">
    <header class="dni-module-header"><div><span>DNI CLASSIFIED RECORDS CONTROL</span><h2>Document Administration</h2><p>Officer drafting, ISB classification, and final publication. Public reading is separated into /docs.</p></div><strong class="dni-state-badge is-online">${esc(clearanceText(adminState.clearance))}</strong></header>
    ${adminState.error ? `<div class="dni-admin-notice is-error">${esc(adminState.error)}</div>` : ''}
    <div class="doc-security-notice"><strong>MANDATORY CLASSIFICATION</strong><span>Drafts remain provisional and protected until ISB assigns a final CL. Only final published records can appear in /docs.</span></div>
    <div class="docs-admin-grid">
      <div>${adminEditorMarkup()}<section class="dni-admin-block docs-admin-list"><div class="dni-admin-section-title"><span>YOUR CONTROLLED RECORDS</span><span>${adminState.own.length}</span></div>${own}</section></div>
      <section class="dni-admin-block docs-admin-list"><div class="dni-admin-section-title"><span>IMPERIAL SECURITY BUREAU // REVIEW QUEUE</span><button class="dni-admin-action" type="button" data-doc-admin-refresh>REFRESH</button></div><p class="doc-queue-note">The server returns only records at or below your effective clearance. Higher-classified records are never disclosed.</p>${review}</section>
    </div>
  </section>`;
}

function bindAdminDocumentsEvents(host) {
  host.querySelector('[data-doc-admin-editor]')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (adminState.busy) return;
    const data = new FormData(event.currentTarget);
    const payload = {
      title: String(data.get('title') || '').trim(),
      summary: String(data.get('summary') || '').trim(),
      body: String(data.get('body') || '').trim()
    };
    adminState.busy = true;
    adminState.error = '';
    try {
      if (adminState.editing) {
        payload.number = adminState.editing.file_code || adminState.editing.id;
        await workflowPost('edit', payload);
      } else {
        await workflowPost('create', payload);
      }
      adminState.editing = null;
      await refreshAdminDocuments();
    } catch (error) {
      adminState.error = error.message || 'Unable to save DNI document.';
      renderAdminDocuments();
    } finally {
      adminState.busy = false;
    }
  });

  host.querySelector('[data-doc-admin-cancel]')?.addEventListener('click', () => {
    adminState.editing = null;
    renderAdminDocuments();
  });
  host.querySelector('[data-doc-admin-refresh]')?.addEventListener('click', () => void refreshAdminDocuments());

  host.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || adminState.busy) return;
    const edit = target.closest('[data-doc-admin-edit]');
    if (edit) {
      adminState.editing = adminState.own[Number(edit.dataset.docAdminEdit)] || null;
      renderAdminDocuments();
      adminHost()?.querySelector('[data-doc-admin-editor]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const submit = target.closest('[data-doc-admin-submit]');
    if (submit) {
      const record = adminState.own[Number(submit.dataset.docAdminSubmit)];
      if (record) await mutateAdminDocument('submit', { number: record.file_code || record.id });
      return;
    }
    const publish = target.closest('[data-doc-admin-publish]');
    if (publish) {
      const record = adminState.review[Number(publish.dataset.docAdminPublish)];
      if (record) await mutateAdminDocument('publish', { number: record.file_code || record.id });
      return;
    }
    const review = target.closest('[data-doc-admin-review]');
    if (review) {
      const index = Number(review.dataset.docIndex);
      const record = adminState.review[index];
      const controls = host.querySelector(`[data-doc-review-controls="${index}"]`);
      const reason = String(controls?.querySelector('[data-doc-review-reason]')?.value || '').trim();
      if (!reason) {
        adminState.error = 'ISB REVIEW REASON IS REQUIRED.';
        renderAdminDocuments();
        return;
      }
      const decision = review.dataset.docAdminReview;
      const payload = { number: record?.file_code || record?.id, decision, reason };
      if (decision === 'approved') payload.clearanceLevel = Number(controls?.querySelector('[data-doc-review-clearance]')?.value || 0);
      if (record) await mutateAdminDocument('review', payload);
    }
  });
}

async function mutateAdminDocument(action, payload) {
  adminState.busy = true;
  adminState.error = '';
  try {
    await workflowPost(action, payload);
    adminState.editing = null;
    await refreshAdminDocuments();
  } catch (error) {
    adminState.error = error.message || `Unable to ${action} DNI document.`;
    renderAdminDocuments();
  } finally {
    adminState.busy = false;
  }
}

function renderAdminDocuments() {
  const host = adminHost();
  if (!host || adminPanel()?.dataset.docsWorkspaceActive !== 'true') return;
  host.innerHTML = adminDocumentsMarkup();
  bindAdminDocumentsEvents(host);
}

async function refreshAdminDocuments() {
  if (adminState.busy) return;
  adminState.busy = true;
  adminState.error = '';
  try {
    const own = await jsonRequest(`${WORKFLOW_URL}?action=list&scope=own`);
    adminState.permissions = Array.isArray(own.permissions) ? own.permissions.map(String) : [];
    adminState.clearance = own.effectiveClearance || null;
    adminState.csrfToken = String(own.csrfToken || adminState.csrfToken || '');
    adminState.own = Array.isArray(own.documents) ? own.documents : [];
    if (adminHas('documents.view_review_queue')) {
      const review = await jsonRequest(`${WORKFLOW_URL}?action=list&scope=review`);
      adminState.csrfToken = String(review.csrfToken || adminState.csrfToken || '');
      adminState.review = Array.isArray(review.documents) ? review.documents : [];
    } else adminState.review = [];
  } catch (error) {
    adminState.error = error.message || 'DNI document workflow unavailable.';
    adminState.own = [];
    adminState.review = [];
  } finally {
    adminState.busy = false;
    renderAdminDocuments();
  }
}

function activateAdminDocuments() {
  const panel = adminPanel();
  const host = adminHost();
  if (!panel || !host) return;
  panel.dataset.docsWorkspaceActive = 'true';
  for (const button of panel.querySelectorAll('.dni-admin-worktab')) button.classList.remove('is-active');
  panel.querySelector('[data-admin-documents-workspace]')?.classList.add('is-active');
  host.innerHTML = '<section class="dni-admin-block"><div class="dni-admin-notice"><strong>DNI DOCUMENTS</strong> · Loading controlled records and ISB review queue…</div></section>';
  void refreshAdminDocuments();
}

function installAdminDocumentsTab() {
  const panel = adminPanel();
  const tabs = panel?.querySelector('.dni-admin-worktabs');
  if (!panel || !tabs) return;
  let button = tabs.querySelector('[data-admin-documents-workspace]');
  if (!button) {
    button = document.createElement('button');
    button.className = 'dni-admin-worktab';
    button.type = 'button';
    button.dataset.adminDocumentsWorkspace = 'true';
    button.textContent = 'DOCUMENTS';
    tabs.insertBefore(button, tabs.lastElementChild || null);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      activateAdminDocuments();
    });
  }
  if (panel.dataset.docsWorkspaceDelegationBound !== 'true') {
    panel.dataset.docsWorkspaceDelegationBound = 'true';
    panel.addEventListener('click', event => {
      const builtIn = event.target instanceof Element ? event.target.closest('[data-admin-workspace]') : null;
      if (!builtIn) return;
      panel.dataset.docsWorkspaceActive = 'false';
      panel.querySelector('[data-admin-documents-workspace]')?.classList.remove('is-active');
    }, true);
  }
}

installViewer();
void refreshViewer();

document.addEventListener('dni:admin-mounted', installAdminDocumentsTab);
adminPanel()?.addEventListener('dni:admin-mounted', installAdminDocumentsTab);
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'documents') void refreshViewer();
  if (event.detail?.panel === 'admin') queueMicrotask(installAdminDocumentsTab);
});

queueMicrotask(installAdminDocumentsTab);
