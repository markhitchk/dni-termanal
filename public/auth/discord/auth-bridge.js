(() => {
  const script = document.currentScript;
  const route = script?.dataset?.dniAuthRoute || '';
  if (!['login', 'callback'].includes(route)) return;

  const params = new URLSearchParams(window.location.search);
  params.set('dni_auth_route', route);

  const root = document.querySelector('[data-dni-auth-result]');
  const title = root?.querySelector('[data-dni-auth-title]');
  const label = root?.querySelector('[data-dni-auth-label]');
  const icon = root?.querySelector('[data-dni-auth-icon]');
  const message = root?.querySelector('[data-dni-auth-message]');
  const meta = root?.querySelector('[data-dni-auth-meta]');
  const continueLink = root?.querySelector('[data-dni-auth-continue]');
  const retryLink = root?.querySelector('[data-dni-auth-retry]');
  const terminalLink = root?.querySelector('[data-dni-auth-terminal]');

  const stateTheme = {
    working: { type: 'secure', label: 'SECURE NOTICE' },
    success: { type: 'success', label: 'SUCCESS' },
    denied: { type: 'denied', label: 'ACCESS DENIED' },
    error: { type: 'error', label: 'ERROR' }
  };

  const localPath = value => {
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) return '/dashboard';
      return `${url.pathname}${url.search}${url.hash}` || '/dashboard';
    } catch (_) {
      return '/dashboard';
    }
  };

  const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  function render(state, config = {}) {
    if (!root) return;

    const theme = stateTheme[state] || stateTheme.error;
    root.dataset.state = state;
    root.dataset.type = config.type || theme.type;
    document.body.dataset.dniAuthResolved = state;

    const classification = config.label || theme.label;
    if (label) {
      label.textContent = classification;
      label.dataset.label = classification;
    }
    if (title) title.textContent = config.title || 'AUTHORIZATION STATUS';
    if (message) message.textContent = config.message || 'Authorization status is unavailable.';
    if (meta) meta.textContent = config.meta || 'DNI SECURITY GATEWAY';
    if (icon) icon.textContent = config.icon || '!';

    if (continueLink) {
      continueLink.hidden = !config.continuePath;
      if (config.continuePath) continueLink.href = localPath(config.continuePath);
    }
    if (retryLink) retryLink.hidden = !config.retry;
    if (terminalLink) terminalLink.hidden = !config.terminal;

    root.classList.remove('dni-auth-result-pop');
    void root.offsetWidth;
    root.classList.add('dni-auth-result-pop');

    if (state !== 'working') {
      root.focus?.({ preventScroll: true });
    }
  }

  async function openDiscordLogin() {
    if (root) {
      render('working', {
        title: 'OPENING DISCORD AUTHORIZATION',
        icon: '…',
        message: 'Connecting to Discord to begin the secure DNI sign-in process.',
        meta: 'DNI AUTHORIZATION GATEWAY // REDIRECTING TO DISCORD'
      });
      await paint();
    }
    window.location.replace(`/auth/index.php?${params.toString()}`);
  }

  async function completeAuthorization() {
    if (!root) {
      window.location.replace(`/auth/index.php?${params.toString()}`);
      return;
    }

    render('working', {
      title: 'AUTHORIZATION IN PROGRESS',
      icon: '…',
      message: 'Checking Discord identity, Dreadnought Imperium guild membership, and assigned DNI roles.',
      meta: 'STEP 1/2 // VERIFYING GUILD MEMBERSHIP AND ROLE ASSIGNMENT'
    });

    try {
      const response = await fetch(`/auth/index.php?${params.toString()}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'follow',
        headers: { Accept: 'application/json, text/html;q=0.9' }
      });

      if (response.ok && response.redirected) {
        const next = localPath(response.url || '/dashboard');
        render('success', {
          title: 'DISCORD AUTHORIZATION SUCCESS',
          icon: '✓',
          message: 'Discord identity verified. Guild membership confirmed and at least one assigned DNI role was validated.\nYour secure terminal session is now active.',
          meta: 'GUILD VERIFIED // DNI ROLE VERIFIED // SESSION ESTABLISHED',
          continuePath: next,
          terminal: true
        });

        await paint();
        await delay(3500);
        window.location.replace(next);
        return;
      }

      let payload = {};
      const contentType = String(response.headers.get('content-type') || '');
      if (contentType.includes('application/json')) {
        payload = await response.json().catch(() => ({}));
      }

      const denied = response.status === 401 || response.status === 403;
      const detail = String(payload.error || payload.detail || '').trim();
      const reason = String(payload.reason || '').trim();
      let deniedMeta = `HTTP ${response.status || 'ERROR'} // NO TERMINAL SESSION GRANTED`;

      if (reason === 'guild_membership_required') {
        deniedMeta = 'GUILD CHECK FAILED // NO TERMINAL SESSION GRANTED';
      }
      if (reason === 'dni_role_required') {
        deniedMeta = 'DNI ROLE CHECK FAILED // NO TERMINAL SESSION GRANTED';
      }

      render(denied ? 'denied' : 'error', {
        title: denied ? 'DISCORD AUTHORIZATION DENIED' : 'DNI LOGIN FAILED',
        icon: denied ? '×' : '!',
        message: denied
          ? (detail || 'Discord access was denied. The account must be in the Dreadnought Imperium guild and have at least one assigned DNI role.')
          : (detail || 'The DNI authentication service could not complete this sign-in request.'),
        meta: denied
          ? deniedMeta
          : `HTTP ${response.status || 'ERROR'} // AUTHORIZATION SERVICE FAILURE`,
        retry: true,
        terminal: true
      });

      await paint();
    } catch (error) {
      render('error', {
        title: 'DNI LOGIN FAILED',
        icon: '!',
        message: 'The DNI authorization gateway could not be reached. Check your connection and try Discord login again.',
        meta: 'AUTH SERVICE CONNECTION FAILURE',
        retry: true,
        terminal: true
      });
      await paint();
      console.error('DNI Discord callback bridge failed', error);
    }
  }

  if (route === 'login') {
    void openDiscordLogin();
    return;
  }

  void completeAuthorization();
})();
