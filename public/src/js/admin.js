const shell = document.querySelector('.terminal-shell');
const nav = document.querySelector('.nav-tabs');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const attr = value => esc(value ?? '');
const fmtUptime = seconds => {
  const value = Math.max(0, Number(seconds || 0));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

let surface = null;
let controlBundle = null;
let databaseData = null;
let databaseError = null;
let databaseCsrf = '';
let activeWorkspace = 'users';
let selectedUserId = null;
let selectedSectorId = null;
let selectedAssetId = null;
let commandLog = [];
const USER_PAGE_SIZE = 50;
let userFilters = { rankId: '', corpId: '', personnelStatus: '', query: '', page: 1 };
let adminLoadPromise = null;
let adminLoadController = null;
let adminExtensionsPromise = null;

function loadAdminExtensions() {
  if (!adminExtensionsPromise) {
    adminExtensionsPromise = Promise.all([
      import('./clearance-admin.js'),
      import('./operational-admin.js')
    ]).catch(error => {
      adminExtensionsPromise = null;
      console.error('DNI Admin extensions failed', error);
      throw error;
    });
  }
  return adminExtensionsPromise;
}

function addLog(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  commandLog.unshift({ timestamp, message: String(message), level });
  commandLog = commandLog.slice(0, 20);
}

function ensureAdminSurface() {
  if (!shell || !nav) return null;
  let tab = nav.querySelector('.nav-tab[data-panel="admin"]');
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'nav-tab';
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
    tab.dataset.panel = 'admin';
    tab.textContent = 'DNI Admin';
    nav.append(tab);
  }

  let panel = shell.querySelector('[data-module="admin"]');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'module-panel dni-module-panel dni-admin-panel';
    panel.dataset.module = 'admin';
    panel.setAttribute('aria-labelledby', 'admin-title');
    shell.append(panel);
  }

  if (!document.querySelector('#dni-admin-runtime-style')) {
    const style = document.createElement('style');
    style.id = 'dni-admin-runtime-style';
    style.textContent = `
      .terminal-shell[data-panel="admin"] [data-module="admin"]{display:block}
      .dni-admin-panel{--admin-line:#303030;--admin-panel:#080808;--admin-panel-2:#0d0d0d;--admin-muted:#858585;--admin-text:#efefef;--admin-ok:#6cff9d;--admin-warn:#ffc85a;--admin-bad:#ff6868}
      .dni-admin-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}
      .dni-admin-card,.dni-admin-block{border:1px solid var(--admin-line);background:var(--admin-panel);padding:14px;min-width:0}
      .dni-admin-card span,.dni-admin-label,.dni-admin-section-title,.dni-admin-form label,.dni-admin-list small,.dni-admin-log time{color:#777;font:700 8px/1.2 "Courier New",monospace;letter-spacing:1.2px;text-transform:uppercase}
      .dni-admin-card strong{display:block;margin-top:8px;font:700 16px/1.15 Arial,sans-serif;color:var(--admin-text);overflow-wrap:anywhere}
      .dni-admin-card small{display:block;margin-top:7px;color:#8f8f8f;font:9px/1.45 "Courier New",monospace}
      .dni-admin-card.is-online{border-bottom-color:var(--admin-ok)}.dni-admin-card.is-warning{border-bottom-color:var(--admin-warn)}.dni-admin-card.is-error{border-bottom-color:var(--admin-bad)}
      .dni-admin-worktabs{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0 0}
      .dni-admin-worktab{border:1px solid #3d3d3d;background:#0b0b0b;color:#aaa;padding:9px 12px;font:700 9px/1 "Courier New",monospace;letter-spacing:.9px;text-transform:uppercase;cursor:pointer}
      .dni-admin-worktab.is-active{border-color:#7b7b7b;background:#171717;color:#fff}
      .dni-admin-workspace{margin-top:10px}
      .dni-admin-manager{display:grid;grid-template-columns:minmax(220px,.65fr) minmax(0,1.35fr);gap:10px}
      .dni-admin-list{border:1px solid var(--admin-line);background:#060606;min-width:0;max-height:650px;overflow:auto}
      .dni-admin-list-head{padding:12px;border-bottom:1px solid #222;position:sticky;top:0;background:#090909;z-index:1}
      .dni-admin-list-head strong{display:block;color:#eee;font:700 11px/1.2 Arial,sans-serif}.dni-admin-list-head small{display:block;margin-top:4px}
      .dni-admin-list button{display:block;width:100%;border:0;border-bottom:1px solid #191919;background:#070707;color:#d5d5d5;padding:10px 12px;text-align:left;cursor:pointer}
      .dni-admin-list button:hover,.dni-admin-list button.is-selected{background:#141414}.dni-admin-list button.is-selected{box-shadow:inset 2px 0 0 #aaa}
      .dni-admin-list button strong{display:block;font:700 10px/1.3 "Courier New",monospace}.dni-admin-list button span{display:block;margin-top:4px;color:#777;font:8px/1.3 "Courier New",monospace}
      .dni-admin-filterbar{display:grid;grid-template-columns:1.2fr repeat(3,minmax(110px,.7fr)) auto;gap:8px;margin-bottom:10px;padding:10px;border:1px solid var(--admin-line);background:#070707}.dni-admin-filterbar input,.dni-admin-filterbar select{width:100%;box-sizing:border-box;border:1px solid #383838;background:#0d0d0d;color:#eee;padding:9px;font:10px/1.3 "Courier New",monospace}.dni-admin-pager{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;border-top:1px solid #222;color:#888;font:9px/1.3 "Courier New",monospace}.dni-admin-pager .dni-admin-action{padding:8px 10px}
      .dni-admin-editor{border:1px solid var(--admin-line);background:#080808;padding:14px;min-width:0}
      .dni-admin-editor h3{margin:0 0 4px;color:#eee;font:700 17px/1.15 Arial,sans-serif}.dni-admin-editor>p{margin:0 0 14px;color:#888;font:9px/1.5 "Courier New",monospace}
      .dni-admin-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dni-admin-form .wide{grid-column:1/-1}
      .dni-admin-form label{display:flex;flex-direction:column;gap:5px}.dni-admin-form input,.dni-admin-form select,.dni-admin-form textarea{width:100%;box-sizing:border-box;border:1px solid #383838;background:#0d0d0d;color:#eee;padding:9px;font:10px/1.3 "Courier New",monospace}.dni-admin-form textarea{min-height:72px;resize:vertical}
      .dni-admin-check{flex-direction:row!important;align-items:center;gap:8px!important}.dni-admin-check input{width:auto!important}
      .dni-admin-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .dni-admin-action,.dni-admin-link{border:1px solid #454545;background:#101010;color:#eee;padding:10px 12px;text-decoration:none;font:700 9px/1 "Courier New",monospace;letter-spacing:.8px;text-transform:uppercase;cursor:pointer}.dni-admin-action:hover,.dni-admin-link:hover{border-color:#777;background:#161616}.dni-admin-action.is-danger{border-color:#6a2f2f;color:#ff9a9a}.dni-admin-action:disabled{opacity:.45;cursor:not-allowed}
      .dni-admin-split{display:grid;grid-template-columns:1fr 1fr;gap:10px}.dni-admin-section-title{display:flex;justify-content:space-between;gap:8px;margin-bottom:10px;color:#aaa}
      .dni-admin-notice{border:1px solid #5c4720;background:#171208;color:#cbb37c;padding:10px 12px;margin:10px 0;font:9px/1.55 "Courier New",monospace}.dni-admin-notice.is-error{border-color:#6c2929;background:#190b0b;color:#e8a5a5}.dni-admin-notice strong{color:inherit}
      .dni-admin-route-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.dni-admin-route-grid .dni-admin-link{text-align:center}
      .dni-admin-log{border:1px solid var(--admin-line);background:#050505;max-height:260px;overflow:auto}.dni-admin-log-row{display:grid;grid-template-columns:72px 62px minmax(0,1fr);gap:8px;padding:8px 10px;border-bottom:1px solid #181818;font:9px/1.45 "Courier New",monospace;color:#bdbdbd}.dni-admin-log-row:last-child{border-bottom:0}.dni-admin-log-row b{color:#777;font-size:8px}.dni-admin-log-row.is-ok b{color:var(--admin-ok)}.dni-admin-log-row.is-warning b{color:var(--admin-warn)}.dni-admin-log-row.is-error b{color:var(--admin-bad)}
      .dni-state-badge{display:inline-flex;align-items:center;border:1px solid #575757;padding:7px 9px;color:#ddd;background:#101010;font:700 8px/1 "Courier New",monospace;letter-spacing:1px;white-space:nowrap}.dni-state-badge.is-online{border-color:#285f3c;color:var(--admin-ok)}.dni-state-badge.is-warning{border-color:#66501f;color:var(--admin-warn)}.dni-state-badge.is-error{border-color:#6c2929;color:var(--admin-bad)}
      @media(max-width:980px){.dni-admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dni-admin-manager,.dni-admin-split{grid-template-columns:1fr}.dni-admin-route-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dni-admin-list{max-height:300px}}
      @media(max-width:780px){.dni-admin-filterbar{grid-template-columns:1fr 1fr}.dni-admin-filterbar .dni-admin-action{grid-column:1/-1}}
      @media(max-width:620px){.dni-admin-grid,.dni-admin-form,.dni-admin-route-grid,.dni-admin-filterbar{grid-template-columns:1fr}.dni-admin-form .wide,.dni-admin-filterbar .dni-admin-action{grid-column:auto}.dni-admin-log-row{grid-template-columns:62px 54px minmax(0,1fr)}}
    `;
    document.head.append(style);
  }

  const activate = () => {
    shell.dataset.panel = 'admin';
    for (const item of document.querySelectorAll('.nav-tab')) {
      const active = item.dataset.panel === 'admin';
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    }
    window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel: 'admin' } }));
  };

  if (!tab.dataset.adminBound) {
    tab.dataset.adminBound = '1';
    tab.addEventListener('click', activate);
  }
  return { tab, panel, activate };
}

