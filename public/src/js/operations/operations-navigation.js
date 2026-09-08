// DNI Operations: the first, navigation-only integration step.
// Later workflows attach to this panel; no mock transactions or permissions.
const DEPARTMENTS = Object.freeze([
  { id: 'army', name: 'Imperial Army Corps', purpose: 'Ground forces and organized land operations.' },
  { id: 'navy', name: 'Imperial Navy Corps', purpose: 'Fleet operations and naval command.' },
  { id: 'isb', name: 'Imperial Security Bureau', purpose: 'Imperial security, investigations, and authorized intelligence operations.' },
  { id: 'logistics', name: 'Imperial Logistics Corps', purpose: 'Supply, transport, and operational sustainment.' },
  { id: 'engineering', name: 'Imperial Engineering Corps', purpose: 'Engineering support, maintenance, and technical operations.' }
]);

const shell = document.querySelector('.terminal-shell');
const tabs = document.querySelector('.nav-tabs');
if (shell && tabs && !document.getElementById('tab-operations')) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('../../css/operations/operations.css', import.meta.url).href;
  document.head.append(style);

  const tab = document.createElement('button');
  tab.className = 'nav-tab';
  tab.id = 'tab-operations';
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');
  tab.setAttribute('aria-controls', 'panel-operations');
  tab.setAttribute('aria-hidden', 'true');
  tab.tabIndex = -1;
  tab.dataset.panel = 'operations';
  tab.hidden = true;
  tab.textContent = 'DNI Operations';
  (document.getElementById('tab-ranks') || document.getElementById('tab-dashboard'))?.after(tab);

  const panel = document.createElement('section');
  panel.className = 'module-panel dni-module-panel dni-operations-panel';
  panel.id = 'panel-operations';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'tab-operations');
  panel.dataset.module = 'operations';
  panel.hidden = true;
  panel.innerHTML = `
    <header class="dni-operations-header">
      <div><div class="module-kicker">DNI IMPERIAL OPERATIONS</div><h2>DNI Operations</h2>
        <p class="module-subtitle">One command workspace for the Imperial departments.</p></div>
      <span class="dni-operations-status">MEMBER ACCESS</span>
    </header>
    <div class="dni-operations-layout">
      <aside class="dni-operations-sidebar" aria-label="Operations departments">
        <label for="dni-operations-department">Department</label>
        <select id="dni-operations-department" aria-label="Select DNI department"></select>
        <nav class="dni-operations-departments" aria-label="Department directory"></nav>
      </aside>
      <div class="dni-operations-main">
        <nav class="dni-operations-subnav" aria-label="Department sections">
          <button type="button" data-operations-view="overview" aria-pressed="true">Overview</button>
          <button type="button" data-operations-view="directory" aria-pressed="false">Directory</button>
        </nav>
        <div class="dni-operations-content" id="dni-operations-content" aria-live="polite"></div>
      </div>
    </div>`;
  (document.getElementById('panel-ranks') || document.getElementById('panel-dashboard'))?.after(panel);

  const select = panel.querySelector('#dni-operations-department');
  const directory = panel.querySelector('.dni-operations-departments');
  const content = panel.querySelector('#dni-operations-content');
  const viewButtons = [...panel.querySelectorAll('[data-operations-view]')];
  let department = DEPARTMENTS[0];
  let view = 'overview';
  let member = false;
  let authorized = false;

  for (const entry of DEPARTMENTS) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    select.append(option);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.department = entry.id;
    button.textContent = entry.name;
    button.addEventListener('click', () => changeDepartment(entry.id));
    directory.append(button);
  }

  function render() {
    select.value = department.id;
    for (const button of directory.querySelectorAll('button')) {
      button.setAttribute('aria-current', button.dataset.department === department.id ? 'true' : 'false');
    }
    for (const button of viewButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.operationsView === view));
    }
    content.replaceChildren();
    const kicker = document.createElement('div');
    kicker.className = 'module-kicker';
    kicker.textContent = department.name;
    const title = document.createElement('h3');
    title.textContent = view === 'directory' ? 'Department directory' : department.name;
    const description = document.createElement('p');
    description.textContent = department.purpose;
    content.append(kicker, title, description);
    if (view === 'directory') {
      const note = document.createElement('p');
      note.textContent = 'Use the existing, authorization-controlled DNI personnel and document systems. Department leadership, subdivisions, and training records will be connected in the next implementation step.';
      const links = document.createElement('div');
      links.className = 'dni-operations-links';
      for (const [label, href] of [['DNI Ranks', '/ranks'], ['DNI Documents', '/documents']]) {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = label;
        links.append(link);
      }
      content.append(note, links);
    } else {
      const note = document.createElement('p');
      note.className = 'dni-operations-note';
      note.textContent = 'Department selection and navigation are active. Operational records and management controls will be added as separate, permission-checked implementations.';
      content.append(note);
    }
  }

  function changeDepartment(id) {
    const next = DEPARTMENTS.find(entry => entry.id === id);
    if (!next) return;
    department = next;
    render();
  }

  select.addEventListener('change', () => changeDepartment(select.value));
  for (const button of viewButtons) {
    button.addEventListener('click', () => {
      view = button.dataset.operationsView;
      render();
    });
  }

  function enforceAccess(session) {
    authorized = session?.authenticated === true && session?.citizen !== true && session?.accessClass !== 'citizen';
    member = session?.authenticated === true;
    tab.hidden = !authorized;
    tab.setAttribute('aria-hidden', String(!authorized));
    if (!authorized) {
      panel.hidden = true;
      if (window.location.pathname.replace(/\/+$/, '') === '/operations') {
        window.location.replace(member ? '/dashboard' : '/terminal');
      }
    }
  }

  function syncPanel() {
    const active = shell.dataset.panel === 'operations' && authorized;
    panel.hidden = !active;
    tab.setAttribute('aria-selected', String(active));
    if (!active && shell.dataset.panel !== 'operations') tab.tabIndex = -1;
    if (!authorized && shell.dataset.panel === 'operations') {
      queueMicrotask(() => document.getElementById('tab-terminal')?.click());
    }
  }

  window.addEventListener('dni:panel', syncPanel);
  window.addEventListener('dni:authz', event => {
    if (event.detail?.status) {
      // The dedicated dashboard response is still authoritative for Citizen access.
      if (event.detail.authenticated !== true) enforceAccess({ authenticated: false });
    }
  });
  window.addEventListener('dni:citizen-access', event => {
    if (event.detail?.citizen === true) enforceAccess({ authenticated: true, citizen: true });
  });

  render();
  try {
    const response = await fetch('/dashboard-data.php', {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
    });
    const session = await response.json().catch(() => null);
    enforceAccess(response.ok ? session : { authenticated: false });
  } catch {
    enforceAccess({ authenticated: false });
  }
  syncPanel();
}
