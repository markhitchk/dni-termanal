const READ_ROUTES = [
  ['GET', /^\/api\/v1\/status$/],
  ['GET', /^\/api\/v1\/roster$/],
  ['GET', /^\/api\/v1\/assignments$/],
  ['GET', /^\/api\/v1\/features$/],
  ['GET', /^\/api\/v1\/public-net$/],
  ['GET', /^\/api\/v1\/ready-checks$/],
  ['GET', /^\/api\/v1\/ready-checks\/status(?:\/[^/]+)?$/],
  ['GET', /^\/api\/v1\/metrics$/],
  ['GET', /^\/api\/v1\/stream$/]
];

const WRITE_ROUTES = [
  ['POST', /^\/api\/v1\/assignments$/],
  ['POST', /^\/api\/v1\/nets$/],
  ['POST', /^\/api\/v1\/ready-checks$/],
  ['POST', /^\/api\/v1\/ready-checks\/start$/],
  ['POST', /^\/api\/v1\/acars$/]
];

let jwksCache = { expiresAt: 0, keys: [] };

function trimSlash(value = '') {
  return String(value).trim().replace(/\/+$/, '');
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = trimSlash(env.DNI_ALLOWED_ORIGIN || '');
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store'
  };
  if (origin && origin === allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function routeAllowed(method, path, routes) {
  return routes.some(([allowedMethod, pattern]) => method === allowedMethod && pattern.test(path));
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function decodeJsonSegment(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function loadAccessKeys(teamDomain) {
  const now = Date.now();
  if (jwksCache.expiresAt > now && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetch(`${trimSlash(teamDomain)}/cdn-cgi/access/certs`, { cf: { cacheTtl: 300 } });
  if (!response.ok) throw new Error('Unable to load Cloudflare Access signing keys.');
  const data = await response.json();
  jwksCache = { expiresAt: now + 5 * 60 * 1000, keys: Array.isArray(data.keys) ? data.keys : [] };
  return jwksCache.keys;
}

async function verifyCloudflareAccess(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  const teamDomain = trimSlash(env.CF_ACCESS_TEAM_DOMAIN || '');
  const audience = String(env.CF_ACCESS_AUD || '').trim();
  if (!token || !teamDomain || !audience) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonSegment(encodedHeader);
  const payload = decodeJsonSegment(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) return false;

  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!payload.exp || payload.exp <= now || !aud.includes(audience)) return false;
  if (payload.iss && trimSlash(payload.iss) !== teamDomain) return false;

  const keys = await loadAccessKeys(teamDomain);
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) return false;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
}

async function forward(request, env, path) {
  const shardUrl = trimSlash(env.STAR_COMMS_SHARD_URL || '');
  const apiKey = String(env.STAR_COMMS_API_KEY || '').trim();
  if (!shardUrl || !apiKey) return json(request, env, { error: 'Star Comms Worker is not configured.' }, 503);

  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${shardUrl}${path}`);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${apiKey}`);
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);

  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();

  const upstream = await fetch(upstreamUrl.toString(), init);
  const responseHeaders = new Headers(corsHeaders(request, env));
  const upstreamContentType = upstream.headers.get('Content-Type');
  if (upstreamContentType) responseHeaders.set('Content-Type', upstreamContentType);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = trimSlash(env.DNI_ALLOWED_ORIGIN || '');

    if (request.method === 'OPTIONS') {
      if (origin !== allowedOrigin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (origin && origin !== allowedOrigin) return json(request, env, { error: 'Origin not allowed.' }, 403);

    if (path === '/health' && request.method === 'GET') {
      return json(request, env, {
        ok: true,
        configured: Boolean(env.STAR_COMMS_SHARD_URL && env.STAR_COMMS_API_KEY),
        writesEnabled: env.ENABLE_DNI_WRITES === 'true',
        writesRequireCloudflareAccess: env.REQUIRE_CF_ACCESS_FOR_WRITES !== 'false'
      });
    }

    const isRead = routeAllowed(request.method, path, READ_ROUTES);
    const isWrite = routeAllowed(request.method, path, WRITE_ROUTES);
    if (!isRead && !isWrite) return json(request, env, { error: 'Route not allowed by DNI proxy.' }, 404);

    if (isWrite) {
      if (env.ENABLE_DNI_WRITES !== 'true') return json(request, env, { error: 'DNI write operations are disabled.' }, 403);
      if (env.REQUIRE_CF_ACCESS_FOR_WRITES !== 'false') {
        try {
          if (!await verifyCloudflareAccess(request, env)) {
            return json(request, env, { error: 'Cloudflare Access authentication required.' }, 401);
          }
        } catch {
          return json(request, env, { error: 'Cloudflare Access verification failed.' }, 401);
        }
      }
    }

    return forward(request, env, path);
  }
};
