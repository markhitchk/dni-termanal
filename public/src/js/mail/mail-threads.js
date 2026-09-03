const MAIL_ENDPOINT = '/mail-data.php';
const CDN_BLOCK = '--- DNI CDN ATTACHMENTS ---';
const SIGNATURE_SEPARATOR = '––––––––––––––––––––––––––––––––––––––––––––';

let currentThread = null;
let lastList = [];
let renderQueued = false;
let inboxQueued = false;
let directoryCache = null;

function installThreadStyles() {
  if (document.querySelector('style[data-dni-mail-thread-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailThreadStyle = 'true';
  style.textContent = `
    .dni-mail-thread-header{padding:0 0 14px;border-bottom:1px solid #2d2d2d;margin-bottom:12px}
    .dni-mail-thread-header h3{margin:4px 0 7px;color:#f0f0f0;font:700 clamp(17px,2vw,22px)/1.25 "Courier New",monospace}
    .dni-mail-thread-summary{display:flex;flex-wrap:wrap;gap:7px;color:#868686;font:700 9px/1.35 "Courier New",monospace;letter-spacing:.45px}
    .dni-mail-thread-summary span{border:1px solid #303030;background:#080808;padding:4px 7px}
    .dni-mail-thread-list{display:grid;gap:11px}
    .dni-mail-thread-message{border:1px solid #303030;background:#080808;padding:13px 14px;box-shadow:0 8px 24px rgba(0,0,0,.15)}
    .dni-mail-thread-message.is-own{border-color:rgba(200,168,102,.48);background:rgba(200,168,102,.045)}
    .dni-mail-thread-message-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;padding-bottom:9px;border-bottom:1px solid #252525}
    .dni-mail-thread-sender strong{display:block;color:#eee;font:700 11px/1.3 "Courier New",monospace;overflow-wrap:anywhere}
    .dni-mail-thread-sender small{display:block;margin-top:3px;color:#888;font:700 9px/1.35 "Courier New",monospace;overflow-wrap:anywhere}
    .dni-mail-thread-date{color:#777;font:700 9px/1.35 "Courier New",monospace;text-align:right;white-space:nowrap}
    .dni-mail-thread-meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
    .dni-mail-thread-meta span{border:1px solid #333;background:#050505;color:#909090;padding:3px 6px;font:700 8px/1.2 "Courier New",monospace;letter-spacing:.35px}
    .dni-mail-thread-message.is-own .dni-mail-thread-meta span{border-color:rgba(200,168,102,.32)}
    .dni-mail-thread-body{padding-top:12px;color:#d0d0d0;white-space:pre-wrap;overflow-wrap:anywhere;font:400 11px/1.65 "Courier New",monospace}
    .dni-mail-thread-attachments{display:grid;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid #292929}
    .dni-mail-thread-attachments strong{color:#c8a866;font-size:9px;letter-spacing:.5px}
    .dni-mail-thread-attachments a{color:#d4b873;font:700 9px/1.4 "Courier New",monospace;overflow-wrap:anywhere}
    .dni-mail-thread-count{display:inline-flex;align-items:center;margin-left:5px;border:1px solid rgba(200,168,102,.42);padding:2px 5px;color:#c8a866;font:700 8px/1 "Courier New",monospace;white-space:nowrap}
    .dni-mail-thread-inline-reply{display:none;margin-top:10px;border:1px solid rgba(200,168,102,.48);background:rgba(200,168,102,.045);padding:12px}
    .dni-mail-thread-inline-reply.is-open{display:block}
    .dni-mail-thread-inline-reply-head{display:flex;justify-content:space-between;gap:8px;align-items:start;margin-bottom:9px;color:#c8a866;font:700 9px/1.4 "Courier New",monospace;letter-spacing:.4px}
    .dni-mail-thread-inline-reply-head small{display:block;margin-top:3px;color:#858585;font-size:8px;overflow-wrap:anywhere}
    .dni-mail-thread-inline-reply textarea{box-sizing:border-box;width:100%;min-height:116px;resize:vertical;border:1px solid #424242;background:#050505;color:#e8e8e8;padding:10px;outline:none;font:400 11px/1.55 "Courier New",monospace}
    .dni-mail-thread-inline-reply textarea:focus{border-color:#c8a866;box-shadow:0 0 0 1px rgba(200,168,102,.18)}
    .dni-mail-thread-inline-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:9px}
    .dni-mail-thread-inline-actions button{min-height:34px;padding:8px 12px;border:1px solid #555;background:#101010;color:#ccc;font:700 9px/1 "Courier New",monospace;letter-spacing:.45px;cursor:pointer}
    .dni-mail-thread-inline-actions button[type=submit]{border-color:rgba(200,168,102,.65);color:#e6cc91}
    .dni-mail-thread-inline-actions button:hover:not(:disabled){border-color:#c8a866;color:#fff;background:#17140d}
    .dni-mail-thread-inline-actions button:disabled{opacity:.45;cursor:not-allowed}
    .dni-mail-thread-inline-status{flex:1 1 220px;min-width:180px;color:#858585;font:700 8px/1.4 "Courier New",monospace}
    .dni-mail-thread-inline-status.is-error{color:#e45d62}.dni-mail-thread-inline-status.is-success{color:#c8a866}
    @media(max-width:700px){
      .dni-mail-thread-message{padding:11px}
      .dni-mail-thread-message-head{grid-template-columns:1fr}
      .dni-mail-thread-date{text-align:left;white-space:normal}
      .dni-mail-thread-inline-actions button{flex:1 1 120px}
      .dni-mail-thread-inline-status{flex-basis:100%;min-width:0}
    }
  `;
  document.head.append(style);
}

function mailRequestInfo(input) {
  try {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    const url = new URL(raw, window.location.href);
    if (!url.pathname.endsWith(MAIL_ENDPOINT)) return null;
    return { url, action: String(url.searchParams.get('action') || '').toLowerCase() };
  } catch {
    return null;
  }
}

function splitCdnBlock(body = '') {
  const text = String(body || '');
  const marker = `\n\n${CDN_BLOCK}`;
  const index = text.indexOf(marker);
  if (index < 0) return { visible: text, cdn: '' };
  return { visible: text.slice(0, index), cdn: text.slice(index) };
}

function visibleBody(raw = '') {
  return splitCdnBlock(raw).visible.trimEnd();
}

function threadVersion(messages) {
  return messages.map(message => `${message?.id || ''}:${message?.sent_at || ''}:${message?.read ? 1 : 0}`).join('|');
}

function rememberThread(payload) {
  if (!Array.isArray(payload?.thread) || !payload.thread.length) return;
  currentThread = {
    id: String(payload.thread_id || payload.thread[0]?.thread_id || payload.message?.id || ''),
    replyToMessageCode: String(payload.reply_to_message_code || payload.message?.id || ''),
    clearanceFloor: Number(payload.thread_clearance_floor ?? 0),
    messages: payload.thread,
    count: Number(payload.thread_count || payload.thread.length),
    version: threadVersion(payload.thread)
  };

  for (const summary of lastList) {
    if (String(summary?.thread_id || '') !== currentThread.id) continue;
    summary.thread_count = currentThread.count;
    summary.unread_count = 0;
    summary.read = true;
    const latest = currentThread.messages[currentThread.messages.length - 1];
    if (latest?.sent_at) summary.sent_at = latest.sent_at;
  }
  queueThreadRender();
  queueInboxDecoration();
}

function installFetchBridge() {
  if (window.__dniMailThreadFetchInstalled) return;
  window.__dniMailThreadFetchInstalled = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const response = await nativeFetch(input, init);
    const info = mailRequestInfo(input);
    if (!info) return response;

    void response.clone().json().then(payload => {
      if (!payload?.ok) return;
      if (info.action === 'list' && Array.isArray(payload.messages)) {
        lastList = payload.messages;
        queueInboxDecoration();
      }
      if ((info.action === 'mark-read' || info.action === 'record') && Array.isArray(payload.thread)) {
        rememberThread(payload);
      }
    }).catch(() => {});
    return response;
  };
}

function formatDate(value) {
  if (!value) return 'DNI NETWORK';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  }).format(date);
}

