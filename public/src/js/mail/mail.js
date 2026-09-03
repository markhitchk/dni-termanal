const shell = document.querySelector('.terminal-shell');
const tabs = [...document.querySelectorAll('.nav-tab')];
const inboxButton = document.querySelector('#terminal-inbox');
const MAIL_URL = '/mail-data.php';
const MAIL_UPLOAD_URL = '/mail-upload.php';
const DNI_CDN_BASE_URL = 'https://cdn.dreadnoughtimperium.org/files/';
const DNI_CDN_MAX_FILE_BYTES = 200 * 1024 * 1024;
const DNI_CDN_CHUNK_BYTES = 1024 * 1024;
const DNI_CDN_MAX_FILES = 10;
const DNI_CDN_BLOCK = '--- DNI CDN ATTACHMENTS ---';
const REPLY_SEPARATOR = '––––––––––––––––––––––––––––––––––––––––––––';
const MAIL_SIGNATURE_MAX_LENGTH = 4000;
const NON_REPLY_ADDRESSES = new Set(['system@dni.org', 'noreply@dni.org']);
const MASTER_SYSTEM_MAIL_CODE = 'MAIL-000004';

let scanQueued = false;
let keepMailUntil = 0;
let mailContextLocked = false;
let mailMutationObserver = null;
let mailContextObserver = null;
let mailSubmitContextHandlerInstalled = false;

const CLEARANCES = Object.freeze([
  { level: 0, code: 'CL/NON', name: 'Unclassified' },
  { level: 1, code: 'CL0/UTO', name: 'Official' },
  { level: 2, code: 'CL1/FOR', name: 'Level 1' },
  { level: 3, code: 'CL2/VER', name: 'Level 2' },
  { level: 4, code: 'CL3/CON', name: 'Level 3' },
  { level: 5, code: 'CL4/MET', name: 'Level 4' },
  { level: 6, code: 'CLA/DIS', name: 'Absolute' }
]);

const state = {
  initialized: false,
  loading: false,
  authenticated: false,
  permissions: [],
  clearance: null,
  identity: null,
  csrfToken: '',
  messages: [],
  directory: [],
  activeFilter: 'all',
  selectedMessageId: null,
  selectedMessage: null,
  uploads: [],
  uploading: false,
  uploadStatus: '',
  signature: '',
  signatureLoaded: false,
  signatureLoading: false,
  signaturePromise: null,
  composeContext: 'normal',
  error: ''
};

function has(permission) {
  return state.permissions.includes('admin') || state.permissions.includes(permission);
}

function canSendAny() {
  return has('mail.send') || has('mail.announce') || has('mail.service_announce');
}

function isMasterSystemMail(message) {
  return String(message?.id || message?.message_code || '').trim().toUpperCase() === MASTER_SYSTEM_MAIL_CODE;
}

function canReplyToMessage(message) {
  if (!message || typeof message !== 'object') return false;
  const type = String(message.message_type || '').trim().toLowerCase();
  const address = String(message.from_address || '').trim().toLowerCase();
  return type === 'message' && Boolean(address) && !NON_REPLY_ADDRESSES.has(address);
}

