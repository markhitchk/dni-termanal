const ROOT_SELECTOR = '[data-mail-v2-recipient-ui]';
const ENHANCED_ATTR = 'data-dni-recipient-dropdown';

function installRecipientDropdownStyles() {
  if (document.querySelector('style[data-dni-recipient-dropdown-style]')) return;

  const style = document.createElement('style');
  style.dataset.dniRecipientDropdownStyle = 'true';
  style.textContent = `
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"]{
      position:relative;
      display:grid;
      gap:7px;
      margin-top:7px;
      padding:0;
      border:0;
      background:transparent;
      overflow:visible;
      min-width:0;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tools{
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      gap:7px;
      align-items:center;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-role-tabs{
      display:flex;
      gap:4px;
      flex-wrap:nowrap;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-role-tabs button{
      min-width:42px;
      min-height:38px;
      padding:7px 9px;
      border:1px solid #383838;
      background:#101010;
      color:#8f8f8f;
      font:700 9px/1 "Courier New",monospace;
      letter-spacing:.45px;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-role-tabs button.is-active{
      border-color:#c8a866;
      background:#1a160e;
      color:#f0d89f;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-search{
      box-sizing:border-box;
      width:100%;
      min-width:0;
      min-height:38px;
      margin:0;
      border:1px solid #3c3c3c;
      background:#050505;
      color:#eee;
      padding:9px 34px 9px 10px;
      font:700 10px/1.3 "Courier New",monospace;
      outline:none;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-search:focus{
      border-color:#c8a866;
      box-shadow:0 0 0 1px rgba(200,168,102,.16);
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tools:after{
      content:'⌄';
      position:absolute;
      right:11px;
      align-self:center;
      color:#c8a866;
      pointer-events:none;
      font:700 15px/1 monospace;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"].is-autofill-open .dni-mail-v2-tools:after{content:'⌃'}
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-recipient-autofill-dropdown{
      display:none;
      position:absolute;
      left:0;
      right:0;
      z-index:80;
      border:1px solid #4a402e;
      background:#050505;
      box-shadow:0 14px 30px rgba(0,0,0,.72);
      overflow:hidden;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"].is-autofill-open .dni-mail-recipient-autofill-dropdown{display:block}
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-recipient-autofill-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      padding:7px 9px;
      border-bottom:1px solid #28241c;
      background:#0a0907;
      color:#777;
      font:700 8px/1 "Courier New",monospace;
      letter-spacing:.75px;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-recipient-autofill-head b{color:#c8a866;font-size:8px}
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tabs{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:0;
      border-bottom:1px solid #242424;
      background:#080808;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tabs button{
      min-width:0;
      min-height:34px;
      padding:7px 6px;
      border:0;
      border-right:1px solid #242424;
      background:transparent;
      color:#8f8f8f;
      font:700 8px/1.15 "Courier New",monospace;
      letter-spacing:.2px;
      cursor:pointer;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tabs button:last-child{border-right:0}
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tabs button.is-active{
      background:#17140d;
      color:#f0d89f;
      box-shadow:inset 0 -2px 0 #c8a866;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tabs button span{
      display:inline-block;
      margin-left:4px;
      color:#666;
      font-size:7px;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-directory{
      max-height:260px;
      overflow:auto;
      overscroll-behavior:contain;
      border:0;
      background:#050505;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-directory button{
      min-height:44px;
      padding:8px 10px;
      border-bottom:1px solid #1d1d1d;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-directory button:last-child{border-bottom:0}
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-selected{
      display:grid;
      gap:5px;
      margin-top:1px;
    }
    ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-help{margin-top:1px}

    @media(max-width:700px){
      ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tools{
        grid-template-columns:1fr;
        gap:6px;
      }
      ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-role-tabs button{
        flex:1 1 0;
        min-height:38px;
        font-size:9px;
      }
      ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-search{
        min-height:46px;
        padding-right:38px;
        font-size:16px;
      }
      ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tools:after{
        right:12px;
        bottom:14px;
      }
      ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-tabs button{
        min-height:42px;
        padding:7px 4px;
        font-size:8px;
      }
      ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-directory{max-height:36dvh}
      ${ROOT_SELECTOR}[${ENHANCED_ATTR}="true"] .dni-mail-v2-directory button{
        min-height:50px;
        padding:10px;
      }
    }
  `;
  document.head.append(style);
}

