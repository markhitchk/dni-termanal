// DNI Admin workspace/control hardener.
//
// The main Admin UI owns all actual workspace rendering and mutations. This
// helper keeps those delegated handlers durable across re-renders and provides
// a capture-phase fallback for mobile browsers where the normal workspace
// click listener can be lost or skipped. It intentionally does not create a
// second Sectors & Assets UI; the canonical workspaces remain in admin.js.

const hardenedPanels = new WeakMap();

function hardenAdminPanel(panel) {
  if (!(panel instanceof HTMLElement)) return;

  const previous = hardenedPanels.get(panel) || { click: null, submit: null };
  const nextClick = typeof panel.onclick === 'function' ? panel.onclick : null;
  const nextSubmit = typeof panel.onsubmit === 'function' ? panel.onsubmit : null;

  if (nextClick && nextClick !== previous.click) {
    if (previous.click) panel.removeEventListener('click', previous.click);
    panel.onclick = null;
    panel.addEventListener('click', nextClick);
    previous.click = nextClick;
  }

  if (nextSubmit && nextSubmit !== previous.submit) {
    if (previous.submit) panel.removeEventListener('submit', previous.submit);
    panel.onsubmit = null;
    panel.addEventListener('submit', nextSubmit);
    previous.submit = nextSubmit;
  }

  hardenedPanels.set(panel, previous);
  panel.dataset.adminControlsHardened = '1';
}

function currentAdminPanel(eventTarget = null) {
  if (eventTarget instanceof Element) {
    const direct = eventTarget.closest('[data-module="admin"]');
    if (direct) return direct;
  }
  return document.querySelector('[data-module="admin"]');
}

function removeLegacyPrimaryAction(panel) {
  if (!(panel instanceof HTMLElement)) return;
  // v1 briefly injected a redundant MANAGE SECTORS & ASSETS button. The
  // canonical SECTORS & ASSETS workspace tab is the real control and should be
  // the only entry point inside the Admin workspace selector.
  panel.querySelector('[data-admin-primary-actions]')?.remove();
}

function primaryClickHandler(panel) {
  if (!(panel instanceof HTMLElement)) return null;
  const durable = hardenedPanels.get(panel)?.click;
  if (typeof durable === 'function') return durable;
  return typeof panel.onclick === 'function' ? panel.onclick : null;
}

function routeWorkspaceImmediately(event) {
  const workspaceButton = event.target instanceof Element
    ? event.target.closest('[data-admin-workspace]')
    : null;
  if (!(workspaceButton instanceof HTMLButtonElement)) return;

  const panel = workspaceButton.closest('[data-module="admin"]');
  if (!(panel instanceof HTMLElement)) return;

  // Run the canonical admin.js workspace handler during capture. The same
  // event is still allowed to continue normally so Clearance/Operational
  // extensions receive the click and deactivate themselves when returning to
  // USERS, SECTORS, or SYSTEM. A second canonical render is harmless if the
  // normal panel listener also fires; this fallback guarantees the first one.
  const handler = primaryClickHandler(panel);
  if (typeof handler === 'function') {
    void handler.call(panel, event);
    panel.dataset.adminWorkspaceRouted = workspaceButton.dataset.adminWorkspace || '';
  }
}

function hardenAfterRender(eventTarget = null) {
  // admin.js assigns property handlers immediately before firing
  // dni:admin-mounted. Queueing once lets synchronous extension mounting finish
  // before the newest handlers are adopted.
  queueMicrotask(() => {
    const panel = currentAdminPanel(eventTarget);
    hardenAdminPanel(panel);
    removeLegacyPrimaryAction(panel);
  });
}

// Capture normal Admin workspace navigation before any mobile/bubbling handler
// can swallow it. This fixes USERS & PERSONNEL / SECTORS & ASSETS / SYSTEM.
document.addEventListener('click', routeWorkspaceImmediately, true);

document.addEventListener('dni:admin-mounted', event => {
  hardenAfterRender(event.target);
});

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') hardenAfterRender();
});

hardenAfterRender();
