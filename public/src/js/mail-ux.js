import './mail-address-client.js?v=20260831-mail4';
import './mail-upload-button.js?v=20260831-mail4';
import './mail-profile-pics.js?v=20260902-profile1';
import { openMail } from './mail.js?v=20260831-mail4';

const MAIL_URL = '/mail-data.php';
const DEFAULT_LOGIN_URL = '/auth/discord/login';
const REPLY_SEPARATOR = '––––––––––––––––––––––––––––––––––––––––––––';
const INLINE_REPLY_PREPARE_TIMEOUT_MS = 20000;
const INLINE_REPLY_SEND_TIMEOUT_MS = 20000;

let checking = false;
let gatePassUntil = 0;
let inlineReplySending = false;

function installMailUxStyles() {
  if (document.querySelector('link[data-dni-mail-ux-style]')) return;
  const source = new URL(import.meta.url);
  const stylesheet = source.pathname.includes('/dist/')
    ? new URL(`./mail-ux.css${source.search}`, source)
    : new URL(`../css/mail-ux.css${source.search}`, source);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = stylesheet.href;
  link.dataset.dniMailUxStyle = 'true';
  document.head.append(link);
}

function installInlineReplyStyles() {
  if (document.querySelector('style[data-dni-mail-inline-reply-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailInlineReplyStyle = 'true';
  style.textContent = `
    .dni-mail-inline-reply{margin:10px 0 0;padding:12px;border:1px solid rgba(200,168,102,.42);background:rgba(200,168,102,.045);font-family:"Courier New",monospace}
    .dni-mail-inline-reply-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;color:#c8a866;font:700 9px/1.35 "Courier New",monospace;letter-spacing:.55px}
    .dni-mail-inline-reply-head span:last-child{color:#777;font-size:8px;overflow-wrap:anywhere}
    .dni-mail-inline-reply textarea{box-sizing:border-box;display:block;width:100%;min-height:120px;resize:vertical;border:1px solid #4b4130;background:#070707;color:#eee5d3;padding:11px;font:400 11px/1.5 "Courier New",monospace;outline:none}
    .dni-mail-inline-reply textarea:focus{border-color:#c8a866;box-shadow:0 0 0 1px rgba(200,168,102,.18)}
    .dni-mail-inline-reply textarea:disabled{opacity:.6;cursor:not-allowed}
    .dni-mail-inline-reply-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:9px}
    .dni-mail-inline-reply-controls button{min-height:34px;padding:8px 12px;border:1px solid #575757;background:#111;color:#d7d7d7;font:700 9px/1 "Courier New",monospace;letter-spacing:.55px;cursor:pointer}
    .dni-mail-inline-reply-controls button:hover:not(:disabled){border-color:#c8a866;color:#fff;background:#17140d}
    .dni-mail-inline-reply-controls button:disabled{opacity:.45;cursor:not-allowed}
    .dni-mail-inline-reply-controls [data-mail-inline-send]{border-color:rgba(200,168,102,.62);color:#e2c98f}
    .dni-mail-inline-reply-status{flex:1 1 220px;min-width:180px;color:#858585;font:700 8px/1.4 "Courier New",monospace;letter-spacing:.3px}
    .dni-mail-inline-reply-status.is-error{color:#e45d62}.dni-mail-inline-reply-status.is-success{color:#c8a866}
    html[data-dni-inline-reply-sending="true"] #dni-mail-panel [data-mail-compose-shell]{display:none!important}
    @media(max-width:700px){.dni-mail-inline-reply textarea{min-height:105px}.dni-mail-inline-reply-controls button{flex:1 1 120px}.dni-mail-inline-reply-status{flex-basis:100%;min-width:0}}
  `;
  document.head.append(style);
}

function bindFallbackGateEvents(root) {
  if (root.dataset.dniMailFallbackBound === 'true') return;
  root.dataset.dniMailFallbackBound = 'true';
  root.addEventListener('click', event => {
    const close = event.target instanceof Element ? event.target.closest('[data-mail-error-ok]') : null;
    if (!close || !root.contains(close)) return;
    event.preventDefault();
    hideGate();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || root.hidden || root.dataset.mode !== 'error') return;
    event.preventDefault();
    hideGate();
  });
}

function ensureGate() {
  let root = document.querySelector('#dni-mail-gate');
  if (root) {
    bindFallbackGateEvents(root);
    return root;
  }

  root = document.createElement('div');
  root.id = 'dni-mail-gate';
  root.className = 'dni-mail-gate dni-alert';
  root.hidden = true;
  root.dataset.mode = 'loading';
  root.innerHTML = `
    <div class="dni-mail-gate-backdrop dni-alert-backdrop" data-mail-gate-backdrop aria-hidden="true"></div>

    <section class="dni-mail-loader-card" data-mail-loader role="status" aria-live="polite" aria-atomic="true">
      <div class="dni-mail-loader-kicker">DNI SECURE MESSAGE NETWORK</div>
      <div class="dni-mail-loader-symbol" aria-hidden="true">
        <span class="dni-mail-loader-ring"></span>
        <span class="dni-mail-loader-diamond"></span>
        <span class="dni-mail-loader-core"></span>
      </div>
      <strong data-mail-loader-title>ESTABLISHING SECURE MAIL LINK</strong>
      <span class="dni-mail-loader-stage" data-mail-loader-stage>VERIFYING DNI SESSION</span>
      <div class="dni-mail-loader-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    </section>

    <section class="dni-mail-error-dialog dni-alert-dialog" data-mail-error data-type="error" role="alertdialog" aria-modal="true" aria-labelledby="dni-mail-error-title" aria-describedby="dni-mail-error-copy">
      <header class="dni-alert-hazard"><span class="dni-alert-classification" data-dni-alert-label data-label="ERROR">ERROR</span></header>
      <div class="dni-mail-error-banner dni-alert-titleband">
        <span class="dni-alert-band-scan" aria-hidden="true"></span>
        <span class="dni-mail-error-icon dni-alert-icon" aria-hidden="true"><i data-dni-alert-icon>!</i></span>
        <h2 class="dni-alert-title" id="dni-mail-error-title" data-mail-error-title>DNI MAIL LOCKED</h2>
        <span class="dni-alert-corner dni-alert-corner-a" aria-hidden="true"></span>
        <span class="dni-alert-corner dni-alert-corner-b" aria-hidden="true"></span>
      </div>
      <div class="dni-mail-error-body dni-alert-body">
        <span class="dni-alert-body-scan" aria-hidden="true"></span>
        <p class="dni-alert-copy" id="dni-mail-error-copy" data-mail-error-copy>DNI Mail is unavailable.</p>
        <div class="dni-alert-meta" data-dni-alert-meta>DNI MAIL // ACCESS ERROR</div>
      </div>
      <footer class="dni-mail-error-actions dni-alert-actions">
        <a class="dni-mail-error-login dni-alert-btn primary" data-mail-error-login data-dni-discord-login-direct href="${DEFAULT_LOGIN_URL}" hidden>LOGIN WITH DISCORD</a>
        <button class="dni-mail-error-ok dni-alert-btn" data-mail-error-ok type="button">CANCEL</button>
      </footer>
    </section>`;

  document.body.append(root);
  bindFallbackGateEvents(root);
  return root;
}

function showGate(mode, trigger = null) {
  const root = ensureGate();
  if (root.hidden) {
    root.__dniRestoreFocus = trigger instanceof HTMLElement
      ? trigger
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }
  root.dataset.mode = mode;
  root.hidden = false;
  document.documentElement.classList.add('dni-mail-gate-open');
  return root;
}

function hideGate() {
  const root = ensureGate();
  root.hidden = true;
  document.documentElement.classList.remove('dni-mail-gate-open');
  document.documentElement.style.overflow = '';
  const target = root.__dniRestoreFocus;
  root.__dniRestoreFocus = null;
  if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
}

function showLoading(trigger = null) {
  const root = showGate('loading', trigger);
  const title = root.querySelector('[data-mail-loader-title]');
  const stage = root.querySelector('[data-mail-loader-stage]');
  if (title) title.textContent = 'ESTABLISHING SECURE MAIL LINK';
  if (stage) stage.textContent = 'VERIFYING DNI SESSION';
}

function setLoadingStage(text) {
  const root = ensureGate();
  if (root.hidden || root.dataset.mode !== 'loading') return;
  const stage = root.querySelector('[data-mail-loader-stage]');
  if (stage) stage.textContent = String(text || 'VERIFYING DNI SESSION');
}

function showErrorDialog({
  title = 'DNI MAIL LOCKED',
  message = 'DNI Mail is unavailable.',
  loginUrl = '',
  trigger = null
} = {}) {
  const needsLogin = Boolean(loginUrl);
  if (window.DNIAlerts?.show) {
    window.DNIAlerts.show({
      type: 'error',
      title: String(title),
      message: String(message),
      meta: needsLogin
        ? 'DNI AUTHORIZATION GATE // USER ACTION REQUIRED'
        : 'DNI MAIL // SECURE LINK ERROR',
      login: needsLogin,
      loginUrl: String(loginUrl || DEFAULT_LOGIN_URL),
      trigger,
      buttonText: needsLogin ? 'CANCEL' : 'OK'
    });
    return;
  }

  const root = showGate('error', trigger);
  const dialog = root.querySelector('[data-mail-error]');
  const label = root.querySelector('[data-dni-alert-label]');
  const titleNode = root.querySelector('[data-mail-error-title]');
  const copy = root.querySelector('[data-mail-error-copy]');
  const meta = root.querySelector('[data-dni-alert-meta]');
  const login = root.querySelector('[data-mail-error-login]');
  const cancel = root.querySelector('[data-mail-error-ok]');
  if (dialog) dialog.dataset.type = 'error';
  if (label) { label.textContent = 'ERROR'; label.dataset.label = 'ERROR'; }
  if (titleNode) titleNode.textContent = String(title);
  if (copy) copy.textContent = String(message);
  if (meta) meta.textContent = needsLogin ? 'DNI AUTHORIZATION GATE // USER ACTION REQUIRED' : 'DNI MAIL // SECURE LINK ERROR';
  if (login) {
    login.href = String(loginUrl || DEFAULT_LOGIN_URL);
    login.hidden = !needsLogin;
    login.textContent = 'LOGIN WITH DISCORD';
  }
  if (cancel) cancel.textContent = needsLogin ? 'CANCEL' : 'OK';
  requestAnimationFrame(() => (needsLogin ? login : cancel)?.focus({ preventScroll: true }));
}

function showAuthenticationError(loginUrl = DEFAULT_LOGIN_URL, trigger = null) {
  showErrorDialog({
    title: 'DNI MAIL LOCKED',
    message: 'Discord authentication is required to access DNI Mail.',
    loginUrl: String(loginUrl || DEFAULT_LOGIN_URL),
    trigger
  });
}

function showMailLinkError(message, trigger = null) {
  showErrorDialog({
    title: 'DNI MAIL LINK ERROR',
    message: String(message || 'The secure inbox link could not be established. Please try again.'),
    trigger
  });
}

async function verifyMailAccess() {
  const response = await fetch(`${MAIL_URL}?action=list&filter=all`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) return { authenticated: false, loginUrl: payload.loginUrl || DEFAULT_LOGIN_URL };
  if (!response.ok) throw new Error(payload.error || `DNI Mail HTTP ${response.status}`);
  return { authenticated: true };
}

async function launchMail(filter = 'all', trigger = null) {
  if (checking) return;
  checking = true;
  showLoading(trigger);

  const slowStage = window.setTimeout(() => setLoadingStage('NEGOTIATING CLEARANCE-CONTROLLED CHANNEL'), 450);
  const slowerStage = window.setTimeout(() => setLoadingStage('WAITING FOR DNI MAIL AUTHORIZATION'), 1400);

  try {
    const result = await verifyMailAccess();
    if (!result.authenticated) {
      showAuthenticationError(result.loginUrl, trigger);
      return;
    }
    setLoadingStage('AUTHORIZATION CONFIRMED // OPENING INBOX');
    gatePassUntil = Date.now() + 2500;
    hideGate();
    openMail(filter);
  } catch (error) {
    showMailLinkError(error?.message || error || 'The secure inbox link could not be established.', trigger);
  } finally {
    window.clearTimeout(slowStage);
    window.clearTimeout(slowerStage);
    checking = false;
  }
}

function restoreTerminalBehindGate() {
  const mailPanel = document.querySelector('#dni-mail-panel');
  if (mailPanel) mailPanel.style.display = 'none';
  const shell = document.querySelector('.terminal-shell');
  if (shell) shell.dataset.panel = 'terminal';
  const terminalTab = document.querySelector('#tab-terminal');
  if (terminalTab instanceof HTMLElement) terminalTab.click();
}

function setInlineReplyStatus(target, text = '', status = '') {
  if (!(target instanceof HTMLElement)) return;
  target.className = 'dni-mail-inline-reply-status';
  if (status) target.classList.add(`is-${status}`);
  target.textContent = String(text || '');
}

function closeInlineReply(editor, replyButton, { restoreFocus = true } = {}) {
  if (editor instanceof HTMLElement) editor.remove();
  if (replyButton instanceof HTMLButtonElement && replyButton.isConnected) {
    replyButton.textContent = 'REPLY';
    if (restoreFocus) replyButton.focus({ preventScroll: true });
  }
}

function waitForPreparedReply(replyButton) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const reader = replyButton.closest('.dni-mail-reader');
      const actionStatus = reader?.querySelector('.dni-mail-reader-action-status.is-error');
      if (actionStatus?.textContent?.trim()) {
        reject(new Error(actionStatus.textContent.trim()));
        return;
      }

      const composeShell = document.querySelector('#dni-mail-panel [data-mail-compose-shell]');
      const form = composeShell?.querySelector('[data-mail-compose]');
      const body = form?.elements?.namedItem('body');
      const recipients = form?.querySelector('[data-mail-recipients]');
      const subject = form?.elements?.namedItem('subject');
      const selectedRecipientCount = recipients instanceof HTMLSelectElement
        ? [...recipients.selectedOptions].length
        : 0;
      const prepared = composeShell instanceof HTMLElement
        && composeShell.hidden === false
        && form instanceof HTMLFormElement
        && body instanceof HTMLTextAreaElement
        && recipients instanceof HTMLSelectElement
        && selectedRecipientCount > 0
        && subject instanceof HTMLInputElement
        && subject.value.trim().length > 0;

      if (prepared) {
        resolve({ composeShell, form, body });
        return;
      }
      if (Date.now() - started >= INLINE_REPLY_PREPARE_TIMEOUT_MS) {
        const nativeStatus = String(reader?.querySelector('.dni-mail-reader-action-status')?.textContent || '').trim();
        reject(new Error(nativeStatus && !/^PREPARING SECURE REPLY/i.test(nativeStatus)
          ? nativeStatus
          : 'DNI Mail reply composer did not become ready. Please try again.'));
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

function waitForReplySend(composeShell) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (!(composeShell instanceof HTMLElement) || !composeShell.isConnected || composeShell.hidden) {
        resolve();
        return;
      }
      const onlineError = document.querySelector('#dni-mail-panel [data-mail-online].is-error');
      if (onlineError) {
        const text = String(document.querySelector('#dni-mail-panel [data-mail-online]')?.textContent || '').trim();
        reject(new Error(text || 'DNI Mail could not send the reply.'));
        return;
      }
      if (Date.now() - started >= INLINE_REPLY_SEND_TIMEOUT_MS) {
        reject(new Error('DNI Mail reply send timed out.'));
        return;
      }
      window.setTimeout(check, 60);
    };
    check();
  });
}

