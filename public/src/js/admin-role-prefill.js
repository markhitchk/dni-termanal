const PREFILL_URL = '/admin-role-prefill.php';
const ADMIN_MAIL_URL = '/admin-mail-address.php';

let activeController = null;
let activeForm = null;
let activePayload = null;
let mailDirectoryPromise = null;
let mailDirectory = new Map();
let mailCsrfToken = '';

function installStyles() {
  if (document.querySelector('#dni-admin-role-prefill-style')) return;
  const style = document.createElement('style');
  style.id = 'dni-admin-role-prefill-style';
  style.textContent = `
    .dni-admin-role-prefill{border-color:#245568;background:#071318;color:#9dc8d3}
    .dni-admin-role-prefill strong{color:#d7f6ff}
    .dni-admin-role-prefill small{display:block;margin-top:5px;color:#668e98;font:8px/1.5 "Courier New",monospace;letter-spacing:.7px}
    .dni-admin-role-prefill-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
    .dni-admin-role-prefill-button{border:1px solid #326779;background:#0b1d24;color:#dff8ff;padding:7px 9px;font:700 8px/1 "Courier New",monospace;letter-spacing:.8px;cursor:pointer}
    .dni-admin-role-prefill-button:hover,.dni-admin-role-prefill-button:focus-visible{border-color:#72c7df;outline:1px solid #72c7df;outline-offset:1px}
    .dni-admin-mail-address input[data-admin-mail-address]{pointer-events:auto!important;user-select:text!important;-webkit-user-select:text!important;cursor:text!important;opacity:1!important}
    .dni-admin-mail-address small{display:block;color:#777;font:8px/1.45 "Courier New",monospace;letter-spacing:.45px;text-transform:none}
  `;
  document.head.append(style);
}

function setText(node, value) {
  if (!(node instanceof HTMLElement)) return;
  const next = String(value ?? '');
  if (node.textContent !== next) node.textContent = next;
}

function normalizeMailEntry(value) {
  if (!value || typeof value !== 'object') return null;
  const id = Number(value.id || 0);
  const address = String(value.address || '').trim().toLowerCase();
  const mailDomain = String(value.mailDomain || '').trim().toLowerCase();
  if (id < 1 || !address || !mailDomain) return null;
  return {
    id,
    address,
    mailDomain,
    identityType: String(value.identityType || 'member')
  };
}

async function loadMailDirectory(force = false) {
  if (!force && mailDirectory.size) return mailDirectory;
  if (!mailDirectoryPromise) {
    mailDirectoryPromise = fetch(`${ADMIN_MAIL_URL}?action=directory`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `DNI Admin mail directory HTTP ${response.status}`);
      const rows = Array.isArray(payload.users) ? payload.users : Object.values(payload.users || {});
      const next = new Map();
      for (const row of rows) {
        const entry = normalizeMailEntry(row);
        if (entry) next.set(entry.id, entry);
      }
      mailDirectory = next;
      mailCsrfToken = String(payload.csrfToken || mailCsrfToken || '');
      return mailDirectory;
    }).finally(() => {
      mailDirectoryPromise = null;
    });
  }
  return mailDirectoryPromise;
}

function ensureMailField(form) {
  if (!(form instanceof HTMLFormElement)) return null;
  let field = form.querySelector('[data-admin-mail-address-field]');
  if (!(field instanceof HTMLElement)) {
    field = document.createElement('label');
    field.className = 'wide dni-admin-mail-address';
    field.dataset.adminMailAddressField = 'true';
    field.append(document.createTextNode('DNI Mail Address'));

    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'mailAddressUi';
    input.dataset.adminMailAddress = 'true';
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.maxLength = 160;
    input.placeholder = 'Loading DNI Mail address…';
    field.append(input);

    const help = document.createElement('small');
    help.dataset.adminMailAddressHelp = 'true';
    help.textContent = 'Loading assigned DNI Mail address…';
    field.append(help);

    const otherStatus = form.elements?.otherStatus;
    const otherStatusField = otherStatus instanceof HTMLElement ? otherStatus.closest('label') : null;
    if (otherStatusField) otherStatusField.insertAdjacentElement('beforebegin', field);
    else {
      const directAdmin = form.elements?.directAdmin;
      const directAdminField = directAdmin instanceof HTMLElement ? directAdmin.closest('label') : null;
      if (directAdminField) directAdminField.insertAdjacentElement('beforebegin', field);
      else {
        const actions = form.querySelector('.dni-admin-actions.wide');
        if (actions) actions.insertAdjacentElement('beforebegin', field);
        else form.append(field);
      }
    }
  }

  const input = field.querySelector('[data-admin-mail-address]');
  if (!(input instanceof HTMLInputElement)) return null;
  if (input.dataset.adminMailDirtyBound !== '1') {
    input.dataset.adminMailDirtyBound = '1';
    input.addEventListener('input', () => {
      input.dataset.adminMailDirty = '1';
      input.setCustomValidity('');
    });
    input.addEventListener('blur', () => {
      input.value = input.value.trim().toLowerCase();
    });
  }
  return input;
}

