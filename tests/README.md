# Star Comms Owner API test harness

This directory is for development/testing only. GitHub Pages deploys only `public/`, so these test files are not published with DNI Terminal.

Both test modes require the same two runtime values:

- `STAR_COMMS_LAUNCH_URL` — the complete `https://star-comms.org/launch?...` link. It is decoded to obtain the `starcomms://launch` shard, launch ID, and launch token.
- `STAR_COMMS_OWNER_KEY` — the Owner API key used as `Authorization: Bearer ...` for `/api/v1` calls.

Neither value is committed to the repository. `.env` is ignored by Git.

The Dreadnought Imperium launch link resolves to:

```text
https://s-dreadnought-imperium.star-comms.org/api/v1
```

The launch token is kept as launch context and is never printed. The Owner API key is the API credential.

## Full DNI local test

This runs the **full DNI interface**, not the small command-line test. It serves the normal `public/` UI locally and injects a test-only overlay that talks to a local Node bridge. The bridge holds the complete Star Comms launch URL and Owner key, so neither secret is exposed in the public GitHub Pages bundle.

### PowerShell

```powershell
$env:STAR_COMMS_LAUNCH_URL = 'YOUR_COMPLETE_STAR_COMMS_LAUNCH_URL'
$env:STAR_COMMS_OWNER_KEY = 'YOUR_OWNER_KEY'
npm run test:full-dni
```

### Bash / macOS / Linux

```bash
export STAR_COMMS_LAUNCH_URL='YOUR_COMPLETE_STAR_COMMS_LAUNCH_URL'
export STAR_COMMS_OWNER_KEY='YOUR_OWNER_KEY'
npm run test:full-dni
```

Then open:

```text
http://127.0.0.1:4173
```

The DNI Communication tab becomes live test mode and supports:

- live status
- live roster
- assignments
- net creation
- ready checks
- ACARS
- a local **Open Star Comms** button that redirects through the complete launch URL

The rest of DNI remains the normal full interface.

## CLI Owner API test

For direct endpoint testing without the full UI:

```bash
npm run test:starcomms -- info
npm run test:starcomms -- status
npm run test:starcomms -- roster
npm run test:starcomms -- assignments
npm run test:starcomms -- metrics
```

Write examples:

```bash
npm run test:starcomms -- create-net "DNI TEST"
npm run test:starcomms -- assign USER_ID NET_UID
npm run test:starcomms -- acars "DNI API test message"
```

Use write tests only when you intentionally want to change live Star Comms state.
