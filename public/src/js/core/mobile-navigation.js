const PHONE_QUERY = window.matchMedia('(max-width: 700px)');

let lastFocused = null;
let navObserver = null;
let shellObserver = null;
let authObserver = null;

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function visibleTabs() {
  return qsa('.nav-tab[data-panel]').filter(tab => {
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
  if (!PHONE_QUERY.matches) return;
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
  authObserver?.disconnect();

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

  authObserver = new MutationObserver(() => syncDrawerItems());
  authObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-dni-auth']
  });
}

function handleViewportChange() {
  if (!PHONE_QUERY.matches) closeDrawer({ restoreFocus: false });
  syncActiveState();
}

export function installMobileNavigation() {
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

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') closeDrawer();
    else openDrawer();
  });
  backdrop.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', trapDrawerFocus);
  window.addEventListener('dni:panel', syncActiveState);
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
  installMobileNavigation();
} catch (error) {
  console.error('DNI mobile navigation failed to initialize', error);
  document.documentElement.classList.remove('dni-mobile-nav-ready', 'dni-mobile-drawer-open');
}