function clearanceCode(message) {
  const code = String(message?.clearance?.code || '');
  if (code) return code;
  const level = Number(message?.clearance_level || 0);
  return level === 0 ? 'CL/NON' : `CL${level}`;
}

function makeThreadMessage(message) {
  const article = document.createElement('article');
  article.className = 'dni-mail-thread-message';
  if (message?.is_own) article.classList.add('is-own');
  article.dataset.messageId = String(message?.id || '');

  const head = document.createElement('div');
  head.className = 'dni-mail-thread-message-head';
  const sender = document.createElement('div');
  sender.className = 'dni-mail-thread-sender';
  const name = document.createElement('strong');
  name.textContent = message?.is_own
    ? `${message?.from_name || message?.from || 'DNI USER'} · YOU`
    : String(message?.from_name || message?.from || 'DNI NETWORK');
  sender.append(name);
  if (message?.from_address) {
    const address = document.createElement('small');
    address.textContent = String(message.from_address).toLowerCase();
    sender.append(address);
  }
  const date = document.createElement('div');
  date.className = 'dni-mail-thread-date';
  date.textContent = formatDate(message?.sent_at);
  head.append(sender, date);

  const meta = document.createElement('div');
  meta.className = 'dni-mail-thread-meta';
  for (const value of [message?.id, clearanceCode(message), message?.is_own ? 'SENT' : (message?.read ? 'READ' : 'UNREAD')]) {
    if (!value) continue;
    const chip = document.createElement('span');
    chip.textContent = String(value);
    meta.append(chip);
  }
  sender.append(meta);

  const body = document.createElement('div');
  body.className = 'dni-mail-thread-body';
  body.textContent = visibleBody(message?.body || '');

  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (attachments.length) {
    const section = document.createElement('div');
    section.className = 'dni-mail-thread-attachments';
    const title = document.createElement('strong');
    title.textContent = 'AUTHORIZED DOCUMENT ATTACHMENTS';
    section.append(title);
    for (const attachment of attachments) {
      const link = document.createElement('a');
      link.href = attachment.download_url || '#';
      link.textContent = `${attachment.file_code || 'DNI'} — ${attachment.title || attachment.name || 'Document'}`;
      section.append(link);
    }
    body.append(section);
  }

  const cdn = splitCdnBlock(message?.body || '').cdn;
  if (cdn) {
    const section = document.createElement('div');
    section.className = 'dni-mail-thread-attachments';
    const title = document.createElement('strong');
    title.textContent = 'DNI CDN ATTACHMENTS · PUBLIC CL/NON';
    section.append(title);
    for (const line of cdn.replace(`\n\n${CDN_BLOCK}`, '').trim().split('\n')) {
      const match = line.match(/https:\/\/cdn\.dreadnoughtimperium\.org\/files\/\S+/i);
      if (!match) continue;
      const link = document.createElement('a');
      link.href = match[0];
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = line;
      section.append(link);
    }
    if (section.children.length > 1) body.append(section);
  }

  article.append(head, body);
  return article;
}