function unlockMailField(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const input = ensureMailField(form);
  if (!(input instanceof HTMLInputElement)) return;

  input.readOnly = false;
  input.disabled = false;
  input.removeAttribute('readonly');
  input.removeAttribute('disabled');
  input.removeAttribute('aria-readonly');
  input.removeAttribute('inert');
  input.tabIndex = 0;
  input.style.pointerEvents = 'auto';
  input.style.userSelect = 'text';
  input.style.webkitUserSelect = 'text';
  input.style.cursor = 'text';
  input.setAttribute('aria-label', 'Editable DNI Mail Address');

  const field = input.closest('[data-admin-mail-address-field]');
  if (field instanceof HTMLElement) {
    field.removeAttribute('inert');
    field.style.pointerEvents = 'auto';
  }
}

async function loadMailForForm(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const userId = Number(form.elements?.userId?.value || 0);
  if (userId < 1) return;

  const input = ensureMailField(form);
  if (!(input instanceof HTMLInputElement)) return;
  unlockMailField(form);

  if (form.dataset.dniMailLoadedUser === String(userId)) return;
  if (form.dataset.dniMailLoadingUser === String(userId)) return;
  form.dataset.dniMailLoadingUser = String(userId);
  input.dataset.adminMailUserId = String(userId);

  try {
    const directory = await loadMailDirectory();
    if (!form.isConnected || Number(form.elements?.userId?.value || 0) !== userId) return;
    const entry = directory.get(userId);
    const help = form.querySelector('[data-admin-mail-address-help]');
    if (!entry) {
      input.placeholder = 'DNI Mail address unavailable';
      input.dataset.adminMailReady = '0';
      setText(help, 'No DNI Mail address record was returned for this user.');
      return;
    }

    input.dataset.adminMailDomain = entry.mailDomain;
    input.dataset.adminMailReady = '1';
    input.placeholder = `username@${entry.mailDomain}`;
    if (input.dataset.adminMailDirty !== '1' && input.value !== entry.address) input.value = entry.address;
    setText(help, `${entry.identityType.toUpperCase()} domain · @${entry.mailDomain} · Edit the address name; clear the field to reset it to the Discord username.`);
    form.dataset.dniMailLoadedUser = String(userId);
  } catch (error) {
    console.warn('DNI Admin mail address display unavailable', error);
    input.placeholder = 'DNI Mail address unavailable';
    input.dataset.adminMailReady = '0';
    setText(form.querySelector('[data-admin-mail-address-help]'), 'DNI Mail address service is currently unavailable.');
  } finally {
    if (form.dataset.dniMailLoadingUser === String(userId)) delete form.dataset.dniMailLoadingUser;
  }
}

