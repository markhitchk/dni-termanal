const PANEL_PATHS = Object.freeze({
  terminal: '/terminal',
  dashboard: '/dashboard',
  ranks: '/ranks',
  documents: '/documents',
  services: '/services',
  communication: '/communication',
  sectors: '/sectors',
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
    case '/documents': return 'documents';
    case '/services': return 'services';
    case '/communication': return 'communication';
    case '/sectors': return 'sectors';
    case '/admin': return 'admin';
    default: return null;
  }
}

function tabForPanel(panel) {
  return document.querySelector(`.nav-tab[data-panel="${panel}"]`);
}

function currentPanel(shell) {
  const panel = String(shell?.dataset?.panel || 'terminal');
  return Object.hasOwn(PANEL_PATHS, panel) ? panel : 'terminal';
}

export function installDniRouting() {
  const shell = document.querySelector('.terminal-shell');
  if (!shell) return;

  let suppressHistory = false;

  const applyPanel = panel => {
    const tab = tabForPanel(panel);
    if (!tab) return;
    suppressHistory = true;
    tab.click();
    suppressHistory = false;
  };

  const initialPanel = panelFromPath(window.location.pathname) || 'terminal';
  if (currentPanel(shell) !== initialPanel) applyPanel(initialPanel);

  const initialTarget = normalizePath(window.location.pathname) === '/'
    ? '/'
    : PANEL_PATHS[initialPanel];
  history.replaceState({ panel: initialPanel }, '', initialTarget + window.location.search + window.location.hash);

  const observer = new MutationObserver(() => {
    if (suppressHistory) return;
    const panel = currentPanel(shell);
    const target = PANEL_PATHS[panel];
    if (!target || normalizePath(window.location.pathname) === target) return;
    history.pushState({ panel }, '', target);
  });

  observer.observe(shell, { attributes: true, attributeFilter: ['data-panel'] });

  window.addEventListener('popstate', () => {
    const panel = panelFromPath(window.location.pathname) || 'terminal';
    if (currentPanel(shell) === panel) return;
    applyPanel(panel);
  });
}

installTerminalIdentity();
installDniRouting();
