const MAIL_V2_URL = '/mail-compose-v2.php';
const CDN_BLOCK = '--- DNI CDN ATTACHMENTS ---';

const mailV2 = {
  csrfToken: '',
  directory: null,
  directoryPromise: null,
  category: 'support',
  role: 'to',
  selected: {
    to: new Map(),
    cc: new Map(),
    bcc: new Map()
  },
  sentActive: false,
  sentMessages: [],
  mentionIndex: -1,
  mentionMatches: []
};

function installMailV2Styles() {
  if (document.querySelector('style[data-dni-mail-v2-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailV2Style = 'true';
  style.textContent = `
    .dni-mail-v2-superseded{display:none!important}
    .dni-mail-v2-recipient-ui{display:grid;gap:8px;margin-top:7px;padding:10px;border:1px solid #303030;background:#080808;min-width:0}
    .dni-mail-v2-tabs,.dni-mail-v2-role-tabs{display:flex;flex-wrap:wrap;gap:5px}
    .dni-mail-v2-tabs button,.dni-mail-v2-role-tabs button{appearance:none;border:1px solid #383838;background:#101010;color:#aaa;padding:7px 9px;font:700 9px/1 "Courier New",monospace;letter-spacing:.4px;cursor:pointer}
    .dni-mail-v2-tabs button.is-active,.dni-mail-v2-role-tabs button.is-active{border-color:#c8a866;background:#1a160e;color:#f0d89f}
    .dni-mail-v2-tabs button span{display:inline-block;margin-left:5px;color:#6f6f6f}
    .dni-mail-v2-tools{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px;align-items:center}
    .dni-mail-v2-search{box-sizing:border-box;width:100%;min-width:0;border:1px solid #303030;background:#050505;color:#eee;padding:9px 10px;font:700 10px/1.3 "Courier New",monospace;outline:none}
    .dni-mail-v2-search:focus{border-color:#c8a866;box-shadow:0 0 0 1px rgba(200,168,102,.16)}
    .dni-mail-v2-directory{max-height:230px;overflow:auto;overscroll-behavior:contain;border:1px solid #232323;background:#050505}
    .dni-mail-v2-directory button{display:grid;width:100%;gap:2px;border:0;border-bottom:1px solid #1c1c1c;background:transparent;color:#ddd;text-align:left;padding:9px 10px;font:700 10px/1.3 "Courier New",monospace;cursor:pointer}
    .dni-mail-v2-directory button:last-child{border-bottom:0}.dni-mail-v2-directory button:hover,.dni-mail-v2-directory button:focus{outline:none;background:#17140d;color:#fff}
    .dni-mail-v2-directory button.is-selected{background:#15130e;color:#d7bf86}
    .dni-mail-v2-directory strong{color:#d9c38f;font-size:10px}.dni-mail-v2-directory small{color:#858585;font-size:9px;overflow-wrap:anywhere}
    .dni-mail-v2-empty{padding:10px;color:#777;font:700 9px/1.4 "Courier New",monospace}
    .dni-mail-v2-selected{display:grid;gap:6px}.dni-mail-v2-selected-row{display:grid;grid-template-columns:38px minmax(0,1fr);gap:7px;align-items:start}
    .dni-mail-v2-selected-row>strong{padding-top:6px;color:#c8a866;font:700 9px/1 "Courier New",monospace}.dni-mail-v2-chips{display:flex;flex-wrap:wrap;gap:5px;min-height:25px}
    .dni-mail-v2-chip{display:inline-flex;max-width:100%;align-items:center;gap:6px;border:1px solid #3a3427;background:#12100b;color:#d7c18b;padding:5px 7px;font:700 9px/1.2 "Courier New",monospace}
    .dni-mail-v2-chip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dni-mail-v2-chip button{appearance:none;border:0;background:transparent;color:#888;padding:0;cursor:pointer;font:700 12px/1 monospace}.dni-mail-v2-chip button:hover{color:#fff}
    .dni-mail-v2-help{color:#777;font:700 8px/1.45 "Courier New",monospace}.dni-mail-v2-help b{color:#c8a866}
    .dni-mail-v2-status{grid-column:1/-1;min-height:15px;color:#858585;font:700 9px/1.4 "Courier New",monospace}.dni-mail-v2-status.is-error{color:#e45d62}.dni-mail-v2-status.is-success{color:#c8a866}
    .dni-mail-v2-mention-menu{display:grid;max-height:190px;overflow:auto;margin-top:5px;border:1px solid #3f3829;background:#070707;box-shadow:0 10px 24px rgba(0,0,0,.5)}
    .dni-mail-v2-mention-menu[hidden]{display:none!important}.dni-mail-v2-mention-menu button{display:grid;gap:2px;border:0;border-bottom:1px solid #1d1d1d;background:transparent;text-align:left;padding:8px 10px;color:#ddd;font:700 9px/1.3 "Courier New",monospace;cursor:pointer}
    .dni-mail-v2-mention-menu button.is-active,.dni-mail-v2-mention-menu button:hover{background:#17140d;color:#fff}.dni-mail-v2-mention-menu small{color:#888}
    .dni-mail-mention,.dni-mail-address{color:#e0c681;font-weight:700}
    .dni-mail-v2-recipient-meta{display:grid;gap:5px;margin:8px 0 0;padding:9px 10px;border:1px solid #292929;background:#080808;color:#aaa;font:700 9px/1.4 "Courier New",monospace}
    .dni-mail-v2-recipient-meta b{color:#c8a866}.dni-mail-v2-recipient-meta span{overflow-wrap:anywhere}
    .dni-mail-v2-sent-recipient{color:#c8a866!important}
    .dni-mail-v2-sent-body{white-space:pre-wrap;overflow-wrap:anywhere}
    @media(max-width:700px){
      .dni-mail-v2-recipient-ui{padding:9px}.dni-mail-v2-tabs{display:grid;grid-template-columns:1fr 1fr 1fr}.dni-mail-v2-tabs button{min-height:43px;padding:7px 5px;font-size:8px}
      .dni-mail-v2-role-tabs button{flex:1 1 70px;min-height:40px;font-size:10px}.dni-mail-v2-tools{grid-template-columns:1fr}.dni-mail-v2-search{min-height:46px;font-size:16px}
      .dni-mail-v2-directory{max-height:34dvh}.dni-mail-v2-directory button{min-height:49px;padding:10px;font-size:11px}.dni-mail-v2-directory strong{font-size:11px}.dni-mail-v2-directory small{font-size:10px}
      .dni-mail-v2-selected-row{grid-template-columns:34px minmax(0,1fr)}.dni-mail-v2-chip{max-width:100%;font-size:9px}.dni-mail-v2-mention-menu button{min-height:46px;font-size:10px}
    }
  `;
  document.head.append(style);
}

async function v2Request(action, { method = 'GET', body = null, params = null } = {}) {
  const query = new URLSearchParams({ action });
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
    }
  }
  const options = {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  };
  if (method !== 'GET') {
    if (!mailV2.csrfToken) await loadV2Directory();
    options.headers['Content-Type'] = 'application/json';
    options.headers['X-DNI-CSRF'] = mailV2.csrfToken;
    options.body = JSON.stringify(body || {});
  }
  const response = await fetch(`${MAIL_V2_URL}?${query}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI Mail V2 HTTP ${response.status}`);
  if (payload.csrfToken) mailV2.csrfToken = String(payload.csrfToken);
  return payload;
}

