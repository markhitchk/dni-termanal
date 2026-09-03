const PROFILE_URL = '/mail-profile-pics.php';

const profileCache = new Map();
let selfProfile = null;
let selfLoaded = false;
let loading = false;
let refreshPending = false;
let refreshScheduled = false;

function initials(value = '') {
  const clean = String(value || 'DNI').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(part => part[0]).join('') || 'DN').toUpperCase();
}

function installStyles() {
  if (document.querySelector('style[data-dni-mail-profile-pics]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailProfilePics = 'true';
  style.textContent = `
    .dni-mail-message.has-profile-pic{padding-left:54px}
    .dni-mail-list-avatar{position:absolute;left:14px;top:14px;width:30px;height:30px;border:1px solid #5f5235;border-radius:50%;background:#111;display:grid;place-items:center;overflow:hidden;color:#d7bc78;font:800 9px/1 "Courier New",monospace;box-shadow:0 0 0 2px rgba(200,168,102,.04)}
    .dni-mail-list-avatar img,.dni-mail-avatar img,.dni-mail-compose-self-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit}
    .dni-mail-avatar,.dni-mail-compose-self-avatar{position:relative;overflow:hidden}
    .dni-mail-avatar.has-profile-pic{border-color:#8d7547;box-shadow:0 0 10px rgba(200,168,102,.12)}
    .dni-mail-compose-identity.has-profile-pic{position:relative;min-height:52px;padding-left:58px}
    .dni-mail-compose-self-avatar{position:absolute;left:12px;top:9px;width:34px;height:34px;border:1px solid #6a5936;border-radius:50%;background:#111;display:grid;place-items:center;color:#d7bc78;font:800 10px/1 "Courier New",monospace}
    .dni-mail-message.has-profile-pic .dni-mail-unread-dot{left:7px;top:48px}
    @media(max-width:700px){.dni-mail-message.has-profile-pic{padding-left:50px}.dni-mail-list-avatar{left:12px;width:28px;height:28px}.dni-mail-compose-identity.has-profile-pic{padding-left:54px}.dni-mail-compose-self-avatar{width:32px;height:32px}}
  `;
  document.head.append(style);
}

function messageIdFromItem(item) {
  return String(item?.querySelector('.dni-mail-id')?.textContent || '').trim().toUpperCase();
}

function avatarElement(className, name, avatarUrl) {
  const root = document.createElement('span');
  root.className = className;
  root.dataset.avatarUrl = String(avatarUrl || '');
  root.dataset.avatarName = String(name || 'DNI');
  root.textContent = initials(name);

  if (avatarUrl) {
    const image = document.createElement('img');
    image.src = String(avatarUrl);
    image.alt = `${name || 'DNI user'} profile picture`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true });
    root.append(image);
  }
  return root;
}

function decorateInbox() {
  document.querySelectorAll('#dni-mail-list .dni-mail-message').forEach(item => {
    const id = messageIdFromItem(item);
    if (!id || !profileCache.has(id)) return;

    const profile = profileCache.get(id) || {};
    const name = profile.name || item.querySelector('.dni-mail-message-sender')?.textContent || 'DNI NETWORK';
    const avatarUrl = profile.avatar_url || '';
    const current = item.querySelector(':scope > .dni-mail-list-avatar');
    if (current?.dataset.avatarUrl === avatarUrl && current?.dataset.avatarName === name) return;

    current?.remove();
    item.classList.add('has-profile-pic');
    item.prepend(avatarElement('dni-mail-list-avatar', name, avatarUrl));
  });
}

function decorateReader() {
  const readerAvatar = document.querySelector('#dni-mail-reader .dni-mail-avatar');
  if (!readerAvatar) return;

  const activeItem = document.querySelector('#dni-mail-list .dni-mail-message.is-active');
  const id = messageIdFromItem(activeItem);
  if (!id || !profileCache.has(id)) return;

  const profile = profileCache.get(id) || {};
  const name = profile.name || document.querySelector('#dni-mail-reader .dni-mail-sender strong')?.textContent || 'DNI NETWORK';
  const avatarUrl = profile.avatar_url || '';
  if (readerAvatar.dataset.avatarUrl === avatarUrl && readerAvatar.dataset.avatarName === name) return;

  readerAvatar.dataset.avatarUrl = avatarUrl;
  readerAvatar.dataset.avatarName = name;
  readerAvatar.replaceChildren();
  readerAvatar.textContent = initials(name);
  readerAvatar.classList.toggle('has-profile-pic', Boolean(avatarUrl));
  if (avatarUrl) {
    const image = document.createElement('img');
    image.src = avatarUrl;
    image.alt = `${name} profile picture`;
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      image.remove();
      readerAvatar.classList.remove('has-profile-pic');
    }, { once: true });
    readerAvatar.append(image);
  }
}

function decorateComposeIdentity() {
  const identity = document.querySelector('[data-mail-compose-identity]');
  if (!identity || !selfLoaded) return;

  const name = selfProfile?.name || 'DNI USER';
  const avatarUrl = selfProfile?.avatar_url || '';
  const current = identity.querySelector(':scope > .dni-mail-compose-self-avatar');
  if (current?.dataset.avatarUrl === avatarUrl && current?.dataset.avatarName === name) return;

  current?.remove();
  identity.classList.add('has-profile-pic');
  identity.prepend(avatarElement('dni-mail-compose-self-avatar', name, avatarUrl));
}

function collectMessageIds() {
  return [...document.querySelectorAll('#dni-mail-list .dni-mail-message')]
    .map(messageIdFromItem)
    .filter(Boolean);
}

async function loadProfiles(ids) {
  if (loading) {
    refreshPending = true;
    return;
  }
  loading = true;
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  try {
    const query = uniqueIds.length ? `?ids=${encodeURIComponent(uniqueIds.join(','))}` : '';
    const response = await fetch(`${PROFILE_URL}${query}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return;
    const payload = await response.json().catch(() => ({}));
    const profiles = payload?.profiles && typeof payload.profiles === 'object' ? payload.profiles : {};

    for (const id of uniqueIds) profileCache.set(id, profiles[id] || null);
    if (payload?.self && typeof payload.self === 'object') selfProfile = payload.self;
    selfLoaded = true;
  } finally {
    loading = false;
    decorateInbox();
    decorateReader();
    decorateComposeIdentity();
    if (refreshPending) {
      refreshPending = false;
      scheduleRefresh();
    }
  }
}

function refresh() {
  refreshScheduled = false;
  installStyles();
  if (!document.querySelector('#dni-mail-panel')) return;

  decorateInbox();
  decorateReader();
  decorateComposeIdentity();

  const missing = collectMessageIds().filter(id => !profileCache.has(id));
  if (missing.length || !selfLoaded) void loadProfiles(missing);
}

function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  queueMicrotask(refresh);
}

installStyles();

let observedMailList = null;
const observer = new MutationObserver(scheduleRefresh);
function observeMailList() {
  const mailList = document.querySelector('#dni-mail-list');
  if (!(mailList instanceof HTMLElement) || mailList === observedMailList) return;
  observer.disconnect();
  observedMailList = mailList;
  observer.observe(mailList, { childList: true, subtree: true });
}

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'mail') {
    observeMailList();
    scheduleRefresh();
  }
});

document.addEventListener('click', event => {
  if (event.target instanceof Element && event.target.closest('#dni-mail-panel')) {
    window.setTimeout(scheduleRefresh, 0);
  }
});

observeMailList();
scheduleRefresh();
