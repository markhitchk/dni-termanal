const API_BASE = '/api/dni/sectors';
let csrfToken = '';

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.method && options.method !== 'GET' && csrfToken) headers['X-DNI-CSRF'] = csrfToken;
  const response = await fetch(`${API_BASE}${path}`, {
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
    const error = new Error(message || 'DNI Sectors API request failed.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createSectorsApi() {
  return {
    async getSession() {
      const session = await request('/session', { method: 'GET' });
      csrfToken = String(session?.csrfToken || '');
      return {
        role: session?.role || 'member',
        permissions: Array.isArray(session?.permissions) ? session.permissions : [],
        authenticated: Boolean(session?.authenticated),
        loginUrl: session?.loginUrl || '/auth/discord/login?next=/sectors',
        source: 'mariadb-api'
      };
    },

    getNetworkData() {
      return request('/network', { method: 'GET' });
    },

    transferPersonnel(payload) {
      return request('/transfer-personnel', { method: 'POST', body: JSON.stringify(payload) });
    },

    redeployFleet(payload) {
      return request('/redeploy-fleet', { method: 'POST', body: JSON.stringify(payload) });
    },

    changeAssetAssignment(payload) {
      return request('/change-asset-assignment', { method: 'POST', body: JSON.stringify(payload) });
    },

    assignCommander(payload) {
      return request('/assign-commander', { method: 'POST', body: JSON.stringify(payload) });
    },

    createSector(payload) {
      return request('/create-sector', { method: 'POST', body: JSON.stringify(payload) });
    },

    deleteSector(payload) {
      return request('/delete-sector', { method: 'POST', body: JSON.stringify(payload) });
    },

    createAsset(payload) {
      return request('/create-asset', { method: 'POST', body: JSON.stringify(payload) });
    },

    deleteAsset(payload) {
      return request('/delete-asset', { method: 'POST', body: JSON.stringify(payload) });
    }
  };
}

export function hasPermission(session, permission) {
  return Boolean(session?.authenticated && Array.isArray(session.permissions)
    && (session.permissions.includes('admin') || session.permissions.includes(permission)));
}