function threadSubject(messages = currentThread?.messages || []) {
  const subject = String(messages?.[0]?.subject || 'DNI Mail').replace(/^(?:\s*re:\s*)+/i, '').trim();
  return subject || 'DNI Mail';
}

function replyTargetMessage() {
  if (!currentThread?.messages?.length) return null;
  const exact = currentThread.messages.find(message => String(message?.id || '') === currentThread.replyToMessageCode);
  if (exact && !exact.is_own) return exact;
  for (const message of [...currentThread.messages].reverse()) {
    if (!message?.is_own) return message;
  }
  return exact || currentThread.messages[currentThread.messages.length - 1];
}

function makeInlineReply() {
  const section = document.createElement('section');
  section.className = 'dni-mail-thread-inline-reply';
  section.dataset.mailThreadInlineReply = 'true';

  const head = document.createElement('div');
  head.className = 'dni-mail-thread-inline-reply-head';
  const target = document.createElement('div');
  target.dataset.mailThreadReplyTarget = 'true';
  const title = document.createElement('strong');
  title.textContent = 'REPLY TO THREAD';
  const targetLine = document.createElement('small');
  const targetMessage = replyTargetMessage();
  targetLine.textContent = targetMessage?.from_address
    ? `To ${String(targetMessage.from_address).toLowerCase()} · ${clearanceCode({ clearance_level: currentThread.clearanceFloor, clearance: targetMessage?.clearance })} minimum`
    : 'Reply target unavailable';
  target.append(title, targetLine);
  head.append(target);

  const form = document.createElement('form');
  form.dataset.mailThreadReplyForm = 'true';
  const textarea = document.createElement('textarea');
  textarea.name = 'threadReplyBody';
  textarea.maxLength = 100000;
  textarea.required = true;
  textarea.placeholder = 'Write a reply to this conversation…';
  textarea.setAttribute('aria-label', 'Reply to DNI Mail thread');

  const actions = document.createElement('div');
  actions.className = 'dni-mail-thread-inline-actions';
  const send = document.createElement('button');
  send.type = 'submit';
  send.textContent = 'SEND REPLY';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'CANCEL';
  const status = document.createElement('span');
  status.className = 'dni-mail-thread-inline-status';
  status.setAttribute('aria-live', 'polite');
  actions.append(send, cancel, status);
  form.append(textarea, actions);
  section.append(head, form);

  cancel.addEventListener('click', () => {
    section.classList.remove('is-open');
    textarea.value = '';
    setInlineStatus(section, '');
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    void sendInlineReply(section, textarea, send);
  });
  return section;
}