async function loadV2Directory({ force = false } = {}) {
  if (mailV2.directory && !force) return mailV2.directory;
  if (mailV2.directoryPromise && !force) return mailV2.directoryPromise;
  mailV2.directoryPromise = v2Request('directory').then(payload => {
    mailV2.directory = payload.directory || { support: [], members: [], citizens: [], all: [] };
    if (payload.csrfToken) mailV2.csrfToken = String(payload.csrfToken);
    return mailV2.directory;
  }).finally(() => {
    mailV2.directoryPromise = null;
  });
  return mailV2.directoryPromise;
}

function targetId(target) {
  return String(Number(target?.id || 0));
}

function targetText(target) {
  return String(target?.label || target?.name || target?.address || `DNI User ${target?.id || ''}`).trim();
}

function directoryTargetById(id) {
  const key = String(Number(id || 0));
  return (mailV2.directory?.all || []).find(target => targetId(target) === key) || null;
}

function selectedRoleForId(id) {
  const key = String(Number(id || 0));
  for (const role of ['to', 'cc', 'bcc']) {
    if (mailV2.selected[role].has(key)) return role;
  }
  return '';
}

function addRecipient(target, role = mailV2.role) {
  if (!target || !['to', 'cc', 'bcc'].includes(role)) return;
  const key = targetId(target);
  if (key === '0') return;
  for (const name of ['to', 'cc', 'bcc']) mailV2.selected[name].delete(key);
  mailV2.selected[role].set(key, target);
  syncLegacyRecipientSelection();
  renderRecipientUi();
}

function removeRecipient(id, role) {
  mailV2.selected[role]?.delete(String(Number(id || 0)));
  syncLegacyRecipientSelection();
  renderRecipientUi();
}

function clearRecipients() {
  for (const role of ['to', 'cc', 'bcc']) mailV2.selected[role].clear();
  syncLegacyRecipientSelection();
  renderRecipientUi();
}

function currentRecipientField() {
  return document.querySelector('#dni-mail-panel [data-mail-recipient-field]');
}