function installMailStyles() {
  if (!document.querySelector('link[data-dni-mail-style]')) {
    const source = new URL(import.meta.url);
    const stylesheet = source.pathname.includes('/dist/')
      ? new URL(`./mail.css${source.search}`, source)
      : new URL(`../css/mail.css${source.search}`, source);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesheet.href;
    link.dataset.dniMailStyle = 'true';
    document.head.append(link);
  }

  if (document.querySelector('style[data-dni-mail-cdn-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailCdnStyle = 'true';
  style.textContent = `
    .dni-mail-compose-identity{grid-column:1/-1;border:1px solid rgba(200,168,102,.34);background:rgba(200,168,102,.055);padding:10px 12px;font:700 11px/1.45 "Courier New",monospace;letter-spacing:.45px;color:#c8a866}
    .dni-mail-compose-identity b{color:#f2f2f2}.dni-mail-compose-identity small{display:block;margin-top:2px;color:#878787;font-size:9px}
    .dni-mail-cdn-field input[type=file]{display:block;width:100%;margin-top:8px;padding:10px;border:1px dashed rgba(200,168,102,.42);background:#080808;color:#bdbdbd;font:700 10px/1.3 "Courier New",monospace}
    .dni-mail-cdn-help{display:block;margin-top:6px;color:#777;font:700 9px/1.45 "Courier New",monospace;letter-spacing:.25px}.dni-mail-cdn-help strong{color:#c8a866}
    .dni-mail-cdn-list{grid-column:1/-1;display:grid;gap:7px}.dni-mail-cdn-list:empty{display:none}
    .dni-mail-cdn-upload{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #282828;background:#080808;padding:9px 10px}
    .dni-mail-cdn-upload a{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c8a866;font:700 10px/1.3 "Courier New",monospace}.dni-mail-cdn-upload small{display:block;margin-top:3px;color:#777;font-size:8px}
    .dni-mail-cdn-remove{border:1px solid #4b4b4b;background:#101010;color:#bcbcbc;padding:5px 8px;font:700 8px/1 "Courier New",monospace;cursor:pointer}.dni-mail-cdn-remove:hover{border-color:#c8a866;color:#fff}
    .dni-mail-cdn-status{grid-column:1/-1;min-height:16px;color:#9b9b9b;font:700 9px/1.4 "Courier New",monospace}.dni-mail-cdn-status.is-error{color:#e45d62}
    .dni-mail-cdn-attachments{margin-top:18px;border-top:1px solid #2a2a2a;padding-top:12px}.dni-mail-cdn-attachments>strong{display:block;margin-bottom:8px;color:#c8a866;font:700 10px/1.3 "Courier New",monospace;letter-spacing:.7px}
    .dni-mail-cdn-card{margin-top:8px;border:1px solid #292929;background:#070707;padding:9px}.dni-mail-cdn-card a{color:#c8a866;overflow-wrap:anywhere;font:700 10px/1.35 "Courier New",monospace}.dni-mail-cdn-card span{display:block;margin-top:5px;color:#777;font:700 8px/1.3 "Courier New",monospace}
    .dni-mail-cdn-preview{display:block;max-width:100%;max-height:420px;margin-top:10px;border:1px solid #303030;background:#020202;object-fit:contain}
    .dni-mail-sender-address{color:#9c9c9c!important;overflow-wrap:anywhere}
    @media(max-width:700px){.dni-mail-cdn-upload{grid-template-columns:1fr}.dni-mail-cdn-remove{justify-self:start}.dni-mail-cdn-preview{max-height:300px}}
  `;
  document.head.append(style);
}

function installReaderActionStyles() {
  if (document.querySelector('style[data-dni-mail-actions-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailActionsStyle = 'true';
  style.textContent = `
    .dni-mail-reader-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 0;padding-top:12px;border-top:1px solid #292929}
    .dni-mail-reader-actions button{min-height:36px;padding:8px 13px;border:1px solid #575757;background:#111;color:#d7d7d7;font:700 10px/1 "Courier New",monospace;letter-spacing:.65px;cursor:pointer}
    .dni-mail-reader-actions button:hover:not(:disabled){border-color:#c8a866;color:#fff;background:#17140d}
    .dni-mail-reader-actions button:disabled{opacity:.45;cursor:not-allowed}
    .dni-mail-reader-actions .dni-mail-reply-action{border-color:rgba(200,168,102,.58);color:#e2c98f}
    .dni-mail-reader-actions .dni-mail-delete-action{border-color:rgba(212,78,83,.6);color:#e98589}
    .dni-mail-reader-actions .dni-mail-delete-action[data-confirm="true"]{background:#431416;border-color:#e45d62;color:#fff}
    .dni-mail-reader-action-status{flex:1 1 220px;min-width:180px;color:#888;font:700 9px/1.4 "Courier New",monospace;letter-spacing:.3px}
    .dni-mail-reader-action-status.is-error{color:#e45d62}.dni-mail-reader-action-status.is-success{color:#c8a866}
    .dni-mail-signature-settings{margin-top:18px;padding:14px;border:1px solid rgba(200,168,102,.38);background:rgba(200,168,102,.055);font-family:"Courier New",monospace}
    .dni-mail-signature-settings h3{margin:0;color:#c8a866;font:700 12px/1.25 "Courier New",monospace;letter-spacing:.8px;text-transform:uppercase}
    .dni-mail-signature-settings p{margin:6px 0 10px;color:#929292;font:700 9px/1.45 "Courier New",monospace;letter-spacing:.25px}
    .dni-mail-signature-settings textarea{box-sizing:border-box;display:block;width:100%;min-height:104px;resize:vertical;border:1px solid #4b4130;background:#070707;color:#e8e1d2;padding:10px;font:400 11px/1.5 "Courier New",monospace;outline:none}
    .dni-mail-signature-settings textarea:focus{border-color:#c8a866;box-shadow:0 0 0 1px rgba(200,168,102,.18)}
    .dni-mail-signature-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}.dni-mail-signature-actions button{min-height:34px;padding:8px 12px;border:1px solid rgba(200,168,102,.55);background:#111;color:#d9c18c;font:700 9px/1 "Courier New",monospace;letter-spacing:.55px;cursor:pointer}.dni-mail-signature-actions button:hover:not(:disabled){background:#17140d;border-color:#c8a866;color:#fff}.dni-mail-signature-actions button:disabled{opacity:.45;cursor:not-allowed}
    .dni-mail-signature-status{min-height:14px;margin-top:8px;color:#858585;font:700 8px/1.4 "Courier New",monospace}.dni-mail-signature-status.is-error{color:#e45d62}.dni-mail-signature-status.is-success{color:#c8a866}
    @media(max-width:700px){.dni-mail-reader-actions button{flex:1 1 120px}.dni-mail-reader-action-status{flex-basis:100%;min-width:0}.dni-mail-signature-actions button{flex:1 1 130px}}
  `;
  document.head.append(style);
}

async function jsonRequest(url, options = {}) {
  const { timeoutMs = 12000, ...requestOptions } = options;
  const controller = requestOptions.signal ? null : new AbortController();
  const timeout = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(requestOptions.headers || {}) },
      ...requestOptions,
      ...(controller ? { signal: controller.signal } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `DNI Mail HTTP ${response.status}`);
      error.status = response.status;
      error.loginUrl = payload.loginUrl || '';
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('DNI Mail reader timed out. Tap the message to retry.');
    throw error;
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
}

async function post(action, body = {}) {
  if (!state.csrfToken) throw new Error('DNI security token unavailable. Reload DNI Mail.');
  const payload = await jsonRequest(`${MAIL_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DNI-CSRF': state.csrfToken
    },
    body: JSON.stringify(body)
  });
  if (payload.csrfToken) state.csrfToken = String(payload.csrfToken);
  return payload;
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

function cdnLinksFromBody(rawBody = '') {
  const matches = String(rawBody).match(/https:\/\/cdn\.dreadnoughtimperium\.org\/files\/[A-Za-z0-9._~%+\-]+/g) || [];
  return [...new Set(matches)];
}

function visibleBodyText(rawBody = '') {
  const body = String(rawBody || '');
  const markerIndex = body.indexOf(`\n\n${DNI_CDN_BLOCK}`);
  if (markerIndex >= 0) return body.slice(0, markerIndex).trimEnd();
  const directMarker = body.indexOf(DNI_CDN_BLOCK);
  return directMarker >= 0 ? body.slice(0, directMarker).trimEnd() : body;
}

function normalizeSignature(value = '') {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (normalized.length > MAIL_SIGNATURE_MAX_LENGTH) {
    throw new Error(`Mail signature exceeds ${MAIL_SIGNATURE_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function replaceAutoSignature(body, nextSignature = state.signature) {
  if (!(body instanceof HTMLTextAreaElement)) return;
  const previous = String(body.dataset.mailSignatureValue || '');
  const previousBlock = previous ? `${REPLY_SEPARATOR}\n${previous}` : '';
  const next = normalizeSignature(nextSignature);
  const nextBlock = next ? `${REPLY_SEPARATOR}\n${next}` : '';

  if (body.dataset.mailSignatureApplied === 'true' && previousBlock) {
    const index = body.value.indexOf(previousBlock);
    if (index >= 0) body.value = `${body.value.slice(0, index)}${body.value.slice(index + previousBlock.length)}`;
  }
  body.value = body.value.replace(/\n{4,}$/g, '\n\n');

  if (nextBlock) {
    const cleanBody = body.value.replace(/\s+$/u, '');
    body.value = cleanBody ? `${cleanBody}\n\n${nextBlock}` : `\n\n${nextBlock}`;
    body.dataset.mailSignatureApplied = 'true';
    body.dataset.mailSignatureValue = next;
  } else {
    delete body.dataset.mailSignatureApplied;
    delete body.dataset.mailSignatureValue;
    body.value = body.value.replace(/\s+$/u, '');
  }
}

function applySignatureToCompose({ resetBody = false } = {}) {
  const form = ensureMailPanel()?.querySelector('[data-mail-compose]');
  const body = form?.elements.namedItem('body');
  if (!(body instanceof HTMLTextAreaElement)) return;
  if (resetBody) {
    body.value = '';
    delete body.dataset.mailSignatureApplied;
    delete body.dataset.mailSignatureValue;
  }
  replaceAutoSignature(body, state.signature);
  const firstContent = body.value.search(/\S/u);
  const caret = firstContent > 0 ? 0 : Math.max(0, firstContent);
  body.focus({ preventScroll: true });
  body.setSelectionRange(caret, caret);
  body.scrollTop = 0;
}

async function loadMailSignature({ force = false } = {}) {
  if (state.signatureLoaded && !force) return state.signature;
  if (state.signaturePromise) return state.signaturePromise;
  if (!state.authenticated) await loadMailbox({ quiet: true });
  if (!state.authenticated) throw new Error('Discord sign-in required.');

  state.signatureLoading = true;
  state.signaturePromise = (async () => {
    const payload = await jsonRequest(`${MAIL_URL}?action=signature`);
    if (payload.csrfToken) state.csrfToken = String(payload.csrfToken);
    state.signature = normalizeSignature(payload.signature || '');
    state.signatureLoaded = true;
    syncMailSignatureSettings();
    return state.signature;
  })();
  try {
    return await state.signaturePromise;
  } finally {
    state.signatureLoading = false;
    state.signaturePromise = null;
  }
}

async function saveMailSignature(value) {
  const signature = normalizeSignature(value);
  if (!state.authenticated || !state.csrfToken) await loadMailbox({ quiet: true });
  if (!state.authenticated) throw new Error('Discord sign-in required.');
  const payload = await post('signature', { signature });
  state.signature = normalizeSignature(payload.signature ?? signature);
  state.signatureLoaded = true;
  syncMailSignatureSettings('SIGNATURE SAVED // DNI ACCOUNT DATABASE UPDATED', 'success');
  return state.signature;
}

function cdnDisplayName(url) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || 'DNI CDN file');
  } catch {
    return 'DNI CDN file';
  }
}

function isImageCdnUrl(url) {
  return /\.(?:apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(String(url).split(/[?#]/, 1)[0]);
}

function renderCdnUploads() {
  const panel = ensureMailPanel();
  const list = panel?.querySelector('[data-mail-cdn-list]');
  const status = panel?.querySelector('[data-mail-cdn-status]');
  const input = panel?.querySelector('[data-mail-cdn-input]');
  const submit = panel?.querySelector('[data-mail-compose] button[type="submit"]');
  if (input) input.disabled = state.uploading;
  if (submit) submit.disabled = state.uploading;
  if (status) {
    status.classList.toggle('is-error', state.uploadStatus.startsWith('ERROR:'));
    status.textContent = state.uploadStatus || (state.uploads.length ? `${state.uploads.length} CDN file${state.uploads.length === 1 ? '' : 's'} attached.` : '');
  }
  if (!list) return;
  list.replaceChildren();
  state.uploads.forEach((upload, index) => {
    const row = document.createElement('div');
    row.className = 'dni-mail-cdn-upload';
    const detail = document.createElement('div');
    const link = document.createElement('a');
    link.href = upload.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = upload.original_name || upload.name || cdnDisplayName(upload.url);
    const meta = document.createElement('small');
    meta.textContent = `${formatBytes(upload.size)} // ${upload.mime_type || 'application/octet-stream'} // CL/NON PUBLIC CDN`;
    detail.append(link, meta);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'dni-mail-cdn-remove';
    remove.textContent = 'REMOVE';
    remove.addEventListener('click', () => {
      state.uploads.splice(index, 1);
      state.uploadStatus = '';
      renderCdnUploads();
      updateComposeSecurity();
    });
    row.append(detail, remove);
    list.append(row);
  });
}

async function uploadCdnFile(file, fileNumber, fileTotal) {
  if (!state.csrfToken) throw new Error('DNI security token unavailable. Reload DNI Mail.');
  if (!(file instanceof File) || file.size <= 0) throw new Error('Empty files cannot be uploaded.');
  if (file.size > DNI_CDN_MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 200 MB DNI CDN limit.`);

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
    state.uploadStatus = `UPLOADING ${fileNumber}/${fileTotal} // ${file.name} // ${percent}%`;
    renderCdnUploads();

    const response = await fetch(`${MAIL_UPLOAD_URL}?action=chunk`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-DNI-CSRF': state.csrfToken },
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `DNI CDN upload HTTP ${response.status}`);
    if (payload.csrfToken) state.csrfToken = String(payload.csrfToken);
    if (payload.complete && payload.upload) completed = payload.upload;
  }
  if (!completed?.url || !String(completed.url).startsWith(DNI_CDN_BASE_URL)) {
    throw new Error('DNI CDN did not return a valid file source URL.');
  }
  return completed;
}

async function handleCdnFiles(files) {
  const selected = [...(files || [])];
  if (!selected.length) return;
  if (state.uploading) return;
  if (state.uploads.length + selected.length > DNI_CDN_MAX_FILES) {
    state.uploadStatus = `ERROR: Maximum ${DNI_CDN_MAX_FILES} CDN files per mail.`;
    renderCdnUploads();
    return;
  }
  state.uploading = true;
  state.uploadStatus = 'PREPARING DNI CDN UPLOAD…';
  renderCdnUploads();
  try {
    for (let index = 0; index < selected.length; index += 1) {
      const uploaded = await uploadCdnFile(selected[index], index + 1, selected.length);
      state.uploads.push(uploaded);
    }
    state.uploadStatus = `${selected.length} file${selected.length === 1 ? '' : 's'} uploaded to ${DNI_CDN_BASE_URL}`;
  } catch (error) {
    state.uploadStatus = `ERROR: ${String(error?.message || error || 'DNI CDN upload failed.')}`;
  } finally {
    state.uploading = false;
    const input = ensureMailPanel()?.querySelector('[data-mail-cdn-input]');
    if (input) input.value = '';
    renderCdnUploads();
    updateComposeSecurity();
  }
}

function ensureLaunchBadge() {
  if (!inboxButton) return null;
  let badge = inboxButton.querySelector('.dni-mail-launch-count');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'dni-mail-launch-count';
    inboxButton.append(badge);
  }
  return badge;
}

function normalizeMailFilter(value = '') {
  const filter = String(value).toLowerCase();
  if (filter === 'unread') return 'unread';
  if (filter === 'announcement' || filter === 'announcements') return 'announcements';
  if (filter === 'service' || filter === 'services') return 'service';
  return 'all';
}

function messageMatchesFilter(message, filter) {
  if (filter === 'unread') return !message.read;
  if (filter === 'announcements') return message.message_type === 'announcement';
  if (filter === 'service') return message.message_type === 'service_announcement';
  return true;
}

function filterCount(filter) {
  return state.messages.filter(message => messageMatchesFilter(message, filter)).length;
}

function unreadCount() {
  return filterCount('unread');
}

function senderInitials(sender) {
  const clean = String(sender || 'DNI').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(part => part[0]).join('') || 'DN').toUpperCase();
}

function dateText(value) {
  if (!value) return 'DNI NETWORK';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function replyDateText(value) {
  if (!value) return 'DNI NETWORK';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  }).format(date);
}

function replySubject(value) {
  const original = String(value || 'DNI Mail').trim().replace(/^(?:\s*re:\s*)+/i, '').trim();
  return `Re: ${original || 'DNI Mail'}`;
}

function clearanceText(message) {
  if (message?.clearance?.code) return `${message.clearance.code} — ${message.clearance.name || ''}`.trim();
  const found = CLEARANCES.find(item => item.level === Number(message?.clearance_level));
  return found ? `${found.code} — ${found.name}` : 'CLASSIFICATION UNKNOWN';
}

function ensureMailPanel() {
  if (!shell) return null;
  let panel = document.querySelector('#dni-mail-panel');
  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'dni-mail-panel';
  panel.className = 'module-panel dni-mail-panel';
  panel.dataset.module = 'mail';
  panel.setAttribute('aria-labelledby', 'dni-mail-title');
  panel.style.display = 'none';
  panel.innerHTML = `
    <header class="dni-mail-header">
      <div>
        <div class="module-kicker">DNI INTERNAL MESSAGE NETWORK</div>
        <div class="dni-mail-title-row">
          <span class="dni-mail-envelope" aria-hidden="true"></span>
          <h2 id="dni-mail-title">DNI Mail</h2>
        </div>
        <p class="module-subtitle">Clearance-controlled internal messages, official announcements, service notices, and DNI CDN file sharing.</p>
      </div>
      <div class="provider-badge" data-mail-provider>MAIL SECURE LINK</div>
    </header>

    <div class="dni-mail-statusbar" aria-label="DNI Mail status">
      <span><b>ACCOUNT</b> <span data-mail-account>DNI AUTH REQUIRED</span></span>
      <span><b>CLEARANCE</b> <span data-mail-clearance>CHECKING</span></span>
      <span><b>UNREAD</b> <span id="dni-mail-unread">0</span></span>
      <span class="dni-mail-online" data-mail-online><i></i> CONNECTING</span>
    </div>

    <section class="dni-mail-security-notice">
      <strong>MANDATORY MAIL CLASSIFICATION</strong>
      <span>Mail remains clearance controlled. Files uploaded to the public DNI CDN are CL/NON share links; use DNI Document codes for classified attachments.</span>
    </section>

    <section class="dni-mail-compose-shell" data-mail-compose-shell hidden>
      <div class="dni-mail-pane-head">
        <div><span>AUTHORIZED SENDER</span><h3>Compose DNI Mail</h3></div>
        <button type="button" class="dni-mail-compose-close" data-mail-compose-close>CLOSE</button>
      </div>
      <form class="dni-mail-compose" data-mail-compose>
        <div class="dni-mail-compose-identity" data-mail-compose-identity><b>FROM:</b> DNI identity loading…</div>
        <label>Message Type<select name="messageType" data-mail-type></select></label>
        <label data-mail-recipient-field>Recipients<select name="recipients" multiple size="5" data-mail-recipients></select></label>
        <label>Classification<select name="clearanceLevel" data-mail-classification></select></label>
        <label class="dni-mail-compose-wide" data-mail-attachment-field>Classified DNI Document Codes<input name="attachments" autocomplete="off" placeholder="DNI-173, DNI-204"><span class="dni-mail-cdn-help">Server-authorized DNI Documents only. Classification propagates into the mail.</span></label>
        <label class="dni-mail-compose-wide dni-mail-cdn-field" data-mail-cdn-field>CDN File Attachments<input type="file" multiple data-mail-cdn-input><span class="dni-mail-cdn-help"><strong>200 MB max per file.</strong> Images, APKs, archives, documents, and other non-server-executable files are supported. Uploads become public CL/NON sources at ${DNI_CDN_BASE_URL}</span></label>
        <div class="dni-mail-cdn-list" data-mail-cdn-list></div>
        <div class="dni-mail-cdn-status" data-mail-cdn-status aria-live="polite"></div>
        <label class="dni-mail-compose-wide">Subject<input name="subject" maxlength="180" required autocomplete="off"></label>
        <label class="dni-mail-compose-wide">Message Body<textarea name="body" maxlength="100000" rows="8" required></textarea></label>
        <div class="dni-mail-compose-wide dni-mail-compose-security" data-mail-compose-security></div>
        <div class="dni-mail-compose-wide dni-mail-compose-actions">
          <button class="dni-primary-action" type="submit">SEND SECURE MAIL</button>
        </div>
      </form>
    </section>

    <div class="dni-mail-client">
      <aside class="dni-mail-folders" aria-label="DNI Mail folders">
        <div class="dni-mail-folder-label">MAILBOXES</div>
        <button class="dni-mail-folder is-active" type="button" data-mail-filter="all"><span class="dni-mail-folder-icon"></span><span>Inbox</span><span class="dni-mail-folder-count" data-mail-count="all">0</span></button>
        <button class="dni-mail-folder" type="button" data-mail-filter="unread"><span class="dni-mail-folder-icon"></span><span>Unread</span><span class="dni-mail-folder-count" data-mail-count="unread">0</span></button>
        <button class="dni-mail-folder" type="button" data-mail-filter="announcements"><span class="dni-mail-folder-icon"></span><span>Announcements</span><span class="dni-mail-folder-count" data-mail-count="announcements">0</span></button>
        <button class="dni-mail-folder" type="button" data-mail-filter="service"><span class="dni-mail-folder-icon"></span><span>Service</span><span class="dni-mail-folder-count" data-mail-count="service">0</span></button>
        <button class="dni-mail-compose-launch" type="button" data-mail-compose-launch hidden>COMPOSE</button>
        <div class="dni-mail-readonly" data-mail-mode>READ-ONLY MAILBOX<br>Operational send privileges are role controlled.</div>
      </aside>

      <section class="dni-mail-list-pane" aria-labelledby="dni-mail-list-title">
        <div class="dni-mail-pane-head">
          <div><span id="dni-mail-filter-label">INBOX</span><h3 id="dni-mail-list-title">Messages</h3></div>
          <span class="dni-mail-pane-count" id="dni-mail-pane-count">0 messages</span>
        </div>
        <div class="dni-mail-message-list" id="dni-mail-list"></div>
      </section>

      <section class="dni-mail-reader-pane" aria-labelledby="dni-mail-reader-title">
        <div id="dni-mail-reader" class="dni-mail-reader-empty">
          <div><div class="module-kicker">SECURE MESSAGE READER</div><p>Select a message from the inbox.</p></div>
        </div>
      </section>
    </div>

    <footer class="dni-mail-footer">DNI Mail authorization is enforced by the server. CDN file links are public CL/NON file-sharing sources and must not contain classified DNI material.</footer>`;

  shell.append(panel);
  panel.querySelectorAll('[data-mail-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeFilter = normalizeMailFilter(button.dataset.mailFilter || 'all');
      state.selectedMessageId = null;
      state.selectedMessage = null;
      renderMailList();
      renderReaderEmpty();
    });
  });
  panel.querySelector('[data-mail-compose-launch]')?.addEventListener('click', () => void openCompose());
  panel.querySelector('[data-mail-compose-close]')?.addEventListener('click', closeCompose);
  panel.querySelector('[data-mail-type]')?.addEventListener('change', updateComposeMode);
  panel.querySelector('[data-mail-classification]')?.addEventListener('change', updateComposeSecurity);
  panel.querySelector('[data-mail-cdn-input]')?.addEventListener('change', event => void handleCdnFiles(event.target.files));
  panel.querySelector('[data-mail-compose]')?.addEventListener('submit', event => {
    event.preventDefault();
    void sendCompose();
  });
  return panel;
}

function renderReaderEmpty(text = 'Select a message from the inbox.') {
  const reader = document.querySelector('#dni-mail-reader');
  if (!reader) return;
  reader.className = 'dni-mail-reader-empty';
  reader.replaceChildren();
  const wrapper = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'module-kicker';
  kicker.textContent = 'SECURE MESSAGE READER';
  const copy = document.createElement('p');
  copy.textContent = text;
  wrapper.append(kicker, copy);
  reader.append(wrapper);
}

function setMailError(message = '') {
  state.error = String(message || '');
  const online = document.querySelector('[data-mail-online]');
  if (!online) return;
  if (state.error) {
    online.className = 'dni-mail-online is-error';
    online.innerHTML = '<i></i> LINK ERROR';
  } else if (state.authenticated) {
    if (online.dataset.mailRealtimeManaged === 'true') return;
    online.className = 'dni-mail-online';
    online.innerHTML = '<i></i> SECURE LINK';
  } else {
    online.className = 'dni-mail-online is-error';
    online.innerHTML = '<i></i> SIGN IN REQUIRED';
  }
}

function updateIdentityDisplay() {
  const panel = ensureMailPanel();
  const account = panel?.querySelector('[data-mail-account]');
  if (account) account.textContent = state.authenticated
    ? (state.identity?.address || 'DNI ACCOUNT')
    : 'DISCORD SIGN-IN REQUIRED';
  const identity = panel?.querySelector('[data-mail-compose-identity]');
  if (identity) {
    const name = state.identity?.name || 'DNI USER';
    const address = state.identity?.address || 'identity unavailable';
    identity.replaceChildren();
    const line = document.createElement('div');
    line.innerHTML = `<b>FROM:</b> ${escapeHtml(name)} &lt;${escapeHtml(address)}&gt;`;
    const note = document.createElement('small');
    note.textContent = 'Name follows your Discord server nickname, then Discord display name. DNI address always uses the lowercase Discord username.';
    identity.append(line, note);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function updateMailStatus() {
  const panel = ensureMailPanel();
  const unread = unreadCount();
  const unreadEl = panel?.querySelector('#dni-mail-unread');
  if (unreadEl) unreadEl.textContent = String(unread);

  for (const filter of ['all', 'unread', 'announcements', 'service']) {
    const counter = panel?.querySelector(`[data-mail-count="${filter}"]`);
    if (counter) counter.textContent = String(filterCount(filter));
  }

  const badge = ensureLaunchBadge();
  if (badge) {
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
  }
  if (inboxButton) inboxButton.setAttribute('aria-label', `DNI Mail, ${unread} unread message${unread === 1 ? '' : 's'}`);

  updateIdentityDisplay();
  const clearance = panel?.querySelector('[data-mail-clearance]');
  if (clearance) clearance.textContent = state.clearance?.code ? `${state.clearance.code} — ${state.clearance.name}` : 'UNAVAILABLE';
  const provider = panel?.querySelector('[data-mail-provider]');
  if (provider) provider.textContent = state.authenticated ? 'MAIL + DNI CDN' : 'MAIL AUTH REQUIRED';

  const compose = panel?.querySelector('[data-mail-compose-launch]');
  if (compose) compose.hidden = !canSendAny();
  const mode = panel?.querySelector('[data-mail-mode]');
  if (mode) mode.innerHTML = canSendAny()
    ? 'SECURE SEND ENABLED<br>200 MB CDN uploads available.'
    : 'READ-ONLY MAILBOX<br>Operational send privileges are role controlled.';
  setMailError(state.error);
  renderCdnUploads();
}

async function loadMailbox({ quiet = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  if (!quiet) setMailError('');
  try {
    const payload = await jsonRequest(`${MAIL_URL}?action=list&filter=all`);
    const previousAddress = String(state.identity?.address || '').toLowerCase();
    const nextAddress = String(payload.identity?.address || '').toLowerCase();
    if (previousAddress && nextAddress && previousAddress !== nextAddress) {
      state.signature = '';
      state.signatureLoaded = false;
      state.directory = [];
    }
    state.authenticated = true;
    state.permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
    state.clearance = payload.effectiveClearance || null;
    state.identity = payload.identity || null;
    state.csrfToken = String(payload.csrfToken || state.csrfToken || '');
    state.messages = Array.isArray(payload.messages) ? payload.messages : [];
    state.error = '';
  } catch (error) {
    state.authenticated = false;
    state.permissions = [];
    state.clearance = null;
    state.identity = null;
    state.messages = [];
    state.directory = [];
    state.signature = '';
    state.signatureLoaded = false;
    if (!quiet || error?.status !== 401) state.error = String(error?.message || error || 'DNI Mail unavailable.');
  } finally {
    state.loading = false;
    updateMailStatus();
    if (!quiet) renderMailList();
  }
}

function renderMailList({ preserveReader = false } = {}) {
  const panel = ensureMailPanel();
  const list = panel?.querySelector('#dni-mail-list');
  const label = panel?.querySelector('#dni-mail-filter-label');
  const paneCount = panel?.querySelector('#dni-mail-pane-count');
  if (!list) return;

  const messages = state.messages.filter(message => messageMatchesFilter(message, state.activeFilter));
  const labels = { all: 'INBOX', unread: 'UNREAD', announcements: 'ANNOUNCEMENTS', service: 'SERVICE' };
  if (label) label.textContent = labels[state.activeFilter] || 'INBOX';
  if (paneCount) paneCount.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'}`;
  panel.querySelectorAll('[data-mail-filter]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mailFilter === state.activeFilter);
  });

  list.replaceChildren();
  if (!state.authenticated) {
    const card = document.createElement('div');
    card.className = 'dni-mail-empty';
    const link = document.createElement('a');
    link.href = '/auth/discord/login';
    link.className = 'dni-primary-action';
    link.textContent = 'SIGN IN WITH DISCORD';
    const text = document.createElement('p');
    text.textContent = 'DNI Mail is available only to authenticated Dreadnought Imperium personnel.';
    card.append(text, link);
    list.append(card);
    if (!preserveReader) renderReaderEmpty('Discord sign-in is required before mail metadata is returned.');
    updateMailStatus();
    return;
  }
  if (state.error) {
    const empty = document.createElement('div');
    empty.className = 'dni-mail-empty';
    empty.textContent = state.error;
    list.append(empty);
    if (!preserveReader) renderReaderEmpty('DNI Mail secure link unavailable.');
    updateMailStatus();
    return;
  }
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'dni-mail-empty';
    empty.textContent = state.activeFilter === 'unread' ? 'No unread DNI Mail.' : 'No authorized messages in this mailbox.';
    list.append(empty);
    if (!preserveReader) renderReaderEmpty(state.activeFilter === 'unread' ? 'No unread messages.' : 'No authorized message selected.');
    updateMailStatus();
    return;
  }

  for (const message of messages) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dni-mail-message';
    if (!message.read) item.classList.add('is-unread');
    if (isMasterSystemMail(message)) item.classList.add('is-system-mail');
    if (state.selectedMessageId === message.id) item.classList.add('is-active');

    if (!message.read) {
      const dot = document.createElement('span');
      dot.className = 'dni-mail-unread-dot';
      dot.setAttribute('aria-label', 'Unread');
      item.append(dot);
    }

    const top = document.createElement('div');
    top.className = 'dni-mail-message-top';
    const sender = document.createElement('span');
    sender.className = 'dni-mail-message-sender';
    sender.textContent = message.from || 'DNI NETWORK';
    const date = document.createElement('span');
    date.className = 'dni-mail-message-date';
    date.textContent = dateText(message.sent_at);
    top.append(sender, date);

    const subject = document.createElement('div');
    subject.className = 'dni-mail-message-subject';
    subject.textContent = message.subject || 'DNI Mail';
    const preview = document.createElement('div');
    preview.className = 'dni-mail-message-preview';
    preview.textContent = message.preview || '';

    const meta = document.createElement('div');
    meta.className = 'dni-mail-message-meta';
    for (const value of [message.type || 'DNI MAIL', clearanceText(message), message.id]) {
      const chip = document.createElement('span');
      chip.className = value === message.id ? 'dni-mail-id' : 'dni-mail-type';
      chip.textContent = value;
      meta.append(chip);
    }
    if (isMasterSystemMail(message)) {
      const systemChip = document.createElement('span');
      systemChip.className = 'dni-mail-system-chip';
      systemChip.textContent = 'SYSTEM MESSAGE';
      meta.insertBefore(systemChip, meta.firstChild);
    }

    item.append(top, subject, preview, meta);
    item.addEventListener('click', () => void openMessage(message.id));
    list.append(item);
  }
  updateMailStatus();
}

async function openMessage(messageId) {
  if (!state.authenticated || !messageId) return;
  state.selectedMessageId = String(messageId);
  renderMailList();
  renderReaderEmpty('VERIFYING CURRENT CLEARANCE…');
  try {
    // Reading is a clearance-checked GET and must not wait on the receipt write.
    // This keeps the reader responsive even when SQLite is briefly busy with a
    // realtime/session write. Mark-read completes independently afterward.
    const payload = await jsonRequest(`${MAIL_URL}?action=record&id=${encodeURIComponent(messageId)}`);
    const message = payload.message;
    if (!message) throw new Error('DNI Mail record unavailable.');
    state.selectedMessage = message;
    const summary = state.messages.find(item => item.id === message.id);
    if (summary) summary.read = true;
    renderReader(message);
    renderMailList();
    void post('mark-read', { id: messageId }).catch(error => {
      console.warn('DNI Mail read receipt will retry during the next mailbox sync.', error);
    });
  } catch (error) {
    state.selectedMessageId = null;
    state.selectedMessage = null;
    renderReaderEmpty(String(error?.message || error || 'DNI Mail record unavailable.'));
    await loadMailbox({ quiet: true });
    renderMailList();
  }
}

function renderReader(message) {
  const reader = document.querySelector('#dni-mail-reader');
  if (!reader || !message) return;
  reader.className = 'dni-mail-reader';
  if (isMasterSystemMail(message)) reader.classList.add('is-system-mail');
  reader.replaceChildren();

  const header = document.createElement('div');
  header.className = 'dni-mail-reader-header';
  const kicker = document.createElement('div');
  kicker.className = 'dni-mail-reader-kicker';
  kicker.textContent = isMasterSystemMail(message) ? 'DNI AUTOMATED SYSTEM' : (message.type || 'DNI MAIL');
  const subject = document.createElement('h3');
  subject.id = 'dni-mail-reader-title';
  subject.className = 'dni-mail-reader-subject';
  subject.textContent = message.subject || 'DNI Mail';

  const senderRow = document.createElement('div');
  senderRow.className = 'dni-mail-sender-row';
  const avatar = document.createElement('div');
  avatar.className = 'dni-mail-avatar';
  avatar.textContent = senderInitials(message.from_name || message.from);
  const sender = document.createElement('div');
  sender.className = 'dni-mail-sender';
  const senderName = document.createElement('strong');
  senderName.textContent = message.from_name || message.from || 'DNI NETWORK';
  sender.append(senderName);
  if (message.from_address) {
    const address = document.createElement('small');
    address.className = 'dni-mail-sender-address';
    address.textContent = String(message.from_address).toLowerCase();
    sender.append(address);
  }
  const recipient = document.createElement('small');
  recipient.textContent = message.audience_type === 'all_members' ? 'to authorized Dreadnought Imperium personnel' : 'to authorized recipient';
  sender.append(recipient);
  const date = document.createElement('div');
  date.className = 'dni-mail-reader-date';
  date.textContent = dateText(message.sent_at);
  senderRow.append(avatar, sender, date);

  const meta = document.createElement('div');
  meta.className = 'dni-mail-reader-meta';
  for (const text of [message.id, message.type || 'DNI MAIL', clearanceText(message), 'SERVER AUTHORIZED']) {
    const chip = document.createElement('span');
    chip.textContent = text;
    meta.append(chip);
  }
  header.append(kicker, subject, senderRow, meta);

  const rawBody = String(message.body || '');
  const cdnLinks = cdnLinksFromBody(rawBody);
  const body = document.createElement('div');
  body.className = 'dni-mail-reader-body';
  body.textContent = visibleBodyText(rawBody);

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (attachments.length) {
    const section = document.createElement('section');
    section.className = 'dni-mail-attachments';
    const title = document.createElement('strong');
    title.textContent = 'AUTHORIZED DOCUMENT ATTACHMENTS';
    section.append(title);
    for (const attachment of attachments) {
      const link = document.createElement('a');
      link.href = attachment.download_url || '#';
      link.textContent = `${attachment.file_code || 'DNI'} — ${attachment.title || attachment.name || 'Document'}`;
      const clearance = document.createElement('span');
      clearance.textContent = attachment.clearance?.code || 'CLASSIFIED';
      const row = document.createElement('div');
      row.append(link, clearance);
      section.append(row);
    }
    body.append(document.createElement('br'), section);
  }

  if (cdnLinks.length) {
    const section = document.createElement('section');
    section.className = 'dni-mail-cdn-attachments';
    const title = document.createElement('strong');
    title.textContent = 'DNI CDN FILE ATTACHMENTS // CL/NON PUBLIC LINKS';
    section.append(title);
    for (const url of cdnLinks) {
      const card = document.createElement('div');
      card.className = 'dni-mail-cdn-card';
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = cdnDisplayName(url);
      const source = document.createElement('span');
      source.textContent = url;
      card.append(link, source);
      if (isImageCdnUrl(url)) {
        const image = document.createElement('img');
        image.className = 'dni-mail-cdn-preview';
        image.src = url;
        image.alt = cdnDisplayName(url);
        image.loading = 'lazy';
        image.decoding = 'async';
        card.append(image);
      }
      section.append(card);
    }
    body.append(section);
  }

  const notice = document.createElement('div');
  notice.className = 'dni-mail-reader-security';
  notice.textContent = 'CLASSIFICATION CHECKED AT OPEN TIME // CDN LINKS ARE PUBLIC CL/NON SOURCES // NEVER PLACE CLASSIFIED MATERIAL ON THE PUBLIC CDN';
  reader.append(header, body, notice);
  installReaderActions(reader, message);

  if (window.matchMedia('(max-width: 700px)').matches) reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function availableMessageTypes() {
  const out = [];
  if (has('mail.send')) out.push(['message', 'DIRECT DNI MAIL']);
  if (has('mail.announce')) out.push(['announcement', 'NETWORK ANNOUNCEMENT']);
  if (has('mail.service_announce')) out.push(['service_announcement', 'SERVICE ANNOUNCEMENT']);
  return out;
}

async function loadDirectory() {
  if (state.directory.length || !has('mail.send')) return;
  const payload = await jsonRequest(`${MAIL_URL}?action=directory`);
  state.directory = Array.isArray(payload.users) ? payload.users : [];
}

function populateCompose() {
  const panel = ensureMailPanel();
  const type = panel?.querySelector('[data-mail-type]');
  const recipients = panel?.querySelector('[data-mail-recipients]');
  const classification = panel?.querySelector('[data-mail-classification]');
  if (!type || !recipients || !classification) return;

  type.replaceChildren();
  for (const [value, label] of availableMessageTypes()) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    type.append(option);
  }

  recipients.replaceChildren();
  for (const user of state.directory) {
    const option = document.createElement('option');
    option.value = String(user.id);
    option.textContent = user.label || `${user.name || `DNI USER ${user.id}`} · ${user.address || ''}`.trim();
    recipients.append(option);
  }

  classification.replaceChildren();
  const maxLevel = Number(state.clearance?.level ?? 0);
  for (const item of CLEARANCES.filter(entry => entry.level <= maxLevel)) {
    const option = document.createElement('option');
    option.value = String(item.level);
    option.textContent = `${item.code} — ${item.name}`;
    option.selected = item.level === maxLevel;
    classification.append(option);
  }
  updateIdentityDisplay();
  updateComposeMode();
  updateComposeSecurity();
  renderCdnUploads();
}

async function openCompose({ applySignature = true, resetBody = false, scroll = true, context = 'normal' } = {}) {
  if (!canSendAny()) return null;
  const composeShell = ensureMailPanel()?.querySelector('[data-mail-compose-shell]');
  if (!composeShell) return null;
  try {
    await loadDirectory();
    try {
      await loadMailSignature();
    } catch {
      // Signature retrieval must not disable the existing compose/send path.
      state.signature = '';
      state.signatureLoaded = false;
    }
    populateCompose();
    state.composeContext = context;
    composeShell.hidden = false;
    if (applySignature) applySignatureToCompose({ resetBody });
    if (scroll) composeShell.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return composeShell;
  } catch (error) {
    setMailError(String(error?.message || error || 'Unable to load DNI Mail composer.'));
    return null;
  }
}

function closeCompose() {
  const compose = ensureMailPanel()?.querySelector('[data-mail-compose-shell]');
  if (compose) compose.hidden = true;
  if (state.composeContext === 'reply') releaseMailContext();
  state.composeContext = 'normal';
}

function updateComposeMode() {
  const panel = ensureMailPanel();
  const type = panel?.querySelector('[data-mail-type]')?.value || 'message';
  const recipientField = panel?.querySelector('[data-mail-recipient-field]');
  const attachmentField = panel?.querySelector('[data-mail-attachment-field]');
  const cdnField = panel?.querySelector('[data-mail-cdn-field]');
  const cdnList = panel?.querySelector('[data-mail-cdn-list]');
  const cdnStatus = panel?.querySelector('[data-mail-cdn-status]');
  const direct = type === 'message';
  if (recipientField) recipientField.hidden = !direct;
  if (attachmentField) attachmentField.hidden = !direct;
  if (cdnField) cdnField.hidden = !direct;
  if (cdnList) cdnList.hidden = !direct;
  if (cdnStatus) cdnStatus.hidden = !direct;
  updateComposeSecurity();
}

function updateComposeSecurity() {
  const panel = ensureMailPanel();
  const target = panel?.querySelector('[data-mail-compose-security]');
  const select = panel?.querySelector('[data-mail-classification]');
  const type = panel?.querySelector('[data-mail-type]')?.value || 'message';
  if (!target || !select) return;
  const selected = CLEARANCES.find(item => item.level === Number(select.value));
  if (type === 'message') {
    const cdn = state.uploads.length ? ` // ${state.uploads.length} PUBLIC CDN FILE${state.uploads.length === 1 ? '' : 'S'} ATTACHED AS CL/NON` : '';
    target.textContent = `${selected?.code || 'CLASSIFIED'} // DNI DOCUMENT ATTACHMENTS CAN RAISE CLASSIFICATION${cdn} // SERVER ENFORCED`;
  } else {
    target.textContent = `${selected?.code || 'CLASSIFIED'} // AUTHORIZED RECIPIENTS ARE FILTERED AT READ TIME // SERVER ENFORCED`;
  }
}

function keepMailContext() {
  const currentShell = document.querySelector('.terminal-shell');
  const panel = document.querySelector('#dni-mail-panel');
  if (currentShell instanceof HTMLElement) currentShell.dataset.panel = 'mail';
  if (panel instanceof HTMLElement) panel.style.display = 'block';

  for (const tab of document.querySelectorAll('.nav-tab')) {
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
  }

  const normalized = String(window.location.pathname || '/').replace(/\/+$/, '') || '/';
  if (normalized !== '/mail') {
    history.replaceState(
      { ...(history.state || {}), panel: 'mail' },
      '',
      `/mail${window.location.search || ''}${window.location.hash || ''}`
    );
  }
}

function holdMailContext(durationMs = 1800) {
  keepMailUntil = Math.max(keepMailUntil, Date.now() + durationMs);
  keepMailContext();
}

function lockMailContext() {
  mailContextLocked = true;
  holdMailContext(3000);
}

function releaseMailContext() {
  mailContextLocked = false;
  keepMailUntil = 0;
}

function shouldKeepMailContext() {
  return mailContextLocked || Date.now() < keepMailUntil;
}

function refreshMailInPlace() {
  holdMailContext(2500);
  const inbox = document.querySelector('#terminal-inbox');
  if (inbox instanceof HTMLElement) {
    inbox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return;
  }
  window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel: 'mail' } }));
}

