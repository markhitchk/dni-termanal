const shell = document.querySelector('.terminal-shell');

if (shell && !window.__dniSystemEffectsInstalled) {
  window.__dniSystemEffectsInstalled = true;

  const STARTUP_DURATION_MS = 10000;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const panelLabels = Object.freeze({
    terminal: 'DNI TERMINAL',
    dashboard: 'DNI DASHBOARD',
    documents: 'DNI DOCUMENTS',
    services: 'DNI SERVICES',
    communication: 'DNI COMMUNICATION',
    sectors: 'DNI SECTORS',
    admin: 'DNI ADMIN'
  });

  const terminalOutput = document.querySelector('#terminal-output');
  const terminalWindow = document.querySelector('#terminal-window');
  const terminalPrompt = document.querySelector('.terminal-prompt');
  const terminalInput = document.querySelector('#command-input');

  const style = document.createElement('style');
  style.id = 'dni-system-effects-style';
  style.textContent = `
    .dni-startup-screen{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:22px;background:#020303;color:#e7e7e7;font-family:"Courier New",monospace;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease,visibility .18s ease;overflow:hidden}
    .dni-startup-screen.is-active{opacity:1;visibility:visible;pointer-events:auto}
    .dni-startup-screen::before{content:"";position:absolute;inset:-8px;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.025) 0,rgba(255,255,255,.025) 1px,transparent 1px,transparent 4px);animation:dni-scan-drift 7s linear infinite}
    .dni-startup-screen::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 42%,rgba(200,168,102,.07),transparent 36%),linear-gradient(90deg,rgba(255,255,255,.012),transparent 22%,transparent 78%,rgba(255,255,255,.012))}
    .dni-startup-shell{position:relative;z-index:1;width:min(560px,100%);display:flex;flex-direction:column;align-items:center;text-align:center}
    .dni-startup-kicker{color:#777;font:700 9px/1.2 "Courier New",monospace;letter-spacing:2.1px;text-transform:uppercase}
    .dni-startup-logo-frame{position:relative;width:178px;height:178px;margin:24px 0 18px;display:grid;place-items:center;border:1px solid #443b28;background:#050606;box-shadow:0 0 0 1px #111 inset,0 0 42px rgba(200,168,102,.05)}
    .dni-startup-logo-frame::before,.dni-startup-logo-frame::after{content:"";position:absolute;width:18px;height:18px;border-color:#c8a866;opacity:.72}
    .dni-startup-logo-frame::before{left:-1px;top:-1px;border-left:2px solid;border-top:2px solid}
    .dni-startup-logo-frame::after{right:-1px;bottom:-1px;border-right:2px solid;border-bottom:2px solid}
    .dni-startup-logo{width:144px;height:144px;display:block;image-rendering:pixelated;image-rendering:crisp-edges;filter:contrast(1.12) brightness(.96);animation:dni-pixel-logo-live 2.6s steps(2,end) infinite}
    .dni-startup-title{margin:0;color:#f0f0f0;font:800 22px/1 "Courier New",monospace;letter-spacing:5px;text-transform:uppercase}
    .dni-startup-subtitle{min-height:16px;margin-top:11px;color:#9a9a9a;font:700 9px/1.4 "Courier New",monospace;letter-spacing:1.15px;text-transform:uppercase}
    .dni-startup-progress{width:min(420px,100%);height:10px;margin-top:24px;border:1px solid #3a3a3a;background:#050505;padding:2px}
    .dni-startup-progress>i{display:block;width:0;height:100%;background:#c8a866;box-shadow:0 0 12px rgba(200,168,102,.25);transition:width 80ms linear}
    .dni-startup-meta{width:min(420px,100%);display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:#737373;font:700 8px/1.3 "Courier New",monospace;letter-spacing:1px}
    .dni-startup-meta b{color:#bdbdbd;font-weight:700}
    .dni-startup-cursor{display:inline-block;width:.62em;height:1em;margin-left:5px;vertical-align:-.12em;background:#c8a866;animation:dni-cursor-blink .76s steps(1,end) infinite}
    .dni-system-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:22px;background:rgba(2,3,3,.985);font-family:"Courier New",monospace;color:#d6d6d6;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease,visibility .18s ease}
    .dni-system-boot.is-active{opacity:1;visibility:visible;pointer-events:auto}
    .dni-system-boot::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.018) 0,rgba(255,255,255,.018) 1px,transparent 1px,transparent 4px);animation:dni-scan-drift 8s linear infinite}
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
    @keyframes dni-pixel-logo-live{0%,94%,100%{transform:translate(0);filter:contrast(1.12) brightness(.96)}95%{transform:translate(-1px,1px);filter:contrast(1.3) brightness(1.12)}97%{transform:translate(1px,0)}}
    @keyframes dni-boot-line{to{opacity:1;transform:none}}
    @keyframes dni-terminal-line-live{from{opacity:0;transform:translateY(2px);filter:brightness(.72)}to{opacity:1;transform:none;filter:none}}
    @keyframes dni-terminal-prompt-live{from{opacity:0}to{opacity:1}}
    @keyframes dni-panel-enter{from{opacity:0;transform:translateY(8px);filter:brightness(.82)}to{opacity:1;transform:none;filter:none}}
    @keyframes dni-content-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    @keyframes dni-tab-online{0%{filter:brightness(.7)}100%{filter:none}}
    @keyframes dni-status-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.16)}}
    @keyframes dni-scan-drift{from{transform:translateY(0)}to{transform:translateY(8px)}}
    @media(max-width:620px){.dni-startup-screen,.dni-system-boot{padding:12px}.dni-startup-logo-frame{width:150px;height:150px}.dni-startup-logo{width:122px;height:122px}.dni-startup-title{font-size:18px}.dni-system-boot-card{padding:15px 13px}.dni-system-boot-log{min-height:108px;font-size:9px}.dni-system-boot-title{font-size:10px}}
    @media(prefers-reduced-motion:reduce){.dni-startup-screen::before,.dni-startup-logo,.dni-system-boot,.module-panel.dni-system-enter,.module-panel.dni-system-enter *,.terminal-output .dni-terminal-boot-line,.terminal-prompt.dni-terminal-ready,.dni-state-badge.is-online,.status-online.is-online,.nav-tab[aria-selected="true"]{animation:none!important;transition:none!important}.dni-startup-cursor,.dni-system-cursor{animation:dni-cursor-blink 1.2s steps(1,end) infinite}.dni-system-boot::before{animation:none}}
  `;
  document.head.append(style);

  const startupOverlay = document.createElement('div');
  startupOverlay.className = 'dni-startup-screen';
  startupOverlay.setAttribute('role', 'status');
  startupOverlay.setAttribute('aria-live', 'polite');
  startupOverlay.setAttribute('aria-atomic', 'true');
  startupOverlay.innerHTML = `
    <div class="dni-startup-shell">
      <div class="dni-startup-kicker">DREADNOUGHT IMPERIUM DATABASE NETWORK</div>
      <div class="dni-startup-logo-frame"><canvas class="dni-startup-logo" data-dni-startup-logo width="36" height="36" aria-label="Pixelated DNI helmet logo"></canvas></div>
      <h1 class="dni-startup-title">STARTUP<span class="dni-startup-cursor" aria-hidden="true"></span></h1>
      <div class="dni-startup-subtitle" data-dni-startup-status>INITIALIZING DNI CORE SYSTEMS</div>
      <div class="dni-startup-progress" aria-hidden="true"><i data-dni-startup-progress></i></div>
      <div class="dni-startup-meta"><span>BOOT <b data-dni-startup-percent>0%</b></span><span data-dni-startup-countdown>00:10</span></div>
    </div>`;
  document.body.append(startupOverlay);

  const overlay = document.createElement('div');
  overlay.className = 'dni-system-boot';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-atomic', 'true');
  overlay.innerHTML = '<div class="dni-system-boot-card"><div class="dni-system-boot-title"><span>DNI SYSTEM BOOT</span><span data-dni-boot-target>CORE NETWORK</span></div><div class="dni-system-boot-log" data-dni-boot-log></div></div>';
  document.body.append(overlay);

  const startupCanvas = startupOverlay.querySelector('[data-dni-startup-logo]');
  const startupStatus = startupOverlay.querySelector('[data-dni-startup-status]');
  const startupProgress = startupOverlay.querySelector('[data-dni-startup-progress]');
  const startupPercent = startupOverlay.querySelector('[data-dni-startup-percent]');
  const startupCountdown = startupOverlay.querySelector('[data-dni-startup-countdown]');
  const log = overlay.querySelector('[data-dni-boot-log]');
  const target = overlay.querySelector('[data-dni-boot-target]');

  let sequenceId = 0;
  let initialBootComplete = false;
  let startupScreenActive = false;
  let lastPanel = '';
  let nativeTerminalBootId = 0;
  let nativeTerminalBootActive = false;
  let nativeTerminalBootTimer = null;

  function drawPixelLogo() {
    if (!(startupCanvas instanceof HTMLCanvasElement)) return;
    const context = startupCanvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      context.clearRect(0, 0, startupCanvas.width, startupCanvas.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, startupCanvas.width, startupCanvas.height);
    };
    image.onerror = () => {
      context.clearRect(0, 0, startupCanvas.width, startupCanvas.height);
      context.strokeStyle = '#c8a866';
      context.lineWidth = 2;
      context.strokeRect(7, 5, 22, 26);
      context.fillStyle = '#c8a866';
      context.fillRect(11, 11, 14, 4);
      context.fillRect(9, 17, 18, 3);
    };
    image.src = '/src/images/dni-helmet.webp';
  }

  function addLine(label, text, className = '') {
    const line = document.createElement('div');
    line.className = `dni-system-boot-line ${className}`.trim();
    line.innerHTML = `<b>${label}</b> ${text}`;
    log.append(line);
  }

  function terminalAccessTime() {
    return new Date().toLocaleString(undefined, {
      month: 'numeric', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit'
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
    if (!terminalOutput || !terminalPrompt || !terminalInput || nativeTerminalBootActive || startupScreenActive) return;
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
    if (!terminalOutput || nativeTerminalBootActive || startupScreenActive) return;
    if (nativeTerminalBootTimer !== null) window.clearTimeout(nativeTerminalBootTimer);
    nativeTerminalBootTimer = window.setTimeout(() => {
      nativeTerminalBootTimer = null;
      if (!startupScreenActive && staticTerminalBootPresent()) void playNativeTerminalBoot();
    }, 16);
  }

  function activePanelName() {
    return String(shell.dataset.panel || 'terminal').toLowerCase();
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
      await sleep(reducedMotion ? 40 : 170);
      if (id !== sequenceId) return;
      addLine('[NET ]', 'Secure command network link established.', 'is-ok');
      await sleep(reducedMotion ? 40 : 190);
      if (id !== sequenceId) return;
      addLine('[AUTH]', 'Session and clearance services synchronized.', 'is-ok');
      await sleep(reducedMotion ? 40 : 190);
      if (id !== sequenceId) return;
      addLine('[MOD ]', `${label} module handshake complete.`, 'is-ok');
      await sleep(reducedMotion ? 40 : 190);
      if (id !== sequenceId) return;
      addLine('[DNI ]', `SYSTEM READY · ${label}<span class="dni-system-cursor" aria-hidden="true"></span>`, 'is-ready');
      await sleep(reducedMotion ? 40 : 420);
    } else {
      addLine('[DNI ]', `Loading ${label}…`);
      await sleep(reducedMotion ? 30 : 105);
      if (id !== sequenceId) return;
      addLine('[LINK]', 'Module data channel synchronized.', 'is-ok');
      await sleep(reducedMotion ? 30 : 100);
      if (id !== sequenceId) return;
      addLine('[DNI ]', `${label} READY<span class="dni-system-cursor" aria-hidden="true"></span>`, 'is-ready');
      await sleep(reducedMotion ? 30 : 145);
    }

    if (id !== sequenceId) return;
    overlay.classList.remove('is-active');
    document.documentElement.removeAttribute('data-dni-booting');
    animateActivePanel(panelName);
    if (initial) initialBootComplete = true;
  }

  function startupMessage(progress) {
    if (progress < 0.18) return 'INITIALIZING DNI CORE SYSTEMS';
    if (progress < 0.38) return 'MOUNTING IMPERIAL DATABASE NETWORK';
    if (progress < 0.58) return 'VERIFYING COMMAND NETWORK LINK';
    if (progress < 0.78) return 'SYNCHRONIZING CLEARANCE SERVICES';
    if (progress < 0.94) return 'ESTABLISHING SECURE TERMINAL SESSION';
    return 'DNI STARTUP COMPLETE';
  }

  async function showStartupScreen() {
    startupScreenActive = true;
    initialBootComplete = false;
    document.documentElement.dataset.dniStartup = '1';
    if (terminalPrompt) terminalPrompt.hidden = true;
    if (terminalInput) {
      terminalInput.disabled = true;
      terminalInput.setAttribute('aria-busy', 'true');
    }
    drawPixelLogo();
    startupOverlay.classList.add('is-active');

    const startedAt = performance.now();
    while (true) {
      const elapsed = Math.min(STARTUP_DURATION_MS, performance.now() - startedAt);
      const progress = elapsed / STARTUP_DURATION_MS;
      const percent = Math.min(100, Math.floor(progress * 100));
      const secondsLeft = Math.max(0, Math.ceil((STARTUP_DURATION_MS - elapsed) / 1000));
      if (startupProgress) startupProgress.style.width = `${percent}%`;
      if (startupPercent) startupPercent.textContent = `${percent}%`;
      if (startupCountdown) startupCountdown.textContent = `00:${String(secondsLeft).padStart(2, '0')}`;
      if (startupStatus) startupStatus.textContent = startupMessage(progress);
      if (elapsed >= STARTUP_DURATION_MS) break;
      await sleep(80);
    }

    if (startupProgress) startupProgress.style.width = '100%';
    if (startupPercent) startupPercent.textContent = '100%';
    if (startupCountdown) startupCountdown.textContent = '00:00';
    if (startupStatus) startupStatus.textContent = 'DNI STARTUP COMPLETE';
    startupOverlay.classList.remove('is-active');
    document.documentElement.removeAttribute('data-dni-startup');
    startupScreenActive = false;
    initialBootComplete = true;

    const panelName = activePanelName();
    lastPanel = panelName;
    if (panelName === 'terminal') {
      scheduleNativeTerminalBoot();
    } else {
      await showBoot(panelName, { initial: true });
    }
  }

  window.addEventListener('dni:panel', event => {
    const panelName = String(event.detail?.panel || activePanelName()).toLowerCase();
    if (!panelName || panelName === lastPanel) return;
    lastPanel = panelName;
    if (!initialBootComplete || startupScreenActive) return;
    if (panelName === 'terminal') {
      animateActivePanel(panelName);
      scheduleNativeTerminalBoot();
      return;
    }
    void showBoot(panelName, { initial: false });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && initialBootComplete && !startupScreenActive) animateActivePanel(activePanelName());
  });

  if (terminalOutput) {
    const terminalObserver = new MutationObserver(() => {
      if (!nativeTerminalBootActive && !startupScreenActive) scheduleNativeTerminalBoot();
    });
    terminalObserver.observe(terminalOutput, { childList: true, subtree: true, characterData: true });
  }

  lastPanel = activePanelName();
  void showStartupScreen();
}
