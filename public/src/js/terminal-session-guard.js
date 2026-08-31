const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const terminalWindow = document.querySelector('#terminal-window');
const prompt = document.querySelector('.terminal-prompt');
const tabHost = document.querySelector('#terminal-number');
const addButton = document.querySelector('#terminal-add');
const inboxButton = document.querySelector('#terminal-inbox');

if (output && input && prompt && tabHost && addButton && inboxButton && !window.__dniTerminalSessionGuardInstalled) {
  window.__dniTerminalSessionGuardInstalled = true;

  const SESSION_STARTUP_MS = 5000;
  const SESSION_STARTUP_STEP_MS = 125;
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const sessions = [{ id: 1, html: '', draft: '', phase: 'external-startup', bootToken: 0 }];
  let activeSessionId = 1;
  let nextSessionId = 2;

  const style = document.createElement('style');
  style.id = 'dni-terminal-session-guard-style';
  style.textContent = `
    .terminal-picker{align-items:flex-end;gap:8px;min-width:0}
    #terminal-number.terminal-session-tabs{display:flex;flex:0 1 auto;align-items:stretch;gap:5px;width:max-content;min-width:0;max-width:min(720px,calc(100vw - 190px));overflow-x:auto;overflow-y:hidden;padding:0 0 2px;border:0;scrollbar-width:thin;scroll-snap-type:x proximity}
    .terminal-session-tab-shell{display:flex;flex:0 0 auto;align-items:stretch;min-height:34px;border:1px solid transparent;border-bottom:2px solid #555;background:transparent;scroll-snap-align:start}
    .terminal-session-tab-shell.is-active{border-color:#4a4230;border-bottom-color:#c8a866;background:rgba(200,168,102,.07)}
    .terminal-session-tab-shell.is-booting{border-bottom-color:#7d6840}
    .terminal-session-tab{flex:0 0 auto;min-height:32px;padding:7px 8px 7px 12px;border:0;background:transparent;color:#bdbdbd;font:700 11px/1.2 "Courier New",ui-monospace,monospace;letter-spacing:1.1px;white-space:nowrap;cursor:pointer}
    .terminal-session-tab[aria-selected="true"]{color:#f0f0f0}
    .terminal-session-tab-state{display:inline-block;margin-left:7px;color:#9c8658;font-size:8px;letter-spacing:.8px;vertical-align:1px}
    .terminal-session-tab-shell:hover{border-bottom-color:#c8a866}
    .terminal-session-tab-shell:hover .terminal-session-tab{color:#fff}
    .terminal-session-close{display:grid;place-items:center;flex:0 0 28px;min-width:28px;min-height:32px;padding:0;border:0;border-left:1px solid #292929;background:transparent;color:#777;font:700 16px/1 Arial,sans-serif;cursor:pointer}
    .terminal-session-close:hover,.terminal-session-close:focus-visible{background:rgba(200,168,102,.1);color:#fff}
    #terminal-add{flex:0 0 auto;transition:transform 120ms ease}
    #terminal-inbox[data-dni-mail-gated="true"]{opacity:.48;cursor:not-allowed;filter:saturate(.45)}
    .dni-session-startup{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8px 4px;color:#e7e7e7;font-family:"Courier New",ui-monospace,monospace}
    .dni-session-startup-kicker{color:#777;font:700 8px/1.2 "Courier New",monospace;letter-spacing:1.6px}
    .dni-session-startup-logo-frame{position:relative;width:96px;height:96px;margin:13px 0 10px;display:grid;place-items:center;border:1px solid #443b28;background:#050606;box-shadow:0 0 0 1px #111 inset,0 0 24px rgba(200,168,102,.05)}
    .dni-session-startup-logo-frame::before,.dni-session-startup-logo-frame::after{content:"";position:absolute;width:12px;height:12px;border-color:#c8a866;opacity:.72}
    .dni-session-startup-logo-frame::before{left:-1px;top:-1px;border-left:2px solid;border-top:2px solid}
    .dni-session-startup-logo-frame::after{right:-1px;bottom:-1px;border-right:2px solid;border-bottom:2px solid}
    .dni-session-startup-logo{width:78px;height:78px;display:block;object-fit:contain;image-rendering:pixelated;filter:contrast(1.12) brightness(.96)}
    .dni-session-startup-title{margin:0;color:#f0f0f0;font:800 15px/1 "Courier New",monospace;letter-spacing:3.4px}
    .dni-session-startup-subtitle{min-height:14px;margin-top:8px;color:#9a9a9a;font:700 8px/1.35 "Courier New",monospace;letter-spacing:.75px}
    .dni-session-startup-progress{width:min(300px,92%);height:8px;margin-top:13px;border:1px solid #3a3a3a;background:#050505;padding:2px}
    .dni-session-startup-progress>i{display:block;height:100%;background:#c8a866;box-shadow:0 0 10px rgba(200,168,102,.22);transition:width 100ms linear}
    .dni-session-startup-meta{width:min(300px,92%);display:flex;justify-content:space-between;gap:12px;margin-top:6px;color:#737373;font:700 8px/1.2 "Courier New",monospace;letter-spacing:.8px}
    .dni-session-startup-meta b{color:#bdbdbd}
    @media(max-width:700px){
      .terminal-picker{width:100%;gap:7px}
      #terminal-number.terminal-session-tabs{max-width:calc(100vw - 94px)}
      .terminal-session-tab-shell{min-height:44px}
      .terminal-session-tab{min-height:42px;padding:10px 8px 10px 13px;font-size:12px}
      .terminal-session-close{flex-basis:34px;min-width:34px;min-height:42px;font-size:18px}
      #terminal-add{flex:0 0 auto}
      .dni-session-startup-logo-frame{width:84px;height:84px}
      .dni-session-startup-logo{width:68px;height:68px}
      .dni-session-startup-title{font-size:14px}
    }
  `;
  document.head.append(style);

  function authState() {
    return String(document.documentElement.dataset.dniAuth || 'pending').toLowerCase();
  }

  function sessionById(id) {
    return sessions.find(session => session.id === id) || null;
  }

  function activeSession() {
    return sessionById(activeSessionId);
  }

  function browserTerminalReady() {
    return prompt.classList.contains('dni-terminal-ready') && !input.disabled;
  }

  function activeTerminalReady() {
    const session = activeSession();
    return Boolean(session && session.phase === 'ready' && browserTerminalReady());
  }

  function mailGateReason() {
    if (!activeTerminalReady()) return 'startup';
    const state = authState();
    if (state === 'authenticated') return '';
    return state === 'guest' ? 'guest' : 'pending';
  }

  function syncInboxGate() {
    const reason = mailGateReason();
    inboxButton.dataset.dniMailGated = reason ? 'true' : 'false';
    inboxButton.setAttribute('aria-disabled', String(Boolean(reason)));
    if (reason === 'startup') inboxButton.title = 'DNI Mail unlocks when this terminal reaches READY.';
    else if (reason === 'pending') inboxButton.title = 'DNI Mail is waiting for the session authorization check.';
    else if (reason === 'guest') inboxButton.title = 'Login with Discord to access DNI Mail.';
    else inboxButton.removeAttribute('title');
  }

  function setPromptReady(ready) {
    input.disabled = !ready;
    input.toggleAttribute('aria-busy', !ready);
    prompt.hidden = !ready;
    prompt.classList.toggle('dni-terminal-ready', ready);
    syncInboxGate();
  }

  function syncActiveInteraction({ focus = false } = {}) {
    const session = activeSession();
    const ready = session?.phase === 'ready';
    setPromptReady(Boolean(ready));
    if (ready && focus) input.focus({ preventScroll: true });
  }

  function appendStatus(text, className = 'muted') {
    const line = document.createElement('div');
    line.textContent = text;
    if (className) line.className = className;
    output.append(line);
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  function showLockDialog(config, trigger) {
    const modal = window.DNIErrorModal;
    if (!modal || typeof modal.show !== 'function') return;
    modal.show({ ...config, trigger });
  }

  function reportMailGate(reason, trigger) {
    if (reason === 'startup') {
      showLockDialog({
        title: 'DNI MAIL LOCKED',
        message: 'DNI Mail is unavailable while this terminal is still starting.\nWait until the terminal reaches READY before opening DNI Mail.'
      }, trigger);
      return;
    }
    if (reason === 'pending') {
      showLockDialog({
        title: 'DNI MAIL LOCKED',
        message: 'Your DNI authorization check is still in progress.\nPlease try again in a moment.'
      }, trigger);
      return;
    }
    showLockDialog({
      title: 'DNI MAIL LOCKED',
      message: 'Discord authentication is required to access DNI Mail.',
      login: true
    }, trigger);
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('#terminal-inbox') : null;
    if (!target) return;
    const reason = mailGateReason();
    if (!reason) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    reportMailGate(reason, target);
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
    reportMailGate(reason, input);
  }, true);

  function saveActiveSession() {
    const session = activeSession();
    if (!session) return;
    session.html = output.innerHTML;
    session.draft = input.value;
  }

  function readySessionMarkup(id) {
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

  function startupStatus(percent) {
    if (percent < 18) return 'INITIALIZING DNI CORE SYSTEMS';
    if (percent < 38) return 'ESTABLISHING COMMAND NETWORK';
    if (percent < 58) return 'LINKING IMPERIAL DATABASE';
    if (percent < 78) return 'NEGOTIATING SECURE SESSION';
    if (percent < 96) return 'VERIFYING TERMINAL SERVICES';
    return 'FINALIZING TERMINAL SESSION';
  }

  function startupMarkup(id, percent = 0) {
    const seconds = Math.max(0, Math.ceil((SESSION_STARTUP_MS * (1 - (percent / 100))) / 1000));
    const countdown = `00:${String(seconds).padStart(2, '0')}`;
    return `
      <div class="dni-session-startup" role="status" aria-live="polite">
        <div class="dni-session-startup-kicker">DREADNOUGHT IMPERIUM DATABASE NETWORK</div>
        <div class="dni-session-startup-logo-frame"><img class="dni-session-startup-logo" src="/src/images/dni-helmet.webp" alt="" aria-hidden="true"></div>
        <h2 class="dni-session-startup-title">TERMINAL ${id} STARTUP</h2>
        <div class="dni-session-startup-subtitle">${startupStatus(percent)}</div>
        <div class="dni-session-startup-progress" aria-hidden="true"><i style="width:${percent}%"></i></div>
        <div class="dni-session-startup-meta"><span>BOOT <b>${percent}%</b></span><span>${countdown}</span></div>
      </div>`;
  }

  function updateSessionMarkup(session, html) {
    session.html = html;
    if (session.id !== activeSessionId) return;
    output.innerHTML = html;
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  function renderSessionTabs() {
    tabHost.classList.add('terminal-session-tabs');
    tabHost.setAttribute('role', 'tablist');
    tabHost.setAttribute('aria-label', 'DNI terminal sessions');
    tabHost.replaceChildren();

    for (const session of sessions) {
      const shell = document.createElement('div');
      shell.className = 'terminal-session-tab-shell';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'terminal-session-tab';
      button.setAttribute('role', 'tab');
      button.dataset.terminalSession = String(session.id);
      button.append(document.createTextNode(`TERMINAL ${session.id}`));
      if (session.phase !== 'ready') {
        const state = document.createElement('span');
        state.className = 'terminal-session-tab-state';
        state.textContent = 'BOOT';
        button.append(state);
        shell.classList.add('is-booting');
      }
      const active = session.id === activeSessionId;
      shell.classList.toggle('is-active', active);
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
      shell.append(button);

      if (sessions.length > 1) {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'terminal-session-close';
        close.textContent = '×';
        close.setAttribute('aria-label', `Close Terminal ${session.id}`);
        close.title = `Close Terminal ${session.id}`;
        close.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          closeSession(session.id);
        });
        shell.append(close);
      }

      tabHost.append(shell);
    }
  }

  async function bootSession(session) {
    if (!session || session.phase === 'ready') return;
    const token = ++session.bootToken;
    session.phase = 'startup';
    session.draft = '';
    renderSessionTabs();
    if (session.id === activeSessionId) syncActiveInteraction();

    const startedAt = performance.now();
    let percent = 0;
    while (percent < 100) {
      if (!sessionById(session.id) || session.bootToken !== token) return;
      const elapsed = performance.now() - startedAt;
      percent = Math.min(100, Math.round((elapsed / SESSION_STARTUP_MS) * 100));
      updateSessionMarkup(session, startupMarkup(session.id, percent));
      await sleep(SESSION_STARTUP_STEP_MS);
    }

    const lines = [
      ['-------------------- DNI TERMINAL v4.3.0 --------------------', 'separator'],
      ['DREADNOUGHT IMPERIUM // DATABASE NETWORK', ''],
      ['COMMAND NETWORK ........ ONLINE', 'dni-terminal-status-ok'],
      ['DATABASE LINK .......... ESTABLISHED', 'dni-terminal-status-ok'],
      ['SECURE SESSION ......... ACTIVE', 'dni-terminal-status-ok'],
      [`TERMINAL ${session.id} SESSION INITIALIZED`, 'muted'],
      ['COMMANDS // HELP · ACCESS 173 · MAIL', 'dni-terminal-command-line'],
      ['------------------------- READY -------------------------', 'separator']
    ];

    let bootHtml = '';
    for (const [text, className] of lines) {
      if (!sessionById(session.id) || session.bootToken !== token) return;
      const classAttr = className ? ` class="${className}"` : '';
      bootHtml += `<div${classAttr}>${text}</div>`;
      updateSessionMarkup(session, bootHtml);
      await sleep(95);
    }

    if (!sessionById(session.id) || session.bootToken !== token) return;
    session.phase = 'ready';
    session.html = bootHtml || readySessionMarkup(session.id);
    renderSessionTabs();
    if (session.id === activeSessionId) {
      output.innerHTML = session.html;
      syncActiveInteraction({ focus: true });
      if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
    }
  }

  function switchSession(id, focusTab = false) {
    if (id === activeSessionId) return;
    const next = sessionById(id);
    if (!next) return;
    saveActiveSession();
    activeSessionId = id;
    output.innerHTML = next.html || (next.phase === 'ready' ? readySessionMarkup(next.id) : startupMarkup(next.id, 0));
    input.value = next.draft || '';
    renderSessionTabs();
    syncActiveInteraction({ focus: !focusTab });
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
    const selectedTab = tabHost.querySelector(`[data-terminal-session="${id}"]`);
    if (focusTab) selectedTab?.focus({ preventScroll: true });
    selectedTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  function closeSession(id) {
    if (sessions.length <= 1) {
      appendStatus('LAST TERMINAL CANNOT BE CLOSED', 'muted');
      return;
    }

    const closingIndex = sessions.findIndex(session => session.id === id);
    if (closingIndex < 0) return;
    const closingSession = sessions[closingIndex];
    const closingActiveSession = id === activeSessionId;
    if (closingActiveSession) saveActiveSession();
    closingSession.bootToken += 1;
    sessions.splice(closingIndex, 1);

    if (closingActiveSession) {
      const next = sessions[Math.min(closingIndex, sessions.length - 1)];
      activeSessionId = next.id;
      output.innerHTML = next.html || (next.phase === 'ready' ? readySessionMarkup(next.id) : startupMarkup(next.id, 0));
      input.value = next.draft || '';
    }

    renderSessionTabs();
    syncActiveInteraction();
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
    const selectedTab = tabHost.querySelector(`[data-terminal-session="${activeSessionId}"]`);
    selectedTab?.focus({ preventScroll: true });
    selectedTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  addButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!activeTerminalReady()) {
      showLockDialog({
        title: 'NEW TERMINAL LOCKED',
        message: 'Current terminal is still starting.\nWait until this terminal reaches READY before opening another terminal.'
      }, addButton);
      return;
    }
    saveActiveSession();
    const nextId = nextSessionId++;
    const session = { id: nextId, html: startupMarkup(nextId, 0), draft: '', phase: 'startup', bootToken: 0 };
    sessions.push(session);
    activeSessionId = nextId;
    output.innerHTML = session.html;
    input.value = '';
    renderSessionTabs();
    syncActiveInteraction();
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
    tabHost.querySelector(`[data-terminal-session="${nextId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    void bootSession(session);
  }, true);

  renderSessionTabs();
  syncInboxGate();

  window.addEventListener('dni:authz', syncInboxGate);
  const readinessObserver = new MutationObserver(() => {
    const first = sessionById(1);
    if (first?.phase === 'external-startup' && browserTerminalReady()) {
      first.phase = 'ready';
      first.html = output.innerHTML;
      renderSessionTabs();
    }
    syncInboxGate();
  });
  readinessObserver.observe(prompt, { attributes: true, attributeFilter: ['class', 'hidden'] });

  const inputObserver = new MutationObserver(syncInboxGate);
  inputObserver.observe(input, { attributes: true, attributeFilter: ['disabled', 'aria-busy'] });

  if (browserTerminalReady()) {
    const first = sessionById(1);
    if (first) {
      first.phase = 'ready';
      first.html = output.innerHTML;
      renderSessionTabs();
      syncInboxGate();
    }
  }
}
