const MAIL_DATA_URL = '/mail-data.php';
const MAIL_UPLOAD_URL = '/mail-upload.php';
const DNI_CDN_BASE_URL = 'https://cdn.dreadnoughtimperium.org/files/';
const DNI_CDN_MAX_FILE_BYTES = 200 * 1024 * 1024;
const DNI_CDN_CHUNK_BYTES = 1024 * 1024;
const DNI_CDN_MAX_FILES = 10;
const DNI_CDN_BLOCK = '--- DNI CDN ATTACHMENTS ---';

const fallbackState = {
  csrfToken: '',
  uploads: [],
  uploading: false,
  status: ''
};

function installMailUploadButtonStyles() {
  if (document.querySelector('style[data-dni-mail-upload-button-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailUploadButtonStyle = 'true';
  style.textContent = `
    .dni-mail-cdn-field{position:relative}
    .dni-mail-cdn-field input[type=file][data-mail-cdn-input]{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
    .dni-mail-upload-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:8px}
    .dni-mail-upload-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:9px 14px;border:1px solid rgba(200,168,102,.62);background:rgba(200,168,102,.09);color:#f0d79d;font:700 10px/1 "Courier New",monospace;letter-spacing:.65px;cursor:pointer;text-transform:uppercase}
    .dni-mail-upload-button:hover,.dni-mail-upload-button:focus-visible{border-color:#e0c078;background:rgba(200,168,102,.17);color:#fff;outline:none;box-shadow:0 0 0 1px rgba(200,168,102,.22)}
    .dni-mail-upload-button:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
    .dni-mail-upload-button-icon{font-size:15px;line-height:1;transform:translateY(-1px)}
    .dni-mail-upload-limit{color:#747474;font:700 8px/1.35 "Courier New",monospace;letter-spacing:.3px}
    .dni-mail-upload-fallback-list{grid-column:1/-1;display:grid;gap:7px;margin-top:2px}
    .dni-mail-upload-fallback-list:empty{display:none}
    .dni-mail-upload-fallback-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #282828;background:#080808;padding:9px 10px}
    .dni-mail-upload-fallback-row a{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c8a866;font:700 10px/1.3 "Courier New",monospace}
    .dni-mail-upload-fallback-row small{display:block;margin-top:3px;color:#777;font:700 8px/1.3 "Courier New",monospace}
    .dni-mail-upload-fallback-remove{border:1px solid #4b4b4b;background:#101010;color:#bcbcbc;padding:5px 8px;font:700 8px/1 "Courier New",monospace;cursor:pointer}
    .dni-mail-upload-fallback-status{grid-column:1/-1;min-height:16px;color:#9b9b9b;font:700 9px/1.4 "Courier New",monospace}
    .dni-mail-upload-fallback-status.is-error{color:#e45d62}
    @media(max-width:700px){.dni-mail-upload-actions{align-items:stretch}.dni-mail-upload-button{width:100%}.dni-mail-upload-limit{width:100%}.dni-mail-upload-fallback-row{grid-template-columns:1fr}.dni-mail-upload-fallback-remove{justify-self:start}}
  `;
  document.head.append(style);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** power);
  return `${amount >= 10 || power === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[power]}`;
}

function createUploadId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '');
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(32, '0').slice(0, 32);
}

function stripCdnBlock(value = '') {
  const text = String(value || '');
  const marker = text.indexOf(DNI_CDN_BLOCK);
  return marker >= 0 ? text.slice(0, marker).trimEnd() : text;
}

async function fetchMailCsrfToken() {
  if (fallbackState.csrfToken) return fallbackState.csrfToken;
  const response = await fetch(`${MAIL_DATA_URL}?action=list&filter=all`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DNI Mail HTTP ${response.status}`);
  const token = String(payload.csrfToken || '');
  if (!token) throw new Error('DNI security token unavailable. Reload DNI Mail.');
  fallbackState.csrfToken = token;
  return token;
}

function fallbackNodes(panel) {
  return {
    field: panel.querySelector('[data-mail-cdn-field][data-dni-upload-fallback="true"]'),
    input: panel.querySelector('[data-mail-cdn-input][data-dni-upload-fallback="true"]'),
    list: panel.querySelector('[data-mail-upload-fallback-list]'),
    status: panel.querySelector('[data-mail-upload-fallback-status]'),
    form: panel.querySelector('[data-mail-compose]')
  };
}

function renderFallbackUploads(panel) {
  const { input, list, status, form } = fallbackNodes(panel);
  const submit = form?.querySelector('button[type="submit"]');
  if (input instanceof HTMLInputElement) input.disabled = fallbackState.uploading;
  if (submit instanceof HTMLButtonElement) submit.disabled = fallbackState.uploading;
  if (status instanceof HTMLElement) {
    status.classList.toggle('is-error', fallbackState.status.startsWith('ERROR:'));
    status.textContent = fallbackState.status || (fallbackState.uploads.length
      ? `${fallbackState.uploads.length} CDN file${fallbackState.uploads.length === 1 ? '' : 's'} attached.`
      : '');
  }
  if (!(list instanceof HTMLElement)) return;
  list.replaceChildren();
  fallbackState.uploads.forEach((upload, index) => {
    const row = document.createElement('div');
    row.className = 'dni-mail-upload-fallback-row';
    const detail = document.createElement('div');
    const link = document.createElement('a');
    link.href = String(upload.url || '#');
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = upload.original_name || upload.name || 'DNI CDN file';
    const meta = document.createElement('small');
    meta.textContent = `${formatBytes(upload.size)} // ${upload.mime_type || 'application/octet-stream'} // CL/NON PUBLIC CDN`;
    detail.append(link, meta);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'dni-mail-upload-fallback-remove';
    remove.textContent = 'REMOVE';
    remove.addEventListener('click', () => {
      fallbackState.uploads.splice(index, 1);
      fallbackState.status = '';
      renderFallbackUploads(panel);
    });
    row.append(detail, remove);
    list.append(row);
  });
}