function positionDropdown(root) {
  const tools = root.querySelector('.dni-mail-v2-tools');
  const dropdown = root.querySelector('.dni-mail-recipient-autofill-dropdown');
  if (!(tools instanceof HTMLElement) || !(dropdown instanceof HTMLElement)) return;
  dropdown.style.top = `${tools.offsetTop + tools.offsetHeight + 4}px`;
}

function openDropdown(root) {
  root.classList.add('is-autofill-open');
  positionDropdown(root);
}

function closeDropdown(root) {
  root.classList.remove('is-autofill-open');
}

function enhanceRecipientUi(root) {
  if (!(root instanceof HTMLElement) || root.getAttribute(ENHANCED_ATTR) === 'true') return;

  const tools = root.querySelector('.dni-mail-v2-tools');
  const tabs = root.querySelector('.dni-mail-v2-tabs');
  const directory = root.querySelector('.dni-mail-v2-directory');
  const search = root.querySelector('[data-mail-v2-search]');
  if (!(tools instanceof HTMLElement) || !(tabs instanceof HTMLElement) || !(directory instanceof HTMLElement) || !(search instanceof HTMLInputElement)) return;

  root.setAttribute(ENHANCED_ATTR, 'true');
  search.placeholder = 'Type a name or DNI Mail address…';
  search.setAttribute('aria-label', 'Recipient autofill');
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-expanded', 'false');
  directory.setAttribute('role', 'listbox');

  const dropdown = document.createElement('div');
  dropdown.className = 'dni-mail-recipient-autofill-dropdown';
  dropdown.setAttribute('aria-label', 'Recipient autofill dropdown');

  const head = document.createElement('div');
  head.className = 'dni-mail-recipient-autofill-head';
  head.innerHTML = '<b>AUTOFILL</b><span>Support · DNI Members · Citizens</span>';

  dropdown.append(head, tabs, directory);
  tools.insertAdjacentElement('afterend', dropdown);

  search.addEventListener('focus', () => {
    openDropdown(root);
    search.setAttribute('aria-expanded', 'true');
  });
  search.addEventListener('input', () => {
    openDropdown(root);
    search.setAttribute('aria-expanded', 'true');
  });
  search.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeDropdown(root);
    search.setAttribute('aria-expanded', 'false');
    search.blur();
  });

  tabs.addEventListener('click', () => {
    openDropdown(root);
    queueMicrotask(() => {
      positionDropdown(root);
      search.focus({ preventScroll: true });
    });
  });

  directory.addEventListener('click', event => {
    const item = event.target instanceof Element ? event.target.closest('button') : null;
    if (!item) return;
    queueMicrotask(() => {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      closeDropdown(root);
      search.setAttribute('aria-expanded', 'false');
      search.blur();
    });
  });

  root.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!root.contains(document.activeElement)) {
        closeDropdown(root);
        search.setAttribute('aria-expanded', 'false');
      }
    }, 0);
  });

  window.addEventListener('resize', () => {
    if (root.classList.contains('is-autofill-open')) positionDropdown(root);
  }, { passive: true });
}

function scanRecipientUi() {
  document.querySelectorAll(ROOT_SELECTOR).forEach(enhanceRecipientUi);
}

function scheduleRecipientUiScan() {
  window.setTimeout(scanRecipientUi, 0);
  window.setTimeout(scanRecipientUi, 80);
  window.setTimeout(scanRecipientUi, 250);
}

installRecipientDropdownStyles();
scheduleRecipientUiScan();

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('[data-mail-compose-launch],[data-mail-compose-shell],#dni-mail-panel')) scheduleRecipientUiScan();
});

document.addEventListener('focusin', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('#dni-mail-panel')) return;
  scheduleRecipientUiScan();
});
