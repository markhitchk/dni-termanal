const MAIL_ENDPOINT = '/mail-data.php';
const CDN_BLOCK = '--- DNI CDN ATTACHMENTS ---';
const REPLY_SEPARATOR_PATTERN = /\n*–{10,}\nOn [\s\S]*$/u;

let currentThread = null;
let pendingReply = null;
let lastList = [];
let renderQueued = false;
let inboxQueued = false;

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
    .dni-mail-thread-reply-context{grid-column:1/-1;border:1px solid rgba(200,168,102,.42);background:rgba(200,168,102,.055);padding:9px 11px;color:#c8a866;font:700 9px/1.45 "Courier New",monospace;letter-spacing:.35px}
    @media(max-width:700px){
      .dni-mail-thread-message{padding:11px}
      .dni-mail-thread-message-head{grid-template-columns:1fr}
      .dni-mail-thread-date{text-align:left;white-space:normal}
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

function stripLegacyQuotedReply(body = '') {
  const { visible, cdn } = splitCdnBlock(body);
  const clean = visible.replace(REPLY_SEPARATOR_PATTERN, '').trimEnd();
  return `${clean}${cdn}`.trim();
}

function rememberThread(payload) {
  if (!Array.isArray(payload?.thread) || !payload.thread.length) return;
  currentThread = {
    id: String(payload.thread_id || payload.thread[0]?.thread_id || payload.message?.id || ''),
    replyToMessageCode: String(payload.reply_to_message_code || payload.message?.id || ''),
    clearanceFloor: Number(payload.thread_clearance_floor ?? 0),
    messages: payload.thread,
    count: Number(payload.thread_count || payload.thread.length)
  };
  queueThreadRender();
}

function installFetchBridge() {
  if (window.__dniMailThreadFetchInstalled) return;
  window.__dniMailThreadFetchInstalled = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const info = mailRequestInfo(input);
    let nextInit = init;

    if (info?.action === 'send' && pendingReply && typeof init?.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (payload && typeof payload === 'object' && String(payload.messageType || 'message') === 'message') {
          payload.replyToMessageCode = pendingReply.replyToMessageCode;
          payload.threadId = pendingReply.threadId;
          payload.clearanceLevel = Math.max(Number(payload.clearanceLevel || 0), Number(pendingReply.clearanceFloor || 0));
          payload.body = stripLegacyQuotedReply(payload.body || '');
          nextInit = { ...init, body: JSON.stringify(payload) };
        }
      } catch {
        // Leave the canonical mail request untouched if it is not JSON.
      }
    }

    const response = await nativeFetch(input, nextInit);
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
      if (info.action === 'send' && payload.sent) {
        pendingReply = null;
        document.querySelector('[data-mail-thread-reply-context]')?.remove();
      }
    }).catch(() => {});

    return response;
  };
}

function visibleBody(raw = '') {
  const { visible } = splitCdnBlock(raw);
  return visible.trimEnd();
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
  return String(message?.clearance?.code || `CL${Number(message?.clearance_level || 0)}`);
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

function threadSubject(messages) {
  const subject = String(messages?.[0]?.subject || 'DNI Mail').replace(/^(?:\s*re:\s*)+/i, '').trim();
  return subject || 'DNI Mail';
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
  if (reader.dataset.threadId === currentThread.id && reader.querySelector('.dni-mail-thread-list')) return;

  const security = reader.querySelector('.dni-mail-reader-security');
  const header = document.createElement('div');
  header.className = 'dni-mail-thread-header';
  const kicker = document.createElement('div');
  kicker.className = 'module-kicker';
  kicker.textContent = 'SECURE CONVERSATION THREAD';
  const title = document.createElement('h3');
  title.id = 'dni-mail-reader-title';
  title.textContent = threadSubject(currentThread.messages);
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

  actionBar.remove();
  if (security instanceof HTMLElement) security.remove();
  reader.replaceChildren(header, list, actionBar);
  if (security instanceof HTMLElement) reader.append(security);
  reader.dataset.threadId = currentThread.id;
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

function prepareReplyComposer() {
  if (!pendingReply) return;
  const shell = document.querySelector('[data-mail-compose-shell]');
  const form = shell?.querySelector('[data-mail-compose]');
  if (!(shell instanceof HTMLElement) || shell.hidden || !(form instanceof HTMLFormElement)) return;

  let context = form.querySelector('[data-mail-thread-reply-context]');
  if (!context) {
    context = document.createElement('div');
    context.className = 'dni-mail-thread-reply-context';
    context.dataset.mailThreadReplyContext = 'true';
    const identity = form.querySelector('[data-mail-compose-identity]');
    if (identity) identity.insertAdjacentElement('afterend', context);
    else form.prepend(context);
  }
  const contextText = `THREAD REPLY // ${pendingReply.threadId} // history stays in the conversation and is not duplicated inside this message.`;
  if (context.textContent !== contextText) context.textContent = contextText;

  const classification = form.elements.namedItem('clearanceLevel');
  if (classification instanceof HTMLSelectElement) {
    const floor = Number(pendingReply.clearanceFloor || 0);
    const allowed = [...classification.options].filter(option => Number(option.value) >= floor);
    if (allowed.length && Number(classification.value) < floor) {
      classification.value = allowed[0].value;
      classification.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  const body = form.elements.namedItem('body');
  if (body instanceof HTMLTextAreaElement) {
    const next = stripLegacyQuotedReply(body.value || '');
    if (next !== body.value) body.value = next;
    body.placeholder = 'Reply to this DNI Mail thread…';
    body.focus({ preventScroll: true });
    body.setSelectionRange(0, 0);
    body.scrollTop = 0;
  }
}

function installInteractionBridge() {
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-mail-compose-launch]')) {
      pendingReply = null;
      document.querySelector('[data-mail-thread-reply-context]')?.remove();
      return;
    }
    if (target.closest('[data-mail-compose-close]')) {
      pendingReply = null;
      document.querySelector('[data-mail-thread-reply-context]')?.remove();
      return;
    }
    if (!target.closest('.dni-mail-reply-action') || !currentThread) return;

    pendingReply = {
      threadId: currentThread.id,
      replyToMessageCode: currentThread.replyToMessageCode,
      clearanceFloor: currentThread.clearanceFloor
    };
    for (const delay of [0, 30, 90, 180, 400, 900, 1600]) window.setTimeout(prepareReplyComposer, delay);
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;
    if (pendingReply && form instanceof HTMLFormElement && form.matches('[data-mail-compose]')) {
      prepareReplyComposer();
    }
  }, true);
}

function installObserver() {
  const observer = new MutationObserver(() => {
    if (currentThread) queueThreadRender();
    if (lastList.length) queueInboxDecoration();
    if (pendingReply) prepareReplyComposer();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

installThreadStyles();
installFetchBridge();
installInteractionBridge();
installObserver();
