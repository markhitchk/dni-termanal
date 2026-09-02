// DNI Admin workspace/control hardener.
// admin.js owns Users, Sectors & Assets, and System. The document workflow is
// owned exclusively by documents-workflow.js so Admin only has one DOCUMENTS tab.

const hardenedPanels = new WeakMap();
const ADMIN_MAIL_URL = '/admin-mail-address.php';
const mailDirectoryState = {
  users: new Map(),
  csrfToken: '',
  loadPromise: null
};
const observedMailPanels = new WeakSet();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function currentAdminPanel(eventTarget = null) {
  if (eventTarget instanceof Element) {
    const direct = eventTarget.closest('[data-module="admin"]');
    if (direct) return direct;
  }
  return document.querySelector('[data-module="admin"]');
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
    identityType: String(value.identityType || 'member'),
    customLocalPart: value.customLocalPart === true
  };
}

async function loadAdminMailDirectory(force = false) {
  if (!force && mailDirectoryState.users.size) return mailDirectoryState.users;
  if (!mailDirectoryState.loadPromise) {
    mailDirectoryState.loadPromise = fetch(`${ADMIN_MAIL_URL}?action=directory`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `DNI Admin mail directory HTTP ${response.status}`);
      const users = Array.isArray(payload.users) ? payload.users : Object.values(payload.users || {});
      const directory = new Map();
      for (const raw of users) {
        const entry = normalizeMailEntry(raw);
        if (entry) directory.set(entry.id, entry);
      }
      mailDirectoryState.users = directory;
      mailDirectoryState.csrfToken = String(payload.csrfToken || mailDirectoryState.csrfToken || '');
      return directory;
    }).catch(error => {
      console.warn('DNI Admin mail address display unavailable', error);
      return mailDirectoryState.users;
    }).finally(() => {
      mailDirectoryState.loadPromise = null;
    });
  }
  return mailDirectoryState.loadPromise;
}

function ensureAdminMailField(editor, entry) {
  if (!(editor instanceof HTMLElement) || !entry?.address) return;
  const form = editor.querySelector('form[data-admin-form="save-user"]');
  if (!(form instanceof HTMLFormElement)) return;

  let field = form.querySelector('[data-admin-mail-address-field]');
  if (!(field instanceof HTMLElement)) {
    field = document.createElement('label');
    field.className = 'wide dni-admin-mail-address';
    field.dataset.adminMailAddressField = 'true';
    field.append(document.createTextNode('DNI Mail Address'));

    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.adminMailAddress = 'true';
    field.append(input);

    const help = document.createElement('small');
    help.dataset.adminMailAddressHelp = 'true';
    field.append(help);

    const otherStatus = form.elements?.otherStatus;
    const otherStatusField = otherStatus instanceof HTMLElement ? otherStatus.closest('label') : null;
    if (otherStatusField) otherStatusField.insertAdjacentElement('beforebegin', field);
    else {
      const directAdmin = form.elements?.directAdmin;
      const directAdminField = directAdmin instanceof HTMLElement ? directAdmin.closest('label') : null;
      if (directAdminField) directAdminField.insertAdjacentElement('beforebegin', field);
      else form.append(field);
    }
  }

  const input = field.querySelector('[data-admin-mail-address]');
  if (!(input instanceof HTMLInputElement)) return;
  input.readOnly = false;
  input.removeAttribute('readonly');
  input.removeAttribute('aria-readonly');
  input.name = 'mailAddressUi';
  input.autocomplete = 'off';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.maxLength = 160;
  input.dataset.adminMailDomain = entry.mailDomain;
  input.dataset.adminMailUserId = String(entry.id);
  input.placeholder = `username@${entry.mailDomain}`;

  if (input.dataset.adminMailDirty !== '1' && input.value !== entry.address) input.value = entry.address;
  if (input.dataset.adminMailBound !== '1') {
    input.dataset.adminMailBound = '1';
    input.addEventListener('input', () => {
      input.dataset.adminMailDirty = '1';
      input.setCustomValidity('');
    });
    input.addEventListener('blur', () => {
      input.value = input.value.trim().toLowerCase();
    });
  }

  let help = field.querySelector('[data-admin-mail-address-help]');
  if (!(help instanceof HTMLElement)) {
    help = document.createElement('small');
    help.dataset.adminMailAddressHelp = 'true';
    field.append(help);
  }
  help.textContent = `${entry.identityType.toUpperCase()} domain · @${entry.mailDomain} · Edit the address name; clear the field to reset it to the Discord username.`;
}

