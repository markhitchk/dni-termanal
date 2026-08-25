import http from 'node:http';
import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.DNI_DEPLOY_HOST || '127.0.0.1';
const PORT = Number(process.env.DNI_DEPLOY_PORT || 8081);
const MIN_CHECK_INTERVAL_MS = Math.max(5000, Number(process.env.DNI_DEPLOY_MIN_INTERVAL_MS || 15000) || 15000);

let deployInProgress = false;
let lastCheckAt = 0;
let lastResult = null;

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

async function run(command, args, cwd = ROOT, timeout = 10 * 60 * 1000) {
  const result = await execFileAsync(command, args, {
    cwd,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || '/tmp/dni-deploy-npm-cache'
    }
  });
  return String(result.stdout || '').trim();
}

async function isFastForward(localHead, remoteHead) {
  try {
    await run('git', ['merge-base', '--is-ancestor', localHead, remoteHead], ROOT, 30000);
    return true;
  } catch {
    return false;
  }
}

async function verifyCandidate(remoteHead) {
  const candidate = path.join('/tmp', `dni-deploy-${remoteHead.slice(0, 12)}-${process.pid}`);
  await rm(candidate, { recursive: true, force: true });
  await run('git', ['worktree', 'add', '--detach', candidate, remoteHead]);
  try {
    await run('npm', ['ci'], candidate);
    await run('npm', ['run', 'build'], candidate);
    await run('npm', ['run', 'verify'], candidate);
  } finally {
    try {
      await run('git', ['worktree', 'remove', '--force', candidate]);
    } catch {
      await rm(candidate, { recursive: true, force: true });
    }
  }
}

async function deployLatest() {
  await run('git', ['fetch', '--quiet', 'origin', 'main'], ROOT, 2 * 60 * 1000);
  const localHead = await run('git', ['rev-parse', 'HEAD']);
  const remoteHead = await run('git', ['rev-parse', 'origin/main']);

  if (localHead === remoteHead) {
    return {
      changed: false,
      commit: localHead,
      message: 'DNI server is already current with origin/main.'
    };
  }

  if (!(await isFastForward(localHead, remoteHead))) {
    throw new Error('Refusing deployment because origin/main is not a fast-forward of the live checkout.');
  }

  await verifyCandidate(remoteHead);
  await run('git', ['pull', '--ff-only', 'origin', 'main'], ROOT, 2 * 60 * 1000);
  await run('npm', ['ci']);
  await run('npm', ['run', 'build']);
  await run('npm', ['run', 'verify']);

  const deployedHead = await run('git', ['rev-parse', 'HEAD']);
  return {
    changed: true,
    commit: deployedHead,
    previousCommit: localHead,
    message: 'DNI origin/main update verified and deployed successfully.'
  };
}

function restartRuntime() {
  setTimeout(() => {
    execFile('pkill', ['-TERM', '-f', 'node server/dni-server.mjs'], error => {
      if (error && error.code !== 1) console.error('[DNI DEPLOY] runtime restart signal failed:', error.message);
    });
  }, 500);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== '/deploy.php') return json(res, 404, { error: 'Not found.' });
    if (!['GET', 'POST'].includes(req.method || '')) return json(res, 405, { error: 'Use GET or POST.' });

    if (deployInProgress) {
      return json(res, 409, {
        ok: false,
        status: 'in-progress',
        message: 'A DNI deployment is already running.'
      });
    }

    const now = Date.now();
    if (lastResult && now - lastCheckAt < MIN_CHECK_INTERVAL_MS) {
      return json(res, 200, {
        ok: true,
        status: 'recent-check',
        ...lastResult
      });
    }

    deployInProgress = true;
    lastCheckAt = now;
    const startedAt = new Date().toISOString();

    try {
      const result = await deployLatest();
      lastResult = {
        changed: result.changed,
        commit: result.commit,
        previousCommit: result.previousCommit || null,
        message: result.message,
        completedAt: new Date().toISOString()
      };

      json(res, 200, {
        ok: true,
        status: result.changed ? 'deployed' : 'current',
        startedAt,
        ...lastResult
      });

      if (result.changed) restartRuntime();
    } catch (error) {
      const detail = String(error?.stderr || error?.message || error || 'Deployment failed.').slice(-4000);
      lastResult = null;
      json(res, 500, {
        ok: false,
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        error: 'DNI deployment failed.',
        detail
      });
    } finally {
      deployInProgress = false;
    }
  } catch (error) {
    json(res, 500, { ok: false, error: error?.message || 'Internal deploy service error.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[DNI DEPLOY] automatic /deploy.php service listening on http://${HOST}:${PORT}/deploy.php`);
});