async function sendInlineReply(replyButton, editor) {
  if (inlineReplySending) return;
  const textarea = editor.querySelector('[data-mail-inline-input]');
  const send = editor.querySelector('[data-mail-inline-send]');
  const cancel = editor.querySelector('[data-mail-inline-cancel]');
  const status = editor.querySelector('[data-mail-inline-status]');
  if (!(textarea instanceof HTMLTextAreaElement) || !(send instanceof HTMLButtonElement)) return;

  const replyText = textarea.value.trim();
  if (!replyText) {
    setInlineReplyStatus(status, 'TYPE A REPLY BEFORE SENDING.', 'error');
    textarea.focus({ preventScroll: true });
    return;
  }

  inlineReplySending = true;
  textarea.disabled = true;
  send.disabled = true;
  if (cancel instanceof HTMLButtonElement) cancel.disabled = true;
  setInlineReplyStatus(status, 'PREPARING SECURE REPLY…');
  document.documentElement.dataset.dniInlineReplySending = 'true';

  let composeShell = null;
  try {
    replyButton.dataset.dniInlineReplyBypass = 'true';
    replyButton.click();

    const prepared = await waitForPreparedReply(replyButton);
    composeShell = prepared.composeShell;
    const preparedTail = String(prepared.body.value || '');
    prepared.body.value = preparedTail
      ? `${replyText}${/^\s/u.test(preparedTail) ? '' : '\n\n'}${preparedTail}`
      : replyText;
    prepared.body.dispatchEvent(new Event('input', { bubbles: true }));
    setInlineReplyStatus(status, 'SENDING SECURE REPLY…');
    prepared.form.requestSubmit();
    await waitForReplySend(composeShell);
    setInlineReplyStatus(status, 'REPLY SENT // DNI DELIVERY AUTHORIZATION ENFORCED', 'success');
  } catch (error) {
    const close = composeShell?.querySelector('[data-mail-compose-close]');
    if (close instanceof HTMLButtonElement) close.click();
    else if (composeShell instanceof HTMLElement) composeShell.hidden = true;
    textarea.disabled = false;
    send.disabled = false;
    if (cancel instanceof HTMLButtonElement) cancel.disabled = false;
    setInlineReplyStatus(status, String(error?.message || error || 'Unable to send DNI Mail reply.'), 'error');
    textarea.focus({ preventScroll: true });
  } finally {
    delete document.documentElement.dataset.dniInlineReplySending;
    delete replyButton.dataset.dniInlineReplyBypass;
    inlineReplySending = false;
  }
}