function syncLegacyRecipientSelection() {
  const select = currentRecipientField()?.querySelector('[data-mail-recipients]');
  if (!(select instanceof HTMLSelectElement)) return;
  const selectedPositive = new Set();
  for (const role of ['to', 'cc', 'bcc']) {
    for (const target of mailV2.selected[role].values()) {
      const id = Number(target.id);
      if (id > 0) selectedPositive.add(String(id));
    }
  }
  for (const option of select.options) option.selected = selectedPositive.has(String(option.value));
}

function importLegacyRecipients() {
  const select = currentRecipientField()?.querySelector('[data-mail-recipients]');
  if (!(select instanceof HTMLSelectElement) || !mailV2.directory) return;
  for (const option of select.selectedOptions) {
    const key = String(Number(option.value || 0));
    if (key === '0' || selectedRoleForId(key)) continue;
    const target = directoryTargetById(key);
    if (target) mailV2.selected.to.set(key, target);
  }
  renderRecipientUi();
}

function selectedTargets(role) {
  return [...mailV2.selected[role].values()];
}

function recipientCategoryTargets() {
  const directory = mailV2.directory || {};
  return Array.isArray(directory[mailV2.category]) ? directory[mailV2.category] : [];
}

function renderSelectedRecipients(root) {
  const selected = root.querySelector('[data-mail-v2-selected]');
  if (!selected) return;
  selected.replaceChildren();
  for (const role of ['to', 'cc', 'bcc']) {
    const row = document.createElement('div');
    row.className = 'dni-mail-v2-selected-row';
    const label = document.createElement('strong');
    label.textContent = role.toUpperCase();
    const chips = document.createElement('div');
    chips.className = 'dni-mail-v2-chips';
    const targets = selectedTargets(role);
    if (!targets.length) {
      const empty = document.createElement('span');
      empty.className = 'dni-mail-v2-help';
      empty.textContent = role === 'to' ? 'No recipients selected.' : 'None';
      chips.append(empty);
    } else {
      for (const target of targets) {
        const chip = document.createElement('span');
        chip.className = 'dni-mail-v2-chip';
        const text = document.createElement('span');
        text.textContent = targetText(target);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove ${targetText(target)} from ${role.toUpperCase()}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => removeRecipient(target.id, role));
        chip.append(text, remove);
        chips.append(chip);
      }
    }
    row.append(label, chips);
    selected.append(row);
  }
}

function renderDirectoryList(root) {
  const list = root.querySelector('[data-mail-v2-directory]');
  const search = root.querySelector('[data-mail-v2-search]');
  if (!list) return;
  const query = String(search?.value || '').trim().toLowerCase();
  const targets = recipientCategoryTargets().filter(target => {
    if (!query) return true;
    const haystack = `${target.name || ''} ${target.username || ''} ${target.address || ''} ${target.label || ''} ${target.description || ''}`.toLowerCase();
    return haystack.includes(query);
  });
  list.replaceChildren();
  if (!targets.length) {
    const empty = document.createElement('div');
    empty.className = 'dni-mail-v2-empty';
    empty.textContent = 'NO MATCHING RECIPIENTS';
    list.append(empty);
    return;
  }
  for (const target of targets) {
    const button = document.createElement('button');
    button.type = 'button';
    const selectedRole = selectedRoleForId(target.id);
    if (selectedRole) button.classList.add('is-selected');
    const name = document.createElement('strong');
    name.textContent = `${target.name || 'DNI Recipient'}${selectedRole ? ` // ${selectedRole.toUpperCase()}` : ''}`;
    const address = document.createElement('small');
    address.textContent = target.address || target.label || '';
    button.append(name, address);
    if (target.description && target.description !== target.name) {
      const description = document.createElement('small');
      description.textContent = target.description;
      button.append(description);
    }
    button.addEventListener('click', () => addRecipient(target));
    list.append(button);
  }
}

function renderRecipientUi() {
  const root = document.querySelector('[data-mail-v2-recipient-ui]');
  if (!root) return;
  root.querySelectorAll('[data-mail-v2-category]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mailV2Category === mailV2.category);
  });
  root.querySelectorAll('[data-mail-v2-role]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mailV2Role === mailV2.role);
  });
  const counts = {
    support: mailV2.directory?.support?.length || 0,
    members: mailV2.directory?.members?.length || 0,
    citizens: mailV2.directory?.citizens?.length || 0
  };
  for (const category of Object.keys(counts)) {
    const count = root.querySelector(`[data-mail-v2-category="${category}"] span`);
    if (count) count.textContent = String(counts[category]);
  }
  renderSelectedRecipients(root);
  renderDirectoryList(root);
}

function setComposeV2Status(text = '', status = '') {
  const node = document.querySelector('[data-mail-v2-status]');
  if (!node) return;
  node.className = 'dni-mail-v2-status';
  if (status) node.classList.add(`is-${status}`);
  node.textContent = String(text || '');
}

