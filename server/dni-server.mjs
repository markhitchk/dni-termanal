import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DNI_SECTORS_SEED } from '../public/src/js/sectors-data.js';
import { handleDeployRequest } from './dni-deploy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = process.env.DNI_STATE_FILE || path.join(DATA_DIR, 'dni-network.json');
const HOST = process.env.DNI_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || process.env.DNI_PORT || 8080);
const ADMIN_TOKEN = String(process.env.DNI_ADMIN_TOKEN || '').trim();
const STAR_SHARD = String(process.env.STAR_COMMS_SHARD_URL || 'https://s-dreadnought-imperium.star-comms.org').replace(/\/$/, '');
const STAR_OWNER_KEY = String(process.env.STAR_COMMS_OWNER_KEY || '').trim();
const DB_USER = String(process.env.DNI_DB_USER || '').trim();
const DB_PASSWORD = String(process.env.DNI_DB_PASSWORD || '').trim();
const DISCORD_CONFIGURED = Boolean(
  String(process.env.DNI_DISCORD_CLIENT_ID || '').trim()
  && String(process.env.DNI_DISCORD_CLIENT_SECRET || '').trim()
  && String(process.env.DNI_DISCORD_GUILD_ID || '').trim()
);
const startedAt = new Date();

const clone = value => JSON.parse(JSON.stringify(value));
let networkData = clone(DNI_SECTORS_SEED);

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'], ['.woff', 'font/woff']
]);

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.sectors && parsed?.assets && parsed?.personnel) networkData = parsed;
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('[DNI] Failed to load state:', error.message);
  }
}

