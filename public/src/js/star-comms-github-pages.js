const STAR_COMMS_HOSTS = new Set(['star-comms.org', 'www.star-comms.org']);
const SESSION_KEY = 'dni.starCommsLaunchUrl';
const PUBLIC_CONFIG_URL = 'config/star-comms-public.json';

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
    if (inner.protocol !== 'starcomms:' || inner.hostname !== 'launch') throw new Error('Expected a starcomms://launch URI.');
    params = inner.searchParams;
  } else {
    const outer = new URL(raw);
    if (outer.protocol !== 'https:' || !STAR_COMMS_HOSTS.has(outer.hostname) || outer.pathname !== '/launch') {
      throw new Error('Expected a https://star-comms.org/launch link.');
    }
    const wrapped = outer.searchParams.get('uri');
    if (wrapped) {
      const inner = new URL(wrapped);
      if (inner.protocol !== 'starcomms:' || inner.hostname !== 'launch') throw new Error('The wrapped launch URI is invalid.');
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

  return { raw, shard: shard.origin, id, canonical: canonical.toString() };
}

function setMessage(text, error = false) {
  const state = document.querySelector('#starcomms-test-state');
  const footnote = document.querySelector('.comms-footnote');
  const badge = document.querySelector('.mock-badge');
  if (state) state.textContent = text;
  if (footnote) footnote.textContent = text;
  if (badge && error) badge.textContent = 'STAR COMMS API ERROR';
}

function arrayFrom(payload, names) {
  if (Array.isArray(payload)) return payload;
  for (const name of names) {
    if (Array.isArray(payload?.[name])) return payload[name];
    if (Array.isArray(payload?.data?.[name])) return payload.data[name];
    if (Array.isArray(payload?.status?.[name])) return payload.status[name];
  }
  return [];
}

function statusObject(payload) {
  if (payload?.status && typeof payload.status === 'object') return payload.status;
  if (payload?.data?.status && typeof payload.data.status === 'object') return payload.data.status;
  if (payload?.data && typeof payload.data === 'object') return payload.data;
  return payload && typeof payload === 'object' ? payload : {};
}

function renderPublicStatus(payload, config) {
  const status = statusObject(payload);
  const nets = arrayFrom(status, ['nets', 'networks', 'channels']);
  const connected = Number(status.connected ?? status.connectedCount ?? status.online ?? status.onlineCount ?? 0);
  const operationOpen = Boolean(status.operationOpen ?? status.operation?.open ?? status.open ?? false);
  const txNow = nets.filter(net => Boolean(net?.tx ?? net?.transmitting ?? net?.activeTx ?? net?.pttActive)).length;
  const shardName = String(status.shardName ?? status.shard?.name ?? status.guildName ?? status.guild?.name ?? new URL(config.shardUrl).hostname);

  const shardEl = document.querySelector('#comms-shard');
  const usersEl = document.querySelector('#metric-users');
  const netsEl = document.querySelector('#metric-nets');
  const txEl = document.querySelector('#metric-tx');
  const operationEl = document.querySelector('#metric-operation');
  if (shardEl) shardEl.textContent = shardName;
  if (usersEl) usersEl.textContent = Number.isFinite(connected) ? connected : 0;
  if (netsEl) netsEl.textContent = nets.length;
  if (txEl) txEl.textContent = txNow;
  if (operationEl) operationEl.textContent = operationOpen ? 'OPEN' : 'CLOSED';

  const netList = document.querySelector('#comms-nets');
  if (netList && nets.length) {
    netList.replaceChildren();
    for (const [index, net] of nets.entries()) {
      const tx = Boolean(net?.tx ?? net?.transmitting ?? net?.activeTx ?? net?.pttActive);
      const members = Number(net?.members ?? net?.memberCount ?? net?.occupancy ?? 0);
      const item = document.createElement('div');
      item.className = 'net-row';
      item.innerHTML = `<span class="net-signal ${tx ? 'is-tx' : ''}"></span><span class="net-name"></span><span class="net-members"></span><span class="net-state"></span>`;
      item.querySelector('.net-name').textContent = String(net?.name ?? net?.label ?? net?.netName ?? `NET ${index + 1}`);
      item.querySelector('.net-members').textContent = `${Number.isFinite(members) ? members : 0} members`;
      item.querySelector('.net-state').textContent = tx ? 'TX' : 'IDLE';
      netList.append(item);
    }
  }

  const roster = document.querySelector('#comms-roster');
  const rosterCount = document.querySelector('#roster-count');
  if (roster) {
    roster.replaceChildren();
    const note = document.createElement('div');
    note.className = 'ready-state';
    note.textContent = 'Public Star Comms status does not expose the private personnel roster.';
    roster.append(note);
  }
  if (rosterCount) rosterCount.textContent = 'PUBLIC STATUS';

  const badge = document.querySelector('.mock-badge');
  const online = document.querySelector('.status-online');
  if (badge) badge.textContent = 'LIVE / PUBLIC API';
  if (online) online.innerHTML = '<i></i> LIVE PUBLIC STATUS';
  setMessage(`LIVE PUBLIC API · ${new URL(config.shardUrl).hostname}`);
}

async function refreshPublicStatus() {
  const configResponse = await fetch(PUBLIC_CONFIG_URL, { cache: 'no-store' });
  if (!configResponse.ok) throw new Error(`Public Star Comms config unavailable (${configResponse.status}).`);
  const config = await configResponse.json();
  if (!config?.enabled || !config?.statusUrl) throw new Error(config?.reason || 'Public Star Comms API is not enabled for this deployment.');

  const response = await fetch(config.statusUrl, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Star Comms public status returned ${response.status}.`);
  renderPublicStatus(await response.json(), config);
}

function disableOwnerWritesForPages() {
  const selectors = [
    '#create-net-form input', '#create-net-form button', '#ready-check-button',
    '#acars-form textarea', '#acars-form button'
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      el.disabled = true;
      el.title = 'Owner API writes require the server-side DNI bridge.';
    }
  }
}

function bindPagesLaunchFix() {
  const form = document.querySelector('#starcomms-test-form');
  const launchField = document.querySelector('#starcomms-launch-url');
  const ownerField = document.querySelector('#starcomms-owner-key');
  const openButton = document.querySelector('#starcomms-open-launch');
  const refreshButton = document.querySelector('#pulse-comms');
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

  if (isGitHubPages()) {
    form.addEventListener('submit', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setMessage('Owner API credentials stay in GitHub Actions. GitHub Pages uses Star Comms public embed status for live read-only data.', true);
    }, true);

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
      note.textContent = 'GITHUB PAGES · Owner key protected in Actions · live public status enabled.';
      form.insertBefore(note, openButton);
    }

    disableOwnerWritesForPages();
    if (refreshButton) {
      refreshButton.textContent = 'Refresh Live';
      refreshButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        void refreshPublicStatus().catch(error => setMessage(`Star Comms API: ${error?.message || error}`, true));
      }, true);
    }

    const subtitle = document.querySelector('.module-subtitle');
    if (subtitle) subtitle.textContent = 'Live Star Comms status is loaded through a browser-safe public token minted during GitHub Pages deployment. Owner API credentials remain server-side.';
    const footnote = document.querySelector('.comms-footnote');
    if (footnote) footnote.textContent = 'GitHub Pages uses Star Comms public embed status. Owner/API write controls require the local or hosted server-side DNI bridge.';

    void refreshPublicStatus().catch(error => setMessage(`Star Comms API: ${error?.message || error}`, true));
  }

  return true;
}

if (!bindPagesLaunchFix()) {
  const observer = new MutationObserver(() => {
    if (bindPagesLaunchFix()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
