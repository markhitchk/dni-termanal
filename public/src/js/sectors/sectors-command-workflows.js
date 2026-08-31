const ROOT_SELECTOR = '#dni-sectors-root';
const MODAL_ID = 'dni-sector-command-modal';
const API_URL = '/sectors-data.php';

let csrfToken = '';
let networkData = null;
let workflow = null;
let busy = false;
let errorMessage = '';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function permissions(session) {
  return Array.isArray(session?.permissions) ? session.permissions.map(String) : [];
}

function hasPermission(session, permission) {
  const list = permissions(session);
  return Boolean(session?.authenticated && (list.includes('admin') || list.includes(permission)));
}

function classifyError(error) {
  const status = Number(error?.status || 0);
  if (status === 401) return 'Authentication required. Sign in with Discord and retry.';
  if (status === 403) return 'Permission denied for this DNI command.';
  if (status === 404) return 'The selected DNI record is no longer available.';
  if (status === 409 || status === 422) return `Validation failed: ${error?.message || 'Review the selected records and retry.'}`;
  if (status >= 500) return 'DNI operational service is temporarily unavailable. Retry when the backend is online.';
  if (error instanceof TypeError) return 'Network connection failed while contacting the DNI operational service.';
  return error?.message || 'The DNI backend rejected this command.';
}

async function request(action, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.method && options.method !== 'GET' && csrfToken) headers['X-DNI-CSRF'] = csrfToken;
  const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}&_=${Date.now()}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function modalHost() {
  return document.querySelector(ROOT_SELECTOR);
}

function removeModal() {
  document.getElementById(MODAL_ID)?.remove();
  workflow = null;
  busy = false;
  errorMessage = '';
}

function sectorById(id) {
  return networkData?.sectors?.find(sector => String(sector.id) === String(id)) || null;
}

function assetById(id) {
  return networkData?.assets?.find(asset => String(asset.id) === String(id)) || null;
}

function personById(id) {
  return networkData?.personnel?.find(person => String(person.id) === String(id)) || null;
}

function destinationAssets(sectorId, excludedId = '') {
  return (networkData?.assets || []).filter(asset =>
    String(asset.sectorId) === String(sectorId)
    && String(asset.id) !== String(excludedId)
  );
}

function assignmentTargets(sectorId, excludedId = '') {
  return destinationAssets(sectorId, excludedId).filter(asset =>
    ['base', 'installation', 'station'].includes(String(asset.type || '').toLowerCase())
  );
}

function detailField(label, value) {
  return `<div class="sector-detail-field"><span>${esc(label)}</span><b>${esc(value ?? '—')}</b></div>`;
}

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
}

function renderError() {
  return errorMessage ? `<div class="sector-modal-error">${esc(errorMessage)}</div>` : '';
}

function renderCommanderForm() {
  const fleet = assetById(workflow.assetId);
  const candidates = (networkData?.personnel || []).filter(person => String(person.status || '').toUpperCase() !== 'OFFLINE');
  if (!workflow.personnelId && candidates.length) workflow.personnelId = String(candidates[0].id);

  return `
    <div class="sector-modal-heading"><span>DNI SECURE COMMAND</span><h3 id="dni-sector-command-title">ASSIGN COMMANDER</h3></div>
    ${detailField('FLEET', fleet?.name || workflow.assetId)}
    ${detailField('CURRENT COMMANDER', fleet?.commander || 'UNASSIGNED')}
    <form class="sector-command-form" data-command-form>
      <label>COMMANDER<select name="personnelId" ${candidates.length ? '' : 'disabled'}>
        ${candidates.map(person => option(person.id, `${person.rank || ''} ${person.name}`.trim(), workflow.personnelId)).join('')}
      </select></label>
      ${candidates.length ? '' : '<div class="sector-modal-error">No eligible personnel are visible at your clearance level.</div>'}
      ${renderError()}
      <div class="sector-modal-actions"><button type="button" data-command-action="close">CANCEL</button><button type="submit" class="is-authorize" ${busy || !candidates.length ? 'disabled' : ''}>${busy ? 'AUTHORIZING…' : 'ASSIGN COMMANDER'}</button></div>
    </form>`;
}

