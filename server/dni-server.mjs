import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleDeployRequest } from './dni-deploy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HOST = process.env.DNI_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || process.env.DNI_PORT || 8080);
const CANONICAL_ORIGIN = String(
  process.env.DNI_CANONICAL_ORIGIN || 'https://www.dreadnoughtimperium.org'
).replace(/\/$/, '');
const startedAt = new Date();

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff']
]);

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
  res.end(body);
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 4 * 1024 * 1024) {
      throw Object.assign(new Error('Request body too large.'), { status: 413 });
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

function shouldUseCanonicalPhp(pathname) {
  if (pathname.startsWith('/api/')) return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname === '/dev/termanal' || pathname.startsWith('/dev/termanal/')) return true;
  if (pathname.endsWith('.php') && pathname !== '/deploy.php') return true;
  return false;
}

function forwardedHeaders(req) {
  const headers = new Headers();
  for (const name of [
    'accept',
    'accept-language',
    'authorization',
    'content-type',
    'cookie',
    'user-agent',
    'x-dni-admin-token',
    'x-dni-csrf',
    'x-requested-with'
  ]) {
    const value = req.headers[name];
    if (typeof value === 'string' && value !== '') headers.set(name, value);
  }
  headers.set('accept-encoding', 'identity');
  headers.set('x-dni-node-compat', '1');
  return headers;
}

async function proxyCanonicalPhp(req, res, requestUrl) {
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, CANONICAL_ORIGIN);
  const body = await readRequestBody(req);
  const response = await fetch(target, {
    method: req.method,
    headers: forwardedHeaders(req),
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  });

  const responseBody = req.method === 'HEAD'
    ? Buffer.alloc(0)
    : Buffer.from(await response.arrayBuffer());

  const headers = {
    'Content-Length': responseBody.length,
    'X-DNI-Node-Compatibility': 'canonical-php-sqlite'
  };

  for (const name of [
    'cache-control',
    'content-type',
    'content-disposition',
    'location',
    'referrer-policy',
    'x-content-type-options',
    'x-frame-options'
  ]) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }

  if (typeof response.headers.getSetCookie === 'function') {
    const cookies = response.headers.getSetCookie();
    if (cookies.length) headers['Set-Cookie'] = cookies;
  } else {
    const cookie = response.headers.get('set-cookie');
    if (cookie) headers['Set-Cookie'] = cookie;
  }

  res.writeHead(response.status, headers);
  if (req.method === 'HEAD') return res.end();
  res.end(responseBody);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'Static DNI resources are read-only.' });
  }

  let wanted = pathname === '/' ? '/index.html' : pathname;
  if (!path.extname(wanted) && !wanted.endsWith('/')) wanted += '/';
  const decoded = decodeURIComponent(wanted);
  let target = path.resolve(PUBLIC_DIR, `.${decoded}`);

  if (!target.startsWith(`${PUBLIC_DIR}${path.sep}`) && target !== path.join(PUBLIC_DIR, 'index.html')) {
    return json(res, 403, { error: 'Forbidden.' });
  }
  if (path.extname(target).toLowerCase() === '.php') {
    return json(res, 403, { error: 'PHP source is never served by the Node compatibility runtime.' });
  }

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
    if (req.method === 'HEAD') return res.end();
    res.end(body);
  } catch (error) {
    if (error?.code === 'ENOENT') return json(res, 404, { error: 'DNI resource not found.' });
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const requestStarted = Date.now();
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (pathname === '/deploy.php') return await handleDeployRequest(req, res);

    if (pathname === '/node-healthz' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        service: 'dni-terminal-node-compatibility',
        runtime: 'ovh-vps-node',
        role: 'static-and-deploy-compatibility',
        applicationPersistence: 'canonical-php-sqlite',
        databaseMode: 'sqlite',
        databasePath: 'data/dni_terminal.db',
        canonicalOrigin: new URL(CANONICAL_ORIGIN).hostname,
        version: process.env.DNI_VERSION || '4.4.0-vps',
        hostname: process.env.DNI_NODE_NAME || 'OVH-DNI-01',
        uptimeSeconds: Math.floor(process.uptime()),
        startedAt: startedAt.toISOString()
      });
    }

    // The Node process no longer owns application data. Every API/auth/PHP
    // request is executed by the canonical Apache/PHP runtime, which persists
    // through the single SQLite database at data/dni_terminal.db.
    if (shouldUseCanonicalPhp(pathname)) {
      return await proxyCanonicalPhp(req, res, url);
    }

    if (pathname.startsWith('/api/')) {
      return json(res, 404, { error: 'Unknown DNI API endpoint.' });
    }

    return await serveStatic(req, res, pathname);
  } catch (error) {
    console.error('[DNI]', req.method, req.url, error);
    const status = Number(error?.status || (error?.name === 'TimeoutError' ? 504 : 500));
    return json(res, status, {
      error: error?.name === 'TimeoutError'
        ? 'Canonical DNI PHP runtime timed out.'
        : (error?.message || 'Internal DNI compatibility server error.'),
      databaseMode: 'sqlite'
    });
  } finally {
    console.log(`[DNI] ${req.method} ${req.url} ${Date.now() - requestStarted}ms`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[DNI] OVH compatibility runtime online at http://${HOST}:${PORT}`);
  console.log(`[DNI] Static frontend: ${PUBLIC_DIR}`);
  console.log(`[DNI] Application API: ${CANONICAL_ORIGIN} -> Apache/PHP -> SQLite data/dni_terminal.db`);
  console.log('[DNI] Node JSON/MariaDB application persistence: disabled');
});
