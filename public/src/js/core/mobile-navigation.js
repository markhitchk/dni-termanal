const PHONE_QUERY = window.matchMedia('(max-width: 700px)');
const ADMIN_COMPACT_QUERY = window.matchMedia('(max-width: 1100px)');
const TOUCH_FIRST_QUERY = window.matchMedia('(hover: none) and (pointer: coarse)');
const USER_AGENT = String(navigator.userAgent || '');
const IS_CHROMEOS = /\bCrOS\b/i.test(USER_AGENT);

function isMobileClassDevice() {
  return !IS_CHROMEOS && TOUCH_FIRST_QUERY.matches;
}

function isPhoneLayout() {
  return isMobileClassDevice() && PHONE_QUERY.matches;
}

function isCompactLayout() {
  return isMobileClassDevice() && ADMIN_COMPACT_QUERY.matches;
}

function applyPlatformResponsivePolicy() {
  const root = document.documentElement;
  root.classList.toggle('dni-platform-chromeos', IS_CHROMEOS);
  root.classList.toggle('dni-mobile-class-device', isMobileClassDevice());

  if (!IS_CHROMEOS) return;

  for (const link of document.querySelectorAll('link[rel="stylesheet"][href]')) {
    const href = String(link.getAttribute('href') || '');
    if (/\/(?:mobile-tablet|mobile-large|responsive)\.css(?:[?#]|$)/i.test(href)) {
      link.disabled = true;
      link.setAttribute('data-dni-disabled-for-chromeos', 'true');
    }
  }
}

let lastFocused = null;
let navObserver = null;
let shellObserver = null;

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function visibleTabs() {
  return [...document.querySelectorAll('.nav-tab[data-panel]')].filter(tab => {
    if (!(tab instanceof HTMLButtonElement)) return false;
    if (tab.hidden) return false;
    if (tab.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });
}

function currentPanel() {
  return String(qs('.terminal-shell')?.dataset?.panel || 'terminal');
}

function labelForTab(tab) {
  return String(tab.textContent || tab.dataset.panel || 'DNI').trim() || 'DNI';
}

function ensureMobileBranding() {
  const brand = qs('.dni-mobile-nav-brand');
  if (!(brand instanceof HTMLElement)) return;
  if (qs('.dni-mobile-nav-identity', brand)) return;

  const identity = document.createElement('span');
  identity.className = 'dni-mobile-nav-identity';
  identity.setAttribute('aria-label', 'Dreadnought Imperium');

  const logo = document.createElement('img');
  logo.className = 'dni-mobile-nav-logo';
  logo.src = 'src/images/dni-helmet.webp';
  logo.alt = '';
  logo.setAttribute('aria-hidden', 'true');
  logo.decoding = 'async';

  const siteName = document.createElement('span');
  siteName.className = 'dni-mobile-nav-site-name';

  const nameTop = document.createElement('span');
  nameTop.textContent = 'DREADNOUGHT';
  const nameBottom = document.createElement('span');
  nameBottom.textContent = 'IMPERIUM';

  siteName.append(nameTop, nameBottom);
  identity.append(logo, siteName);
  brand.replaceChildren(identity);
}

function installAdminMobileWorkspaceStyles() {
  let style = qs('#dni-admin-mobile-workspace-layout-style');
  if (!(style instanceof HTMLStyleElement)) {
    style = document.createElement('style');
    style.id = 'dni-admin-mobile-workspace-layout-style';
    style.textContent = `
      @media(max-width:1100px){
        body .dni-admin-panel .dni-admin-mobile-workspace-selector{display:none!important}
        body .dni-admin-panel[data-module="admin"] .dni-admin-worktabs{display:flex!important;flex-wrap:wrap!important;gap:7px!important;margin:12px 0 0!important;padding:0!important;border:0!important;background:transparent!important;grid-template-columns:none!important}
        body .dni-admin-panel[data-module="admin"] .dni-admin-worktab{width:auto!important;min-height:0!important;margin:0!important;border:1px solid #3d3d3d!important;border-bottom:1px solid #3d3d3d!important;background:#0b0b0b!important;color:#aaa!important;padding:9px 12px!important;text-align:center!important;box-shadow:none!important}
        body .dni-admin-panel[data-module="admin"] .dni-admin-worktab:last-child{border-bottom:1px solid #3d3d3d!important}
        body .dni-admin-panel[data-module="admin"] .dni-admin-worktab.is-active{border-color:#7b7b7b!important;background:#171717!important;color:#fff!important;box-shadow:none!important}
        .dni-admin-panel[data-module="admin"]:not([data-admin-mobile-workspace-open="true"]) .dni-admin-worktabs ~ *{display:none!important}
      }
    `;
    document.head.append(style);
  }
  return style;
}

function adminWorkspaceKey(button) {
  if (!(button instanceof HTMLElement)) return '';
  return String(
    button.dataset.adminWorkspace
    || button.dataset.adminCitizensWorkspace
    || button.dataset.documentsAdminTab
    || button.dataset.clearanceAdminTab
    || button.dataset.operationalClassificationTab
    || button.textContent
    || ''
  ).trim();
}

function syncAdminMobileWorkspaceCollapse() {
  installAdminMobileWorkspaceStyles();
  const panel = qs('[data-module="admin"]');
  if (!(panel instanceof HTMLElement)) return;
  const tabs = qs('.dni-admin-worktabs', panel);
  if (!(tabs instanceof HTMLElement)) return;

  if (!Object.prototype.hasOwnProperty.call(panel.dataset, 'adminMobileWorkspaceOpen')) {
    panel.dataset.adminMobileWorkspaceOpen = 'false';
  }
  if (!panel.dataset.adminMobileWorkspaceKey) {
    const active = qs('.dni-admin-worktab.is-active', tabs);
    const key = adminWorkspaceKey(active);
    if (key) panel.dataset.adminMobileWorkspaceKey = key;
  }
}

function handleAdminWorkspaceClick(event) {
  if (!isCompactLayout()) return;
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest('.dni-admin-worktab');
  if (!(button instanceof HTMLButtonElement)) return;
  const tabs = button.closest('.dni-admin-worktabs');
  const panel = button.closest('.dni-admin-panel[data-module="admin"]');
  if (!(tabs instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

  const key = adminWorkspaceKey(button);
  const previousKey = String(panel.dataset.adminMobileWorkspaceKey || '');
  const open = panel.dataset.adminMobileWorkspaceOpen === 'true';
  const sameActive = button.classList.contains('is-active') && (!previousKey || previousKey === key);
  panel.dataset.adminMobileWorkspaceOpen = sameActive && open ? 'false' : 'true';
  if (key) panel.dataset.adminMobileWorkspaceKey = key;
}

function installAdminMobileWorkspaceCollapse() {
  installAdminMobileWorkspaceStyles();
  syncAdminMobileWorkspaceCollapse();
  document.addEventListener('click', handleAdminWorkspaceClick, true);

  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel !== 'admin' || !isCompactLayout()) return;
    const panel = qs('[data-module="admin"]');
    if (!(panel instanceof HTMLElement)) return;
    panel.dataset.adminMobileWorkspaceOpen = 'false';
    syncAdminMobileWorkspaceCollapse();
  });

  const handleAdminViewportChange = () => {
    const panel = qs('[data-module="admin"]');
    if (!(panel instanceof HTMLElement)) return;
    if (isCompactLayout()) panel.dataset.adminMobileWorkspaceOpen = 'false';
    syncAdminMobileWorkspaceCollapse();
  };
  if (typeof ADMIN_COMPACT_QUERY.addEventListener === 'function') {
    ADMIN_COMPACT_QUERY.addEventListener('change', handleAdminViewportChange);
  } else if (typeof ADMIN_COMPACT_QUERY.addListener === 'function') {
    ADMIN_COMPACT_QUERY.addListener(handleAdminViewportChange);
  }
}

function setCurrentTitle(panel = currentPanel()) {
  const title = qs('[data-dni-mobile-nav-title]');
  if (!(title instanceof HTMLElement)) return;
  const tab = qs(`.nav-tab[data-panel="${CSS.escape(panel)}"]`);
  title.textContent = tab instanceof HTMLElement ? labelForTab(tab) : `DNI ${panel}`;
}

function closeDrawer({ restoreFocus = true } = {}) {
  const layer = qs('[data-dni-mobile-drawer-layer]');
  const toggle = qs('[data-dni-mobile-nav-toggle]');
  if (!(layer instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement)) return;

  layer.hidden = true;
  document.documentElement.classList.remove('dni-mobile-drawer-open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open DNI navigation');

  if (restoreFocus && lastFocused instanceof HTMLElement && document.contains(lastFocused)) {
    lastFocused.focus({ preventScroll: true });
  }
  lastFocused = null;
}

function focusableDrawerItems() {
  const drawer = qs('[data-dni-mobile-drawer]');
  if (!(drawer instanceof HTMLElement)) return [];
  return qsa('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])', drawer)
    .filter(node => node instanceof HTMLElement && !node.hidden);
}

function openDrawer() {
  if (!isPhoneLayout()) return;
  const layer = qs('[data-dni-mobile-drawer-layer]');
  const toggle = qs('[data-dni-mobile-nav-toggle]');
  if (!(layer instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement)) return;

  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : toggle;
  syncDrawerItems();
  layer.hidden = false;
  document.documentElement.classList.add('dni-mobile-drawer-open');
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-label', 'Close DNI navigation');

  const active = qs('.dni-mobile-drawer-item[aria-current="page"]', layer);
  const first = active || focusableDrawerItems()[0];
  if (first instanceof HTMLElement) first.focus({ preventScroll: true });
}

function drawerItemForTab(tab) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dni-mobile-drawer-item';
  button.dataset.panel = String(tab.dataset.panel || 'terminal');
  button.textContent = labelForTab(tab);
  button.setAttribute('aria-current', tab.getAttribute('aria-selected') === 'true' ? 'page' : 'false');
  button.addEventListener('click', () => {
    tab.click();
    setCurrentTitle(button.dataset.panel);
    closeDrawer({ restoreFocus: false });
    const toggle = qs('[data-dni-mobile-nav-toggle]');
    if (toggle instanceof HTMLElement) toggle.focus({ preventScroll: true });
  });
  return button;
}

function syncDrawerItems() {
  const items = qs('[data-dni-mobile-drawer-items]');
  if (!(items instanceof HTMLElement)) return;

  const tabs = visibleTabs();
  const fragment = document.createDocumentFragment();
  for (const tab of tabs) fragment.append(drawerItemForTab(tab));
  items.replaceChildren(fragment);
  syncActiveState();
}

function syncActiveState() {
  const panel = currentPanel();
  for (const item of qsa('.dni-mobile-drawer-item[data-panel]')) {
    const active = item.dataset.panel === panel;
    item.setAttribute('aria-current', active ? 'page' : 'false');
  }
  setCurrentTitle(panel);
}

function trapDrawerFocus(event) {
  const layer = qs('[data-dni-mobile-drawer-layer]');
  if (!(layer instanceof HTMLElement) || layer.hidden) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeDrawer();
    return;
  }

  if (event.key !== 'Tab') return;
  const focusable = focusableDrawerItems();
  if (!focusable.length) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function installObservers() {
  const nav = qs('.nav-tabs');
  const shell = qs('.terminal-shell');

  navObserver?.disconnect();
  shellObserver?.disconnect();

  if (nav instanceof HTMLElement) {
    navObserver = new MutationObserver(() => syncDrawerItems());
    navObserver.observe(nav, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'aria-selected', 'data-panel']
    });
  }

  if (shell instanceof HTMLElement) {
    shellObserver = new MutationObserver(() => syncActiveState());
    shellObserver.observe(shell, { attributes: true, attributeFilter: ['data-panel'] });
  }
}

