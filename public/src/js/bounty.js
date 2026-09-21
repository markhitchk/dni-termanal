const API = '/bounty-data.php';
const SC_API = '/api/dni/sc/v1/auto';
const boardPanel = document.querySelector('[data-module="bountyboard"]');

const state = {
  session: null,
  board: [],
  mine: [],
  editing: null,
  selectedOrg: '',
  composerOrgId: '',
  loaded: false
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
  if (match) return match[1].toUpperCase();
  const queryCode = String(new URLSearchParams(window.location.search).get('code') || '').trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(queryCode) ? queryCode : '';
}

function wantsComposer() {
  const path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(window.location.search);
  return path === '/bounty' || query.get('compose') === '1' || Boolean(query.get('edit'));
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
    const error = new Error(payload.error || payload.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function sc(resource, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || String(value) === '') continue;
    query.set(key, String(value));
  }
  const suffix = query.size ? `?${query.toString()}` : '';
  const payload = await json(`${SC_API}/${String(resource || '').replace(/^\/+/, '')}${suffix}`);
  if (Number(payload.success ?? 0) !== 1) {
    throw new Error(payload.message || 'DNI Star Citizen API request failed.');
  }
  return payload.data;
}

function citizenProfile(data) {
  const root = data && typeof data === 'object' ? data : {};
  const profile = root.profile && typeof root.profile === 'object' ? root.profile : root;
  return {
    handle: String(profile.handle || root.handle || '').trim(),
    display: String(profile.display || profile.name || root.display || root.name || '').trim(),
    image: String(profile.image_proxy || profile.image || profile.avatar || root.image_proxy || root.image || root.avatar || '').trim()
  };
}

async function ensureSession(force = false) {
  if (state.session && !force) return state.session;
  state.session = await json(`${API}?action=session`);
  return state.session;
}

