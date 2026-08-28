import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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
  setTimeout(() => process.exit(75), 500);
}

export async function handleDeployRequest(req, res) {
  if (!['GET', 'POST'].includes(req.method || '')) {
    return json(res, 405, { ok: false, error: 'Use GET or POST.' });
  }

  if (deployInProgress) {
    return json(res, 409, {
      ok: false,
      status: 'in-progress',
      message: 'A DNI deployment is already running.'
    });
  }

  const runtimeReloadRequested = req.method === 'POST'
    && String(req.headers['x-dni-runtime-reload'] || '').trim() === '1';
  const now = Date.now();
  // Browser health checks may reuse a recent result. A POST represents an
  // explicit GitHub deployment and must always fetch origin/main so a closely
  // spaced push can never be skipped by the cooldown.
  if (req.method === 'GET' && lastResult && now - lastCheckAt < MIN_CHECK_INTERVAL_MS) {
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
      runtimeReloadRequested,
      message: runtimeReloadRequested && !result.changed
        ? 'DNI runtime reload accepted with origin/main already current.'
        : result.message,
      completedAt: new Date().toISOString()
    };

    json(res, 200, {
      ok: true,
      status: result.changed ? 'deployed' : (runtimeReloadRequested ? 'runtime-reload' : 'current'),
      startedAt,
      ...lastResult
    });

    if (result.changed || runtimeReloadRequested) restartRuntime();
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
}
