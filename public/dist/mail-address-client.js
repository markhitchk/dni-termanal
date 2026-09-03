const DNI_ADDRESS_DOMAINS = new Set([
  'dni.org',
  'admin.dni.org',
  'dev.dni.org',
  'owner.dni.org',
  'citizen.dni.org',
  'support.dni.org'
]);

function installAddressClientStyles() {
  if (document.querySelector('style[data-dni-mail-address-client-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailAddressClientStyle = 'true';
  style.textContent = `
    .dni-mail-recipient-select-native{display:none!important}
    .dni-mail-combobox{position:relative;margin-top:6px}
    .dni-mail-combobox-row{display:grid;grid-template-columns:minmax(0,1fr) auto}
    .dni-mail-to-input{display:block;width:100%;min-width:0;border:1px solid #303030;border-right:0;background:#070707;color:#efefef;padding:10px 11px;font:700 11px/1.35 "Courier New",monospace;box-sizing:border-box}
    .dni-mail-to-input:focus{outline:none;border-color:#c8a866;box-shadow:0 0 0 1px rgba(200,168,102,.2)}
    .dni-mail-to-input:invalid{border-color:#b9282e}
    .dni-mail-recipient-toggle{appearance:none;min-width:42px;border:1px solid #303030;background:#111;color:#c8a866;font:700 14px/1 "Courier New",monospace;cursor:pointer}
    .dni-mail-recipient-toggle:hover,.dni-mail-recipient-toggle:focus{border-color:#c8a866;outline:none;background:#17140d}
    .dni-mail-recipient-toggle[aria-expanded="true"]{border-color:#c8a866;background:#17140d}
    .dni-mail-recipient-menu{position:absolute;z-index:80;left:0;right:0;top:calc(100% + 4px);max-height:260px;overflow:auto;border:1px solid #4b422f;background:#080808;box-shadow:0 12px 28px rgba(0,0,0,.48);padding:4px}
    .dni-mail-recipient-menu[hidden]{display:none!important}
    .dni-mail-recipient-option{display:block;width:100%;appearance:none;border:0;border-bottom:1px solid #1d1d1d;background:transparent;color:#ddd;text-align:left;padding:9px 10px;font:700 10px/1.35 "Courier New",monospace;cursor:pointer}
    .dni-mail-recipient-option:last-child{border-bottom:0}
    .dni-mail-recipient-option:hover,.dni-mail-recipient-option:focus,.dni-mail-recipient-option.is-active{outline:none;background:#17140d;color:#f0d99f}
    .dni-mail-recipient-option-name{display:block;color:#d8c28b}
    .dni-mail-recipient-option-address{display:block;margin-top:2px;color:#888;font-size:9px;overflow-wrap:anywhere}
    .dni-mail-recipient-empty{padding:10px;color:#777;font:700 9px/1.4 "Courier New",monospace}
    .dni-mail-to-help{display:block;margin-top:6px;color:#7f7f7f;font:700 9px/1.4 "Courier New",monospace}
    .dni-mail-to-help strong{color:#c8a866}
    @media (max-width:720px){
      .dni-mail-to-input{font-size:16px;min-height:46px;padding:11px 12px}
      .dni-mail-recipient-toggle{min-width:48px;font-size:16px}
      .dni-mail-recipient-menu{position:relative;top:auto;margin-top:5px;max-height:300px;box-shadow:none}
      .dni-mail-recipient-option{min-height:48px;padding:10px 11px;font-size:11px}
      .dni-mail-recipient-option-address{font-size:10px}
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

function optionLabel(option) {
  return String(option?.textContent || '')
    .replace(/\s*<[^<>]+>\s*$/, '')
    .trim() || 'DNI Mail recipient';
}

function directoryEntries(select) {
  const entries = [];
  const seen = new Set();
  for (const option of [...select.options]) {
    const address = optionAddress(option);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    entries.push({
      address,
      label: optionLabel(option),
      option
    });
  }
  return entries;
}

function directoryMap(select) {
  const map = new Map();
  for (const entry of directoryEntries(select)) map.set(entry.address, entry.option);
  return map;
}

function activeRecipientToken(value = '') {
  const text = String(value);
  const commaIndex = Math.max(text.lastIndexOf(','), text.lastIndexOf(';'));
  const segment = commaIndex >= 0 ? text.slice(commaIndex + 1) : text;
  return normalizeAddress(segment);
}

function setActiveRecipientToken(input, address) {
  const text = String(input.value || '');
  const commaIndex = Math.max(text.lastIndexOf(','), text.lastIndexOf(';'));
  if (commaIndex < 0) {
    input.value = address;
    return;
  }
  const prefix = text.slice(0, commaIndex + 1).trimEnd();
  input.value = `${prefix} ${address}`;
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

  const menuId = `dni-mail-recipient-menu-${Math.random().toString(36).slice(2)}`;
  const combo = document.createElement('div');
  combo.className = 'dni-mail-combobox';

  const row = document.createElement('div');
  row.className = 'dni-mail-combobox-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'dni-mail-to-input';
  input.name = 'recipientAddressesUi';
  input.placeholder = 'Type a name or DNI Mail address';
  input.autocomplete = 'off';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', menuId);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-label', 'DNI Mail recipient');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'dni-mail-recipient-toggle';
  toggle.setAttribute('aria-label', 'Show DNI Mail recipients');
  toggle.setAttribute('aria-controls', menuId);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = '▾';

  const menu = document.createElement('div');
  menu.id = menuId;
  menu.className = 'dni-mail-recipient-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  row.append(input, toggle);
  combo.append(row, menu);

  const help = document.createElement('span');
  help.className = 'dni-mail-to-help';
  help.innerHTML = '<strong>DNI RECIPIENT</strong> // Type to autofill/filter, or open the dropdown. Includes active users and support addresses.';

  field.insertBefore(combo, select);
  field.append(help);

  let activeIndex = -1;
  let renderedEntries = [];

  const setExpanded = expanded => {
    menu.hidden = !expanded;
    input.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-expanded', String(expanded));
    if (!expanded) {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
    }
  };

  const renderMenu = ({ open = false, showAll = false } = {}) => {
    const query = showAll ? '' : activeRecipientToken(input.value);
    const entries = directoryEntries(select).filter(entry => {
      if (!query) return true;
      const haystack = `${entry.label} ${entry.address}`.toLowerCase();
      return haystack.includes(query);
    });
    renderedEntries = entries;
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');
    menu.replaceChildren();

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'dni-mail-recipient-empty';
      empty.textContent = 'NO MATCHING DNI RECIPIENTS';
      menu.append(empty);
    } else {
      entries.forEach((entry, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = `${menuId}-option-${index}`;
        button.className = 'dni-mail-recipient-option';
        button.setAttribute('role', 'option');
        button.dataset.dniRecipientAddress = entry.address;

        const name = document.createElement('span');
        name.className = 'dni-mail-recipient-option-name';
        name.textContent = entry.label;
        const address = document.createElement('span');
        address.className = 'dni-mail-recipient-option-address';
        address.textContent = entry.address;
        button.append(name, address);

        button.addEventListener('pointerdown', event => {
          event.preventDefault();
        });
        button.addEventListener('click', () => {
          setActiveRecipientToken(input, entry.address);
          input.setCustomValidity('');
          syncRecipientSelection(select, input, typeSelect.value || 'message');
          setExpanded(false);
          input.focus({ preventScroll: true });
        });
        menu.append(button);
      });
    }

    if (open) setExpanded(true);
  };

  const setActive = nextIndex => {
    if (!renderedEntries.length) return;
    activeIndex = Math.max(0, Math.min(renderedEntries.length - 1, nextIndex));
    const buttons = [...menu.querySelectorAll('.dni-mail-recipient-option')];
    buttons.forEach((button, index) => {
      const active = index === activeIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      if (active) {
        input.setAttribute('aria-activedescendant', button.id);
        button.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const chooseActive = () => {
    const entry = renderedEntries[activeIndex];
    if (!entry) return false;
    setActiveRecipientToken(input, entry.address);
    input.setCustomValidity('');
    syncRecipientSelection(select, input, typeSelect.value || 'message');
    setExpanded(false);
    return true;
  };

  const rebuild = () => {
    if (!menu.hidden) renderMenu({ open: true });
  };
  const optionsObserver = new MutationObserver(rebuild);
  optionsObserver.observe(select, { childList: true });

  toggle.addEventListener('click', () => {
    if (!menu.hidden) {
      setExpanded(false);
      input.focus({ preventScroll: true });
      return;
    }
    renderMenu({ open: true, showAll: true });
    input.focus({ preventScroll: true });
  });

  input.addEventListener('focus', () => {
    renderMenu({ open: true, showAll: !activeRecipientToken(input.value) });
  });

  input.addEventListener('input', () => {
    input.setCustomValidity('');
    syncRecipientSelection(select, input, typeSelect.value || 'message');
    renderMenu({ open: true });
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (menu.hidden) renderMenu({ open: true });
      setActive(activeIndex < 0 ? 0 : activeIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (menu.hidden) renderMenu({ open: true });
      setActive(activeIndex < 0 ? renderedEntries.length - 1 : activeIndex - 1);
      return;
    }
    if (event.key === 'Enter' && !menu.hidden && activeIndex >= 0) {
      event.preventDefault();
      chooseActive();
      return;
    }
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      setExpanded(false);
    }
  });

  input.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (!combo.contains(document.activeElement)) setExpanded(false);
    }, 80);
    const addresses = parseAddresses(input.value);
    if (addresses.length) input.value = addresses.join(', ');
    syncRecipientSelection(select, input, typeSelect.value || 'message');
  });

  typeSelect.addEventListener('change', () => {
    input.setCustomValidity('');
    syncRecipientSelection(select, input, typeSelect.value || 'message');
    if (typeSelect.value !== 'message') setExpanded(false);
  });

  form.addEventListener('submit', event => {
    const ok = syncRecipientSelection(select, input, typeSelect.value || 'message', { report: true });
    if (ok) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });

  document.addEventListener('pointerdown', event => {
    if (menu.hidden || combo.contains(event.target)) return;
    setExpanded(false);
  });

  const composeShell = panel.querySelector('[data-mail-compose-shell]');
  if (composeShell instanceof HTMLElement) {
    const composeObserver = new MutationObserver(() => {
      if (!composeShell.hidden && (typeSelect.value || 'message') === 'message') {
        window.setTimeout(() => input.focus({ preventScroll: true }), 0);
      } else if (composeShell.hidden) {
        setExpanded(false);
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
