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

  function authFailureCopy(response, payload = {}) {
    const reason = String(payload.reason || '').trim();
    const detail = String(payload.error || payload.detail || '').trim();
    const deniedRoleNames = Array.isArray(payload.deniedRoleNames)
      ? payload.deniedRoleNames.map(value => String(value || '').trim()).filter(Boolean)
      : [];

    if (reason === 'guild_membership_required') {
      return {
        state: 'denied',
        title: 'DNI SERVER MEMBERSHIP REQUIRED',
        message: detail || 'This Discord account could not be verified as a member of the Dreadnought Imperium server. Join the server, then try Discord login again.',
        meta: 'GUILD MEMBERSHIP CHECK FAILED // SESSION NOT CREATED'
      };
    }

    if (reason === 'dni_role_denied') {
      const detected = deniedRoleNames.length
        ? `\nDetected restricted role: ${deniedRoleNames.join(', ')}.`
        : '';
      return {
        state: 'denied',
        title: 'DNI TERMINAL ACCESS DENIED',
        message: `${detail || 'This Discord account has a role that is not eligible for DNI Terminal access.'}${detected}`,
        meta: 'ROLE POLICY DENIAL // SESSION NOT CREATED'
      };
    }

    if (reason === 'dni_role_required') {
      return {
        state: 'denied',
        title: 'DNI ROLE REQUIRED',
        message: detail || 'Your Discord account is in the DNI server, but no DNI role that grants Terminal access was found. Ask DNI staff to assign the correct role, then retry.',
        meta: 'AUTHORIZED DNI ROLE NOT FOUND // SESSION NOT CREATED'
      };
    }

    if (reason === 'oauth_authorization_cancelled') {
      return {
        state: 'denied',
        title: 'DISCORD AUTHORIZATION CANCELLED',
        message: detail || 'Discord authorization was cancelled or not completed. No DNI Terminal session was created. Use Retry Discord Login when you are ready.',
        meta: 'DISCORD AUTHORIZATION NOT COMPLETED // SESSION NOT CREATED'
      };
    }

    if (reason === 'oauth_session_expired') {
      return {
        state: 'denied',
        title: 'SECURE LOGIN EXPIRED',
        message: detail || 'The secure Discord sign-in session expired or could not be verified. Start Discord login again to create a new authorization session.',
        meta: 'OAUTH SESSION EXPIRED // NEW LOGIN REQUIRED'
      };
    }

    if (reason === 'oauth_callback_invalid') {
      return {
        state: 'error',
        title: 'DISCORD RESPONSE INVALID',
        message: detail || 'Discord returned an incomplete sign-in response. Start Discord login again.',
        meta: 'INVALID AUTHORIZATION RESPONSE // RETRY REQUIRED'
      };
    }

    if (reason === 'auth_service_unavailable') {
      return {
        state: 'error',
        title: 'AUTHENTICATION SERVICE UNAVAILABLE',
        message: detail || 'The DNI authentication service is temporarily unavailable. Your account was not denied; the authorization check could not be completed. Try again shortly.',
        meta: 'DNI AUTH SERVICE UNAVAILABLE // NO SESSION CHANGE'
      };
    }

    const denied = response.status === 401 || response.status === 403;
    return {
      state: denied ? 'denied' : 'error',
      title: denied ? 'DISCORD AUTHORIZATION DENIED' : 'DNI LOGIN FAILED',
      message: detail || (denied
        ? 'DNI could not authorize this Discord account for Terminal access. Verify your server membership and assigned DNI roles, then try again.'
        : 'The DNI authentication service could not complete this sign-in request. Try Discord login again.'),
      meta: denied
        ? `HTTP ${response.status || 'ERROR'} // SESSION NOT CREATED`
        : `HTTP ${response.status || 'ERROR'} // AUTHORIZATION SERVICE FAILURE`
    };
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
      message: 'Checking Discord identity, Dreadnought Imperium server membership, and assigned DNI roles.',
      meta: 'STEP 1/2 // VERIFYING SERVER MEMBERSHIP AND ROLE AUTHORIZATION'
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
          message: 'Discord identity verified. Server membership and DNI role authorization were confirmed.\nYour secure terminal session is now active.',
          meta: 'IDENTITY VERIFIED // ROLE AUTHORIZED // SESSION ESTABLISHED',
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

      const failure = authFailureCopy(response, payload);
      render(failure.state, {
        title: failure.title,
        icon: failure.state === 'denied' ? '×' : '!',
        message: failure.message,
        meta: failure.meta,
        retry: true,
        terminal: true
      });

      await paint();
    } catch (error) {
      render('error', {
        title: 'DNI AUTH GATEWAY UNREACHABLE',
        icon: '!',
        message: 'The DNI authorization gateway could not be reached. Your account was not denied. Check your connection and try Discord login again.',
        meta: 'NETWORK OR GATEWAY FAILURE // AUTHORIZATION NOT COMPLETED',
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