function setReaderActionStatus(target, text, status = '') {
  if (!target) return;
  target.className = 'dni-mail-reader-action-status';
  if (status) target.classList.add(`is-${status}`);
  target.textContent = text;
}

function readerMetadata(reader) {
  const metaValues = [...reader.querySelectorAll('.dni-mail-reader-meta span')]
    .map(node => String(node.textContent || '').trim())
    .filter(Boolean);
  const messageId = metaValues.find(value => /^MAIL-\d+$/i.test(value)) || '';
  const clearance = metaValues.find(value => /^CL(?:\/NON|\d|A\/DIS)/i.test(value)) || '';
  return {
    messageId,
    subject: String(reader.querySelector('.dni-mail-reader-subject')?.textContent || '').trim(),
    fromAddress: String(reader.querySelector('.dni-mail-sender-address')?.textContent || '').trim().toLowerCase(),
    clearanceCode: clearance.split(/\s|—/, 1)[0] || ''
  };
}

async function startReply(message, status) {
  if (!message || typeof message !== 'object') throw new Error('DNI Mail reply source is unavailable.');
  if (!state.authenticated || !state.csrfToken) await loadMailbox({ quiet: true });
  if (!has('mail.send')) throw new Error('Your DNI account does not have mail.send permission.');

  const fromAddress = String(message.from_address || '').trim().toLowerCase();
  if (!fromAddress) throw new Error('This network message does not have a reply address.');

  setReaderActionStatus(status, 'PREPARING SECURE REPLY…');
  lockMailContext();
  const composeShell = await openCompose({ applySignature: false, resetBody: true, scroll: false, context: 'reply' });
  if (!(composeShell instanceof HTMLElement)) throw new Error('DNI Mail composer is unavailable.');
  keepMailContext();

  const form = composeShell.querySelector('[data-mail-compose]');
  const recipients = form?.querySelector('[data-mail-recipients]');
  if (!(form instanceof HTMLFormElement) || !(recipients instanceof HTMLSelectElement)) {
    throw new Error('DNI Mail composer did not become ready.');
  }

  const target = [...recipients.options].find(option => {
    const user = state.directory.find(item => String(item.id) === String(option.value));
    return String(user?.address || '').trim().toLowerCase() === fromAddress
      || String(option.textContent || '').toLowerCase().includes(fromAddress);
  });
  if (!target) throw new Error(`Reply recipient ${fromAddress} is not available in the DNI directory.`);
  for (const option of recipients.options) option.selected = option === target;
  recipients.dispatchEvent(new Event('change', { bubbles: true }));

  const type = form.querySelector('[data-mail-type]');
  if (type instanceof HTMLSelectElement) {
    type.value = 'message';
    type.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const subject = form.elements.namedItem('subject');
  if (subject instanceof HTMLInputElement) subject.value = replySubject(message.subject || message.id || 'DNI Mail');

  const classification = form.querySelector('[data-mail-classification]');
  if (classification instanceof HTMLSelectElement) {
    const originalLevel = Number(message.clearance_level ?? message.clearance?.level ?? 0);
    const maxLevel = Number(state.clearance?.level ?? 0);
    const clampedLevel = Math.max(0, Math.min(Number.isFinite(originalLevel) ? originalLevel : 0, Number.isFinite(maxLevel) ? maxLevel : 0));
    const option = [...classification.options].find(item => Number(item.value) === clampedLevel);
    if (option) classification.value = option.value;
    classification.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const body = form.elements.namedItem('body');
  if (body instanceof HTMLTextAreaElement) {
    const senderName = String(message.from_name || message.from || 'DNI NETWORK').trim();
    const quote = `${REPLY_SEPARATOR}\nOn ${replyDateText(message.sent_at)} ${senderName} <${fromAddress}> wrote:\n${REPLY_SEPARATOR}\n\n${visibleBodyText(message.body || '')}`;
    const signature = normalizeSignature(state.signature);
    body.value = signature
      ? `\n\n${REPLY_SEPARATOR}\n${signature}\n\n${quote}`
      : `\n\n${quote}`;
    if (signature) {
      body.dataset.mailSignatureApplied = 'true';
      body.dataset.mailSignatureValue = signature;
    } else {
      delete body.dataset.mailSignatureApplied;
      delete body.dataset.mailSignatureValue;
    }
    body.placeholder = `Reply to ${message.id || fromAddress}`;
    body.focus({ preventScroll: true });
    body.setSelectionRange(0, 0);
    body.scrollTop = 0;
  }

  keepMailContext();
  composeShell.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setReaderActionStatus(status, `REPLY READY // TO ${fromAddress}`, 'success');
}

async function deleteMail(meta, status, button) {
  holdMailContext(3000);
  if (!meta.messageId) throw new Error('DNI Mail message ID is unavailable.');

  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = 'CONFIRM DELETE';
    setReaderActionStatus(status, 'DELETE HIDES THIS MESSAGE FROM YOUR MAILBOX ONLY. PRESS CONFIRM DELETE.', 'error');
    window.setTimeout(() => {
      if (button.isConnected && button.dataset.confirm === 'true') {
        button.dataset.confirm = 'false';
        button.textContent = 'DELETE';
        setReaderActionStatus(status, '');
      }
    }, 5000);
    return;
  }

  button.disabled = true;
  setReaderActionStatus(status, `DELETING ${meta.messageId}…`);
  if (!state.authenticated || !state.csrfToken) await loadMailbox({ quiet: true });
  const result = await post('delete', { id: meta.messageId });
  if (result?.deleted?.deleted !== true) throw new Error('DNI Mail delete did not complete.');
  setReaderActionStatus(status, `${meta.messageId} DELETED FROM YOUR MAILBOX`, 'success');
  refreshMailInPlace();
}

function installReaderActions(reader, message = null) {
  if (!(reader instanceof HTMLElement) || !reader.classList.contains('dni-mail-reader')) return;
  if (reader.querySelector('[data-mail-message-actions]')) return;

  const meta = readerMetadata(reader);
  if (!meta.messageId) return;
  const sourceMessage = message && String(message.id) === meta.messageId
    ? message
    : (state.selectedMessage && String(state.selectedMessage.id) === meta.messageId ? state.selectedMessage : null);

  const actions = document.createElement('div');
  actions.className = 'dni-mail-reader-actions';
  actions.dataset.mailMessageActions = 'true';

  const reply = document.createElement('button');
  reply.type = 'button';
  reply.className = 'dni-mail-reply-action';
  reply.textContent = 'REPLY';
  const replyable = canReplyToMessage(sourceMessage);
  reply.disabled = !replyable;
  if (!replyable) reply.title = 'Automated system and network announcements cannot receive replies.';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'dni-mail-delete-action';
  remove.textContent = 'DELETE';
  remove.dataset.confirm = 'false';

  const status = document.createElement('span');
  status.className = 'dni-mail-reader-action-status';
  status.setAttribute('aria-live', 'polite');

  reply.addEventListener('click', async () => {
    reply.disabled = true;
    try {
      await startReply(sourceMessage, status);
    } catch (error) {
      releaseMailContext();
      setReaderActionStatus(status, String(error?.message || error || 'Unable to prepare reply.'), 'error');
    } finally {
      if (mailContextLocked) keepMailContext();
      if (reply.isConnected && canReplyToMessage(sourceMessage)) reply.disabled = false;
    }
  });

  remove.addEventListener('click', async () => {
    holdMailContext(3000);
    try {
      await deleteMail(meta, status, remove);
    } catch (error) {
      remove.disabled = false;
      remove.dataset.confirm = 'false';
      remove.textContent = 'DELETE';
      setReaderActionStatus(status, String(error?.message || error || 'Unable to delete DNI Mail.'), 'error');
    } finally {
      keepMailContext();
    }
  });

  actions.append(reply, remove, status);
  const security = reader.querySelector('.dni-mail-reader-security');
  if (security) reader.insertBefore(actions, security);
  else reader.append(actions);
}

function mailSignatureSettingsSection() {
  return document.querySelector('[data-mail-signature-settings]');
}

function setMailSignatureSettingsStatus(text = '', status = '') {
  const node = mailSignatureSettingsSection()?.querySelector('[data-mail-signature-status]');
  if (!node) return;
  node.className = 'dni-mail-signature-status';
  if (status) node.classList.add(`is-${status}`);
  node.textContent = text;
}

function syncMailSignatureSettings(statusText = '', status = '') {
  const section = mailSignatureSettingsSection();
  const input = section?.querySelector('[data-mail-signature-input]');
  if (input instanceof HTMLTextAreaElement && document.activeElement !== input) input.value = state.signature;
  if (statusText) setMailSignatureSettingsStatus(statusText, status);
  else if (section && !state.signatureLoading) setMailSignatureSettingsStatus(state.signature ? 'SYNCED TO DNI USER DATABASE' : 'NO SIGNATURE CONFIGURED');
}

function injectMailSignatureSettings() {
  const root = document.querySelector('#dni-user-settings');
  const body = root?.querySelector('.dni-user-settings-body');
  if (!(body instanceof HTMLElement)) return null;
  let section = body.querySelector('[data-mail-signature-settings]');
  if (section instanceof HTMLElement) {
    syncMailSignatureSettings();
    return section;
  }

  section = document.createElement('section');
  section.className = 'dni-mail-signature-settings';
  section.dataset.mailSignatureSettings = 'true';
  section.innerHTML = `
    <h3>Mail Signature</h3>
    <p>Stored on your DNI user record and appended to all outgoing DNI Mail, announcements, service announcements, and replies.</p>
    <textarea rows="5" maxlength="${MAIL_SIGNATURE_MAX_LENGTH}" data-mail-signature-input aria-label="DNI Mail signature" placeholder="Enter your DNI Mail signature"></textarea>
    <div class="dni-mail-signature-actions">
      <button type="button" data-mail-signature-save>SAVE SIGNATURE</button>
      <button type="button" data-mail-signature-clear>CLEAR</button>
    </div>
    <div class="dni-mail-signature-status" data-mail-signature-status aria-live="polite"></div>`;

  const actions = body.querySelector('.dni-user-settings-actions');
  if (actions) body.insertBefore(section, actions);
  else body.append(section);

  const input = section.querySelector('[data-mail-signature-input]');
  const save = section.querySelector('[data-mail-signature-save]');
  const clear = section.querySelector('[data-mail-signature-clear]');
  if (input instanceof HTMLTextAreaElement) input.value = state.signature;

  save?.addEventListener('click', async () => {
    if (!(input instanceof HTMLTextAreaElement)) return;
    save.disabled = true;
    if (clear instanceof HTMLButtonElement) clear.disabled = true;
    setMailSignatureSettingsStatus('SAVING SIGNATURE…');
    try {
      await saveMailSignature(input.value);
      input.value = state.signature;
    } catch (error) {
      setMailSignatureSettingsStatus(String(error?.message || error || 'Unable to save Mail signature.'), 'error');
    } finally {
      save.disabled = false;
      if (clear instanceof HTMLButtonElement) clear.disabled = false;
    }
  });

  clear?.addEventListener('click', async () => {
    if (!(input instanceof HTMLTextAreaElement)) return;
    save.disabled = true;
    clear.disabled = true;
    setMailSignatureSettingsStatus('CLEARING SIGNATURE…');
    try {
      await saveMailSignature('');
      input.value = '';
      setMailSignatureSettingsStatus('SIGNATURE CLEARED // DNI ACCOUNT DATABASE UPDATED', 'success');
    } catch (error) {
      setMailSignatureSettingsStatus(String(error?.message || error || 'Unable to clear Mail signature.'), 'error');
    } finally {
      save.disabled = false;
      clear.disabled = false;
    }
  });

  if (state.authenticated) {
    void loadMailSignature().then(() => syncMailSignatureSettings()).catch(error => {
      setMailSignatureSettingsStatus(String(error?.message || error || 'Unable to load Mail signature.'), 'error');
    });
  } else {
    setMailSignatureSettingsStatus('DNI AUTH REQUIRED TO LOAD SIGNATURE');
  }
  return section;
}

function terminalMailOutput(text, isError = false) {
  const output = document.querySelector('#terminal-output');
  const terminal = document.querySelector('#terminal-window');
  if (!(output instanceof HTMLElement)) return;
  const line = document.createElement('div');
  if (isError) line.className = 'muted';
  line.style.whiteSpace = 'pre-wrap';
  line.textContent = String(text || '');
  output.append(line);
  if (terminal instanceof HTMLElement) terminal.scrollTop = terminal.scrollHeight;
}

function openMailSignatureSettings() {
  const commandInput = document.querySelector('#command-input');
  if (commandInput instanceof HTMLInputElement) {
    const previous = commandInput.value;
    commandInput.value = 'settings';
    commandInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
    }));
    commandInput.value = previous;
  }

  for (const delay of [0, 60, 180]) {
    window.setTimeout(() => {
      const section = injectMailSignatureSettings();
      if (!(section instanceof HTMLElement)) return;
      section.scrollIntoView({ behavior: delay ? 'smooth' : 'auto', block: 'nearest' });
      if (delay === 180) section.querySelector('[data-mail-signature-input]')?.focus({ preventScroll: true });
    }, delay);
  }
}

