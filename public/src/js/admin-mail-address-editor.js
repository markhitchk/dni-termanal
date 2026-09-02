const ENDPOINT = '/admin-mail-address.php';

function installStyles() {
  if (document.querySelector('#dni-admin-mail-address-style')) return;
  const style = document.createElement('style');
  style.id = 'dni-admin-mail-address-style';
  style.textContent = `
    .dni-admin-mail-address-field{position:relative}
    .dni-admin-mail-address-control{display:flex;align-items:stretch;min-width:0}
    .dni-admin-mail-address-control input{min-width:0;flex:1;border-right:0!important}
    .dni-admin-mail-address-domain{display:flex;align-items:center;border:1px solid #383838;background:#090909;color:#b9b9b9;padding:9px 10px;font:700 10px/1.3 "Courier New",monospace;white-space:nowrap}
    .dni-admin-mail-address-help{display:block;color:#777;font:700 8px/1.45 "Courier New",monospace;letter-spacing:.45px;text-transform:none}
    .dni-admin-mail-address-help.is-locked{color:#9d8456}
    .dni-admin-mail-address-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px}
    .dni-admin-mail-address-status{color:#777;font:700 8px/1.35 "Courier New",monospace;letter-spacing:.45px;text-transform:none}
    .dni-admin-mail-address-status[data-state="ok"]{color:#6cff9d}
    .dni-admin-mail-address-status[data-state="error"]{color:#ff8b8b}
    .dni-admin-mail-address-status[data-state="working"]{color:#ffc85a}
    .dni-admin-mail-address-field input[readonly]{cursor:not-allowed;color:#aaa;background:#090909}
    @media(max-width:620px){.dni-admin-mail-address-control{display:grid;grid-template-columns:minmax(0,1fr) auto}.dni-admin-mail-address-domain{padding-inline:8px}}
  `;
  document.head.append(style);
}

function setStatus(field, text, state = '') {
  const status = field.querySelector('[data-dni-admin-mail-status]');
  if (!(status instanceof HTMLElement)) return;
  status.textContent = text;
  status.dataset.state = state;
}

async function getDirectory() {
  const response = await fetch(`${ENDPOINT}?action=directory`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error || `DNI Mail directory failed (HTTP ${response.status}).`);
  }
  return payload;
}

function normalizeLocalPart(value, domain) {
  let local = String(value || '').trim().toLowerCase();
  if (!local) return '';
  const suffix = `@${String(domain || '').toLowerCase()}`;
  if (local.endsWith(suffix)) local = local.slice(0, -suffix.length);
  return local.trim();
}

async function saveAddress({ field, input, button, userId, identity, csrfToken }) {
  if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) return;
  const local = normalizeLocalPart(input.value, identity.mailDomain);
  if (local && !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(local)) {
    setStatus(field, 'Use 1–64 letters, numbers, dots, underscores, or hyphens.', 'error');
    input.focus({ preventScroll: true });
    return;
  }

  input.value = local;
  input.disabled = true;
  button.disabled = true;
  setStatus(field, local ? 'SAVING DNI MAIL ADDRESS...' : 'RESETTING TO DISCORD USERNAME...', 'working');

  try {
    const mailAddress = local ? `${local}@${identity.mailDomain}` : '';
    const response = await fetch(`${ENDPOINT}?action=save`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-DNI-CSRF': String(csrfToken || '')
      },
      body: JSON.stringify({ userId, mailAddress })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true || !payload?.user) {
      throw new Error(payload?.error || `DNI Mail address update failed (HTTP ${response.status}).`);
    }

    identity.mailLocalPart = String(payload.user.mailLocalPart || '');
    identity.defaultLocalPart = String(payload.user.defaultLocalPart || identity.defaultLocalPart || '');
    identity.mailDomain = String(payload.user.mailDomain || identity.mailDomain || 'dni.org');
    identity.address = String(payload.user.address || `${identity.mailLocalPart}@${identity.mailDomain}`);
    identity.customLocalPart = Boolean(payload.user.customLocalPart);
    input.value = identity.mailLocalPart;
    const domain = field.querySelector('[data-dni-admin-mail-domain]');
    if (domain) domain.textContent = `@${identity.mailDomain}`;
    setStatus(field, `SAVED // ${identity.address}`, 'ok');
  } catch (error) {
    setStatus(field, String(error?.message || error), 'error');
  } finally {
    input.disabled = false;
    button.disabled = false;
  }
}

