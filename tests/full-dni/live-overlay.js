const api = async (path, options = {}) => {
  const response = await fetch(`/__starcomms/api/${path}`, {
    method: options.method || 'GET',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store'
  });
  const type = response.headers.get('content-type') || '';
  const payload = response.status === 204
    ? null
    : type.includes('application/json')
      ? await response.json()
      : await response.text();
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload?.error ? payload.error : String(payload || response.statusText);
    throw new Error(`${response.status} ${detail}`.trim());
  }
  return payload;
};

const arrayFrom = (payload, names) => {
  if (Array.isArray(payload)) return payload;
  for (const name of names) {
    if (Array.isArray(payload?.[name])) return payload[name];
    if (Array.isArray(payload?.data?.[name])) return payload.data[name];
    if (Array.isArray(payload?.status?.[name])) return payload.status[name];
  }
  return [];
};

const objectFrom = (payload, names) => {
  for (const name of names) {
    if (payload?.[name] && typeof payload[name] === 'object') return payload[name];
    if (payload?.data?.[name] && typeof payload.data[name] === 'object') return payload.data[name];
  }
  return payload && typeof payload === 'object' ? payload : {};
};

const assignmentMap = payload => {
  const raw = payload?.assignments ?? payload?.data?.assignments ?? payload;
  const map = new Map();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const userId = String(item?.userId ?? item?.id ?? '');
      const netUid = String(item?.netUid ?? item?.uid ?? item?.netId ?? '');
      if (userId && netUid) map.set(userId, netUid);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [userId, value] of Object.entries(raw)) {
      const netUid = typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : String(value?.netUid ?? value?.uid ?? value?.netId ?? '');
      if (netUid) map.set(String(userId), netUid);
    }
  }
  return map;
};

const roleLabel = user => {
  if (typeof user?.roleName === 'string') return user.roleName;
  if (typeof user?.role === 'string') return user.role;
  if (Array.isArray(user?.roles) && user.roles.length) {
    const first = user.roles[0];
    return typeof first === 'string' ? first : String(first?.name ?? 'Member');
  }
  return 'Member';
};

const stamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
let eventLog = [];
const pushEvent = (type, text) => {
  eventLog.unshift({ time: stamp(), type, text });
  eventLog = eventLog.slice(0, 12);
};

function renderEvents() {
  const host = document.querySelector('#comms-events');
  if (!host) return;
  host.replaceChildren();
  for (const entry of eventLog) {
    const item = document.createElement('div');
    item.className = 'event-row';
    item.innerHTML = '<time></time><span class="event-type"></span><p></p>';
    item.querySelector('time').textContent = entry.time;
    item.querySelector('.event-type').textContent = entry.type;
    item.querySelector('p').textContent = entry.text;
    host.append(item);
  }
}

function showError(error) {
  console.error(error);
  document.querySelector('.mock-badge').textContent = 'LOCAL TEST / API ERROR';
  document.querySelector('.comms-footnote').textContent = `Star Comms full-DNI test error: ${error.message || error}`;
  pushEvent('ERROR', error.message || String(error));
  renderEvents();
}