async function ensureRecipientUi() {
  const field = currentRecipientField();
  if (!(field instanceof HTMLElement)) return null;
  const select = field.querySelector('[data-mail-recipients]');
  if (!(select instanceof HTMLSelectElement)) return null;

  field.querySelectorAll('.dni-mail-combobox,.dni-mail-to-help').forEach(node => node.classList.add('dni-mail-v2-superseded'));
  select.classList.add('dni-mail-recipient-select-native');
  if (field.firstChild?.nodeType === Node.TEXT_NODE) field.firstChild.textContent = 'Recipients / Group Delivery';

  let root = field.querySelector('[data-mail-v2-recipient-ui]');
  if (!root) {
    root = document.createElement('div');
    root.className = 'dni-mail-v2-recipient-ui';
    root.dataset.mailV2RecipientUi = 'true';
    root.innerHTML = `
      <div class="dni-mail-v2-tabs" aria-label="Recipient directory groups">
        <button type="button" data-mail-v2-category="support">Support Channels <span>0</span></button>
        <button type="button" data-mail-v2-category="members">DNI Members <span>0</span></button>
        <button type="button" data-mail-v2-category="citizens">Citizen Users <span>0</span></button>
      </div>
      <div class="dni-mail-v2-tools">
        <div class="dni-mail-v2-role-tabs" aria-label="Recipient delivery role">
          <button type="button" class="is-active" data-mail-v2-role="to">TO</button>
          <button type="button" data-mail-v2-role="cc">CC</button>
          <button type="button" data-mail-v2-role="bcc">BCC</button>
        </div>
        <input class="dni-mail-v2-search" type="search" autocomplete="off" data-mail-v2-search placeholder="Search this directory tab">
      </div>
      <div class="dni-mail-v2-directory" data-mail-v2-directory></div>
      <div class="dni-mail-v2-selected" data-mail-v2-selected></div>
      <div class="dni-mail-v2-help"><b>GROUP MAIL:</b> add multiple recipients. CC recipients are visible as copied recipients. BCC recipients receive the message but are hidden from other recipients.</div>
      <div class="dni-mail-v2-status" data-mail-v2-status aria-live="polite"></div>`;
    field.append(root);

    root.querySelectorAll('[data-mail-v2-category]').forEach(button => {
      button.addEventListener('click', () => {
        mailV2.category = button.dataset.mailV2Category || 'support';
        renderRecipientUi();
      });
    });
    root.querySelectorAll('[data-mail-v2-role]').forEach(button => {
      button.addEventListener('click', () => {
        mailV2.role = button.dataset.mailV2Role || 'to';
        renderRecipientUi();
      });
    });
    root.querySelector('[data-mail-v2-search]')?.addEventListener('input', () => renderDirectoryList(root));
    select.addEventListener('change', importLegacyRecipients);
  }

  try {
    await loadV2Directory();
    importLegacyRecipients();
    renderRecipientUi();
  } catch (error) {
    setComposeV2Status(String(error?.message || error || 'Unable to load the DNI Mail recipient directory.'), 'error');
  }
  return root;
}

function activeMentionToken(textarea) {
  const before = textarea.value.slice(0, textarea.selectionStart ?? textarea.value.length);
  const match = before.match(/(?:^|\s)@([A-Za-z0-9._-]{0,64})$/);
  if (!match) return null;
  return { query: match[1].toLowerCase(), start: before.length - match[1].length - 1, end: before.length };
}

function mentionCandidates(query) {
  const users = [...(mailV2.directory?.members || []), ...(mailV2.directory?.citizens || [])];
  return users.filter(user => {
    const username = String(user.username || '').toLowerCase();
    if (!username) return false;
    const haystack = `${username} ${user.name || ''} ${user.address || ''}`.toLowerCase();
    return !query || haystack.includes(query);
  }).slice(0, 10);
}

function closeMentionMenu(menu) {
  menu.hidden = true;
  menu.replaceChildren();
  mailV2.mentionIndex = -1;
  mailV2.mentionMatches = [];
}

function insertMention(textarea, target, menu) {
  const token = activeMentionToken(textarea);
  if (!token || !target?.username) return;
  const mention = `@${target.username}`;
  textarea.setRangeText(`${mention} `, token.start, token.end, 'end');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  closeMentionMenu(menu);
  textarea.focus({ preventScroll: true });
}

function renderMentionMenu(textarea, menu) {
  const token = activeMentionToken(textarea);
  if (!token) {
    closeMentionMenu(menu);
    return;
  }
  const matches = mentionCandidates(token.query);
  mailV2.mentionMatches = matches;
  mailV2.mentionIndex = matches.length ? 0 : -1;
  menu.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'dni-mail-v2-empty';
    empty.textContent = 'NO MATCHING DNI USERS';
    menu.append(empty);
    menu.hidden = false;
    return;
  }
  matches.forEach((target, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.toggle('is-active', index === mailV2.mentionIndex);
    const name = document.createElement('strong');
    name.textContent = `@${target.username} // ${target.name || 'DNI User'}`;
    const address = document.createElement('small');
    address.textContent = target.address || '';
    button.append(name, address);
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => insertMention(textarea, target, menu));
    menu.append(button);
  });
  menu.hidden = false;
}

