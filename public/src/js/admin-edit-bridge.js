const ADMIN_DATA_URL = '/admin-data.php';

let directAdminData = null;
let directAdminCsrf = '';
let selectedSectorId = null;
let selectedAssetId = null;
let activating = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const attr = value => esc(value ?? '');

function ensureStyles() {
  if (document.querySelector('#dni-admin-edit-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'dni-admin-edit-bridge-style';
  style.textContent = `
    .dni-direct-editor{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0}
    .dni-direct-editor .dni-admin-block{min-width:0}
    .dni-direct-editor-heading{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}
    .dni-direct-editor-heading strong{color:#eee;font:700 12px/1.2 "Courier New",monospace;letter-spacing:1px}
    .dni-direct-editor-heading span{color:#6cff9d;font:700 8px/1 "Courier New",monospace;letter-spacing:.8px}
    .dni-direct-picker{width:100%;min-width:0;box-sizing:border-box;margin-bottom:10px;border:1px solid #444;background:#0d0d0d;color:#eee;padding:10px;font:11px/1.3 "Courier New",monospace}
    .dni-direct-status{margin:10px 0 0;border:1px solid #304b39;background:#08110b;color:#86e6a4;padding:9px 10px;font:9px/1.45 "Courier New",monospace;overflow-wrap:anywhere}
    .dni-direct-status.is-error{border-color:#6c2929;background:#190b0b;color:#e8a5a5}
    .dni-direct-editor .dni-admin-actions{display:flex;flex-wrap:wrap;gap:8px}
    .dni-direct-editor .dni-admin-action{min-height:42px}
    @media(max-width:760px){
      .dni-direct-editor{grid-template-columns:1fr!important;width:100%!important;max-width:100%!important;min-width:0!important}
      .dni-direct-editor .dni-admin-block,.dni-direct-editor .dni-admin-form{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
      .dni-direct-editor .dni-admin-form{grid-template-columns:1fr!important}
      .dni-direct-editor .dni-admin-form .wide{grid-column:auto!important}
      .dni-direct-editor input,.dni-direct-editor select{font-size:16px!important;max-width:100%!important;min-width:0!important}
      .dni-direct-editor .dni-admin-actions{display:grid!important;grid-template-columns:1fr!important}
      .dni-direct-editor .dni-admin-action,.dni-direct-editor .dni-admin-link{width:100%!important;box-sizing:border-box!important;text-align:center}
    }
  `;
  document.head.append(style);
}

async function readBootstrap() {
  const response = await fetch(`${ADMIN_DATA_URL}?action=bootstrap`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  directAdminData = payload;
  directAdminCsrf = String(payload.csrfToken || '');
  if (!selectedSectorId && payload.sectors?.length) selectedSectorId = String(payload.sectors[0].id);
  if (!selectedAssetId && payload.assets?.length) selectedAssetId = String(payload.assets[0].id);
  return payload;
}

async function writeRecord(action, payload) {
  const response = await fetch(`${ADMIN_DATA_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-DNI-CSRF': directAdminCsrf
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
  directAdminData = data;
  directAdminCsrf = String(data.csrfToken || directAdminCsrf);
  return data;
}

function option(value, label, selected) {
  return `<option value="${attr(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`;
}

function sectorOptions(selected) {
  return (directAdminData?.sectors || []).map(sector => option(sector.id, `${sector.code} · ${sector.name}`, selected)).join('');
}

function assetOptions(selected, includeNone = false) {
  const options = (directAdminData?.assets || []).map(asset => option(asset.id, asset.name, selected)).join('');
  return includeNone ? option('', 'None', selected) + options : options;
}

function currentSector() {
  return (directAdminData?.sectors || []).find(sector => String(sector.id) === String(selectedSectorId)) || null;
}

function currentAsset() {
  return (directAdminData?.assets || []).find(asset => String(asset.id) === String(selectedAssetId)) || null;
}

function renderSectorEditor() {
  const sector = currentSector();
  if (!sector) return `<section class="dni-admin-block"><div class="dni-direct-editor-heading"><strong>EDIT SECTOR</strong><span>NO RECORDS</span></div><p class="dni-admin-notice">No sector records are available.</p></section>`;
  return `<section class="dni-admin-block" data-direct-editor="sector">
    <div class="dni-direct-editor-heading"><strong>EDIT SECTOR</strong><span>LIVE DATABASE</span></div>
    <select class="dni-direct-picker" data-direct-sector-picker aria-label="Choose sector">${sectorOptions(sector.id)}</select>
    <form class="dni-admin-form" data-direct-admin-form="save-sector">
      <label>Sector ID<input name="id" value="${attr(sector.id)}" readonly required></label>
      <label>Code<input name="code" maxlength="16" value="${attr(sector.code)}" required></label>
      <label>Name<input name="name" maxlength="100" value="${attr(sector.name)}" required></label>
      <label>Status<input name="status" maxlength="32" value="${attr(sector.status || 'SECURE')}" required></label>
      <label>Control %<input name="control" type="number" min="0" max="100" step="0.01" value="${attr(sector.control_percent ?? 100)}"></label>
      <label>Primary Location<input name="primary" maxlength="160" value="${attr(sector.primary_location || '')}"></label>
      <label class="dni-admin-check wide"><input type="checkbox" name="active" ${Number(sector.active) === 1 ? 'checked' : ''}> Active sector</label>
      <div class="dni-admin-actions wide"><button class="dni-admin-action" type="submit">SAVE SECTOR</button><a class="dni-admin-link" href="/sectors">OPEN LIVE SECTORS</a></div>
    </form>
    <div class="dni-direct-status" data-direct-status="sector">Select a sector, edit the fields, then press SAVE SECTOR.</div>
  </section>`;
}

function renderAssetEditor() {
  const asset = currentAsset();
  if (!asset) return `<section class="dni-admin-block"><div class="dni-direct-editor-heading"><strong>EDIT ASSET</strong><span>NO RECORDS</span></div><p class="dni-admin-notice">No asset records are available.</p></section>`;
  const activeSectors = (directAdminData?.sectors || []).filter(sector => Number(sector.active) === 1 || String(sector.id) === String(asset.sector_id));
  const sectorList = activeSectors.map(sector => option(sector.id, `${sector.code} · ${sector.name}`, asset.sector_id)).join('');
  return `<section class="dni-admin-block" data-direct-editor="asset">
    <div class="dni-direct-editor-heading"><strong>EDIT ASSET</strong><span>LIVE DATABASE</span></div>
    <select class="dni-direct-picker" data-direct-asset-picker aria-label="Choose asset">${assetOptions(asset.id)}</select>
    <form class="dni-admin-form" data-direct-admin-form="save-asset">
      <label>Asset ID<input name="id" value="${attr(asset.id)}" readonly required></label>
      <label>Name<input name="name" maxlength="160" value="${attr(asset.name)}" required></label>
      <label>Sector<select name="sectorId">${sectorList}</select></label>
      <label>Type<select name="type">${['fleet','base','station','installation'].map(type => option(type, type.toUpperCase(), asset.type)).join('')}</select></label>
      <label>Status<input name="status" maxlength="32" value="${attr(asset.status || 'OPERATIONAL')}"></label>
      <label>Location<input name="location" maxlength="180" value="${attr(asset.location || '')}"></label>
      <label>Commander<input name="commander" maxlength="128" value="${attr(asset.commander_name || '')}"></label>
      <label>Vessel Count<input name="vessels" type="number" min="0" max="65535" value="${Number(asset.vessel_count || 0)}"></label>
      <label>Home Base<select name="homeBaseId">${assetOptions(asset.home_base_id, true)}</select></label>
      <label class="dni-admin-check"><input type="checkbox" name="active" ${Number(asset.active) === 1 ? 'checked' : ''}> Active asset</label>
      <div class="dni-admin-actions wide"><button class="dni-admin-action" type="submit">SAVE ASSET</button><a class="dni-admin-link" href="/sectors">OPEN LIVE SECTORS</a></div>
    </form>
    <div class="dni-direct-status" data-direct-status="asset">Select an asset, edit the fields, then press SAVE ASSET.</div>
  </section>`;
}

function renderDirectWorkspace(panel) {
  const host = panel.querySelector('.dni-admin-workspace');
  if (!host) return;
  host.innerHTML = `<div class="dni-direct-editor">${renderSectorEditor()}${renderAssetEditor()}</div>`;
  for (const button of panel.querySelectorAll('[data-admin-workspace]')) {
    button.classList.toggle('is-active', button.dataset.adminWorkspace === 'sectors');
    button.setAttribute('aria-pressed', String(button.dataset.adminWorkspace === 'sectors'));
  }
}

function formPayload(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  for (const checkbox of form.querySelectorAll('input[type="checkbox"][name]')) payload[checkbox.name] = checkbox.checked;
  return payload;
}

function setStatus(panel, kind, message, isError = false) {
  const status = panel.querySelector(`[data-direct-status="${kind}"]`);
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

async function activateSectorEditor(panel, updateUrl = true) {
  if (!panel || activating) return;
  activating = true;
  ensureStyles();
  const host = panel.querySelector('.dni-admin-workspace');
  if (host) host.innerHTML = '<div class="dni-loading"><span>DNI ADMIN</span><b>Loading editable sector and asset records…</b></div>';
  if (updateUrl && String(location.pathname).replace(/\/+$/, '') === '/admin') {
    const url = new URL(location.href);
    url.searchParams.set('workspace', 'sectors');
    history.replaceState({}, '', url);
  }
  try {
    await readBootstrap();
    renderDirectWorkspace(panel);
    requestAnimationFrame(() => panel.querySelector('.dni-direct-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  } catch (error) {
    if (host) {
      const signIn = error.status === 401 || error.status === 403
        ? '<div class="dni-admin-actions"><a class="dni-admin-link" href="/auth/discord/login?next=/admin?workspace=sectors">SIGN IN / RESYNC DISCORD</a></div>'
        : '';
      host.innerHTML = `<section class="dni-admin-block"><div class="dni-admin-notice is-error"><strong>SECTOR EDITOR UNAVAILABLE</strong> · ${esc(error.message || error)}</div>${signIn}</section>`;
    }
  } finally {
    activating = false;
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-admin-workspace="sectors"]');
  const panel = button?.closest('.dni-admin-panel');
  if (!button || !panel) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void activateSectorEditor(panel, true);
}, true);

document.addEventListener('change', event => {
  const panel = event.target.closest('.dni-admin-panel');
  if (!panel) return;
  if (event.target.matches('[data-direct-sector-picker]')) {
    selectedSectorId = event.target.value;
    renderDirectWorkspace(panel);
    requestAnimationFrame(() => panel.querySelector('[data-direct-editor="sector"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  if (event.target.matches('[data-direct-asset-picker]')) {
    selectedAssetId = event.target.value;
    renderDirectWorkspace(panel);
    requestAnimationFrame(() => panel.querySelector('[data-direct-editor="asset"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
});

document.addEventListener('submit', event => {
  const form = event.target.closest('[data-direct-admin-form]');
  const panel = form?.closest('.dni-admin-panel');
  if (!form || !panel) return;
  event.preventDefault();
  event.stopPropagation();
  const action = form.dataset.directAdminForm;
  const kind = action === 'save-sector' ? 'sector' : 'asset';
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  setStatus(panel, kind, 'Saving changes…');
  void writeRecord(action, formPayload(form)).then(() => {
    setStatus(panel, kind, action === 'save-sector' ? 'Sector saved successfully.' : 'Asset saved successfully.');
    renderDirectWorkspace(panel);
  }).catch(error => {
    setStatus(panel, kind, error.message || String(error), true);
    if (button) button.disabled = false;
  });
}, true);

function autoOpenRequestedWorkspace() {
  if (String(location.pathname).replace(/\/+$/, '') !== '/admin') return;
  if (new URLSearchParams(location.search).get('workspace') !== 'sectors') return;
  const tryOpen = () => {
    const panel = document.querySelector('.dni-admin-panel');
    const button = panel?.querySelector('[data-admin-workspace="sectors"]');
    if (!panel || !button) return false;
    void activateSectorEditor(panel, false);
    return true;
  };
  if (tryOpen()) return;
  const observer = new MutationObserver(() => {
    if (tryOpen()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}

autoOpenRequestedWorkspace();
