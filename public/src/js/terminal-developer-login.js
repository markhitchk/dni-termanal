const commandInput = document.querySelector('#command-input');
const terminalWindow = document.querySelector('#terminal-window');

if (commandInput && !window.__dniDeveloperLoginModalInstalled) {
  window.__dniDeveloperLoginModalInstalled = true;

  const ENDPOINT = '/dev/termanal/modal-login.php';
  const SESSION_ENDPOINT = '/api/dni/session';
  const DISCORD_LOGIN = '/auth/discord/login?next=/terminal';

  function installStyles() {
    if (document.querySelector('#dni-developer-login-style')) return;
    const style = document.createElement('style');
    style.id = 'dni-developer-login-style';
    style.textContent = `
      #dni-developer-login-gate[hidden]{display:none!important}
      #dni-developer-login-gate .dni-dev-login-dialog{width:min(580px,calc(100vw - 28px))}
      #dni-developer-login-gate .dni-dev-login-copy{margin:0 0 18px;color:#aaa;line-height:1.55}
      #dni-developer-login-gate .dni-dev-login-form{display:grid;gap:14px}
      #dni-developer-login-gate .dni-dev-login-field{display:grid;gap:6px}
      #dni-developer-login-gate .dni-dev-login-field span{color:#8c8c8c;font:700 9px/1.2 "Courier New",ui-monospace,monospace;letter-spacing:1.25px}
      #dni-developer-login-gate .dni-dev-login-field input{width:100%;min-height:44px;border:1px solid #444;background:#050606;color:#f3f3f3;padding:10px 12px;outline:none;font:700 13px/1.2 "Courier New",ui-monospace,monospace;letter-spacing:.7px;box-shadow:0 0 0 1px #111 inset}
      #dni-developer-login-gate .dni-dev-login-field input:focus{border-color:#c8a866;box-shadow:0 0 0 1px rgba(200,168,102,.22),0 0 18px rgba(200,168,102,.08)}
      #dni-developer-login-gate .dni-dev-login-status{min-height:18px;margin-top:12px;color:#9b9b9b;font:700 10px/1.45 "Courier New",ui-monospace,monospace;letter-spacing:.55px}
      #dni-developer-login-gate .dni-dev-login-status[data-state="error"]{color:#ef7777}
      #dni-developer-login-gate .dni-dev-login-status[data-state="ok"]{color:#86d7a6}
      #dni-developer-login-gate .dni-dev-login-status[data-state="working"]{color:#d7bd7b}
      #dni-developer-login-gate .dni-dev-login-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}
      #dni-developer-login-gate .dni-dev-login-actions .dni-alert-btn{min-width:118px}
      #dni-developer-login-gate [data-dev-support-stop][hidden]{display:none!important}
      @media(max-width:560px){
        #dni-developer-login-gate .dni-dev-login-actions{display:grid;grid-template-columns:1fr}
        #dni-developer-login-gate .dni-dev-login-actions .dni-alert-btn{width:100%}
      }
    `;
    document.head.append(style);
  }

  function ensureModal() {
    let root = document.querySelector('#dni-developer-login-gate');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'dni-developer-login-gate';
    root.className = 'dni-mail-gate dni-alert';
    root.hidden = true;
    root.innerHTML = `
      <div class="dni-mail-gate-backdrop dni-alert-backdrop" data-dev-login-backdrop aria-hidden="true"></div>
      <section class="dni-mail-error-dialog dni-alert-dialog dni-dev-login-dialog" data-type="secure" role="dialog" aria-modal="true" aria-labelledby="dni-dev-login-title">
        <header class="dni-alert-hazard">
          <span class="dni-alert-classification" data-label="DEVELOPER SUPPORT">DEVELOPER SUPPORT</span>
        </header>
        <div class="dni-mail-error-banner dni-alert-titleband">
          <span class="dni-alert-band-scan" aria-hidden="true"></span>
          <span class="dni-mail-error-icon dni-alert-icon" aria-hidden="true"><i>⌁</i></span>
          <h2 class="dni-alert-title" id="dni-dev-login-title">DNI SUPPORT LOGIN</h2>
          <span class="dni-alert-corner dni-alert-corner-a" aria-hidden="true"></span>
          <span class="dni-alert-corner dni-alert-corner-b" aria-hidden="true"></span>
        </div>
        <div class="dni-mail-error-body dni-alert-body">
          <span class="dni-alert-body-scan" aria-hidden="true"></span>
          <p class="dni-dev-login-copy">Use your authenticated developer/admin session to enter a live support session for an existing DNI user. The target user does not need to sign in with Discord.</p>
          <form class="dni-dev-login-form" data-dev-login-form autocomplete="off">
            <label class="dni-dev-login-field">
              <span>TARGET DISCORD USER ID</span>
              <input data-dev-discord-id inputmode="numeric" pattern="[0-9]*" maxlength="22" autocomplete="off" aria-label="Target Discord User ID" required>
            </label>
            <label class="dni-dev-login-field">
              <span>DEVELOPER PIN</span>
              <input data-dev-pin type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="Developer PIN" required>
            </label>
          </form>
          <div class="dni-dev-login-status" data-dev-login-status>SUPPORT SESSION CHECK // READY</div>
          <div class="dni-alert-meta">LIVE USER CONTEXT // DEVELOPER ACTOR RETAINED FOR SUPPORT CONTROL</div>
        </div>
        <footer class="dni-mail-error-actions dni-alert-actions dni-dev-login-actions">
          <button class="dni-alert-btn" data-dev-support-stop type="button" hidden>END SUPPORT SESSION</button>
          <button class="dni-alert-btn primary" data-dev-login-submit type="button">LOGIN AS USER</button>
          <button class="dni-alert-btn" data-dev-login-cancel type="button">CANCEL</button>
        </footer>
      </section>`;
    document.body.append(root);

    const form = root.querySelector('[data-dev-login-form]');
    const submit = root.querySelector('[data-dev-login-submit]');
    const cancel = root.querySelector('[data-dev-login-cancel]');
    const stop = root.querySelector('[data-dev-support-stop]');
    const backdrop = root.querySelector('[data-dev-login-backdrop]');

    form?.addEventListener('submit', event => {
      event.preventDefault();
      void submitLogin();
    });
    submit?.addEventListener('click', () => void submitLogin());
    cancel?.addEventListener('click', closeModal);
    stop?.addEventListener('click', () => void stopSupport());
    backdrop?.addEventListener('click', closeModal);

    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        void submitLogin();
      }
    });

    return root;
  }

  function setStatus(text, state = '') {
    const status = ensureModal().querySelector('[data-dev-login-status]');
    if (!status) return;
    status.textContent = text;
    status.dataset.state = state;
  }

  function setBusy(busy) {
    const root = ensureModal();
    for (const control of root.querySelectorAll('input,button')) control.disabled = Boolean(busy);
    root.dataset.busy = busy ? 'true' : 'false';
  }

  function closeModal() {
    const root = ensureModal();
    root.hidden = true;
    document.documentElement.classList.remove('dni-mail-gate-open');
    document.documentElement.style.overflow = '';
    const pin = root.querySelector('[data-dev-pin]');
    if (pin) pin.value = '';
    setBusy(false);
    commandInput.focus({ preventScroll: true });
  }

  async function fetchSession() {
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

  async function postSupport(action, extra = {}) {
    const session = await fetchSession();
    if (!session.authenticated) {
      const error = new Error('Developer authentication required.');
      error.loginUrl = DISCORD_LOGIN;
      error.authRequired = true;
      throw error;
    }

    const csrf = String(session.csrfToken || '');
    if (!csrf) throw new Error('Authenticated DNI session is missing its security token.');

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-DNI-CSRF': csrf
      },
      body: JSON.stringify({ action, ...extra })
    });
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      throw new Error(`Support Login returned invalid data (HTTP ${response.status}).`);
    }
    if (!response.ok || payload.ok !== true) {
      const error = new Error(payload.error || `Support Login failed (HTTP ${response.status}).`);
      error.payload = payload;
      error.status = response.status;
      error.loginUrl = payload.loginUrl;
      throw error;
    }
    return payload;
  }

  async function openModal() {
    const root = ensureModal();
    root.hidden = false;
    document.documentElement.classList.add('dni-mail-gate-open');
    document.documentElement.style.overflow = 'hidden';
    setBusy(false);
    setStatus('VERIFYING DEVELOPER SUPPORT SESSION...', 'working');

    const discordField = root.querySelector('[data-dev-discord-id]');
    const pinField = root.querySelector('[data-dev-pin]');
    const stopButton = root.querySelector('[data-dev-support-stop]');
    if (pinField) pinField.value = '';
    if (stopButton) stopButton.hidden = true;

    try {
      const session = await fetchSession();
      if (!session.authenticated) {
        if (discordField) discordField.value = '';
        setStatus('DEVELOPER AUTHENTICATION REQUIRED // SIGN IN WITH YOUR ADMIN DISCORD ACCOUNT', 'error');
        discordField?.focus({ preventScroll: true });
        return;
      }

      const state = await postSupport('status');
      if (state.supportActive) {
        if (discordField) discordField.value = String(state.target?.discordId || '');
        if (stopButton) stopButton.hidden = false;
        setStatus(`LIVE SUPPORT SESSION // ${state.actor?.name || 'DEVELOPER'} → ${state.target?.name || 'USER'}`, 'ok');
      } else {
        if (discordField) discordField.value = '';
        setStatus(`DEVELOPER VERIFIED // ${state.actor?.name || 'AUTHORIZED ADMIN'} // ENTER TARGET USER`, 'ok');
      }
      pinField?.focus({ preventScroll: true });
    } catch (error) {
      const message = String(error?.message || error);
      setStatus(message.toUpperCase(), 'error');
      discordField?.focus({ preventScroll: true });
    }
  }

  async function submitLogin() {
    const root = ensureModal();
    if (root.dataset.busy === 'true') return;

    const discordField = root.querySelector('[data-dev-discord-id]');
    const pinField = root.querySelector('[data-dev-pin]');
    const discordId = String(discordField?.value || '').trim();
    const pin = String(pinField?.value || '').trim();

    if (!/^\d{15,22}$/.test(discordId)) {
      setStatus('ENTER A VALID TARGET DISCORD USER ID', 'error');
      discordField?.focus({ preventScroll: true });
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setStatus('ENTER THE 4-DIGIT DEVELOPER PIN', 'error');
      pinField?.focus({ preventScroll: true });
      return;
    }

    setBusy(true);
    setStatus('STARTING LIVE SUPPORT USER SESSION...', 'working');

    try {
      const payload = await postSupport('start', { discordId, pin });
      setStatus(`LIVE SUPPORT ACTIVE // ${payload.actor?.name || 'DEVELOPER'} → ${payload.target?.name || 'USER'}`, 'ok');
      if (pinField) pinField.value = '';
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      if (error?.authRequired || error?.status === 401) {
        setStatus('DEVELOPER AUTHENTICATION REQUIRED // REDIRECTING TO DISCORD...', 'error');
        window.setTimeout(() => window.location.assign(error?.loginUrl || DISCORD_LOGIN), 350);
        return;
      }

      const remaining = Number(error?.payload?.remainingAttempts);
      const retryAfter = Number(error?.payload?.retryAfter);
      let message = String(error?.message || error);
      if (Number.isFinite(remaining)) message += ` // ${remaining} ATTEMPT(S) LEFT`;
      if (Number.isFinite(retryAfter) && retryAfter > 0) message += ` // LOCKED ${Math.ceil(retryAfter / 60)} MIN`;
      setStatus(message.toUpperCase(), 'error');
      if (pinField) {
        pinField.value = '';
        pinField.focus({ preventScroll: true });
      }
      setBusy(false);
    }
  }

  async function stopSupport() {
    const root = ensureModal();
    if (root.dataset.busy === 'true') return;
    setBusy(true);
    setStatus('ENDING LIVE SUPPORT SESSION...', 'working');

    try {
      const payload = await postSupport('stop');
      setStatus(`SUPPORT SESSION ENDED // RESTORED ${payload.restoredUser?.name || 'DEVELOPER'}`, 'ok');
      window.setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      setStatus(String(error?.message || error).toUpperCase(), 'error');
      setBusy(false);
    }
  }

  installStyles();
  ensureModal();

  window.DNIDeveloperLogin = Object.freeze({
    show: openModal,
    close: closeModal,
    stopSupport
  });

  if (terminalWindow) terminalWindow.dataset.developerSupportReady = 'true';
}
