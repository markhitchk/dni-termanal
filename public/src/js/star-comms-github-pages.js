const STAR_COMMS_HOSTS = new Set(['star-comms.org', 'www.star-comms.org']);
const SESSION_KEY = 'dni.starCommsLaunchUrl';

function isGitHubPages() {
  return /(^|\.)github\.io$/i.test(globalThis.location?.hostname || '');
}

function readSession() {
  try { return globalThis.sessionStorage?.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function writeSession(value) {
  try {
    if (value) globalThis.sessionStorage?.setItem(SESSION_KEY, value);
    else globalThis.sessionStorage?.removeItem(SESSION_KEY);
  } catch {}
}

function paramsFromLaunch(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Enter the complete Star Comms launch link first.');

  let params;
  if (/^starcomms:\/\//i.test(raw)) {
    const inner = new URL(raw);
    if (inner.protocol !== 'starcomms:' || inner.hostname !== 'launch') {
      throw new Error('Expected a starcomms://launch URI.');
    }
    params = inner.searchParams;
  } else {
    const outer = new URL(raw);
    if (outer.protocol !== 'https:' || !STAR_COMMS_HOSTS.has(outer.hostname) || outer.pathname !== '/launch') {
      throw new Error('Expected a https://star-comms.org/launch link.');
    }

    const wrapped = outer.searchParams.get('uri');
    if (wrapped) {
      const inner = new URL(wrapped);
      if (inner.protocol !== 'starcomms:' || inner.hostname !== 'launch') {
        throw new Error('The wrapped launch URI is invalid.');
      }
      params = inner.searchParams;
    } else {
      params = outer.searchParams;
    }
  }

  const shardValue = String(params.get('shard') || '').trim();
  const id = String(params.get('id') || '').trim();
  const token = String(params.get('token') || '').trim();
  if (!shardValue || !id || !token) throw new Error('Star Comms launch link must contain shard, id, and token.');

  const shard = new URL(shardValue);
  if (shard.protocol !== 'https:' || !shard.hostname.endsWith('.star-comms.org')) {
    throw new Error('The Star Comms shard must be an HTTPS *.star-comms.org address.');
  }

  const canonical = new URL('https://star-comms.org/launch');
  canonical.searchParams.set('shard', shard.origin);
  canonical.searchParams.set('id', id);
  canonical.searchParams.set('token', token);

  const inner = new URL('starcomms://launch');
  inner.searchParams.set('shard', shard.origin);
  inner.searchParams.set('id', id);
  inner.searchParams.set('token', token);
  const legacy = new URL('https://star-comms.org/launch');
  legacy.searchParams.set('uri', inner.toString());

  return {
    raw,
    shard: shard.origin,
    id,
    canonical: canonical.toString(),
    legacy: legacy.toString()
  };
}

function setMessage(text, error = false) {
  const state = document.querySelector('#starcomms-test-state');
  const footnote = document.querySelector('.comms-footnote');
  const badge = document.querySelector('.mock-badge');
  if (state) state.textContent = text;
  if (footnote) footnote.textContent = text;
  if (badge && error) badge.textContent = 'STAR COMMS LAUNCH ERROR';
}

function bindPagesLaunchFix() {
  const form = document.querySelector('#starcomms-test-form');
  const launchField = document.querySelector('#starcomms-launch-url');
  const ownerField = document.querySelector('#starcomms-owner-key');
  const openButton = document.querySelector('#starcomms-open-launch');
  if (!form || !launchField || !openButton || form.dataset.pagesLaunchFix === '1') return false;
  form.dataset.pagesLaunchFix = '1';

  const remembered = readSession();
  if (!launchField.value && remembered) launchField.value = remembered;
  launchField.placeholder = 'https://star-comms.org/launch?shard=...&id=...&token=...';

  openButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const launch = paramsFromLaunch(launchField.value);
      writeSession(launch.raw);
      setMessage(`Opening Star Comms for ${new URL(launch.shard).hostname}…`);
      globalThis.location.assign(launch.canonical);
    } catch (error) {
      setMessage(`Star Comms launcher: ${error?.message || error}`, true);
    }
  }, true);

  form.addEventListener('submit', event => {
    if (isGitHubPages()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setMessage('GitHub Pages can open the Star Comms launcher, but Owner API keys must stay server-side. Use Open Star Comms here; use the local DNI bridge for live Owner API controls.', true);
      return;
    }

    try {
      const launch = paramsFromLaunch(launchField.value);
      launchField.value = launch.legacy;
      writeSession(launch.raw);
    } catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setMessage(`Star Comms connection: ${error?.message || error}`, true);
    }
  }, true);

  if (isGitHubPages()) {
    const ownerLabel = document.querySelector('label[for="starcomms-owner-key"]');
    const connectButton = form.querySelector('button[type="submit"]');
    if (ownerLabel) ownerLabel.hidden = true;
    if (ownerField) {
      ownerField.value = '';
      ownerField.hidden = true;
      ownerField.disabled = true;
    }
    if (connectButton) connectButton.hidden = true;

    let note = document.querySelector('#starcomms-pages-note');
    if (!note) {
      note = document.createElement('div');
      note.id = 'starcomms-pages-note';
      note.className = 'ready-state';
      note.textContent = 'GITHUB PAGES MODE · Launch link enabled. Owner API stays server-side.';
      form.insertBefore(note, openButton);
    }
  }

  return true;
}

if (!bindPagesLaunchFix()) {
  const observer = new MutationObserver(() => {
    if (bindPagesLaunchFix()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
