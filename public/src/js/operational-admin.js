const API = '/operational-classification.php';

const state = {
  loaded: false,
  loading: false,
  active: false,
  csrfToken: '',
  actorClearance: null,
  clearances: [],
  resources: [],
  selectedKey: '',
  error: ''
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const attr = value => esc(value ?? '');
const keyFor = resource => `${resource.type}:${resource.id}`;

function adminPanel() {
  return document.querySelector('[data-module="admin"]');
}

function workspaceHost() {
  return adminPanel()?.querySelector('[data-operational-classification-host]') || null;
}

function installStyles() {
  if (document.querySelector('#dni-operational-admin-style')) return;
  const style = document.createElement('style');
  style.id = 'dni-operational-admin-style';
  style.textContent = `
    [data-operational-classification-host][hidden]{display:none!important}
    .dni-operational-security-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
    .dni-operational-security-head h3{margin:4px 0;color:#eee;font:700 18px/1.15 Arial,sans-serif}
    .dni-operational-security-head p{margin:5px 0 0;color:#858585;font:9px/1.5 "Courier New",monospace}
    .dni-operational-resource-list{max-height:620px;overflow:auto}
    .dni-operational-resource-type{display:inline-block;margin-top:5px;color:#9b885f!important}
    .dni-operational-current{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}
    .dni-operational-current article{border:1px solid #303030;background:#080808;padding:11px}
    .dni-operational-current span{display:block;color:#777;font:700 8px/1.2 "Courier New",monospace;letter-spacing:1px;text-transform:uppercase}
    .dni-operational-current strong{display:block;margin-top:6px;color:#eee;font:700 11px/1.35 "Courier New",monospace}
    .dni-operational-security-note{border:1px solid #5d4821;background:#161108;color:#c3aa74;padding:10px 12px;margin:10px 0;font:9px/1.55 "Courier New",monospace}
    .dni-operational-security-note strong{color:#ead39b}
    @media(max-width:720px){.dni-operational-current{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI operational classification HTTP ${response.status}`);
  return payload;
}

function applyPayload(payload) {
  state.csrfToken = String(payload.csrfToken || state.csrfToken || '');
  state.actorClearance = payload.actorClearance || state.actorClearance;
  state.clearances = Array.isArray(payload.clearances) ? payload.clearances : [];
  state.resources = Array.isArray(payload.resources) ? payload.resources : [];
  if (!state.resources.some(resource => keyFor(resource) === state.selectedKey)) {
    state.selectedKey = state.resources.length ? keyFor(state.resources[0]) : '';
  }
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  state.error = '';
  render();
  try {
    const payload = await request(`${API}?action=bootstrap`);
    applyPayload(payload);
    state.loaded = true;
  } catch (error) {
    state.error = String(error?.message || error || 'Operational classification unavailable.');
  } finally {
    state.loading = false;
    render();
  }
}