function normalize(statusPayload, rosterPayload, assignmentsPayload, readyPayload) {
  const status = objectFrom(statusPayload, ['status']);
  const assignments = assignmentMap(assignmentsPayload);
  const rawRoster = arrayFrom(rosterPayload, ['roster', 'members', 'users', 'clients']);
  const roster = rawRoster.map((user, index) => {
    const userId = String(user?.userId ?? user?.discordId ?? user?.id ?? `user-${index + 1}`);
    return {
      userId,
      name: String(user?.displayName ?? user?.name ?? user?.username ?? user?.globalName ?? userId),
      role: roleLabel(user),
      netUid: String(user?.netUid ?? user?.net?.uid ?? assignments.get(userId) ?? '')
    };
  });

  const rawNets = arrayFrom(status, ['nets', 'networks', 'channels']);
  const nets = rawNets.map((net, index) => {
    const uid = String(net?.netUid ?? net?.uid ?? net?.id ?? `net-${index + 1}`);
    return {
      uid,
      name: String(net?.name ?? net?.label ?? net?.netName ?? `NET ${index + 1}`),
      members: Number(net?.members ?? net?.memberCount ?? net?.occupancy ?? roster.filter(user => user.netUid === uid).length) || 0,
      tx: Boolean(net?.tx ?? net?.transmitting ?? net?.activeTx ?? net?.pttActive)
    };
  });

  const readyBody = objectFrom(readyPayload, ['session', 'readyCheck', 'active']);
  const responses = arrayFrom(readyBody, ['responses', 'members', 'results']);
  const values = responses.map(item => String(item?.status ?? item?.response ?? '').toLowerCase());
  const ready = responses.length
    ? {
        active: true,
        ready: values.filter(v => v === 'ready').length,
        declined: values.filter(v => v === 'declined' || v === 'decline').length,
        afk: values.filter(v => v === 'afk').length,
        total: responses.length
      }
    : {
        active: Boolean(readyBody?.active ?? readyBody?.isActive ?? readyPayload?.active),
        ready: Number(readyBody?.ready ?? readyPayload?.ready ?? 0),
        declined: Number(readyBody?.declined ?? readyPayload?.declined ?? 0),
        afk: Number(readyBody?.afk ?? readyPayload?.afk ?? 0),
        total: Number(readyBody?.total ?? readyPayload?.total ?? roster.length)
      };

  return {
    shard: String(status?.shardName ?? status?.shard?.name ?? status?.guildName ?? status?.guild?.name ?? 'DREADNOUGHT IMPERIUM'),
    connected: Number(status?.connected ?? status?.connectedCount ?? status?.online ?? status?.onlineCount ?? roster.length) || roster.length,
    operationOpen: Boolean(status?.operationOpen ?? status?.operation?.open ?? status?.op?.open ?? status?.open ?? false),
    nets,
    roster,
    ready
  };
}

function renderLive(snapshot, context) {
  document.querySelector('.mock-badge').textContent = 'LOCAL FULL DNI / LIVE';
  document.querySelector('.status-online').innerHTML = '<i></i> LIVE OWNER API TEST';
  document.querySelector('#comms-shard').textContent = snapshot.shard;
  document.querySelector('#metric-users').textContent = snapshot.connected;
  document.querySelector('#metric-nets').textContent = snapshot.nets.length;
  document.querySelector('#metric-tx').textContent = snapshot.nets.filter(net => net.tx).length;
  document.querySelector('#metric-operation').textContent = snapshot.operationOpen ? 'OPEN' : 'CLOSED';
  document.querySelector('#roster-count').textContent = `${snapshot.roster.length} ONLINE`;
  document.querySelector('#pulse-comms').textContent = 'Refresh Live';
  document.querySelector('.comms-footnote').textContent = `LOCAL TEST ONLY · full launch context loaded · ${context.apiBase} · launch ID ${context.launchId} · launch token present but hidden · Owner key remains on the local Node test server.`;

  const nets = document.querySelector('#comms-nets');
  nets.replaceChildren();
  for (const net of snapshot.nets) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'net-row';
    item.innerHTML = `<span class="net-signal ${net.tx ? 'is-tx' : ''}"></span><span class="net-name"></span><span class="net-members"></span><span class="net-state"></span>`;
    item.querySelector('.net-name').textContent = net.name;
    item.querySelector('.net-members').textContent = `${net.members} members`;
    item.querySelector('.net-state').textContent = net.tx ? 'TX' : 'IDLE';
    nets.append(item);
  }

  const roster = document.querySelector('#comms-roster');
  roster.replaceChildren();
  for (const user of snapshot.roster) {
    const row = document.createElement('div');
    row.className = 'roster-row';
    const identity = document.createElement('div');
    identity.className = 'roster-identity';
    identity.innerHTML = '<span class="presence-dot"></span><div><strong></strong><small></small></div>';
    identity.querySelector('strong').textContent = user.name;
    identity.querySelector('small').textContent = user.role;

    const select = document.createElement('select');
    select.className = 'net-select';
    select.dataset.userId = user.userId;
    for (const net of snapshot.nets) {
      const option = document.createElement('option');
      option.value = net.uid;
      option.textContent = net.name;
      option.selected = user.netUid === net.uid;
      select.append(option);
    }

    const meta = document.createElement('span');
    meta.className = 'roster-net';
    meta.textContent = snapshot.nets.find(net => net.uid === user.netUid)?.name || 'UNASSIGNED';
    row.append(identity, select, meta);
    roster.append(row);
  }

  const ready = document.querySelector('#ready-check-state');
  if (snapshot.ready.active) {
    ready.innerHTML = `<b>${snapshot.ready.ready} READY</b><span>${snapshot.ready.declined} DECLINED</span><span>${snapshot.ready.afk} AFK</span><span>${snapshot.ready.total} TOTAL</span>`;
  } else {
    ready.textContent = 'No ready check active.';
  }

  renderEvents();
}

