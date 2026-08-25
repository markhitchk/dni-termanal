import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function enabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function autoSyncEnabled() {
  const configured = String(process.env.DNI_AUTO_SYNC || '').trim();
  if (configured) return enabled(configured);
  return process.env.NODE_ENV === 'production';
}

async function run(command, args, cwd, timeout = 10 * 60 * 1000) {
  const result = await execFileAsync(command, args, {
    cwd,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || '/tmp/dni-auto-sync-npm-cache'
    }
  });
  return String(result.stdout || '').trim();
}

async function readVerifiedHead(markerFile, fallback) {
  try {
    const value = (await readFile(markerFile, 'utf8')).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

async function writeVerifiedHead(markerFile, sha) {
  await mkdir(path.dirname(markerFile), { recursive: true });
  await writeFile(markerFile, `${sha}\n`, 'utf8');
}

async function verifyCandidate(root, remoteHead) {
  const candidate = path.join('/tmp', `dni-candidate-${remoteHead.slice(0, 12)}-${process.pid}`);
  await rm(candidate, { recursive: true, force: true });
  await run('git', ['worktree', 'add', '--detach', candidate, remoteHead], root);
  try {
    await run('npm', ['ci'], candidate);
    await run('npm', ['run', 'build'], candidate);
    await run('npm', ['run', 'verify'], candidate);
  } finally {
    try { await run('git', ['worktree', 'remove', '--force', candidate], root); }
    catch { await rm(candidate, { recursive: true, force: true }); }
  }
}

export async function startAutoSync({ root, onUpdated }) {
  if (!autoSyncEnabled()) {
    console.log('[DNI AUTO-SYNC] disabled');
    return;
  }

  const seconds = Math.max(30, Number(process.env.DNI_AUTO_SYNC_INTERVAL_SECONDS || 60) || 60);
  const intervalMs = seconds * 1000;
  const markerFile = path.join(root, 'data', '.dni-deployed-sha');
  let checking = false;
  const currentHead = await run('git', ['rev-parse', 'HEAD'], root);
  let lastVerifiedHead = await readVerifiedHead(markerFile, currentHead);

  async function check() {
    if (checking) return;
    checking = true;
    try {
      await run('git', ['fetch', '--quiet', 'origin', 'main'], root, 2 * 60 * 1000);
      let localHead = await run('git', ['rev-parse', 'HEAD'], root);
      const remoteHead = await run('git', ['rev-parse', 'origin/main'], root);

      if (localHead === remoteHead && localHead === lastVerifiedHead) return;

      if (localHead !== remoteHead) {
        console.log(`[DNI AUTO-SYNC] update found ${localHead.slice(0, 12)} -> ${remoteHead.slice(0, 12)}`);
        console.log('[DNI AUTO-SYNC] verifying candidate before touching live checkout');
        await verifyCandidate(root, remoteHead);
        await run('git', ['pull', '--ff-only', 'origin', 'main'], root, 2 * 60 * 1000);
        localHead = await run('git', ['rev-parse', 'HEAD'], root);
      } else {
        console.log(`[DNI AUTO-SYNC] retrying local verification for ${localHead.slice(0, 12)}`);
      }

      await run('npm', ['ci'], root);
      await run('npm', ['run', 'build'], root);
      await run('npm', ['run', 'verify'], root);

      lastVerifiedHead = localHead;
      await writeVerifiedHead(markerFile, localHead);
      console.log(`[DNI AUTO-SYNC] deployed ${localHead.slice(0, 12)} successfully`);
      if (onUpdated) await onUpdated({ head: localHead });
    } catch (error) {
      const detail = String(error?.stderr || error?.message || error || 'Unknown auto-sync error').slice(-4000);
      console.error('[DNI AUTO-SYNC] sync failed:', detail);
    } finally {
      checking = false;
    }
  }

  console.log(`[DNI AUTO-SYNC] enabled; checking origin/main every ${seconds}s`);
  const first = setTimeout(check, 5000);
  first.unref?.();
  const timer = setInterval(check, intervalMs);
  timer.unref?.();
}