async function saveMailForForm(form) {
  if (!(form instanceof HTMLFormElement)) return null;
  const userId = Number(form.elements?.userId?.value || 0);
  const input = form.querySelector('[data-admin-mail-address]');
  if (userId < 1 || !(input instanceof HTMLInputElement)) return null;
  if (input.dataset.adminMailReady !== '1' || input.dataset.adminMailDirty !== '1') return null;

  const entry = mailDirectory.get(userId);
  const expectedDomain = String(entry?.mailDomain || input.dataset.adminMailDomain || '').toLowerCase();
  const address = input.value.trim().toLowerCase();
  input.setCustomValidity('');

  if (address) {
    const match = address.match(/^([a-z0-9][a-z0-9._-]{0,63})@([a-z0-9.-]+)$/);
    if (!match) {
      input.setCustomValidity('Enter a valid DNI Mail address.');
      input.reportValidity();
      throw new Error('Enter a valid DNI Mail address.');
    }
    if (expectedDomain && match[2] !== expectedDomain) {
      input.setCustomValidity(`This user must use the @${expectedDomain} DNI Mail domain.`);
      input.reportValidity();
      throw new Error(`This user must use the @${expectedDomain} DNI Mail domain.`);
    }
  }

  if (!mailCsrfToken) await loadMailDirectory(true);
  const response = await fetch(`${ADMIN_MAIL_URL}?action=save`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-DNI-CSRF': mailCsrfToken
    },
    body: JSON.stringify({ userId, mailAddress: address })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI Admin mail address HTTP ${response.status}`);

  const saved = normalizeMailEntry(payload.user);
  if (saved) {
    mailDirectory.set(saved.id, saved);
    input.value = saved.address;
    input.dataset.adminMailDomain = saved.mailDomain;
  }
  mailCsrfToken = String(payload.csrfToken || mailCsrfToken || '');
  input.dataset.adminMailDirty = '0';
  return saved;
}

function suggestionLabel(item) {
  if (!item) return '';
  const name = String(item.name || item.code || item.id || '').trim();
  const source = String(item.sourceRole || '').trim();
  return source ? `${name} ← ${source}` : name;
}

function setSuggestedValue(form, fieldName, suggestion, force = false) {
  if (!suggestion?.id) return false;
  const field = form.elements?.[fieldName];
  if (!(field instanceof HTMLSelectElement)) return false;
  if (!force && String(field.value || '') !== '') return false;
  const wanted = String(suggestion.id);
  if (![...field.options].some(item => item.value === wanted)) return false;
  field.value = wanted;
  field.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function applyPayload(form, payload, force = false) {
  if (!form || !payload?.suggestions) return [];
  const applied = [];

  const displayName = form.elements?.displayName;
  if (displayName instanceof HTMLInputElement && (force || !displayName.value.trim()) && payload.displayName) {
    displayName.value = String(payload.displayName);
    applied.push('display name');
  }

  const pairs = [
    ['rankId', 'rank', 'rank'],
    ['corpId', 'corp', 'corps'],
    ['sectorId', 'sector', 'sector'],
    ['fleetId', 'fleet', 'fleet']
  ];
  for (const [fieldName, suggestionKey, label] of pairs) {
    if (setSuggestedValue(form, fieldName, payload.suggestions[suggestionKey], force)) applied.push(label);
  }
  return applied;
}

function buildSummary(payload) {
  const suggestions = payload?.suggestions || {};
  const items = [
    suggestionLabel(suggestions.rank) ? `Rank ${suggestionLabel(suggestions.rank)}` : '',
    suggestionLabel(suggestions.corp) ? `Corps ${suggestionLabel(suggestions.corp)}` : '',
    suggestionLabel(suggestions.sector) ? `Sector ${suggestionLabel(suggestions.sector)}` : '',
    suggestionLabel(suggestions.fleet) ? `Fleet ${suggestionLabel(suggestions.fleet)}` : ''
  ].filter(Boolean);
  if (!items.length) return 'Discord roles are synchronized, but none currently map to a personnel rank, corps, sector, or fleet field.';
  return items.join(' · ');
}

function renderNote(form, payload, applied = []) {
  let note = form.querySelector('[data-admin-role-prefill-note]');
  if (!note) {
    note = document.createElement('div');
    note.className = 'dni-admin-notice dni-admin-role-prefill wide';
    note.dataset.adminRolePrefillNote = 'true';
    const actions = form.querySelector('.dni-admin-actions.wide');
    if (actions) actions.insertAdjacentElement('beforebegin', note);
    else form.append(note);
  }

  const roleAdminCopy = payload.roleAdmin
    ? '<small>Discord currently grants DNI Admin access through an authorized role. The “Direct DNI Admin permission” checkbox remains a separate manual grant.</small>'
    : '<small>Saved personnel values are preserved. Discord suggestions automatically fill only blank fields unless APPLY ROLE PREFILL is pressed.</small>';

  const appliedCopy = applied.length
    ? `<small>Auto-filled: ${applied.join(', ')}. Review the values, then use SAVE USER / PERSONNEL to persist them.</small>`
    : '';

  const hasSuggestions = Object.values(payload.suggestions || {}).some(Boolean);
  const next = `<strong>DISCORD ROLE PREFILL</strong> · ${buildSummary(payload)}${appliedCopy}${roleAdminCopy}${hasSuggestions ? '<div class="dni-admin-role-prefill-actions"><button type="button" class="dni-admin-role-prefill-button" data-admin-apply-role-prefill>APPLY ROLE PREFILL</button></div>' : ''}`;
  if (note.innerHTML !== next) note.innerHTML = next;
  unlockMailField(form);
}

async function loadForForm(form) {
  const userId = Number(form.elements?.userId?.value || 0);
  if (!userId) return;
  void loadMailForForm(form);
  if (form.dataset.dniRolePrefillUser === String(userId)) {
    unlockMailField(form);
    return;
  }
  form.dataset.dniRolePrefillUser = String(userId);

  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  activeForm = form;
  activePayload = null;

  try {
    const response = await fetch(`${PREFILL_URL}?userId=${encodeURIComponent(userId)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `DNI role prefill HTTP ${response.status}`);
    if (!form.isConnected || Number(form.elements?.userId?.value || 0) !== userId) return;

    activeForm = form;
    activePayload = payload;
    const applied = applyPayload(form, payload, false);
    renderNote(form, payload, applied);
    unlockMailField(form);
  } catch (error) {
    if (controller.signal.aborted) return;
    console.warn('DNI Admin Discord role prefill unavailable', error);
    unlockMailField(form);
  }
}