function setInlineStatus(section, text = '', kind = '') {
  const node = section?.querySelector('.dni-mail-thread-inline-status');
  if (!(node instanceof HTMLElement)) return;
  node.className = 'dni-mail-thread-inline-status';
  if (kind) node.classList.add(`is-${kind}`);
  node.textContent = text;
}

function renderCurrentThread() {
  renderQueued = false;
  if (!currentThread?.messages?.length) return;
  const reader = document.querySelector('#dni-mail-reader.dni-mail-reader');
  if (!(reader instanceof HTMLElement)) return;

  const actionBar = reader.querySelector('.dni-mail-reader-actions');
  if (!(actionBar instanceof HTMLElement)) {
    window.setTimeout(queueThreadRender, 20);
    return;
  }
  if (reader.dataset.threadVersion === currentThread.version && reader.querySelector('.dni-mail-thread-list')) return;

  const security = reader.querySelector('.dni-mail-reader-security');
  const header = document.createElement('div');
  header.className = 'dni-mail-thread-header';
  const kicker = document.createElement('div');
  kicker.className = 'module-kicker';
  kicker.textContent = 'SECURE CONVERSATION THREAD';
  const title = document.createElement('h3');
  title.id = 'dni-mail-reader-title';
  title.textContent = threadSubject();
  const summary = document.createElement('div');
  summary.className = 'dni-mail-thread-summary';
  const count = document.createElement('span');
  count.textContent = `${currentThread.messages.length} message${currentThread.messages.length === 1 ? '' : 's'}`;
  const classification = document.createElement('span');
  const max = currentThread.messages.reduce((value, item) => Math.max(value, Number(item?.clearance_level || 0)), 0);
  const maxMessage = currentThread.messages.find(item => Number(item?.clearance_level || 0) === max);
  classification.textContent = `THREAD FLOOR ${clearanceCode(maxMessage || { clearance_level: max })}`;
  const threadId = document.createElement('span');
  threadId.textContent = `THREAD ${currentThread.id}`;
  summary.append(count, classification, threadId);
  header.append(kicker, title, summary);

  const list = document.createElement('div');
  list.className = 'dni-mail-thread-list';
  for (const message of currentThread.messages) list.append(makeThreadMessage(message));

  const replyButton = actionBar.querySelector('.dni-mail-reply-action');
  if (replyButton instanceof HTMLButtonElement && !replyButton.disabled) replyButton.textContent = 'REPLY TO THREAD';
  const inlineReply = makeInlineReply();

  actionBar.remove();
  if (security instanceof HTMLElement) security.remove();
  reader.replaceChildren(header, list, actionBar, inlineReply);
  if (security instanceof HTMLElement) reader.append(security);
  reader.dataset.threadId = currentThread.id;
  reader.dataset.threadVersion = currentThread.version;
  reader.dataset.threaded = 'true';
}

function queueThreadRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(renderCurrentThread);
}

function decorateInbox() {
  inboxQueued = false;
  if (!Array.isArray(lastList) || !lastList.length) return;
  const byId = new Map(lastList.map(message => [String(message?.id || ''), message]));
  for (const item of document.querySelectorAll('.dni-mail-message')) {
    const id = String(item.querySelector('.dni-mail-id')?.textContent || '').trim();
    const message = byId.get(id);
    if (!message) continue;
    const meta = item.querySelector('.dni-mail-message-meta');
    if (!(meta instanceof HTMLElement)) continue;
    let badge = meta.querySelector('.dni-mail-thread-count');
    const count = Number(message.thread_count || 1);
    if (count <= 1) {
      badge?.remove();
      continue;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'dni-mail-thread-count';
      meta.append(badge);
    }
    const label = `${count} MESSAGES`;
    if (badge.textContent !== label) badge.textContent = label;
  }
}

function queueInboxDecoration() {
  if (inboxQueued) return;
  inboxQueued = true;
  queueMicrotask(decorateInbox);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `DNI Mail HTTP ${response.status}`);
  return payload;
}

