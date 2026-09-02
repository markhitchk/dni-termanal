const SESSION_ENDPOINT = '/api/dni/session';
const AUTH_MARKER_KEY = 'dni.auth.previouslyAuthenticated.v1';
const LOGIN_URL = '/auth/discord/login';

function readAuthMarker() {
  try {
    return localStorage.getItem(AUTH_MARKER_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAuthMarker(authenticated) {
  try {
    if (authenticated) localStorage.setItem(AUTH_MARKER_KEY, '1');
    else localStorage.removeItem(AUTH_MARKER_KEY);
  } catch {
    // Session-expiry UX still works for the current page when storage is blocked.
  }
}

function localLoginUrl() {
  const next = `${window.location.pathname || '/terminal'}${window.location.search || ''}`;
  return `${LOGIN_URL}?next=${encodeURIComponent(next)}`;
}

async function readSession() {
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

function showExpiredSessionNotice() {
  const options = {
    type: 'attention',
    label: 'SESSION EXPIRED',
    title: 'DNI SESSION EXPIRED',
    message: 'Your previous DNI login session has expired.\nSign in with Discord again to restore DNI Mail, Admin, and authenticated DNI access.',
    meta: 'DNI AUTHORIZATION // SESSION EXPIRED',
    login: true,
    loginUrl: localLoginUrl(),
    buttonText: 'CONTINUE AS GUEST',
    awaitResult: false
  };

  if (window.DNIAlerts?.show) {
    window.DNIAlerts.show(options);
    return;
  }

  window.alert('DNI SESSION EXPIRED\n\nYour previous DNI login session has expired. Please sign in with Discord again.');
}

async function checkSessionExpiry() {
  const wasAuthenticated = readAuthMarker();

  try {
    const session = await readSession();
    if (session.authenticated === true) {
      writeAuthMarker(true);
      return;
    }

    if (wasAuthenticated) {
      // Clear before displaying so refreshing or continuing as guest does not
      // repeatedly show the same expiry warning. A successful login sets it again.
      writeAuthMarker(false);
      showExpiredSessionNotice();
    }
  } catch (error) {
    console.warn('DNI session-expiry check failed:', error);
  }
}

window.DNISessionExpiry = Object.freeze({
  markerKey: AUTH_MARKER_KEY,
  clearAuthenticatedMarker: () => writeAuthMarker(false),
  markAuthenticated: () => writeAuthMarker(true),
  check: checkSessionExpiry
});

void checkSessionExpiry();
