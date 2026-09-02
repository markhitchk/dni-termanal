// DNI Admin workspace/control hardener.
// admin.js owns Users, Sectors & Assets, and System. The document workflow is
// owned exclusively by documents-workflow.js so Admin only has one DOCUMENTS tab.

const hardenedPanels = new WeakMap();
const mailDirectoryState = {
  users: new Map(),
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

function adminMailAddress(username) {
  const localPart = String(username || '').trim();
  return localPart ? `${localPart}@dni` : '';
}

async function loadAdminMailDirectory() {
  if (mailDirectoryState.users.size) return mailDirectoryState.users;
  if (!mailDirectoryState.loadPromise) {
    mailDirectoryState.loadPromise = fetch('/admin-data.php?action=bootstrap', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `DNI Admin mail directory HTTP ${response.status}`);
      const users = Array.isArray(payload.users) ? payload.users : Object.values(payload.users || {});
      const directory = new Map();
      for (const user of users) {
        const id = Number(user?.id || 0);
        const address = adminMailAddress(user?.username);
        if (id > 0 && address) directory.set(id, address);
      }
      mailDirectoryState.users = directory;
      return directory;
    }).catch(error => {
      console.warn('DNI Admin mail address display unavailable', error);
      mailDirectoryState.loadPromise = null;
      return mailDirectoryState.users;
    });
  }
  return mailDirectoryState.loadPromise;
}

function annotateAdminMailAddresses(panel, directory = mailDirectoryState.users) {
  if (!(panel instanceof HTMLElement) || !(directory instanceof Map) || !directory.size) return;

  for (const button of panel.querySelectorAll('[data-admin-select-user]')) {
    const userId = Number(button.dataset.adminSelectUser || 0);
    const address = directory.get(userId);
    const detail = button.querySelector('span');
    if (!address || !(detail instanceof HTMLElement)) continue;

    if (!detail.dataset.adminMailBase) detail.dataset.adminMailBase = String(detail.textContent || '').trim();
    const base = detail.dataset.adminMailBase || '';
    const next = base ? `${address} · ${base}` : address;
    if (detail.textContent !== next) detail.textContent = next;
  }

  const selectedButton = panel.querySelector('[data-admin-select-user].is-selected');
  const selectedUserId = Number(selectedButton?.dataset.adminSelectUser || 0);
  const selectedAddress = directory.get(selectedUserId);
  const editor = panel.querySelector('.dni-admin-editor');
  const identityLine = editor?.querySelector(':scope > p');
  if (selectedAddress && identityLine instanceof HTMLElement) {
    if (!identityLine.dataset.adminMailBase) identityLine.dataset.adminMailBase = String(identityLine.textContent || '').trim();
    const base = identityLine.dataset.adminMailBase || '';
    const next = base ? `${base} · Mail ${selectedAddress}` : `Mail ${selectedAddress}`;
    if (identityLine.textContent !== next) identityLine.textContent = next;
  }
}

async function syncAdminMailAddresses(panel) {
  if (!(panel instanceof HTMLElement)) return;
  const directory = await loadAdminMailDirectory();
  if (!panel.isConnected) return;
  annotateAdminMailAddresses(panel, directory);
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
  panel.dataset.adminControlsHardened = '8';
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

document.addEventListener('click', routePrimaryWorkspace, true);
document.addEventListener('dni:admin-mounted', event => hardenAfterRender(event.target));
window.addEventListener('dni:panel', event => {
  if (event.detail?.panel === 'admin') hardenAfterRender();
});
hardenAfterRender();
