// DNI Operations is one module in the existing DNI Terminal navigation.
import { mountOperations } from './operations-app.js';

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
        <nav class="dni-operations-subnav" aria-label="Department sections"></nav>
        <div class="dni-operations-content" id="dni-operations-content" aria-live="polite"></div>
      </div>
    </div>`;
  (document.getElementById('panel-ranks') || document.getElementById('panel-dashboard'))?.after(panel);
  mountOperations(panel, shell, tab);
}
