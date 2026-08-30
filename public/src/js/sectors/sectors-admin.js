import { createSectorsApi, hasPermission } from './sectors-api.js';

const panel = document.querySelector('[data-module="sectors"]');
if (panel) {
  const api = createSectorsApi();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const attr = value => esc(value ?? '');

  function installStyles() {
    if (document.querySelector('#dni-sectors-admin-style')) return;
    const style = document.createElement('style');
    style.id = 'dni-sectors-admin-style';
    style.textContent = `
      .dni-sectors-admin{margin:0 0 12px;border:1px solid #343434;background:#070707;color:#ddd;max-width:100%;box-sizing:border-box;overflow:hidden}
      .dni-sectors-admin>summary{cursor:pointer;padding:12px 14px;font:700 9px/1.3 "Courier New",monospace;letter-spacing:1px;color:#d8d8d8;list-style-position:inside}
      .dni-sectors-admin>.dni-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 12px 12px;min-width:0}
      .dni-sectors-admin form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;border:1px solid #292929;background:#0a0a0a;padding:10px;min-width:0;box-sizing:border-box}
      .dni-sectors-admin form h4{grid-column:1/-1;margin:0 0 2px;color:#efefef;font:700 10px/1.2 "Courier New",monospace;letter-spacing:1px}
      .dni-sectors-admin form label{display:flex;flex-direction:column;gap:4px;min-width:0;color:#777;font:700 7px/1.2 "Courier New",monospace;letter-spacing:.8px;text-transform:uppercase}
      .dni-sectors-admin form .wide{grid-column:1/-1}
      .dni-sectors-admin input,.dni-sectors-admin select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #383838;background:#0e0e0e;color:#eee;padding:9px;font:10px/1.25 "Courier New",monospace}
      .dni-sectors-admin button{min-height:40px;border:1px solid #484848;background:#121212;color:#eee;padding:9px;font:700 8px/1.2 "Courier New",monospace;letter-spacing:.7px;cursor:pointer}
      .dni-sectors-admin button:hover{border-color:#777;background:#191919}
      .dni-sectors-admin .dni-admin-danger{border-color:#693333;color:#ff9b9b}
      .dni-sectors-admin .dni-admin-check{flex-direction:row;align-items:center;gap:7px}
      .dni-sectors-admin .dni-admin-check input{width:auto}
      @media(max-width:760px){.dni-sectors-admin>.dni-admin-grid,.dni-sectors-admin form{grid-template-columns:minmax(0,1fr)}.dni-sectors-admin form h4,.dni-sectors-admin form .wide{grid-column:auto}.dni-sectors-admin input,.dni-sectors-admin select{font-size:16px}}
    `;
    document.head.append(style);
  }

  async function install() {
    try {
      installStyles();
      const [session, data] = await Promise.all([api.getSession(), api.getNetworkData()]);
      const canManageSectors = hasPermission(session, 'sectors.manage') || hasPermission(session, 'sectors.create') || hasPermission(session, 'sectors.delete');
      const canManageAssets = hasPermission(session, 'assets.manage') || hasPermission(session, 'assets.create') || hasPermission(session, 'assets.delete');
      const canEditRecords = hasPermission(session, 'admin');
      if (!session.authenticated || (!canManageSectors && !canManageAssets)) return;
      if (panel.querySelector('.dni-sectors-admin')) return;

      const sectors = Array.isArray(data.sectors) ? data.sectors : [];
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const firstSector = sectors[0] || null;
      const firstAsset = assets[0] || null;
      const sectorOptions = selected => sectors.map(item => `<option value="${attr(item.id)}" ${String(item.id) === String(selected || '') ? 'selected' : ''}>${esc(item.code)} · ${esc(item.name)}</option>`).join('');
      const assetOptions = selected => assets.map(item => `<option value="${attr(item.id)}" ${String(item.id) === String(selected || '') ? 'selected' : ''}>${esc(item.name)}</option>`).join('');
      const homeBaseOptions = selected => `<option value="">None</option>${assetOptions(selected)}`;

      const tools = document.createElement('details');
      tools.className = 'dni-sectors-admin';
      tools.open = true;
      tools.innerHTML = `<summary>STRATEGIC ADMINISTRATION · DATABASE CONTROL</summary><div class="dni-admin-grid">
        ${canEditRecords && firstSector ? `<form data-admin-form="save-sector"><h4>EDIT SECTOR</h4>
          <label class="wide">Sector<select name="id" data-edit-sector-select>${sectorOptions(firstSector.id)}</select></label>
          <label>Code<input name="code" value="${attr(firstSector.code)}" required></label>
          <label>Name<input name="name" value="${attr(firstSector.name)}" required></label>
          <label>Status<input name="status" value="${attr(firstSector.status || 'SECURE')}"></label>
          <label>Control %<input name="control" type="number" min="0" max="100" step="1" value="${Number(firstSector.control ?? 100)}"></label>
          <label class="wide">Primary Location<input name="primary" value="${attr(firstSector.primary || '')}"></label>
          <label class="dni-admin-check wide"><input type="checkbox" name="active" ${firstSector.active === false ? '' : 'checked'}> Active sector</label>
          <button class="wide" type="submit">SAVE SECTOR</button></form>` : ''}
        ${canEditRecords && firstAsset ? `<form data-admin-form="save-asset"><h4>EDIT ASSET</h4>
          <label class="wide">Asset<select name="id" data-edit-asset-select>${assetOptions(firstAsset.id)}</select></label>
          <label>Name<input name="name" value="${attr(firstAsset.name)}" required></label>
          <label>Sector<select name="sectorId">${sectorOptions(firstAsset.sectorId)}</select></label>
          <label>Type<select name="type">${['fleet','base','station','installation'].map(type => `<option value="${type}" ${type === firstAsset.type ? 'selected' : ''}>${type.toUpperCase()}</option>`).join('')}</select></label>
          <label>Status<input name="status" value="${attr(firstAsset.status || 'OPERATIONAL')}"></label>
          <label>Location<input name="location" value="${attr(firstAsset.location || '')}"></label>
          <label>Commander<input name="commander" value="${attr(firstAsset.commander || '')}"></label>
          <label>Vessels<input name="vessels" type="number" min="0" max="65535" value="${Number(firstAsset.vessels || 0)}"></label>
          <label class="wide">Home Base<select name="homeBaseId">${homeBaseOptions(firstAsset.homeBaseId)}</select></label>
          <label class="dni-admin-check wide"><input type="checkbox" name="active" ${firstAsset.active === false ? '' : 'checked'}> Active asset</label>
          <button class="wide" type="submit">SAVE ASSET</button></form>` : ''}
        ${canManageSectors ? `<form data-admin-form="create-sector"><h4>CREATE SECTOR</h4><label>Sector ID<input name="id" placeholder="sector-id" required></label><label>Code<input name="code" placeholder="code" required></label><label class="wide">Name<input name="name" placeholder="name" required></label><label class="wide">Primary Location<input name="primary" placeholder="primary location"></label><button class="wide" type="submit">CREATE SECTOR</button></form>
        <form data-admin-form="delete-sector"><h4>REMOVE SECTOR</h4><label class="wide">Sector<select name="sectorId">${sectorOptions(firstSector?.id)}</select></label><button class="dni-admin-danger wide" type="submit">REMOVE EMPTY SECTOR</button></form>` : ''}
        ${canManageAssets ? `<form data-admin-form="create-asset"><h4>CREATE ASSET</h4><label>Asset ID<input name="id" placeholder="asset-id" required></label><label>Name<input name="name" placeholder="asset name" required></label><label>Sector<select name="sectorId">${sectorOptions(firstSector?.id)}</select></label><label>Type<select name="type"><option value="fleet">Fleet</option><option value="base">Base</option><option value="station">Station</option><option value="installation">Installation</option></select></label><label class="wide">Location<input name="location" placeholder="location"></label><button class="wide" type="submit">CREATE ASSET</button></form>
        <form data-admin-form="delete-asset"><h4>REMOVE ASSET</h4><label class="wide">Asset<select name="assetId">${assetOptions(firstAsset?.id)}</select></label><button class="dni-admin-danger wide" type="submit">REMOVE EMPTY ASSET</button></form>` : ''}
      </div>`;
      panel.insertBefore(tools, panel.firstChild);

      const sectorForm = tools.querySelector('[data-admin-form="save-sector"]');
      sectorForm?.querySelector('[data-edit-sector-select]')?.addEventListener('change', event => {
        const sector = sectors.find(item => String(item.id) === String(event.target.value));
        if (!sector) return;
        sectorForm.elements.code.value = sector.code || '';
        sectorForm.elements.name.value = sector.name || '';
        sectorForm.elements.status.value = sector.status || 'SECURE';
        sectorForm.elements.control.value = Number(sector.control ?? 100);
        sectorForm.elements.primary.value = sector.primary || '';
        sectorForm.elements.active.checked = sector.active !== false;
      });

      const assetForm = tools.querySelector('[data-admin-form="save-asset"]');
      assetForm?.querySelector('[data-edit-asset-select]')?.addEventListener('change', event => {
        const asset = assets.find(item => String(item.id) === String(event.target.value));
        if (!asset) return;
        assetForm.elements.name.value = asset.name || '';
        assetForm.elements.sectorId.value = asset.sectorId || '';
        assetForm.elements.type.value = asset.type || 'fleet';
        assetForm.elements.status.value = asset.status || 'OPERATIONAL';
        assetForm.elements.location.value = asset.location || '';
        assetForm.elements.commander.value = asset.commander || '';
        assetForm.elements.vessels.value = Number(asset.vessels || 0);
        assetForm.elements.homeBaseId.value = asset.homeBaseId || '';
        assetForm.elements.active.checked = asset.active !== false;
      });

      tools.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.target;
        const values = Object.fromEntries(new FormData(form).entries());
        for (const checkbox of form.querySelectorAll('input[type="checkbox"][name]')) values[checkbox.name] = checkbox.checked;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          if (form.dataset.adminForm === 'save-sector') await api.saveSector(values);
          if (form.dataset.adminForm === 'save-asset') await api.saveAsset(values);
          if (form.dataset.adminForm === 'create-sector') await api.createSector(values);
          if (form.dataset.adminForm === 'delete-sector') await api.deleteSector(values);
          if (form.dataset.adminForm === 'create-asset') await api.createAsset(values);
          if (form.dataset.adminForm === 'delete-asset') await api.deleteAsset(values);
          window.location.reload();
        } catch (error) {
          alert(error.message || error);
          button.disabled = false;
        }
      });
    } catch (error) {
      console.error('DNI sector administration failed to initialize', error);
    }
  }

  window.addEventListener('dni:panel', event => { if (event.detail?.panel === 'sectors') void install(); });
  void install();
}