async function showMailSignatureCommand() {
  openMailSignatureSettings();
  try {
    const signature = await loadMailSignature({ force: true });
    terminalMailOutput(signature ? `MAIL SIGNATURE //\n${signature}` : 'MAIL SIGNATURE // NOT CONFIGURED');
  } catch (error) {
    terminalMailOutput(`MAIL SIGNATURE ERROR // ${String(error?.message || error || 'Unable to load signature.')}`, true);
  }
}

function handleMailSignatureCommand(args) {
  const action = String(args[1] || 'show').toLowerCase();
  if (action === 'show') {
    void showMailSignatureCommand();
    return { ok: true };
  }
  if (action === 'set') {
    const text = args.slice(2).join(' ').trim();
    if (!text) return { ok: false, message: 'USAGE: MAIL SIGNATURE SET <text>' };
    void saveMailSignature(text)
      .then(signature => terminalMailOutput(`MAIL SIGNATURE SAVED // ${signature.length} CHARACTERS`))
      .catch(error => terminalMailOutput(`MAIL SIGNATURE ERROR // ${String(error?.message || error)}`, true));
    return { ok: true, message: 'SAVING DNI MAIL SIGNATURE…' };
  }
  if (action === 'clear') {
    void saveMailSignature('')
      .then(() => terminalMailOutput('MAIL SIGNATURE // CLEARED'))
      .catch(error => terminalMailOutput(`MAIL SIGNATURE ERROR // ${String(error?.message || error)}`, true));
    return { ok: true, message: 'CLEARING DNI MAIL SIGNATURE…' };
  }
  return { ok: false, message: 'USAGE: MAIL SIGNATURE SET <text> | CLEAR | SHOW' };
}

let realtimeMailboxResyncTimer = 0;

function realtimeMailThreadKey(message) {
  return String(message?.thread_id || message?.threadId || message?.id || '').trim().toUpperCase();
}

function sortRealtimeMailbox(messages) {
  messages.sort((a, b) => {
    const at = Date.parse(String(a?.sent_at || '')) || 0;
    const bt = Date.parse(String(b?.sent_at || '')) || 0;
    if (at !== bt) return bt - at;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
  return messages;
}

function queueRealtimeMailboxResync() {
  window.clearTimeout(realtimeMailboxResyncTimer);
  realtimeMailboxResyncTimer = window.setTimeout(async () => {
    realtimeMailboxResyncTimer = 0;
    if (state.loading) {
      queueRealtimeMailboxResync();
      return;
    }
    await loadMailbox({ quiet: true });
    renderMailList({ preserveReader: true });
  }, 80);
}

function applyRealtimeMailboxDelta(detail = {}) {
  const changes = Array.isArray(detail?.changes) ? detail.changes : [];
  if (!changes.length) return;
  if (!state.authenticated) {
    queueRealtimeMailboxResync();
    return;
  }

  const selectedSummary = state.messages.find(message => String(message?.id || '') === String(state.selectedMessageId || ''));
  const selectedThreadKey = realtimeMailThreadKey(state.selectedMessage) || realtimeMailThreadKey(selectedSummary);
  const byThread = new Map();
  for (const message of state.messages) {
    const key = realtimeMailThreadKey(message);
    if (key) byThread.set(key, message);
  }

  let complete = true;
  for (const change of changes) {
    const eventName = String(change?.event || '');
    const items = Array.isArray(change?.items) ? change.items : [];
    for (const item of items) {
      if (eventName === 'delete') {
        const key = realtimeMailThreadKey(item?.summary || item);
        if (key) byThread.delete(key);
        continue;
      }

      const summary = item?.summary;
      const key = realtimeMailThreadKey(summary);
      if (!summary || !key) {
        complete = false;
        continue;
      }
      byThread.set(key, summary);
    }
  }

  if (!complete) {
    queueRealtimeMailboxResync();
    return;
  }

  state.messages = sortRealtimeMailbox([...byThread.values()]);
  if (selectedThreadKey) {
    const selected = byThread.get(selectedThreadKey);
    if (selected) {
      state.selectedMessageId = String(selected.id || state.selectedMessageId || '');
    } else {
      state.selectedMessageId = null;
      state.selectedMessage = null;
      renderReaderEmpty('This DNI Mail thread is no longer available.');
    }
  }
  renderMailList({ preserveReader: true });
}

function scanMailUi() {
  scanQueued = false;
  installReaderActions(document.querySelector('#dni-mail-reader'), state.selectedMessage);
  injectMailSignatureSettings();
}

function queueMailUiScan() {
  if (scanQueued) return;
  scanQueued = true;
  queueMicrotask(scanMailUi);
}

function startMailObservers() {
  if (!mailMutationObserver && shell instanceof HTMLElement) {
    mailMutationObserver = new MutationObserver(queueMailUiScan);
    mailMutationObserver.observe(shell, { childList: true, subtree: true });
  }
  if (!mailContextObserver && shell instanceof HTMLElement) {
    mailContextObserver = new MutationObserver(() => {
      if (!shouldKeepMailContext()) return;
      if (shell.dataset.panel !== 'mail') keepMailContext();
    });
    mailContextObserver.observe(shell, { attributes: true, attributeFilter: ['data-panel'] });
  }
  if (!mailSubmitContextHandlerInstalled) {
    mailSubmitContextHandlerInstalled = true;
    document.addEventListener('submit', event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches('[data-mail-compose]')) return;
      holdMailContext(3000);
      for (const delay of [0, 100, 350, 900, 1800]) {
        window.setTimeout(() => {
          if (shouldKeepMailContext()) keepMailContext();
        }, delay);
      }
    }, true);
  }
}

