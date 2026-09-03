const DNI_ADDRESS_DOMAINS = new Set([
  'dni.org',
  'admin.dni.org',
  'dev.dni.org',
  'owner.dni.org',
  'citizen.dni.org',
  'support.dni.org'
]);

const DNI_SUPPORT_ADDRESSES = [
  ['General Support', 'general@support.dni.org'],
  ['Developer Support', 'dev@support.dni.org'],
  ['Administration', 'admin@support.dni.org']
];

function installAddressClientStyles() {
  if (document.querySelector('style[data-dni-mail-address-client-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailAddressClientStyle = 'true';
  style.textContent = `
    .dni-mail-recipient-select-native{display:none!important}
    .dni-mail-to-input{display:block;width:100%;margin-top:6px;border:1px solid #303030;background:#070707;color:#efefef;padding:10px 11px;font:700 11px/1.35 "Courier New",monospace;box-sizing:border-box}
    .dni-mail-to-input:focus{outline:none;border-color:#c8a866;box-shadow:0 0 0 1px rgba(200,168,102,.2)}
    .dni-mail-to-input:invalid{border-color:#b9282e}
    .dni-mail-to-help{display:block;margin-top:6px;color:#7f7f7f;font:700 9px/1.4 "Courier New",monospace}
    .dni-mail-to-help strong{color:#c8a866}
    .dni-mail-support-picks{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .dni-mail-support-pick{appearance:none;border:1px solid #4b422f;background:#11100d;color:#d8c28b;padding:7px 9px;font:700 9px/1.2 "Courier New",monospace;cursor:pointer;min-height:32px}
    .dni-mail-support-pick:hover,.dni-mail-support-pick:focus{border-color:#c8a866;color:#f0d99f;outline:none}
    .dni-mail-support-pick[disabled]{display:none}
    @media (max-width:720px){
      .dni-mail-to-input{font-size:16px;min-height:46px;padding:11px 12px}
      .dni-mail-support-picks{display:grid;grid-template-columns:1fr;gap:7px;margin-top:9px}
      .dni-mail-support-pick{width:100%;min-height:42px;text-align:left;font-size:10px;padding:9px 10px}
      .dni-mail-to-help{font-size:9px;line-height:1.5}
    }
  `;
  document.head.append(style);
}

function normalizeAddress(value = '') {
  let address = String(value).trim().toLowerCase();
  const bracket = address.match(/<([^<>]+)>/);
  if (bracket) address = bracket[1].trim().toLowerCase();
  return address;
}

function parseAddresses(value = '') {
  return [...new Set(
    String(value)
      .split(/[\s,;]+/)
      .map(normalizeAddress)
      .filter(Boolean)
  )];
}

function validDniSyntax(address) {
  const match = String(address || '').match(/^([a-z0-9][a-z0-9._-]{0,63})@([a-z0-9.-]+)$/);
  return !!match && DNI_ADDRESS_DOMAINS.has(match[2]);
}

function optionAddress(option) {
  const text = String(option?.textContent || '');
  const match = text.match(/<([^<>\s]+@(?:owner\.|dev\.|admin\.|citizen\.|support\.)?dni\.org)>/i);
  return match ? normalizeAddress(match[1]) : '';
}

function directoryMap(select) {
  const map = new Map();
  for (const option of [...select.options]) {
    const address = optionAddress(option);
    if (address) map.set(address, option);
  }
  return map;
}

function rebuildSuggestions(select, datalist) {
  datalist.replaceChildren();
  for (const option of [...select.options]) {
    const address = optionAddress(option);
    if (!address) continue;
    const item = document.createElement('option');
    item.value = address;
    const label = String(option.textContent || '').replace(/\s*<[^<>]+>\s*$/, '').trim();
    if (label) item.label = label;
    datalist.append(item);
  }
}

function refreshSupportPicks(select, picks) {
  const map = directoryMap(select);
  for (const button of picks.querySelectorAll('[data-dni-support-address]')) {
    const address = normalizeAddress(button.dataset.dniSupportAddress || '');
    button.disabled = !map.has(address);
  }
}

function syncRecipientSelection(select, input, messageType, { report = false } = {}) {
  for (const option of [...select.options]) option.selected = false;
  input.setCustomValidity('');

  if (messageType !== 'message') return true;

  const addresses = parseAddresses(input.value);
  if (!addresses.length) {
    input.setCustomValidity('Enter a DNI Mail recipient address.');
    if (report) input.reportValidity();
    return false;
  }

  const map = directoryMap(select);
  for (const address of addresses) {
    if (!validDniSyntax(address)) {
      input.setCustomValidity(`Invalid DNI Mail address: ${address}.`);
      if (report) input.reportValidity();
      return false;
    }
    const option = map.get(address);
    if (!option) {
      input.setCustomValidity(`Unknown DNI Mail recipient: ${address}. Use an active user's listed DNI Mail address or a listed support address.`);
      if (report) input.reportValidity();
      return false;
    }
    option.selected = true;
  }

  return true;
}

function upgradeRecipientField(panel) {
  const select = panel.querySelector('[data-mail-recipients]');
  const form = panel.querySelector('[data-mail-compose]');
  const typeSelect = panel.querySelector('[data-mail-type]');
  if (!(select instanceof HTMLSelectElement) || !(form instanceof HTMLFormElement) || !(typeSelect instanceof HTMLSelectElement)) return;
  if (select.dataset.dniAddressClient === 'true') return;
  select.dataset.dniAddressClient = 'true';
  select.classList.add('dni-mail-recipient-select-native');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;

  const field = select.closest('[data-mail-recipient-field]') || select.parentElement;
  if (!(field instanceof HTMLElement)) return;
  const firstNode = field.firstChild;
  if (firstNode?.nodeType === Node.TEXT_NODE) firstNode.textContent = 'To';

  const listId = `dni-mail-addresses-${Math.random().toString(36).slice(2)}`;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'dni-mail-to-input';
  input.name = 'recipientAddressesUi';
  input.placeholder = 'name@dni.org or general@support.dni.org';
  input.autocomplete = 'off';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.setAttribute('list', listId);
  input.setAttribute('aria-label', 'DNI Mail recipient address');

  const datalist = document.createElement('datalist');
  datalist.id = listId;

  const picks = document.createElement('div');
  picks.className = 'dni-mail-support-picks';
  picks.setAttribute('aria-label', 'DNI Mail support recipients');
  for (const [label, address] of DNI_SUPPORT_ADDRESSES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dni-mail-support-pick';
    button.dataset.dniSupportAddress = address;
    button.textContent = `${label} · ${address}`;
    button.addEventListener('click', () => {
      input.value = address;
      input.setCustomValidity('');
      syncRecipientSelection(select, input, typeSelect.value || 'message', { report: true });
      input.focus({ preventScroll: true });
    });
    picks.append(button);
  }

  const help = document.createElement('span');
  help.className = 'dni-mail-to-help';
  help.innerHTML = '<strong>DNI ADDRESS</strong> // Type an exact DNI address, or tap one of the support recipients above.';

  field.insertBefore(input, select);
  field.append(datalist, picks, help);

  const rebuild = () => {
    rebuildSuggestions(select, datalist);
    refreshSupportPicks(select, picks);
  };
  rebuild();
  const optionsObserver = new MutationObserver(rebuild);
  optionsObserver.observe(select, { childList: true });

  input.addEventListener('input', () => {
    input.setCustomValidity('');
    syncRecipientSelection(select, input, typeSelect.value || 'message');
  });
  input.addEventListener('blur', () => {
    const addresses = parseAddresses(input.value);
    if (addresses.length) input.value = addresses.join(', ');
    syncRecipientSelection(select, input, typeSelect.value || 'message');
  });
  typeSelect.addEventListener('change', () => {
    input.setCustomValidity('');
    syncRecipientSelection(select, input, typeSelect.value || 'message');
  });

  form.addEventListener('submit', event => {
    const ok = syncRecipientSelection(select, input, typeSelect.value || 'message', { report: true });
    if (ok) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });

  const composeShell = panel.querySelector('[data-mail-compose-shell]');
  if (composeShell instanceof HTMLElement) {
    const composeObserver = new MutationObserver(() => {
      if (!composeShell.hidden && (typeSelect.value || 'message') === 'message') {
        window.setTimeout(() => input.focus({ preventScroll: true }), 0);
      }
    });
    composeObserver.observe(composeShell, { attributes: true, attributeFilter: ['hidden'] });
  }
}

function scan() {
  const panel = document.querySelector('#dni-mail-panel');
  if (panel instanceof HTMLElement) upgradeRecipientField(panel);
}

installAddressClientStyles();
scan();
const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });