import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OVERLAY_FILE = path.join(__dirname, 'live-overlay.js');
const PORT = Number(process.env.DNI_TEST_PORT || 4173);

const LAUNCH_URL = String(process.env.STAR_COMMS_LAUNCH_URL || '').trim();
const OWNER_KEY = String(process.env.STAR_COMMS_OWNER_KEY || '').trim();

if (!LAUNCH_URL) {
  console.error('Missing STAR_COMMS_LAUNCH_URL.');
  process.exit(2);
}
if (!OWNER_KEY) {
  console.error('Missing STAR_COMMS_OWNER_KEY.');
  process.exit(2);
}
if (!/^scok_[A-Za-z0-9_-]+$/.test(OWNER_KEY)) {
  console.error('STAR_COMMS_OWNER_KEY does not look like a Star Comms Owner API key.');
  process.exit(2);
}

function parseLaunchInfo(value) {
  const outer = new URL(value);
  if (!['star-comms.org', 'www.star-comms.org'].includes(outer.hostname) || outer.pathname !== '/launch') {
    throw new Error('Expected a https://star-comms.org/launch?... URL.');
  }

  const encodedUri = outer.searchParams.get('uri');
  if (!encodedUri) throw new Error('Launch URL is missing the uri parameter.');

  const inner = new URL(encodedUri);
  if (inner.protocol !== 'starcomms:' || inner.hostname !== 'launch') {
    throw new Error('Launch URL does not contain a starcomms://launch URI.');
  }

  const shardValue = inner.searchParams.get('shard');
  const launchId = String(inner.searchParams.get('id') || '').trim();
  const launchToken = String(inner.searchParams.get('token') || '').trim();
  if (!shardValue || !launchId || !launchToken) {
    throw new Error('Launch URI must include shard, id, and token.');
  }

  const shard = new URL(shardValue);
  if (shard.protocol !== 'https:' || !shard.hostname.endsWith('.star-comms.org')) {
    throw new Error('Launch shard must be an HTTPS *.star-comms.org host.');
  }

  return {
    fullLaunchUrl: value,
    launchUri: encodedUri,
    shardUrl: shard.origin,
    apiBase: `${shard.origin}/api/v1`,
    launchId,
    launchToken
  };
}

let launch;
try {
  launch = parseLaunchInfo(LAUNCH_URL);
} catch (error) {
  console.error(`Invalid STAR_COMMS_LAUNCH_URL: ${error.message}`);
  process.exit(2);
}

const ROUTES = new Set([
  'GET status',
  'GET roster',
  'GET assignments',
  'GET metrics',
  'GET ready-checks',
  'GET ready-checks/status',
  'POST nets',
  'POST assignments',
  'POST ready-checks',
  'POST ready-checks/start',
  'POST acars',
  'POST operation'
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  return JSON.parse(text);
}

async function proxyOwnerApi(req, res, url) {
  const route = decodeURIComponent(url.pathname.slice('/__starcomms/api/'.length)).replace(/^\/+|\/+$/g, '');
  const key = `${req.method} ${route}`;
  if (!ROUTES.has(key)) {
    return sendJson(res, 404, { error: 'Route not enabled by the full-DNI test harness.' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body.' });
  }

  const headers = {
    Authorization: `Bearer ${OWNER_KEY}`,
    Accept: 'application/json'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const upstream = await fetch(`${launch.apiBase}/${route}${url.search}`, {
      method: req.method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual'
    });

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    const data = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch (error) {
    sendJson(res, 502, { error: `Star Comms request failed: ${error.message}` });
  }
}

function safePublicPath(pathname) {
  const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const clean = path.normalize(decoded).replace(/^([.][.][/\\])+/, '').replace(/^[/\\]+/, '');
  const target = path.resolve(PUBLIC_DIR, clean);
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== PUBLIC_DIR) return null;
  return target;
}

async function serveIndex(res) {
  let html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const injected = `\n<script type="module" src="/__full-dni-test/live-overlay.js"></script>\n`;
  html = html.replace('</body>', `${injected}</body>`);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

  try {
    if (url.pathname === '/__starcomms/context' && req.method === 'GET') {
      return sendJson(res, 200, {
        mode: 'FULL_DNI_LOCAL_TEST',
        shardUrl: launch.shardUrl,
        apiBase: launch.apiBase,
        launchId: launch.launchId,
        launchTokenPresent: Boolean(launch.launchToken),
        ownerKeyConfigured: true
      });
    }

    if (url.pathname === '/__starcomms/launch' && req.method === 'GET') {
      res.writeHead(302, {
        Location: launch.fullLaunchUrl,
        'Cache-Control': 'no-store'
      });
      return res.end();
    }

    if (url.pathname.startsWith('/__starcomms/api/')) {
      return proxyOwnerApi(req, res, url);
    }

    if (url.pathname === '/__full-dni-test/live-overlay.js' && req.method === 'GET') {
      const js = await fs.readFile(OVERLAY_FILE);
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      return res.end(js);
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return serveIndex(res);
    }

    const target = safePublicPath(url.pathname);
    if (!target) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    const stat = await fs.stat(target).catch(() => null);
    if (!stat?.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const data = await fs.readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Full DNI Star Comms test: http://127.0.0.1:${PORT}`);
  console.log(`Shard: ${launch.shardUrl}`);
  console.log(`Launch ID: ${launch.launchId}`);
  console.log('Launch token: loaded (not printed)');
  console.log('Owner API key: loaded (not printed)');
});
