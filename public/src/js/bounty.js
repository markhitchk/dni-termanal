const API = '/bounty-data.php';
const managePanel = document.querySelector('[data-module="bounty"]');
const boardPanel = document.querySelector('[data-module="bountyboard"]');

const state = {
  session: null,
  mine: [],
  board: [],
  editing: null,
  loadedManage: false,
  loadedBoard: false
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[ch]);

const attr = value => esc(value ?? '');
const money = value => Number(value || 0).toLocaleString();
const statusLabel = value => ({
  DEAD_OR_ALIVE: 'DEAD OR ALIVE',
  ALIVE_ONLY: 'ALIVE ONLY',
  WANTED: 'WANTED'
})[String(value || '').toUpperCase()] || 'WANTED';

function currentDetailCode() {
  const match = String(window.location.pathname || '').match(/^\/bounty\/([A-Za-z0-9]{6})\/?$/);
  return match ? match[1].toUpperCase() : '';
}

async function json(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function ensureSession(force = false) {
  if (state.session && !force) return state.session;
  state.session = await json(`${API}?action=session`);
  return state.session;
}

async function post(action, body) {
  const session = await ensureSession();
  const payload = await json(`${API}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {'X-DNI-CSRF': String(session.csrfToken || '')},
    body: JSON.stringify(body)
  });
  if (payload.csrfToken) state.session.csrfToken = payload.csrfToken;
  return payload;
}

function loginMarkup(message = 'Discord sign-in is required to use the DNI Bounty Network.') {
  return `<section class="dni-bounty-notice is-error"><strong>AUTHENTICATION REQUIRED</strong><span>${esc(message)}</span><a href="/auth/discord/login?next=/bounty">SIGN IN WITH DISCORD</a></section>`;
}

function membershipOptions(selected = '') {
  const memberships = state.session?.memberships || [];
  const independent = `<option value="" ${String(selected || '') === '' ? 'selected' : ''}>Independent / No Organization</option>`;
  return independent + memberships.map(item => {
    const label = `${item.org_name} [${item.org_tag}] · ${String(item.membership_status || 'self_declared').replaceAll('_',' ').toUpperCase()}`;
    return `<option value="${Number(item.organization_id)}" ${String(item.organization_id) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function bountyFormMarkup() {
  const item = state.editing || {};
  const editing = Boolean(state.editing);
  return `<form class="dni-bounty-form" data-bounty-form>
    <div class="dni-bounty-form-heading"><div><span>${editing ? 'EDIT RECORD' : 'NEW CONTRACT'}</span><h3>${editing ? esc(item.publicId) : 'Create Bounty'}</h3></div>${editing ? '<button type="button" data-bounty-cancel-edit>CANCEL EDIT</button>' : ''}</div>
    <div class="dni-bounty-fields">
      <label>Target Name *<input name="targetName" maxlength="120" value="${attr(item.targetName || '')}" required></label>
      <label>Target Handle / Callsign<input name="targetHandle" maxlength="80" value="${attr(item.targetHandle || '')}"></label>
      <label>Wanted Status<select name="wantedStatus">
        <option value="WANTED" ${item.wantedStatus === 'WANTED' || !item.wantedStatus ? 'selected' : ''}>WANTED</option>
        <option value="DEAD_OR_ALIVE" ${item.wantedStatus === 'DEAD_OR_ALIVE' ? 'selected' : ''}>DEAD OR ALIVE</option>
        <option value="ALIVE_ONLY" ${item.wantedStatus === 'ALIVE_ONLY' ? 'selected' : ''}>ALIVE ONLY</option>
      </select></label>
      <label>Reward (aUEC)<input name="rewardAmount" type="number" min="0" max="2000000000" step="1" value="${Number(item.rewardAmount || 0)}"></label>
      <label class="wide">Representing Organization<select name="organizationId">${membershipOptions(item.organizationId ?? '')}</select></label>
      <label class="wide">Last Known Location<input name="lastKnownLocation" maxlength="180" value="${attr(item.lastKnownLocation || '')}" placeholder="System, planet, station, sector, etc."></label>
      <label class="wide">Charges / Reason<textarea name="charges" maxlength="1200" rows="3">${esc(item.charges || '')}</textarea></label>
      <label class="wide">Description<textarea name="description" maxlength="2500" rows="4">${esc(item.description || '')}</textarea></label>
      <label class="wide">Target Image URL<input name="targetImageUrl" maxlength="500" value="${attr(item.targetImageUrl || '')}" placeholder="HTTPS image or DNI CDN path"></label>
    </div>
    <div class="dni-bounty-actions"><button type="submit">${editing ? 'SAVE BOUNTY' : 'POST BOUNTY'}</button></div>
  </form>`;
}

function addOrgMarkup() {
  return `<details class="dni-bounty-org-add">
    <summary>+ ADD ORGANIZATION</summary>
    <form data-bounty-org-form>
      <label>ORG Tag *<input name="orgTag" maxlength="12" placeholder="NOVA" required></label>
      <label>Organization Name *<input name="orgName" maxlength="120" required></label>
      <label>RSI Organization URL<input name="rsiUrl" maxlength="500" placeholder="https://robertsspaceindustries.com/orgs/..."></label>
      <label>Logo URL<input name="logoUrl" maxlength="500" placeholder="Optional HTTPS logo"></label>
      <label>Your Position / Role<input name="memberRole" maxlength="80" placeholder="Pilot, Officer, Contractor..."></label>
      <button type="submit">ADD TO MY ORGS</button>
    </form>
    <p>Manual memberships are marked SELF-DECLARED until an administrator verifies them. Discord-linked memberships are verified automatically.</p>
  </details>`;
}

function orgBadge(item) {
  if (!item.organizationName) return '<span class="dni-bounty-org-badge is-independent">INDEPENDENT</span>';
  const stateLabel = String(item.organizationMembershipStatus || 'self_declared').replaceAll('_',' ').toUpperCase();
  return `<span class="dni-bounty-org-badge">${esc(item.organizationTag || 'ORG')}</span><small>${esc(stateLabel)}</small>`;
}

function manageCard(item) {
  return `<article class="dni-bounty-manage-card">
    <div><span class="dni-bounty-id">${esc(item.publicId)}</span><h4>${esc(item.targetName)}</h4><p>${esc(statusLabel(item.wantedStatus))} · ${money(item.rewardAmount)} ${esc(item.rewardCurrency)}</p><div class="dni-bounty-org-line">${orgBadge(item)}</div></div>
    <div class="dni-bounty-manage-actions">
      <a href="${attr(item.url)}">VIEW</a>
      <button type="button" data-bounty-edit="${attr(item.code)}">EDIT</button>
      ${item.status === 'active'
        ? `<button type="button" data-bounty-archive="${attr(item.code)}">ARCHIVE</button>`
        : `<button type="button" data-bounty-restore="${attr(item.code)}">RESTORE</button>`}
    </div>
  </article>`;
}

function renderManage() {
  if (!managePanel) return;
  const active = state.mine.filter(item => item.status === 'active');
  const archived = state.mine.filter(item => item.status === 'archived');
  managePanel.innerHTML = `<header class="dni-module-header"><div><span>DNI BOUNTY NETWORK</span><h2>Bounty Management</h2><p>Create, edit, archive, and restore bounty records issued by your account.</p></div><strong class="dni-bounty-network-state">AUTHORIZED</strong></header>
    <div class="dni-bounty-manage-layout">
      <section class="dni-bounty-editor-shell">${bountyFormMarkup()}${addOrgMarkup()}</section>
      <section class="dni-bounty-owned">
        <div class="dni-bounty-owned-heading"><span>MY BOUNTIES</span><strong>${state.mine.length} RECORDS</strong></div>
        <h3>ACTIVE</h3><div class="dni-bounty-manage-list">${active.length ? active.map(manageCard).join('') : '<p class="dni-bounty-empty">No active bounties.</p>'}</div>
        <h3>ARCHIVED</h3><div class="dni-bounty-manage-list">${archived.length ? archived.map(manageCard).join('') : '<p class="dni-bounty-empty">No archived bounties.</p>'}</div>
      </section>
    </div>`;
  bindManage();
}

async function loadManage(force = false) {
  if (!managePanel) return;
  if (state.loadedManage && !force) return;
  managePanel.innerHTML = '<div class="dni-loading"><span>DNI BOUNTY NETWORK</span><b>Loading your bounty records…</b></div>';
  try {
    await ensureSession(force);
    const mine = await json(`${API}?action=mine`);
    state.mine = Array.isArray(mine.bounties) ? mine.bounties : [];
    const adminEditCode = new URLSearchParams(window.location.search).get('edit');
    if (adminEditCode && state.session?.admin) {
      const detail = await json(`${API}?action=detail&code=${encodeURIComponent(adminEditCode)}`);
      state.editing = detail.bounty || null;
    }
    state.loadedManage = true;
    renderManage();
  } catch (error) {
    managePanel.innerHTML = error.status === 401 ? loginMarkup(error.message) : `<div class="dni-bounty-notice is-error">${esc(error.message)}</div>`;
  }
}

function poster(item, detail = false) {
  const org = item.organizationName
    ? `${esc(item.organizationName)} [${esc(item.organizationTag || 'ORG')}]`
    : 'INDEPENDENT';
  const affiliation = item.organizationMembershipStatus === 'verified'
    ? 'VERIFIED REPRESENTATION'
    : item.organizationMembershipStatus === 'independent'
      ? 'NO ORGANIZATION'
      : 'SELF-DECLARED AFFILIATION';
  const body = detail
    ? `<div class="dni-wanted-detail">
        ${item.charges ? `<section><span>CHARGES / REASON</span><p>${esc(item.charges)}</p></section>` : ''}
        ${item.description ? `<section><span>BOUNTY NOTES</span><p>${esc(item.description)}</p></section>` : ''}
      </div>`
    : '';
  return `<article class="dni-wanted-poster ${detail ? 'is-detail' : ''}" data-bounty-code="${attr(item.code)}">
    <div class="dni-wanted-topline">DNI BOUNTY NETWORK <b>${esc(item.publicId)}</b></div>
    <div class="dni-wanted-status">${esc(statusLabel(item.wantedStatus))}</div>
    ${item.targetImageUrl ? `<div class="dni-wanted-image"><img src="${attr(item.targetImageUrl)}" alt=""></div>` : '<div class="dni-wanted-image is-placeholder"><span>IDENTITY IMAGE<br>NOT ON FILE</span></div>'}
    <div class="dni-wanted-target"><small>TARGET</small><h3>${esc(item.targetName)}</h3>${item.targetHandle ? `<p>@${esc(item.targetHandle)}</p>` : ''}</div>
    <div class="dni-wanted-reward"><small>BOUNTY</small><strong>${money(item.rewardAmount)} ${esc(item.rewardCurrency)}</strong></div>
    <dl>
      <div><dt>ISSUED BY</dt><dd>${org}</dd></div>
      <div><dt>REPRESENTATIVE</dt><dd>${esc(item.issuerName)}</dd></div>
      ${item.lastKnownLocation ? `<div><dt>LAST KNOWN</dt><dd>${esc(item.lastKnownLocation)}</dd></div>` : ''}
      <div><dt>ORG STATUS</dt><dd>${esc(affiliation)}</dd></div>
    </dl>
    ${body}
    <div class="dni-wanted-footer">DNI // CONTRACT RECORD // ${esc(item.publicId)}</div>
  </article>`;
}

function renderBoard(detailItem = null) {
  if (!boardPanel) return;
  const orgs = state.session?.organizations || [];
  if (detailItem) {
    boardPanel.innerHTML = `<header class="dni-module-header"><div><span>DNI BOUNTY NETWORK</span><h2>${esc(detailItem.publicId)}</h2><p>Individual bounty contract record.</p></div><a class="dni-bounty-board-link" href="/bountyboard">BACK TO BOARD</a></header><div class="dni-bounty-detail-shell">${poster(detailItem, true)}</div>`;
    return;
  }
  boardPanel.innerHTML = `<header class="dni-module-header"><div><span>MULTI-ORG CONTRACT BOARD</span><h2>DNI Bounty Board</h2><p>Active bounty contracts issued by DNI personnel, Citizens, allied organizations, and independent representatives.</p></div><a class="dni-bounty-board-link" href="/bounty">CREATE / MANAGE</a></header>
    <div class="dni-bounty-board-tools"><label>FILTER BY ORG<select data-bounty-org-filter><option value="">ALL ORGANIZATIONS</option>${orgs.map(org => `<option value="${Number(org.id)}">${esc(org.org_name)} [${esc(org.org_tag)}]</option>`).join('')}</select></label><span>${state.board.length} ACTIVE BOUNTIES</span></div>
    <div class="dni-bounty-wall">${state.board.length ? state.board.map(item => `<a class="dni-bounty-poster-link" href="${attr(item.url)}">${poster(item)}</a>`).join('') : '<p class="dni-bounty-empty">No active bounties are currently posted.</p>'}</div>`;
  boardPanel.querySelector('[data-bounty-org-filter]')?.addEventListener('change', event => {
    void loadBoard(true, event.target.value);
  });
}

async function loadBoard(force = false, organizationId = '') {
  if (!boardPanel) return;
  if (state.loadedBoard && !force && !currentDetailCode()) return;
  boardPanel.innerHTML = '<div class="dni-loading"><span>DNI BOUNTY NETWORK</span><b>Loading active contracts…</b></div>';
  try {
    await ensureSession(force);
    const detailCode = currentDetailCode();
    if (detailCode) {
      const payload = await json(`${API}?action=detail&code=${encodeURIComponent(detailCode)}`);
      renderBoard(payload.bounty);
      state.loadedBoard = true;
      return;
    }
    const query = organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : '';
    const payload = await json(`${API}?action=board${query}`);
    state.board = Array.isArray(payload.bounties) ? payload.bounties : [];
    state.loadedBoard = true;
    renderBoard();
  } catch (error) {
    boardPanel.innerHTML = error.status === 401 ? loginMarkup(error.message) : `<div class="dni-bounty-notice is-error">${esc(error.message)}</div>`;
  }
}

function bindManage() {
  const form = managePanel.querySelector('[data-bounty-form]');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      data.rewardAmount = String(data.rewardAmount || '0');
      if (state.editing) {
        data.code = state.editing.code;
        await post('update', data);
      } else {
        await post('create', data);
      }
      state.editing = null;
      state.loadedManage = false;
      state.loadedBoard = false;
      await loadManage(true);
    } catch (error) {
      window.alert(error.message);
      if (submit) submit.disabled = false;
    }
  });

  managePanel.querySelector('[data-bounty-cancel-edit]')?.addEventListener('click', () => {
    state.editing = null;
    renderManage();
  });

  managePanel.querySelector('[data-bounty-org-form]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const orgForm = event.currentTarget;
    const button = orgForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(orgForm).entries());
      state.session = await post('add-org', data);
      renderManage();
    } catch (error) {
      window.alert(error.message);
      if (button) button.disabled = false;
    }
  });

  managePanel.querySelectorAll('[data-bounty-edit]').forEach(button => button.addEventListener('click', () => {
    state.editing = state.mine.find(item => item.code === button.dataset.bountyEdit) || null;
    renderManage();
    managePanel.scrollIntoView({behavior:'smooth', block:'start'});
  }));

  managePanel.querySelectorAll('[data-bounty-archive]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm(`Archive ${button.dataset.bountyArchive}? It will leave the active board but remain in your records.`)) return;
    try {
      await post('archive', {code:button.dataset.bountyArchive});
      state.loadedManage = false;
      state.loadedBoard = false;
      await loadManage(true);
    } catch (error) { window.alert(error.message); }
  }));

  managePanel.querySelectorAll('[data-bounty-restore]').forEach(button => button.addEventListener('click', async () => {
    try {
      await post('restore', {code:button.dataset.bountyRestore});
      state.loadedManage = false;
      state.loadedBoard = false;
      await loadManage(true);
    } catch (error) { window.alert(error.message); }
  }));
}

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'bounty') void loadManage();
  if (event.detail?.panel === 'bountyboard') void loadBoard();
});

const path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
if (path === '/bounty') void loadManage();
if (path === '/bountyboard' || /^\/bounty\/[A-Za-z0-9]{6}$/.test(path)) void loadBoard();

const boardTab = document.querySelector('#tab-bountyboard');
boardTab?.addEventListener('click', () => {
  if (!currentDetailCode()) return;
  history.pushState({panel:'bountyboard'}, '', '/bountyboard');
  state.loadedBoard = false;
  queueMicrotask(() => void loadBoard(true));
});