async function fallbackUploadCdnFile(panel, file, fileNumber, fileTotal) {
  if (!(file instanceof File) || file.size <= 0) throw new Error('Empty files cannot be uploaded.');
  if (file.size > DNI_CDN_MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 200 MB DNI CDN limit.`);
  let csrfToken = await fetchMailCsrfToken();
  const uploadId = createUploadId();
  const totalChunks = Math.max(1, Math.ceil(file.size / DNI_CDN_CHUNK_BYTES));
  let completed = null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * DNI_CDN_CHUNK_BYTES;
    const end = Math.min(file.size, start + DNI_CDN_CHUNK_BYTES);
    const form = new FormData();
    form.append('uploadId', uploadId);
    form.append('chunkIndex', String(chunkIndex));
    form.append('totalChunks', String(totalChunks));
    form.append('totalSize', String(file.size));
    form.append('originalName', file.name);
    form.append('chunk', file.slice(start, end), file.name);
    const percent = Math.max(1, Math.round((chunkIndex / totalChunks) * 100));
    fallbackState.status = `UPLOADING ${fileNumber}/${fileTotal} // ${file.name} // ${percent}%`;
    renderFallbackUploads(panel);

    const response = await fetch(`${MAIL_UPLOAD_URL}?action=chunk`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-DNI-CSRF': csrfToken },
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `DNI CDN upload HTTP ${response.status}`);
    if (payload.csrfToken) {
      csrfToken = String(payload.csrfToken);
      fallbackState.csrfToken = csrfToken;
    }
    if (payload.complete && payload.upload) completed = payload.upload;
  }

  if (!completed?.url || !String(completed.url).startsWith(DNI_CDN_BASE_URL)) {
    throw new Error('DNI CDN did not return a valid file source URL.');
  }
  return completed;
}

async function handleFallbackFiles(panel, files) {
  const selected = [...(files || [])];
  if (!selected.length || fallbackState.uploading) return;
  if (fallbackState.uploads.length + selected.length > DNI_CDN_MAX_FILES) {
    fallbackState.status = `ERROR: Maximum ${DNI_CDN_MAX_FILES} CDN files per mail.`;
    renderFallbackUploads(panel);
    return;
  }

  fallbackState.uploading = true;
  fallbackState.status = 'PREPARING DNI CDN UPLOAD…';
  renderFallbackUploads(panel);
  try {
    for (let index = 0; index < selected.length; index += 1) {
      const uploaded = await fallbackUploadCdnFile(panel, selected[index], index + 1, selected.length);
      fallbackState.uploads.push(uploaded);
    }
    fallbackState.status = `${selected.length} file${selected.length === 1 ? '' : 's'} uploaded to DNI CDN.`;
  } catch (error) {
    fallbackState.status = `ERROR: ${String(error?.message || error || 'DNI CDN upload failed.')}`;
  } finally {
    fallbackState.uploading = false;
    const input = fallbackNodes(panel).input;
    if (input instanceof HTMLInputElement) input.value = '';
    renderFallbackUploads(panel);
  }
}

function installFallbackSubmitHook(panel, form) {
  if (!(form instanceof HTMLFormElement) || form.dataset.dniUploadFallbackSubmit === 'true') return;
  form.dataset.dniUploadFallbackSubmit = 'true';
  form.addEventListener('submit', event => {
    if (!panel.querySelector('[data-dni-upload-fallback="true"]')) return;
    if (fallbackState.uploading) {
      event.preventDefault();
      event.stopImmediatePropagation();
      fallbackState.status = 'ERROR: Wait for the current DNI CDN upload to finish before sending.';
      renderFallbackUploads(panel);
      return;
    }
    if (!fallbackState.uploads.length) return;

    const body = form.elements.namedItem('body');
    if (!(body instanceof HTMLTextAreaElement)) return;
    const original = body.value;
    const clean = stripCdnBlock(original).trimEnd();
    const links = fallbackState.uploads.map(upload => `${upload.original_name || upload.name || 'DNI CDN file'} | ${upload.url}`);
    const merged = `${clean}${clean ? '\n\n' : ''}${DNI_CDN_BLOCK}\n${links.join('\n')}`;
    const maxLength = Number(body.maxLength || 0);
    if (maxLength > 0 && merged.length > maxLength) {
      event.preventDefault();
      event.stopImmediatePropagation();
      fallbackState.status = 'ERROR: Message body plus CDN attachment references exceeds the DNI Mail body limit.';
      renderFallbackUploads(panel);
      return;
    }

    body.value = merged;
    queueMicrotask(() => {
      if (body.isConnected && body.value === merged) body.value = original;
    });
  }, { capture: true });
}

