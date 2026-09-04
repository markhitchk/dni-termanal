const input = document.querySelector('#command-input');
const output = document.querySelector('#terminal-output');
const terminalWindow = document.querySelector('#terminal-window');

if (input && output && !window.__dniUserSettingsInstalled) {
  window.__dniUserSettingsInstalled = true;

  const SESSION_ENDPOINT = '/api/dni/session';
  const SETTINGS_KEY = 'dni.user.settings.v1';
  const SETTINGS_COMMANDS = Object.freeze(['settings', 'preferences', 'prefs']);
  const TEXT_SIZES = Object.freeze(['small', 'standard', 'large', 'xlarge']);
  const DEFAULT_TEXT_SIZE = 'standard';
  let root = null;
  let session = null;
  let lastFocused = null;
  let activePanel = 'general';

  function installStyle() {
    if (document.getElementById('dni-user-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'dni-user-settings-style';
    style.textContent = `
      .dni-user-settings[hidden],.dni-user-settings-panel[hidden],.dni-user-settings-injection-anchor[hidden]{display:none!important}
      body.dni-user-settings-open{overflow:hidden}
      .dni-user-settings{position:fixed;inset:0;z-index:120000;overflow:hidden;background:#050505;color:#e8faff;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)}
      .dni-user-settings-screen{--settings-accent:#21d8f6;display:grid;grid-template-rows:auto minmax(0,1fr);width:100%;height:100dvh;background:#080c0f}
      .dni-user-settings-hazard{position:absolute;top:0;left:0;right:0;z-index:10;height:6px;background:repeating-linear-gradient(135deg,#74c8f4 0 10px,#0b0b0b 10px 20px);pointer-events:none}
      .dni-user-settings-titleband{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #333}.dni-user-settings-heading{min-width:0}.dni-user-settings-kicker{display:block;font-size:10px}.dni-user-settings-title{margin:3px 0 0}.dni-user-settings-back{margin-left:auto}
      .dni-user-settings-layout{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:0;overflow:hidden}.dni-user-settings-sidebar,.dni-user-settings-main{min-height:0;overflow:auto;padding:18px}.dni-user-settings-nav{display:grid;gap:7px}.dni-user-settings-panel{max-width:980px}
      .dni-user-settings-status,.dni-user-settings-session-grid{display:grid;gap:8px}.dni-user-settings-session-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dni-user-settings-field,.dni-user-settings-option,.dni-user-settings-preview{padding:11px;border:1px solid #303030;background:#090909}.dni-user-settings-field span,.dni-user-settings-field strong{display:block}
      .dni-user-settings-option{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center}.dni-user-settings-option+.dni-user-settings-option{margin-top:7px}.dni-user-settings-switch{position:relative;width:46px;height:24px}.dni-user-settings-switch input{position:absolute;opacity:0}.dni-user-settings-switch span{position:absolute;inset:0;border:1px solid #555}.dni-user-settings-switch input:checked+span{background:#15303a}
      .dni-user-settings-text-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.dni-user-settings-size,.dni-user-settings-nav button,.dni-user-settings-btn,.dni-user-settings-back{min-height:40px;border:1px solid #444;background:#0b0b0b;color:#eee;font:inherit;cursor:pointer}.dni-user-settings-size{padding:10px;text-align:left}.dni-user-settings-size strong,.dni-user-settings-size small{display:block}
      .dni-user-settings-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:16px}.dni-user-settings-note{padding:9px;border-left:2px solid #3e6272}
      html.dni-user-compact .terminal-shell{font-size:.94em}html.dni-user-compact .terminal-frame{padding-top:6px!important;padding-bottom:6px!important}
      html[data-dni-text-size="small"]{--dni-user-terminal-text:12.4px;--dni-user-command-text:15px;--dni-user-preview-text:12px}html[data-dni-text-size="standard"]{--dni-user-terminal-text:13.6px;--dni-user-command-text:16px;--dni-user-preview-text:13px}html[data-dni-text-size="large"]{--dni-user-terminal-text:15.6px;--dni-user-command-text:18px;--dni-user-preview-text:15px}html[data-dni-text-size="xlarge"]{--dni-user-terminal-text:17.4px;--dni-user-command-text:20px;--dni-user-preview-text:17px}
      .terminal-output,.terminal-prompt{font-size:var(--dni-user-terminal-text,13.6px)!important}.command-input{font-size:var(--dni-user-command-text,16px)!important}.dni-user-settings-preview{font-size:var(--dni-user-preview-text,13px)}
      html.dni-user-reduced-motion *,html.dni-user-reduced-motion *:before,html.dni-user-reduced-motion *:after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
      @media(min-width:700px){html[data-dni-text-size="small"]{--dni-user-terminal-text:17px;--dni-user-command-text:17px}html[data-dni-text-size="standard"]{--dni-user-terminal-text:19px;--dni-user-command-text:19px}html[data-dni-text-size="large"]{--dni-user-terminal-text:22px;--dni-user-command-text:22px}html[data-dni-text-size="xlarge"]{--dni-user-terminal-text:25px;--dni-user-command-text:25px}}
      @media(max-width:720px){.dni-user-settings-layout{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.dni-user-settings-sidebar{overflow:visible;padding:8px}.dni-user-settings-status{display:none}.dni-user-settings-nav{grid-template-columns:repeat(4,minmax(max-content,1fr));overflow-x:auto}.dni-user-settings-main{padding:14px 12px 24px}.dni-user-settings-text-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dni-user-settings-session-grid,.dni-user-settings-actions{grid-template-columns:1fr}}
    `;
    document.head.append(style);
  }

  function normalizeTextSize(value) {
    const candidate = String(value || '').toLowerCase();
    return TEXT_SIZES.includes(candidate) ? candidate : DEFAULT_TEXT_SIZE;
  }

  function defaultSettings() {
    return {
      compact: false,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
      autoFocus: true,
      textSize: DEFAULT_TEXT_SIZE
    };
  }

  function loadSettings() {
    const fallback = defaultSettings();
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return fallback;
      return {
        compact: parsed.compact === true,
        reducedMotion: parsed.reducedMotion === true,
        autoFocus: parsed.autoFocus !== false,
        textSize: normalizeTextSize(parsed.textSize)
      };
    } catch {
      return fallback;
    }
  }

  function saveSettings(value) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch {}
  }

  function applySettings(value) {
    document.documentElement.classList.toggle('dni-user-compact', value.compact === true);
    document.documentElement.classList.toggle('dni-user-reduced-motion', value.reducedMotion === true);
    document.documentElement.dataset.dniTerminalAutoFocus = value.autoFocus === false ? 'off' : 'on';
    document.documentElement.dataset.dniTextSize = normalizeTextSize(value.textSize);
  }

  let settings = loadSettings();
  installStyle();
  applySettings(settings);

  function echoCommand(value) {
    const line = document.createElement('div');
    const user = document.createElement('span');
    user.className = 'prompt-admin';
    user.textContent = document.querySelector('.terminal-prompt .prompt-admin')?.textContent || 'guest';
    const host = document.createElement('span');
    host.className = 'prompt-host';
    host.textContent = document.querySelector('.terminal-prompt .prompt-host')?.textContent || 'dni';
    line.append(user, document.createTextNode('@'), host, document.createTextNode(`:~$ ${value}`));
    output.append(line);
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  async function getSession() {
    const response = await fetch(SESSION_ENDPOINT, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== 'object') throw new Error(payload?.error || `DNI session check failed (HTTP ${response.status}).`);
    return payload;
  }

  function identityOf(payload) {
    const user = payload?.user && typeof payload.user === 'object' ? payload.user : {};
    const profile = payload?.profile && typeof payload.profile === 'object' ? payload.profile : {};
    const clearances = Array.isArray(payload?.clearances) ? payload.clearances.filter(Boolean) : [];
    return {
      name: String(user.display_name || user.displayName || user.name || profile.displayName || profile.name || user.username || 'GUEST'),
      service: String(user.service_number || user.serviceNumber || profile.serviceNumber || profile.service_number || '—'),
      clearance: String(payload?.maxClearance || user.max_clearance || user.clearance || profile.clearance || user.rank || profile.rank || clearances.join(', ') || '—')
    };
  }

  function setNote(message) {
    const note = root?.querySelector('[data-settings-note]');
    if (note) note.textContent = String(message || '');
  }

  function setActivePanel(panel) {
    if (!root) return;
    const next = root.querySelector(`[data-settings-panel="${panel}"]`) ? panel : 'general';
    activePanel = next;
    root.querySelectorAll('[data-settings-nav]').forEach(button => {
      const selected = button.getAttribute('data-settings-nav') === next;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll('[data-settings-panel]').forEach(section => {
      section.hidden = section.getAttribute('data-settings-panel') !== next;
    });
  }

  function syncControls() {
    if (!root) return;
    const compact = root.querySelector('[data-settings-compact]');
    const motion = root.querySelector('[data-settings-motion]');
    const autofocus = root.querySelector('[data-settings-autofocus]');
    if (compact instanceof HTMLInputElement) compact.checked = settings.compact === true;
    if (motion instanceof HTMLInputElement) motion.checked = settings.reducedMotion === true;
    if (autofocus instanceof HTMLInputElement) autofocus.checked = settings.autoFocus !== false;
    root.querySelectorAll('[data-settings-text-size]').forEach(button => {
      button.setAttribute('aria-pressed', button.getAttribute('data-settings-text-size') === settings.textSize ? 'true' : 'false');
    });
  }

  function renderSession(payload, errorMessage = '') {
    if (!root) return;
    const identity = identityOf(payload);
    const authenticated = payload?.authenticated === true;
    const values = {
      '[data-settings-session]': authenticated ? 'AUTHENTICATED' : 'GUEST SESSION',
      '[data-settings-user]': identity.name,
      '[data-settings-service]': identity.service,
      '[data-settings-clearance]': identity.clearance
    };
    for (const [selector, value] of Object.entries(values)) root.querySelectorAll(selector).forEach(el => { el.textContent = value; });
    const logout = root.querySelector('[data-settings-logout]');
    if (logout instanceof HTMLButtonElement) {
      logout.disabled = !authenticated;
      logout.textContent = authenticated ? 'LOG OUT OF DNI' : 'ALREADY LOGGED OUT';
    }
    setNote(errorMessage || (authenticated ? 'Authenticated session controls are active.' : 'Guest terminal access remains available.'));
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.body.classList.remove('dni-user-settings-open');
    window.dispatchEvent(new CustomEvent('dni:settings-closed'));
    const target = lastFocused instanceof HTMLElement ? lastFocused : input;
    lastFocused = null;
    if (settings.autoFocus !== false) window.setTimeout(() => target?.focus({ preventScroll: true }), 0);
  }

  function dispatchTerminalCommand(command) {
    input.value = command;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  }

  async function refreshSession() {
    ensureScreen();
    setNote('Refreshing DNI session...');
    try {
      session = await getSession();
      renderSession(session);
    } catch (error) {
      session = null;
      renderSession(null, `Session check failed: ${String(error?.message || error)}`);
    }
  }

  function ensureScreen() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'dni-user-settings';
    root.className = 'dni-user-settings';
    root.hidden = true;
    root.innerHTML = `
      <section class="dni-user-settings-screen" aria-labelledby="dni-user-settings-title">
        <div class="dni-user-settings-hazard" aria-hidden="true"></div>
        <header class="dni-user-settings-titleband">
          <span class="dni-user-settings-icon" aria-hidden="true">⚙</span>
          <div class="dni-user-settings-heading"><span class="dni-user-settings-kicker">DNI TERMINAL // LOCAL CONTROL CENTER</span><h2 class="dni-user-settings-title" id="dni-user-settings-title">SETTINGS</h2></div>
          <button class="dni-user-settings-back" type="button" data-settings-close>← RETURN TO TERMINAL</button>
        </header>
        <div class="dni-user-settings-layout">
          <aside class="dni-user-settings-sidebar" aria-label="Settings sections">
            <div class="dni-user-settings-status">
              <div class="dni-user-settings-field"><span>SESSION</span><strong data-settings-session>CHECKING...</strong></div>
              <div class="dni-user-settings-field"><span>USER</span><strong data-settings-user>CHECKING...</strong></div>
            </div>
            <nav class="dni-user-settings-nav" role="tablist" aria-label="Settings sections">
              <button type="button" role="tab" data-settings-nav="general" aria-selected="true">GENERAL</button>
              <button type="button" role="tab" data-settings-nav="accessibility" aria-selected="false" tabindex="-1">ACCESSIBILITY</button>
              <button type="button" role="tab" data-settings-nav="communications" aria-selected="false" tabindex="-1">COMMUNICATIONS</button>
              <button type="button" role="tab" data-settings-nav="session" aria-selected="false" tabindex="-1">SESSION</button>
            </nav>
          </aside>
          <main class="dni-user-settings-main">
            <section class="dni-user-settings-panel" role="tabpanel" data-settings-panel="general">
              <div class="dni-user-settings-panel-heading"><span>INTERFACE / GENERAL</span><h3>Terminal preferences</h3><p>Adjust the local DNI Terminal interface on this browser. Changes save immediately.</p></div>
              <div class="dni-user-settings-section-title">TERMINAL TEXT SIZE</div>
              <div class="dni-user-settings-text-grid" role="group" aria-label="Terminal text size">
                <button class="dni-user-settings-size" type="button" data-settings-text-size="small" aria-pressed="false"><strong>SMALL</strong><small>90% // dense</small></button>
                <button class="dni-user-settings-size" type="button" data-settings-text-size="standard" aria-pressed="true"><strong>STANDARD</strong><small>100% // default</small></button>
                <button class="dni-user-settings-size" type="button" data-settings-text-size="large" aria-pressed="false"><strong>LARGE</strong><small>115% // easier read</small></button>
                <button class="dni-user-settings-size" type="button" data-settings-text-size="xlarge" aria-pressed="false"><strong>EXTRA LARGE</strong><small>130% // maximum</small></button>
              </div>
              <div class="dni-user-settings-preview" aria-label="Text size preview"><span>operator</span>@<b>dni</b>:~$ <code>TEXT SIZE PREVIEW // STATUS ONLINE</code></div>
              <div class="dni-user-settings-section-title">LAYOUT</div>
              <label class="dni-user-settings-option"><span><strong>Compact interface</strong><small>Tightens terminal spacing for dense layouts and smaller displays.</small></span><span class="dni-user-settings-switch"><input type="checkbox" data-settings-compact><span aria-hidden="true"></span></span></label>
            </section>

            <section class="dni-user-settings-panel" role="tabpanel" data-settings-panel="accessibility" hidden>
              <div class="dni-user-settings-panel-heading"><span>INTERFACE / ACCESSIBILITY</span><h3>Motion & keyboard</h3><p>Control motion effects and how the terminal restores keyboard focus.</p></div>
              <label class="dni-user-settings-option"><span><strong>Reduce animations</strong><small>Minimizes scan, transition, stripe, and motion effects for this browser.</small></span><span class="dni-user-settings-switch"><input type="checkbox" data-settings-motion><span aria-hidden="true"></span></span></label>
              <label class="dni-user-settings-option"><span><strong>Return focus to terminal</strong><small>Places the cursor back in the command line when you leave Settings.</small></span><span class="dni-user-settings-switch"><input type="checkbox" data-settings-autofocus><span aria-hidden="true"></span></span></label>
            </section>

            <section class="dni-user-settings-panel dni-user-settings-body" role="tabpanel" data-settings-panel="communications" hidden>
              <div class="dni-user-settings-panel-heading"><span>DNI NETWORK / COMMUNICATIONS</span><h3>Communications</h3><p>Device-level communication preferences, including DNI Mail alerts, are managed here.</p></div>
              <div class="dni-user-settings-actions dni-user-settings-injection-anchor" hidden aria-hidden="true"></div>
            </section>

            <section class="dni-user-settings-panel" role="tabpanel" data-settings-panel="session" hidden>
              <div class="dni-user-settings-panel-heading"><span>IDENTITY / SESSION</span><h3>DNI session controls</h3><p>Review your current local session and run account/session maintenance commands.</p></div>
              <div class="dni-user-settings-session-grid">
                <div class="dni-user-settings-field"><span>SESSION</span><strong data-settings-session>CHECKING...</strong></div>
                <div class="dni-user-settings-field"><span>USER</span><strong data-settings-user>CHECKING...</strong></div>
                <div class="dni-user-settings-field"><span>SERVICE NUMBER</span><strong data-settings-service>—</strong></div>
                <div class="dni-user-settings-field"><span>CLEARANCE / RANK</span><strong data-settings-clearance>—</strong></div>
              </div>
              <div class="dni-user-settings-actions">
                <button class="dni-user-settings-btn" type="button" data-settings-refresh>REFRESH SESSION</button>
                <button class="dni-user-settings-btn" type="button" data-settings-history>CLEAR COMMAND HISTORY</button>
                <button class="dni-user-settings-btn" type="button" data-settings-reset>RESET LOCAL SETTINGS</button>
                <button class="dni-user-settings-btn" type="button" data-settings-close>RETURN TO TERMINAL</button>
                <button class="dni-user-settings-btn is-danger" type="button" data-settings-logout>LOG OUT OF DNI</button>
              </div>
            </section>
            <p class="dni-user-settings-note" data-settings-note></p>
          </main>
        </div>
      </section>`;
    document.body.append(root);

    root.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const nav = target.closest('[data-settings-nav]');
      if (nav) { setActivePanel(nav.getAttribute('data-settings-nav')); return; }
      const textSize = target.closest('[data-settings-text-size]');
      if (textSize) {
        settings.textSize = normalizeTextSize(textSize.getAttribute('data-settings-text-size'));
        saveSettings(settings);
        applySettings(settings);
        syncControls();
        setNote(`Terminal text size set to ${settings.textSize === 'xlarge' ? 'extra large' : settings.textSize}.`);
        return;
      }
      if (target.closest('[data-settings-close]')) { close(); return; }
      if (target.closest('[data-settings-refresh]')) { void refreshSession(); return; }
      if (target.closest('[data-settings-reset]')) {
        try { localStorage.removeItem(SETTINGS_KEY); } catch {}
        settings = defaultSettings();
        saveSettings(settings);
        applySettings(settings);
        syncControls();
        setNote('Local terminal settings reset to defaults.');
        return;
      }
      if (target.closest('[data-settings-history]')) { close(); dispatchTerminalCommand('history clear'); return; }
      if (target.closest('[data-settings-logout]')) {
        if (session?.authenticated !== true) return;
        close();
        dispatchTerminalCommand('logout');
      }
    });

    root.addEventListener('change', event => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.matches('[data-settings-compact]')) settings.compact = target.checked;
      else if (target.matches('[data-settings-motion]')) settings.reducedMotion = target.checked;
      else if (target.matches('[data-settings-autofocus]')) settings.autoFocus = target.checked;
      else return;
      saveSettings(settings);
      applySettings(settings);
      setNote('Setting saved locally for this browser.');
    });

    return root;
  }

  async function open(rawCommand = 'settings') {
    ensureScreen();
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : input;
    echoCommand(rawCommand);
    root.hidden = false;
    document.body.classList.add('dni-user-settings-open');
    setActivePanel(activePanel);
    syncControls();
    renderSession(session);
    window.dispatchEvent(new CustomEvent('dni:settings-opened', { detail: { root } }));
    window.setTimeout(() => root.querySelector('[data-settings-nav][aria-selected="true"]')?.focus({ preventScroll: true }), 0);
    await refreshSession();
  }

  function addSettingsToHelp() {
    const children = [...output.children];
    let helpStart = -1;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      if (children[i].textContent?.trim() === 'AVAILABLE COMMANDS') { helpStart = i; break; }
    }
    if (helpStart < 0) return;
    const helpChildren = children.slice(helpStart);
    if (helpChildren.some(el => /^SETTINGS\b/i.test(el.textContent?.trim() || ''))) return;
    const line = document.createElement('div');
    line.className = 'muted';
    line.textContent = '  SETTINGS            Open full-screen terminal settings and session controls';
    const tip = helpChildren.find(el => /^TIP:/i.test(el.textContent?.trim() || ''));
    if (tip?.parentNode === output) output.insertBefore(line, tip); else output.append(line);
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  document.addEventListener('keydown', event => {
    if (root && !root.hidden && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.target !== input) return;
    const command = String(input.value || '').trim().toLowerCase();
    if (event.key === 'Tab' && command && (command.startsWith('set') || command.startsWith('pre'))) {
      const match = SETTINGS_COMMANDS.find(candidate => candidate.startsWith(command));
      if (match) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value = match;
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }
    }
    if (event.key !== 'Enter') return;
    if (command === 'help') { window.setTimeout(addSettingsToHelp, 0); return; }
    if (!SETTINGS_COMMANDS.includes(command)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const rawCommand = String(input.value || '').trim() || 'settings';
    input.value = '';
    void open(rawCommand);
  }, true);
}