function openInlineReply(replyButton) {
  const actions = replyButton.closest('.dni-mail-reader-actions');
  const reader = replyButton.closest('.dni-mail-reader');
  if (!(actions instanceof HTMLElement) || !(reader instanceof HTMLElement)) return;

  const existing = reader.querySelector('[data-mail-inline-reply]');
  if (existing instanceof HTMLElement) {
    closeInlineReply(existing, replyButton);
    return;
  }

  const fromAddress = String(reader.querySelector('.dni-mail-sender-address')?.textContent || '').trim().toLowerCase();
  const editor = document.createElement('form');
  editor.className = 'dni-mail-inline-reply';
  editor.dataset.mailInlineReply = 'true';
  editor.innerHTML = `
    <div class="dni-mail-inline-reply-head"><span>SECURE REPLY</span><span>${fromAddress ? `TO ${fromAddress}` : 'AUTHORIZED RECIPIENT'}</span></div>
    <textarea data-mail-inline-input maxlength="100000" rows="6" required aria-label="DNI Mail reply" placeholder="Type your reply here…"></textarea>
    <div class="dni-mail-inline-reply-controls">
      <button type="submit" data-mail-inline-send>SEND REPLY</button>
      <button type="button" data-mail-inline-cancel>CANCEL</button>
      <span class="dni-mail-inline-reply-status" data-mail-inline-status aria-live="polite"></span>
    </div>`;

  actions.insertAdjacentElement('afterend', editor);
  replyButton.textContent = 'CLOSE REPLY';
  const input = editor.querySelector('[data-mail-inline-input]');
  const cancel = editor.querySelector('[data-mail-inline-cancel]');
  if (input instanceof HTMLTextAreaElement) input.focus({ preventScroll: true });
  cancel?.addEventListener('click', () => {
    if (!inlineReplySending) closeInlineReply(editor, replyButton);
  });
  editor.addEventListener('submit', event => {
    event.preventDefault();
    void sendInlineReply(replyButton, editor);
  });
}

installMailUxStyles();
installInlineReplyStyles();
ensureGate();
window.DNIMailUx = Object.freeze({ showError: showErrorDialog, hide: hideGate });

document.addEventListener('click', event => {
  const replyButton = event.target instanceof Element ? event.target.closest('.dni-mail-reply-action') : null;
  if (!(replyButton instanceof HTMLButtonElement)) return;
  if (replyButton.dataset.dniInlineReplyBypass === 'true') {
    delete replyButton.dataset.dniInlineReplyBypass;
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (inlineReplySending || replyButton.disabled) return;
  openInlineReply(replyButton);
}, true);

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('#terminal-inbox') : null;
  if (!target) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void launchMail('all', target);
}, true);

window.addEventListener('dni:panel', event => {
  if (event.detail?.panel !== 'mail') return;
  if (Date.now() < gatePassUntil) return;
  if (document.documentElement.dataset.dniAuth === 'authenticated') return;
  queueMicrotask(() => {
    restoreTerminalBehindGate();
    if (!checking) void launchMail('all', document.querySelector('#command-input'));
  });
});