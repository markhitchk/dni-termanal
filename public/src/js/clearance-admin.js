const CLEARANCE_ADMIN_URL = '/clearance-admin.php';

const state = {
  loading: false,
  loaded: false,
  active: false,
  csrfToken: '',
  actorClearance: null,
  clearances: [],
  users: [],
  history: [],
  selectedUserId: null,
  error: ''
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const attr = value => esc(value ?? '');

function adminPanel() {
  return document.querySelector('[data-module="admin"]');
}

function workspaceHost() {
  return adminPanel()?.querySelector('[data-clearance-admin-host]') || null;
}

function userName(user) {
  return user?.display_name || user?.guild_nick || user?.global_name || user?.username || 'DNI MEMBER';
}

function clearanceText(clearance) {
  return clearance?.code ? `${clearance.code} — ${clearance.name || ''}`.trim() : 'UNKNOWN';
}

function sourceText(source) {
  return String(source || 'none').replaceAll('_', ' ').toUpperCase();
}

function dateText(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function installStyles() {
  if (document.querySelector('#dni-clearance-admin-style')) return;
  const style = document.createElement('style');
  style.id = 'dni-clearance-admin-style';
  style.textContent = `
    .dni-clearance-admin-host[hidden]{display:none!important}
    .dni-clearance-admin-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
    .dni-clearance-admin-header h3{margin:4px 0;color:#eee;font:700 18px/1.15 Arial,sans-serif}
    .dni-clearance-admin-header p{margin:5px 0 0;color:#858585;font:9px/1.5 "Courier New",monospace}
    .dni-clearance-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}
    .dni-clearance-summary article{border:1px solid #303030;background:#080808;padding:11px;min-width:0}
    .dni-clearance-summary span{display:block;color:#777;font:700 8px/1.2 "Courier New",monospace;letter-spacing:1px;text-transform:uppercase}
    .dni-clearance-summary strong{display:block;margin-top:6px;color:#eee;font:700 11px/1.35 "Courier New",monospace;overflow-wrap:anywhere}
    .dni-clearance-override-active{border-color:#765d24!important;background:#151107!important}
    .dni-clearance-level-note{margin:8px 0 0;padding:9px 10px;border-left:2px solid #8b7136;background:#0d0b07;color:#9e906f;font:9px/1.5 "Courier New",monospace}
    .dni-clearance-history{margin-top:12px;border:1px solid #2d2d2d;background:#060606}
    .dni-clearance-history-head{padding:10px 12px;border-bottom:1px solid #242424;color:#aaa;font:700 8px/1 "Courier New",monospace;letter-spacing:1.2px}
    .dni-clearance-event{display:grid;grid-template-columns:150px minmax(130px,.7fr) minmax(0,1.3fr);gap:10px;padding:10px 12px;border-bottom:1px solid #1c1c1c;color:#aaa;font:9px/1.5 "Courier New",monospace}
    .dni-clearance-event:last-child{border-bottom:0}.dni-clearance-event b{color:#e1e1e1}.dni-clearance-event small{display:block;color:#666;margin-top:3px}
    .dni-clearance-empty{padding:16px;color:#6f6f6f;font:9px/1.5 "Courier New",monospace}
    .dni-clearance-security{border:1px solid #5d4821;background:#161108;color:#c3aa74;padding:10px 12px;margin-bottom:10px;font:9px/1.55 "Courier New",monospace}
    .dni-clearance-security strong{color:#ead39b}
    @media(max-width:800px){.dni-clearance-summary{grid-template-columns:1fr}.dni-clearance-event{grid-template-columns:1fr;gap:4px}}
  `;
  document.head.append(style);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `DNI clearance administration HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadClearanceAdmin(userId = state.selectedUserId) {
  if (state.loading) return;
  state.loading = true;
  state.error = '';
  render();
  try {
    const query = userId ? `&userId=${encodeURIComponent(userId)}` : '';
    const payload = await request(`${CLEARANCE_ADMIN_URL}?action=bootstrap${query}`);
    state.csrfToken = String(payload.csrfToken || '');
    state.actorClearance = payload.actorClearance || null;
    state.clearances = Array.isArray(payload.clearances) ? payload.clearances : [];
    state.users = Array.isArray(payload.users) ? payload.users : [];
    state.history = Array.isArray(payload.history) ? payload.history : [];
    if (!state.selectedUserId || !state.users.some(user => Number(user.id) === Number(state.selectedUserId))) {
      state.selectedUserId = state.users.length ? Number(state.users[0].id) : null;
    }
    if (userId && state.users.some(user => Number(user.id) === Number(userId))) state.selectedUserId = Number(userId);
    state.loaded = true;
  } catch (error) {
    state.error = String(error?.message || error || 'DNI clearance administration unavailable.');
  } finally {
    state.loading = false;
    render();
  }
}

async function postClearance(action, body) {
  if (!state.csrfToken) throw new Error('DNI security token unavailable. Refresh Clearance Administration.');
  const payload = await request(`${CLEARANCE_ADMIN_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DNI-CSRF': state.csrfToken },
    body: JSON.stringify(body)
  });
  state.csrfToken = String(payload.csrfToken || state.csrfToken);
  state.actorClearance = payload.actorClearance || state.actorClearance;
  state.clearances = Array.isArray(payload.clearances) ? payload.clearances : state.clearances;
  state.users = Array.isArray(payload.users) ? payload.users : state.users;
  state.history = Array.isArray(payload.history) ? payload.history : [];
  return payload;
}

function clearanceUserList() {
  if (!state.users.length) return '<div class="dni-admin-notice">No personnel are available within your current clearance boundary.</div>';
  return state.users.map(user => {
    const selected = Number(user.id) === Number(state.selectedUserId) ? 'is-selected' : '';
    const override = user.override_level == null ? 'AUTO' : 'MANUAL';
    return `<button type="button" data-clearance-user="${Number(user.id)}" class="${selected}">
      <strong>${esc(userName(user))}</strong>
      <span>${esc(clearanceText(user.effective_clearance))} · ${override}</span>
    </button>`;
  }).join('');
}

function clearanceOptions(user) {
  const actorLevel = Number(state.actorClearance?.level ?? -1);
  const selected = user.override_level == null ? Number(user.effective_clearance?.level ?? 0) : Number(user.override_level);
  return state.clearances
    .filter(level => Number(level.level) <= actorLevel)
    .map(level => `<option value="${Number(level.level)}"${Number(level.level) === selected ? ' selected' : ''}>${esc(level.code)} — ${esc(level.name)}</option>`)
    .join('');
}

function historyMarkup() {
  if (!state.history.length) return '<div class="dni-clearance-empty">No recorded clearance changes for this member.</div>';
  return state.history.map(event => {
    const oldLevel = event.old_clearance ? clearanceText(event.old_clearance) : 'NONE';
    const newLevel = event.new_clearance ? clearanceText(event.new_clearance) : 'NONE';
    return `<div class="dni-clearance-event">
      <div><b>${esc(dateText(event.created_at))}</b><small>${esc(sourceText(event.assignment_type))}</small></div>
      <div><b>${esc(oldLevel)}</b><small>→ ${esc(newLevel)}</small></div>
      <div><b>${esc(event.actor_name || 'SYSTEM')}</b><small>${esc(event.reason || 'No reason recorded.')}</small></div>
    </div>`;
  }).join('');
}

function selectedUserMarkup() {
  const user = state.users.find(item => Number(item.id) === Number(state.selectedUserId));
  if (!user) return '<section class="dni-admin-editor"><h3>Personnel Clearance</h3><p>Select a DNI member.</p></section>';
  const effective = clearanceText(user.effective_clearance);
  const automatic = clearanceText(user.automatic_clearance);
  const manual = user.override_level != null;
  const canManage = user.can_manage === true;
  const actorLevel = Number(state.actorClearance?.level ?? -1);
  const targetLevel = Number(user.effective_clearance?.level ?? 0);
  const blocked = !canManage || targetLevel > actorLevel;
  const source = manual ? 'MANUAL OVERRIDE' : sourceText(user.automatic_clearance?.source);

  return `<section class="dni-admin-editor">
    <div class="dni-clearance-admin-header"><div><span class="dni-admin-label">MEMBER SECURITY</span><h3>${esc(userName(user))}</h3><p>DNI user #${Number(user.id)} · ${esc(user.rank_name || 'Discord / role synchronized')}</p></div>${manual ? '<strong class="dni-state-badge is-warning">MANUAL OVERRIDE</strong>' : '<strong class="dni-state-badge is-online">AUTOMATIC</strong>'}</div>
    <div class="dni-clearance-summary">
      <article><span>Automatic Clearance</span><strong>${esc(automatic)}</strong></article>
      <article class="${manual ? 'dni-clearance-override-active' : ''}"><span>Effective Clearance</span><strong>${esc(effective)}</strong></article>
      <article><span>Assignment Source</span><strong>${esc(source)}</strong></article>
    </div>
    ${manual ? `<div class="dni-clearance-level-note">Persistent override set ${esc(dateText(user.override_set_at))}. Reason: ${esc(user.override_reason || 'No reason available.')}</div>` : '<div class="dni-clearance-level-note">This member currently follows automatic rank / Discord role clearance. Role synchronization may update the automatic value.</div>'}
    ${blocked ? '<div class="dni-admin-notice is-error"><strong>CHANGE BLOCKED</strong> · You cannot change your own clearance or administer somebody above your current effective clearance.</div>' : ''}
    <form class="dni-admin-form" data-clearance-form="set-override">
      <input type="hidden" name="userId" value="${Number(user.id)}">
      <label>Persistent Clearance<select name="clearanceLevel" ${blocked ? 'disabled' : ''}>${clearanceOptions(user)}</select></label>
      <label>Current Effective<input value="${attr(effective)}" readonly></label>
      <label class="wide">Reason<textarea name="reason" maxlength="500" required placeholder="Operational or administrative reason for this clearance change"></textarea></label>
      <div class="dni-clearance-security wide"><strong>SECURITY RULE:</strong> Manual clearance survives Discord role synchronization until explicitly returned to automatic. You cannot assign or restore a clearance above your own current CL.</div>
      <div class="dni-admin-actions wide">
        <button class="dni-admin-action" type="submit" ${blocked ? 'disabled' : ''}>APPLY MANUAL CLEARANCE</button>
        ${manual ? `<button class="dni-admin-action" type="button" data-clearance-remove ${blocked ? 'disabled' : ''}>RETURN TO AUTOMATIC</button>` : ''}
      </div>
    </form>
    <div class="dni-clearance-history"><div class="dni-clearance-history-head">CLEARANCE HISTORY · APPEND-ONLY AUDIT</div>${historyMarkup()}</div>
  </section>`;
}

function render() {
  const host = workspaceHost();
  if (!host || !state.active) return;
  if (state.loading && !state.loaded) {
    host.innerHTML = '<div class="dni-loading"><span>DNI SECURITY</span><b>Loading personnel clearance controls…</b></div>';
    return;
  }
  if (state.error) {
    host.innerHTML = `<section class="dni-admin-block"><div class="dni-admin-notice is-error"><strong>CLEARANCE ADMINISTRATION UNAVAILABLE</strong> · ${esc(state.error)}</div><div class="dni-admin-actions"><button type="button" class="dni-admin-action" data-clearance-refresh>RETRY</button></div></section>`;
    return;
  }
  host.innerHTML = `<section class="dni-admin-block">
    <div class="dni-clearance-admin-header"><div><span class="dni-admin-label">DNI CLEARANCE CORE</span><h3>Personnel Clearance Administration</h3><p>Persistent manual assignments, automatic rank/role clearance, and immutable change history.</p></div><strong class="dni-state-badge is-online">${esc(clearanceText(state.actorClearance))}</strong></div>
    <div class="dni-clearance-security"><strong>NO BYPASS:</strong> Administrator capability never overrides the clearance boundary. Users above your current CL are omitted from this workspace.</div>
    <div class="dni-admin-manager"><section class="dni-admin-list"><div class="dni-admin-list-head"><strong>PERSONNEL SECURITY</strong><small>${state.users.length} VISIBLE ACCOUNTS</small></div>${clearanceUserList()}</section>${selectedUserMarkup()}</div>
  </section>`;
}

function activateClearanceWorkspace() {
  const panel = adminPanel();
  if (!panel) return;
  state.active = true;
  panel.querySelectorAll('.dni-admin-worktab').forEach(button => button.classList.toggle('is-active', button.hasAttribute('data-clearance-admin-tab')));
  const normal = panel.querySelector('.dni-admin-workspace');
  const host = workspaceHost();
  if (normal) normal.hidden = true;
  if (host) host.hidden = false;
  render();
  void loadClearanceAdmin(state.selectedUserId);
}

function deactivateClearanceWorkspace() {
  state.active = false;
  const panel = adminPanel();
  if (!panel) return;
  const normal = panel.querySelector('.dni-admin-workspace');
  const host = workspaceHost();
  if (normal) normal.hidden = false;
  if (host) host.hidden = true;
}

function install() {
  installStyles();
  const panel = adminPanel();
  const tabs = panel?.querySelector('.dni-admin-worktabs');
  const normal = panel?.querySelector('.dni-admin-workspace');
  if (!panel || !tabs || !normal) return;

  if (!tabs.querySelector('[data-clearance-admin-tab]')) {
    const button = document.createElement('button');
    button.className = 'dni-admin-worktab';
    button.type = 'button';
    button.dataset.clearanceAdminTab = 'true';
    button.textContent = 'CLEARANCES';
    tabs.append(button);
  }
  if (!panel.querySelector('[data-clearance-admin-host]')) {
    const host = document.createElement('div');
    host.className = 'dni-clearance-admin-host';
    host.dataset.clearanceAdminHost = 'true';
    host.hidden = !state.active;
    normal.insertAdjacentElement('afterend', host);
  }
  if (state.active) {
    normal.hidden = true;
    workspaceHost().hidden = false;
    render();
  }
}

document.addEventListener('click', event => {
  const clearanceTab = event.target.closest('[data-clearance-admin-tab]');
  if (clearanceTab) {
    event.preventDefault();
    activateClearanceWorkspace();
    return;
  }
  if (event.target.closest('[data-admin-workspace]')) {
    deactivateClearanceWorkspace();
    return;
  }
  const user = event.target.closest('[data-clearance-user]');
  if (user) {
    state.selectedUserId = Number(user.dataset.clearanceUser);
    void loadClearanceAdmin(state.selectedUserId);
    return;
  }
  if (event.target.closest('[data-clearance-refresh]')) {
    void loadClearanceAdmin(state.selectedUserId);
    return;
  }
  const remove = event.target.closest('[data-clearance-remove]');
  if (remove) {
    const form = remove.closest('[data-clearance-form]');
    const reason = String(form?.elements?.reason?.value || '').trim();
    if (!reason) { window.alert('A reason is required to return this member to automatic clearance.'); return; }
    if (!window.confirm('Remove this persistent manual clearance and return the member to automatic rank / Discord clearance?')) return;
    remove.disabled = true;
    postClearance('remove-override', { userId: state.selectedUserId, reason })
      .then(() => { state.error = ''; render(); })
      .catch(error => { state.error = String(error?.message || error); render(); });
  }
});

document.addEventListener('submit', event => {
  const form = event.target.closest('[data-clearance-form="set-override"]');
  if (!form) return;
  event.preventDefault();
  const userId = Number(form.elements.userId.value || 0);
  const clearanceLevel = Number(form.elements.clearanceLevel.value);
  const reason = String(form.elements.reason.value || '').trim();
  if (!userId || !Number.isInteger(clearanceLevel) || !reason) {
    window.alert('Member, clearance, and reason are required.');
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  postClearance('set-override', { userId, clearanceLevel, reason })
    .then(() => { state.selectedUserId = userId; state.error = ''; render(); })
    .catch(error => { state.error = String(error?.message || error); render(); });
});

const observer = new MutationObserver(() => install());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') queueMicrotask(install);
  else deactivateClearanceWorkspace();
});
install();
