import { DNI_SECTORS_SEED, ASSET_META } from './sectors-data.js';
import { createSectorsStore } from './sectors-store.js';
import { createSectorsApi, hasPermission } from './sectors-api.js';

const root = document.querySelector('#dni-sectors-root');
if (root) {
  const store = createSectorsStore(DNI_SECTORS_SEED);
  const api = createSectorsApi();
  let directoryOpen = false;
  let detailsOpen = false;
  let modal = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const statusClass = value => `sector-status sector-status-${String(value || 'unknown').toLowerCase().replace(/[^a-z]+/g, '-')}`;
  const sectorById = (data, id) => data.sectors.find(sector => sector.id === id);
  const assetById = (data, id) => data.assets.find(asset => asset.id === id);
  const personById = (data, id) => data.personnel.find(person => person.id === id);
  const assetsForSector = (data, id) => data.assets.filter(asset => asset.sectorId === id);
  const peopleForSector = (data, id) => data.personnel.filter(person => person.sectorId === id);
  const assignmentName = (data, id) => assetById(data, id)?.name || 'UNASSIGNED';
  const isMobile = () => globalThis.matchMedia?.('(max-width: 700px)').matches;

  function canAdmin(state) {
    return state.session.authenticated && state.session.permissions.some(permission => permission.startsWith('sectors.') || permission.startsWith('personnel.') || permission.startsWith('fleet.') || permission.startsWith('asset.'));
  }

  function renderTop(data, state) {
    const totals = data.network?.totals || {};
    return `
      <header class="sectors-command-strip">
        <div class="sectors-command-title">
          <span>DNI SECTORS</span>
          <strong>${esc(data.network?.name || 'IMPERIUM STRATEGIC NETWORK')}</strong>
        </div>
        <div class="sectors-command-metrics" aria-label="Strategic network totals">
          <div><span>ACTIVE SECTORS</span><b>${String(totals.activeSectors ?? data.sectors.length).padStart(2, '0')}</b></div>
          <div><span>ACTIVE FLEETS</span><b>${String(totals.activeFleets ?? data.assets.filter(asset => asset.type === 'fleet').length).padStart(2, '0')}</b></div>
          <div><span>BASES</span><b>${String(totals.bases ?? data.assets.filter(asset => asset.type === 'base').length).padStart(2, '0')}</b></div>
          <div><span>STATIONS</span><b>${String(totals.stations ?? data.assets.filter(asset => asset.type === 'station').length).padStart(2, '0')}</b></div>
          <div><span>PERSONNEL</span><b>${String(totals.personnel ?? data.personnel.length).padStart(3, '0')}</b></div>
        </div>
        <div class="sectors-network-state">
          <span>NETWORK STATUS</span>
          <b class="network-nominal"><i></i>${esc(data.network?.status || 'UNKNOWN')}</b>
          ${canAdmin(state) ? '<em>ADMIN CONTROL ACTIVE</em>' : ''}
        </div>
      </header>`;
  }

  function renderDirectory(data, state) {
    return `
      <aside class="sector-directory" aria-label="Sector Directory">
        <div class="sector-panel-heading">
          <div><span>IMPERIUM DIRECTORY</span><h3>Sector Directory</h3></div>
          <button type="button" class="sector-mobile-close" data-action="close-directory" aria-label="Close sector directory">×</button>
        </div>
        <div class="sector-directory-list">
          ${data.sectors.map(sector => {
            const expanded = state.expanded.has(sector.id);
            const selected = state.selectedSectorId === sector.id;
            const assets = assetsForSector(data, sector.id);
            return `
              <section class="sector-tree-group ${selected ? 'is-current' : ''}">
                <button type="button" class="sector-tree-sector" data-action="toggle-sector" data-sector-id="${esc(sector.id)}" aria-expanded="${expanded}">
                  <span class="tree-chevron">${expanded ? '▼' : '▶'}</span>
                  <span><b>SECTOR ${esc(sector.code)} — ${esc(sector.name)}</b><small>STATUS <i class="${statusClass(sector.status)}">${esc(sector.status)}</i></small></span>
                </button>
                ${expanded ? `<div class="sector-tree-assets">
                  ${assets.map((asset, index) => {
                    const meta = ASSET_META[asset.type] || { symbol: '•', label: asset.type };
                    const entitySelected = state.selected?.kind === 'asset' && state.selected.id === asset.id;
                    return `<button type="button" class="sector-tree-asset ${entitySelected ? 'is-selected' : ''}" data-action="select-asset" data-asset-id="${esc(asset.id)}">
                      <span class="tree-branch">${index === assets.length - 1 ? '└─' : '├─'}</span>
                      <span class="asset-symbol">${meta.symbol}</span>
                      <span><b>${esc(asset.shortName || asset.name)}</b><small>${Number(asset.personnel || 0)} Personnel</small></span>
                    </button>`;
                  }).join('')}
                </div>` : ''}
              </section>`;
          }).join('')}
        </div>
      </aside>`;
  }

  function renderViewTabs(state) {
    return `<div class="sector-view-tabs" role="tablist" aria-label="Sector view">
      ${['strategic', 'assets', 'personnel'].map(view => `<button type="button" role="tab" data-action="set-view" data-view="${view}" aria-selected="${state.view === view}">${view.toUpperCase()}</button>`).join('')}
    </div>`;
  }

  function renderStrategic(data, sector, state) {
    const assets = assetsForSector(data, sector.id);
    const lines = assets.map(asset => `<line x1="50" y1="52" x2="${Number(asset.x ?? 50)}" y2="${Number(asset.y ?? 50)}"></line>`).join('');
    const nodes = assets.map(asset => {
      const meta = ASSET_META[asset.type] || { symbol: '•' };
      const selected = state.selected?.kind === 'asset' && state.selected.id === asset.id;
      return `<button type="button" class="sector-map-node ${selected ? 'is-selected' : ''}" data-action="select-asset" data-asset-id="${esc(asset.id)}" style="--node-x:${Number(asset.x ?? 50)}%;--node-y:${Number(asset.y ?? 50)}%">
        <span>${meta.symbol}</span><b>${esc(asset.shortName || asset.name)}</b><small class="${statusClass(asset.status)}">${esc(asset.status)}</small>
      </button>`;
    }).join('');
    return `<div class="sector-schematic" aria-label="${esc(sector.name)} strategic schematic">
      <div class="sector-schematic-title"><span>STRATEGIC SECTOR VIEW</span><strong>${esc(sector.name)} SECTOR</strong></div>
      <svg class="sector-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      <button type="button" class="sector-map-primary" data-action="select-sector" data-sector-id="${esc(sector.id)}"><span>◉</span><b>${esc(sector.primary || sector.name)}</b></button>
      ${nodes}
      <div class="sector-control-readout"><span>TERRITORIAL STATUS</span><b>DNI CONTROL — ${Number(sector.control || 0)}%</b><i style="--control:${Number(sector.control || 0)}%"></i></div>
    </div>`;
  }

  function renderAssets(data, sector, state) {
    const assets = assetsForSector(data, sector.id);
    return `<div class="sector-assets-view">
      ${assets.map(asset => {
        const meta = ASSET_META[asset.type] || { symbol: '•', label: asset.type };
        const selected = state.selected?.kind === 'asset' && state.selected.id === asset.id;
        return `<button type="button" class="sector-asset-card ${selected ? 'is-selected' : ''}" data-action="select-asset" data-asset-id="${esc(asset.id)}">
          <span class="asset-card-symbol">${meta.symbol}</span>
          <span><small>${esc(meta.label)}</small><b>${esc(asset.name)}</b><em class="${statusClass(asset.status)}">${esc(asset.status)}</em></span>
          <span class="asset-card-meta"><b>${Number(asset.personnel || 0)}</b><small>PERSONNEL</small></span>
        </button>`;
      }).join('') || '<div class="sector-empty">NO ASSETS REGISTERED</div>'}
    </div>`;
  }

  function renderPersonnel(data, sector, state) {
    const people = peopleForSector(data, sector.id);
    return `<div class="sector-personnel-view">
      ${people.map(person => {
        const selected = state.selected?.kind === 'person' && state.selected.id === person.id;
        return `<button type="button" class="sector-person-row ${selected ? 'is-selected' : ''}" data-action="select-person" data-person-id="${esc(person.id)}">
          <span class="person-presence"></span>
          <span><b>${esc(person.name)}</b><small>${esc(person.rank)}</small></span>
          <span><b>${esc(assignmentName(data, person.assignmentId))}</b><small>ASSIGNMENT</small></span>
          <em class="${statusClass(person.status)}">${esc(person.status)}</em>
        </button>`;
      }).join('') || '<div class="sector-empty">NO PERSONNEL RECORDS AVAILABLE FOR THIS SECTOR</div>'}
    </div>`;
  }

  function renderCenter(data, state) {
    const sector = sectorById(data, state.selectedSectorId) || data.sectors[0];
    const body = state.view === 'assets'
      ? renderAssets(data, sector, state)
      : state.view === 'personnel'
        ? renderPersonnel(data, sector, state)
        : renderStrategic(data, sector, state);
    return `<main class="sector-strategic-view">
      <div class="sector-mobile-toolbar">
        <button type="button" data-action="open-directory">☰ SECTORS</button>
        <span>SECTOR ${esc(sector.code)} / ${esc(sector.name)}</span>
        <button type="button" data-action="open-details">DETAILS</button>
      </div>
      <div class="sector-view-heading">
        <div><span>SELECTED SECTOR</span><h3>SECTOR ${esc(sector.code)} — ${esc(sector.name)}</h3></div>
        <span class="${statusClass(sector.status)}">${esc(sector.status)}</span>
      </div>
      ${renderViewTabs(state)}
      <div class="sector-view-body">${body}</div>
    </main>`;
  }

  function detailField(label, value, className = '') {
    return `<div class="sector-detail-field"><span>${esc(label)}</span><b class="${className}">${esc(value ?? '—')}</b></div>`;
  }

  function renderSectorDetails(data, sector) {
    const assets = assetsForSector(data, sector.id);
    return `<div class="sector-detail-content">
      <span class="detail-kicker">SELECTED SECTOR</span>
      <h3>${esc(sector.name)} SECTOR</h3>
      ${detailField('STATUS', sector.status, statusClass(sector.status))}
      ${detailField('DNI CONTROL', `${Number(sector.control || 0)}%`)}
      ${detailField('PRIMARY LOCATION', sector.primary)}
      ${detailField('VISIBLE ASSETS', assets.length)}
      ${detailField('PERSONNEL', sector.personnel)}
      <button type="button" class="sector-command-button" data-action="set-view" data-view="assets">VIEW SECTOR ASSETS</button>
    </div>`;
  }

  function renderAssetDetails(data, asset, state) {
    const sector = sectorById(data, asset.sectorId);
    const meta = ASSET_META[asset.type] || { label: asset.type };
    const homeBase = asset.homeBaseId ? assetById(data, asset.homeBaseId) : null;
    const fleetAdmin = asset.type === 'fleet' && hasPermission(state.session, 'fleet.redeploy');
    const assignmentAdmin = hasPermission(state.session, 'asset.assign');
    const commanderAdmin = asset.type === 'fleet' && hasPermission(state.session, 'fleet.commander');
    return `<div class="sector-detail-content">
      <span class="detail-kicker">SELECTED ASSET</span>
      <h3>${esc(asset.name)}</h3>
      ${detailField('TYPE', meta.label)}
      ${detailField('STATUS', `● ${asset.status}`, statusClass(asset.status))}
      ${detailField('CURRENT LOCATION', `${sector?.name || 'UNKNOWN'} SECTOR / ${asset.location || 'UNKNOWN'}`)}
      ${asset.commander ? detailField('COMMANDER', asset.commander) : ''}
      ${detailField('PERSONNEL', asset.personnel ?? 0)}
      ${asset.vessels != null ? detailField('VESSELS', asset.vessels) : ''}
      ${homeBase ? detailField('HOME BASE', homeBase.shortName || homeBase.name) : ''}
      <button type="button" class="sector-command-button" data-action="focus-asset" data-asset-id="${esc(asset.id)}">VIEW ${asset.type === 'fleet' ? 'FLEET' : 'ASSET'}</button>
      ${(fleetAdmin || assignmentAdmin || commanderAdmin) ? `<div class="sector-admin-block"><span>COMMAND ACTIONS</span>
        ${fleetAdmin ? `<button type="button" data-action="redeploy-fleet" data-asset-id="${esc(asset.id)}">REDEPLOY FLEET</button>` : ''}
        ${assignmentAdmin ? `<button type="button" data-action="change-assignment" data-asset-id="${esc(asset.id)}">CHANGE ${asset.type === 'fleet' ? 'HOME BASE' : 'ASSIGNMENT'}</button>` : ''}
        ${commanderAdmin ? `<button type="button" data-action="assign-commander" data-asset-id="${esc(asset.id)}">ASSIGN COMMANDER</button>` : ''}
      </div>` : ''}
    </div>`;
  }

  function renderPersonDetails(data, person, state) {
    const sector = sectorById(data, person.sectorId);
    const assignment = assetById(data, person.assignmentId);
    const canTransfer = hasPermission(state.session, 'personnel.transfer');
    return `<div class="sector-detail-content">
      <span class="detail-kicker">PERSONNEL RECORD</span>
      <h3>${esc(person.name)}</h3>
      <p class="detail-subtitle">${esc(person.rank)}</p>
      ${detailField('ASSIGNED', assignment?.name || 'UNASSIGNED')}
      ${detailField('LOCATION', `${sector?.name || 'UNKNOWN'} SECTOR`)}
      ${detailField('STATUS', `● ${person.status}`, statusClass(person.status))}
      <button type="button" class="sector-command-button" data-action="view-profile" data-person-id="${esc(person.id)}">VIEW PROFILE</button>
      ${canTransfer ? `<div class="sector-admin-block"><span>ADMINISTRATION</span><button type="button" data-action="transfer-personnel" data-person-id="${esc(person.id)}">TRANSFER PERSONNEL</button><button type="button" data-action="change-person-assignment" data-person-id="${esc(person.id)}">CHANGE ASSIGNMENT</button></div>` : ''}
    </div>`;
  }

  function renderDetails(data, state) {
    let body = '';
    if (!state.selected || state.selected.kind === 'sector') {
      body = renderSectorDetails(data, sectorById(data, state.selected?.id || state.selectedSectorId));
    } else if (state.selected.kind === 'asset') {
      body = renderAssetDetails(data, assetById(data, state.selected.id), state);
    } else {
      body = renderPersonDetails(data, personById(data, state.selected.id), state);
    }
    return `<aside class="sector-details-panel" aria-label="Selected asset or personnel details">
      <div class="sector-panel-heading"><div><span>CONTEXT / COMMAND</span><h3>Details</h3></div><button type="button" class="sector-mobile-close" data-action="close-details" aria-label="Close details">×</button></div>
      ${body}
    </aside>`;
  }

  function renderActivity(data, state) {
    const fullAudit = hasPermission(state.session, 'sectors.audit');
    return `<footer class="sector-activity-log">
      <div class="sector-activity-heading"><span>STRATEGIC NETWORK ACTIVITY</span><button type="button" data-action="view-all-activity">VIEW ALL</button></div>
      <div class="sector-activity-list">
        ${data.activity.slice(0, 5).map(event => `<div><time>${esc(event.time)}</time><span>${esc(fullAudit ? (event.adminText || event.publicText) : event.publicText)}</span><b>${esc(event.type)}</b></div>`).join('')}
      </div>
    </footer>`;
  }

  function renderTransferModal(data) {
    const person = personById(data, modal.personId);
    const currentSector = sectorById(data, person.sectorId);
    const currentAssignment = assetById(data, person.assignmentId);
    const targetSectorId = modal.targetSectorId || person.sectorId;
    const destinations = assetsForSector(data, targetSectorId);
    const targetAssignmentId = destinations.some(asset => asset.id === modal.targetAssignmentId) ? modal.targetAssignmentId : destinations[0]?.id || '';
    modal.targetAssignmentId = targetAssignmentId;
    return `<div class="sector-modal-backdrop" role="presentation"><section class="sector-modal" role="dialog" aria-modal="true" aria-labelledby="sector-modal-title">
      <div class="sector-modal-heading"><span>DNI ADMINISTRATIVE COMMAND</span><h3 id="sector-modal-title">PERSONNEL TRANSFER</h3></div>
      ${detailField('PERSONNEL', person.name)}
      ${detailField('CURRENT ASSIGNMENT', `${currentAssignment?.name || 'UNASSIGNED'} / ${currentSector?.name || 'UNKNOWN'} SECTOR`)}
      <form data-form="transfer-personnel" class="sector-command-form">
        <label>SECTOR<select name="sectorId" data-action="transfer-sector-change">${data.sectors.map(sector => `<option value="${esc(sector.id)}" ${sector.id === targetSectorId ? 'selected' : ''}>${esc(sector.name)} SECTOR</option>`).join('')}</select></label>
        <label>ASSIGNMENT<select name="assignmentId">${destinations.map(asset => `<option value="${esc(asset.id)}" ${asset.id === targetAssignmentId ? 'selected' : ''}>${esc(asset.name)}</option>`).join('')}</select></label>
        <label>REASON<textarea name="reason" maxlength="240" placeholder="Optional transfer reason">${esc(modal.reason || '')}</textarea></label>
        ${modal.error ? `<div class="sector-modal-error">${esc(modal.error)}</div>` : ''}
        <div class="sector-modal-actions"><button type="button" data-action="close-modal">CANCEL</button><button type="submit" class="is-authorize" ${modal.busy ? 'disabled' : ''}>${modal.busy ? 'AUTHORIZING…' : 'AUTHORIZE TRANSFER'}</button></div>
      </form>
    </section></div>`;
  }

  function renderRedeployModal(data) {
    const fleet = assetById(data, modal.assetId);
    const currentSector = sectorById(data, fleet.sectorId);
    const targetSectorId = modal.targetSectorId || fleet.sectorId;
    const destinations = assetsForSector(data, targetSectorId).filter(asset => asset.type === 'base' || asset.type === 'installation');
    const targetAssignmentId = destinations.some(asset => asset.id === modal.targetAssignmentId) ? modal.targetAssignmentId : destinations[0]?.id || '';
    modal.targetAssignmentId = targetAssignmentId;
    const targetSector = sectorById(data, targetSectorId);
    const target = assetById(data, targetAssignmentId);
    if (modal.stage === 'confirm') {
      return `<div class="sector-modal-backdrop"><section class="sector-modal sector-modal-confirm" role="dialog" aria-modal="true">
        <div class="sector-modal-heading"><span>STRATEGIC COMMAND</span><h3>CONFIRM STRATEGIC REDEPLOYMENT</h3></div>
        <strong class="redeploy-fleet-name">${esc(fleet.name)}</strong>
        <div class="redeploy-route"><span>${esc(currentSector?.name || 'UNKNOWN')}</span><b>↓</b><span>${esc(targetSector?.name || 'UNKNOWN')} / ${esc(target?.shortName || target?.name || 'SECTOR COMMAND')}</span></div>
        ${detailField('PERSONNEL AFFECTED', fleet.personnel || 0)}${detailField('VESSELS AFFECTED', fleet.vessels || 0)}
        ${modal.error ? `<div class="sector-modal-error">${esc(modal.error)}</div>` : ''}
        <div class="sector-modal-actions"><button type="button" data-action="redeploy-back">CANCEL</button><button type="button" class="is-authorize" data-action="confirm-redeploy" ${modal.busy ? 'disabled' : ''}>${modal.busy ? 'ISSUING…' : 'CONFIRM REDEPLOYMENT'}</button></div>
      </section></div>`;
    }
    return `<div class="sector-modal-backdrop"><section class="sector-modal" role="dialog" aria-modal="true">
      <div class="sector-modal-heading"><span>DNI STRATEGIC COMMAND</span><h3>FLEET REDEPLOYMENT ORDER</h3></div>
      ${detailField('ASSET', fleet.name)}${detailField('CURRENT POSITION', `${currentSector?.name || 'UNKNOWN'} SECTOR / ${fleet.location || 'UNKNOWN'}`)}
      <form data-form="redeploy-fleet" class="sector-command-form">
        <label>DESTINATION SECTOR<select name="sectorId" data-action="redeploy-sector-change">${data.sectors.map(sector => `<option value="${esc(sector.id)}" ${sector.id === targetSectorId ? 'selected' : ''}>${esc(sector.name)}</option>`).join('')}</select></label>
        <label>DESTINATION<select name="assignmentId">${destinations.map(asset => `<option value="${esc(asset.id)}" ${asset.id === targetAssignmentId ? 'selected' : ''}>${esc(asset.name)}</option>`).join('')}</select></label>
        <fieldset><legend>DEPLOYMENT TYPE</legend><label class="sector-radio"><input type="radio" name="deploymentType" value="temporary" ${modal.deploymentType === 'temporary' ? 'checked' : ''}> TEMPORARY</label><label class="sector-radio"><input type="radio" name="deploymentType" value="permanent" ${modal.deploymentType !== 'temporary' ? 'checked' : ''}> PERMANENT</label></fieldset>
        <label>ORDER NOTES<textarea name="notes" maxlength="320">${esc(modal.notes || '')}</textarea></label>
        ${modal.error ? `<div class="sector-modal-error">${esc(modal.error)}</div>` : ''}
        <div class="sector-modal-actions"><button type="button" data-action="close-modal">ABORT</button><button type="submit" class="is-authorize">ISSUE ORDER</button></div>
      </form>
    </section></div>`;
  }

  function renderMessageModal() {
    return `<div class="sector-modal-backdrop"><section class="sector-modal" role="dialog" aria-modal="true"><div class="sector-modal-heading"><span>SECURE COMMAND PATH</span><h3>${esc(modal.title || 'COMMAND')}</h3></div><p class="sector-modal-copy">${esc(modal.message || 'This command requires the configured secure DNI backend endpoint. No administrative change is performed by GitHub Pages.')}</p><div class="sector-modal-actions"><button type="button" data-action="close-modal">CLOSE</button></div></section></div>`;
  }

  function renderModal(data) {
    if (!modal) return '';
    if (modal.type === 'transfer') return renderTransferModal(data);
    if (modal.type === 'redeploy') return renderRedeployModal(data);
    return renderMessageModal();
  }

  function render({ data, state }) {
    root.className = `dni-sectors-root ${directoryOpen ? 'is-directory-open' : ''} ${detailsOpen ? 'is-details-open' : ''}`;
    root.innerHTML = `${renderTop(data, state)}<div class="sectors-command-layout">${renderDirectory(data, state)}${renderCenter(data, state)}${renderDetails(data, state)}</div>${renderActivity(data, state)}${renderModal(data)}`;
  }

  async function performMutation(task) {
    modal.busy = true;
    modal.error = '';
    render(store.snapshot());
    try {
      const response = await task();
      if (response?.networkData || response?.data?.sectors) store.applyServerMutation(response);
      modal = null;
      render(store.snapshot());
    } catch (error) {
      modal.busy = false;
      modal.error = error?.message || 'Command rejected by DNI backend.';
      render(store.snapshot());
    }
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const snapshot = store.snapshot();
    const { data, state } = snapshot;

    if (action === 'toggle-sector') {
      store.toggleSector(button.dataset.sectorId);
      store.selectSector(button.dataset.sectorId);
      if (isMobile()) directoryOpen = false;
    } else if (action === 'select-sector') {
      store.selectSector(button.dataset.sectorId);
      detailsOpen = isMobile();
    } else if (action === 'select-asset') {
      store.select('asset', button.dataset.assetId);
      detailsOpen = isMobile();
      if (isMobile()) directoryOpen = false;
    } else if (action === 'select-person') {
      store.select('person', button.dataset.personId);
      detailsOpen = isMobile();
    } else if (action === 'set-view') {
      store.setView(button.dataset.view);
    } else if (action === 'open-directory') {
      directoryOpen = true; render(snapshot);
    } else if (action === 'close-directory') {
      directoryOpen = false; render(snapshot);
    } else if (action === 'open-details') {
      detailsOpen = true; render(snapshot);
    } else if (action === 'close-details') {
      detailsOpen = false; render(snapshot);
    } else if (action === 'focus-asset') {
      store.setView('strategic');
    } else if (action === 'view-profile') {
      store.setView('personnel');
    } else if (action === 'transfer-personnel' && hasPermission(state.session, 'personnel.transfer')) {
      const person = personById(data, button.dataset.personId);
      modal = { type: 'transfer', personId: person.id, targetSectorId: person.sectorId, targetAssignmentId: person.assignmentId, busy: false, error: '' };
      render(snapshot);
    } else if (action === 'redeploy-fleet' && hasPermission(state.session, 'fleet.redeploy')) {
      const fleet = assetById(data, button.dataset.assetId);
      modal = { type: 'redeploy', assetId: fleet.id, targetSectorId: fleet.sectorId, targetAssignmentId: fleet.homeBaseId || '', deploymentType: 'permanent', stage: 'edit', busy: false, error: '' };
      render(snapshot);
    } else if (action === 'redeploy-back') {
      modal.stage = 'edit'; modal.error = ''; render(snapshot);
    } else if (action === 'confirm-redeploy') {
      if (!modal || !hasPermission(state.session, 'fleet.redeploy')) return;
      void performMutation(() => api.redeployFleet({ assetId: modal.assetId, destinationSectorId: modal.targetSectorId, destinationId: modal.targetAssignmentId, deploymentType: modal.deploymentType, notes: modal.notes || '' }));
    } else if (action === 'change-assignment' || action === 'assign-commander' || action === 'change-person-assignment') {
      modal = { type: 'message', title: 'COMMAND ENDPOINT READY', message: 'This control is permission-gated and reserved for the secure DNI backend. GitHub Pages will never perform this administrative mutation locally.' };
      render(snapshot);
    } else if (action === 'view-all-activity') {
      modal = { type: 'message', title: 'STRATEGIC ACTIVITY', message: hasPermission(state.session, 'sectors.audit') ? 'Complete administrative audit data is available through the secure backend activity endpoint.' : 'Member view displays sanitized strategic activity only.' };
      render(snapshot);
    } else if (action === 'close-modal') {
      modal = null; render(snapshot);
    }
  });

  root.addEventListener('change', event => {
    if (!modal) return;
    const field = event.target;
    if (field.matches('[data-action="transfer-sector-change"]')) {
      modal.targetSectorId = field.value;
      modal.targetAssignmentId = assetsForSector(store.snapshot().data, field.value)[0]?.id || '';
      render(store.snapshot());
    } else if (field.matches('[data-action="redeploy-sector-change"]')) {
      modal.targetSectorId = field.value;
      modal.targetAssignmentId = assetsForSector(store.snapshot().data, field.value).find(asset => asset.type === 'base' || asset.type === 'installation')?.id || '';
      render(store.snapshot());
    }
  });

  root.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    const snapshot = store.snapshot();
    if (form.dataset.form === 'transfer-personnel' && modal?.type === 'transfer' && hasPermission(snapshot.state.session, 'personnel.transfer')) {
      const values = new FormData(form);
      modal.targetSectorId = String(values.get('sectorId') || '');
      modal.targetAssignmentId = String(values.get('assignmentId') || '');
      modal.reason = String(values.get('reason') || '');
      if (!assetsForSector(snapshot.data, modal.targetSectorId).some(asset => asset.id === modal.targetAssignmentId)) {
        modal.error = 'Invalid destination assignment for selected sector.';
        return render(snapshot);
      }
      void performMutation(() => api.transferPersonnel({ personnelId: modal.personId, destinationSectorId: modal.targetSectorId, destinationAssignmentId: modal.targetAssignmentId, reason: modal.reason }));
    } else if (form.dataset.form === 'redeploy-fleet' && modal?.type === 'redeploy' && hasPermission(snapshot.state.session, 'fleet.redeploy')) {
      const values = new FormData(form);
      modal.targetSectorId = String(values.get('sectorId') || '');
      modal.targetAssignmentId = String(values.get('assignmentId') || '');
      modal.deploymentType = String(values.get('deploymentType') || 'permanent');
      modal.notes = String(values.get('notes') || '');
      const allowed = assetsForSector(snapshot.data, modal.targetSectorId).some(asset => asset.id === modal.targetAssignmentId && (asset.type === 'base' || asset.type === 'installation'));
      if (!allowed) {
        modal.error = 'Fleet destination must be a valid base or installation in the selected sector.';
        return render(snapshot);
      }
      modal.stage = 'confirm';
      render(snapshot);
    }
  });

  store.subscribe(render);

  Promise.all([api.getSession(), api.getNetworkData()])
    .then(([session, networkData]) => {
      store.setSession(session);
      if (networkData?.sectors && networkData?.assets && networkData?.personnel) store.replaceData(networkData);
      else if (networkData?.data?.sectors) store.replaceData(networkData.data);
    })
    .catch(error => console.error('DNI Sectors backend initialization failed', error));
}
