(() => {
  const script = document.currentScript;
  const route = script?.dataset?.dniAuthRoute || '';
  if (!['login', 'callback'].includes(route)) return;

  const params = new URLSearchParams(window.location.search);
  params.set('dni_auth_route', route);

  if (route === 'login') {
    window.location.replace(`/auth/index.php?${params.toString()}`);
    return;
  }

  const root = document.querySelector('[data-dni-auth-result]');
  if (!root) {
    window.location.replace(`/auth/index.php?${params.toString()}`);
    return;
  }

  const title = root.querySelector('[data-dni-auth-title]');
  const label = root.querySelector('[data-dni-auth-label]');
  const icon = root.querySelector('[data-dni-auth-icon]');
  const message = root.querySelector('[data-dni-auth-message]');
  const meta = root.querySelector('[data-dni-auth-meta]');
  const continueLink = root.querySelector('[data-dni-auth-continue]');
  const retryLink = root.querySelector('[data-dni-auth-retry]');
  const terminalLink = root.querySelector('[data-dni-auth-terminal]');

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
    root.dataset.state = state;
    document.body.dataset.dniAuthResolved = state;
    if (label) label.textContent = config.label || 'DNI AUTHORIZATION';
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

    if (state !== 'working') {
      root.classList.remove('dni-auth-result-pop');
      void root.offsetWidth;
      root.classList.add('dni-auth-result-pop');
      root.focus?.({ preventScroll: true });
    }
  }

  async function completeAuthorization() {
    render('working', {
      label: 'VERIFYING DISCORD AUTHORIZATION',
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
          label: 'ACCESS GRANTED',
          title: 'DISCORD AUTHORIZATION SUCCESS',
          icon: '✓',
          message: 'Discord identity verified. Guild membership confirmed and at least one assigned DNI role was validated.\nYour secure terminal session is now active.',
          meta: 'GUILD VERIFIED // DNI ROLE VERIFIED // SESSION ESTABLISHED',
          continuePath: next,
          terminal: true
        });

        // Guarantee the SUCCESS result is painted and remains visible before the
        // authenticated dashboard transition. Do not silently skip this state.
        await paint();
        await delay(3500);
        window.location.replace(next);
        return;
      }

      let payload = {};
      const contentType = String(response.headers.get('content-type') || '');
      if (contentType.includes('application/json')) payload = await response.json().catch(() => ({}));

      const denied = response.status === 401 || response.status === 403;
      const detail = String(payload.error || payload.detail || '').trim();
      const reason = String(payload.reason || '').trim();
      let deniedMeta = `HTTP ${response.status || 'ERROR'} // NO TERMINAL SESSION GRANTED`;
      if (reason === 'guild_membership_required') deniedMeta = 'GUILD CHECK FAILED // NO TERMINAL SESSION GRANTED';
      if (reason === 'dni_role_required') deniedMeta = 'DNI ROLE CHECK FAILED // NO TERMINAL SESSION GRANTED';

      render(denied ? 'denied' : 'error', {
        label: denied ? 'ACCESS DENIED' : 'AUTHORIZATION ERROR',
        title: denied ? 'DISCORD AUTHORIZATION DENIED' : 'DNI LOGIN FAILED',
        icon: denied ? '×' : '!',
        message: denied
          ? (detail || 'Discord access was denied. The account must be in the Dreadnought Imperium guild and have at least one assigned DNI role.')
          : (detail || 'The DNI authentication service could not complete this sign-in request.'),
        meta: denied ? deniedMeta : `HTTP ${response.status || 'ERROR'} // AUTHORIZATION SERVICE FAILURE`,
        retry: true,
        terminal: true
      });
      await paint();
      // ACCESS DENIED/ERROR intentionally stays on screen until the user chooses
      // Retry or Return to Terminal. It never redirects to /dashboard.
    } catch (error) {
      render('error', {
        label: 'AUTHORIZATION ERROR',
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

  void completeAuthorization();
})();
