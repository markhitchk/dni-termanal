const OWNER_KEY = String(process.env.STAR_COMMS_OWNER_KEY || '').trim();
const LAUNCH_URL = String(process.env.STAR_COMMS_LAUNCH_URL || '').trim();

if (!OWNER_KEY) {
  console.error('Missing STAR_COMMS_OWNER_KEY environment variable.');
  process.exit(2);
}

if (!/^scok_[A-Za-z0-9_-]+$/.test(OWNER_KEY)) {
  console.error('STAR_COMMS_OWNER_KEY does not look like a Star Comms Owner API key.');
  process.exit(2);
}

if (!LAUNCH_URL) {
  console.error('Missing STAR_COMMS_LAUNCH_URL environment variable.');
  process.exit(2);
}

function parseLaunchInfo(value) {
  let launchUri = value;

  if (/^https?:\/\//i.test(value)) {
    const outer = new URL(value);
    if (outer.hostname !== 'star-comms.org' && outer.hostname !== 'www.star-comms.org') {
      throw new Error('STAR_COMMS_LAUNCH_URL must be a Star Comms launch URL.');
    }
    launchUri = outer.searchParams.get('uri') || '';
    if (!launchUri) throw new Error('Star Comms launch URL is missing the uri parameter.');
  }

  const parsed = new URL(launchUri);
  if (parsed.protocol !== 'starcomms:' || parsed.hostname !== 'launch') {
    throw new Error('Launch data is not a starcomms://launch URI.');
  }

  const shard = String(parsed.searchParams.get('shard') || '').trim();
  const launchId = String(parsed.searchParams.get('id') || '').trim();
  const launchToken = String(parsed.searchParams.get('token') || '').trim();

  if (!shard || !launchId || !launchToken) {
    throw new Error('Launch URI must include shard, id, and token.');
  }

  const shardUrl = new URL(shard);
  if (shardUrl.protocol !== 'https:' || !shardUrl.hostname.endsWith('.star-comms.org')) {
    throw new Error('Launch shard must be an HTTPS Star Comms shard.');
  }

  return {
    shardUrl: shardUrl.origin,
    apiBase: `${shardUrl.origin}/api/v1`,
    launchId,
    launchTokenPresent: true
  };
}

let launchInfo;
try {
  launchInfo = parseLaunchInfo(LAUNCH_URL);
} catch (error) {
  console.error(`Invalid STAR_COMMS_LAUNCH_URL: ${error.message}`);
  process.exit(2);
}

async function request(path, options = {}) {
  const headers = {
    Authorization: `Bearer ${OWNER_KEY}`,
    Accept: 'application/json'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${launchInfo.apiBase}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = response.status === 204
    ? null
    : contentType.includes('application/json')
      ? await response.json()
      : await response.text();

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload?.error
      ? payload.error
      : String(payload || response.statusText);
    throw new Error(`${response.status} ${detail}`.trim());
  }

  return payload;
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

const [command = 'status', ...args] = process.argv.slice(2);

try {
  switch (command) {
    case 'info':
      print({
        shardUrl: launchInfo.shardUrl,
        apiBase: launchInfo.apiBase,
        launchId: launchInfo.launchId,
        launchTokenPresent: launchInfo.launchTokenPresent,
        ownerKeyConfigured: true
      });
      break;
    case 'status':
      print(await request('/status'));
      break;
    case 'roster':
      print(await request('/roster'));
      break;
    case 'assignments':
      print(await request('/assignments'));
      break;
    case 'metrics':
      print(await request('/metrics'));
      break;
    case 'ready-status':
      print(await request('/ready-checks/status'));
      break;
    case 'create-net': {
      const name = args.join(' ').trim();
      if (!name) throw new Error('Usage: create-net <name>');
      print(await request('/nets', { method: 'POST', body: { name } }));
      break;
    }
    case 'assign': {
      const [userId, netUid] = args;
      if (!userId || !netUid) throw new Error('Usage: assign <userId> <netUid>');
      print(await request('/assignments', {
        method: 'POST',
        body: { userId: String(userId), netUid: String(netUid), action: 'assign' }
      }));
      break;
    }
    case 'acars': {
      const text = args.join(' ').trim();
      if (!text) throw new Error('Usage: acars <message>');
      print(await request('/acars', {
        method: 'POST',
        body: { text, senderName: 'DNI API Test' }
      }));
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`Star Comms test failed: ${error.message}`);
  process.exit(1);
}
