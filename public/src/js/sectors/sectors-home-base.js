const ROOT_SELECTOR = '#dni-sectors-root';
const MODAL_ID = 'dni-home-base-modal';
const API_URL = '/sectors-data.php';

let csrfToken = '';
let networkData = null;
let activeFleetId = '';
let targetSectorId = '';
let targetHomeBaseId = '';
let stage = 'edit';
let busy = false;
let errorMessage = '';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function permissionList(session) {
  return Array.isArray(session?.permissions) ? session.permissions.map(String) : [];
}

function hasPermission(session, permission) {
  const permissions = permissionList(session);
  return Boolean(session?.authenticated && (permissions.includes('admin') || permissions.includes(permission)));
}

function classifyError(error) {
  const status = Number(error?.status || 0);
  if (status === 401) return 'Authentication required. Sign in with Discord and retry.';
  if (status === 403) return 'Permission denied. Your account is not authorized to change this fleet home base.';
  if (status === 404) return 'The selected fleet, sector, or home base is no longer available.';
  if (status === 409 || status === 422) return `Validation failed: ${error?.message || 'The selected home base is not valid.'}`;
  if (status >= 500) return 'DNI operational service is temporarily unavailable. Retry when the backend is online.';
  if (error?.name === 'AbortError') return 'The request was interrupted before the change completed.';
  if (error instanceof TypeError) return 'Network connection failed while contacting the DNI operational service.';
  return error?.message || 'The DNI backend rejected the home-base change.';
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

function currentFleet() {
  return networkData?.assets?.find(asset => String(asset.id) === String(activeFleetId)) || null;
}

function sectors() {
  return Array.isArray(networkData?.sectors) ? networkData.sectors : [];
}

function homeBasesForSector(sectorId) {
  return (Array.isArray(networkData?.assets) ? networkData.assets : []).filter(asset =>
    String(asset.sectorId) === String(sectorId)
    && String(asset.id) !== String(activeFleetId)
    && (asset.type === 'base' || asset.type === 'installation')
  );
}

function modalHost() {
  return document.querySelector(ROOT_SELECTOR);
}

function removeModal() {
  document.getElementById(MODAL_ID)?.remove();
}

function detailField(label, value) {
  return `<div class="sector-detail-field"><span>${esc(label)}</span><b>${esc(value ?? '—')}</b></div>`;
}

function renderModal() {
  const host = modalHost();
  if (!host) return;
  removeModal();

  const fleet = currentFleet();
  if (!fleet) return;
  const currentSector = sectors().find(sector => String(sector.id) === String(fleet.sectorId));
  const targetSector = sectors().find(sector => String(sector.id) === String(targetSectorId));
  const destinations = homeBasesForSector(targetSectorId);
  if (!destinations.some(asset => String(asset.id) === String(targetHomeBaseId))) {
    targetHomeBaseId = String(destinations[0]?.id || '');
  }
  const currentHome = networkData?.assets?.find(asset => String(asset.id) === String(fleet.homeBaseId));
  const targetHome = destinations.find(asset => String(asset.id) === String(targetHomeBaseId));

  const wrapper = document.createElement('div');
  wrapper.id = MODAL_ID;

  if (stage === 'success') {
    wrapper.innerHTML = `<div class="sector-modal-backdrop"><section class="sector-modal sector-modal-confirm" role="dialog" aria-modal="true" aria-labelledby="dni-home-base-title">
      <div class="sector-modal-heading"><span>DNI SECURE COMMAND</span><h3 id="dni-home-base-title">HOME BASE UPDATED</h3></div>
      ${detailField('FLEET', fleet.name)}
      ${detailField('NEW HOME BASE', targetHome?.name || currentHome?.name || 'UPDATED')}
      ${detailField('SECTOR', targetSector?.name || currentSector?.name || 'UNKNOWN')}
      <p class="sector-modal-copy">The secure DNI backend accepted the change and the Sectors network snapshot has been refreshed.</p>
      <div class="sector-modal-actions"><button type="button" data-home-base-action="close">CLOSE</button></div>
    </section></div>`;
  } else if (stage === 'confirm') {
    wrapper.innerHTML = `<div class="sector-modal-backdrop"><section class="sector-modal sector-modal-confirm" role="dialog" aria-modal="true" aria-labelledby="dni-home-base-title">
      <div class="sector-modal-heading"><span>DNI SECURE COMMAND</span><h3 id="dni-home-base-title">CONFIRM HOME BASE CHANGE</h3></div>
      ${detailField('FLEET', fleet.name)}
      ${detailField('CURRENT HOME BASE', currentHome?.name || 'UNASSIGNED')}
      ${detailField('NEW HOME BASE', targetHome?.name || 'NO VALID HOME BASE')}
      ${detailField('DESTINATION SECTOR', targetSector?.name || 'UNKNOWN')}
      ${errorMessage ? `<div class="sector-modal-error">${esc(errorMessage)}</div>` : ''}
      <div class="sector-modal-actions"><button type="button" data-home-base-action="back" ${busy ? 'disabled' : ''}>BACK</button><button type="button" class="is-authorize" data-home-base-action="confirm" ${busy || !targetHome ? 'disabled' : ''}>${busy ? 'AUTHORIZING…' : 'CONFIRM CHANGE'}</button></div>
    </section></div>`;
  } else {
    wrapper.innerHTML = `<div class="sector-modal-backdrop"><section class="sector-modal" role="dialog" aria-modal="true" aria-labelledby="dni-home-base-title">
      <div class="sector-modal-heading"><span>DNI ADMINISTRATIVE COMMAND</span><h3 id="dni-home-base-title">CHANGE HOME BASE</h3></div>
      ${detailField('FLEET', fleet.name)}
      ${detailField('CURRENT HOME BASE', currentHome?.name || 'UNASSIGNED')}
      <form class="sector-command-form" data-home-base-form>
        <label>SECTOR<select name="sectorId" data-home-base-sector>${sectors().map(sector => `<option value="${esc(sector.id)}" ${String(sector.id) === String(targetSectorId) ? 'selected' : ''}>${esc(sector.name)} SECTOR</option>`).join('')}</select></label>
        <label>HOME BASE<select name="homeBaseId" ${destinations.length ? '' : 'disabled'}>${destinations.map(asset => `<option value="${esc(asset.id)}" ${String(asset.id) === String(targetHomeBaseId) ? 'selected' : ''}>${esc(asset.name)}</option>`).join('')}</select></label>
        ${destinations.length ? '' : '<div class="sector-modal-error">No base or installation is available in the selected sector.</div>'}
        ${errorMessage ? `<div class="sector-modal-error">${esc(errorMessage)}</div>` : ''}
        <div class="sector-modal-actions"><button type="button" data-home-base-action="close">CANCEL</button><button type="submit" class="is-authorize" ${busy || !destinations.length ? 'disabled' : ''}>REVIEW CHANGE</button></div>
      </form>
    </section></div>`;
  }

  host.append(wrapper);
}

async function openWorkflow(assetId) {
  busy = true;
  errorMessage = '';
  stage = 'edit';
  activeFleetId = String(assetId || '');

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
    if (!hasPermission(session, 'asset.assign')) {
      const error = new Error('DNI permission required: asset.assign');
      error.status = 403;
      throw error;
    }
    networkData = network;
    const fleet = currentFleet();
    if (!fleet || fleet.type !== 'fleet') {
      const error = new Error('Fleet record not found.');
      error.status = 404;
      throw error;
    }
    targetSectorId = String(fleet.sectorId || sectors()[0]?.id || '');
    targetHomeBaseId = String(fleet.homeBaseId || homeBasesForSector(targetSectorId)[0]?.id || '');
  } catch (error) {
    errorMessage = classifyError(error);
  } finally {
    busy = false;
    renderModal();
  }
}