function annotateAdminMailAddresses(panel, directory = mailDirectoryState.users) {
  if (!(panel instanceof HTMLElement) || !(directory instanceof Map) || !directory.size) return;

  for (const button of panel.querySelectorAll('[data-admin-select-user]')) {
    const userId = Number(button.dataset.adminSelectUser || 0);
    const entry = directory.get(userId);
    const detail = button.querySelector('span');
    if (!entry?.address || !(detail instanceof HTMLElement)) continue;

    if (!detail.dataset.adminMailBase) detail.dataset.adminMailBase = String(detail.textContent || '').trim();
    const base = detail.dataset.adminMailBase || '';
    const next = base ? `${entry.address} · ${base}` : entry.address;
    if (detail.textContent !== next) detail.textContent = next;
  }

  const selectedButton = panel.querySelector('[data-admin-select-user].is-selected');
  const selectedUserId = Number(selectedButton?.dataset.adminSelectUser || 0);
  const entry = directory.get(selectedUserId);
  const editor = panel.querySelector('.dni-admin-editor');
  const identityLine = editor?.querySelector(':scope > p');
  if (entry?.address && identityLine instanceof HTMLElement) {
    if (!identityLine.dataset.adminMailBase) identityLine.dataset.adminMailBase = String(identityLine.textContent || '').trim();
    const base = identityLine.dataset.adminMailBase || '';
    const next = base ? `${base} · Mail ${entry.address}` : `Mail ${entry.address}`;
    if (identityLine.textContent !== next) identityLine.textContent = next;
  }
  if (entry && editor instanceof HTMLElement) ensureAdminMailField(editor, entry);
}

async function syncAdminMailAddresses(panel, force = false) {
  if (!(panel instanceof HTMLElement)) return;
  const directory = await loadAdminMailDirectory(force);
  if (!panel.isConnected) return;
  annotateAdminMailAddresses(panel, directory);
}

