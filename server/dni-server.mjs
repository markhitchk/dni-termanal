import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DNI_SECTORS_SEED } from '../public/src/js/sectors-data.js';

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

function sessionFor(req) {
  const authenticated = isAdmin(req);
  return {
    authenticated,
    role: authenticated ? 'command' : 'member',
    permissions: authenticated ? [
      'sectors.read', 'sectors.audit', 'personnel.transfer', 'fleet.redeploy', 'fleet.commander', 'asset.assign'
    ] : ['sectors.read'],
    source: 'ovh-vps'
  };
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

async function starComms(req, res, action) {
  if (!STAR_OWNER_KEY) return json(res, 503, { error: 'Star Comms is not configured on the DNI VPS.' });
  const route = starRoutes.get(action);
  if (!route) return json(res, 404, { error: 'Unknown Star Comms action.' });
  const [method, remotePath] = route;
  if (req.method !== method) return json(res, 405, { error: `Expected ${method}.` });
  if (method !== 'GET' && !isAdmin(req)) return json(res, 403, { error: 'DNI Command authorization required.' });
  const body = method === 'GET' ? undefined : await readJsonBody(req);
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
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return json(res, response.status, payload);
}

async function serveStatic(req, res, pathname) {
  const wanted = pathname === '/' ? '/index.html' : pathname;
  const decoded = decodeURIComponent(wanted);
  const target = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!target.startsWith(`${PUBLIC_DIR}${path.sep}`) && target !== path.join(PUBLIC_DIR, 'index.html')) return json(res, 403, { error: 'Forbidden.' });

  try {
    const info = await stat(target);
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
    const pathname = url.pathname;

    if (pathname === '/api/dni/health' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        service: 'dni-terminal',
        runtime: 'ovh-vps',
        version: process.env.DNI_VERSION || '4.2.0-vps',
        hostname: process.env.DNI_NODE_NAME || 'OVH-DNI-01',
        uptimeSeconds: Math.floor(process.uptime()),
        startedAt: startedAt.toISOString(),
        starCommsConfigured: Boolean(STAR_OWNER_KEY),
        stateFile: path.basename(STATE_FILE)
      });
    }

    if (pathname === '/api/dni/runtime' && req.method === 'GET') {
      return json(res, 200, {
        frontend: 'vps-static', backend: 'vps-api', persistence: 'server-json',
        starComms: STAR_OWNER_KEY ? 'server-managed' : 'not-configured'
      });
    }

    if (pathname === '/api/dni/sectors/session' && req.method === 'GET') return json(res, 200, sessionFor(req));
    if (pathname === '/api/dni/sectors/network' && req.method === 'GET') return json(res, 200, networkData);
    if (pathname.startsWith('/api/dni/sectors/') && req.method === 'POST') return await mutateSectors(req, res, pathname);

    if (pathname === '/api/dni/comms/config' && req.method === 'GET') {
      return json(res, 200, { configured: Boolean(STAR_OWNER_KEY), shard: new URL(STAR_SHARD).hostname, ownerKeyExposed: false });
    }
    if (pathname.startsWith('/api/dni/comms/')) {
      return await starComms(req, res, pathname.slice('/api/dni/comms/'.length));
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
  console.log(`[DNI] Star Comms server bridge: ${STAR_OWNER_KEY ? 'configured' : 'not configured'}`);
});
