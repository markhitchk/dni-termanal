import { DNI_RANK_BRANCHES, DNI_PAYGRADE_ORDER, flattenDniRanks, paygradeClass } from './ranks-data.js';

const panel = document.querySelector('#panel-ranks');
const allRanks = flattenDniRanks();
const state = { branch: 'all', paygradeClass: 'ALL', query: '', view: 'hierarchy' };

function ensureStylesheet() {
  if (document.querySelector('link[data-dni-ranks-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `dist/ranks.css?v=${document.querySelector('script[src*="dist/app.js"]')?.src.match(/[?&]v=([^&]+)/)?.[1] || 'local'}`;
  link.dataset.dniRanksStyle = 'true';
  document.head.append(link);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesQuery(item, query) {
  if (!query) return true;
  return [item.paygrade, item.code, item.name, item.description, item.branch, item.group]
    .some(value => normalize(value).includes(query));
}

function filteredRanks() {
  const query = normalize(state.query);
  return allRanks.filter(item => {
    if (state.branch !== 'all' && item.branchId !== state.branch) return false;
    if (state.paygradeClass !== 'ALL' && paygradeClass(item.paygrade) !== state.paygradeClass) return false;
    return matchesQuery(item, query);
  });
}

function rankCard(item) {
  const details = document.createElement('details');
  details.className = `rank-card rank-class-${paygradeClass(item.paygrade).toLowerCase()}`;
  const summary = document.createElement('summary');
  summary.innerHTML = '<span class="rank-paygrade"></span><span class="rank-code"></span><span class="rank-name"></span><span class="rank-expand" aria-hidden="true">+</span>';
  summary.querySelector('.rank-paygrade').textContent = item.paygrade;
  summary.querySelector('.rank-code').textContent = item.code;
  summary.querySelector('.rank-name').textContent = item.name;
  const body = document.createElement('div');
  body.className = 'rank-detail';
  const responsibility = item.description || 'No additional command responsibility is listed for this rank.';
  body.innerHTML = '<div><b>Branch</b><span></span></div><div><b>Category</b><span></span></div><div><b>Paygrade</b><span></span></div><div><b>Abbreviation</b><span></span></div><p></p>';
  const spans = body.querySelectorAll('span');
  spans[0].textContent = item.branch;
  spans[1].textContent = item.group;
  spans[2].textContent = item.paygrade;
  spans[3].textContent = item.code;
  body.querySelector('p').textContent = responsibility;
  details.append(summary, body);
  return details;
}

function renderHierarchy(results) {
  const host = panel.querySelector('[data-ranks-results]');
  host.replaceChildren();
  const visibleBranchIds = state.branch === 'all' ? DNI_RANK_BRANCHES.map(branch => branch.id) : [state.branch];
  for (const branchId of visibleBranchIds) {
    const branch = DNI_RANK_BRANCHES.find(item => item.id === branchId);
    if (!branch) continue;
    const branchResults = results.filter(item => item.branchId === branch.id);
    if (!branchResults.length) continue;
    const section = document.createElement('section');
    section.className = 'rank-branch-section';
    const header = document.createElement('header');
    header.className = 'rank-branch-header';
    header.innerHTML = '<div><span>DNI BRANCH</span><h3></h3></div><b></b>';
    header.querySelector('h3').textContent = branch.name;
    header.querySelector('b').textContent = `${branchResults.length} RANKS`;
    section.append(header);

    for (const groupDef of branch.groups) {
      const groupResults = branchResults.filter(item => item.group === groupDef.name);
      if (!groupResults.length) continue;
      const groupEl = document.createElement('section');
      groupEl.className = 'rank-group';
      const title = document.createElement('h4');
      title.textContent = groupDef.name;
      const list = document.createElement('div');
      list.className = 'rank-list';
      groupResults.forEach(item => list.append(rankCard(item)));
      groupEl.append(title, list);
      section.append(groupEl);
    }
    host.append(section);
  }
  if (!host.children.length) {
    host.innerHTML = '<div class="ranks-empty"><strong>NO MATCHING RANKS</strong><span>Change the branch, paygrade filter, or search text.</span></div>';
  }
}

function rankAt(branchId, paygrade, results) {
  return results.find(item => item.branchId === branchId && item.paygrade === paygrade) || null;
}

function renderMatrix(results) {
  const host = panel.querySelector('[data-ranks-results]');
  host.replaceChildren();
  const branches = state.branch === 'all' ? DNI_RANK_BRANCHES : DNI_RANK_BRANCHES.filter(branch => branch.id === state.branch);
  const includedPaygrades = DNI_PAYGRADE_ORDER.filter(paygrade => {
    if (state.paygradeClass !== 'ALL' && paygradeClass(paygrade) !== state.paygradeClass) return false;
    return results.some(item => item.paygrade === paygrade);
  });
  if (!includedPaygrades.length) {
    host.innerHTML = '<div class="ranks-empty"><strong>NO MATRIX RESULTS</strong><span>Change the filters or search text.</span></div>';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'rank-matrix-wrap';
  const table = document.createElement('table');
  table.className = 'rank-matrix';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const paygradeHead = document.createElement('th');
  paygradeHead.scope = 'col';
  paygradeHead.textContent = 'PAYGRADE';
  headRow.append(paygradeHead);
  branches.forEach(branch => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = branch.shortName;
    th.title = branch.name;
    headRow.append(th);
  });
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  includedPaygrades.forEach(paygrade => {
    const row = document.createElement('tr');
    const grade = document.createElement('th');
    grade.scope = 'row';
    grade.textContent = paygrade;
    row.append(grade);
    branches.forEach(branch => {
      const td = document.createElement('td');
      const item = rankAt(branch.id, paygrade, results);
      if (item) {
        const title = document.createElement('strong');
        title.textContent = item.name;
        const code = document.createElement('span');
        code.textContent = item.code;
        td.append(title, code);
        if (item.description) td.title = item.description;
      } else {
        td.className = 'rank-matrix-empty';
        td.textContent = '—';
      }
      row.append(td);
    });
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrap.append(table);
  host.append(wrap);
}

function updateActiveControls() {
  panel.querySelectorAll('[data-rank-branch]').forEach(button => {
    const active = button.dataset.rankBranch === state.branch;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  panel.querySelectorAll('[data-rank-class]').forEach(button => {
    const active = button.dataset.rankClass === state.paygradeClass;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  panel.querySelectorAll('[data-rank-view]').forEach(button => {
    const active = button.dataset.rankView === state.view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function render() {
  const results = filteredRanks();
  panel.querySelector('[data-rank-count]').textContent = `${results.length} / ${allRanks.length}`;
  panel.querySelector('[data-rank-status]').textContent = state.query || state.branch !== 'all' || state.paygradeClass !== 'ALL'
    ? 'FILTERED DIRECTORY'
    : 'FULL DIRECTORY';
  updateActiveControls();
  if (state.view === 'matrix') renderMatrix(results);
  else renderHierarchy(results);
}

function resetFilters() {
  state.branch = 'all';
  state.paygradeClass = 'ALL';
  state.query = '';
  const search = panel.querySelector('#ranks-search');
  if (search) search.value = '';
  render();
}

function buildUi() {
  panel.innerHTML = `
    <header class="ranks-header">
      <div>
        <div class="module-kicker">DNI PERSONNEL CLASSIFICATION</div>
        <h2 id="ranks-title">DNI Ranks</h2>
        <p class="module-subtitle">Official Dreadnought Imperium rank directory. Browse hierarchy, command responsibilities, paygrade equivalents, and branch-specific titles.</p>
      </div>
      <div class="ranks-header-status"><span data-rank-status>FULL DIRECTORY</span><strong data-rank-count>${allRanks.length}</strong><small>VISIBLE / TOTAL</small></div>
    </header>
    <section class="ranks-toolbar" aria-label="Rank directory controls">
      <label class="ranks-search" for="ranks-search"><span>SEARCH DIRECTORY</span><input id="ranks-search" type="search" autocomplete="off" placeholder="Rank, paygrade, code, responsibility…"></label>
      <div class="ranks-view-toggle" aria-label="Rank view">
        <button type="button" data-rank-view="hierarchy" aria-pressed="true">Hierarchy</button>
        <button type="button" data-rank-view="matrix" aria-pressed="false">Matrix</button>
      </div>
      <button class="ranks-reset" type="button" data-ranks-reset>Reset</button>
    </section>
    <section class="ranks-filter-block" aria-label="Branch filter">
      <span class="ranks-filter-label">BRANCH</span>
      <div class="ranks-chip-row ranks-branches">
        <button type="button" data-rank-branch="all" aria-pressed="true">All</button>
        ${DNI_RANK_BRANCHES.map(branch => `<button type="button" data-rank-branch="${branch.id}" aria-pressed="false">${branch.name}</button>`).join('')}
      </div>
    </section>
    <section class="ranks-filter-block" aria-label="Paygrade class filter">
      <span class="ranks-filter-label">PAYGRADE CLASS</span>
      <div class="ranks-chip-row ranks-paygrades">
        <button type="button" data-rank-class="ALL" aria-pressed="true">All</button>
        <button type="button" data-rank-class="HC" aria-pressed="false">HC · High Command</button>
        <button type="button" data-rank-class="O" aria-pressed="false">O · Officers</button>
        <button type="button" data-rank-class="W" aria-pressed="false">W · Warrant / Specialist</button>
        <button type="button" data-rank-class="E" aria-pressed="false">E · Enlisted</button>
      </div>
    </section>
    <div class="ranks-legend"><span><i class="hc"></i>HC</span><span><i class="officer"></i>OFFICER</span><span><i class="warrant"></i>WARRANT / SPECIALIST</span><span><i class="enlisted"></i>ENLISTED</span></div>
    <div class="ranks-results" data-ranks-results aria-live="polite"></div>
  `;

  panel.querySelector('#ranks-search').addEventListener('input', event => {
    state.query = event.target.value;
    render();
  });
  panel.querySelectorAll('[data-rank-branch]').forEach(button => button.addEventListener('click', () => {
    state.branch = button.dataset.rankBranch;
    render();
  }));
  panel.querySelectorAll('[data-rank-class]').forEach(button => button.addEventListener('click', () => {
    state.paygradeClass = button.dataset.rankClass;
    render();
  }));
  panel.querySelectorAll('[data-rank-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.rankView;
    render();
  }));
  panel.querySelector('[data-ranks-reset]').addEventListener('click', resetFilters);
  render();
}

if (panel) {
  ensureStylesheet();
  buildUi();
}

export { allRanks as DNI_RANKS };
