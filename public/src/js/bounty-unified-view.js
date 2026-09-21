const API = '/bounty-data.php';
const panel = document.querySelector('[data-module="bountyboard"]');

let session = null;
let records = new Map();
let refreshTimer = 0;
let refreshing = false;

async function readJson(url) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {Accept: 'application/json'}
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function currentRecordCode() {
  const match = String(window.location.pathname || '').match(/^\/bounty\/([A-Za-z0-9]{6})\/?$/);
  return match ? match[1].toUpperCase() : '';
}

function setTextIfChanged(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function addAccountClass(article) {
  if (!(article instanceof HTMLElement)) return;
  if (article.querySelector('[data-dni-account-class]')) return;

  const code = String(article.dataset.bountyCode || '').toUpperCase();
  const classification = String(records.get(code)?.issuerClassification || '').trim();
  if (!classification) return;

  const list = article.querySelector('dl');
  if (!(list instanceof HTMLElement)) return;

  const row = document.createElement('div');
  row.dataset.dniAccountClass = 'true';
  const term = document.createElement('dt');
  term.textContent = 'ACCOUNT CLASS';
  const value = document.createElement('dd');
  value.textContent = classification;
  row.append(term, value);

  const representative = [...list.querySelectorAll(':scope > div')]
    .find(node => node.querySelector('dt')?.textContent?.trim() === 'REPRESENTATIVE');
  if (representative?.nextSibling) list.insertBefore(row, representative.nextSibling);
  else list.append(row);
}

function enhanceComposer() {
  const cap = panel?.querySelector('.dni-bounty-composer-cap');
  if (cap && session?.authenticated && session?.user?.classification) {
    const value = cap.querySelector('b');
    const name = String(session.user.name || 'AUTHORIZED USER');
    setTextIfChanged(value, `${name} · ${session.user.classification}`);
  }

  const composer = panel?.querySelector('#bounty-composer');
  if (!(composer instanceof HTMLElement) || !session?.authenticated) return;

  if (!composer.querySelector('[data-dni-bounty-system-note]')) {
    const note = document.createElement('p');
    note.dataset.dniBountySystemNote = 'true';
    note.className = 'dni-bounty-system-note';
    note.textContent = 'Every post is issued from this connected DNI account and receives a DNI Mail system receipt with its record ID.';
    cap?.insertAdjacentElement('afterend', note);
  }

  const memberships = new Map((session.memberships || []).map(item => [
    String(item.organization_id),
    String(item.member_role || '').trim()
  ]));
  composer.querySelectorAll('select[name="organizationId"] option[value]').forEach(option => {
    const role = memberships.get(String(option.value));
    if (!role || option.dataset.dniOrgRoleApplied === 'true') return;
    option.textContent = `${option.textContent} · ${role}`;
    option.dataset.dniOrgRoleApplied = 'true';
  });

  const orgHelp = composer.querySelector('.dni-bounty-org-add > p');
  setTextIfChanged(
    orgHelp,
    'DNI account classification is derived from the connected Discord identity. The organization position field describes your role inside that organization and does not change your DNI classification.'
  );
}

function enforceUnifiedBoardView() {
  if (!panel) return;

  panel.querySelectorAll('.dni-bounty-altboards').forEach(node => node.remove());

  const label = panel.querySelector('.dni-bounty-board-tools strong');
  setTextIfChanged(label, 'MAIN BOUNTY BOARD');

  const heading = panel.querySelector('.dni-bounty-main-header h2');
  const description = heading?.parentElement?.querySelector('p');
  if (heading?.textContent?.trim() === 'Main Bounty Board' && description) {
    setTextIfChanged(
      description,
      'One shared contract network for DNI members, Citizens, Allies, Merchants, outside Citizen accounts, organizations, and independent issuers. Organization affiliation stays attached to each record; organizations do not create separate boards.'
    );
  }

  enhanceComposer();
  panel.querySelectorAll('.dni-wanted-poster[data-bounty-code]').forEach(addAccountClass);
}

async function refreshIdentityData() {
  if (!panel || refreshing) return;
  refreshing = true;
  try {
    const [sessionPayload, boardPayload] = await Promise.all([
      readJson(`${API}?action=session`),
      readJson(`${API}?action=board`)
    ]);
    if (sessionPayload?.ok) session = sessionPayload;
    if (Array.isArray(boardPayload?.bounties)) {
      records = new Map(boardPayload.bounties.map(item => [String(item.code || '').toUpperCase(), item]));
    }

    const detailCode = currentRecordCode();
    if (detailCode && !records.has(detailCode)) {
      const detailPayload = await readJson(`${API}?action=detail&code=${encodeURIComponent(detailCode)}`);
      if (detailPayload?.bounty) records.set(detailCode, detailPayload.bounty);
    }
    enforceUnifiedBoardView();
  } finally {
    refreshing = false;
  }
}

function scheduleRefresh() {
  enforceUnifiedBoardView();
  window.clearTimeout(refreshTimer);
  const missingRecord = [...(panel?.querySelectorAll('.dni-wanted-poster[data-bounty-code]') || [])]
    .some(article => !records.has(String(article.dataset.bountyCode || '').toUpperCase()));
  if (!missingRecord) return;
  refreshTimer = window.setTimeout(() => void refreshIdentityData(), 80);
}

if (panel) {
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      scheduleRefresh();
    });
  });
  observer.observe(panel, {childList:true, subtree:true});
  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel === 'bountyboard') void refreshIdentityData();
  });
  void refreshIdentityData();
}