async function loadReplySession() {
  return jsonRequest(`${MAIL_ENDPOINT}?action=signature`);
}

async function loadDirectory() {
  if (Array.isArray(directoryCache)) return directoryCache;
  const payload = await jsonRequest(`${MAIL_ENDPOINT}?action=directory`);
  directoryCache = Array.isArray(payload.users) ? payload.users : [];
  return directoryCache;
}

async function resolveReplyRecipient(message) {
  const userId = Number(message?.sender_user_id || 0);
  if (Number.isInteger(userId) && userId > 0) return userId;
  const address = String(message?.from_address || '').trim().toLowerCase();
  if (!address) throw new Error('This DNI network message does not have a reply address.');
  const directory = await loadDirectory();
  const target = directory.find(item => String(item?.address || '').trim().toLowerCase() === address);
  const targetId = Number(target?.id);
  if (!Number.isInteger(targetId)) throw new Error(`Reply recipient ${address} is not available in the DNI directory.`);
  return targetId;
}

async function sendInlineReply(section, textarea, sendButton) {
  if (!currentThread || !(textarea instanceof HTMLTextAreaElement) || !(sendButton instanceof HTMLButtonElement)) return;
  const text = String(textarea.value || '').trim();
  if (!text) {
    setInlineStatus(section, 'Enter a reply before sending.', 'error');
    textarea.focus();
    return;
  }

  const targetMessage = replyTargetMessage();
  if (!targetMessage) {
    setInlineStatus(section, 'DNI Mail reply target is unavailable.', 'error');
    return;
  }

  sendButton.disabled = true;
  setInlineStatus(section, 'PREPARING SECURE THREAD REPLY…');
  try {
    const [session, recipientUserId] = await Promise.all([
      loadReplySession(),
      resolveReplyRecipient(targetMessage)
    ]);
    const csrfToken = String(session.csrfToken || '');
    if (!csrfToken) throw new Error('DNI security token unavailable. Reload DNI Mail.');
    const signature = String(session.signature || '').trim();
    const body = signature ? `${text}\n\n${SIGNATURE_SEPARATOR}\n${signature}` : text;
    const subject = `Re: ${threadSubject()}`;
    const replyToMessageCode = String(currentThread.replyToMessageCode || targetMessage.id || '');

    setInlineStatus(section, 'SENDING SECURE REPLY…');
    const sent = await jsonRequest(`${MAIL_ENDPOINT}?action=send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DNI-CSRF': csrfToken
      },
      body: JSON.stringify({
        messageType: 'message',
        recipientUserIds: [recipientUserId],
        clearanceLevel: Number(currentThread.clearanceFloor || targetMessage.clearance_level || 0),
        attachmentCodes: [],
        subject,
        body,
        replyToMessageCode,
        threadId: currentThread.id
      })
    });

    textarea.value = '';
    setInlineStatus(section, 'REPLY SENT // UPDATING THREAD…', 'success');
    const nextToken = String(sent.csrfToken || csrfToken);
    const refreshed = await jsonRequest(`${MAIL_ENDPOINT}?action=mark-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DNI-CSRF': nextToken
      },
      body: JSON.stringify({ id: replyToMessageCode })
    });
    rememberThread(refreshed);
    const nextSection = document.querySelector('[data-mail-thread-inline-reply]');
    if (nextSection instanceof HTMLElement) {
      nextSection.classList.remove('is-open');
      setInlineStatus(nextSection, 'REPLY SENT', 'success');
    }
  } catch (error) {
    setInlineStatus(section, String(error?.message || error || 'Unable to send DNI Mail reply.'), 'error');
  } finally {
    if (sendButton.isConnected) sendButton.disabled = false;
  }
}

function showInlineReply() {
  const section = document.querySelector('[data-mail-thread-inline-reply]');
  if (!(section instanceof HTMLElement)) return;
  section.classList.add('is-open');
  const textarea = section.querySelector('textarea');
  if (textarea instanceof HTMLTextAreaElement) {
    textarea.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function installInteractionBridge() {
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !target.closest('.dni-mail-reply-action') || !currentThread) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showInlineReply();
  }, true);
}

function installObserver() {
  const observer = new MutationObserver(() => {
    if (currentThread) queueThreadRender();
    if (lastList.length) queueInboxDecoration();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

installThreadStyles();
installFetchBridge();
installInteractionBridge();
installObserver();