function bodyWithCdnAttachments(body) {
  const clean = String(body || '').trim();
  if (!state.uploads.length) return clean;
  const lines = state.uploads.map(upload => `${upload.original_name || upload.name || 'DNI CDN file'} | ${upload.url}`);
  return `${clean}\n\n${DNI_CDN_BLOCK}\n${lines.join('\n')}`;
}

async function sendCompose() {
  const panel = ensureMailPanel();
  const form = panel?.querySelector('[data-mail-compose]');
  if (!form) return;
  if (state.uploading) {
    setMailError('Wait for the current DNI CDN upload to finish before sending.');
    return;
  }
  const type = String(form.elements.messageType.value || 'message');
  const recipientUserIds = type === 'message'
    ? [...form.elements.recipients.selectedOptions].map(option => Number(option.value)).filter(Number.isInteger)
    : [];
  const attachmentCodes = type === 'message'
    ? String(form.elements.attachments.value || '').split(',').map(value => value.trim()).filter(Boolean)
    : [];
  const rawBody = String(form.elements.body.value || '').trim();
  const finalBody = type === 'message' ? bodyWithCdnAttachments(rawBody) : rawBody;
  if (finalBody.length > 100000) {
    setMailError('Message body plus CDN attachment references exceeds the DNI Mail body limit.');
    return;
  }
  const payload = {
    messageType: type,
    recipientUserIds,
    clearanceLevel: Number(form.elements.clearanceLevel.value),
    attachmentCodes,
    subject: String(form.elements.subject.value || '').trim(),
    body: finalBody
  };

  setMailError('');
  try {
    const result = await post('send', payload);
    form.reset();
    state.uploads = [];
    state.uploadStatus = '';
    renderCdnUploads();
    closeCompose();
    await loadMailbox({ quiet: true });
    renderMailList();
    const sentCode = result.sent?.message_code || 'DNI MAIL';
    const reader = document.querySelector('#dni-mail-reader');
    if (reader) {
      reader.className = 'dni-mail-reader-empty';
      reader.textContent = `${sentCode} SENT // ${result.sent?.clearance?.code || 'CLASSIFICATION APPLIED'} // DELIVERY AUTHORIZATION ENFORCED`;
    }
  } catch (error) {
    setMailError(String(error?.message || error || 'Unable to send DNI Mail.'));
  }
}