function handleViewportChange() {
  if (!isPhoneLayout()) closeDrawer({ restoreFocus: false });
  syncActiveState();
}

export function installMobileNavigation() {
  applyPlatformResponsivePolicy();
  if (!isMobileClassDevice()) {
    document.documentElement.classList.remove('dni-mobile-nav-ready', 'dni-mobile-drawer-open');
    return false;
  }

  const nav = qs('[data-dni-mobile-nav]');
  const toggle = qs('[data-dni-mobile-nav-toggle]');
  const layer = qs('[data-dni-mobile-drawer-layer]');
  const drawer = qs('[data-dni-mobile-drawer]');
  const backdrop = qs('[data-dni-mobile-drawer-backdrop]');

  if (!(nav instanceof HTMLElement)
      || !(toggle instanceof HTMLButtonElement)
      || !(layer instanceof HTMLElement)
      || !(drawer instanceof HTMLElement)
      || !(backdrop instanceof HTMLButtonElement)) return false;

  ensureMobileBranding();

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') closeDrawer();
    else openDrawer();
  });
  backdrop.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', trapDrawerFocus);
  window.addEventListener('dni:panel', syncActiveState);
  window.addEventListener('dni:authz', syncDrawerItems);
  window.addEventListener('popstate', () => {
    if (!layer.hidden) closeDrawer({ restoreFocus: false });
    syncActiveState();
  });

  if (typeof PHONE_QUERY.addEventListener === 'function') {
    PHONE_QUERY.addEventListener('change', handleViewportChange);
  } else if (typeof PHONE_QUERY.addListener === 'function') {
    PHONE_QUERY.addListener(handleViewportChange);
  }

  syncDrawerItems();
  installObservers();

  nav.hidden = false;
  document.documentElement.classList.add('dni-mobile-nav-ready');
  syncActiveState();
  return true;
}

try {
  applyPlatformResponsivePolicy();
  if (isMobileClassDevice()) installAdminMobileWorkspaceCollapse();
  installMobileNavigation();
} catch (error) {
  console.error('DNI mobile navigation failed to initialize', error);
  document.documentElement.classList.remove('dni-mobile-nav-ready', 'dni-mobile-drawer-open');
}