async function persistState() {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(networkData, null, 2)}\n`, 'utf8');
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
  res.end(body);
}

function isAdmin(req) {
  if (!ADMIN_TOKEN) return false;
  const auth = String(req.headers.authorization || '');
  const headerToken = String(req.headers['x-dni-admin-token'] || '');
  return auth === `Bearer ${ADMIN_TOKEN}` || headerToken === ADMIN_TOKEN;
}

function runtimeStatus() {
  return {
    databaseConfigured: Boolean(DB_USER && DB_PASSWORD),
    discordConfigured: DISCORD_CONFIGURED,
    starCommsConfigured: Boolean(STAR_OWNER_KEY),
    runtime: 'ovh-vps-node'
  };
}

function sessionFor(req) {
  const runtime = runtimeStatus();
  if (!runtime.databaseConfigured) {
    return {
      authenticated: false,
      setupRequired: true,
      loginUrl: '/auth/discord/login',
      permissions: [],
      clearances: [],
      source: 'ovh-vps-node',
      message: 'DNI MariaDB credentials are not configured yet.',
      ...runtime
    };
  }

  const authenticated = isAdmin(req);
  return {
    authenticated,
    setupRequired: false,
    role: authenticated ? 'command' : 'member',
    loginUrl: '/auth/discord/login',
    permissions: authenticated ? [
      'admin', 'dashboard.read', 'services.request', 'services.manage',
      'sectors.read', 'sectors.audit', 'personnel.transfer', 'fleet.redeploy',
      'fleet.commander', 'asset.assign', 'communication.read', 'communication.write'
    ] : ['sectors.read', 'communication.read'],
    clearances: [],
    source: 'ovh-vps-node',
    ...runtime
  };
}

function setupRequired(res, moduleName) {
  return json(res, 503, {
    ok: false,
    setupRequired: true,
    error: `DNI ${moduleName} is installed, but MariaDB application credentials are not configured yet.`,
    ...runtimeStatus()
  });
}

function adminStatus(req, res) {
  const runtime = runtimeStatus();
  if (!runtime.databaseConfigured) {
    return json(res, 200, {
      ok: true,
      admin: false,
      authenticated: false,
      setupRequired: true,
      message: 'DNI Admin is installed, but MariaDB application credentials still need initial provisioning.',
      counts: {
        users: Array.isArray(networkData.personnel) ? networkData.personnel.length : 0,
        sectors: Array.isArray(networkData.sectors) ? networkData.sectors.length : 0,
        serviceRequests: 0,
        auditEntries: Array.isArray(networkData.activity) ? networkData.activity.length : 0
      },
      migrations: { trackingTable: false, applied: 0 },
      ...runtime
    });
  }

  if (!isAdmin(req)) {
    return json(res, 401, {
      ok: false,
      admin: false,
      authenticated: false,
      setupRequired: false,
      loginUrl: '/auth/discord/login?next=/admin',
      error: 'Discord sign-in required for DNI Admin.',
      ...runtime
    });
  }

  return json(res, 200, {
    ok: true,
    admin: true,
    authenticated: true,
    setupRequired: false,
    user: { username: 'DNI Command', globalName: 'DNI Command', guildNick: null },
    permissions: sessionFor(req).permissions,
    counts: {
      users: Array.isArray(networkData.personnel) ? networkData.personnel.length : 0,
      sectors: Array.isArray(networkData.sectors) ? networkData.sectors.length : 0,
      serviceRequests: 0,
      auditEntries: Array.isArray(networkData.activity) ? networkData.activity.length : 0
    },
    migrations: { trackingTable: true, applied: 0 },
    ...runtime
  });
}

async function readJsonBody(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 1024) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body.'), { status: 400 }); }
}

function addActivity(type, publicText, adminText = publicText) {
  networkData.activity ||= [];
  networkData.activity.unshift({
    id: `evt-${Date.now()}`,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }),
    publicText, adminText, type
  });
  networkData.activity = networkData.activity.slice(0, 100);
}

function findAsset(id) { return networkData.assets.find(item => item.id === id); }
function findPerson(id) { return networkData.personnel.find(item => item.id === id); }
function findSector(id) { return networkData.sectors.find(item => item.id === id); }

async function mutateSectors(req, res, pathname) {
  if (!isAdmin(req)) return json(res, 403, { error: 'DNI Command authorization required.' });
  const body = await readJsonBody(req);

  if (pathname.endsWith('/transfer-personnel')) {
    const person = findPerson(body.personnelId);
    const sector = findSector(body.destinationSectorId);
    const assignment = findAsset(body.destinationAssignmentId);
    if (!person || !sector || !assignment || assignment.sectorId !== sector.id) return json(res, 400, { error: 'Invalid personnel transfer destination.' });
    const old = person.assignmentId;
    person.sectorId = sector.id;
    person.assignmentId = assignment.id;
    addActivity('TRANSFER', `${person.name} transferred to ${assignment.name}`, `${person.name} transferred ${old} → ${assignment.id} / ${body.reason || 'no reason supplied'}`);
  } else if (pathname.endsWith('/redeploy-fleet')) {
    const fleet = findAsset(body.assetId);
    const sector = findSector(body.destinationSectorId);
    const destination = findAsset(body.destinationId);
    if (!fleet || fleet.type !== 'fleet' || !sector || !destination || destination.sectorId !== sector.id) return json(res, 400, { error: 'Invalid fleet redeployment destination.' });
    const oldSector = fleet.sectorId;
    fleet.sectorId = sector.id;
    fleet.homeBaseId = destination.id;
    fleet.location = destination.name;
    addActivity('REDEPLOYMENT', `${fleet.name} redeployed ${oldSector.toUpperCase()} → ${sector.name}`, `${fleet.name} redeployed to ${destination.name} / ${body.deploymentType || 'permanent'} / ${body.notes || 'no notes'}`);
  } else if (pathname.endsWith('/change-asset-assignment')) {
    const asset = findAsset(body.assetId);
    const assignment = findAsset(body.assignmentId || body.destinationId);
    if (!asset || !assignment) return json(res, 400, { error: 'Invalid asset assignment.' });
    asset.homeBaseId = assignment.id;
    addActivity('ASSIGNMENT', `${asset.name} assignment updated`, `${asset.name} assigned to ${assignment.name}`);
  } else if (pathname.endsWith('/assign-commander')) {
    const asset = findAsset(body.assetId);
    const commander = String(body.commander || body.commanderName || '').trim();
    if (!asset || !commander) return json(res, 400, { error: 'Asset and commander are required.' });
    asset.commander = commander;
    addActivity('COMMAND', `${asset.name} commander updated`, `${asset.name} commander assigned: ${commander}`);
  } else {
    return json(res, 404, { error: 'Unknown DNI Sectors command.' });
  }

  await persistState();
  return json(res, 200, { ok: true, networkData });
}

const starRoutes = new Map([
  ['status', ['GET', '/api/v1/status']], ['roster', ['GET', '/api/v1/roster']], ['assignments', ['GET', '/api/v1/assignments']],
  ['assignments-write', ['POST', '/api/v1/assignments']], ['nets', ['POST', '/api/v1/nets']], ['operation', ['POST', '/api/v1/operation']],
  ['ready-checks', ['POST', '/api/v1/ready-checks']], ['ready-check-status', ['GET', '/api/v1/ready-checks/status']],
  ['ready-check-start', ['POST', '/api/v1/ready-checks/start']], ['acars', ['POST', '/api/v1/acars']],
  ['metrics', ['GET', '/api/v1/metrics']], ['audit', ['GET', '/api/v1/audit']]
]);

async function fetchStarComms(action, body) {
  if (!STAR_OWNER_KEY) throw Object.assign(new Error('Star Comms is not configured on the DNI VPS.'), { status: 503 });
  const route = starRoutes.get(action);
  if (!route) throw Object.assign(new Error('Unknown Star Comms action.'), { status: 404 });
  const [method, remotePath] = route;
  const response = await fetch(`${STAR_SHARD}${remotePath}`, {
    method,
    headers: {
      Authorization: `Bearer ${STAR_OWNER_KEY}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000)
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const detail = String(payload?.error || payload?.message || `Star Comms returned HTTP ${response.status}.`);
    throw Object.assign(new Error(detail), { status: response.status });
  }
  return payload;
}