export function openMail(filter = 'all') {
  const panel = ensureMailPanel();
  if (!shell || !panel) return;
  shell.dataset.panel = 'mail';
  for (const tab of tabs) {
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
  }
  panel.style.display = 'block';
  state.activeFilter = normalizeMailFilter(filter);
  state.selectedMessageId = null;
  state.selectedMessage = null;
  renderReaderEmpty();
  renderMailList();
  void loadMailbox().then(() => renderMailList());
  window.dispatchEvent(new CustomEvent('dni:panel', { detail: { panel: 'mail' } }));
}

export function handleMailCommand(args = []) {
  const firstArg = String(args[0] || '').toLowerCase();
  if (firstArg === 'signature') return handleMailSignatureCommand(args);
  if (firstArg === 'read') {
    const id = args[1];
    if (!id) return { ok: false, message: 'USAGE: MAIL READ <id>' };
    openMail('all');
    window.setTimeout(() => void openMessage(id), 0);
    return { ok: true, message: `OPENING DNI MAIL ${String(id).toUpperCase()} // CURRENT CLEARANCE WILL BE RECHECKED` };
  }
  if (firstArg === 'unread') {
    openMail('unread');
    return { ok: true, message: 'OPENING UNREAD DNI MAIL // SERVER AUTHORIZED' };
  }
  if (firstArg === 'announcement' || firstArg === 'announcements') {
    openMail('announcements');
    return { ok: true, message: 'OPENING DNI ANNOUNCEMENTS // SERVER AUTHORIZED' };
  }
  if (firstArg === 'service' || firstArg === 'services') {
    openMail('service');
    return { ok: true, message: 'OPENING DNI SERVICE ANNOUNCEMENTS // SERVER AUTHORIZED' };
  }
  openMail('all');
  return { ok: true, message: 'OPENING DNI MAIL // CLEARANCE ENFORCEMENT ACTIVE' };
}

export function initializeMail() {
  if (state.initialized) return;
  state.initialized = true;
  installMailStyles();
  installReaderActionStyles();
  ensureMailPanel();
  ensureLaunchBadge();
  startMailObservers();
  queueMailUiScan();
  updateMailStatus();
  window.addEventListener('dni:mail-realtime-delta', event => applyRealtimeMailboxDelta(event.detail));
  window.addEventListener('dni:mail-realtime-resync', queueRealtimeMailboxResync);
  void loadMailbox({ quiet: true }).then(() => {
    if (state.authenticated) void loadMailSignature().catch(() => {});
    queueMailUiScan();
  });

  window.addEventListener('dni:panel', event => {
    const panel = ensureMailPanel();
    if (!panel) return;
    const active = event.detail?.panel === 'mail';
    if (!active && shouldKeepMailContext()) {
      keepMailContext();
      return;
    }
    panel.style.display = active ? 'block' : 'none';
    if (active) queueMailUiScan();
  });
}
