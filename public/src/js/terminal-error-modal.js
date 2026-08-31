const input = document.querySelector('#command-input');
const prompt = document.querySelector('.terminal-prompt');

if (!window.__dniTerminalErrorModalInstalled) {
  window.__dniTerminalErrorModalInstalled = true;

  const LOGIN_URL = '/auth/discord/login';
  const ALERT_LABELS = Object.freeze({
    error: 'ERROR',
    attention: 'ATTENTION',
    info: 'SYSTEM INFO',
    success: 'CONFIRMED'
  });

  function installMailUxStyles() {
    if (document.querySelector('link[data-dni-mail-ux-style]')) return;
    const source = new URL(import.meta.url);
    const stylesheet = source.pathname.includes('/dist/')
      ? new URL('./mail-ux.css' + source.search, source)
      : new URL('../css/mail-ux.css' + source.search, source);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesheet.href;
    link.dataset.dniMailUxStyle = 'true';
    document.head.append(link);
  }

  function normalizeKind(kind) {
    const value = String(kind || 'error').toLowerCase();
    return Object.prototype.hasOwnProperty.call(ALERT_LABELS, value) ? value : 'error';
  }

  function ensureGate() {
    let root = document.querySelector('#dni-mail-gate');
    if (!root) {
      root = document.createElement('div');
      root.id = 'dni-mail-gate';
      root.className = 'dni-mail-gate';
      root.hidden = true;
      root.dataset.mode = 'error';
      root.dataset.alertKind = 'error';
      root.innerHTML = `
        <div class="dni-mail-gate-backdrop" data-mail-gate-backdrop></div>

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

        <section class="dni-mail-error-dialog" data-mail-error role="alertdialog" aria-modal="true" aria-labelledby="dni-mail-error-title" aria-describedby="dni-mail-error-copy">
          <div class="dni-mail-error-caption"><span data-dni-alert-label>ERROR</span></div>
          <div class="dni-mail-error-banner">
            <span class="dni-mail-error-icon" aria-hidden="true"><i>!</i></span>
            <strong id="dni-mail-error-title" data-mail-error-title>DNI ERROR</strong>
            <span class="dni-alert-scan" aria-hidden="true"></span>
          </div>
          <div class="dni-mail-error-body">
            <p id="dni-mail-error-copy" data-mail-error-copy></p>
          </div>
          <div class="dni-mail-error-actions">
            <a class="dni-mail-error-login" data-mail-error-login data-dni-discord-login-direct href="${LOGIN_URL}" hidden>LOGIN WITH DISCORD</a>
            <button class="dni-mail-error-ok" data-mail-error-ok type="button">OK</button>
          </div>
        </section>`;
      document.body.append(root);
    }

    if (!root.dataset.alertKind) root.dataset.alertKind = 'error';

    if (root.dataset.dniSharedErrorBound !== 'true') {
      root.dataset.dniSharedErrorBound = 'true';
      root.querySelector('[data-mail-error-ok]')?.addEventListener('click', () => closeGate(true));
      root.querySelector('[data-mail-gate-backdrop]')?.addEventListener('click', () => {
        if (root.dataset.mode === 'error' && root.dataset.dismissible !== 'false') closeGate(false);
      });
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || root.hidden || root.dataset.mode !== 'error' || root.dataset.dismissible === 'false') return;
        event.preventDefault();
        closeGate(false);
      });
    }

    return root;
  }

  function closeGate(result = true) {
    const root = document.querySelector('#dni-mail-gate');
    if (!root || root.hidden) return;
    root.hidden = true;
    root.dataset.alertKind = 'error';
    root.dataset.dismissible = 'true';
    document.documentElement.classList.remove('dni-mail-gate-open');

    const resolver = root.__dniAlertResolve;
    root.__dniAlertResolve = null;
    if (typeof resolver === 'function') resolver(Boolean(result));

    const target = root.__dniRestoreFocus;
    root.__dniRestoreFocus = null;
    if (target instanceof HTMLElement && target.isConnected) {
      target.focus({ preventScroll: true });
    }
  }

  function showModal({
    kind = 'error',
    title = 'DNI ERROR',
    message = 'This action is not available right now.',
    login = false,
    loginUrl = LOGIN_URL,
    trigger = null,
    dismissible = true,
    buttonText = '',
    awaitResult = false
  } = {}) {
    const root = ensureGate();
    const alertKind = normalizeKind(kind);

    if (typeof root.__dniAlertResolve === 'function') {
      root.__dniAlertResolve(false);
      root.__dniAlertResolve = null;
    }

    root.__dniRestoreFocus = trigger instanceof HTMLElement
      ? trigger
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    root.dataset.mode = 'error';
    root.dataset.alertKind = alertKind;
    root.dataset.dismissible = dismissible ? 'true' : 'false';

    const labelNode = root.querySelector('[data-dni-alert-label]');
    const titleNode = root.querySelector('[data-mail-error-title]');
    const copyNode = root.querySelector('[data-mail-error-copy]');
    const loginButton = root.querySelector('[data-mail-error-login]');
    const dismissButton = root.querySelector('[data-mail-error-ok]');

    if (labelNode) labelNode.textContent = ALERT_LABELS[alertKind];
    if (titleNode) titleNode.textContent = String(title);
    if (copyNode) copyNode.textContent = String(message);
    if (loginButton) {
      loginButton.href = String(loginUrl || LOGIN_URL);
      loginButton.hidden = !login;
      loginButton.textContent = 'LOGIN WITH DISCORD';
    }
    if (dismissButton) dismissButton.textContent = buttonText || (login ? 'CANCEL' : 'OK');

    root.hidden = false;
    document.documentElement.classList.add('dni-mail-gate-open');
    requestAnimationFrame(() => {
      const focusTarget = login ? loginButton : dismissButton;
      focusTarget?.focus({ preventScroll: true });
    });

    if (!awaitResult) return undefined;
    return new Promise(resolve => {
      root.__dniAlertResolve = resolve;
    });
  }

  function showAlert(message, options = {}) {
    return showModal({
      kind: options.kind || 'attention',
      title: options.title || 'DNI SYSTEM ATTENTION',
      message: String(message ?? ''),
      trigger: options.trigger || null,
      dismissible: options.dismissible !== false,
      buttonText: options.buttonText || 'OK',
      awaitResult: true
    });
  }

  function terminalReady() {
    return Boolean(prompt?.classList.contains('dni-terminal-ready') && input && !input.disabled);
  }

  function authState() {
    return String(document.documentElement.dataset.dniAuth || 'pending').toLowerCase();
  }

  function mailBlock(trigger) {
    if (!terminalReady()) {
      return {
        kind: 'error',
        title: 'DNI MAIL LOCKED',
        message: 'DNI Mail is unavailable while this terminal is still starting.\nWait until the terminal reaches READY before opening DNI Mail.',
        trigger
      };
    }

    const state = authState();
    if (state === 'authenticated') return null;
    if (state === 'guest') {
      return {
        kind: 'error',
        title: 'DNI MAIL LOCKED',
        message: 'Discord authentication is required to access DNI Mail.',
        login: true,
        loginUrl: LOGIN_URL,
        trigger
      };
    }

    return {
      kind: 'attention',
      title: 'DNI MAIL LOCKED',
      message: 'Your DNI authorization check is still in progress.\nPlease try again in a moment.',
      trigger
    };
  }

  installMailUxStyles();
  ensureGate();

  const nativeAlert = window.alert.bind(window);
  const alertsApi = Object.freeze({
    show: showModal,
    close: closeGate,
    alert: showAlert,
    error: (message, options = {}) => showAlert(message, { ...options, kind: 'error', title: options.title || 'DNI SYSTEM ERROR' }),
    attention: (message, options = {}) => showAlert(message, { ...options, kind: 'attention', title: options.title || 'DNI SYSTEM ATTENTION' }),
    info: (message, options = {}) => showAlert(message, { ...options, kind: 'info', title: options.title || 'DNI SYSTEM INFO' }),
    success: (message, options = {}) => showAlert(message, { ...options, kind: 'success', title: options.title || 'DNI SYSTEM CONFIRMED' }),
    nativeAlert
  });

  window.DNIAlerts = alertsApi;
  window.DNIErrorModal = Object.freeze({
    show: options => showModal({ kind: 'error', ...(options || {}) }),
    close: closeGate
  });

  // Route native informational alerts through the DNI template. Existing code
  // normally returns immediately after alert(), so preserving the native void
  // return keeps those call sites compatible without browser-default popups.
  window.alert = message => {
    void showAlert(message, { kind: 'attention' });
  };

  // This bootstrap loads before the terminal session guard. Blocking here keeps
  // startup/auth errors out of terminal history while reusing the shared alert UX.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('#terminal-add, #terminal-inbox') : null;
    if (!target) return;

    if (target.id === 'terminal-add' && !terminalReady()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showModal({
        kind: 'error',
        title: 'NEW TERMINAL LOCKED',
        message: 'Current terminal is still starting.\nWait until this terminal reaches READY before opening another terminal.',
        trigger: target
      });
      return;
    }

    if (target.id === 'terminal-inbox') {
      const block = mailBlock(target);
      if (!block) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showModal(block);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.target !== input) return;
    const value = String(input?.value || '').trim();
    if (!/^(?:mail|inbox)(?:\s|$)/i.test(value)) return;
    const block = mailBlock(input);
    if (!block) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (input) input.value = '';
    showModal(block);
  }, true);
}