async function starComms(req, res, action) {
  const route = starRoutes.get(action);
  if (!route) return json(res, 404, { error: 'Unknown Star Comms action.' });
  const [method] = route;
  if (req.method !== method) return json(res, 405, { error: `Expected ${method}.` });
  if (method !== 'GET' && !isAdmin(req)) return json(res, 403, { error: 'DNI Command authorization required.' });
  const body = method === 'GET' ? undefined : await readJsonBody(req);
  try {
    return json(res, 200, await fetchStarComms(action, body));
  } catch (error) {
    return json(res, Number(error?.status || 502), { error: error?.message || 'Star Comms request failed.' });
  }
}

async function optionalStar(action) {
  try { return await fetchStarComms(action); }
  catch (error) { return { unavailable: true, error: error?.message || 'Unavailable' }; }
}

async function commsSnapshot(res) {
  try {
    const status = await fetchStarComms('status');
    const [roster, assignments, readyChecks, metrics] = await Promise.all([
      optionalStar('roster'), optionalStar('assignments'), optionalStar('ready-check-status'), optionalStar('metrics')
    ]);
    return json(res, 200, {
      ok: true,
      accessMode: 'read-only-public-bridge',
      status,
      roster,
      assignments,
      readyChecks,
      metrics,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return json(res, Number(error?.status || 503), {
      ok: false,
      error: error?.message || 'Star Comms Owner API bridge is unavailable.',
      starCommsConfigured: Boolean(STAR_OWNER_KEY)
    });
  }
}

async function commsReadyCheck(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Expected POST.' });
  if (!isAdmin(req)) return json(res, 403, { error: 'DNI Command authorization required.' });
  try {
    const created = await fetchStarComms('ready-checks', {
      name: 'DNI Ready Check', message: 'Report ready for DNI operations.', color: '#34CD84', target: { everyone: true }
    });
    const templateId = created?.readyCheck?.id || created?.template?.id || created?.id;
    if (!templateId) return json(res, 502, { error: 'Star Comms did not return a ready-check template ID.' });
    const result = await fetchStarComms('ready-check-start', { templateId: String(templateId), initiatorName: 'DNI Ops' });
    return json(res, 200, { ok: true, result, snapshot: await snapshotPayload() });
  } catch (error) {
    return json(res, Number(error?.status || 502), { error: error?.message || 'Ready check failed.' });
  }
}

async function snapshotPayload() {
  const status = await fetchStarComms('status');
  const [roster, assignments, readyChecks, metrics] = await Promise.all([
    optionalStar('roster'), optionalStar('assignments'), optionalStar('ready-check-status'), optionalStar('metrics')
  ]);
  return { status, roster, assignments, readyChecks, metrics, fetchedAt: new Date().toISOString() };
}

async function commsMutation(req, res, action) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Expected POST.' });
  if (!isAdmin(req)) return json(res, 403, { error: 'DNI Command authorization required.' });
  const body = await readJsonBody(req);
  try {
    const result = await fetchStarComms(action, body);
    return json(res, 200, { ok: true, result, snapshot: await snapshotPayload() });
  } catch (error) {
    return json(res, Number(error?.status || 502), { error: error?.message || 'Star Comms mutation failed.' });
  }
}

async function serveStatic(req, res, pathname) {
  let wanted = pathname === '/' ? '/index.html' : pathname;
  if (!path.extname(wanted) && !wanted.endsWith('/')) wanted += '/';
  const decoded = decodeURIComponent(wanted);
  let target = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!target.startsWith(`${PUBLIC_DIR}${path.sep}`) && target !== path.join(PUBLIC_DIR, 'index.html')) return json(res, 403, { error: 'Forbidden.' });

  try {
    let info = await stat(target);
    if (info.isDirectory()) {
      target = path.join(target, 'index.html');
      info = await stat(target);
    }
    if (!info.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'same-origin'
    });
    res.end(body);
  } catch (error) {
    if (error?.code === 'ENOENT') return json(res, 404, { error: 'DNI resource not found.' });
    throw error;
  }
}

await loadState();

