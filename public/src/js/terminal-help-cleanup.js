const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const terminalWindow = document.querySelector('#terminal-window');

if (output && input && !window.__dniTerminalHelpCleanupInstalled) {
  window.__dniTerminalHelpCleanupInstalled = true;

  const DEV_AUTH_ENDPOINT = '/dev/termanal/auth.php';
  const DEV_LOGIN_COMMAND = 'devlogin';

  const HELP_GROUPS = Object.freeze([
    ['CORE', [
      ['HELP', 'Show this command list'],
      ['LOGIN', 'Sign in with Discord'],
      ['ACCESS <number>', 'Open a DNI archive record'],
      ['LIST', 'List DNI archive records']
    ]],
    ['DOCUMENTS', [
      ['SEARCH <text>', 'Search authorized DNI documents'],
      ['DOWNLOAD <number>', 'Download an authorized DNI document']
    ]],
    ['MAIL', [
      ['MAIL', 'Open DNI Mail'],
      ['MAIL UNREAD', 'Show unread mail'],
      ['MAIL ANNOUNCEMENTS', 'Official announcements'],
      ['MAIL SERVICE', 'Service announcements'],
      ['MAIL READ <id>', 'Read a mail message'],
      ['INBOX', 'Alias for MAIL']
    ]],
    ['NAVIGATION', [
      ['TERMINAL', 'Return to DNI Terminal'],
      ['DASHBOARD', 'Open DNI Dashboard'],
      ['RANKS', 'Open the DNI Ranks directory'],
      ['SERVICES', 'Open DNI Services'],
      ['COMMUNICATION', 'Open DNI Communication'],
      ['SECTORS', 'Open DNI Sectors']
    ]],
    ['SYSTEM', [
      ['PATCH NOTES', 'Show user-facing patch notes'],
      ['STARCOMMS', 'Show server bridge status'],
      ['HISTORY', 'Show command history'],
      ['HISTORY CLEAR', 'Clear command history'],
      ['STATUS', 'Show DNI link status'],
      ['CLEAR', 'Restart the active terminal'],
      ['ABOUT', 'Show terminal information']
    ]]
  ]);

  const PUBLIC_PATCH_NOTES = Object.freeze([
    {
      date: '2026-08-31',
      version: 'v1.0',
      patches: [
        'Added the full DNI Ranks directory and the RANKS terminal command.',
        'Added PATCH NOTES so users can see recent visible changes from inside the terminal.',
        'Changed the displayed DNI Terminal version to v1.0.',
        'Reorganized HELP into cleaner command groups.',
        'Added movable multi-terminal tabs with add, switch, and close controls.',
        'Each terminal tab now runs its own startup sequence before reaching READY.',
        'DNI Mail now waits for the active terminal to reach READY and for the user to be signed in.',
        'Reduced the terminal startup sequence to about five seconds.',
        'Improved DNI Communication connection status so the page better reflects whether communications are online, reconnecting, or unavailable.',
        'Improved Star Comms roster, activity, status, and reconnect behavior.'
      ]
    },
    {
      date: '2026-08-30',
      version: 'v1.0 PRE-RELEASE',
      patches: [
        'Expanded DNI Sectors with sector, asset, personnel, and home-base workflows.',
        'Improved Sectors reliability when a preferred data connection is unavailable.',
        'Improved maintenance-mode and site-availability behavior shown to users.'
      ]
    }
  ]);

  let developerUnlocked = false;
  let developerExpiresAt = null;
  let developerCsrf = '';
  let developerPinPending = false;
  let developerInputState = null;

  function addLine(text = '', className = 'muted') {
    const line = document.createElement('div');
    line.textContent = text;
    if (className) line.className = className;
    output.append(line);
    return line;
  }

  function paddedCommand(command) {
    return `  ${command.padEnd(20, ' ')}`;
  }

  function scrollToLatest() {
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

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
  }

  function renderCleanHelp() {
    const children = [...output.children];
    let start = -1;

    for (let index = children.length - 1; index >= 0; index -= 1) {
      if (children[index].textContent?.trim() === 'AVAILABLE COMMANDS') {
        start = index;
        break;
      }
    }
    if (start < 0) return;

    for (let index = children.length - 1; index >= start; index -= 1) {
      children[index].remove();
    }

    addLine('AVAILABLE COMMANDS', '');
    addLine('------------------', 'separator');

    HELP_GROUPS.forEach(([group, commands], groupIndex) => {
      if (groupIndex > 0) addLine('');
      addLine(`[ ${group} ]`, 'command-highlight');
      for (const [command, description] of commands) {
        addLine(`${paddedCommand(command)}${description}`);
      }
    });

    addLine('');
    addLine('TIP: ↑/↓ history  ·  TAB autocomplete  ·  Example: ACCESS 173', 'muted');
    scrollToLatest();
  }

  function renderPatchNotes() {
    addLine('DNI TERMINAL // PATCH NOTES', '');
    addLine('---------------------------', 'separator');
    addLine('USER-FACING PATCH HISTORY', 'command-highlight');
    addLine('Only changes that affect normal users are shown here. Developer, Admin, backend, deployment, database, and internal maintenance work is excluded.', 'muted');

    for (const release of PUBLIC_PATCH_NOTES) {
      addLine('');
      addLine(`[ ${release.date} // ${release.version} ]`, 'command-highlight');
      release.patches.forEach((patch, index) => {
        addLine(`  ${String(index + 1).padStart(2, '0')}. ${patch}`, 'muted');
      });
    }

    addLine('');
    addLine(`TOTAL USER PATCHES // ${PUBLIC_PATCH_NOTES.reduce((total, release) => total + release.patches.length, 0)}`, 'muted');
    addLine('Aliases: PATCHES · PATCHNOTES · PATCH NOTES', 'muted');
    scrollToLatest();
  }

  function isPatchNotesCommand(value) {
    return /^(?:patches|patchnotes|patch\s+notes)$/i.test(String(value || '').trim());
  }

  function renderDeveloperHelp() {
    addLine('DNI DEVELOPER TOOLS // UNLOCKED', 'command-highlight');
    addLine('--------------------------------', 'separator');
    addLine('  DEV HELP             Show developer commands', 'muted');
    addLine('  DEV STATUS           Show developer session state', 'muted');
    addLine('  DEV WHOAMI           Show authenticated developer identity', 'muted');
    addLine('  DEV RUNTIME          Show server/runtime status', 'muted');
    addLine('  DEV BUILD            Show deployed build information', 'muted');
    addLine('  DEV MAINTENANCE STATUS', 'muted');
    addLine('  DEV MAINTENANCE ON', 'muted');
    addLine('  DEV MAINTENANCE OFF', 'muted');
    addLine('  DEV LOGOUT           Lock developer tools', 'muted');
    if (developerExpiresAt) addLine(`SESSION EXPIRES: ${new Date(developerExpiresAt).toLocaleString()}`, 'muted');
    scrollToLatest();
  }

  function restoreDeveloperInput() {
    if (!developerInputState) return;
    input.type = developerInputState.type;
    input.inputMode = developerInputState.inputMode;
    input.autocomplete = developerInputState.autocomplete;
    input.maxLength = developerInputState.maxLength;
    input.placeholder = developerInputState.placeholder;
    input.value = '';
    developerInputState = null;
    developerPinPending = false;
    input.focus({ preventScroll: true });
  }

  function enterDeveloperPinMode() {
    if (developerPinPending) return;
    developerInputState = {
      type: input.type,
      inputMode: input.inputMode,
      autocomplete: input.autocomplete,
      maxLength: input.maxLength,
      placeholder: input.placeholder
    };
    developerPinPending = true;
    input.value = '';
    input.type = 'password';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.maxLength = 4;
    input.placeholder = 'DEVELOPER PIN';
    addLine('DEVELOPER PIN REQUIRED // INPUT HIDDEN', 'command-highlight');
    input.focus({ preventScroll: true });
    scrollToLatest();
  }

  async function getDniSession() {
    const response = await fetch('/api/dni/session', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== 'object') {
      throw new Error(payload?.error || `DNI session check failed (HTTP ${response.status}).`);
    }
    return payload;
  }

  async function requestDeveloper(action, extra = {}) {
    if (!developerCsrf) {
      const session = await getDniSession();
      developerCsrf = String(session.csrfToken || '');
      if (!developerCsrf) throw new Error('DNI session did not provide a CSRF token.');
    }

    const response = await fetch(DEV_AUTH_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-DNI-CSRF': developerCsrf
      },
      body: JSON.stringify({ action, ...extra })
    });

    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      throw new Error(`Developer Tools returned invalid data (HTTP ${response.status}).`);
    }

    if (!response.ok || payload.ok !== true) {
      if (payload.developerLocked) {
        developerUnlocked = false;
        developerExpiresAt = null;
      }
      const error = new Error(payload.error || `Developer Tools request failed (HTTP ${response.status}).`);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  async function startDeveloperLogin() {
    echoCommand(DEV_LOGIN_COMMAND.toUpperCase());
    addLine('VERIFYING DISCORD SESSION...', 'muted');

    try {
      const session = await getDniSession();
      if (!session.authenticated) {
        addLine('DEVELOPER LOGIN LOCKED // DISCORD SIGN-IN REQUIRED', 'muted');
        addLine('REDIRECTING TO DNI DISCORD AUTHENTICATION...', 'muted');
        scrollToLatest();
        window.setTimeout(() => {
          window.location.assign('/auth/discord/login?next=/terminal');
        }, 250);
        return;
      }

      developerCsrf = String(session.csrfToken || '');
      if (!developerCsrf) throw new Error('Authenticated DNI session is missing its security token.');

      try {
        const status = await requestDeveloper('status');
        if (status.unlocked) {
          developerUnlocked = true;
          developerExpiresAt = status.expiresAt || null;
          addLine(`DEVELOPER SESSION ALREADY UNLOCKED // ${status.user?.name || 'AUTHORIZED USER'}`, 'command-highlight');
          renderDeveloperHelp();
          return;
        }
      } catch (error) {
        if (error.status === 403) {
          addLine(`DEVELOPER ACCESS DENIED // ${error.message}`, 'muted');
          scrollToLatest();
          return;
        }
        throw error;
      }

      enterDeveloperPinMode();
    } catch (error) {
      addLine(`DEVELOPER LOGIN ERROR // ${String(error?.message || error)}`, 'muted');
      scrollToLatest();
    }
  }

  async function submitDeveloperPin(pin) {
    restoreDeveloperInput();
    addLine('VERIFYING DEVELOPER CREDENTIALS...', 'muted');

    try {
      const payload = await requestDeveloper('login', { pin });
      developerUnlocked = true;
      developerExpiresAt = payload.expiresAt || null;
      addLine(`DEVELOPER ACCESS GRANTED // ${payload.user?.name || 'AUTHORIZED USER'}`, 'command-highlight');
      renderDeveloperHelp();
    } catch (error) {
      developerUnlocked = false;
      developerExpiresAt = null;
      const remaining = Number(error?.payload?.remainingAttempts);
      const retryAfter = Number(error?.payload?.retryAfter);
      addLine(`DEVELOPER ACCESS DENIED // ${String(error?.message || error)}`, 'muted');
      if (Number.isFinite(remaining)) addLine(`REMAINING PIN ATTEMPTS: ${remaining}`, 'muted');
      if (Number.isFinite(retryAfter) && retryAfter > 0) addLine(`LOCKOUT: ${Math.ceil(retryAfter / 60)} MINUTE(S)`, 'muted');
      scrollToLatest();
    }
  }

  function developerValue(value) {
    if (value === true) return 'YES';
    if (value === false) return 'NO';
    if (value === null || value === undefined || value === '') return 'N/A';
    return String(value);
  }

  async function runDeveloperCommand(value) {
    echoCommand(value);

    if (!developerUnlocked) {
      addLine('DEVELOPER TOOLS LOCKED // RUN THE HIDDEN DEVELOPER LOGIN FIRST', 'muted');
      scrollToLatest();
      return;
    }

    const parts = value.trim().toLowerCase().split(/\s+/);
    const subcommand = parts[1] || 'help';

    try {
      if (subcommand === 'help') {
        renderDeveloperHelp();
        return;
      }

      if (subcommand === 'logout' || subcommand === 'lock') {
        await requestDeveloper('logout');
        developerUnlocked = false;
        developerExpiresAt = null;
        addLine('DEVELOPER TOOLS LOCKED', 'muted');
        scrollToLatest();
        return;
      }

      if (subcommand === 'status') {
        const payload = await requestDeveloper('status');
        developerUnlocked = Boolean(payload.unlocked);
        developerExpiresAt = payload.expiresAt || null;
        addLine(`DEVELOPER SESSION: ${payload.unlocked ? 'UNLOCKED' : 'LOCKED'}`, payload.unlocked ? 'command-highlight' : 'muted');
        addLine(`USER: ${developerValue(payload.user?.name)}`, 'muted');
        addLine(`AUTH SOURCE: ${developerValue(payload.user?.source)}`, 'muted');
        addLine(`MAINTENANCE: ${payload.maintenance ? 'ON' : 'OFF'}`, 'muted');
        if (payload.expiresAt) addLine(`EXPIRES: ${new Date(payload.expiresAt).toLocaleString()}`, 'muted');
        scrollToLatest();
        return;
      }

      if (subcommand === 'whoami') {
        const payload = await requestDeveloper('whoami');
        addLine(`USER: ${developerValue(payload.user?.name)}`);
        addLine(`ADMIN: ${developerValue(payload.user?.admin)}`, 'muted');
        addLine(`AUTH SOURCE: ${developerValue(payload.user?.source)}`, 'muted');
        scrollToLatest();
        return;
      }

      if (subcommand === 'runtime') {
        const payload = await requestDeveloper('runtime');
        const runtime = payload.runtime || {};
        addLine('DNI RUNTIME STATUS', 'command-highlight');
        addLine(`RUNTIME: ${developerValue(runtime.runtime)}`, 'muted');
        addLine(`PHP: ${developerValue(runtime.php)} / ${developerValue(runtime.sapi)}`, 'muted');
        addLine(`SERVER: ${developerValue(runtime.server)}`, 'muted');
        addLine(`DATABASE MODE: ${developerValue(runtime.databaseMode)}`, 'muted');
        addLine(`STAR COMMS CONFIGURED: ${developerValue(runtime.starCommsConfigured)}`, 'muted');
        addLine(`MAINTENANCE: ${runtime.maintenance ? 'ON' : 'OFF'}`, 'muted');
        addLine(`UTC: ${developerValue(runtime.utc)}`, 'muted');
        scrollToLatest();
        return;
      }

      if (subcommand === 'build') {
        const payload = await requestDeveloper('build');
        const build = payload.build || {};
        addLine('DNI BUILD INFORMATION', 'command-highlight');
        addLine(`VERSION: ${developerValue(build.version)}`, 'muted');
        addLine(`BUILD: ${developerValue(build.buildLabel)}`, 'muted');
        addLine(`COMMIT: ${developerValue(build.commit)}`, 'muted');
        if (build.deploymentNote) addLine(`NOTE: ${build.deploymentNote}`, 'muted');
        scrollToLatest();
        return;
      }

      if (subcommand === 'maintenance') {
        const mode = parts[2] || 'status';
        if (!['status', 'on', 'off'].includes(mode)) {
          addLine('USAGE: DEV MAINTENANCE STATUS|ON|OFF', 'muted');
          scrollToLatest();
          return;
        }
        const action = mode === 'status' ? 'maintenance-status' : `maintenance-${mode}`;
        const payload = await requestDeveloper(action);
        addLine(`DNI MAINTENANCE MODE: ${payload.maintenance ? 'ON' : 'OFF'}`, payload.maintenance ? 'command-highlight' : 'muted');
        scrollToLatest();
        return;
      }

      addLine('UNKNOWN DEVELOPER COMMAND // DEV HELP', 'muted');
      scrollToLatest();
    } catch (error) {
      addLine(`DEVELOPER COMMAND ERROR // ${String(error?.message || error)}`, 'muted');
      scrollToLatest();
    }
  }

  document.addEventListener('keydown', event => {
    if (event.target !== input || event.key !== 'Enter') return;

    if (developerPinPending) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const pin = String(input.value || '').trim();
      input.value = '';
      void submitDeveloperPin(pin);
      return;
    }

    const value = String(input.value || '').trim();

    if (value.toLowerCase() === DEV_LOGIN_COMMAND) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      void startDeveloperLogin();
      return;
    }

    if (/^dev(?:\s|$)/i.test(value)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      void runDeveloperCommand(value);
      return;
    }

    if (isPatchNotesCommand(value)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      echoCommand(value);
      renderPatchNotes();
      return;
    }

    if (value.toLowerCase() !== 'help') return;

    // The base terminal writes the legacy HELP list synchronously. Replace it
    // after that handler completes so every session shows one organized list.
    window.setTimeout(renderCleanHelp, 0);
  }, true);
}
