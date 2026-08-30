const shell = document.querySelector('.terminal-shell');

if (shell && !window.__dniSystemEffectsInstalled) {
  window.__dniSystemEffectsInstalled = true;

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, reducedMotion ? Math.min(ms, 40) : ms));
  const panelLabels = Object.freeze({
    terminal: 'DNI TERMINAL',
    dashboard: 'DNI DASHBOARD',
    documents: 'DNI DOCUMENTS',
    services: 'DNI SERVICES',
    communication: 'DNI COMMUNICATION',
    sectors: 'DNI SECTORS',
    admin: 'DNI ADMIN'
  });

  const style = document.createElement('style');
  style.id = 'dni-system-effects-style';
  style.textContent = `
    .dni-system-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:22px;background:rgba(2,3,3,.985);font-family:"Courier New",monospace;color:#d6d6d6;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease,visibility .18s ease}
    .dni-system-boot.is-active{opacity:1;visibility:visible;pointer-events:auto}
    .dni-system-boot::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.018) 0,rgba(255,255,255,.018) 1px,transparent 1px,transparent 4px);animation:dni-scan-drift 8s linear infinite}
    .dni-system-boot::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 45%,rgba(200,168,102,.045),transparent 48%)}
    .dni-system-boot-card{position:relative;width:min(760px,100%);border:1px solid #3b3528;background:#050606;padding:18px 18px 16px;box-shadow:0 0 0 1px #111 inset,0 20px 70px rgba(0,0,0,.55);overflow:hidden}
    .dni-system-boot-card::before{content:"DREADNOUGHT IMPERIUM DATABASE NETWORK";display:block;color:#c8a866;font:700 9px/1.25 "Courier New",monospace;letter-spacing:1.6px;margin-bottom:13px}
    .dni-system-boot-title{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #242424;padding-bottom:10px;color:#efefef;font:700 12px/1.3 "Courier New",monospace}
    .dni-system-boot-title span:last-child{color:#777;font-size:9px;letter-spacing:1px}
    .dni-system-boot-log{min-height:118px;padding:13px 0 4px;color:#999;font:10px/1.65 "Courier New",monospace}
    .dni-system-boot-line{opacity:0;transform:translateY(3px);animation:dni-boot-line .18s ease forwards}
    .dni-system-boot-line b{color:#c8a866;font-weight:700}
    .dni-system-boot-line.is-ok b{color:#9bd28e}
    .dni-system-boot-line.is-ready{margin-top:7px;color:#ddd}
    .dni-system-cursor{display:inline-block;width:.62em;height:1.05em;margin-left:4px;vertical-align:-.14em;background:#c8a866;animation:dni-cursor-blink .78s steps(1,end) infinite}
    .terminal-output .dni-terminal-boot-line{animation:dni-terminal-line-live .14s ease both}
    .terminal-output .dni-terminal-status-ok{color:#b7d9ad;text-shadow:0 0 5px rgba(87,197,58,.14)}
    .terminal-prompt.dni-terminal-ready{animation:dni-terminal-prompt-live .22s ease both}
    .terminal-prompt.dni-terminal-ready .command-input{caret-color:#c8a866;caret-shape:block}
    .module-panel.dni-system-enter{animation:dni-panel-enter .34s cubic-bezier(.2,.75,.2,1) both}
    .module-panel.dni-system-enter .dni-module-header,.module-panel.dni-system-enter .comms-statusbar,.module-panel.dni-system-enter .dni-admin-card,.module-panel.dni-system-enter .dni-profile-card,.module-panel.dni-system-enter .dni-section-block,.module-panel.dni-system-enter .dni-request-panel,.module-panel.dni-system-enter .dni-dispatch-panel,.module-panel.dni-system-enter .dni-admin-block,.module-panel.dni-system-enter .dni-admin-editor,.module-panel.dni-system-enter .dni-service-card,.module-panel.dni-system-enter .sector-card{animation:dni-content-enter .4s cubic-bezier(.2,.75,.2,1) both;animation-delay:calc(var(--dni-enter-order,0) * 28ms)}
    .nav-tab[aria-selected="true"]{animation:dni-tab-online .3s ease both}
    .dni-state-badge.is-online,.status-online.is-online{animation:dni-status-pulse 2.8s ease-in-out infinite}
    .dni-primary-action,.dni-admin-action,.small-action,.nav-tab{transition:transform .12s ease,border-color .16s ease,background-color .16s ease,opacity .16s ease}
    .dni-primary-action:active,.dni-admin-action:active,.small-action:active,.nav-tab:active{transform:translateY(1px) scale(.985)}
    @keyframes dni-cursor-blink{0%,46%{opacity:1}47%,100%{opacity:0}}
    @keyframes dni-boot-line{to{opacity:1;transform:none}}
    @keyframes dni-terminal-line-live{from{opacity:0;transform:translateY(2px);filter:brightness(.72)}to{opacity:1;transform:none;filter:none}}
    @keyframes dni-terminal-prompt-live{from{opacity:0}to{opacity:1}}
    @keyframes dni-panel-enter{from{opacity:0;transform:translateY(8px);filter:brightness(.82)}to{opacity:1;transform:none;filter:none}}
    @keyframes dni-content-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    @keyframes dni-tab-online{0%{filter:brightness(.7)}100%{filter:none}}
    @keyframes dni-status-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.16)}}
    @keyframes dni-scan-drift{from{transform:translateY(0)}to{transform:translateY(8px)}}
    @media(max-width:620px){.dni-system-boot{padding:12px}.dni-system-boot-card{padding:15px 13px}.dni-system-boot-log{min-height:108px;font-size:9px}.dni-system-boot-title{font-size:10px}}
    @media(prefers-reduced-motion:reduce){.dni-system-boot,.module-panel.dni-system-enter,.module-panel.dni-system-enter *,.terminal-output .dni-terminal-boot-line,.terminal-prompt.dni-terminal-ready,.dni-state-badge.is-online,.status-online.is-online,.nav-tab[aria-selected="true"]{animation:none!important;transition:none!important}.dni-system-cursor{animation:dni-cursor-blink 1.2s steps(1,end) infinite}.dni-system-boot::before{animation:none}}
  `;
  document.head.append(style);

  const overlay = document.createElement('div');
  overlay.className = 'dni-system-boot';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-atomic', 'true');
  overlay.innerHTML = '<div class="dni-system-boot-card"><div class="dni-system-boot-title"><span>DNI SYSTEM BOOT</span><span data-dni-boot-target>CORE NETWORK</span></div><div class="dni-system-boot-log" data-dni-boot-log></div></div>';
  document.body.append(overlay);

  const log = overlay.querySelector('[data-dni-boot-log]');
  const target = overlay.querySelector('[data-dni-boot-target]');
  const terminalOutput = document.querySelector('#terminal-output');
  const terminalWindow = document.querySelector('#terminal-window');
  const terminalPrompt = document.querySelector('.terminal-prompt');
  const terminalInput = document.querySelector('#command-input');
  let sequenceId = 0;
  let initialBootComplete = false;
  let lastPanel = '';
  let nativeTerminalBootId = 0;
  let nativeTerminalBootActive = false;
  let nativeTerminalBootTimer = null;

  function addLine(label, text, className = '') {
    const line = document.createElement('div');
    line.className = `dni-system-boot-line ${className}`.trim();
    line.innerHTML = `<b>${label}</b> ${text}`;
    log.append(line);
  }

  function terminalAccessTime() {
    return new Date().toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function nativeTerminalLines() {
    return [
      ['---------------------- DNI TERMINAL v4.3.0 ----------------------', 'separator', 3],
      ['DREADNOUGHT IMPERIUM', '', 8],
      ['DREADNOUGHT IMPERIUM DATABASE NETWORK', '', 7],
      ['DNI COMMAND NETWORK // ONLINE', 'dni-terminal-status-ok', 7],
      ['IMPERIAL DATABASE LINK // ESTABLISHED', 'dni-terminal-status-ok', 7],
      ['SECURE TERMINAL SESSION // ACTIVE', 'dni-terminal-status-ok', 7],
      [`Access Time: ${terminalAccessTime()}`, 'muted', 6],
      ['Welcome to the Dreadnought Imperium Database Network.', '', 6],
      ['Authorized personnel may access DNI records, operational services,', 'muted', 4],
      ['communications, sector data, and official network announcements.', 'muted', 4],
      ["Enter 'help' to display available terminal commands.", '', 5],
      ["Enter 'access <number>' to retrieve a DNI database record.", '', 5],
      ["Example: 'access 173' retrieves DNI-173.", '', 5],
      ["Enter 'mail' to access DNI Mail and official announcements.", '', 5],
      ['------------------- DREADNOUGHT IMPERIUM -------------------', 'separator', 3]
    ];
  }

  function staticTerminalBootPresent() {
    if (!terminalOutput || nativeTerminalBootActive) return false;
    if (terminalOutput.querySelector('.dni-terminal-boot-line')) return false;
    const text = terminalOutput.textContent || '';
    return text.includes('DNI TERMINAL v4.3.0')
      && text.includes('DREADNOUGHT IMPERIUM DATABASE NETWORK')
      && text.includes('DNI COMMAND NETWORK // ONLINE')
      && text.includes("Enter 'mail' to access DNI Mail and official announcements.")
      && text.includes('------------------- DREADNOUGHT IMPERIUM -------------------');
  }

  async function typeNativeTerminalLine(text, className, speed, id) {
    if (!terminalOutput) return false;
    const line = document.createElement('div');
    line.className = `${className} dni-terminal-boot-line`.trim();
    terminalOutput.append(line);
    if (reducedMotion) {
      line.textContent = text;
      return id === nativeTerminalBootId;
    }
    for (let index = 0; index < text.length; index += 1) {
      if (id !== nativeTerminalBootId) return false;
      line.textContent += text[index];
      if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
      await sleep(index % 14 === 0 ? speed + 3 : speed);
    }
    await sleep(38);
    return id === nativeTerminalBootId;
  }

  async function playNativeTerminalBoot() {
    if (!terminalOutput || !terminalPrompt || !terminalInput || nativeTerminalBootActive) return;
    const id = ++nativeTerminalBootId;
    nativeTerminalBootActive = true;
    if (nativeTerminalBootTimer !== null) {
      window.clearTimeout(nativeTerminalBootTimer);
      nativeTerminalBootTimer = null;
    }

    terminalPrompt.hidden = true;
    terminalPrompt.classList.remove('dni-terminal-ready');
    terminalInput.disabled = true;
    terminalInput.value = '';
    terminalInput.setAttribute('aria-busy', 'true');
    terminalOutput.replaceChildren();

    for (const [text, className, speed] of nativeTerminalLines()) {
      const completed = await typeNativeTerminalLine(text, className, speed, id);
      if (!completed) {
        nativeTerminalBootActive = false;
        return;
      }
    }

    if (id !== nativeTerminalBootId) {
      nativeTerminalBootActive = false;
      return;
    }
    nativeTerminalBootActive = false;
    terminalInput.disabled = false;
    terminalInput.removeAttribute('aria-busy');
    terminalPrompt.hidden = false;
    terminalPrompt.classList.add('dni-terminal-ready');
    if (activePanelName() === 'terminal') terminalInput.focus({ preventScroll: true });
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  function scheduleNativeTerminalBoot() {
    if (!terminalOutput || nativeTerminalBootActive) return;
    if (nativeTerminalBootTimer !== null) window.clearTimeout(nativeTerminalBootTimer);
    nativeTerminalBootTimer = window.setTimeout(() => {
      nativeTerminalBootTimer = null;
      if (staticTerminalBootPresent()) void playNativeTerminalBoot();
    }, 16);
  }

  function animateActivePanel(panelName) {
    const panel = shell.querySelector(`[data-module="${CSS.escape(panelName)}"]`);
    if (!panel) return;
    panel.classList.remove('dni-system-enter');
    void panel.offsetWidth;
    panel.classList.add('dni-system-enter');
    const items = panel.querySelectorAll('.dni-module-header,.comms-statusbar,.dni-admin-card,.dni-profile-card,.dni-section-block,.dni-request-panel,.dni-dispatch-panel,.dni-admin-block,.dni-admin-editor,.dni-service-card,.sector-card');
    items.forEach((item, index) => item.style.setProperty('--dni-enter-order', String(Math.min(index, 14))));
    window.setTimeout(() => panel.classList.remove('dni-system-enter'), reducedMotion ? 80 : 900);
  }

  async function showBoot(panelName, { initial = false } = {}) {
    const id = ++sequenceId;
    const label = panelLabels[panelName] || 'DNI SYSTEM';
    target.textContent = label;
    log.replaceChildren();
    overlay.classList.add('is-active');
    document.documentElement.dataset.dniBooting = '1';

    if (initial) {
      addLine('[BOOT]', 'Initializing Dreadnought Imperium Database Network…');
      await sleep(170);
      if (id !== sequenceId) return;
      addLine('[NET ]', 'Secure command network link established.', 'is-ok');
      await sleep(190);
      if (id !== sequenceId) return;
      addLine('[AUTH]', 'Session and clearance services synchronized.', 'is-ok');
      await sleep(190);
      if (id !== sequenceId) return;
      addLine('[MOD ]', `${label} module handshake complete.`, 'is-ok');
      await sleep(190);
      if (id !== sequenceId) return;
      addLine('[DNI ]', `SYSTEM READY · ${label}<span class="dni-system-cursor" aria-hidden="true"></span>`, 'is-ready');
      await sleep(420);
    } else {
      addLine('[DNI ]', `Loading ${label}…`);
      await sleep(105);
      if (id !== sequenceId) return;
      addLine('[LINK]', 'Module data channel synchronized.', 'is-ok');
      await sleep(100);
      if (id !== sequenceId) return;
      addLine('[DNI ]', `${label} READY<span class="dni-system-cursor" aria-hidden="true"></span>`, 'is-ready');
      await sleep(145);
    }

    if (id !== sequenceId) return;
    overlay.classList.remove('is-active');
    document.documentElement.removeAttribute('data-dni-booting');
    animateActivePanel(panelName);
    if (initial) initialBootComplete = true;
  }

  function activePanelName() {
    return String(shell.dataset.panel || 'terminal').toLowerCase();
  }

  window.addEventListener('dni:panel', event => {
    const panelName = String(event.detail?.panel || activePanelName()).toLowerCase();
    if (!panelName || panelName === lastPanel) return;
    lastPanel = panelName;
    if (!initialBootComplete) return;
    if (panelName === 'terminal') {
      animateActivePanel(panelName);
      return;
    }
    void showBoot(panelName, { initial: false });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && initialBootComplete) animateActivePanel(activePanelName());
  });

  if (terminalOutput) {
    const terminalObserver = new MutationObserver(() => {
      if (!nativeTerminalBootActive) scheduleNativeTerminalBoot();
    });
    terminalObserver.observe(terminalOutput, { childList: true, subtree: true, characterData: true });
  }

  const firstPanel = activePanelName();
  lastPanel = firstPanel;
  if (firstPanel === 'terminal') {
    initialBootComplete = true;
    scheduleNativeTerminalBoot();
  } else {
    void showBoot(firstPanel, { initial: true });
  }
}