function renderAssetAssignmentForm() {
  const asset = assetById(workflow.assetId);
  const sectors = networkData?.sectors || [];
  if (!workflow.sectorId) workflow.sectorId = String(asset?.sectorId || sectors[0]?.id || '');
  const targets = assignmentTargets(workflow.sectorId, workflow.assetId);
  if (!targets.some(target => String(target.id) === String(workflow.assignmentId))) {
    workflow.assignmentId = String(targets[0]?.id || '');
  }

  return `
    <div class="sector-modal-heading"><span>DNI ADMINISTRATIVE COMMAND</span><h3 id="dni-sector-command-title">CHANGE ASSET ASSIGNMENT</h3></div>
    ${detailField('ASSET', asset?.name || workflow.assetId)}
    ${detailField('CURRENT SECTOR', sectorById(asset?.sectorId)?.name || 'UNKNOWN')}
    <form class="sector-command-form" data-command-form>
      <label>SECTOR<select name="sectorId" data-command-sector>
        ${sectors.map(sector => option(sector.id, `${sector.name} SECTOR`, workflow.sectorId)).join('')}
      </select></label>
      <label>ASSIGNMENT<select name="assignmentId" ${targets.length ? '' : 'disabled'}>
        ${targets.map(target => option(target.id, `${target.name} — ${String(target.type || 'ASSET').toUpperCase()}`, workflow.assignmentId)).join('')}
      </select></label>
      ${targets.length ? '' : '<div class="sector-modal-error">No base, station, or installation is available in the selected sector.</div>'}
      ${renderError()}
      <div class="sector-modal-actions"><button type="button" data-command-action="close">CANCEL</button><button type="submit" class="is-authorize" ${busy || !targets.length ? 'disabled' : ''}>${busy ? 'AUTHORIZING…' : 'SAVE ASSIGNMENT'}</button></div>
    </form>`;
}

function renderPersonAssignmentForm() {
  const person = personById(workflow.personnelId);
  const sectors = networkData?.sectors || [];
  if (!workflow.sectorId) workflow.sectorId = String(person?.sectorId || sectors[0]?.id || '');
  const targets = destinationAssets(workflow.sectorId);
  if (!targets.some(target => String(target.id) === String(workflow.assignmentId))) {
    workflow.assignmentId = String(targets[0]?.id || '');
  }

  return `
    <div class="sector-modal-heading"><span>DNI ADMINISTRATION</span><h3 id="dni-sector-command-title">CHANGE PERSONNEL ASSIGNMENT</h3></div>
    ${detailField('PERSONNEL', person?.name || workflow.personnelId)}
    ${detailField('RANK', person?.rank || '—')}
    <form class="sector-command-form" data-command-form>
      <label>SECTOR<select name="sectorId" data-command-sector>
        ${sectors.map(sector => option(sector.id, `${sector.name} SECTOR`, workflow.sectorId)).join('')}
      </select></label>
      <label>ASSIGNMENT<select name="assignmentId" ${targets.length ? '' : 'disabled'}>
        ${targets.map(target => option(target.id, `${target.name} — ${String(target.type || 'ASSET').toUpperCase()}`, workflow.assignmentId)).join('')}
      </select></label>
      ${targets.length ? '' : '<div class="sector-modal-error">No assignment destination is available in the selected sector.</div>'}
      ${renderError()}
      <div class="sector-modal-actions"><button type="button" data-command-action="close">CANCEL</button><button type="submit" class="is-authorize" ${busy || !targets.length ? 'disabled' : ''}>${busy ? 'AUTHORIZING…' : 'SAVE ASSIGNMENT'}</button></div>
    </form>`;
}

function renderSuccess() {
  const title = workflow.type === 'commander' ? 'COMMANDER UPDATED' : 'ASSIGNMENT UPDATED';
  return `
    <div class="sector-modal-heading"><span>DNI SECURE COMMAND</span><h3 id="dni-sector-command-title">${title}</h3></div>
    <p class="sector-modal-copy">The secure DNI backend accepted the command and the live Sectors snapshot has been refreshed.</p>
    <div class="sector-modal-actions"><button type="button" data-command-action="close">CLOSE</button></div>`;
}

function renderModal() {
  const host = modalHost();
  if (!host || !workflow) return;
  document.getElementById(MODAL_ID)?.remove();

  const wrapper = document.createElement('div');
  wrapper.id = MODAL_ID;
  const body = workflow.stage === 'success'
    ? renderSuccess()
    : workflow.type === 'commander'
      ? renderCommanderForm()
      : workflow.type === 'asset-assignment'
        ? renderAssetAssignmentForm()
        : renderPersonAssignmentForm();

  wrapper.innerHTML = `<div class="sector-modal-backdrop"><section class="sector-modal" role="dialog" aria-modal="true" aria-labelledby="dni-sector-command-title">${body}</section></div>`;
  host.append(wrapper);
}

