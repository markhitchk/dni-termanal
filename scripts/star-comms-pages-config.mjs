import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'configs', 'star-comms.config.json');
const OUTPUT_PATH = path.join(ROOT, 'public', 'config', 'star-comms-public.json');

const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
const ownerKey = String(process.env.STAR_COMMS_OWNER_KEY || '').trim();
const shardUrl = new URL(config.shardUrl).origin;

async function writeOutput(data) {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function resolveUrl(value, fallback) {
  const candidate = String(value || '').trim();
  return new URL(candidate || fallback, shardUrl).toString();
}

if (!ownerKey) {
  await writeOutput({
    enabled: false,
    provider: 'Star Comms',
    shardUrl,
    reason: 'STAR_COMMS_OWNER_KEY is not available to this build.',
    generatedAt: new Date().toISOString()
  });
  console.log('STAR_COMMS_OWNER_KEY not set; emitted disabled public Star Comms config.');
  process.exit(0);
}

if (!/^scok_[A-Za-z0-9_-]+$/.test(ownerKey)) {
  throw new Error('STAR_COMMS_OWNER_KEY does not look like a Star Comms Owner API key.');
}

async function ownerGet(apiPath) {
  const response = await fetch(`${shardUrl}${apiPath}`, {
    headers: {
      Authorization: `Bearer ${ownerKey}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload?.error ? payload.error : String(payload || response.statusText);
    throw new Error(`${apiPath} failed: ${response.status} ${detail}`.trim());
  }
  return payload;
}

await ownerGet('/api/v1/status');
const publicTokenPayload = await ownerGet('/api/v1/public-token');

const token = String(
  publicTokenPayload?.token ??
  publicTokenPayload?.publicToken ??
  publicTokenPayload?.embedToken ??
  publicTokenPayload?.data?.token ??
  publicTokenPayload?.data?.publicToken ??
  ''
).trim();

const returnedStatusUrl =
  publicTokenPayload?.statusUrl ??
  publicTokenPayload?.embedStatusUrl ??
  publicTokenPayload?.urls?.status ??
  publicTokenPayload?.embed?.statusUrl ??
  publicTokenPayload?.data?.statusUrl ??
  publicTokenPayload?.data?.embedStatusUrl;

const returnedWidgetUrl =
  publicTokenPayload?.widgetUrl ??
  publicTokenPayload?.embedWidgetUrl ??
  publicTokenPayload?.urls?.widget ??
  publicTokenPayload?.embed?.widgetUrl ??
  publicTokenPayload?.data?.widgetUrl ??
  publicTokenPayload?.data?.embedWidgetUrl;

if (!token && !returnedStatusUrl) {
  throw new Error('Star Comms /api/v1/public-token did not return a public token or status URL.');
}

const statusUrl = resolveUrl(
  returnedStatusUrl,
  `/api/v1/embed/status?token=${encodeURIComponent(token)}`
);
const widgetUrl = resolveUrl(
  returnedWidgetUrl,
  `/api/v1/embed/widget?token=${encodeURIComponent(token)}`
);

await writeOutput({
  enabled: true,
  provider: 'Star Comms',
  mode: 'public-embed-status',
  shardUrl,
  statusUrl,
  widgetUrl,
  generatedAt: new Date().toISOString(),
  ownerKeyExposed: false
});

console.log(`Star Comms Owner API verified for ${new URL(shardUrl).hostname}.`);
console.log('Browser-safe public embed configuration generated; Owner key was not written to public/.');
