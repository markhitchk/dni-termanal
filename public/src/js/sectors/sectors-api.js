const API_URL = '/sectors-data.php';
const ADMIN_API_URL = '/admin-data.php';
let csrfToken = '';

async function requestFrom(baseUrl, action, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.method && options.method !== 'GET' && csrfToken) headers['X-DNI-CSRF'] = csrfToken;
  const response = await fetch(`${baseUrl}?action=${encodeURIComponent(action)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error ? payload.error : `${response.status} ${response.statusText}`;
    const error = new Error(message || 'DNI API request failed.');
    error.status = response.status;
    error.setupRequired = Boolean(payload?.setupRequired);
    throw error;
  }
  return payload;
}

const request = (action, options = {}) => requestFrom(API_URL, action, options);
const requestAdmin = (action, options = {}) => requestFrom(ADMIN_API_URL, action, options);

async function refreshDeveloperAdminIfNeeded(session) {
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  if (!session?.authenticated || permissions.includes('admin')) return session;

  // admin-data.php contains the server-side permanent Developer Admin bootstrap.
  // A normal member receives 403 and remains unchanged; the built-in developer
  // identity is upgraded immediately without requiring another Discord login.
  try {
    const response = await fetch(`${ADMIN_API_URL}?action=bootstrap`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (response.ok) return await request('session', { method: 'GET' });
  } catch (error) {
    console.debug('DNI developer admin refresh skipped', error);
  }
  return session;
}

export function createSectorsApi() {
  return {
    async getSession() {
      let session = await request('session', { method: 'GET' });
      session = await refreshDeveloperAdminIfNeeded(session);
      csrfToken = String(session?.csrfToken || '');
      return {
        role: session?.role || 'member',
        permissions: Array.isArray(session?.permissions) ? session.permissions : [],
        authenticated: Boolean(session?.authenticated),
        loginUrl: session?.loginUrl || '/auth/discord/login?next=/sectors',
        source: session?.source || (session?.setupRequired ? 'node-fallback' : 'embedded-server'),
        setupRequired: Boolean(session?.setupRequired)
      };
    },

    getNetworkData() {
      return request('network', { method: 'GET' });
    },

    transferPersonnel(payload) {
      return request('transfer-personnel', { method: 'POST', body: JSON.stringify(payload) });
    },

    redeployFleet(payload) {
      return request('redeploy-fleet', { method: 'POST', body: JSON.stringify(payload) });
    },

    changeAssetAssignment(payload) {
      return request('change-asset-assignment', { method: 'POST', body: JSON.stringify(payload) });
    },

    assignCommander(payload) {
      return request('assign-commander', { method: 'POST', body: JSON.stringify(payload) });
    },

    createSector(payload) {
      return request('create-sector', { method: 'POST', body: JSON.stringify(payload) });
    },

    deleteSector(payload) {
      return request('delete-sector', { method: 'POST', body: JSON.stringify(payload) });
    },

    createAsset(payload) {
      return request('create-asset', { method: 'POST', body: JSON.stringify(payload) });
    },

    deleteAsset(payload) {
      return request('delete-asset', { method: 'POST', body: JSON.stringify(payload) });
    },

    saveSector(payload) {
      return requestAdmin('save-sector', { method: 'POST', body: JSON.stringify(payload) });
    },

    saveAsset(payload) {
      return requestAdmin('save-asset', { method: 'POST', body: JSON.stringify(payload) });
    }
  };
}

export function hasPermission(session, permission) {
  return Boolean(session?.authenticated && Array.isArray(session.permissions)
    && (session.permissions.includes('admin') || session.permissions.includes(permission)));
}
