import { createSectorsApi, hasPermission } from './sectors-api.js';

const panel = document.querySelector('[data-module="sectors"]');
if (panel) {
  const api = createSectorsApi();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  async function install() {
    try {
      const [session, data] = await Promise.all([api.getSession(), api.getNetworkData()]);
      const canManageSectors = hasPermission(session, 'sectors.manage') || hasPermission(session, 'sectors.create') || hasPermission(session, 'sectors.delete');
      const canManageAssets = hasPermission(session, 'assets.manage') || hasPermission(session, 'assets.create') || hasPermission(session, 'assets.delete');
      if (!session.authenticated || (!canManageSectors && !canManageAssets)) return;
      if (panel.querySelector('.dni-sectors-admin')) return;

      const tools = document.createElement('details');
      tools.className = 'dni-sectors-admin';
      tools.innerHTML = `<summary>STRATEGIC ADMINISTRATION · DATABASE CONTROL</summary><div class="dni-admin-grid">
        ${canManageSectors ? `<form data-admin-form="create-sector"><h4>CREATE SECTOR</h4><input name="id" placeholder="sector-id" required><input name="code" placeholder="code" required><input name="name" placeholder="name" required><input name="primary" placeholder="primary location"><button>CREATE SECTOR</button></form>
        <form data-admin-form="delete-sector"><h4>REMOVE SECTOR</h4><select name="sectorId">${data.sectors.map(item => `<option value="${esc(item.id)}">${esc(item.code)} · ${esc(item.name)}</option>`).join('')}</select><button>REMOVE EMPTY SECTOR</button></form>` : ''}
        ${canManageAssets ? `<form data-admin-form="create-asset"><h4>CREATE ASSET</h4><input name="id" placeholder="asset-id" required><input name="name" placeholder="asset name" required><select name="sectorId">${data.sectors.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select><select name="type"><option value="fleet">Fleet</option><option value="base">Base</option><option value="station">Station</option><option value="installation">Installation</option></select><input name="location" placeholder="location"><button>CREATE ASSET</button></form>
        <form data-admin-form="delete-asset"><h4>REMOVE ASSET</h4><select name="assetId">${data.assets.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select><button>REMOVE EMPTY ASSET</button></form>` : ''}
      </div>`;
      panel.insertBefore(tools, panel.firstChild);

      tools.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.target;
        const values = Object.fromEntries(new FormData(form).entries());
        const button = form.querySelector('button');
        button.disabled = true;
        try {
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