async function post(action, body) {
  const session = await ensureSession();
  if (!session.authenticated || !session.csrfToken) {
    throw Object.assign(new Error('Discord sign-in required to post or manage bounties.'), {status:401});
  }
  return json(`${API}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {'X-DNI-CSRF': String(session.csrfToken)},
    body: JSON.stringify(body)
  });
}

function membershipChoices(selected = '') {
  const selectedValue = String(selected ?? '');
  const memberships = state.session?.memberships || [];

  const choice = ({id = '', name, tag = '', status = '', role = ''}) => {
    const value = String(id ?? '');
    const checked = value === selectedValue ? 'checked' : '';
    const title = tag ? `${name} [${tag}]` : name;
    const meta = [status, role].filter(Boolean).join(' · ');
    return `<label class="dni-bounty-org-choice ${checked ? 'is-selected' : ''}" data-org-id="${attr(value)}">
      <input type="radio" name="organizationId" value="${attr(value)}" ${checked}>
      <span class="dni-bounty-org-choice-copy"><strong>${esc(title)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}</span>
    </label>`;
  };

  const independent = choice({
    id: '',
    name: 'Independent / No Organization',
    status: 'NO ORGANIZATION'
  });

  if (state.session?.admin) {
    const membershipByOrg = new Map(memberships.map(item => [Number(item.organization_id), item]));
    return independent + (state.session.organizations || []).map(org => {
      const membership = membershipByOrg.get(Number(org.id));
      return choice({
        id: Number(org.id),
        name: String(org.org_name || 'Organization'),
        tag: String(org.org_tag || 'ORG'),
        status: membership?.membership_status
          ? String(membership.membership_status).replaceAll('_',' ').toUpperCase()
          : 'ADMIN',
        role: String(membership?.member_role || '').trim()
      });
    }).join('');
  }

  return independent + memberships.map(item => choice({
    id: Number(item.organization_id),
    name: String(item.org_name || 'Organization'),
    tag: String(item.org_tag || 'ORG'),
    status: String(item.membership_status || 'self_declared').replaceAll('_',' ').toUpperCase(),
    role: String(item.member_role || '').trim()
  })).join('');
}

function bountyFormMarkup() {
  const item = state.editing || {};
  const editing = Boolean(state.editing);
  return `<form class="dni-bounty-form" data-bounty-form>
    <div class="dni-bounty-form-heading">
      <div><span>BOUNTY COMPOSER</span><h3>${editing ? esc(item.publicId) : 'Post New Bounty'}</h3></div>
      ${editing ? '<button type="button" data-bounty-cancel-edit>CANCEL EDIT</button>' : ''}
    </div>
    <div class="dni-bounty-fields">
      <label>Target Name *<input name="targetName" maxlength="120" value="${attr(item.targetName || '')}" required></label>
      <label>Target Handle / Callsign
        <div class="dni-bounty-api-row">
          <input name="targetHandle" maxlength="80" value="${attr(item.targetHandle || '')}" autocomplete="off">
          <button type="button" data-bounty-target-lookup>LOOK UP</button>
        </div>
        <small class="dni-bounty-api-status" data-bounty-target-lookup-status>Uses DNI internal Star Citizen API · no API key required.</small>
      </label>
      <label>Wanted Status<select name="wantedStatus">
        <option value="WANTED" ${item.wantedStatus === 'WANTED' || !item.wantedStatus ? 'selected' : ''}>WANTED</option>
        <option value="DEAD_OR_ALIVE" ${item.wantedStatus === 'DEAD_OR_ALIVE' ? 'selected' : ''}>DEAD OR ALIVE</option>
        <option value="ALIVE_ONLY" ${item.wantedStatus === 'ALIVE_ONLY' ? 'selected' : ''}>ALIVE ONLY</option>
      </select></label>
      <label>Reward (aUEC)<input name="rewardAmount" type="number" min="0" max="2000000000" step="1" value="${Number(item.rewardAmount || 0)}"></label>
      <fieldset class="wide dni-bounty-org-picker">
        <legend>Representing Organization</legend>
        <div class="dni-bounty-org-choices">${membershipChoices(item.organizationId ?? state.composerOrgId ?? '')}</div>
        <div class="dni-bounty-org-picker-footer">
          <p>Tap the account or organization this bounty should represent.</p>
          <button type="button" data-bounty-add-org-open>+ ADD YOUR ORGANIZATION</button>
        </div>
      </fieldset>
      <label class="wide">Last Known Location<input name="lastKnownLocation" maxlength="180" value="${attr(item.lastKnownLocation || '')}" placeholder="System, planet, station, sector, etc."></label>
      <label class="wide">Charges / Reason<textarea name="charges" maxlength="1200" rows="3">${esc(item.charges || '')}</textarea></label>
      <label class="wide">Description<textarea name="description" maxlength="2500" rows="4">${esc(item.description || '')}</textarea></label>
      <label class="wide">Target Image URL<input name="targetImageUrl" maxlength="500" value="${attr(item.targetImageUrl || '')}" placeholder="Auto-filled from Star Citizen profile when available"></label>
    </div>
    <div class="dni-bounty-actions"><button type="submit">${editing ? 'SAVE CHANGES' : 'POST TO MAIN BOARD'}</button></div>
  </form>`;
}

function addOrgMarkup() {
  return `<details class="dni-bounty-org-add" data-bounty-org-add>
    <summary>ADD YOUR ORGANIZATION</summary>
    <form data-bounty-org-form>
      <label>ORG Tag *
        <div class="dni-bounty-api-row">
          <input name="orgTag" maxlength="12" placeholder="NOVA" required autocomplete="off">
          <button type="button" data-bounty-org-lookup>LOOK UP</button>
        </div>
        <small class="dni-bounty-api-status" data-bounty-org-lookup-status>Check DNI/Star Citizen organization data.</small>
      </label>
      <label>Organization Name *<input name="orgName" maxlength="120" required></label>
      <label>RSI Organization URL<input name="rsiUrl" maxlength="500" placeholder="https://robertsspaceindustries.com/orgs/..."></label>
      <label>Logo URL<input name="logoUrl" maxlength="500" placeholder="Optional HTTPS logo"></label>
      <label>Your Position / Role<input name="memberRole" maxlength="80" placeholder="Pilot, Officer, Contractor..."></label>
      <button type="submit">ADD ORGANIZATION</button>
    </form>
    <p>Add an organization you belong to. It becomes available in the bounty picker immediately. User-added affiliations are marked SELF-DECLARED until an administrator verifies them; Discord-linked affiliations remain VERIFIED.</p>
  </details>`;
}

function orgBadge(item) {
  if (!item.organizationName) return '<span class="dni-bounty-org-badge is-independent">INDEPENDENT</span>';
  const stateLabel = String(item.organizationMembershipStatus || 'self_declared').replaceAll('_',' ').toUpperCase();
  return `<span class="dni-bounty-org-badge">${esc(item.organizationTag || 'ORG')}</span><small>${esc(stateLabel)}</small>`;
}

function manageCard(item) {
  return `<article class="dni-bounty-manage-card">
    <div><span class="dni-bounty-id">${esc(item.publicId)} · ISSUED BY YOU</span><h4>${esc(item.targetName)}</h4><p>${esc(statusLabel(item.wantedStatus))} · ${money(item.rewardAmount)} ${esc(item.rewardCurrency)}</p><div class="dni-bounty-org-line">${orgBadge(item)}</div></div>
    <div class="dni-bounty-manage-actions">
      <a href="${attr(item.url)}">VIEW</a>
      <button type="button" data-bounty-edit="${attr(item.code)}">EDIT</button>
      ${item.status === 'active'
        ? `<button type="button" data-bounty-archive="${attr(item.code)}">ARCHIVE BOUNTY</button>`
        : `<button type="button" data-bounty-restore="${attr(item.code)}">RESTORE BOUNTY</button>`}
    </div>
  </article>`;
}

function composerMarkup() {
  if (!state.session?.authenticated) {
    return `<aside class="dni-bounty-composer" id="bounty-composer">
      <div class="dni-bounty-composer-cap"><span>BOUNTY COMPOSER</span><b>AUTH REQUIRED TO POST</b></div>
      <div class="dni-bounty-composer-login">
        <strong>Post to the Main Bounty Board</strong>
        <p>The board is public to view. Sign in with Discord to issue a bounty, represent an ORG, or manage contracts you created.</p>
        <a href="/auth/discord/login?next=${encodeURIComponent('/bountyboard?compose=1')}">SIGN IN WITH DISCORD</a>
      </div>
    </aside>`;
  }

  const active = state.mine.filter(item => item.status === 'active');
  const archived = state.mine.filter(item => item.status === 'archived');

  return `<aside class="dni-bounty-composer" id="bounty-composer">
    <div class="dni-bounty-composer-cap"><span>BOUNTY COMPOSER</span><b>${esc(state.session.user?.name || 'AUTHORIZED USER')}</b></div>
    ${bountyFormMarkup()}
    ${addOrgMarkup()}
    <details class="dni-bounty-my-contracts" ${state.editing ? 'open' : ''}>
      <summary>MY BOUNTIES · ${state.mine.length}</summary>
      <p class="dni-bounty-owner-note">You are the issuer/owner of every bounty listed here. You can edit, archive, or restore your own bounties. Archiving removes a bounty from the active Main Bounty Board but keeps its record and history. Permanent deletion is administrator-only.</p>
      <h4>ACTIVE</h4>
      <div class="dni-bounty-manage-list">${active.length ? active.map(manageCard).join('') : '<p class="dni-bounty-empty">No active bounties.</p>'}</div>
      <h4>ARCHIVED</h4>
      <div class="dni-bounty-manage-list">${archived.length ? archived.map(manageCard).join('') : '<p class="dni-bounty-empty">No archived bounties.</p>'}</div>
    </details>
  </aside>`;
}

function poster(item, detail = false) {
  const org = item.organizationName
    ? `${esc(item.organizationName)} [${esc(item.organizationTag || 'ORG')}]`
    : 'INDEPENDENT';
  const affiliation = item.organizationMembershipStatus === 'verified'
    ? 'VERIFIED REPRESENTATION'
    : item.organizationMembershipStatus === 'independent'
      ? 'NO ORGANIZATION'
      : item.organizationMembershipStatus === 'admin_selected'
        ? 'ADMIN ASSIGNED REPRESENTATION'
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

function alternateBoardsMarkup() {
  const orgs = state.session?.organizations || [];
  return `<nav class="dni-bounty-altboards" aria-label="Alternate bounty boards">
    <button type="button" data-bounty-alt-org="" class="${state.selectedOrg === '' ? 'is-active' : ''}">MAIN BOARD</button>
    ${orgs.map(org => `<button type="button" data-bounty-alt-org="${Number(org.id)}" class="${String(org.id) === String(state.selectedOrg) ? 'is-active' : ''}">[${esc(org.org_tag)}] ${esc(org.org_name)}</button>`).join('')}
  </nav>`;
}

function boardWallMarkup() {
  return `<section class="dni-bounty-board-stage">
    <div class="dni-bounty-board-tools">
      <div><span>BOARD VIEW</span><strong>${state.selectedOrg ? 'ALTERNATE ORG BOARD' : 'MAIN BOUNTY BOARD'}</strong></div>
      <span>${state.board.length} ACTIVE BOUNTIES</span>
    </div>
    <div class="dni-bounty-wall">${state.board.length
      ? state.board.map(item => `<a class="dni-bounty-poster-link" href="${attr(item.url)}">${poster(item)}</a>`).join('')
      : '<div class="dni-bounty-empty-board"><strong>NO ACTIVE BOUNTIES</strong><span>This board currently has no active contracts.</span></div>'}
    </div>
  </section>`;
}

function isCurrentUserOwner(item) {
  return Boolean(
    state.session?.authenticated
    && Number(state.session.user?.id || 0) > 0
    && Number(item?.creatorUserId || 0) === Number(state.session.user?.id || 0)
  );
}

function renderDetail(item) {
  if (!boardPanel) return;
  const owner = isCurrentUserOwner(item);
  const shareUrl = new URL(String(item.url || '/bounty/?code=' + encodeURIComponent(item.code || '')), window.location.origin);
  if (shareUrl.pathname.startsWith('/bounty')) {
    history.replaceState({ ...(history.state || {}), panel:'bountyboard', bountyCode:item.code }, '', shareUrl.pathname + shareUrl.search);
  }
  const ownerAction = owner
    ? (item.status === 'active'
        ? `<button type="button" class="dni-bounty-primary-action" data-bounty-detail-archive="${attr(item.code)}">ARCHIVE BOUNTY</button>`
        : `<button type="button" class="dni-bounty-primary-action" data-bounty-detail-restore="${attr(item.code)}">RESTORE BOUNTY</button>`)
    : '';

  boardPanel.innerHTML = `<header class="dni-module-header dni-bounty-main-header">
    <div><span>DNI BOUNTY NETWORK</span><h2>${esc(item.publicId)}</h2><p>${owner ? 'You issued this bounty. You can edit it, archive it from the active board, or restore it later.' : 'Individual contract record from the Main Bounty Board.'}</p></div>
    <div class="dni-bounty-header-actions"><a class="dni-bounty-board-link" href="/bountyboard">MAIN BOARD</a><button type="button" class="dni-bounty-board-link" data-bounty-copy-share>COPY SHARE LINK</button>${owner ? `<a class="dni-bounty-board-link" href="/bountyboard?edit=${encodeURIComponent(item.code)}&compose=1">EDIT MY BOUNTY</a>` : ''}${ownerAction}</div>
  </header>
  <div class="dni-bounty-detail-shell">${poster(item, true)}</div>`;
  bindDetail(item);
}

function bindDetail(item) {
  boardPanel?.querySelector('[data-bounty-copy-share]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const url = new URL(String(item.url || '/bounty/?code=' + encodeURIComponent(item.code || '')), window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      button.textContent = 'LINK COPIED';
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = 'COPY SHARE LINK';
      }, 1800);
    } catch {
      window.prompt('Copy this bounty link:', url);
    }
  });

  boardPanel?.querySelector('[data-bounty-detail-archive]')?.addEventListener('click', async buttonEvent => {
    const button = buttonEvent.currentTarget;
    if (!window.confirm(`Archive ${item.publicId}? It will be removed from the active Main Bounty Board but kept in My Bounties and can be restored later.`)) return;
    button.disabled = true;
    try {
      await post('archive', {code:item.code});
      state.loaded = false;
      await loadBoard(true);
    } catch (error) {
      button.disabled = false;
      window.alert(error.message);
    }
  });

  boardPanel?.querySelector('[data-bounty-detail-restore]')?.addEventListener('click', async buttonEvent => {
    const button = buttonEvent.currentTarget;
    if (!window.confirm(`Restore ${item.publicId} to the active Main Bounty Board?`)) return;
    button.disabled = true;
    try {
      await post('restore', {code:item.code});
      state.loaded = false;
      await loadBoard(true);
    } catch (error) {
      button.disabled = false;
      window.alert(error.message);
    }
  });
}

function renderBoard() {
  if (!boardPanel) return;
  const authenticated = Boolean(state.session?.authenticated);
  boardPanel.innerHTML = `<header class="dni-module-header dni-bounty-main-header">
      <div><span>DNI MULTI-ORG CONTRACT NETWORK</span><h2>Main Bounty Board</h2><p>One shared bounty network for DNI, allied organizations, outside organizations, and independent issuers. ORG boards below are alternate filtered views of this same board.</p></div>
      <div class="dni-bounty-header-actions">
        <button type="button" class="dni-bounty-primary-action" data-bounty-open-composer>${authenticated ? 'POST BOUNTY' : 'SIGN IN TO POST'}</button>
      </div>
    </header>
    ${alternateBoardsMarkup()}
    <div class="dni-bounty-hub">
      ${boardWallMarkup()}
      ${composerMarkup()}
    </div>`;
  bindBoard();
  if (wantsComposer()) queueMicrotask(() => focusComposer());
}

function focusComposer() {
  const composer = boardPanel?.querySelector('#bounty-composer');
  if (!composer) return;
  composer.scrollIntoView({behavior:'smooth', block:'start'});
  composer.classList.remove('is-highlighted');
  requestAnimationFrame(() => composer.classList.add('is-highlighted'));
}

async function loadBoard(force = false, organizationId = state.selectedOrg) {
  if (!boardPanel) return;
  if (state.loaded && !force && !currentDetailCode()) return;

  boardPanel.innerHTML = '<div class="dni-loading"><span>DNI BOUNTY NETWORK</span><b>Loading Main Bounty Board…</b></div>';

  try {
    await ensureSession(force);
    const detailCode = currentDetailCode();
    if (detailCode) {
      const bounty = await sc(`bounty/${encodeURIComponent(detailCode)}`);
      renderDetail(bounty);
      state.loaded = true;
      return;
    }

    const board = await sc('bounties', organizationId ? {organizationId} : {});
    state.board = Array.isArray(board) ? board : [];
    state.selectedOrg = organizationId ? String(organizationId) : '';

    if (state.session?.authenticated) {
      const mine = await json(`${API}?action=mine`);
      state.mine = Array.isArray(mine.bounties) ? mine.bounties : [];
      const editCode = new URLSearchParams(window.location.search).get('edit');
      if (editCode) {
        const detail = await json(`${API}?action=detail&code=${encodeURIComponent(editCode)}`);
        if (detail.bounty?.canManage) state.editing = detail.bounty;
      }
    } else {
      state.mine = [];
      state.editing = null;
    }

    state.loaded = true;
    renderBoard();
  } catch (error) {
    boardPanel.innerHTML = `<div class="dni-bounty-notice is-error"><strong>BOUNTY BOARD UNAVAILABLE</strong><span>${esc(error.message)}</span></div>`;
  }
}

function bindBoard() {
  boardPanel?.querySelector('[data-bounty-open-composer]')?.addEventListener('click', () => {
    if (!state.session?.authenticated) {
      window.location.href = '/auth/discord/login?next=' + encodeURIComponent('/bountyboard?compose=1');
      return;
    }
    focusComposer();
  });

  boardPanel?.querySelectorAll('[data-bounty-alt-org]').forEach(button => {
    button.addEventListener('click', () => {
      state.loaded = false;
      state.selectedOrg = String(button.dataset.bountyAltOrg || '');
      void loadBoard(true, state.selectedOrg);
    });
  });

  const form = boardPanel?.querySelector('[data-bounty-form]');

  const bindOrgChoices = () => {
    form?.querySelectorAll('input[name="organizationId"]').forEach(input => {
      input.addEventListener('change', () => {
        state.composerOrgId = String(input.value || '');
        form.querySelectorAll('.dni-bounty-org-choice').forEach(choice => {
          const radio = choice.querySelector('input[name="organizationId"]');
          choice.classList.toggle('is-selected', Boolean(radio?.checked));
        });
      });
    });
  };
  bindOrgChoices();

  form?.querySelector('[data-bounty-target-lookup]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const handleInput = form.querySelector('input[name="targetHandle"]');
    const nameInput = form.querySelector('input[name="targetName"]');
    const imageInput = form.querySelector('input[name="targetImageUrl"]');
    const status = form.querySelector('[data-bounty-target-lookup-status]');
    const handle = String(handleInput?.value || '').trim();

    if (!handle) {
      if (status) status.textContent = 'Enter a Star Citizen handle first.';
      handleInput?.focus();
      return;
    }

    button.disabled = true;
    if (status) status.textContent = 'Checking DNI internal Star Citizen API…';

    try {
      const data = await sc(`user/${encodeURIComponent(handle)}`);
      const profile = citizenProfile(data);
      if (profile.handle && handleInput) handleInput.value = profile.handle;
      if (profile.display && nameInput && !String(nameInput.value || '').trim()) nameInput.value = profile.display;
      if (profile.image && imageInput) imageInput.value = profile.image;
      if (status) {
        status.textContent = profile.display || profile.handle
          ? `FOUND · ${profile.display || profile.handle}`
          : 'Profile returned, but no display data was available.';
      }
    } catch (error) {
      if (status) {
        status.textContent = error.status === 404
          ? 'NOT FOUND · RSI does not have a public citizen record for this handle. You can still enter the bounty manually.'
          : `LOOKUP UNAVAILABLE · ${error.message}`;
      }
    } finally {
      button.disabled = false;
    }
  });

  boardPanel?.querySelector('[data-bounty-org-lookup]')?.addEventListener('click', async event => {
    const orgForm = boardPanel.querySelector('[data-bounty-org-form]');
    if (!orgForm) return;

    const button = event.currentTarget;
    const tagInput = orgForm.querySelector('input[name="orgTag"]');
    const nameInput = orgForm.querySelector('input[name="orgName"]');
    const rsiInput = orgForm.querySelector('input[name="rsiUrl"]');
    const logoInput = orgForm.querySelector('input[name="logoUrl"]');
    const status = orgForm.querySelector('[data-bounty-org-lookup-status]');
    const tag = String(tagInput?.value || '').trim().toUpperCase();

    if (!tag) {
      if (status) status.textContent = 'Enter an organization tag first.';
      tagInput?.focus();
      return;
    }

    button.disabled = true;
    if (status) status.textContent = 'Checking DNI internal Star Citizen API…';

    try {
      const org = await sc(`organization/${encodeURIComponent(tag)}`);
      if (org?.sid && tagInput) tagInput.value = String(org.sid).toUpperCase();
      if (org?.name && nameInput) nameInput.value = String(org.name);
      if ((org?.rsi_url || org?.url) && rsiInput) rsiInput.value = String(org.rsi_url || org.url);
      if ((org?.logo_proxy || org?.logo) && logoInput) logoInput.value = String(org.logo_proxy || org.logo);
      if (status) status.textContent = org?.name ? `FOUND · ${org.name}` : 'Organization data returned.';
    } catch (error) {
      if (status) {
        status.textContent = error.status === 404
          ? 'NOT FOUND · RSI does not have a public organization for this SID. You can add it manually.'
          : `LOOKUP UNAVAILABLE · ${error.message}`;
      }
    } finally {
      button.disabled = false;
    }
  });

  boardPanel?.querySelector('[data-bounty-add-org-open]')?.addEventListener('click', () => {
    const addOrg = boardPanel.querySelector('[data-bounty-org-add]');
    if (!(addOrg instanceof HTMLDetailsElement)) return;
    addOrg.open = true;
    addOrg.scrollIntoView({behavior:'smooth', block:'center'});
    window.setTimeout(() => addOrg.querySelector('input[name="orgTag"]')?.focus(), 250);
  });

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
      state.selectedOrg = '';
      state.composerOrgId = '';
      state.loaded = false;
      history.replaceState({panel:'bountyboard'}, '', '/bountyboard');
      await loadBoard(true, '');
    } catch (error) {
      if (error.status === 401) window.location.href = '/auth/discord/login?next=' + encodeURIComponent('/bountyboard?compose=1');
      else window.alert(error.message);
      if (submit) submit.disabled = false;
    }
  });

  boardPanel?.querySelector('[data-bounty-cancel-edit]')?.addEventListener('click', () => {
    state.editing = null;
    state.composerOrgId = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('edit');
    url.searchParams.delete('compose');
    history.replaceState({panel:'bountyboard'}, '', url.pathname + url.search);
    renderBoard();
  });

  boardPanel?.querySelector('[data-bounty-org-form]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const orgForm = event.currentTarget;
    const button = orgForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(orgForm).entries());
      const requestedTag = String(data.orgTag || '').trim().toUpperCase();
      state.session = await post('add-org', data);

      const added = (state.session?.memberships || []).find(item =>
        String(item.org_tag || '').trim().toUpperCase() === requestedTag
      );
      if (added) state.composerOrgId = String(added.organization_id || '');

      const choices = form?.querySelector('.dni-bounty-org-choices');
      if (choices) {
        choices.innerHTML = membershipChoices(state.composerOrgId);
        bindOrgChoices();
      }

      orgForm.reset();
      const addOrg = boardPanel?.querySelector('[data-bounty-org-add]');
      if (addOrg instanceof HTMLDetailsElement) addOrg.open = false;
      form?.querySelector('.dni-bounty-org-picker')?.scrollIntoView({behavior:'smooth', block:'center'});
    } catch (error) {
      window.alert(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  });

  boardPanel?.querySelectorAll('[data-bounty-edit]').forEach(button => button.addEventListener('click', async () => {
    try {
      const detail = await json(`${API}?action=detail&code=${encodeURIComponent(button.dataset.bountyEdit)}`);
      state.editing = detail.bounty?.canManage ? detail.bounty : null;
      renderBoard();
      focusComposer();
    } catch (error) { window.alert(error.message); }
  }));

  boardPanel?.querySelectorAll('[data-bounty-archive]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm(`Archive this bounty? It will be removed from the active Main Bounty Board but remain in My Bounties and can be restored later.`)) return;
    try {
      await post('archive', {code:button.dataset.bountyArchive});
      state.loaded = false;
      await loadBoard(true, state.selectedOrg);
    } catch (error) { window.alert(error.message); }
  }));

  boardPanel?.querySelectorAll('[data-bounty-restore]').forEach(button => button.addEventListener('click', async () => {
    try {
      await post('restore', {code:button.dataset.bountyRestore});
      state.loaded = false;
      await loadBoard(true, state.selectedOrg);
    } catch (error) { window.alert(error.message); }
  }));
}

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'bountyboard') void loadBoard();
});

const path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
if (path === '/bounty' || path === '/bountyboard' || /^\/bounty\/[A-Za-z0-9]{6}$/.test(path)) {
  void loadBoard();
}
