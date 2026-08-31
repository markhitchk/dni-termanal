const input = document.querySelector('#command-input');
const prompt = document.querySelector('.terminal-prompt');

if (!window.__dniTerminalErrorModalInstalled) {
  window.__dniTerminalErrorModalInstalled = true;

  const LOGIN_URL = '/auth/discord/login';
  const TYPE_ALIASES = Object.freeze({ info: 'notice', confirmed: 'success' });
  const PRESETS = Object.freeze({
    error: Object.freeze({
      label: 'ERROR',
      title: 'AUTHENTICATION REQUIRED',
      message: 'Discord authentication is required to continue.',
      meta: 'DNI AUTHORIZATION GATE // USER ACTION REQUIRED',
      icon: '!'
    }),
    attention: Object.freeze({
      label: 'ATTENTION',
      title: 'SYSTEM ATTENTION',
      message: 'This operation requires your attention before continuing.',
      meta: 'DNI SYSTEM // USER ATTENTION REQUIRED',
      icon: '!'
    }),
    denied: Object.freeze({
      label: 'ACCESS DENIED',
      title: 'INSUFFICIENT CLEARANCE',
      message: 'Your current DNI clearance does not authorize access to this resource.',
      meta: 'CLEARANCE CONTROL // REQUEST BLOCKED',
      icon: '×'
    }),
    notice: Object.freeze({
      label: 'SYSTEM NOTICE',
      title: 'DNI SYSTEM NOTICE',
      message: 'A DNI system notice has been issued.',
      meta: 'DNI SYSTEM // INFORMATION',
      icon: 'i'
    }),
    secure: Object.freeze({
      label: 'SECURE NOTICE',
      title: 'SECURE CHANNEL ACTIVE',
      message: 'This session is operating on a clearance-controlled DNI channel.',
      meta: 'SECURITY STATE // CONTROLLED SESSION',
      icon: '!'
    }),
    success: Object.freeze({
      label: 'SUCCESS',
      title: 'OPERATION COMPLETE',
      message: 'The requested DNI operation completed successfully.',
      meta: 'SYSTEM RESPONSE // COMPLETE',
      icon: '✓'
    })
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

  function normalizeType(type) {
    const raw = String(type || 'error').toLowerCase();
    const normalized = TYPE_ALIASES[raw] || raw;
    return Object.prototype.hasOwnProperty.call(PRESETS, normalized) ? normalized : 'notice';
  }

  function ensureGate() {
    let root = document.querySelector('#dni-mail-gate');
    if (!root) {
      root = document.createElement('div');
      root.id = 'dni-mail-gate';
      root.className = 'dni-mail-gate dni-alert';
      root.hidden = true;
      root.dataset.mode = 'error';
      root.dataset.dismissible = 'true';
      root.innerHTML = `
        <div class="dni-mail-gate-backdrop dni-alert-backdrop" data-mail-gate-backdrop aria-hidden="true"></div>

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

        <section class="dni-mail-error-dialog dni-alert-dialog" data-mail-error data-type="error" role="alertdialog" aria-modal="true" aria-labelledby="dni-mail-error-title" aria-describedby="dni-mail-error-copy">
          <header class="dni-alert-hazard">
            <span class="dni-alert-classification" data-dni-alert-label data-label="ERROR">ERROR</span>
          </header>

          <div class="dni-mail-error-banner dni-alert-titleband">
            <span class="dni-alert-band-scan" aria-hidden="true"></span>
            <span class="dni-mail-error-icon dni-alert-icon" aria-hidden="true"><i data-dni-alert-icon>!</i></span>
            <h2 class="dni-alert-title" id="dni-mail-error-title" data-mail-error-title>DNI ERROR</h2>
            <span class="dni-alert-corner dni-alert-corner-a" aria-hidden="true"></span>
            <span class="dni-alert-corner dni-alert-corner-b" aria-hidden="true"></span>
          </div>

          <div class="dni-mail-error-body dni-alert-body">
            <span class="dni-alert-body-scan" aria-hidden="true"></span>
            <p class="dni-alert-copy" id="dni-mail-error-copy" data-mail-error-copy></p>
            <div class="dni-alert-meta" data-dni-alert-meta>DNI SYSTEM // ALERT</div>
          </div>

          <footer class="dni-mail-error-actions dni-alert-actions" data-dni-alert-actions>
            <a class="dni-mail-error-login dni-alert-btn primary" data-mail-error-login data-dni-discord-login-direct href="${LOGIN_URL}" hidden>LOGIN WITH DISCORD</a>
            <button class="dni-mail-error-ok dni-alert-btn" data-mail-error-ok type="button">OK</button>
          </footer>
        </section>`;
      document.body.append(root);
    } else {
      root.classList.add('dni-alert');
      root.querySelector('[data-mail-gate-backdrop]')?.classList.add('dni-alert-backdrop');
      root.querySelector('[data-mail-error]')?.classList.add('dni-alert-dialog');
    }

    if (root.dataset.dniSharedErrorBound !== 'true') {
      root.dataset.dniSharedErrorBound = 'true';
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || root.hidden || root.dataset.mode !== 'error' || root.dataset.dismissible === 'false') return;
        event.preventDefault();
        closeGate(false);
      });
      root.addEventListener('click', event => {
        const control = event.target instanceof Element ? event.target.closest('[data-dni-alert-action]') : null;
        if (!control || !root.contains(control)) return;
        const action = control.dataset.dniAlertAction || '';
        if (action === 'close') {
          event.preventDefault();
          closeGate(control.dataset.dniAlertResult !== 'false');
        }
      });
    }

    return root;
  }

  function restoreDefaultActions(root, { login = false, loginUrl = LOGIN_URL, buttonText = '', dismissible = true } = {}) {
    const actions = root.querySelector('[data-dni-alert-actions]');
    if (!actions) return;
    actions.replaceChildren();

    if (login) {
      const loginButton = document.createElement('a');
      loginButton.className = 'dni-mail-error-login dni-alert-btn primary';
      loginButton.dataset.mailErrorLogin = '';
      loginButton.dataset.dniDiscordLoginDirect = '';
      loginButton.href = String(loginUrl || LOGIN_URL);
      loginButton.textContent = 'LOGIN WITH DISCORD';
      actions.append(loginButton);
    }

    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'dni-mail-error-ok dni-alert-btn';
    dismissButton.dataset.mailErrorOk = '';
    dismissButton.dataset.dniAlertAction = 'close';
    dismissButton.dataset.dniAlertResult = 'true';
    dismissButton.textContent = buttonText || (login ? 'CANCEL' : 'OK');
    if (!dismissible) dismissButton.hidden = true;
    actions.append(dismissButton);
  }

  function makeActionButton(config = {}) {
    const isLink = Boolean(config.href);
    const control = document.createElement(isLink ? 'a' : 'button');
    if (isLink) control.href = String(config.href);
    else control.type = 'button';
    control.className = 'dni-alert-btn' + (config.variant ? ` ${config.variant}` : '');
    control.textContent = config.label || 'OK';

    if (config.disabled) {
      if (!isLink) control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
      control.addEventListener('click', event => event.preventDefault());
      return control;
    }

    if (config.action === 'close') {
      control.dataset.dniAlertAction = 'close';
      control.dataset.dniAlertResult = config.result === false ? 'false' : 'true';
    }
    if (typeof config.onClick === 'function') control.addEventListener('click', config.onClick);
    return control;
  }

  function renderAlert(root, options = {}) {
    const type = normalizeType(options.type || options.kind || 'notice');
    const preset = PRESETS[type];
    const label = String(options.label ?? preset.label);
    const title = String(options.title ?? preset.title);
    const message = String(options.message ?? preset.message);
    const meta = String(options.meta ?? preset.meta ?? '');
    const icon = String(options.icon ?? preset.icon);

    root.dataset.mode = 'error';
    root.dataset.dismissible = options.dismissible === false ? 'false' : 'true';
    const dialog = root.querySelector('[data-mail-error]');
    const classification = root.querySelector('[data-dni-alert-label]');
    const titleNode = root.querySelector('[data-mail-error-title]');
    const copyNode = root.querySelector('[data-mail-error-copy]');
    const metaNode = root.querySelector('[data-dni-alert-meta]');
    const iconNode = root.querySelector('[data-dni-alert-icon]');

    if (dialog) dialog.dataset.type = type;
    if (classification) {
      classification.textContent = label;
      classification.dataset.label = label;
    }
    if (titleNode) titleNode.textContent = title;
    if (copyNode) copyNode.textContent = message;
    if (metaNode) {
      metaNode.textContent = meta;
      metaNode.hidden = !meta;
    }
    if (iconNode) iconNode.textContent = icon;

    return { type, preset };
  }

  function closeGate(result = true) {
    const root = document.querySelector('#dni-mail-gate');
    if (!root || root.hidden) return;
    root.hidden = true;
    root.dataset.dismissible = 'true';
    document.documentElement.classList.remove('dni-mail-gate-open');
    document.documentElement.style.overflow = '';

    const resolver = root.__dniAlertResolve;
    root.__dniAlertResolve = null;
    if (typeof resolver === 'function') resolver(Boolean(result));

    const target = root.__dniRestoreFocus;
    root.__dniRestoreFocus = null;
    restoreDefaultActions(root);
    if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
  }

  function showModal({
    kind = 'error',
    type = '',
    label,
    title,
    message,
    meta,
    icon,
    actions,
    login = false,
    loginUrl = LOGIN_URL,
    trigger = null,
    dismissible = true,
    buttonText = '',
    awaitResult = false
  } = {}) {
    const root = ensureGate();

    if (typeof root.__dniAlertResolve === 'function') {
      root.__dniAlertResolve(false);
      root.__dniAlertResolve = null;
    }

    root.__dniRestoreFocus = trigger instanceof HTMLElement
      ? trigger
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    renderAlert(root, { type: type || kind, label, title, message, meta, icon, dismissible });

    const actionsNode = root.querySelector('[data-dni-alert-actions]');
    if (actionsNode && Array.isArray(actions)) {
      actionsNode.replaceChildren(...actions.map(makeActionButton));
    } else {
      restoreDefaultActions(root, { login, loginUrl, buttonText, dismissible });
    }

    root.hidden = false;
    document.documentElement.classList.add('dni-mail-gate-open');
    document.documentElement.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      const focusTarget = root.querySelector('.dni-alert-btn:not([disabled]):not([aria-disabled="true"])');
      focusTarget?.focus({ preventScroll: true });
    });

    if (!awaitResult) return undefined;
    return new Promise(resolve => {
      root.__dniAlertResolve = resolve;
    });
  }

  function showAlert(message, options = {}) {
    return showModal({
      type: options.type || options.kind || 'attention',
      label: options.label,
      title: options.title,
      message: String(message ?? ''),
      meta: options.meta,
      icon: options.icon,
      actions: options.actions,
      login: options.login === true,
      loginUrl: options.loginUrl || LOGIN_URL,
      trigger: options.trigger || null,
      dismissible: options.dismissible !== false,
      buttonText: options.buttonText || 'OK',
      awaitResult: options.awaitResult !== false
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
        type: 'error',
        title: 'DNI MAIL LOCKED',
        message: 'DNI Mail is unavailable while this terminal is still starting.\nWait until the terminal reaches READY before opening DNI Mail.',
        meta: 'DNI MAIL INTERLOCK // TERMINAL NOT READY',
        trigger
      };
    }

    const state = authState();
    if (state === 'authenticated') return null;
    if (state === 'guest') {
      return {
        type: 'error',
        title: 'DNI MAIL LOCKED',
        message: 'Discord authentication is required to access DNI Mail.',
        meta: 'DNI AUTHORIZATION GATE // USER ACTION REQUIRED',
        login: true,
        loginUrl: LOGIN_URL,
        trigger
      };
    }

    return {
      type: 'attention',
      title: 'DNI MAIL LOCKED',
      message: 'Your DNI authorization check is still in progress.\nPlease try again in a moment.',
      meta: 'DNI AUTHORIZATION CHECK // PENDING',
      trigger
    };
  }

  installMailUxStyles();
  ensureGate();

  const nativeAlert = window.alert.bind(window);
  const alertsApi = Object.freeze({
    show: showModal,
    close: closeGate,
    hide: closeGate,
    alert: showAlert,
    error: (message, options = {}) => showAlert(message, { ...options, type: 'error', title: options.title || 'DNI SYSTEM ERROR' }),
    attention: (message, options = {}) => showAlert(message, { ...options, type: 'attention', title: options.title || 'DNI SYSTEM ATTENTION' }),
    denied: (message, options = {}) => showAlert(message, { ...options, type: 'denied', title: options.title || 'ACCESS DENIED' }),
    notice: (message, options = {}) => showAlert(message, { ...options, type: 'notice', title: options.title || 'DNI SYSTEM NOTICE' }),
    info: (message, options = {}) => showAlert(message, { ...options, type: 'notice', title: options.title || 'DNI SYSTEM NOTICE' }),
    secure: (message, options = {}) => showAlert(message, { ...options, type: 'secure', title: options.title || 'SECURE NOTICE' }),
    success: (message, options = {}) => showAlert(message, { ...options, type: 'success', title: options.title || 'OPERATION COMPLETE' }),
    presets: PRESETS,
    nativeAlert
  });

  window.DNIAlerts = alertsApi;
  window.DNIAlert = Object.freeze({
    show: options => showModal({ ...(options || {}), awaitResult: false }),
    hide: closeGate,
    presets: PRESETS
  });
  window.DNIErrorModal = Object.freeze({
    show: options => showModal({ type: 'error', ...(options || {}) }),
    close: closeGate
  });

  window.alert = message => {
    void showAlert(message, { type: 'attention', awaitResult: false });
  };

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('#terminal-add, #terminal-inbox') : null;
    if (!target) return;

    if (target.id === 'terminal-add' && !terminalReady()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showModal({
        type: 'error',
        title: 'NEW TERMINAL LOCKED',
        message: 'Current terminal is still starting.\nWait until this terminal reaches READY before opening another terminal.',
        meta: 'TERMINAL STARTUP INTERLOCK // REQUEST BLOCKED',
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