async function openWorkflow(type, id) {
  busy = true;
  errorMessage = '';
  networkData = null;
  workflow = type === 'person-assignment'
    ? { type, personnelId: String(id || ''), stage: 'edit', sectorId: '', assignmentId: '' }
    : { type, assetId: String(id || ''), stage: 'edit', sectorId: '', assignmentId: '', personnelId: '' };

  try {
    const [session, network] = await Promise.all([
      request('session', { method: 'GET' }),
      request('network', { method: 'GET' })
    ]);
    csrfToken = String(session?.csrfToken || '');
    if (!session?.authenticated) {
      const error = new Error('Discord sign-in required.');
      error.status = 401;
      throw error;
    }

    const requiredPermission = type === 'commander' ? 'fleet.commander' : type === 'asset-assignment' ? 'asset.assign' : 'personnel.transfer';
    if (!hasPermission(session, requiredPermission)) {
      const error = new Error(`DNI permission required: ${requiredPermission}`);
      error.status = 403;
      throw error;
    }

    networkData = network;
    if (type === 'commander') {
      const fleet = assetById(workflow.assetId);
      if (!fleet || String(fleet.type) !== 'fleet') {
        const error = new Error('Fleet record not found.');
        error.status = 404;
        throw error;
      }
    } else if (type === 'asset-assignment') {
      const asset = assetById(workflow.assetId);
      if (!asset) {
        const error = new Error('Asset record not found.');
        error.status = 404;
        throw error;
      }
      workflow.sectorId = String(asset.sectorId || '');
      workflow.assignmentId = String(asset.homeBaseId || '');
    } else {
      const person = personById(workflow.personnelId);
      if (!person) {
        const error = new Error('Personnel record not found.');
        error.status = 404;
        throw error;
      }
      workflow.sectorId = String(person.sectorId || '');
      workflow.assignmentId = String(person.assignmentId || '');
    }
  } catch (error) {
    errorMessage = classifyError(error);
  } finally {
    busy = false;
    renderModal();
  }
}

async function submitWorkflow(form) {
  if (!workflow || busy) return;
  const values = new FormData(form);
  busy = true;
  errorMessage = '';
  renderModal();

  try {
    let response;
    if (workflow.type === 'commander') {
      workflow.personnelId = String(values.get('personnelId') || '');
      if (!workflow.personnelId) throw Object.assign(new Error('Select a commander.'), { status: 422 });
      response = await request('assign-commander', {
        method: 'POST',
        body: JSON.stringify({ assetId: workflow.assetId, personnelId: workflow.personnelId })
      });
    } else if (workflow.type === 'asset-assignment') {
      workflow.sectorId = String(values.get('sectorId') || '');
      workflow.assignmentId = String(values.get('assignmentId') || '');
      const valid = assignmentTargets(workflow.sectorId, workflow.assetId).some(target => String(target.id) === workflow.assignmentId);
      if (!valid) throw Object.assign(new Error('Select a valid destination in the chosen sector.'), { status: 422 });
      response = await request('change-asset-assignment', {
        method: 'POST',
        body: JSON.stringify({ assetId: workflow.assetId, destinationSectorId: workflow.sectorId, destinationId: workflow.assignmentId })
      });
    } else {
      workflow.sectorId = String(values.get('sectorId') || '');
      workflow.assignmentId = String(values.get('assignmentId') || '');
      const valid = destinationAssets(workflow.sectorId).some(target => String(target.id) === workflow.assignmentId);
      if (!valid) throw Object.assign(new Error('Select a valid assignment in the chosen sector.'), { status: 422 });
      response = await request('transfer-personnel', {
        method: 'POST',
        body: JSON.stringify({ personnelId: workflow.personnelId, destinationSectorId: workflow.sectorId, destinationAssignmentId: workflow.assignmentId })
      });
    }

    if (!response?.networkData) throw new Error('DNI backend did not return the updated Sectors snapshot.');
    networkData = response.networkData;
    window.dispatchEvent(new CustomEvent('dni:sectors-network-data', {
      detail: { data: response.networkData, reason: `command-${workflow.type}`, receivedAt: Date.now() }
    }));
    workflow.stage = 'success';
  } catch (error) {
    errorMessage = classifyError(error);
  } finally {
    busy = false;
    renderModal();
  }
}

document.addEventListener('click', event => {
  const commandAction = event.target.closest?.(`#${MODAL_ID} [data-command-action]`)?.dataset.commandAction;
  if (commandAction === 'close') {
    event.preventDefault();
    event.stopImmediatePropagation();
    removeModal();
    return;
  }

  const button = event.target.closest?.(`${ROOT_SELECTOR} [data-action]`);
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'assign-commander') {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openWorkflow('commander', button.dataset.assetId);
    return;
  }

  if (action === 'change-person-assignment') {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openWorkflow('person-assignment', button.dataset.personId);
    return;
  }

  if (action === 'change-assignment' && !/HOME\s+BASE/i.test(button.textContent || '')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openWorkflow('asset-assignment', button.dataset.assetId);
  }
}, true);

document.addEventListener('change', event => {
  const select = event.target;
  if (!workflow || !select.matches?.(`#${MODAL_ID} [data-command-sector]`)) return;
  workflow.sectorId = String(select.value || '');
  workflow.assignmentId = '';
  errorMessage = '';
  renderModal();
}, true);

document.addEventListener('submit', event => {
  const form = event.target.closest?.(`#${MODAL_ID} [data-command-form]`);
  if (!form) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void submitWorkflow(form);
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById(MODAL_ID)) removeModal();
});
