const API_BASE = '/api/dni/sectors';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
    ...options
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
      try {
        const session = await request('/session', { method: 'GET', headers: {} });
        return {
          role: session?.role || 'member',
          permissions: Array.isArray(session?.permissions) ? session.permissions : [],
          authenticated: Boolean(session?.authenticated),
          source: 'secure-api'
        };
      } catch (error) {
        if (error.status === 401 || error.status === 403 || error.status === 404) {
          return { role: 'member', permissions: [], authenticated: false, source: 'static-pages' };
        }
        throw error;
      }
    },

    async getNetworkData() {
      try {
        return await request('/network', { method: 'GET', headers: {} });
      } catch (error) {
        if (error.status === 401 || error.status === 403 || error.status === 404) return null;
        throw error;
      }
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
    }
  };
}

export function hasPermission(session, permission) {
  return Boolean(session?.authenticated && Array.isArray(session.permissions) && session.permissions.includes(permission));
}