function refreshMentionActive(menu) {
  const buttons = [...menu.querySelectorAll('button')];
  buttons.forEach((button, index) => button.classList.toggle('is-active', index === mailV2.mentionIndex));
  buttons[mailV2.mentionIndex]?.scrollIntoView({ block: 'nearest' });
}

async function ensureMentionComposer() {
  const textarea = document.querySelector('#dni-mail-panel [data-mail-compose] textarea[name="body"]');
  if (!(textarea instanceof HTMLTextAreaElement) || textarea.dataset.mailV2Mentions === 'true') return;
  textarea.dataset.mailV2Mentions = 'true';
  await loadV2Directory().catch(() => null);
  const label = textarea.closest('label');
  if (!(label instanceof HTMLElement)) return;
  const menu = document.createElement('div');
  menu.className = 'dni-mail-v2-mention-menu';
  menu.dataset.mailV2MentionMenu = 'true';
  menu.hidden = true;
  label.append(menu);

  textarea.addEventListener('input', () => renderMentionMenu(textarea, menu));
  textarea.addEventListener('click', () => renderMentionMenu(textarea, menu));
  textarea.addEventListener('keydown', event => {
    if (menu.hidden || !mailV2.mentionMatches.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      mailV2.mentionIndex = (mailV2.mentionIndex + 1) % mailV2.mentionMatches.length;
      refreshMentionActive(menu);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      mailV2.mentionIndex = (mailV2.mentionIndex - 1 + mailV2.mentionMatches.length) % mailV2.mentionMatches.length;
      refreshMentionActive(menu);
    } else if (event.key === 'Enter' && mailV2.mentionIndex >= 0) {
      event.preventDefault();
      insertMention(textarea, mailV2.mentionMatches[mailV2.mentionIndex], menu);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMentionMenu(menu);
    }
  });
  textarea.addEventListener('blur', () => window.setTimeout(() => closeMentionMenu(menu), 120));
}

function bodyWithCurrentCdn(form, rawBody) {
  const clean = String(rawBody || '').trim();
  const uploads = [...form.closest('[data-mail-compose-shell]')?.querySelectorAll('.dni-mail-cdn-upload a') || []]
    .map(link => ({ name: String(link.textContent || 'DNI CDN file').trim(), url: String(link.href || '').trim() }))
    .filter(item => item.url.startsWith('https://cdn.dreadnoughtimperium.org/files/'));
  if (!uploads.length) return clean;
  const lines = uploads.map(item => `${item.name} | ${item.url}`);
  return `${clean}\n\n${CDN_BLOCK}\n${lines.join('\n')}`;
}

function collectRoleIds(role) {
  return selectedTargets(role).map(target => Number(target.id)).filter(Number.isInteger);
}

async function sendV2Compose(form) {
  await ensureRecipientUi();
  importLegacyRecipients();
  if (!mailV2.selected.to.size) {
    setComposeV2Status('SELECT AT LEAST ONE TO RECIPIENT.', 'error');
    return;
  }
  const submit = form.querySelector('button[type="submit"]');
  if (submit instanceof HTMLButtonElement) submit.disabled = true;
  setComposeV2Status('SENDING GROUP-AWARE DNI MAIL…');
  try {
    const rawBody = String(form.elements.namedItem('body')?.value || '').trim();
    const finalBody = bodyWithCurrentCdn(form, rawBody);
    if (!finalBody) throw new Error('Message body is required.');
    if (finalBody.length > 100000) throw new Error('Message body plus CDN references exceeds the DNI Mail limit.');
    const payload = {
      messageType: 'message',
      toUserIds: collectRoleIds('to'),
      ccUserIds: collectRoleIds('cc'),
      bccUserIds: collectRoleIds('bcc'),
      clearanceLevel: Number(form.elements.namedItem('clearanceLevel')?.value || 0),
      attachmentCodes: String(form.elements.namedItem('attachments')?.value || '').split(',').map(value => value.trim()).filter(Boolean),
      subject: String(form.elements.namedItem('subject')?.value || '').trim(),
      body: finalBody
    };
    const result = await v2Request('send', { method: 'POST', body: payload });
    const sentCode = result.sent?.message_code || 'DNI MAIL';

    let remove = form.closest('[data-mail-compose-shell]')?.querySelector('[data-mail-cdn-remove]');
    while (remove instanceof HTMLButtonElement) {
      remove.click();
      remove = form.closest('[data-mail-compose-shell]')?.querySelector('[data-mail-cdn-remove]');
    }
    form.reset();
    clearRecipients();
    form.closest('[data-mail-compose-shell]')?.querySelector('[data-mail-compose-close]')?.click();
    setComposeV2Status(`${sentCode} SENT`, 'success');
    await openSentView({ selectId: sentCode });
  } catch (error) {
    setComposeV2Status(String(error?.message || error || 'Unable to send DNI Mail.'), 'error');
  } finally {
    if (submit instanceof HTMLButtonElement) submit.disabled = false;
  }
}

function formatMailDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return String(value || 'DNI NETWORK');
  return date.toLocaleString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function targetShort(target) {
  return String(target?.name || target?.address || target?.label || 'DNI recipient');
}

function sentRecipientsText(message) {
  const to = Array.isArray(message.to) ? message.to : [];
  if (!to.length) return 'To: authorized recipient';
  const first = targetShort(to[0]);
  const more = Math.max(0, Number(message.recipient_count || to.length) - 1);
  return `To: ${first}${more ? ` +${more}` : ''}`;
}

function sentFolderButton() {
  return document.querySelector('#dni-mail-panel [data-mail-v2-sent]');
}

function ensureSentFolder() {
  const folders = document.querySelector('#dni-mail-panel .dni-mail-folders');
  if (!(folders instanceof HTMLElement)) return null;
  let button = folders.querySelector('[data-mail-v2-sent]');
  if (button) return button;
  button = document.createElement('button');
  button.type = 'button';
  button.className = 'dni-mail-folder';
  button.dataset.mailV2Sent = 'true';
  button.innerHTML = '<span class="dni-mail-folder-icon"></span><span>Sent</span><span class="dni-mail-folder-count" data-mail-v2-sent-count>0</span>';
  const unread = folders.querySelector('[data-mail-filter="unread"]');
  if (unread?.nextSibling) folders.insertBefore(button, unread.nextSibling);
  else folders.append(button);
  button.addEventListener('click', () => void openSentView());
  return button;
}

function setSentFolderActive(active) {
  mailV2.sentActive = Boolean(active);
  const button = sentFolderButton();
  button?.classList.toggle('is-active', mailV2.sentActive);
  if (mailV2.sentActive) {
    document.querySelectorAll('#dni-mail-panel [data-mail-filter]').forEach(node => node.classList.remove('is-active'));
  }
}

function setReaderEmpty(text) {
  const reader = document.querySelector('#dni-mail-reader');
  if (!reader) return;
  reader.className = 'dni-mail-reader-empty';
  reader.replaceChildren();
  const wrapper = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'module-kicker';
  kicker.textContent = 'SECURE MESSAGE READER';
  const copy = document.createElement('p');
  copy.textContent = text;
  wrapper.append(kicker, copy);
  reader.append(wrapper);
}

function renderSentList() {
  const panel = document.querySelector('#dni-mail-panel');
  const list = panel?.querySelector('#dni-mail-list');
  if (!list) return;
  const label = panel.querySelector('#dni-mail-filter-label');
  const count = panel.querySelector('#dni-mail-pane-count');
  if (label) label.textContent = 'SENT';
  if (count) count.textContent = `${mailV2.sentMessages.length} message${mailV2.sentMessages.length === 1 ? '' : 's'}`;
  const folderCount = panel.querySelector('[data-mail-v2-sent-count]');
  if (folderCount) folderCount.textContent = String(mailV2.sentMessages.length);
  list.replaceChildren();

  if (!mailV2.sentMessages.length) {
    const empty = document.createElement('div');
    empty.className = 'dni-mail-empty';
    empty.textContent = 'No sent DNI Mail yet.';
    list.append(empty);
    return;
  }
  for (const message of mailV2.sentMessages) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dni-mail-message';
    item.dataset.mailV2SentId = message.id;
    const top = document.createElement('div');
    top.className = 'dni-mail-message-top';
    const recipient = document.createElement('span');
    recipient.className = 'dni-mail-message-sender dni-mail-v2-sent-recipient';
    recipient.textContent = sentRecipientsText(message);
    const date = document.createElement('span');
    date.className = 'dni-mail-message-date';
    date.textContent = formatMailDate(message.sent_at);
    top.append(recipient, date);
    const subject = document.createElement('div');
    subject.className = 'dni-mail-message-subject';
    subject.textContent = message.subject || 'DNI Mail';
    const preview = document.createElement('div');
    preview.className = 'dni-mail-message-preview';
    preview.textContent = message.preview || '';
    const meta = document.createElement('div');
    meta.className = 'dni-mail-message-meta';
    for (const text of [message.group_message ? 'GROUP MESSAGE' : 'DIRECT', `CC ${message.cc?.length || 0}`, `BCC ${message.bcc?.length || 0}`, message.id]) {
      const chip = document.createElement('span');
      chip.className = text === message.id ? 'dni-mail-id' : 'dni-mail-type';
      chip.textContent = text;
      meta.append(chip);
    }
    item.append(top, subject, preview, meta);
    item.addEventListener('click', () => void openSentRecord(message.id));
    list.append(item);
  }
}

