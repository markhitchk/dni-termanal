const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const terminalWindow = document.querySelector('#terminal-window');
const prompt = document.querySelector('.terminal-prompt');
const tabHost = document.querySelector('#terminal-number');
const addButton = document.querySelector('#terminal-add');
const inboxButton = document.querySelector('#terminal-inbox');

if (output && input && prompt && tabHost && addButton && inboxButton && !window.__dniTerminalSessionGuardInstalled) {
  window.__dniTerminalSessionGuardInstalled = true;

  const LOGIN_URL = '/auth/discord/login';
  const sessions = [{ id: 1, html: '', draft: '' }];
  let activeSessionId = 1;

  const style = document.createElement('style');
  style.id = 'dni-terminal-session-guard-style';
  style.textContent = `
    .terminal-picker{align-items:flex-end;gap:10px;min-width:0}
    #terminal-number.terminal-session-tabs{display:flex;flex:1 1 auto;align-items:stretch;gap:5px;width:auto;min-width:0;max-width:min(720px,calc(100vw - 190px));overflow-x:auto;overflow-y:hidden;padding:0 0 2px;border:0;scrollbar-width:thin;scroll-snap-type:x proximity}
    .terminal-session-tab{flex:0 0 auto;min-height:34px;padding:7px 12px;border:1px solid transparent;border-bottom:2px solid #555;background:transparent;color:#bdbdbd;font:700 11px/1.2 "Courier New",ui-monospace,monospace;letter-spacing:1.1px;white-space:nowrap;scroll-snap-align:start;cursor:pointer}
    .terminal-session-tab[aria-selected="true"]{border-color:#4a4230;border-bottom-color:#c8a866;background:rgba(200,168,102,.07);color:#f0f0f0}
    .terminal-session-tab:hover{color:#fff;border-bottom-color:#c8a866}
    #terminal-inbox[data-dni-mail-gated="true"]{opacity:.48;cursor:not-allowed;filter:saturate(.45)}
    @media(max-width:700px){
      .terminal-picker{width:100%;gap:8px}
      #terminal-number.terminal-session-tabs{max-width:calc(100vw - 94px)}
      .terminal-session-tab{min-height:44px;padding:10px 13px;font-size:12px}
      #terminal-add{flex:0 0 auto}
    }
  `;
  document.head.append(style);

  function authState() {
    return String(document.documentElement.dataset.dniAuth || 'pending').toLowerCase();
  }

  function terminalReady() {
    return prompt.classList.contains('dni-terminal-ready') && !input.disabled;
  }

  function mailGateReason() {
    if (!terminalReady()) return 'startup';
    const state = authState();
    if (state === 'authenticated') return '';
    return state === 'guest' ? 'guest' : 'pending';
  }

  function syncInboxGate() {
    const reason = mailGateReason();
    inboxButton.dataset.dniMailGated = reason ? 'true' : 'false';
    inboxButton.setAttribute('aria-disabled', String(Boolean(reason)));
    if (reason === 'startup') inboxButton.title = 'DNI Mail unlocks when the terminal reaches READY.';
    else if (reason === 'pending') inboxButton.title = 'DNI Mail is waiting for the session authorization check.';
    else if (reason === 'guest') inboxButton.title = 'Login with Discord to access DNI Mail.';
    else inboxButton.removeAttribute('title');
  }

  function appendStatus(text, className = 'muted') {
    const line = document.createElement('div');
    line.textContent = text;
    if (className) line.className = className;
    output.append(line);
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  function echoBlockedCommand(value) {
    const line = document.createElement('div');
    const user = document.createElement('span');
    user.className = 'prompt-admin';
    user.textContent = document.querySelector('.terminal-prompt .prompt-admin')?.textContent || 'guest';
    const host = document.createElement('span');
    host.className = 'prompt-host';
    host.textContent = document.querySelector('.terminal-prompt .prompt-host')?.textContent || 'dni';
    line.append(user, document.createTextNode('@'), host, document.createTextNode(`:~$ ${value}`));
    output.append(line);
  }

  function requestDiscordLoginPrompt() {
    if (!document.querySelector('#dni-login-confirmation')) return;
    const trigger = document.createElement('a');
    trigger.href = LOGIN_URL;
    trigger.dataset.dniLogin = 'mail';
    trigger.hidden = true;
    document.body.append(trigger);
    trigger.click();
    trigger.remove();
  }

  function reportMailGate(reason) {
    if (reason === 'startup') {
      appendStatus('DNI MAIL LOCKED // TERMINAL INITIALIZATION NOT READY');
      return;
    }
    if (reason === 'pending') {
      appendStatus('DNI MAIL LOCKED // AUTHORIZATION CHECK IN PROGRESS');
      return;
    }
    appendStatus('DNI MAIL LOCKED // DISCORD AUTHENTICATION REQUIRED');
    requestDiscordLoginPrompt();
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('#terminal-inbox') : null;
    if (!target) return;
    const reason = mailGateReason();
    if (!reason) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    reportMailGate(reason);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.target !== input || event.key !== 'Enter') return;
    const value = String(input.value || '').trim();
    if (!/^(?:mail|inbox)(?:\s|$)/i.test(value)) return;
    const reason = mailGateReason();
    if (!reason) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    echoBlockedCommand(value);
    reportMailGate(reason);
  }, true);

  function sessionById(id) {
    return sessions.find(session => session.id === id) || null;
  }

  function saveActiveSession() {
    const session = sessionById(activeSessionId);
    if (!session) return;
    session.html = output.innerHTML;
    session.draft = input.value;
  }

  function freshSessionMarkup(id) {
    return [
      '<div class="separator">-------------------- DNI TERMINAL v4.3.0 --------------------</div>',
      '<div>DREADNOUGHT IMPERIUM // DATABASE NETWORK</div>',
      '<div class="dni-terminal-status-ok">COMMAND NETWORK ........ ONLINE</div>',
      '<div class="dni-terminal-status-ok">DATABASE LINK .......... ESTABLISHED</div>',
      '<div class="dni-terminal-status-ok">SECURE SESSION ......... ACTIVE</div>',
      `<div class="muted">TERMINAL ${id} SESSION INITIALIZED</div>`,
      '<div class="dni-terminal-command-line">COMMANDS // HELP · ACCESS 173 · MAIL</div>',
      '<div class="separator">------------------------- READY -------------------------</div>'
    ].join('');
  }

  function renderSessionTabs() {
    tabHost.classList.add('terminal-session-tabs');
    tabHost.setAttribute('role', 'tablist');
    tabHost.setAttribute('aria-label', 'DNI terminal sessions');
    tabHost.replaceChildren();

    for (const session of sessions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'terminal-session-tab';
      button.setAttribute('role', 'tab');
      button.dataset.terminalSession = String(session.id);
      button.textContent = `TERMINAL ${session.id}`;
      const active = session.id === activeSessionId;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      button.addEventListener('click', () => switchSession(session.id));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const current = sessions.findIndex(item => item.id === session.id);
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        const next = sessions[(current + delta + sessions.length) % sessions.length];
        switchSession(next.id, true);
      });
      tabHost.append(button);
    }
  }

  function switchSession(id, focusTab = false) {
    if (id === activeSessionId) return;
    const next = sessionById(id);
    if (!next) return;
    saveActiveSession();
    activeSessionId = id;
    output.innerHTML = next.html || freshSessionMarkup(next.id);
    input.value = next.draft || '';
    renderSessionTabs();
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
    const selectedTab = tabHost.querySelector(`[data-terminal-session="${id}"]`);
    if (focusTab) selectedTab?.focus({ preventScroll: true });
    else input.focus({ preventScroll: true });
    selectedTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  addButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!terminalReady()) {
      appendStatus('NEW TERMINAL LOCKED // CURRENT TERMINAL NOT READY');
      return;
    }
    saveActiveSession();
    const nextId = Math.max(...sessions.map(session => session.id)) + 1;
    sessions.push({ id: nextId, html: freshSessionMarkup(nextId), draft: '' });
    activeSessionId = nextId;
    output.innerHTML = freshSessionMarkup(nextId);
    input.value = '';
    renderSessionTabs();
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
    input.focus({ preventScroll: true });
    tabHost.querySelector(`[data-terminal-session="${nextId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, true);

  renderSessionTabs();
  syncInboxGate();

  window.addEventListener('dni:authz', syncInboxGate);
  const readinessObserver = new MutationObserver(syncInboxGate);
  readinessObserver.observe(prompt, { attributes: true, attributeFilter: ['class', 'hidden'] });
  const inputObserver = new MutationObserver(syncInboxGate);
  inputObserver.observe(input, { attributes: true, attributeFilter: ['disabled', 'aria-busy'] });
}
