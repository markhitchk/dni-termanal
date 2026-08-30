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

const state = {
  loaded: false,
  busy: false,
  csrfToken: '',
  permissions: [],
  clearance: null,
  own: [],
  review: [],
  editing: null,
  error: ''
};

function has(permission) {
  return state.permissions.includes('admin') || state.permissions.includes(permission);
}

function mayUseWorkspace() {
  return has('documents.create') || has('documents.view_review_queue') || has('documents.review') || has('documents.publish');
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function actionButton(text, className, handler) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
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
    const error = new Error(payload.error || `DNI document workflow HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function post(action, body) {
  if (!state.csrfToken) throw new Error('DNI security token unavailable. Reload the document workspace.');
  const payload = await jsonRequest(`${WORKFLOW_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DNI-CSRF': state.csrfToken
    },
    body: JSON.stringify(body || {})
  });
  if (payload.csrfToken) state.csrfToken = String(payload.csrfToken);
  return payload;
}

function workflowTab() {
  return document.querySelector('.nav-tab[data-panel="documents"]');
}

function panel() {
  return document.querySelector('[data-module="documents"]');
}

function setWorkspaceVisible(visible) {
  const tab = workflowTab();
  if (tab) {
    tab.hidden = !visible;
    tab.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible) tab.tabIndex = -1;
  }
  if (!visible && String(window.location.pathname).replace(/\/+$/, '') === '/documents') {
    window.location.replace('/terminal');
  }
}

function clearanceText(record) {
  const descriptor = record?.clearance;
  if (descriptor?.code) return `${descriptor.code} — ${descriptor.name || ''}`.trim();
  const found = CLEARANCES.find(item => item.level === Number(record?.minimum_clearance));
  return found ? `${found.code} — ${found.name}` : 'CLASSIFICATION UNKNOWN';
}

function statusText(value) {
  return String(value || 'unknown').replaceAll('_', ' ').toUpperCase();
}

function setError(message = '') {
  state.error = String(message || '');
  renderStatus();
}

function renderStatus() {
  const target = panel()?.querySelector('[data-doc-status]');
  if (!target) return;
  if (state.busy) {
    target.className = 'doc-workspace-status is-busy';
    target.textContent = 'PROCESSING SECURE DOCUMENT OPERATION…';
    return;
  }
  if (state.error) {
    target.className = 'doc-workspace-status is-error';
    target.textContent = state.error;
    return;
  }
  target.className = 'doc-workspace-status';
  target.textContent = state.loaded ? 'DOCUMENT SECURITY LINK // ONLINE' : 'CONNECTING TO DOCUMENT SECURITY SERVICE…';
}

function workspaceMarkup() {
  return `
    <header class="documents-header">
      <div>
        <div class="module-kicker">DNI CLASSIFIED RECORDS NETWORK</div>
        <h2>DNI Documents</h2>
        <p class="module-subtitle">Officer drafting and ISB classification workspace. Server clearance rules remain authoritative.</p>
      </div>
      <div class="doc-clearance-badge" data-doc-clearance>CHECKING CLEARANCE</div>
    </header>
    <div class="doc-workspace-status" data-doc-status role="status" aria-live="polite">CONNECTING TO DOCUMENT SECURITY SERVICE…</div>
    <section class="doc-security-notice" aria-label="DNI document security notice">
      <strong>MANDATORY CLASSIFICATION</strong>
      <span>Every draft is protected immediately. A provisional draft is classified at the creator's current effective clearance until ISB assigns its final level.</span>
    </section>
    <div class="documents-layout">
      <section class="documents-column" data-doc-officer-area hidden>
        <div class="dni-section-heading documents-section-heading">
          <div><span>OFFICER WORKSPACE</span><h3 data-doc-editor-heading>New Document Draft</h3></div>
          <button class="doc-secondary-action" type="button" data-doc-new>NEW DRAFT</button>
        </div>
        <form class="doc-editor" data-doc-editor>
          <label>Title<input name="title" maxlength="180" required autocomplete="off"></label>
          <label>Summary<textarea name="summary" maxlength="500" rows="3" required></textarea></label>
          <label>Document Body<textarea name="body" maxlength="200000" rows="12" required></textarea></label>
          <div class="doc-editor-security" data-doc-editor-security></div>
          <div class="doc-actions">
            <button class="dni-primary-action" type="submit" data-doc-save>SAVE DRAFT</button>
            <button class="doc-secondary-action" type="button" data-doc-cancel hidden>CANCEL EDIT</button>
          </div>
        </form>
        <div class="dni-section-heading documents-section-heading"><div><span>YOUR CONTROLLED RECORDS</span><h3>My Drafts & Reviews</h3></div><span class="doc-count" data-doc-own-count>0</span></div>
        <div class="doc-list" data-doc-own-list></div>
      </section>
      <section class="documents-column" data-doc-isb-area hidden>
        <div class="dni-section-heading documents-section-heading">
          <div><span>IMPERIAL SECURITY BUREAU</span><h3>Classification Review Queue</h3></div>
          <button class="doc-secondary-action" type="button" data-doc-refresh>REFRESH</button>
        </div>
        <p class="doc-queue-note">Only records at or below your effective clearance are returned by the server. Higher-classified records are not disclosed.</p>
        <div class="doc-list" data-doc-review-list></div>
      </section>
    </div>`;
}