function statusBadge(text, state = '') {
  return `<strong class="dni-state-badge ${state}">${esc(text)}</strong>`;
}

async function getJson(url, { signal, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromParent();
  else signal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = window.setTimeout(() => controller.abort(new DOMException('DNI request timed out.', 'TimeoutError')), timeoutMs);
  try {
    const response = await fetch(url, {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromParent);
  }
}

async function probeControlPlane(signal) {
  const settled = await Promise.allSettled([
    getJson('/embedded-status.php', { signal }),
    getJson('/api/dni/health', { signal }),
    getJson('/api/dni/runtime', { signal }),
    getJson('/sync-runtime-secrets.php?mode=snapshot', { signal, timeoutMs: 6000 })
  ]);
  const value = (index, fallback = {}) => settled[index].status === 'fulfilled' ? settled[index].value : fallback;
  const adminResult = value(0, { response: { ok: false, status: 503 }, payload: {} });
  const healthResult = value(1, { response: { ok: false }, payload: {} });
  const runtimeResult = value(2, { response: { ok: false }, payload: {} });
  const commsResult = value(3, { response: { ok: false, status: 503 }, payload: { error: 'Star Comms telemetry unavailable.' } });
  return {
    adminResponse: adminResult.response,
    admin: adminResult.payload,
    health: healthResult.response.ok ? healthResult.payload : {},
    runtime: runtimeResult.response.ok ? runtimeResult.payload : {},
    comms: commsResult.response.ok ? commsResult.payload : { ok: false, error: commsResult.payload?.error || `HTTP ${commsResult.response.status}` }
  };
}

async function loadDatabaseData(signal) {
  const result = await getJson('/admin-data.php?action=bootstrap', { signal, timeoutMs: 15000 });
  if (!result.response.ok) {
    databaseData = null;
    databaseCsrf = '';
    databaseError = { status: result.response.status, ...result.payload };
    return;
  }
  databaseData = result.payload && typeof result.payload === 'object' ? result.payload : {};
  databaseCsrf = String(databaseData.csrfToken || '');
  databaseError = null;
  if (selectedUserId == null && databaseData.users?.length) selectedUserId = Number(databaseData.users[0].id);
  if (selectedSectorId == null && databaseData.sectors?.length) selectedSectorId = String(databaseData.sectors[0].id);
  if (selectedAssetId == null && databaseData.assets?.length) selectedAssetId = String(databaseData.assets[0].id);
}

async function postDatabase(action, payload) {
  const response = await fetch(`/admin-data.php?action=${encodeURIComponent(action)}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-DNI-CSRF': databaseCsrf },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
  databaseData = data;
  databaseCsrf = String(data.csrfToken || databaseCsrf);
  databaseError = null;
  return data;
}

function card(label, value, detail, state) {
  return `<article class="dni-admin-card ${state || ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`;
}

function option(value, label, selectedValue) {
  const selected = String(value ?? '') === String(selectedValue ?? '') ? ' selected' : '';
  return `<option value="${attr(value ?? '')}"${selected}>${esc(label)}</option>`;
}

function nullableOptions(items, value, labeler) {
  return option('', 'None', value) + (items || []).map(item => option(item.id, labeler(item), value)).join('');
}

function sectorWorkspaceData() {
  const sectors = Array.isArray(databaseData?.sectors) ? databaseData.sectors : null;
  const assets = Array.isArray(databaseData?.assets) ? databaseData.assets : null;
  return { sectors, assets, ready: sectors !== null && assets !== null };
}

function userName(user) {
  return user.display_name || user.guild_nick || user.global_name || user.username || 'DNI MEMBER';
}

function filteredUserPage() {
  const rankOrder = new Map((databaseData?.ranks || []).map(rank => [Number(rank.id), Number(rank.sort_order || 0)]));
  const query = userFilters.query.trim().toLocaleLowerCase();
  const users = (databaseData?.users || []).filter(user => {
    if (userFilters.rankId && String(user.rank_id ?? '') !== userFilters.rankId) return false;
    if (userFilters.corpId && String(user.corp_id ?? '') !== userFilters.corpId) return false;
    if (userFilters.personnelStatus && String(user.personnel_status || '') !== userFilters.personnelStatus) return false;
    return !query || userName(user).toLocaleLowerCase().includes(query)
      || String(user.service_number || '').toLocaleLowerCase().includes(query)
      || String(user.discord_user_id || '').includes(query);
  }).sort((a, b) => {
    const rankDifference = (rankOrder.get(Number(b.rank_id)) || -1) - (rankOrder.get(Number(a.rank_id)) || -1);
    if (rankDifference) return rankDifference;
    const nameDifference = userName(a).localeCompare(userName(b), undefined, { sensitivity: 'base' });
    return nameDifference || Number(a.id) - Number(b.id);
  });
  const pageCount = Math.max(1, Math.ceil(users.length / USER_PAGE_SIZE));
  userFilters.page = Math.min(Math.max(1, userFilters.page), pageCount);
  const start = (userFilters.page - 1) * USER_PAGE_SIZE;
  return { users: users.slice(start, start + USER_PAGE_SIZE), total: users.length, pageCount };
}

function userFilterMarkup() {
  const ranks = databaseData?.ranks || [];
  const corps = (databaseData?.corps || []).filter(item => Number(item.active) === 1);
  return `<form class="dni-admin-filterbar" data-admin-user-filters>
    <input name="query" value="${attr(userFilters.query)}" maxlength="128" placeholder="Search name, service number, or Discord ID">
    <select name="rankId">${option('', 'All paygrades', userFilters.rankId)}${ranks.map(rank => option(rank.id, rank.name, userFilters.rankId)).join('')}</select>
    <select name="corpId">${option('', 'All corps', userFilters.corpId)}${corps.map(corp => option(corp.id, corp.name, userFilters.corpId)).join('')}</select>
    <select name="personnelStatus">${option('', 'All statuses', userFilters.personnelStatus)}${['active','reserve','leave','inactive'].map(value => option(value, value.toUpperCase(), userFilters.personnelStatus)).join('')}</select>
    <button class="dni-admin-action" type="submit">APPLY FILTERS</button>
  </form>`;
}

function userListMarkup(users) {
  if (!users.length) return '<div class="dni-admin-notice">No DNI user records exist yet. Users are created by Discord sign-in.</div>';
  return users.map(user => {
    const name = userName(user);
    const detail = `${user.account_status || 'active'} · ${user.personnel_status || 'no personnel'} · Discord ${user.discord_user_id}`;
    return `<button type="button" data-admin-select-user="${Number(user.id)}" class="${Number(user.id) === Number(selectedUserId) ? 'is-selected' : ''}"><strong>${esc(name)}</strong><span>${esc(detail)}</span></button>`;
  }).join('');
}

function renderUserEditor() {
  if (!databaseData) return renderDatabaseUnavailable('User Database');
  const user = (databaseData?.users || []).find(item => Number(item.id) === Number(selectedUserId));
  if (!user) return '<section class="dni-admin-editor"><h3>User Database</h3><p>Select a DNI user record.</p></section>';
  const ranks = databaseData?.ranks || [];
  const corps = (databaseData?.corps || []).filter(item => Number(item.active) === 1);
  const sectors = (databaseData?.sectors || []).filter(item => Number(item.active) === 1);
  const assets = (databaseData?.assets || []).filter(item => Number(item.active) === 1);
  const fleets = assets.filter(item => item.type === 'fleet');
  const stations = assets.filter(item => item.type !== 'fleet');
  const title = user.display_name || user.guild_nick || user.global_name || user.username;
  return `<section class="dni-admin-editor">
    <h3>${esc(title)}</h3><p>DNI user #${Number(user.id)} · Discord ${esc(user.discord_user_id)}</p>
    <form class="dni-admin-form" data-admin-form="save-user">
      <input type="hidden" name="userId" value="${Number(user.id)}">
      <label>Display Name<input name="displayName" maxlength="128" value="${attr(user.display_name || title)}" required></label>
      <label>Service Number<input name="serviceNumber" maxlength="32" value="${attr(user.service_number || '')}"></label>
      <label>Account Status<select name="accountStatus">${option('active','Active',user.account_status)}${option('disabled','Disabled',user.account_status)}</select></label>
      <label>Personnel Status<select name="personnelStatus">${['active','reserve','leave','inactive'].map(value => option(value, value.toUpperCase(), user.personnel_status || 'active')).join('')}</select></label>
      <label>Rank<select name="rankId">${nullableOptions(ranks,user.rank_id,item => item.name)}</select></label>
      <label>Corps<select name="corpId">${nullableOptions(corps,user.corp_id,item => item.name)}</select></label>
      <label>Sector<select name="sectorId">${nullableOptions(sectors,user.current_sector_id,item => `${item.code} · ${item.name}`)}</select></label>
      <label>Fleet<select name="fleetId">${nullableOptions(fleets,user.assigned_fleet_id,item => item.name)}</select></label>
      <label>Duty Station<select name="dutyStationId">${nullableOptions(stations,user.duty_station_id,item => item.name)}</select></label>
      <label class="wide">Other Status<textarea name="otherStatus" maxlength="255">${esc(user.other_status || '')}</textarea></label>
      <label class="dni-admin-check wide"><input type="checkbox" name="directAdmin" ${Number(user.direct_admin) === 1 ? 'checked' : ''}> Direct DNI Admin permission</label>
      <div class="dni-admin-actions wide"><button class="dni-admin-action" type="submit">SAVE USER / PERSONNEL</button></div>
    </form>
  </section>`;
}

function renderUsersWorkspace() {
  if (!databaseData) return renderDatabaseUnavailable('Users & Personnel');
  const page = filteredUserPage();
  const first = page.total ? (userFilters.page - 1) * USER_PAGE_SIZE + 1 : 0;
  const last = Math.min(userFilters.page * USER_PAGE_SIZE, page.total);
  return `${userFilterMarkup()}<div class="dni-admin-manager">
    <section class="dni-admin-list"><div class="dni-admin-list-head"><strong>USER DATABASE</strong><small>${page.total} MATCHING · ${(databaseData?.users || []).length} TOTAL</small></div>${userListMarkup(page.users)}<div class="dni-admin-pager"><button class="dni-admin-action" type="button" data-admin-user-page="prev" ${userFilters.page <= 1 ? 'disabled' : ''}>PREVIOUS</button><span>${first}–${last} · PAGE ${userFilters.page}/${page.pageCount}</span><button class="dni-admin-action" type="button" data-admin-user-page="next" ${userFilters.page >= page.pageCount ? 'disabled' : ''}>NEXT</button></div></section>
    ${renderUserEditor()}
  </div>`;
}

function sectorListMarkup() {
  const sectors = Array.isArray(databaseData?.sectors) ? databaseData.sectors : [];
  return sectors.map(sector => `<button type="button" data-admin-select-sector="${attr(sector.id)}" class="${String(sector.id) === String(selectedSectorId) ? 'is-selected' : ''}"><strong>${esc(sector.code)} · ${esc(sector.name)}</strong><span>${esc(sector.status)} · ${Number(sector.control_percent)}% · ${Number(sector.active) ? 'ACTIVE' : 'DISABLED'}</span></button>`).join('');
}

function assetListMarkup() {
  const assets = Array.isArray(databaseData?.assets) ? databaseData.assets : [];
  return assets.map(asset => `<button type="button" data-admin-select-asset="${attr(asset.id)}" class="${String(asset.id) === String(selectedAssetId) ? 'is-selected' : ''}"><strong>${esc(asset.name)}</strong><span>${esc(asset.type)} · ${esc(asset.sector_id)} · ${Number(asset.active) ? 'ACTIVE' : 'DISABLED'}</span></button>`).join('');
}

function renderSectorForm() {
  const sectors = Array.isArray(databaseData?.sectors) ? databaseData.sectors : [];
  const sector = sectors.find(item => String(item.id) === String(selectedSectorId));
  const creating = !sector;
  return `<section class="dni-admin-editor"><h3>${creating ? 'Create Sector' : `${esc(sector.code)} · ${esc(sector.name)}`}</h3><p>Edits here change the database read by the `/sectors` module.</p>
    <form class="dni-admin-form" data-admin-form="${creating ? 'create-sector' : 'save-sector'}">
      <label>Sector ID<input name="id" value="${attr(sector?.id || '')}" ${creating ? '' : 'readonly'} pattern="[a-z0-9-]{2,64}" required></label>
      <label>Code<input name="code" maxlength="16" value="${attr(sector?.code || '')}" required></label>
      <label>Name<input name="name" maxlength="100" value="${attr(sector?.name || '')}" required></label>
      <label>Status<input name="status" maxlength="32" value="${attr(sector?.status || 'SECURE')}" required></label>
      <label>Control %<input name="control" type="number" min="0" max="100" step="0.01" value="${attr(sector?.control_percent ?? 100)}"></label>
      <label>Primary Location<input name="primary" maxlength="160" value="${attr(sector?.primary_location || '')}"></label>
      <label class="dni-admin-check wide"><input type="checkbox" name="active" ${creating || Number(sector?.active) === 1 ? 'checked' : ''}> Active sector</label>
      <div class="dni-admin-actions wide"><button class="dni-admin-action" type="submit">${creating ? 'CREATE SECTOR' : 'SAVE SECTOR'}</button>${creating ? '' : '<button class="dni-admin-action is-danger" type="button" data-admin-delete-sector>DISABLE SECTOR</button>'}<button class="dni-admin-action" type="button" data-admin-new-sector>NEW SECTOR</button></div>
    </form></section>`;
}

function renderAssetForm() {
  const assets = Array.isArray(databaseData?.assets) ? databaseData.assets : [];
  const sectors = Array.isArray(databaseData?.sectors) ? databaseData.sectors.filter(item => Number(item.active) === 1) : [];
  const asset = assets.find(item => String(item.id) === String(selectedAssetId));
  const creating = !asset;
  const homeBases = assets.filter(item => Number(item.active) === 1 && item.id !== asset?.id);
  return `<section class="dni-admin-editor"><h3>${creating ? 'Create Asset' : esc(asset.name)}</h3><p>Fleets, bases, stations, and installations displayed in `/sectors`.</p>
    <form class="dni-admin-form" data-admin-form="${creating ? 'create-asset' : 'save-asset'}">
      <label>Asset ID<input name="id" value="${attr(asset?.id || '')}" ${creating ? '' : 'readonly'} pattern="[a-z0-9-]{2,64}" required></label>
      <label>Name<input name="name" maxlength="160" value="${attr(asset?.name || '')}" required></label>
      <label>Sector<select name="sectorId">${sectors.map(item => option(item.id, `${item.code} · ${item.name}`, asset?.sector_id)).join('')}</select></label>
      <label>Type<select name="type">${['fleet','base','station','installation'].map(value => option(value,value.toUpperCase(),asset?.type || 'fleet')).join('')}</select></label>
      <label>Status<input name="status" maxlength="32" value="${attr(asset?.status || 'OPERATIONAL')}"></label>
      <label>Location<input name="location" maxlength="180" value="${attr(asset?.location || '')}"></label>
      <label>Commander<input name="commander" maxlength="128" value="${attr(asset?.commander_name || '')}"></label>
      <label>Vessel Count<input name="vessels" type="number" min="0" max="65535" value="${Number(asset?.vessel_count || 0)}"></label>
      <label>Home Base<select name="homeBaseId">${nullableOptions(homeBases,asset?.home_base_id,item => item.name)}</select></label>
      <label class="dni-admin-check"><input type="checkbox" name="active" ${creating || Number(asset?.active) === 1 ? 'checked' : ''}> Active asset</label>
      <div class="dni-admin-actions wide"><button class="dni-admin-action" type="submit">${creating ? 'CREATE ASSET' : 'SAVE ASSET'}</button>${creating ? '' : '<button class="dni-admin-action is-danger" type="button" data-admin-delete-asset>DISABLE ASSET</button>'}<button class="dni-admin-action" type="button" data-admin-new-asset>NEW ASSET</button></div>
    </form></section>`;
}

function renderSectorsWorkspace() {
  if (!databaseData) return renderDatabaseUnavailable('Sectors & Assets');
  const { sectors, assets, ready } = sectorWorkspaceData();
  if (!ready) {
    return renderDatabaseUnavailable('Sectors & Assets', 'DNI Admin bootstrap data is missing the sectors or assets collection. Refresh Admin and retry.');
  }
  return `<div class="dni-admin-split">
    <div><div class="dni-admin-section-title"><span>SECTOR DATABASE</span><span>${sectors.length} RECORDS</span></div><div class="dni-admin-manager"><section class="dni-admin-list"><div class="dni-admin-list-head"><strong>SECTORS</strong><small>EDIT /SECTORS SOURCE DATA</small></div>${sectorListMarkup()}</section>${renderSectorForm()}</div></div>
    <div><div class="dni-admin-section-title"><span>ASSET DATABASE</span><span>${assets.length} RECORDS</span></div><div class="dni-admin-manager"><section class="dni-admin-list"><div class="dni-admin-list-head"><strong>ASSETS</strong><small>FLEETS / BASES / STATIONS</small></div>${assetListMarkup()}</section>${renderAssetForm()}</div></div>
  </div>`;
}

function renderDatabaseUnavailable(title, fallbackMessage = 'DNI database management is unavailable.') {
  const message = databaseError?.error || fallbackMessage;
  const auth = databaseError?.status === 401 || databaseError?.status === 403;
  return `<section class="dni-admin-block"><div class="dni-admin-section-title"><span>${esc(title)}</span><span>LOCKED</span></div><div class="dni-admin-notice ${auth ? 'is-error' : ''}"><strong>${auth ? 'ADMIN AUTHORIZATION REQUIRED' : 'DATABASE UNAVAILABLE'}</strong> · ${esc(message)}</div>${auth ? '<div class="dni-admin-actions"><a class="dni-admin-link" href="/auth/discord/login?next=/admin">SIGN IN WITH DISCORD</a></div>' : ''}</section>`;
}

function logMarkup() {
  if (!commandLog.length) return '<div class="dni-admin-log-row"><time>--:--:--</time><b>READY</b><span>Command Control initialized.</span></div>';
  return commandLog.map(entry => `<div class="dni-admin-log-row ${entry.level === 'error' ? 'is-error' : entry.level === 'warning' ? 'is-warning' : 'is-ok'}"><time>${esc(entry.timestamp)}</time><b>${esc(entry.level.toUpperCase())}</b><span>${esc(entry.message)}</span></div>`).join('');
}

function renderSystemWorkspace() {
  const data = controlBundle?.admin || {};
  const health = controlBundle?.health || {};
  const runtime = controlBundle?.runtime || {};
  const mode = databaseData?.databaseMode || data.databaseMode || 'embedded-server';
  const mariadb = data.mariadbConfigured === true;
  return `<div class="dni-admin-split"><section class="dni-admin-block"><div class="dni-admin-section-title"><span>SYSTEM TELEMETRY</span><span>LIVE</span></div><div class="dni-admin-grid">
    ${card('Node', health.hostname || 'OVH-DNI-01', `Version ${health.version || '4.4.0-vps'}`, 'is-online')}
    ${card('Uptime', health.uptimeSeconds == null ? 'UNKNOWN' : fmtUptime(health.uptimeSeconds), runtime.backend || data.runtime || 'ovh-vps-node', 'is-online')}
    ${card('Persistence', mode.toUpperCase(), mariadb ? 'Embedded database online · optional MariaDB connected.' : 'Shell-free embedded server database online.', 'is-online')}
    ${card('Star Comms', controlBundle?.comms?.ok ? 'ONLINE' : 'CHECK', controlBundle?.comms?.ok ? 'Private PHP Owner API bridge responding.' : (controlBundle?.comms?.error || 'Unavailable'), controlBundle?.comms?.ok ? 'is-online' : 'is-warning')}
  </div><div class="dni-admin-actions"><button class="dni-admin-action" type="button" data-admin-refresh>REFRESH SYSTEM</button><button class="dni-admin-action" type="button" data-admin-test-comms>TEST STAR COMMS</button></div></section>
  <section class="dni-admin-block"><div class="dni-admin-section-title"><span>OPERATIONS</span><span>LAUNCH</span></div><div class="dni-admin-route-grid"><a class="dni-admin-link" href="/dashboard">Dashboard</a><a class="dni-admin-link" href="/services">Services</a><a class="dni-admin-link" href="/communication">Communication</a><a class="dni-admin-link" href="/sectors">Sectors</a></div></section></div>
  <section class="dni-admin-block" style="margin-top:10px"><div class="dni-admin-section-title"><span>COMMAND LOG</span><span>LOCAL SESSION</span></div><div class="dni-admin-log">${logMarkup()}</div></section>`;
}

function renderWorkspace() {
  const host = surface?.panel.querySelector('.dni-admin-workspace');
  if (!host) return;
  for (const button of surface.panel.querySelectorAll('[data-admin-workspace]')) button.classList.toggle('is-active', button.dataset.adminWorkspace === activeWorkspace);
  if (activeWorkspace === 'users') host.innerHTML = renderUsersWorkspace();
  if (activeWorkspace === 'sectors') {
    try {
      host.innerHTML = renderSectorsWorkspace();
    } catch (error) {
      console.error('DNI Admin sectors workspace render failed', error);
      host.innerHTML = renderDatabaseUnavailable('Sectors & Assets', 'The Sectors & Assets workspace could not render safely. Refresh Admin data and retry.');
    }
  }
  if (activeWorkspace === 'system') host.innerHTML = renderSystemWorkspace();
}

function renderControlPanel(panel) {
  const data = controlBundle?.admin || {};
  const health = controlBundle?.health || {};
  const runtime = controlBundle?.runtime || {};
  const databaseReady = data.databaseConfigured === true || databaseData?.databaseConfigured === true;
  const discordReady = data.discordConfigured === true;
  const authenticated = data.authenticated === true;
  const adminActive = data.admin === true;
  const overallLabel = adminActive ? 'ADMIN ACTIVE' : (authenticated ? 'ADMIN PERMISSION REQUIRED' : 'AUTH REQUIRED');
  const overallState = adminActive ? 'is-online' : 'is-warning';
  panel.innerHTML = `<header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2><p>User database, personnel assignments, sector records, assets, and runtime controls.</p></div>${statusBadge(overallLabel, overallState)}</header>
    <div class="dni-admin-grid">
      ${card('User Database', databaseReady ? `${databaseData?.users?.length ?? data.counts?.users ?? 0} USERS` : 'UNAVAILABLE', databaseReady ? 'Shell-free embedded DNI users and personnel database.' : 'Embedded database unavailable.', databaseReady ? 'is-online' : 'is-error')}
      ${card('Sectors', databaseReady ? `${databaseData?.sectors?.length ?? data.counts?.sectors ?? 0} RECORDS` : 'UNAVAILABLE', 'Edits feed the /sectors module.', databaseReady ? 'is-online' : 'is-error')}
      ${card('Discord OAuth', discordReady ? 'READY' : 'CHECK', `Client ${data.discordClientId || '1542715169975836682'} · identify + guilds + guilds.members.read`, discordReady ? 'is-online' : 'is-warning')}
      ${card('Runtime', health.hostname || data.runtime || 'OVH-DNI-01', `${runtime.backend || 'node-api'} · ${health.uptimeSeconds == null ? 'uptime unknown' : fmtUptime(health.uptimeSeconds)}`, 'is-online')}
    </div>
    ${databaseError && !databaseReady ? `<div class="dni-admin-notice is-error"><strong>DATABASE UNAVAILABLE</strong> · ${esc(databaseError.error || 'Embedded database could not be opened.')}</div>` : ''}
    <div class="dni-admin-worktabs"><button class="dni-admin-worktab" type="button" data-admin-workspace="users">USERS & PERSONNEL</button><button class="dni-admin-worktab" type="button" data-admin-workspace="sectors">SECTORS & ASSETS</button><button class="dni-admin-worktab" type="button" data-admin-workspace="system">SYSTEM</button></div>
    <div class="dni-admin-workspace"></div>`;
  bindPanelEvents(panel);
  renderWorkspace();
  panel.dispatchEvent(new CustomEvent('dni:admin-mounted', { bubbles: true }));
}

function formPayload(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const checkbox of form.querySelectorAll('input[type="checkbox"][name]')) data[checkbox.name] = checkbox.checked;
  return data;
}

function bindPanelEvents(panel = surface?.panel) {
  if (!(panel instanceof HTMLElement)) return;
  panel.onclick = async event => {
    const workspaceButton = event.target.closest('[data-admin-workspace]');
    if (workspaceButton) {
      activeWorkspace = workspaceButton.dataset.adminWorkspace;
      renderWorkspace();
      return;
    }
    const userButton = event.target.closest('[data-admin-select-user]');
    if (userButton) { selectedUserId = Number(userButton.dataset.adminSelectUser); renderWorkspace(); return; }
    const userPageButton = event.target.closest('[data-admin-user-page]');
    if (userPageButton) {
      userFilters.page += userPageButton.dataset.adminUserPage === 'next' ? 1 : -1;
      renderWorkspace();
      return;
    }
    const sectorButton = event.target.closest('[data-admin-select-sector]');
    if (sectorButton) { selectedSectorId = sectorButton.dataset.adminSelectSector; renderWorkspace(); return; }
    const assetButton = event.target.closest('[data-admin-select-asset]');
    if (assetButton) { selectedAssetId = assetButton.dataset.adminSelectAsset; renderWorkspace(); return; }
    if (event.target.closest('[data-admin-new-sector]')) { selectedSectorId = '__new__'; renderWorkspace(); return; }
    if (event.target.closest('[data-admin-new-asset]')) { selectedAssetId = '__new__'; renderWorkspace(); return; }
    if (event.target.closest('[data-admin-delete-sector]')) {
      if (!selectedSectorId || selectedSectorId === '__new__') return;
      if (!window.confirm(`Disable sector ${selectedSectorId}? Active assets/personnel must be moved first.`)) return;
      try { await postDatabase('delete-sector', { id: selectedSectorId }); addLog(`Sector ${selectedSectorId} disabled.`); selectedSectorId = (databaseData?.sectors || []).find(item => Number(item.active) === 1)?.id || null; renderControlPanel(panel); }
      catch (error) { addLog(error.message, 'error'); window.alert(error.message); }
      return;
    }
    if (event.target.closest('[data-admin-delete-asset]')) {
      if (!selectedAssetId || selectedAssetId === '__new__') return;
      if (!window.confirm(`Disable asset ${selectedAssetId}? Active personnel must be moved first.`)) return;
      try { await postDatabase('delete-asset', { id: selectedAssetId }); addLog(`Asset ${selectedAssetId} disabled.`); selectedAssetId = (databaseData?.assets || []).find(item => Number(item.active) === 1)?.id || null; renderControlPanel(panel); }
      catch (error) { addLog(error.message, 'error'); window.alert(error.message); }
      return;
    }
    if (event.target.closest('[data-admin-refresh]')) { await loadAdmin(surface, true); return; }
    if (event.target.closest('[data-admin-test-comms]')) {
      addLog('Testing private Star Comms bridge…'); renderWorkspace();
      const result = await getJson('/sync-runtime-secrets.php?mode=snapshot');
      addLog(result.response.ok && result.payload?.ok ? 'Star Comms bridge responded successfully.' : (result.payload?.error || `Star Comms HTTP ${result.response.status}`), result.response.ok ? 'info' : 'error');
      renderWorkspace();
    }
  };

  panel.onsubmit = async event => {
    const userFilterForm = event.target.closest('[data-admin-user-filters]');
    if (userFilterForm) {
      event.preventDefault();
      const filters = Object.fromEntries(new FormData(userFilterForm).entries());
      userFilters = {
        rankId: String(filters.rankId || ''), corpId: String(filters.corpId || ''),
        personnelStatus: String(filters.personnelStatus || ''), query: String(filters.query || ''), page: 1
      };
      const page = filteredUserPage();
      if (page.users.length && !page.users.some(user => Number(user.id) === Number(selectedUserId))) selectedUserId = Number(page.users[0].id);
      renderWorkspace();
      return;
    }
    const form = event.target.closest('[data-admin-form]');
    if (!form) return;
    event.preventDefault();
    const action = form.dataset.adminForm;
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const payload = formPayload(form);
      await postDatabase(action, payload);
      addLog(`${action.replaceAll('-', ' ')} completed.`);
      if (action === 'create-sector') selectedSectorId = payload.id;
      if (action === 'create-asset') selectedAssetId = payload.id;
      renderControlPanel(panel);
    } catch (error) {
      addLog(error.message || error, 'error');
      window.alert(error.message || error);
      if (button) button.disabled = false;
    }
  };

  panel.dataset.adminPrimaryHandlersBound = '1';
}

async function loadAdmin(target, force = false) {
  if (adminLoadPromise && !force) return adminLoadPromise;
  if (force) adminLoadController?.abort();

  const controller = new AbortController();
  adminLoadController = controller;
  target.panel.innerHTML = '<div class="dni-loading"><span>DNI ADMIN</span><b>Loading users, sectors, assets, and command runtime…</b></div>';

  const run = (async () => {
    try {
      void loadAdminExtensions().catch(() => {});
      [controlBundle] = await Promise.all([
        probeControlPlane(controller.signal),
        loadDatabaseData(controller.signal)
      ]);
      if (controller.signal.aborted) return;
      addLog(force ? 'Command Control refreshed.' : 'Command Control loaded.');
      renderControlPanel(target.panel);
    } catch (error) {
      if (controller.signal.aborted) return;
      target.panel.innerHTML = `<header class="dni-module-header"><div><span>DNI COMMAND CONTROL</span><h2 id="admin-title">DNI Admin</h2></div>${statusBadge('UNAVAILABLE','is-error')}</header><div class="dni-admin-notice is-error">${esc(error.message || error)}</div>`;
    }
  })();

  adminLoadPromise = run;
  try { await run; }
  finally {
    if (adminLoadController === controller) adminLoadController = null;
    if (adminLoadPromise === run) adminLoadPromise = null;
  }
}

const onAdminPath = String(window.location.pathname || '').replace(/\/+$/, '') === '/admin';
if (onAdminPath) {
  surface = ensureAdminSurface();
  if (surface) { surface.activate(); void loadAdmin(surface); }
}

getJson('/embedded-status.php').then(({ payload }) => {
  if (payload.admin === true || payload.authenticated === true || onAdminPath) surface = surface || ensureAdminSurface();
}).catch(() => {});

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel !== 'admin') return;
  surface = surface || ensureAdminSurface();
  if (surface) void loadAdmin(surface);
});
