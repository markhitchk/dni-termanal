# Star Comms Owner API test harness

This directory is for development/testing only. GitHub Pages deploys only `public/`, so this test harness is not published with DNI Terminal.

The harness now requires the same two pieces used in the test setup:

- `STAR_COMMS_LAUNCH_URL` — the Star Comms launch link. The script decodes its `starcomms://launch` URI and extracts the shard, launch ID, and confirms a launch token is present.
- `STAR_COMMS_OWNER_KEY` — the Owner API key used as `Authorization: Bearer ...` for `/api/v1` calls.

Neither value should be committed to the repository. `.env` is ignored by Git.

The launch link supplied for Dreadnought Imperium resolves to this shard/API base:

```text
https://s-dreadnought-imperium.star-comms.org/api/v1
```

The launch token is not used as Owner API authentication and is never printed by the test harness. The Owner API key is the API credential.

## PowerShell

```powershell
$env:STAR_COMMS_LAUNCH_URL = 'YOUR_STAR_COMMS_LAUNCH_URL'
$env:STAR_COMMS_OWNER_KEY = 'YOUR_OWNER_KEY'
node tests/star-comms-owner-api.mjs info
node tests/star-comms-owner-api.mjs status
```

## Bash / macOS / Linux

```bash
export STAR_COMMS_LAUNCH_URL='YOUR_STAR_COMMS_LAUNCH_URL'
export STAR_COMMS_OWNER_KEY='YOUR_OWNER_KEY'
node tests/star-comms-owner-api.mjs info
node tests/star-comms-owner-api.mjs status
```

## Read tests

```text
info
status
roster
assignments
metrics
ready-status
```

Examples:

```bash
node tests/star-comms-owner-api.mjs roster
node tests/star-comms-owner-api.mjs metrics
```

## Write tests

Write commands change the live Star Comms shard and require the matching Owner API scopes.

```bash
node tests/star-comms-owner-api.mjs create-net "DNI TEST"
node tests/star-comms-owner-api.mjs assign USER_ID NET_UID
node tests/star-comms-owner-api.mjs acars "DNI API test message"
```

Use write tests only when you intentionally want to change the test shard state.
