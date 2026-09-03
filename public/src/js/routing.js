const PANEL_PATHS = Object.freeze({
  terminal: '/terminal',
  dashboard: '/dashboard',
  ranks: '/ranks',
  documents: '/docs',
  services: '/services',
  communication: '/communication',
  sectors: '/sectors',
  mail: '/mail',
  admin: '/admin'
});

let terminalIdentity = 'guest';

function normalizeTerminalIdentity(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'guest';
  const normalized = raw
    .normalize('NFKC')
    .replace(/\s+/g, '_')
    .replace(/[@:/$\\\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N}_.-]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '');
  return (normalized || 'user').slice(0, 32);
}

function applyTerminalIdentity(root = document) {
  for (const prompt of root.querySelectorAll?.('.prompt-admin') || []) {
    prompt.textContent = terminalIdentity;
  }
  if (root.matches?.('.prompt-admin')) root.textContent = terminalIdentity;
}

function setTerminalIdentity(value) {
  terminalIdentity = normalizeTerminalIdentity(value);
  applyTerminalIdentity();
}

function identityFromSession(session) {
  if (!session?.authenticated) return 'guest';
  return session.user?.guild_nick
    || session.user?.guildNick
    || session.profile?.display_name
    || session.user?.username
    || session.user?.global_name
    || session.user?.globalName
    || 'user';
}

export function installTerminalIdentity() {
  setTerminalIdentity('guest');

  const terminalOutput = document.querySelector('#terminal-output');
  if (terminalOutput) {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) applyTerminalIdentity(node);
        }
      }
    });
    observer.observe(terminalOutput, { childList: true, subtree: true });
  }

  fetch('/dashboard-data.php', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(session => setTerminalIdentity(identityFromSession(session)))
    .catch(() => {
      fetch('/api/dni/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      })
        .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
        .then(session => setTerminalIdentity(identityFromSession(session)))
        .catch(() => setTerminalIdentity('guest'));
    });
}

function normalizePath(pathname) {
  const clean = String(pathname || '/').replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

function panelFromPath(pathname) {
  switch (normalizePath(pathname)) {
    case '/':
    case '/terminal': return 'terminal';
    case '/dashboard': return 'dashboard';
    case '/ranks': return 'ranks';
    case '/docs':
    case '/documents': return 'documents';
    case '/services':
    case '/services/dispatch': return 'services';
    case '/communication': return 'communication';
    case '/sectors': return 'sectors';
    case '/mail': return 'mail';
    case '/admin': return 'admin';
    default: return null;
  }
}

function routeForPanel(panel, pathname = window.location.pathname) {
  const currentPath = normalizePath(pathname);
  if (panel === 'services' && currentPath === '/services/dispatch') return '/services/dispatch';
  return PANEL_PATHS[panel] || '/terminal';
}

function tabForPanel(panel) {
  return document.querySelector(`.nav-tab[data-panel="${panel}"]`);
}

function currentPanel(shell) {
  const panel = String(shell?.dataset?.panel || 'terminal');
  return Object.hasOwn(PANEL_PATHS, panel) ? panel : 'terminal';
}

function terminalAccessTime() {
  return new Date().toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
}

function restoreTerminalOutputIfBlank(shell) {
  if (currentPanel(shell) !== 'terminal') return false;

  const output = document.querySelector('#terminal-output');
  if (!(output instanceof HTMLElement)) return false;
  if (output.childElementCount > 0 || output.textContent.trim()) return false;

  const lines = [
    ['-------------------- DNI TERMINAL v1.0 --------------------', 'separator'],
    ['DREADNOUGHT IMPERIUM // DATABASE NETWORK', ''],
    ['COMMAND NETWORK ........ ONLINE', 'dni-terminal-status-ok'],
    ['DATABASE LINK .......... ESTABLISHED', 'dni-terminal-status-ok'],
    ['SECURE SESSION ......... ACTIVE', 'dni-terminal-status-ok'],
    [`ACCESS TIME // ${terminalAccessTime()}`, 'muted'],
    ['COMMANDS // HELP · ACCESS 173 · MAIL', 'dni-terminal-command-line'],
    ['------------------------- READY -------------------------', 'separator']
  ];

  const fragment = document.createDocumentFragment();
  for (const [text, className] of lines) {
    const line = document.createElement('div');
    line.textContent = text;
    if (className) line.className = className;
    fragment.append(line);
  }
  output.replaceChildren(fragment);
  applyTerminalIdentity(output);

  const terminalWindow = document.querySelector('#terminal-window');
  if (terminalWindow instanceof HTMLElement) terminalWindow.scrollTop = terminalWindow.scrollHeight;

  window.dispatchEvent(new CustomEvent('dni:terminal-restored', {
    detail: { reason: 'empty-output-return', accessTime: Date.now() }
  }));
  return true;
}

function scheduleTerminalRestore(shell) {
  window.requestAnimationFrame(() => restoreTerminalOutputIfBlank(shell));
}

function applyUntabbedPanel(shell, panel) {
  shell.dataset.panel = panel;
  for (const tab of document.querySelectorAll('.nav-tab')) {
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
  }
  window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel } }));
}

export function installDniRouting() {
  const shell = document.querySelector('.terminal-shell');
  if (!shell) return;

  let suppressHistory = false;

  const applyPanel = panel => {
    if (panel === 'mail') {
      suppressHistory = true;
      applyUntabbedPanel(shell, panel);
      suppressHistory = false;
      return;
    }

    const tab = tabForPanel(panel);
    if (!tab) return;
    suppressHistory = true;
    tab.click();
    suppressHistory = false;
  };

  const initialPath = normalizePath(window.location.pathname);
  const initialPanel = panelFromPath(initialPath) || 'terminal';
  if (currentPanel(shell) !== initialPanel) applyPanel(initialPanel);

  const initialTarget = initialPath === '/'
    ? '/'
    : routeForPanel(initialPanel, initialPath);
  history.replaceState({ panel: initialPanel }, '', initialTarget + window.location.search + window.location.hash);

  const observer = new MutationObserver(() => {
    if (suppressHistory) return;
    const panel = currentPanel(shell);
    const target = routeForPanel(panel);
    if (!target || normalizePath(window.location.pathname) === target) return;
    history.pushState({ panel }, '', target);
  });

  observer.observe(shell, { attributes: true, attributeFilter: ['data-panel'] });

  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel === 'terminal') scheduleTerminalRestore(shell);
  });

  window.addEventListener('popstate', () => {
    const panel = panelFromPath(window.location.pathname) || 'terminal';
    if (currentPanel(shell) === panel) {
      if (panel === 'terminal') scheduleTerminalRestore(shell);
      return;
    }
    applyPanel(panel);
  });

  window.addEventListener('pageshow', event => {
    if (event.persisted && currentPanel(shell) === 'terminal') scheduleTerminalRestore(shell);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentPanel(shell) === 'terminal') scheduleTerminalRestore(shell);
  });
}

installTerminalIdentity();
installDniRouting();