async function openSentView({ selectId = '' } = {}) {
  const panel = document.querySelector('#dni-mail-panel');
  if (!panel) return;
  setSentFolderActive(true);
  const list = panel.querySelector('#dni-mail-list');
  if (list) {
    list.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'dni-mail-empty';
    loading.textContent = 'LOADING SENT DNI MAIL…';
    list.append(loading);
  }
  setReaderEmpty('Select a sent message.');
  try {
    const payload = await v2Request('sent');
    mailV2.sentMessages = Array.isArray(payload.messages) ? payload.messages : [];
    if (!mailV2.sentActive) return;
    renderSentList();
    if (selectId && mailV2.sentMessages.some(message => String(message.id) === String(selectId))) await openSentRecord(selectId);
  } catch (error) {
    if (list) list.textContent = String(error?.message || error || 'Unable to load Sent DNI Mail.');
  }
}

function appendTargetLine(container, label, targets) {
  if (!Array.isArray(targets) || !targets.length) return;
  const row = document.createElement('span');
  const key = document.createElement('b');
  key.textContent = `${label}: `;
  row.append(key, document.createTextNode(targets.map(targetText).join(', ')));
  container.append(row);
}

function appendMentionText(container, text) {
  const source = String(text || '');
  // Match complete email addresses before standalone @mentions so DNI Mail
  // identities such as system@dni.org never render as gray text + gold domain.
  const regex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}|@[A-Za-z0-9._-]{1,64}/g;
  let cursor = 0;
  for (const match of source.matchAll(regex)) {
    const index = Number(match.index || 0);
    if (index > cursor) container.append(document.createTextNode(source.slice(cursor, index)));
    const token = document.createElement('span');
    token.className = match[0].startsWith('@') ? 'dni-mail-mention' : 'dni-mail-address';
    token.textContent = match[0];
    container.append(token);
    cursor = index + match[0].length;
  }
  if (cursor < source.length) container.append(document.createTextNode(source.slice(cursor)));
}

async function openSentRecord(id) {
  if (!mailV2.sentActive || !id) return;
  setReaderEmpty('VERIFYING SENT RECORD…');
  try {
    const payload = await v2Request('sent-record', { params: { id } });
    if (!mailV2.sentActive) return;
    const message = payload.message;
    const reader = document.querySelector('#dni-mail-reader');
    if (!reader || !message) return;
    reader.className = 'dni-mail-reader';
    reader.replaceChildren();

    const header = document.createElement('div');
    header.className = 'dni-mail-reader-header';
    const kicker = document.createElement('div');
    kicker.className = 'dni-mail-reader-kicker';
    kicker.textContent = 'SENT DNI MAIL';
    const subject = document.createElement('h3');
    subject.id = 'dni-mail-reader-title';
    subject.className = 'dni-mail-reader-subject';
    subject.textContent = message.subject || 'DNI Mail';
    const recipientMeta = document.createElement('div');
    recipientMeta.className = 'dni-mail-v2-recipient-meta';
    appendTargetLine(recipientMeta, 'TO', message.to);
    appendTargetLine(recipientMeta, 'CC', message.cc);
    appendTargetLine(recipientMeta, 'BCC', message.bcc);
    const date = document.createElement('span');
    const dateKey = document.createElement('b');
    dateKey.textContent = 'SENT: ';
    date.append(dateKey, document.createTextNode(formatMailDate(message.sent_at)));
    recipientMeta.append(date);
    const meta = document.createElement('div');
    meta.className = 'dni-mail-reader-meta';
    for (const text of [message.id, message.group_message ? 'GROUP MESSAGE' : 'DIRECT DNI MAIL', message.clearance?.code || 'CLASSIFIED', 'SENDER COPY']) {
      const chip = document.createElement('span');
      chip.textContent = text;
      meta.append(chip);
    }
    header.append(kicker, subject, recipientMeta, meta);

    const body = document.createElement('div');
    body.className = 'dni-mail-reader-body dni-mail-v2-sent-body';
    appendMentionText(body, message.body || '');
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    if (attachments.length) {
      const section = document.createElement('section');
      section.className = 'dni-mail-attachments';
      const title = document.createElement('strong');
      title.textContent = 'AUTHORIZED DOCUMENT ATTACHMENTS';
      section.append(title);
      for (const attachment of attachments) {
        const row = document.createElement('div');
        const link = document.createElement('a');
        link.href = attachment.download_url || '#';
        link.textContent = `${attachment.file_code || 'DNI'} — ${attachment.title || attachment.name || 'Document'}`;
        const clearance = document.createElement('span');
        clearance.textContent = attachment.clearance?.code || 'CLASSIFIED';
        row.append(link, clearance);
        section.append(row);
      }
      body.append(document.createElement('br'), section);
    }
    const notice = document.createElement('div');
    notice.className = 'dni-mail-reader-security';
    notice.textContent = 'SENT COPY // BCC RECIPIENTS ARE VISIBLE ONLY TO THE SENDER // DELIVERY AUTHORIZATION SERVER ENFORCED';
    reader.append(header, body, notice);
  } catch (error) {
    setReaderEmpty(String(error?.message || error || 'Sent DNI Mail record unavailable.'));
  }
}

