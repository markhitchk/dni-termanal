const PANEL_PATHS = Object.freeze({
  terminal: '/terminal',
  dashboard: '/dashboard',
  services: '/services',
  communication: '/communication',
  sectors: '/sectors'
});

function normalizePath(pathname) {
  const clean = String(pathname || '/').replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

function panelFromPath(pathname) {
  switch (normalizePath(pathname)) {
    case '/':
    case '/terminal': return 'terminal';
    case '/dashboard': return 'dashboard';
    case '/services': return 'services';
    case '/communication': return 'communication';
    case '/sectors': return 'sectors';
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

installDniRouting();
