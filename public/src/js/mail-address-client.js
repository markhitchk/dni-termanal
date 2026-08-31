import './mail-upload-button.js';

const DNI_ADDRESS_DOMAIN = '@dni.org';

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
  return /^[a-z0-9._]+@dni\.org$/.test(address);
}

function optionAddress(option) {
  const text = String(option?.textContent || '');
  const match = text.match(/<([^<>]+@dni\.org)>/i);
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

function syncRecipientSelection(select, input, messageType, { report = false } = {}) {
  for (const option of [...select.options]) option.selected = false;
  input.setCustomValidity('');

  if (messageType !== 'message') return true;

  const addresses = parseAddresses(input.value);
  if (!addresses.length) {
    input.setCustomValidity('Enter a DNI recipient such as username@dni.org.');
    if (report) input.reportValidity();
    return false;
  }

  const map = directoryMap(select);
  for (const address of addresses) {
    if (!validDniSyntax(address)) {
      input.setCustomValidity(`Invalid DNI address: ${address}. Use username@dni.org.`);
      if (report) input.reportValidity();
      return false;
    }
    const option = map.get(address);
    if (!option) {
      input.setCustomValidity(`Unknown DNI recipient: ${address}. Use an active user's username@dni.org address.`);
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
  input.placeholder = 'username@dni.org';
  input.autocomplete = 'off';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.setAttribute('list', listId);
  input.setAttribute('aria-label', 'DNI Mail recipient address');

  const datalist = document.createElement('datalist');
  datalist.id = listId;
  const help = document.createElement('span');
  help.className = 'dni-mail-to-help';
  help.innerHTML = '<strong>DNI ADDRESS</strong> // Type the user\'s lowercase username@dni.org. Separate multiple recipients with commas.';

  field.insertBefore(input, select);
  field.append(datalist, help);

  const rebuild = () => rebuildSuggestions(select, datalist);
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
