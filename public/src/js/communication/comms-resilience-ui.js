import { getCommsSnapshot, refreshComms } from './comms-provider.js';

const PANEL_SELECTOR = '[data-module="communication"]';
const STYLE_ID = 'dni-comms-resilience-style';
let retryTimer = null;
let renderTimer = null;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .comms-link-health{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
    .comms-link-health em{font-style:normal;font-weight:700;letter-spacing:.7px}
    .comms-link-health::before{content:"";width:6px;height:6px;border-radius:50%;background:#747474;box-shadow:none}
    .comms-link-health[data-state="online"]::before{background:var(--green,#57c53a);box-shadow:0 0 7px rgba(87,197,58,.45)}
    .comms-link-health[data-state="standby"]::before{background:#6f8794;box-shadow:0 0 5px rgba(111,135,148,.25)}
    .comms-link-health[data-state="authentication-error"]::before,
    .comms-link-health[data-state="permission-error"]::before{background:#d49b43}
    .comms-link-health[data-state="server-error"]::before,
    .comms-link-health[data-state="network-error"]::before,
    .comms-link-health[data-state="route-error"]::before,
    .comms-link-health[data-state="request-error"]::before{background:#c45a50}
    .comms-statusbar .comms-link-health b{margin-right:2px}
  `;
  document.head.append(style);
}

function stateLabel(link) {
  switch (link?.state) {
    case 'online': return 'ONLINE';
    case 'standby': return 'STANDBY';
    case 'authentication-error': return 'AUTH REQUIRED';
    case 'permission-error': return 'PERMISSION DENIED';
    case 'server-error': return 'SERVER ERROR';
    case 'network-error': return 'NETWORK ERROR';
    case 'route-error': return 'ROUTE ERROR';
    case 'request-error': return 'REQUEST ERROR';
    default: return 'CHECKING';
  }
}

function ensureHealthElement(statusbar, id, label) {
  let element = statusbar.querySelector(`#${id}`);
  if (element) return element;
  element = document.createElement('span');
  element.id = id;
  element.className = 'comms-link-health';
  element.innerHTML = `<b>${label}</b><em>CHECKING</em>`;
  const overall = statusbar.querySelector('.status-online');
  statusbar.insertBefore(element, overall || null);
  return element;
}

function applyHealth(element, link) {
  if (!element) return;
  element.dataset.state = link?.state || 'idle';
  const value = element.querySelector('em');
  if (value) value.textContent = stateLabel(link);
  const detail = [
    link?.error,
    link?.httpStatus ? `HTTP ${link.httpStatus}` : '',
    link?.lastSuccessAt ? `Last success ${new Date(link.lastSuccessAt).toLocaleString()}` : ''
  ].filter(Boolean).join(' · ');
  element.title = detail;
}

function render(snapshot = getCommsSnapshot()) {
  ensureStyle();
  const panel = document.querySelector(PANEL_SELECTOR);
  const statusbar = panel?.querySelector('.comms-statusbar');
  if (!panel || !statusbar) return;
  const links = snapshot?.links || {};
  const primary = ensureHealthElement(statusbar, 'comms-primary-api-health', 'PRIMARY API');
  const owner = ensureHealthElement(statusbar, 'comms-owner-api-health', 'FALLBACK');
  applyHealth(primary, links.primary);
  applyHealth(owner, links.owner);

  const badge = panel.querySelector('.provider-badge');
  const overall = panel.querySelector('.status-online');
  const footnote = panel.querySelector('.comms-footnote');
  const primaryOnline = links.primary?.state === 'online';
  const fallbackOnline = links.owner?.state === 'online';
  const fallbackStandby = links.owner?.state === 'standby';

  if (primaryOnline) {
    if (badge) badge.textContent = 'LIVE / OWNER API';
    if (overall) {
      overall.dataset.state = 'online';
      overall.innerHTML = '<i></i> COMMUNICATION LINK ONLINE';
    }
    if (footnote) {
      footnote.textContent = fallbackStandby
        ? 'Primary DNI Communication API is online. The PHP Owner API bridge is held in standby and is only used if the primary bridge fails.'
        : 'Primary DNI Communication API is online. Owner credentials remain server-side.';
    }
  } else if (fallbackOnline) {
    if (badge) badge.textContent = 'LIVE / FALLBACK BRIDGE';
    if (overall) {
      overall.dataset.state = 'online';
      overall.innerHTML = '<i></i> COMMUNICATION LINK ONLINE';
    }
    if (footnote) footnote.textContent = 'Primary DNI Communication API is unavailable, but the server-side Star Comms fallback bridge is online. Automatic primary retry remains active.';
  } else {
    if (badge) badge.textContent = 'COMMUNICATION APIS UNAVAILABLE';
    if (overall) {
      overall.dataset.state = navigator.onLine === false ? 'offline' : 'error';
      overall.innerHTML = `<i></i> ${navigator.onLine === false ? 'NETWORK OFFLINE' : 'LINK DEGRADED'}`;
    }
    if (footnote) footnote.textContent = navigator.onLine === false
      ? 'Browser network is offline. DNI Communication will retry automatically when connectivity returns.'
      : 'Primary and fallback API connections are unavailable. Check each independent status above for the failure type; automatic retry remains active.';
  }
}

function scheduleRender(snapshot) {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => render(snapshot || getCommsSnapshot()), 0);
}

async function retry() {
  if (navigator.onLine === false) return scheduleRender();
  try {
    const snapshot = await refreshComms();
    scheduleRender(snapshot);
  } catch {
    scheduleRender();
  }
}

function communicationActive() {
  return document.querySelector('.terminal-shell')?.dataset.panel === 'communication' && !document.hidden;
}

function scheduleRetry(delay = 1200) {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => {
    if (communicationActive()) void retry();
  }, delay);
}

window.addEventListener('dni:comms-state', event => scheduleRender(event.detail?.snapshot));
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'communication') scheduleRetry(50);
});
window.addEventListener('online', () => scheduleRetry(50));
window.addEventListener('focus', () => scheduleRetry(250));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleRetry(250);
});

window.setInterval(() => {
  if (communicationActive()) void retry();
}, 20000);

scheduleRender();
if (communicationActive()) scheduleRetry(50);
