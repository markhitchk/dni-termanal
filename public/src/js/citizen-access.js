const SESSION_URL = '/api/dni/session';
const CITIZEN_ALLOWED_PANELS = new Set(['terminal', 'dashboard', 'documents', 'mail']);
const CITIZEN_RESTRICTED_PANELS = new Set(['ranks', 'services', 'communication', 'sectors', 'admin']);
const CITIZEN_RESTRICTED_PATHS = new Map([
  ['/ranks', 'DNI Ranks'],
  ['/services', 'DNI Services'],
  ['/communication', 'DNI Communication'],
  ['/sectors', 'DNI Sectors'],
  ['/admin', 'DNI Admin']
]);
const CITIZEN_RESTRICTED_COMMANDS = /^(?:ranks?|services?|communication|comms|starcomms|sectors?|admin)(?:\s|$)/i;

let citizenActive = false;
let sessionSnapshot = null;

function normalizePath(value) {
  const clean = String(value || '/').replace(/\/+$/, '');
  return clean || '/';
}

function restrictedMessage(area = 'this DNI system') {
  return `${area} is restricted to DNI members.\nCitizen accounts are limited to CL/NON public, community, recruitment, event, public-document, and Citizen Mail access.`;
}

function showRestricted(area, trigger = null) {
  const options = {
    type: 'denied',
    label: 'ACCESS RESTRICTED',
    title: 'ACCESS RESTRICTED',
    message: restrictedMessage(area),
    meta: 'CITIZEN ACCESS // CL/NON ONLY',
    icon: '×',
    trigger,
    buttonText: 'OK',
    awaitResult: false
  };

  if (window.DNIAlerts?.show) {
    window.DNIAlerts.show(options);
    return;
  }
  window.alert(`ACCESS RESTRICTED\n\n${restrictedMessage(area)}`);
}

function panelArea(panel) {
  return ({
    ranks: 'DNI Ranks',
    services: 'DNI Services',
    communication: 'DNI Communication',
    sectors: 'DNI Sectors',
    admin: 'DNI Admin'
  })[panel] || 'This DNI system';
}

function applyCitizenNavigation() {
  if (!citizenActive) return;
  document.documentElement.dataset.dniAccessClass = 'citizen';
  document.documentElement.dataset.dniCitizen = 'true';

  for (const tab of document.querySelectorAll('.nav-tab[data-panel]')) {
    const panel = String(tab.dataset.panel || '');
    if (!CITIZEN_RESTRICTED_PANELS.has(panel)) continue;
    tab.hidden = true;
    tab.setAttribute('aria-hidden', 'true');
    tab.tabIndex = -1;
  }

  const path = normalizePath(window.location.pathname);
  const restrictedArea = CITIZEN_RESTRICTED_PATHS.get(path);
  if (restrictedArea) {
    history.replaceState({ panel: 'dashboard', citizenRedirect: true }, '', '/dashboard');
    const dashboard = document.querySelector('.nav-tab[data-panel="dashboard"]');
    dashboard?.click();
    queueMicrotask(() => showRestricted(restrictedArea));
  }
}

function installCitizenInterlocks() {
  document.addEventListener('click', event => {
    if (!citizenActive) return;
    const element = event.target instanceof Element ? event.target : null;
    if (!element) return;

    const tab = element.closest('.nav-tab[data-panel]');
    if (tab) {
      const panel = String(tab.dataset.panel || '');
      if (CITIZEN_RESTRICTED_PANELS.has(panel)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showRestricted(panelArea(panel), tab);
        return;
      }
    }

    const link = element.closest('a[href], [data-dni-panel-link]');
    if (!link) return;
    const panel = String(link.dataset?.dniPanelLink || '');
    let area = CITIZEN_RESTRICTED_PANELS.has(panel) ? panelArea(panel) : '';
    if (!area && link instanceof HTMLAnchorElement) {
      try {
        area = CITIZEN_RESTRICTED_PATHS.get(normalizePath(new URL(link.href, window.location.href).pathname)) || '';
      } catch {
      }
    }
    if (!area) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showRestricted(area, link);
  }, true);

  document.addEventListener('keydown', event => {
    if (!citizenActive || event.key !== 'Enter') return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.id !== 'command-input') return;
    const command = String(input.value || '').trim();
    if (!CITIZEN_RESTRICTED_COMMANDS.test(command)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    const area = command.split(/\s+/)[0].toLowerCase();
    const label = area.startsWith('rank') ? 'DNI Ranks'
      : area.startsWith('service') ? 'DNI Services'
      : area === 'sectors' || area === 'sector' ? 'DNI Sectors'
      : area === 'admin' ? 'DNI Admin'
      : 'DNI Communication';
    showRestricted(label, input);
  }, true);

  window.addEventListener('popstate', () => {
    if (!citizenActive) return;
    const area = CITIZEN_RESTRICTED_PATHS.get(normalizePath(window.location.pathname));
    if (!area) return;
    history.replaceState({ panel: 'dashboard', citizenRedirect: true }, '', '/dashboard');
    document.querySelector('.nav-tab[data-panel="dashboard"]')?.click();
    showRestricted(area);
  });
}

async function loadCitizenState() {
  try {
    const response = await fetch(SESSION_URL, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const session = await response.json().catch(() => null);
    if (!response.ok || !session || typeof session !== 'object') return;
    sessionSnapshot = session;
    citizenActive = session.citizen === true || session.accessClass === 'citizen';
    if (citizenActive) applyCitizenNavigation();
    window.dispatchEvent(new CustomEvent('dni:citizen-access', {
      detail: {
        citizen: citizenActive,
        accessClass: session.accessClass || (citizenActive ? 'citizen' : 'member'),
        effectiveClearance: session.effectiveClearance || null,
        allowedPanels: Array.isArray(session.allowedPanels) ? session.allowedPanels : [...CITIZEN_ALLOWED_PANELS]
      }
    }));
  } catch (error) {
    console.warn('DNI Citizen access check failed:', error);
  }
}

installCitizenInterlocks();
void loadCitizenState();

window.DNICitizenAccess = Object.freeze({
  isCitizen: () => citizenActive,
  session: () => sessionSnapshot,
  allowedPanels: () => [...CITIZEN_ALLOWED_PANELS],
  showRestricted
});