async function saveAdminMailAddress(form) {
  if (!(form instanceof HTMLFormElement)) return null;
  const userId = Number(form.elements?.userId?.value || 0);
  const input = form.querySelector('[data-admin-mail-address]');
  if (userId < 1 || !(input instanceof HTMLInputElement)) return null;

  const current = mailDirectoryState.users.get(userId);
  const expectedDomain = String(current?.mailDomain || input.dataset.adminMailDomain || '').toLowerCase();
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

  if (!mailDirectoryState.csrfToken) await loadAdminMailDirectory(true);
  const response = await fetch(`${ADMIN_MAIL_URL}?action=save`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-DNI-CSRF': mailDirectoryState.csrfToken
    },
    body: JSON.stringify({ userId, mailAddress: address })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI Admin mail address HTTP ${response.status}`);

  const saved = normalizeMailEntry(payload.user);
  if (saved) mailDirectoryState.users.set(saved.id, saved);
  mailDirectoryState.csrfToken = String(payload.csrfToken || mailDirectoryState.csrfToken || '');
  input.dataset.adminMailDirty = '0';
  if (saved) input.value = saved.address;
  return saved;
}

function observeAdminMailAddresses(panel) {
  if (!(panel instanceof HTMLElement) || observedMailPanels.has(panel)) return;
  observedMailPanels.add(panel);
  const observer = new MutationObserver(() => {
    queueMicrotask(() => annotateAdminMailAddresses(panel));
  });
  observer.observe(panel, { childList: true, subtree: true });
}

function removeLegacyPrimaryAction(panel) {
  if (!(panel instanceof HTMLElement)) return;
  panel.querySelector('[data-admin-primary-actions]')?.remove();
}

function removeLegacyDocumentsWorkspace(panel) {
  if (!(panel instanceof HTMLElement)) return;
  // Older admin-controls builds injected a second archive/remove-only Documents tab.
  // documents-workflow.js is now the single canonical Documents workspace.
  for (const legacy of panel.querySelectorAll('[data-admin-documents-workspace]')) legacy.remove();
  delete panel.dataset.adminDocumentsBound;
}

function primaryClickHandler(panel) {
  if (!(panel instanceof HTMLElement)) return null;
  if (typeof panel.onclick === 'function') return panel.onclick;
  const durable = hardenedPanels.get(panel)?.click;
  return typeof durable === 'function' ? durable : null;
}

function revealPrimaryWorkspace(panel) {
  if (!(panel instanceof HTMLElement)) return null;
  const normal = panel.querySelector('.dni-admin-workspace');
  if (!normal) return null;
  normal.hidden = false;
  normal.removeAttribute('hidden');
  normal.style.removeProperty('display');
  return normal;
}

function closeExtensionWorkspaces(panel) {
  if (!(panel instanceof HTMLElement)) return;
  revealPrimaryWorkspace(panel);
  for (const selector of [
    '[data-operational-classification-host]',
    '[data-clearance-admin-host]'
  ]) {
    for (const host of panel.querySelectorAll(selector)) {
      host.hidden = true;
      host.setAttribute('hidden', '');
    }
  }
  panel.querySelector('[data-operational-classification-tab]')?.classList.remove('is-active');
  panel.querySelector('[data-clearance-admin-tab]')?.classList.remove('is-active');
}

function sectorsWorkspaceReady(panel) {
  if (!(panel instanceof HTMLElement)) return false;
  const button = panel.querySelector('[data-admin-workspace="sectors"]');
  const host = panel.querySelector('.dni-admin-workspace');
  if (!button?.classList.contains('is-active') || !host || host.hidden) return false;
  return host.textContent.includes('SECTOR DATABASE') && host.textContent.includes('ASSET DATABASE');
}

function sectorsWorkspaceDataUnavailable(panel) {
  const host = panel?.querySelector('.dni-admin-workspace');
  if (!host || host.hidden) return false;
  const text = String(host.textContent || '');
  return /Sectors & Assets/i.test(text) && /DATABASE UNAVAILABLE/i.test(text);
}

function friendlySectorsError(error) {
  const raw = error?.message || String(error || 'Unknown sector editor error.');
  if (/sectors is not defined/i.test(raw)) {
    return {
      code: 'stale-runtime',
      message: 'DNI Admin loaded an outdated sector editor module. Retry after Admin finishes refreshing its workspace.'
    };
  }
  if (/primary workspace handler is unavailable/i.test(raw)) {
    return {
      code: 'handler-unavailable',
      message: 'DNI Admin primary workspace handler is unavailable. Retry after Admin finishes binding its controls.'
    };
  }
  return { code: 'workspace-error', message: raw };
}

function showSectorsError(panel, error) {
  const host = revealPrimaryWorkspace(panel);
  if (!host) return;
  const failure = friendlySectorsError(error);
  for (const button of panel.querySelectorAll('[data-admin-workspace]')) {
    button.classList.toggle('is-active', button.dataset.adminWorkspace === 'sectors');
  }
  host.innerHTML = `<section class="dni-admin-block"><div class="dni-admin-section-title"><span>SECTORS & ASSETS</span><span>EDITOR ERROR</span></div><div class="dni-admin-notice is-error"><strong>SECTOR EDITOR COULD NOT OPEN</strong> · ${esc(failure.message)}</div><div class="dni-admin-actions"><button class="dni-admin-action" type="button" data-admin-retry-sectors>RETRY SECTOR EDITOR</button></div></section>`;
  panel.dataset.adminWorkspaceRouted = 'sectors-error';
  panel.dataset.adminSectorsErrorCode = failure.code;
}

function scrollSectorsEditorIntoView(panel) {
  const host = panel?.querySelector('.dni-admin-workspace');
  if (!host || !sectorsWorkspaceReady(panel)) return;
  requestAnimationFrame(() => host.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function waitForPrimaryHandler(panel) {
  if (!(panel instanceof HTMLElement) || panel.dataset.adminPrimaryRebindPending === '1') return;
  panel.dataset.adminPrimaryRebindPending = '1';
  const onMounted = event => {
    const mounted = currentAdminPanel(event.target);
    if (mounted !== panel) return;
    delete panel.dataset.adminPrimaryRebindPending;
    hardenAdminPanel(panel);
  };
  document.addEventListener('dni:admin-mounted', onMounted, { once: true });
}

function runCanonicalSectorsHandler(panel, event) {
  const handler = primaryClickHandler(panel);
  if (typeof handler !== 'function') {
    waitForPrimaryHandler(panel);
    showSectorsError(panel, new Error('DNI Admin primary workspace handler is unavailable.'));
    return;
  }

  Promise.resolve(handler.call(panel, event)).then(() => {
    closeExtensionWorkspaces(panel);
    const button = panel.querySelector('[data-admin-workspace="sectors"]');
    if (button) button.classList.add('is-active');
    if (sectorsWorkspaceReady(panel)) {
      delete panel.dataset.adminSectorsErrorCode;
      panel.dataset.adminWorkspaceRouted = 'sectors';
      scrollSectorsEditorIntoView(panel);
      return;
    }
    if (sectorsWorkspaceDataUnavailable(panel)) {
      panel.dataset.adminWorkspaceRouted = 'sectors-data-unavailable';
      return;
    }
    showSectorsError(panel, new Error('DNI Admin Sectors & Assets workspace did not mount. Retry after Admin finishes loading.'));
  }).catch(error => showSectorsError(panel, error));
}

function routePrimaryWorkspace(event) {
  const target = event.target instanceof Element ? event.target : null;
  const retry = target?.closest('[data-admin-retry-sectors]');
  if (retry) {
    const panel = retry.closest('[data-module="admin"]');
    const sectorsButton = panel?.querySelector('[data-admin-workspace="sectors"]');
    if (panel && sectorsButton) runCanonicalSectorsHandler(panel, { target: sectorsButton });
    return;
  }

  const workspaceButton = target?.closest('[data-admin-workspace]');
  if (!(workspaceButton instanceof HTMLButtonElement)) return;
  const panel = workspaceButton.closest('[data-module="admin"]');
  if (!(panel instanceof HTMLElement)) return;

  closeExtensionWorkspaces(panel);
  if (workspaceButton.dataset.adminWorkspace !== 'sectors') return;

  queueMicrotask(() => {
    closeExtensionWorkspaces(panel);
    if (sectorsWorkspaceReady(panel)) {
      delete panel.dataset.adminSectorsErrorCode;
      panel.dataset.adminWorkspaceRouted = 'sectors';
      scrollSectorsEditorIntoView(panel);
      return;
    }
    if (sectorsWorkspaceDataUnavailable(panel)) {
      panel.dataset.adminWorkspaceRouted = 'sectors-data-unavailable';
      return;
    }
    runCanonicalSectorsHandler(panel, event);
  });
}

function hardenAdminPanel(panel) {
  if (!(panel instanceof HTMLElement)) return;
  hardenedPanels.set(panel, {
    click: typeof panel.onclick === 'function' ? panel.onclick : hardenedPanels.get(panel)?.click || null,
    submit: typeof panel.onsubmit === 'function' ? panel.onsubmit : hardenedPanels.get(panel)?.submit || null
  });
  panel.dataset.adminControlsHardened = '7';
  removeLegacyDocumentsWorkspace(panel);
  observeAdminMailAddresses(panel);
  void syncAdminMailAddresses(panel);
}

function hardenAfterRender(eventTarget = null) {
  queueMicrotask(() => {
    const panel = currentAdminPanel(eventTarget);
    hardenAdminPanel(panel);
    removeLegacyPrimaryAction(panel);
  });
}

document.addEventListener('submit', event => {
  const form = event.target instanceof Element ? event.target.closest('form[data-admin-form="save-user"]') : null;
  if (!(form instanceof HTMLFormElement)) return;
  const input = form.querySelector('[data-admin-mail-address]');
  if (!(input instanceof HTMLInputElement)) return;

  const userId = Number(form.elements?.userId?.value || 0);
  const entry = mailDirectoryState.users.get(userId);
  const expectedDomain = String(entry?.mailDomain || input.dataset.adminMailDomain || '').toLowerCase();
  const address = input.value.trim().toLowerCase();
  input.setCustomValidity('');
  if (address) {
    const match = address.match(/^([a-z0-9][a-z0-9._-]{0,63})@([a-z0-9.-]+)$/);
    if (!match) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.setCustomValidity('Enter a valid DNI Mail address.');
      input.reportValidity();
      return;
    }
    if (expectedDomain && match[2] !== expectedDomain) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.setCustomValidity(`This user must use the @${expectedDomain} DNI Mail domain.`);
      input.reportValidity();
      return;
    }
  }

  void saveAdminMailAddress(form).then(() => {
    const panel = currentAdminPanel(form);
    if (panel) void syncAdminMailAddresses(panel, true);
  }).catch(error => {
    console.error('DNI Admin mail address save failed', error);
    window.DNIAlerts?.error?.(error.message || 'DNI Mail address could not be saved.');
    if (!window.DNIAlerts?.error) window.alert(error.message || 'DNI Mail address could not be saved.');
  });
}, true);

document.addEventListener('click', routePrimaryWorkspace, true);
document.addEventListener('dni:admin-mounted', event => hardenAfterRender(event.target));
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') hardenAfterRender();
});
hardenAfterRender();
