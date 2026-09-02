const input = document.querySelector('#command-input');
const output = document.querySelector('#terminal-output');
const terminalWindow = document.querySelector('#terminal-window');

if (input && output && !window.__dniUserSettingsInstalled) {
  window.__dniUserSettingsInstalled = true;

  const SESSION_ENDPOINT = '/api/dni/session';
  const SETTINGS_KEY = 'dni.user.settings.v1';
  const SETTINGS_COMMANDS = Object.freeze(['settings', 'preferences', 'prefs']);
  let root = null;
  let session = null;
  let lastFocused = null;

  function installStyle() {
    if (document.getElementById('dni-user-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'dni-user-settings-style';
    style.textContent = `
      .dni-user-settings[hidden]{display:none!important}
      .dni-user-settings{position:fixed;inset:0;z-index:120000;display:grid;place-items:center;padding:18px;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)}
      .dni-user-settings-backdrop{position:absolute;inset:0;background:radial-gradient(circle at 50% 20%,rgba(0,205,235,.10),transparent 40%),rgba(1,7,12,.84);backdrop-filter:blur(5px)}
      .dni-user-settings-dialog{--settings-accent:#21d8f6;position:relative;width:min(680px,100%);max-height:min(760px,calc(100dvh - 36px));overflow:auto;color:#dffbff;background:linear-gradient(180deg,rgba(8,20,27,.99),rgba(3,11,16,.99));border:1px solid rgba(33,216,246,.56);box-shadow:0 0 0 1px rgba(33,216,246,.08) inset,0 20px 70px rgba(0,0,0,.72),0 0 32px rgba(33,216,246,.12);clip-path:polygon(0 12px,12px 0,calc(100% - 34px) 0,100% 34px,100% 100%,0 100%)}
      .dni-user-settings-hazard{height:10px;background:repeating-linear-gradient(135deg,rgba(33,216,246,.95) 0 12px,rgba(0,20,27,.95) 12px 24px);animation:dni-settings-stripe 4s linear infinite}
      @keyframes dni-settings-stripe{to{background-position:68px 0}}
      .dni-user-settings-titleband{display:flex;align-items:center;gap:12px;padding:18px 20px 14px;border-bottom:1px solid rgba(33,216,246,.25);background:linear-gradient(90deg,rgba(33,216,246,.10),transparent 62%)}
      .dni-user-settings-icon{display:grid;place-items:center;width:38px;height:38px;flex:0 0 38px;border:1px solid rgba(33,216,246,.58);color:var(--settings-accent);background:rgba(33,216,246,.07);font-size:20px}
      .dni-user-settings-heading{min-width:0}.dni-user-settings-kicker{display:block;margin-bottom:3px;color:#73a9b3;font-size:11px;letter-spacing:.15em}.dni-user-settings-title{margin:0;color:#f1fdff;font-size:clamp(20px,4.5vw,28px);line-height:1.05;letter-spacing:.05em}
      .dni-user-settings-close-x{margin-left:auto;width:38px;height:38px;border:1px solid rgba(33,216,246,.32);color:#b8edf5;background:rgba(0,0,0,.22);cursor:pointer;font:inherit;font-size:18px}
      .dni-user-settings-body{padding:18px 20px 20px}.dni-user-settings-status{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:16px}.dni-user-settings-field{min-width:0;padding:11px 12px;border:1px solid rgba(33,216,246,.20);background:rgba(33,216,246,.035)}
      .dni-user-settings-field span{display:block;margin-bottom:5px;color:#6e9ca6;font-size:10px;letter-spacing:.12em}.dni-user-settings-field strong{display:block;overflow:hidden;color:#eafcff;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.dni-user-settings-section-title{margin:18px 0 8px;color:#8ecbd4;font-size:11px;letter-spacing:.14em}
      .dni-user-settings-option{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:13px 0;border-top:1px solid rgba(120,190,202,.13)}.dni-user-settings-option:last-of-type{border-bottom:1px solid rgba(120,190,202,.13)}.dni-user-settings-option strong{display:block;margin-bottom:4px;color:#e9fcff;font-size:13px}.dni-user-settings-option small{display:block;color:#759aa2;font-size:11px;line-height:1.45}
      .dni-user-settings-switch{position:relative;width:46px;height:24px;flex:0 0 46px}.dni-user-settings-switch input{position:absolute;opacity:0;pointer-events:none}.dni-user-settings-switch span{position:absolute;inset:0;border:1px solid rgba(106,154,163,.55);background:#071117;cursor:pointer}.dni-user-settings-switch span:after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;background:#6d8990;transition:transform .16s ease,background .16s ease}.dni-user-settings-switch input:checked+span{border-color:rgba(33,216,246,.78);background:rgba(33,216,246,.10)}.dni-user-settings-switch input:checked+span:after{transform:translateX(22px);background:var(--settings-accent);box-shadow:0 0 12px rgba(33,216,246,.45)}
      .dni-user-settings-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}.dni-user-settings-btn{min-height:40px;padding:9px 13px;border:1px solid rgba(33,216,246,.38);color:#dffbff;background:rgba(33,216,246,.06);cursor:pointer;font:inherit;font-size:11px;letter-spacing:.07em}.dni-user-settings-btn:hover,.dni-user-settings-btn:focus-visible{outline:none;border-color:rgba(33,216,246,.82);background:rgba(33,216,246,.13)}.dni-user-settings-btn.is-danger{margin-left:auto;border-color:rgba(255,93,93,.55);color:#ffd7d7;background:rgba(255,66,66,.08)}.dni-user-settings-btn.is-danger:hover,.dni-user-settings-btn.is-danger:focus-visible{border-color:rgba(255,93,93,.90);background:rgba(255,66,66,.15)}.dni-user-settings-btn:disabled{opacity:.45;cursor:not-allowed}
      .dni-user-settings-note{min-height:17px;margin:12px 0 0;color:#79a5ad;font-size:10px;line-height:1.45}
      html.dni-user-compact .terminal-shell{font-size:.94em}html.dni-user-compact .terminal-frame{padding-top:6px!important;padding-bottom:6px!important}html.dni-user-reduced-motion *,html.dni-user-reduced-motion *:before,html.dni-user-reduced-motion *:after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
      @media(max-width:620px){.dni-user-settings{padding:10px;align-items:end}.dni-user-settings-dialog{max-height:min(86dvh,720px)}.dni-user-settings-titleband{padding:15px 14px 12px}.dni-user-settings-body{padding:14px}.dni-user-settings-status{grid-template-columns:1fr}.dni-user-settings-actions{display:grid;grid-template-columns:1fr 1fr}.dni-user-settings-btn{width:100%}.dni-user-settings-btn.is-danger{margin-left:0;grid-column:1/-1}}
      @media(prefers-reduced-motion:reduce){.dni-user-settings-hazard{animation:none}}
    `;
    document.head.append(style);
  }

  function loadSettings() {
    const fallback = {
      compact: false,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
      autoFocus: true
    };
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return fallback;
      return {
        compact: parsed.compact === true,
        reducedMotion: parsed.reducedMotion === true,
        autoFocus: parsed.autoFocus !== false
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

  function syncControls() {
    if (!root) return;
    const compact = root.querySelector('[data-settings-compact]');
    const motion = root.querySelector('[data-settings-motion]');
    const autofocus = root.querySelector('[data-settings-autofocus]');
    if (compact instanceof HTMLInputElement) compact.checked = settings.compact === true;
    if (motion instanceof HTMLInputElement) motion.checked = settings.reducedMotion === true;
    if (autofocus instanceof HTMLInputElement) autofocus.checked = settings.autoFocus !== false;
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
    for (const [selector, value] of Object.entries(values)) {
      const el = root.querySelector(selector);
      if (el) el.textContent = value;
    }
    const logout = root.querySelector('[data-settings-logout]');
    if (logout instanceof HTMLButtonElement) {
      logout.disabled = !authenticated;
      logout.textContent = authenticated ? 'LOG OUT OF DNI' : 'ALREADY LOGGED OUT';
    }
    const note = root.querySelector('[data-settings-note]');
    if (note) note.textContent = errorMessage || (authenticated ? 'Authenticated session controls are active.' : 'Guest terminal access remains available.');
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.body.classList.remove('dni-user-settings-open');
    const target = lastFocused instanceof HTMLElement ? lastFocused : input;
    lastFocused = null;
    if (settings.autoFocus !== false) window.setTimeout(() => target?.focus({ preventScroll: true }), 0);
  }

  function dispatchTerminalCommand(command) {
    input.value = command;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  }

  async function refreshSession() {
    ensureModal();
    const note = root.querySelector('[data-settings-note]');
    if (note) note.textContent = 'Refreshing DNI session...';
    try {
      session = await getSession();
      renderSession(session);
    } catch (error) {
      session = null;
      renderSession(null, `Session check failed: ${String(error?.message || error)}`);
    }
  }

  function ensureModal() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'dni-user-settings';
    root.className = 'dni-user-settings';
    root.hidden = true;
    root.innerHTML = `
      <div class="dni-user-settings-backdrop" data-settings-close aria-hidden="true"></div>
      <section class="dni-user-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="dni-user-settings-title">
        <div class="dni-user-settings-hazard" aria-hidden="true"></div>
        <header class="dni-user-settings-titleband">
          <span class="dni-user-settings-icon" aria-hidden="true">⚙</span>
          <div class="dni-user-settings-heading"><span class="dni-user-settings-kicker">DNI USER CONTROL PANEL</span><h2 class="dni-user-settings-title" id="dni-user-settings-title">USER SETTINGS</h2></div>
          <button class="dni-user-settings-close-x" type="button" data-settings-close aria-label="Close user settings">×</button>
        </header>
        <div class="dni-user-settings-body">
          <div class="dni-user-settings-status">
            <div class="dni-user-settings-field"><span>SESSION</span><strong data-settings-session>CHECKING...</strong></div>
            <div class="dni-user-settings-field"><span>USER</span><strong data-settings-user>CHECKING...</strong></div>
            <div class="dni-user-settings-field"><span>SERVICE NUMBER</span><strong data-settings-service>—</strong></div>
            <div class="dni-user-settings-field"><span>CLEARANCE / RANK</span><strong data-settings-clearance>—</strong></div>
          </div>
          <div class="dni-user-settings-section-title">TERMINAL INTERFACE</div>
          <label class="dni-user-settings-option"><span><strong>Compact interface</strong><small>Tightens the terminal presentation on smaller screens and dense layouts.</small></span><span class="dni-user-settings-switch"><input type="checkbox" data-settings-compact><span aria-hidden="true"></span></span></label>
          <label class="dni-user-settings-option"><span><strong>Reduce animations</strong><small>Minimizes scan, transition, and motion effects for this browser.</small></span><span class="dni-user-settings-switch"><input type="checkbox" data-settings-motion><span aria-hidden="true"></span></span></label>
          <label class="dni-user-settings-option"><span><strong>Return focus to terminal</strong><small>Places the cursor back in the command line after closing settings.</small></span><span class="dni-user-settings-switch"><input type="checkbox" data-settings-autofocus><span aria-hidden="true"></span></span></label>
          <div class="dni-user-settings-actions">
            <button class="dni-user-settings-btn" type="button" data-settings-refresh>REFRESH SESSION</button>
            <button class="dni-user-settings-btn" type="button" data-settings-history>CLEAR COMMAND HISTORY</button>
            <button class="dni-user-settings-btn" type="button" data-settings-reset>RESET LOCAL SETTINGS</button>
            <button class="dni-user-settings-btn" type="button" data-settings-close>CLOSE</button>
            <button class="dni-user-settings-btn is-danger" type="button" data-settings-logout>LOG OUT OF DNI</button>
          </div>
          <p class="dni-user-settings-note" data-settings-note></p>
        </div>
      </section>`;
    document.body.append(root);

    root.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest('[data-settings-close]')) { close(); return; }
      if (target.closest('[data-settings-refresh]')) { void refreshSession(); return; }
      if (target.closest('[data-settings-reset]')) {
        try { localStorage.removeItem(SETTINGS_KEY); } catch {}
        settings = { compact: false, reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true, autoFocus: true };
        saveSettings(settings); applySettings(settings); syncControls();
        const note = root.querySelector('[data-settings-note]');
        if (note) note.textContent = 'Local terminal settings reset.';
        return;
      }
      if (target.closest('[data-settings-history]')) {
        close();
        dispatchTerminalCommand('history clear');
        return;
      }
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
      saveSettings(settings); applySettings(settings);
      const note = root.querySelector('[data-settings-note]');
      if (note) note.textContent = 'Setting saved locally for this browser.';
    });

    return root;
  }

  async function open(rawCommand = 'settings') {
    ensureModal();
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : input;
    echoCommand(rawCommand);
    root.hidden = false;
    document.body.classList.add('dni-user-settings-open');
    syncControls(); renderSession(session);
    window.setTimeout(() => root.querySelector('[data-settings-refresh]')?.focus({ preventScroll: true }), 0);
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
    line.textContent = '  SETTINGS            Open user settings and session controls';
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
        event.preventDefault(); event.stopImmediatePropagation(); input.value = match; input.setSelectionRange(input.value.length, input.value.length); return;
      }
    }
    if (event.key !== 'Enter') return;
    if (command === 'help') { window.setTimeout(addSettingsToHelp, 0); return; }
    if (!SETTINGS_COMMANDS.includes(command)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const rawCommand = String(input.value || '').trim() || 'settings';
    input.value = '';
    void open(rawCommand);
  }, true);
}