function installWorkspace() {
  const root = panel();
  if (!root || root.dataset.workflowInstalled === 'true') return;
  root.dataset.workflowInstalled = 'true';
  root.innerHTML = workspaceMarkup();
  root.querySelector('[data-doc-editor]')?.addEventListener('submit', event => {
    event.preventDefault();
    void saveEditor();
  });
  root.querySelector('[data-doc-new]')?.addEventListener('click', resetEditor);
  root.querySelector('[data-doc-cancel]')?.addEventListener('click', resetEditor);
  root.querySelector('[data-doc-refresh]')?.addEventListener('click', () => void refreshWorkspace());
}

function resetEditor() {
  state.editing = null;
  const root = panel();
  const form = root?.querySelector('[data-doc-editor]');
  form?.reset();
  const heading = root?.querySelector('[data-doc-editor-heading]');
  if (heading) heading.textContent = 'New Document Draft';
  const save = root?.querySelector('[data-doc-save]');
  if (save) save.textContent = 'SAVE DRAFT';
  const cancel = root?.querySelector('[data-doc-cancel]');
  if (cancel) cancel.hidden = true;
  renderEditorSecurity();
}

function editDocument(record) {
  state.editing = record;
  const root = panel();
  const form = root?.querySelector('[data-doc-editor]');
  if (!form) return;
  form.elements.title.value = record.title || '';
  form.elements.summary.value = record.summary || '';
  form.elements.body.value = record.body || '';
  const heading = root.querySelector('[data-doc-editor-heading]');
  if (heading) heading.textContent = `Edit ${record.file_code || record.id}`;
  const save = root.querySelector('[data-doc-save]');
  if (save) save.textContent = 'SAVE CHANGES';
  const cancel = root.querySelector('[data-doc-cancel]');
  if (cancel) cancel.hidden = false;
  renderEditorSecurity();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderEditorSecurity() {
  const target = panel()?.querySelector('[data-doc-editor-security]');
  if (!target) return;
  if (state.editing) {
    target.textContent = `CURRENT SAFEGUARD // ${clearanceText(state.editing)} // ${statusText(state.editing.classification_status)}`;
    return;
  }
  target.textContent = state.clearance?.code
    ? `NEW DRAFT SAFEGUARD // ${state.clearance.code} — ${state.clearance.name} // PROVISIONAL`
    : 'NEW DRAFT SAFEGUARD // EFFECTIVE CLEARANCE REQUIRED';
}

async function refreshAfterMutation() {
  await refreshWorkspace({ force: true });
}

async function saveEditor() {
  if (state.busy) return;
  const form = panel()?.querySelector('[data-doc-editor]');
  if (!form) return;
  const payload = {
    title: String(form.elements.title.value || '').trim(),
    summary: String(form.elements.summary.value || '').trim(),
    body: String(form.elements.body.value || '').trim()
  };
  if (!payload.title || !payload.summary || !payload.body) {
    setError('TITLE, SUMMARY, AND DOCUMENT BODY ARE REQUIRED.');
    return;
  }

  state.busy = true;
  setError('');
  renderStatus();
  try {
    if (state.editing) {
      payload.number = state.editing.file_code || state.editing.id;
      await post('edit', payload);
    } else {
      await post('create', payload);
    }
    resetEditor();
    await refreshAfterMutation();
  } catch (error) {
    setError(error.message || 'Unable to save DNI draft.');
  } finally {
    state.busy = false;
    renderStatus();
  }
}

async function submitDocument(record) {
  if (state.busy) return;
  state.busy = true;
  setError('');
  renderStatus();
  try {
    await post('submit', { number: record.file_code || record.id });
    if (state.editing?.file_code === record.file_code) resetEditor();
    await refreshAfterMutation();
  } catch (error) {
    setError(error.message || 'Unable to submit DNI document to ISB.');
  } finally {
    state.busy = false;
    renderStatus();
  }
}

async function reviewDocument(record, decision, controls) {
  if (state.busy) return;
  const reason = String(controls.reason.value || '').trim();
  if (!reason) {
    setError('ISB REVIEW REASON IS REQUIRED.');
    controls.reason.focus();
    return;
  }
  const payload = { number: record.file_code || record.id, decision, reason };
  if (decision === 'approved') payload.clearanceLevel = Number(controls.clearance.value);

  state.busy = true;
  setError('');
  renderStatus();
  try {
    await post('review', payload);
    await refreshAfterMutation();
  } catch (error) {
    setError(error.message || 'Unable to complete ISB review.');
  } finally {
    state.busy = false;
    renderStatus();
  }
}

async function publishDocument(record) {
  if (state.busy) return;
  state.busy = true;
  setError('');
  renderStatus();
  try {
    await post('publish', { number: record.file_code || record.id });
    await refreshAfterMutation();
  } catch (error) {
    setError(error.message || 'Unable to publish DNI document.');
  } finally {
    state.busy = false;
    renderStatus();
  }
}

function documentCard(record, mode) {
  const card = el('article', 'doc-card');
  card.dataset.fileCode = String(record.file_code || record.id || '');
  const top = el('div', 'doc-card-top');
  const identity = el('div', 'doc-card-identity');
  identity.append(el('span', 'doc-file-code', String(record.file_code || record.id || 'DNI RECORD')));
  identity.append(el('h4', '', record.title || 'Untitled DNI Document'));
  const badges = el('div', 'doc-badges');
  badges.append(el('span', 'doc-badge', clearanceText(record)));
  badges.append(el('span', 'doc-badge is-status', statusText(record.status)));
  badges.append(el('span', 'doc-badge is-classification', statusText(record.classification_status)));
  top.append(identity, badges);
  card.append(top);

  if (record.summary) card.append(el('p', 'doc-summary', record.summary));
  if (record.body) card.append(el('pre', 'doc-body', record.body));

  const metadata = el('div', 'doc-meta');
  if (record.submitted_at) metadata.append(el('span', '', `SUBMITTED ${new Date(record.submitted_at).toLocaleString()}`));
  if (record.reviewed_at) metadata.append(el('span', '', `REVIEWED ${new Date(record.reviewed_at).toLocaleString()}`));
  if (record.review_reason) metadata.append(el('span', '', `REVIEW NOTE: ${record.review_reason}`));
  if (record.published_at) metadata.append(el('span', '', `PUBLISHED ${new Date(record.published_at).toLocaleString()}`));
  if (metadata.childNodes.length) card.append(metadata);

  if (mode === 'own') {
    const actions = el('div', 'doc-actions');
    const editable = ['DRAFT', 'CHANGES_REQUESTED'].includes(String(record.status || '').toUpperCase());
    if (has('documents.edit_own') && editable) {
      actions.append(actionButton('EDIT DRAFT', 'doc-secondary-action', () => editDocument(record)));
    }
    if (has('documents.submit_review') && editable && String(record.classification_status || '').toLowerCase() === 'provisional') {
      actions.append(actionButton('SUBMIT TO ISB', 'dni-primary-action', () => void submitDocument(record)));
    }
    if (actions.childNodes.length) card.append(actions);
  }

  if (mode === 'review') {
    const status = String(record.status || '').toLowerCase();
    if (status === 'in_review' && has('documents.review')) {
      const controls = el('div', 'doc-review-controls');
      const clearanceLabel = el('label', '', 'Final Clearance');
      const select = el('select', 'doc-clearance-select');
      select.setAttribute('aria-label', `Final clearance for ${record.file_code || record.id}`);
      const maxLevel = Math.max(0, Math.min(6, Number(state.clearance?.level ?? 0)));
      for (const item of CLEARANCES.filter(item => item.level <= maxLevel)) {
        const option = el('option', '', `${item.code} — ${item.name}`);
        option.value = String(item.level);
        option.selected = item.level === Number(record.minimum_clearance);
        select.append(option);
      }
      clearanceLabel.append(select);

      const reasonLabel = el('label', '', 'ISB Review Reason');
      const reason = el('textarea', 'doc-review-reason');
      reason.rows = 3;
      reason.maxLength = 1000;
      reason.required = true;
      reason.placeholder = 'Required audit reason for this review decision';
      reasonLabel.append(reason);
      controls.append(clearanceLabel, reasonLabel);

      const actions = el('div', 'doc-actions');
      actions.append(actionButton('REQUEST CHANGES', 'doc-secondary-action', () => void reviewDocument(record, 'changes_requested', { reason, clearance: select })));
      actions.append(actionButton('REJECT', 'doc-danger-action', () => void reviewDocument(record, 'rejected', { reason, clearance: select })));
      if (has('documents.classify')) {
        actions.append(actionButton('APPROVE + CLASSIFY', 'dni-primary-action', () => void reviewDocument(record, 'approved', { reason, clearance: select })));
      }
      controls.append(actions);
      card.append(controls);
    }

    if (status === 'approved' && String(record.classification_status || '').toLowerCase() === 'final' && has('documents.publish')) {
      const actions = el('div', 'doc-actions');
      actions.append(actionButton('PUBLISH FINAL DOCUMENT', 'dni-primary-action', () => void publishDocument(record)));
      card.append(actions);
    }
  }
  return card;
}

function renderList(target, records, mode) {
  if (!target) return;
  target.replaceChildren();
  if (!records.length) {
    target.append(el('div', 'doc-empty', mode === 'review'
      ? 'NO DOCUMENTS CURRENTLY AVAILABLE FOR YOUR ISB REVIEW.'
      : 'NO CONTROLLED DRAFTS OR REVIEW RECORDS.'));
    return;
  }
  for (const record of records) target.append(documentCard(record, mode));
}

function render() {
  installWorkspace();
  const root = panel();
  if (!root) return;
  const clearance = root.querySelector('[data-doc-clearance]');
  if (clearance) clearance.textContent = state.clearance?.code
    ? `${state.clearance.code} // ${state.clearance.name}`
    : 'CLEARANCE UNAVAILABLE';

  const officerArea = root.querySelector('[data-doc-officer-area]');
  if (officerArea) officerArea.hidden = !has('documents.create');
  const isbArea = root.querySelector('[data-doc-isb-area]');
  if (isbArea) isbArea.hidden = !has('documents.view_review_queue');
  const ownCount = root.querySelector('[data-doc-own-count]');
  if (ownCount) ownCount.textContent = String(state.own.length);

  renderList(root.querySelector('[data-doc-own-list]'), state.own, 'own');
  renderList(root.querySelector('[data-doc-review-list]'), state.review, 'review');
  renderEditorSecurity();
  renderStatus();
}

async function refreshWorkspace({ force = false } = {}) {
  if (state.busy && !force) return;
  state.busy = true;
  state.error = '';
  renderStatus();
  try {
    const ownPayload = await jsonRequest(`${WORKFLOW_URL}?action=list&scope=own`);
    state.permissions = Array.isArray(ownPayload.permissions) ? ownPayload.permissions.map(String) : [];
    state.clearance = ownPayload.effectiveClearance || null;
    state.csrfToken = String(ownPayload.csrfToken || state.csrfToken || '');
    state.own = Array.isArray(ownPayload.documents) ? ownPayload.documents : [];

    const visible = mayUseWorkspace();
    setWorkspaceVisible(visible);
    if (!visible) {
      state.review = [];
      state.loaded = true;
      return;
    }

    if (has('documents.view_review_queue')) {
      const reviewPayload = await jsonRequest(`${WORKFLOW_URL}?action=list&scope=review`);
      state.csrfToken = String(reviewPayload.csrfToken || state.csrfToken || '');
      state.review = Array.isArray(reviewPayload.documents) ? reviewPayload.documents : [];
    } else {
      state.review = [];
    }
    state.loaded = true;
    render();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      setWorkspaceVisible(false);
    } else {
      setWorkspaceVisible(true);
      state.error = error.message || 'DNI document workflow unavailable.';
      render();
    }
  } finally {
    state.busy = false;
    renderStatus();
  }
}

installWorkspace();
setWorkspaceVisible(false);
void refreshWorkspace();
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'documents' && mayUseWorkspace()) void refreshWorkspace();
});