function highlightCoreReaderMentions(reader) {
  const body = reader?.querySelector('.dni-mail-reader-body');
  if (!(body instanceof HTMLElement) || body.dataset.mailV2Mentions === 'true') return;
  body.dataset.mailV2Mentions = 'true';
  for (const node of [...body.childNodes]) {
    if (node.nodeType !== Node.TEXT_NODE || !String(node.nodeValue || '').includes('@')) continue;
    const fragment = document.createDocumentFragment();
    appendMentionText(fragment, node.nodeValue || '');
    node.replaceWith(fragment);
  }
}

async function enhanceCurrentReader() {
  if (mailV2.sentActive) return;
  const reader = document.querySelector('#dni-mail-reader.dni-mail-reader');
  if (!(reader instanceof HTMLElement)) return;
  highlightCoreReaderMentions(reader);
  if (reader.querySelector('[data-mail-v2-recipient-meta]')) return;
  const id = [...reader.querySelectorAll('.dni-mail-reader-meta span')]
    .map(node => String(node.textContent || '').trim())
    .find(value => /^MAIL-\d+$/i.test(value));
  if (!id) return;
  try {
    const payload = await v2Request('record-meta', { params: { id } });
    if (mailV2.sentActive || !reader.isConnected || reader.querySelector('[data-mail-v2-recipient-meta]')) return;
    const meta = payload.meta;
    const box = document.createElement('div');
    box.className = 'dni-mail-v2-recipient-meta';
    box.dataset.mailV2RecipientMeta = 'true';
    appendTargetLine(box, 'TO', meta.to);
    appendTargetLine(box, 'CC', meta.cc);
    if (meta.bccVisible) appendTargetLine(box, 'BCC', meta.bcc);
    if (meta.isBccRecipient) {
      const row = document.createElement('span');
      const key = document.createElement('b');
      key.textContent = 'BCC: ';
      row.append(key, document.createTextNode('You received this message as a hidden recipient.'));
      box.append(row);
    }
    if (meta.groupMessage) {
      const group = document.createElement('span');
      const key = document.createElement('b');
      key.textContent = 'DELIVERY: ';
      group.append(key, document.createTextNode('Group message'));
      box.append(group);
    }
    const senderRow = reader.querySelector('.dni-mail-sender-row');
    if (senderRow?.nextSibling) reader.querySelector('.dni-mail-reader-header')?.insertBefore(box, senderRow.nextSibling);
    else reader.querySelector('.dni-mail-reader-header')?.append(box);
  } catch {
    // Recipient-role metadata is additive. Core mail reading remains available.
  }
}

async function refreshSentCount() {
  try {
    const payload = await v2Request('sent');
    mailV2.sentMessages = Array.isArray(payload.messages) ? payload.messages : [];
    const count = document.querySelector('#dni-mail-panel [data-mail-v2-sent-count]');
    if (count) count.textContent = String(mailV2.sentMessages.length);
  } catch {
    // Sent count should never block the core mailbox.
  }
}

async function ensureMailV2() {
  installMailV2Styles();
  const panel = document.querySelector('#dni-mail-panel');
  if (!panel) return;
  ensureSentFolder();
  await ensureRecipientUi();
  await ensureMentionComposer();
}

function bindMailV2Events() {
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('#dni-mail-panel [data-mail-compose]')) return;
    const type = String(form.elements.namedItem('messageType')?.value || 'message');
    if (type !== 'message') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void sendV2Compose(form);
  }, true);

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#dni-mail-panel [data-mail-compose-launch]')) {
      window.setTimeout(() => {
        void ensureRecipientUi();
        void ensureMentionComposer();
      }, 0);
      return;
    }
    if (target.closest('#dni-mail-panel [data-mail-filter]')) {
      setSentFolderActive(false);
      return;
    }
    if (!mailV2.sentActive && target.closest('#dni-mail-panel #dni-mail-list .dni-mail-message')) {
      for (const delay of [80, 220, 600]) window.setTimeout(() => void enhanceCurrentReader(), delay);
    }
  }, true);

  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel !== 'mail') return;
    void ensureMailV2();
    void refreshSentCount();
  });
  window.addEventListener('dni:mail-realtime-delta', () => {
    if (mailV2.sentActive) void openSentView();
  });
}

installMailV2Styles();
bindMailV2Events();
for (const delay of [0, 120, 450, 1200]) {
  window.setTimeout(() => {
    void ensureMailV2();
    if (delay === 450) void refreshSentCount();
  }, delay);
}
