const input = document.querySelector('#command-input');
const output = document.querySelector('#terminal-output');
const terminalWindow = document.querySelector('#terminal-window');

if (input && output && !window.__dniTerminalLogoutInstalled) {
  window.__dniTerminalLogoutInstalled = true;

  const SESSION_ENDPOINT = '/api/dni/session';
  const LOGOUT_ENDPOINT = '/auth/logout';
  const AUTH_MARKER_KEY = 'dni.auth.previouslyAuthenticated.v1';
  const LOGOUT_COMMANDS = Object.freeze(['logout', 'signout', 'sign-out']);
  let logoutInFlight = false;

  function appendLine(text = '', className = 'muted') {
    const line = document.createElement('div');
    line.textContent = text;
    if (className) line.className = className;
    output.append(line);
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
    return line;
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
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  function clearAuthenticatedMarker() {
    try {
      localStorage.removeItem(AUTH_MARKER_KEY);
    } catch {
      // Explicit logout remains authoritative even if browser storage is blocked.
    }
  }

  async function getSession() {
    const response = await fetch(SESSION_ENDPOINT, {
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

  async function runLogout(rawCommand = 'logout') {
    if (logoutInFlight) {
      appendLine('DNI LOGOUT ALREADY IN PROGRESS', 'muted');
      return;
    }

    logoutInFlight = true;
    input.disabled = true;
    echoCommand(rawCommand);

    try {
      const session = await getSession();
      if (session.authenticated !== true) {
        clearAuthenticatedMarker();
        appendLine('DNI SESSION ALREADY LOGGED OUT', 'muted');
        appendLine('GUEST TERMINAL ACCESS REMAINS AVAILABLE', 'muted');
        logoutInFlight = false;
        input.disabled = false;
        input.focus({ preventScroll: true });
        return;
      }

      const csrfToken = String(session.csrfToken || '');
      if (!csrfToken) {
        throw new Error('Authenticated DNI session is missing its security token.');
      }

      appendLine('TERMINATING DNI SESSION...', 'muted');

      const response = await fetch(LOGOUT_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'X-DNI-CSRF': csrfToken
        }
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload || payload.ok !== true || payload.authenticated !== false) {
        throw new Error(payload?.error || `DNI logout failed (HTTP ${response.status}).`);
      }

      clearAuthenticatedMarker();
      appendLine('DNI SESSION TERMINATED // LOGOUT COMPLETE', 'command-highlight');
      appendLine('MAIL, ADMIN, AND AUTHENTICATED DNI ACCESS CLOSED', 'muted');
      appendLine('RETURNING TO GUEST TERMINAL...', 'muted');

      window.setTimeout(() => {
        window.location.replace('/terminal');
      }, 350);
    } catch (error) {
      appendLine(`DNI LOGOUT ERROR // ${String(error?.message || error)}`, 'muted');
      appendLine('SESSION STATE WAS NOT CHANGED BY THE TERMINAL CLIENT', 'muted');
      logoutInFlight = false;
      input.disabled = false;
      input.focus({ preventScroll: true });
    }
  }

  function addLogoutToHelp() {
    const children = [...output.children];
    let helpStart = -1;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      if (children[index].textContent?.trim() === 'AVAILABLE COMMANDS') {
        helpStart = index;
        break;
      }
    }
    if (helpStart < 0) return;

    const helpChildren = children.slice(helpStart);
    if (helpChildren.some(child => /^LOGOUT\b/i.test(child.textContent?.trim() || ''))) return;

    const line = document.createElement('div');
    line.className = 'muted';
    line.textContent = '  LOGOUT              End the current DNI session';

    const tip = helpChildren.find(child => /^TIP:/i.test(child.textContent?.trim() || ''));
    if (tip?.parentNode === output) output.insertBefore(line, tip);
    else output.append(line);

    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  document.addEventListener('keydown', event => {
    if (event.target !== input) return;

    const command = String(input.value || '').trim().toLowerCase();

    if (event.key === 'Tab' && command) {
      const match = LOGOUT_COMMANDS.find(candidate => candidate.startsWith(command));
      if (match) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value = match === 'sign-out' ? 'signout' : match;
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }
    }

    if (event.key !== 'Enter') return;

    if (command === 'help') {
      window.setTimeout(addLogoutToHelp, 0);
      return;
    }

    if (!LOGOUT_COMMANDS.includes(command)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const rawCommand = String(input.value || '').trim() || 'logout';
    input.value = '';
    void runLogout(rawCommand);
  }, true);
}
