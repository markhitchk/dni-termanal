import http from 'node:http';
import { execFile } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.DNI_DEPLOY_HOST || '127.0.0.1';
const PORT = Number(process.env.DNI_DEPLOY_PORT || 8081);
const DEPLOY_TOKEN = String(process.env.DNI_DEPLOY_TOKEN || '').trim();

let deployInProgress = false;

function json(res, status, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function requestToken(req, url) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const header = String(req.headers['x-dni-deploy-token'] || '').trim();
  if (header) return header;
  return String(url.searchParams.get('token') || '').trim();
}

async function run(command, args) {
  const result = await execFileAsync(command, args, {
    cwd: ROOT,
    timeout: 5 * 60 * 1000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || '/tmp/dni-deploy-npm-cache'
    }
  });
  return String(result.stdout || '').trim();
}

async function deploy() {
  await run('git', ['pull', '--ff-only', 'origin', 'main']);
  await run('npm', ['ci']);
  await run('npm', ['run', 'build']);
  await run('npm', ['run', 'verify']);
  const commit = await run('git', ['rev-parse', '--short=12', 'HEAD']);
  return commit;
}

function restartRuntime() {
  setTimeout(() => {
    execFile('pkill', ['-TERM', '-f', 'node server/dni-server.mjs'], () => {
      setTimeout(() => process.exit(0), 250);
    });
  }, 400);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== '/deploy.php') return json(res, 404, { error: 'Not found.' });
    if (!['GET', 'POST'].includes(req.method || '')) return json(res, 405, { error: 'Use GET or POST.' });
    if (!DEPLOY_TOKEN) return json(res, 503, { error: 'DNI_DEPLOY_TOKEN is not configured on the VPS.' });
    if (!secureEqual(requestToken(req, url), DEPLOY_TOKEN)) return json(res, 401, { error: 'Invalid deploy token.' });
    if (deployInProgress) return json(res, 409, { error: 'A DNI deployment is already running.' });

    deployInProgress = true;
    const startedAt = new Date().toISOString();
    try {
      const commit = await deploy();
      json(res, 200, {
        ok: true,
        synced: true,
        branch: 'main',
        commit,
        startedAt,
        completedAt: new Date().toISOString(),
        message: 'DNI repository synced, built, verified, and runtime restart requested.'
      });
      restartRuntime();
    } catch (error) {
      const detail = String(error?.stderr || error?.message || 'Deployment failed.').slice(-4000);
      json(res, 500, { ok: false, synced: false, error: 'DNI deployment failed.', detail });
    } finally {
      deployInProgress = false;
    }
  } catch (error) {
    json(res, 500, { error: error?.message || 'Internal deploy service error.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[DNI DEPLOY] Trigger listening on http://${HOST}:${PORT}/deploy.php`);
});