function ensureMailUploadField(panel) {
  let input = panel.querySelector('[data-mail-cdn-input]');
  let field = panel.querySelector('[data-mail-cdn-field]');
  if (input instanceof HTMLInputElement && field instanceof HTMLElement) return { input, field, fallback: false };

  const form = panel.querySelector('[data-mail-compose]');
  const classification = panel.querySelector('[data-mail-classification]');
  if (!(form instanceof HTMLFormElement) || !(classification instanceof HTMLSelectElement)) return null;
  const classificationField = classification.closest('label') || classification.parentElement;
  if (!(classificationField instanceof HTMLElement)) return null;

  field = document.createElement('label');
  field.className = 'dni-mail-compose-wide dni-mail-cdn-field';
  field.dataset.mailCdnField = '';
  field.dataset.dniUploadFallback = 'true';
  field.append(document.createTextNode('CDN File Attachments'));

  input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.dataset.mailCdnInput = '';
  input.dataset.dniUploadFallback = 'true';
  field.append(input);

  const list = document.createElement('div');
  list.className = 'dni-mail-upload-fallback-list';
  list.dataset.mailUploadFallbackList = '';
  const status = document.createElement('div');
  status.className = 'dni-mail-upload-fallback-status';
  status.dataset.mailUploadFallbackStatus = '';
  status.setAttribute('aria-live', 'polite');

  classificationField.insertAdjacentElement('afterend', field);
  field.insertAdjacentElement('afterend', status);
  status.insertAdjacentElement('beforebegin', list);

  input.addEventListener('change', () => void handleFallbackFiles(panel, input.files));
  installFallbackSubmitHook(panel, form);
  renderFallbackUploads(panel);
  return { input, field, fallback: true };
}

function upgradeMailUploadButton(panel) {
  const ensured = ensureMailUploadField(panel);
  if (!ensured) return;
  const { input, field } = ensured;
  if (field.dataset.dniUploadButton === 'true') return;
  field.dataset.dniUploadButton = 'true';

  input.setAttribute('aria-label', 'Choose DNI Mail image or file attachments');

  const actions = document.createElement('div');
  actions.className = 'dni-mail-upload-actions';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dni-mail-upload-button';
  button.dataset.mailUploadButton = 'true';
  button.innerHTML = '<span class="dni-mail-upload-button-icon" aria-hidden="true">📎</span><span>Upload Image / File</span>';

  const limit = document.createElement('span');
  limit.className = 'dni-mail-upload-limit';
  limit.textContent = 'UP TO 200 MB PER FILE // MULTIPLE FILES SUPPORTED';

  const syncDisabled = () => {
    button.disabled = input.disabled;
    button.setAttribute('aria-disabled', input.disabled ? 'true' : 'false');
  };

  button.addEventListener('click', () => {
    if (!input.disabled) input.click();
  });

  input.addEventListener('change', () => {
    const count = input.files?.length || 0;
    if (count > 0) {
      const label = button.querySelector('span:last-child');
      if (label) label.textContent = count === 1 ? 'Uploading 1 File…' : `Uploading ${count} Files…`;
      window.setTimeout(() => {
        const current = button.querySelector('span:last-child');
        if (current) current.textContent = 'Upload Image / File';
      }, 1200);
    }
  });

  const disabledObserver = new MutationObserver(syncDisabled);
  disabledObserver.observe(input, { attributes: true, attributeFilter: ['disabled'] });
  syncDisabled();

  actions.append(button, limit);
  input.insertAdjacentElement('afterend', actions);
}

function scanMailUploadButton() {
  const panel = document.querySelector('#dni-mail-panel');
  if (panel instanceof HTMLElement) upgradeMailUploadButton(panel);
}

let scanQueued = false;
function queueScanMailUploadButton() {
  if (scanQueued) return;
  scanQueued = true;
  queueMicrotask(() => {
    scanQueued = false;
    scanMailUploadButton();
  });
}

installMailUploadButtonStyles();
scanMailUploadButton();
const composeRoot = document.querySelector('#dni-mail-panel [data-mail-compose]');
if (composeRoot) {
  new MutationObserver(queueScanMailUploadButton).observe(composeRoot, { childList: true, subtree: true });
}