const server = http.createServer(async (req, res) => {
  const requestStarted = Date.now();
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (pathname === '/deploy.php') return await handleDeployRequest(req, res);

    if (pathname === '/api/dni/health' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        service: 'dni-terminal',
        runtime: 'ovh-vps-node',
        version: process.env.DNI_VERSION || '4.4.0-vps',
        hostname: process.env.DNI_NODE_NAME || 'OVH-DNI-01',
        uptimeSeconds: Math.floor(process.uptime()),
        startedAt: startedAt.toISOString(),
        stateFile: path.basename(STATE_FILE),
        ...runtimeStatus()
      });
    }

    if (pathname === '/api/dni/runtime' && req.method === 'GET') {
      return json(res, 200, {
        frontend: 'vps-static', backend: 'node-api', persistence: DB_USER && DB_PASSWORD ? 'mariadb-configured' : 'server-json-fallback',
        starComms: STAR_OWNER_KEY ? 'server-managed' : 'not-configured', ...runtimeStatus()
      });
    }

    if (pathname === '/api/dni/session' && req.method === 'GET') return json(res, 200, sessionFor(req));
    if (pathname === '/api/dni/admin/status' && req.method === 'GET') return adminStatus(req, res);

    if (pathname === '/api/dni/dashboard' && req.method === 'GET') {
      if (!DB_USER || !DB_PASSWORD) return setupRequired(res, 'Dashboard');
      if (!isAdmin(req)) return json(res, 401, { ok: false, error: 'Discord sign-in required.', loginUrl: '/auth/discord/login?next=/dashboard' });
      return json(res, 200, {
        authenticated: true,
        user: { username: 'DNI Command', global_name: 'DNI Command' },
        profile: null,
        permissions: sessionFor(req).permissions,
        clearances: [],
        maxClearance: 0,
        documents: [],
        recentServices: []
      });
    }

    if (pathname.startsWith('/api/dni/services/')) {
      if (!DB_USER || !DB_PASSWORD) return setupRequired(res, 'Services');
      if (!isAdmin(req)) return json(res, 401, { ok: false, error: 'Discord sign-in required.', loginUrl: '/auth/discord/login?next=/services' });
      if (pathname === '/api/dni/services/types' && req.method === 'GET') {
        return json(res, 200, { types: [
          { typeKey: 'medic', name: 'Medical', description: 'Medical support request.' },
          { typeKey: 'engineer', name: 'Engineering', description: 'Engineering support request.' },
          { typeKey: 'fuel', name: 'Fuel', description: 'Fuel support request.' }
        ] });
      }
      if (pathname === '/api/dni/services/requests' && req.method === 'GET') return json(res, 200, { requests: [] });
      return json(res, 503, { ok: false, error: 'DNI Services write bridge is not active on the Node compatibility runtime.' });
    }

    if (pathname === '/api/dni/sectors/session' && req.method === 'GET') return json(res, 200, sessionFor(req));
    if (pathname === '/api/dni/sectors/network' && req.method === 'GET') return json(res, 200, networkData);
    if (pathname.startsWith('/api/dni/sectors/') && req.method === 'POST') return await mutateSectors(req, res, pathname);

    if (pathname === '/api/dni/comms/config' && req.method === 'GET') {
      return json(res, 200, { configured: Boolean(STAR_OWNER_KEY), shard: new URL(STAR_SHARD).hostname, ownerKeyExposed: false });
    }
    if (pathname === '/api/dni/comms/snapshot' && req.method === 'GET') return await commsSnapshot(res);
    if (pathname === '/api/dni/comms/nets') return await commsMutation(req, res, 'nets');
    if (pathname === '/api/dni/comms/assignments') return await commsMutation(req, res, 'assignments-write');
    if (pathname === '/api/dni/comms/ready-checks/start') return await commsReadyCheck(req, res);
    if (pathname === '/api/dni/comms/acars') return await commsMutation(req, res, 'acars');
    if (pathname.startsWith('/api/dni/comms/')) {
      const action = pathname.slice('/api/dni/comms/'.length);
      return await starComms(req, res, action);
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown DNI API endpoint.' });
    return await serveStatic(req, res, pathname);
  } catch (error) {
    console.error('[DNI]', req.method, req.url, error);
    return json(res, Number(error?.status || 500), { error: error?.message || 'Internal DNI server error.' });
  } finally {
    console.log(`[DNI] ${req.method} ${req.url} ${Date.now() - requestStarted}ms`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[DNI] OVH runtime online at http://${HOST}:${PORT}`);
  console.log(`[DNI] Static frontend: ${PUBLIC_DIR}`);
  console.log(`[DNI] Persistent state: ${STATE_FILE}`);
  console.log(`[DNI] Database runtime: ${DB_USER && DB_PASSWORD ? 'configured' : 'not configured'}`);
  console.log(`[DNI] Star Comms server bridge: ${STAR_OWNER_KEY ? 'configured' : 'not configured'}`);
});
