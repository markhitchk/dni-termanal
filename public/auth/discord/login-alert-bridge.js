(() => {
  if (window.__dniLoginAlertBridgeInstalled) return;
  window.__dniLoginAlertBridgeInstalled = true;

  const DEFAULT_LOGIN_URL = '/auth/discord/login';

  function isAuthenticated() {
    return String(document.documentElement.dataset.dniAuth || 'pending').toLowerCase() === 'authenticated';
  }

  function resolveLoginUrl(target) {
    if (target instanceof HTMLAnchorElement && target.href) return target.href;
    const href = target?.getAttribute?.('href');
    if (href) {
      try {
        return new URL(href, window.location.origin).toString();
      } catch (_) {
      }
    }
    return new URL(DEFAULT_LOGIN_URL, window.location.origin).toString();
  }

  function appendTerminalLoginEcho() {
    const output = document.querySelector('#terminal-output');
    if (!output) return;

    const commandLine = document.createElement('div');
    const user = document.createElement('span');
    user.className = 'prompt-admin';
    user.textContent = document.querySelector('.terminal-prompt .prompt-admin')?.textContent || 'guest';
    const host = document.createElement('span');
    host.className = 'prompt-host';
    host.textContent = document.querySelector('.terminal-prompt .prompt-host')?.textContent || 'dni';
    commandLine.append(user, document.createTextNode('@'), host, document.createTextNode(':~$ login'));

    const statusLine = document.createElement('div');
    statusLine.className = 'muted';
    statusLine.textContent = 'AUTHENTICATION REQUIRED // USER CONFIRMATION REQUESTED';

    output.append(commandLine, statusLine);
    const terminalWindow = document.querySelector('#terminal-window');
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  function showLoginAlert(loginUrl = DEFAULT_LOGIN_URL, trigger = null) {
    const alerts = window.DNIAlerts;
    if (!alerts || typeof alerts.show !== 'function') {
      window.location.assign(loginUrl || DEFAULT_LOGIN_URL);
      return;
    }

    alerts.show({
      type: 'error',
      label: 'ERROR',
      title: 'AUTHENTICATION REQUIRED',
      message: 'Would you like to login with Discord?',
      meta: 'DNI AUTHORIZATION GATE // USER ACTION REQUIRED',
      icon: '!',
      login: true,
      loginUrl: loginUrl || DEFAULT_LOGIN_URL,
      trigger: trigger instanceof HTMLElement ? trigger : null,
      dismissible: true,
      buttonText: 'CANCEL'
    });
  }

  document.addEventListener('click', event => {
    if (isAuthenticated()) return;
    const target = event.target instanceof Element
      ? event.target.closest('a[href*="/auth/discord/login"], [data-dni-login]')
      : null;
    if (!target || target.hasAttribute('data-dni-discord-login-direct')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showLoginAlert(resolveLoginUrl(target), target instanceof HTMLElement ? target : null);
  }, true);

  document.addEventListener('keydown', event => {
    if (isAuthenticated() || event.key !== 'Enter') return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.id !== 'command-input') return;
    if (String(field.value || '').trim().toLowerCase() !== 'login') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    field.value = '';
    appendTerminalLoginEcho();
    showLoginAlert(DEFAULT_LOGIN_URL, field);
  }, true);

  window.DNILoginAlert = Object.freeze({
    show: showLoginAlert
  });
})();