async function classify(body) {
  if (!state.csrfToken) throw new Error('DNI security token unavailable. Refresh the workspace.');
  const payload = await request(`${API}?action=classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DNI-CSRF': state.csrfToken },
    body: JSON.stringify(body)
  });
  applyPayload(payload);
}

function clearanceText(clearance) {
  return clearance?.code ? `${clearance.code} — ${clearance.name || ''}`.trim() : 'UNKNOWN';
}

function selectedResource() {
  return state.resources.find(resource => keyFor(resource) === state.selectedKey) || null;
}

function resourceList() {
  if (!state.resources.length) return '<div class="dni-admin-notice">No operational records are visible within your current clearance.</div>';
  return state.resources.map(resource => {
    const selected = keyFor(resource) === state.selectedKey ? 'is-selected' : '';
    return `<button type="button" data-operational-resource="${attr(keyFor(resource))}" class="${selected}">
      <strong>${esc(resource.name)}</strong>
      <span>${esc(clearanceText(resource.clearance))}</span>
      <span class="dni-operational-resource-type">${esc(String(resource.type).toUpperCase())}${resource.detail ? ` · ${esc(resource.detail)}` : ''}</span>
    </button>`;
  }).join('');
}

function clearanceOptions(resource) {
  const actorLevel = Number(state.actorClearance?.level ?? -1);
  const selected = Number(resource?.clearance?.level ?? 0);
  return state.clearances
    .filter(level => Number(level.level) <= actorLevel)
    .map(level => `<option value="${Number(level.level)}"${Number(level.level) === selected ? ' selected' : ''}>${esc(level.code)} — ${esc(level.name)}</option>`)
    .join('');
}

function editor() {
  const resource = selectedResource();
  if (!resource) return '<section class="dni-admin-editor"><h3>Operational Classification</h3><p>Select a sector, asset, fleet, or personnel record.</p></section>';
  return `<section class="dni-admin-editor">
    <div class="dni-operational-security-head"><div><span class="dni-admin-label">RESOURCE SECURITY</span><h3>${esc(resource.name)}</h3><p>${esc(String(resource.type).toUpperCase())} · ${esc(resource.id)}</p></div><strong class="dni-state-badge is-warning">${esc(resource.clearance?.code || 'UNKNOWN')}</strong></div>
    <div class="dni-operational-current">
      <article><span>Current Classification</span><strong>${esc(clearanceText(resource.clearance))}</strong></article>
      <article><span>Your Effective Clearance</span><strong>${esc(clearanceText(state.actorClearance))}</strong></article>
    </div>
    <form class="dni-admin-form" data-operational-classification-form>
      <input type="hidden" name="type" value="${attr(resource.type)}">
      <input type="hidden" name="id" value="${attr(resource.id)}">
      <label>Resource Clearance<select name="clearanceLevel">${clearanceOptions(resource)}</select></label>
      <label>Record Type<input value="${attr(String(resource.type).toUpperCase())}" readonly></label>
      <label class="wide">Reason<textarea name="reason" maxlength="500" required placeholder="Required security/classification reason"></textarea></label>
      <div class="dni-operational-security-note wide"><strong>NO CLEARANCE BYPASS:</strong> You can only classify resources at or below your own current effective clearance. Declassification history remains protected at the higher of the old/new levels.</div>
      <div class="dni-admin-actions wide"><button class="dni-admin-action" type="submit">APPLY CLASSIFICATION</button></div>
    </form>
  </section>`;
}

function render() {
  const host = workspaceHost();
  if (!host || !state.active) return;
  if (state.loading && !state.loaded) {
    host.innerHTML = '<div class="dni-loading"><span>DNI SECURITY</span><b>Loading operational classifications…</b></div>';
    return;
  }
  if (state.error) {
    host.innerHTML = `<section class="dni-admin-block"><div class="dni-admin-notice is-error"><strong>OPERATIONAL CLASSIFICATION UNAVAILABLE</strong> · ${esc(state.error)}</div><div class="dni-admin-actions"><button class="dni-admin-action" type="button" data-operational-refresh>RETRY</button></div></section>`;
    return;
  }
  host.innerHTML = `<section class="dni-admin-block">
    <div class="dni-operational-security-head"><div><span class="dni-admin-label">DNI OPERATIONAL SECURITY</span><h3>Operational Classification</h3><p>Classify sectors, fleets/assets, and personnel using the same clearance ladder as Documents and Mail.</p></div><strong class="dni-state-badge is-online">${esc(clearanceText(state.actorClearance))}</strong></div>
    <div class="dni-operational-security-note"><strong>SERVER ENFORCED:</strong> Restricted records and aggregate counts are filtered before they reach the browser. Admin capability does not bypass effective clearance.</div>
    <div class="dni-admin-manager"><section class="dni-admin-list dni-operational-resource-list"><div class="dni-admin-list-head"><strong>OPERATIONAL RECORDS</strong><small>${state.resources.length} VISIBLE RESOURCES</small></div>${resourceList()}</section>${editor()}</div>
  </section>`;
}

function deactivate() {
  state.active = false;
  const host = workspaceHost();
  if (host) host.hidden = true;
  const normal = adminPanel()?.querySelector('.dni-admin-workspace');
  if (normal) normal.hidden = false;
  const tab = adminPanel()?.querySelector('[data-operational-classification-tab]');
  if (tab) tab.classList.remove('is-active');
}

function activate() {
  const panel = adminPanel();
  if (!panel) return;
  state.active = true;
  const normal = panel.querySelector('.dni-admin-workspace');
  if (normal) normal.hidden = true;
  const host = workspaceHost();
  if (host) host.hidden = false;
  for (const tab of panel.querySelectorAll('.dni-admin-worktab')) tab.classList.remove('is-active');
  panel.querySelector('[data-operational-classification-tab]')?.classList.add('is-active');
  render();
  if (!state.loaded) void load();
}

function ensureSurface() {
  const panel = adminPanel();
  const tabs = panel?.querySelector('.dni-admin-worktabs');
  const normal = panel?.querySelector('.dni-admin-workspace');
  if (!panel || !tabs || !normal) return;
  installStyles();

  let tab = tabs.querySelector('[data-operational-classification-tab]');
  if (!tab) {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'dni-admin-worktab';
    tab.dataset.operationalClassificationTab = '1';
    tab.textContent = 'OPERATIONAL CL';
    tab.addEventListener('click', activate);
    tabs.append(tab);
  }

  let host = panel.querySelector('[data-operational-classification-host]');
  if (!host) {
    host = document.createElement('div');
    host.className = 'dni-operational-classification-host';
    host.dataset.operationalClassificationHost = '1';
    host.hidden = !state.active;
    normal.insertAdjacentElement('afterend', host);
  }

  if (state.active) {
    normal.hidden = true;
    host.hidden = false;
    tab.classList.add('is-active');
    render();
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-admin-workspace]')) deactivate();
  const resource = event.target.closest('[data-operational-resource]');
  if (resource) {
    state.selectedKey = resource.dataset.operationalResource || '';
    render();
  }
  if (event.target.closest('[data-operational-refresh]')) void load();
});

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-operational-classification-form]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    await classify({
      type: data.type,
      id: data.id,
      clearanceLevel: Number(data.clearanceLevel),
      reason: data.reason
    });
    render();
  } catch (error) {
    window.alert(error.message || error);
    if (button) button.disabled = false;
  }
});

const observer = new MutationObserver(() => ensureSurface());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') queueMicrotask(ensureSurface);
});
ensureSurface();