async function refreshLive(context) {
  const [status, roster, assignments, ready] = await Promise.all([
    api('status'),
    api('roster').catch(() => ({})),
    api('assignments').catch(() => ({})),
    api('ready-checks/status').catch(() => api('ready-checks').catch(() => ({})))
  ]);
  const snapshot = normalize(status, roster, assignments, ready);
  pushEvent('LIVE', 'Full DNI refreshed from Star Comms Owner API.');
  renderLive(snapshot, context);
  return snapshot;
}

async function boot() {
  const context = await fetch('/__starcomms/context', { cache: 'no-store' }).then(response => response.json());

  const subtitle = document.querySelector('.module-subtitle');
  if (subtitle) subtitle.textContent = 'LOCAL FULL-DNI TEST MODE · uses the complete Star Comms launch context plus the Owner API key through the local test server. The production GitHub Pages build remains simulation-only.';

  const actionCard = document.querySelector('.action-card .card-heading');
  if (actionCard && !document.querySelector('#launch-star-comms-test')) {
    const launchButton = document.createElement('button');
    launchButton.id = 'launch-star-comms-test';
    launchButton.type = 'button';
    launchButton.className = 'small-action';
    launchButton.textContent = 'Open Star Comms';
    actionCard.append(launchButton);
  }

  document.addEventListener('submit', async event => {
    const id = event.target?.id;
    if (!['create-net-form', 'acars-form'].includes(id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      if (id === 'create-net-form') {
        const field = document.querySelector('#new-net-name');
        const name = field.value.trim();
        if (!name) return;
        await api('nets', { method: 'POST', body: { name } });
        field.value = '';
        pushEvent('WRITE', `Created net: ${name}`);
      } else {
        const field = document.querySelector('#acars-text');
        const text = field.value.trim();
        if (!text) return;
        await api('acars', { method: 'POST', body: { text, senderName: 'DNI Full Test' } });
        field.value = '';
        pushEvent('WRITE', 'ACARS message sent.');
      }
      await refreshLive(context);
    } catch (error) {
      showError(error);
    }
  }, true);

  document.addEventListener('change', async event => {
    const select = event.target?.closest?.('.net-select');
    if (!select?.dataset.userId) return;
    event.stopImmediatePropagation();
    try {
      await api('assignments', {
        method: 'POST',
        body: { userId: select.dataset.userId, netUid: select.value, action: 'assign' }
      });
      pushEvent('WRITE', `Assigned ${select.dataset.userId} to ${select.value}.`);
      await refreshLive(context);
    } catch (error) {
      showError(error);
    }
  }, true);

  document.addEventListener('click', async event => {
    const target = event.target?.closest?.('button');
    if (!target) return;

    if (target.id === 'pulse-comms') {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { await refreshLive(context); } catch (error) { showError(error); }
      return;
    }

    if (target.id === 'ready-check-button') {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const created = await api('ready-checks', {
          method: 'POST',
          body: {
            name: 'DNI Launch',
            message: 'Report ready for DNI operations.',
            color: '#34CD84',
            target: { everyone: true }
          }
        });
        const templateId = created?.readyCheck?.id ?? created?.template?.id ?? created?.id;
        if (!templateId) throw new Error('Star Comms did not return a ready-check template ID.');
        await api('ready-checks/start', {
          method: 'POST',
          body: { templateId: String(templateId), initiatorName: 'DNI Full Test' }
        });
        pushEvent('WRITE', 'Ready check started.');
        await refreshLive(context);
      } catch (error) {
        showError(error);
      }
      return;
    }

    if (target.id === 'launch-star-comms-test') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.open('/__starcomms/launch', '_blank', 'noopener,noreferrer');
    }
  }, true);

  pushEvent('TEST', `Full launch context loaded for ${context.shardUrl}.`);
  try {
    await refreshLive(context);
  } catch (error) {
    showError(error);
  }
}

boot().catch(showError);
