const PREFILL_URL = '/admin-role-prefill.php';

let activeController = null;
let activeForm = null;
let activePayload = null;

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
  `;
  document.head.append(style);
}

function unlockMailField(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const input = form.querySelector('[data-admin-mail-address]');
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
  note.innerHTML = `<strong>DISCORD ROLE PREFILL</strong> · ${buildSummary(payload)}${appliedCopy}${roleAdminCopy}${hasSuggestions ? '<div class="dni-admin-role-prefill-actions"><button type="button" class="dni-admin-role-prefill-button" data-admin-apply-role-prefill>APPLY ROLE PREFILL</button></div>' : ''}`;
  unlockMailField(form);
}

async function loadForForm(form) {
  const userId = Number(form.elements?.userId?.value || 0);
  if (!userId) return;
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

function scan() {
  installStyles();
  const form = document.querySelector('form[data-admin-form="save-user"]');
  if (form instanceof HTMLFormElement) {
    unlockMailField(form);
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

const observer = new MutationObserver(() => scan());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') queueMicrotask(scan);
});
scan();
