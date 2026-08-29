// DNI Admin event hardener.
//
// admin.js renders the control panel repeatedly and historically installed its
// delegated click/submit handlers through the replaceable `onclick` and
// `onsubmit` element properties. A later module, browser integration, or
// re-render could replace those properties and make Sectors & Assets appear
// clickable while none of their controls reached the primary Admin handler.
//
// This module preserves the existing admin.js behavior but moves each freshly
// rendered handler onto durable addEventListener registrations. It also removes
// the previous durable registration before adopting the newest handler, so
// repeated Admin renders do not duplicate mutations.

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

function hardenAfterRender(eventTarget = null) {
  // admin.js assigns the property handlers immediately before firing
  // dni:admin-mounted. Queueing once guarantees any synchronous extension
  // mounting has completed before we adopt the final handlers.
  queueMicrotask(() => hardenAdminPanel(currentAdminPanel(eventTarget)));
}

document.addEventListener('dni:admin-mounted', event => {
  hardenAfterRender(event.target);
});

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') hardenAfterRender();
});

hardenAfterRender();