let scanQueued = false;

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  queueMicrotask(scan);
}

function scan() {
  scanQueued = false;
  installStyles();
  const form = document.querySelector('form[data-admin-form="save-user"]');
  if (form instanceof HTMLFormElement) {
    ensureMailField(form);
    unlockMailField(form);
    void loadMailForForm(form);
    void loadForForm(form);
  }
}

document.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('[data-admin-apply-role-prefill]') : null;
  if (!button) return;
  const form = button.closest('form[data-admin-form="save-user"]');
  if (!(form instanceof HTMLFormElement) || form !== activeForm || !activePayload) return;
  const applied = applyPayload(form, activePayload, true);
  renderNote(form, activePayload, applied);
  unlockMailField(form);
  window.DNIAlerts?.info?.(
    applied.length
      ? `Discord role prefill applied to ${applied.join(', ')}. Review the values and select SAVE USER / PERSONNEL to persist the changes.`
      : 'No mapped Discord role values are available to apply for this user.',
    { title: 'DISCORD ROLE PREFILL' }
  );
});

document.addEventListener('submit', event => {
  const form = event.target instanceof Element ? event.target.closest('form[data-admin-form="save-user"]') : null;
  if (!(form instanceof HTMLFormElement)) return;
  const input = form.querySelector('[data-admin-mail-address]');
  if (!(input instanceof HTMLInputElement) || input.dataset.adminMailDirty !== '1') return;

  const panel = form.closest('[data-module="admin"]');
  if (panel instanceof HTMLElement && panel.dataset.adminControlsHardened === '7') return;

  const address = input.value.trim().toLowerCase();
  const expectedDomain = String(input.dataset.adminMailDomain || '').toLowerCase();
  input.setCustomValidity('');
  if (address) {
    const match = address.match(/^([a-z0-9][a-z0-9._-]{0,63})@([a-z0-9.-]+)$/);
    if (!match || (expectedDomain && match[2] !== expectedDomain)) {
      event.preventDefault();
      event.stopPropagation();
      input.setCustomValidity(!match ? 'Enter a valid DNI Mail address.' : `This user must use the @${expectedDomain} DNI Mail domain.`);
      input.reportValidity();
      return;
    }
  }

  void saveMailForForm(form).catch(error => {
    console.error('DNI Admin mail address save failed', error);
    window.DNIAlerts?.error?.(error.message || 'DNI Mail address could not be saved.');
    if (!window.DNIAlerts?.error) window.alert(error.message || 'DNI Mail address could not be saved.');
  });
}, true);

const adminRoot = document.querySelector('[data-module="admin"]');
if (adminRoot) {
  const observer = new MutationObserver(queueScan);
  observer.observe(adminRoot, { childList: true, subtree: true });
}
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') queueMicrotask(scan);
});
scan();