function buildField({ form, userId, identity, canEdit, csrfToken }) {
  const field = document.createElement('label');
  field.className = 'wide dni-admin-mail-address-field';
  field.dataset.dniAdminMailAddress = String(userId);
  field.append(document.createTextNode('DNI Mail Address'));

  const control = document.createElement('div');
  control.className = 'dni-admin-mail-address-control';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 64;
  input.autocomplete = 'off';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.value = String(identity.mailLocalPart || '');
  input.placeholder = String(identity.defaultLocalPart || 'discord-username');
  input.readOnly = !canEdit;
  input.dataset.dniAdminMailLocal = '';
  input.setAttribute('aria-label', 'DNI Mail address name');

  const domain = document.createElement('span');
  domain.className = 'dni-admin-mail-address-domain';
  domain.dataset.dniAdminMailDomain = '';
  domain.textContent = `@${identity.mailDomain}`;
  control.append(input, domain);
  field.append(control);

  const type = String(identity.identityType || 'member').toUpperCase();
  const help = document.createElement('small');
  help.className = `dni-admin-mail-address-help${canEdit ? '' : ' is-locked'}`;
  help.textContent = canEdit
    ? `${type} domain · @${identity.mailDomain} · Edit the address name; clear the field to reset it to the Discord username.`
    : `${type} domain · @${identity.mailDomain} · Read only in Admin. Developer access is required to edit this address.`;
  field.append(help);

  if (canEdit) {
    const actions = document.createElement('div');
    actions.className = 'dni-admin-mail-address-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dni-admin-action';
    button.textContent = 'SAVE DNI MAIL ADDRESS';
    const status = document.createElement('span');
    status.className = 'dni-admin-mail-address-status';
    status.dataset.dniAdminMailStatus = '';
    status.textContent = `CURRENT // ${identity.address}`;
    button.addEventListener('click', () => void saveAddress({ field, input, button, userId, identity, csrfToken }));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      void saveAddress({ field, input, button, userId, identity, csrfToken });
    });
    actions.append(button, status);
    field.append(actions);
  }

  const serviceField = form.querySelector('input[name="serviceNumber"]')?.closest('label');
  if (serviceField?.parentElement === form) serviceField.insertAdjacentElement('afterend', field);
  else form.prepend(field);
}

async function enhanceForm(form) {
  if (!(form instanceof HTMLFormElement) || form.dataset.dniMailAddressLoading === 'true') return;
  const userId = Number(form.querySelector('input[name="userId"]')?.value || 0);
  if (!userId) return;
  if (form.querySelector(`[data-dni-admin-mail-address="${userId}"]`)) return;

  form.dataset.dniMailAddressLoading = 'true';
  try {
    const payload = await getDirectory();
    if (!form.isConnected) return;
    const currentUserId = Number(form.querySelector('input[name="userId"]')?.value || 0);
    if (currentUserId !== userId) return;
    const identity = Array.isArray(payload.users)
      ? payload.users.find(user => Number(user?.id) === userId)
      : null;
    if (!identity) return;
    buildField({
      form,
      userId,
      identity: { ...identity },
      canEdit: payload.canEdit === true,
      csrfToken: String(payload.csrfToken || '')
    });
  } catch (error) {
    console.error('DNI Admin Mail address editor failed', error);
  } finally {
    delete form.dataset.dniMailAddressLoading;
  }
}

function scan() {
  const form = document.querySelector('[data-module="admin"] form[data-admin-form="save-user"]');
  if (form instanceof HTMLFormElement) void enhanceForm(form);
}

installStyles();
scan();
const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
