// DNI Operations is one module in the existing DNI Terminal navigation.
import { mountOperations } from './operations-app.js';

const shell = document.querySelector('.terminal-shell');
const tabs = document.querySelector('.nav-tabs');
if (shell && tabs && !document.getElementById('tab-operations')) {
  // Use the same deployment cache key as the shell so mobile browsers do not
  // keep an older Operations stylesheet after a PHP deployment.
  const version = new URL(import.meta.url).searchParams.get('v') || 'local';
  function loadOperationsStyle(path) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    const url = new URL(path, import.meta.url);
    url.searchParams.set('v', version);
    style.href = url.href;
    document.head.append(style);
  }
  loadOperationsStyle('../../css/operations/operations.css');
  loadOperationsStyle('../../css/operations/operations-shell.css');

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
    <header class="dni-module-header dni-operations-header">
      <div><div class="module-kicker">DNI IMPERIAL OPERATIONS</div><h2>DNI Operations</h2>
        <p class="module-subtitle">One command workspace for the Imperial departments.</p></div>
      <span class="dni-state-badge dni-operations-status" role="status" aria-live="polite">VERIFYING ACCESS</span>
    </header>
    <div class="dni-operations-layout">
      <aside class="dni-section-block dni-operations-sidebar" aria-label="Operations departments">
        <label for="dni-operations-department">Department</label>
        <select id="dni-operations-department" aria-label="Select DNI department"></select>
        <nav class="dni-operations-departments" aria-label="Department directory"></nav>
      </aside>
      <div class="dni-operations-main">
        <nav class="dni-operations-subnav" aria-label="Department sections"></nav>
        <div class="dni-operations-content" id="dni-operations-content" aria-live="polite"></div>
      </div>
    </div>`;
  (document.getElementById('panel-ranks') || document.getElementById('panel-dashboard'))?.after(panel);

  // The badge reports the server's authenticated identity, not a URL, rank
  // label, browser storage, or an asserted role. It never authorizes actions.
  const status = panel.querySelector('.dni-operations-status');
  let statusGeneration = 0;
  function setStatus(text, access = '') {
    status.textContent = text;
    status.dataset.access = access;
  }
  function resetStatus(text) {
    ++statusGeneration;
    setStatus(text, 'unavailable');
  }
  async function refreshStatus() {
    const generation = ++statusGeneration;
    setStatus('VERIFYING ACCESS');
    try {
      const response = await fetch('/operations-data.php?resource=session', {
        credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'application/json'}
      });
      const body = await response.json().catch(() => ({}));
      if (generation !== statusGeneration) return;
      if (!response.ok || body.ok !== true) {
        setStatus(response.status === 401 ? 'SIGN-IN REQUIRED' :
          response.status === 403 ? 'ACCESS RESTRICTED' : 'STATUS UNAVAILABLE', 'unavailable');
        return;
      }
      const access = body.access;
      if (!access || typeof access !== 'object' || access.staff !== true) {
        setStatus('STATUS UNAVAILABLE', 'unavailable');
        return;
      }
      const labels = [];
      if (access.owner === true) labels.push('OWNER');
      if (access.administrator === true && access.owner !== true) labels.push('ADMIN');
      if (access.developer === true) labels.push('DEVELOPER');
      setStatus(labels.length ? `${labels.join(' / ')} ACCESS` : 'MEMBER ACCESS',
        access.developer === true ? 'developer' : access.owner === true ? 'owner' : 'member');
    } catch (_) {
      if (generation === statusGeneration) setStatus('STATUS UNAVAILABLE', 'unavailable');
    }
  }
  window.addEventListener('dni:operations-ready', refreshStatus);
  window.addEventListener('dni:authz', event => {
    if (event.detail?.authenticated === false) resetStatus('SIGN-IN REQUIRED');
    else if (event.detail?.authenticated === true) void refreshStatus();
  });
  window.addEventListener('dni:citizen-access', event => {
    if (event.detail?.citizen === true) resetStatus('ACCESS RESTRICTED');
  });
  mountOperations(panel, shell, tab);
  void refreshStatus();
}