async function confirmChange() {
  const fleet = currentFleet();
  const targetHome = homeBasesForSector(targetSectorId).find(asset => String(asset.id) === String(targetHomeBaseId));
  if (!fleet || !targetHome) {
    errorMessage = 'Validation failed: choose a valid base or installation before submitting.';
    stage = 'edit';
    return renderModal();
  }

  busy = true;
  errorMessage = '';
  renderModal();
  try {
    const response = await request('change-asset-assignment', {
      method: 'POST',
      body: JSON.stringify({
        assetId: fleet.id,
        destinationSectorId: targetSectorId,
        destinationId: targetHomeBaseId
      })
    });
    if (!response?.networkData) throw new Error('DNI backend did not return the updated Sectors snapshot.');
    networkData = response.networkData;
    window.dispatchEvent(new CustomEvent('dni:sectors-network-data', {
      detail: { data: response.networkData, reason: 'home-base-change', receivedAt: Date.now() }
    }));
    stage = 'success';
  } catch (error) {
    errorMessage = classifyError(error);
    stage = 'confirm';
  } finally {
    busy = false;
    renderModal();
  }
}

document.addEventListener('click', event => {
  const sourceButton = event.target.closest(`${ROOT_SELECTOR} [data-action="change-assignment"]`);
  if (sourceButton && /HOME BASE/i.test(sourceButton.textContent || '')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openWorkflow(sourceButton.dataset.assetId);
    return;
  }

  const actionButton = event.target.closest(`#${MODAL_ID} [data-home-base-action]`);
  if (!actionButton) return;
  event.preventDefault();
  const action = actionButton.dataset.homeBaseAction;
  if (action === 'close') {
    removeModal();
  } else if (action === 'back') {
    stage = 'edit';
    errorMessage = '';
    renderModal();
  } else if (action === 'confirm' && !busy) {
    void confirmChange();
  }
}, true);

document.addEventListener('change', event => {
  const field = event.target;
  if (!field.closest?.(`#${MODAL_ID}`)) return;
  if (field.matches('[data-home-base-sector]')) {
    targetSectorId = String(field.value || '');
    targetHomeBaseId = String(homeBasesForSector(targetSectorId)[0]?.id || '');
    errorMessage = '';
    renderModal();
  }
}, true);

document.addEventListener('submit', event => {
  const form = event.target.closest?.(`#${MODAL_ID} [data-home-base-form]`);
  if (!form) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const values = new FormData(form);
  targetSectorId = String(values.get('sectorId') || '');
  targetHomeBaseId = String(values.get('homeBaseId') || '');
  const valid = homeBasesForSector(targetSectorId).some(asset => String(asset.id) === targetHomeBaseId);
  if (!valid) {
    errorMessage = 'Validation failed: select a base or installation in the chosen sector.';
    return renderModal();
  }
  errorMessage = '';
  stage = 'confirm';
  renderModal();
}, true);
