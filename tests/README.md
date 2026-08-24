# Star Comms Owner API test harness

This directory is for development/testing only. GitHub Pages deploys only `public/`, so this test harness is not published with DNI Terminal.

The harness targets the Dreadnought Imperium shard:

```text
https://s-dreadnought-imperium.star-comms.org/api/v1
```

The Owner API key is read only from the local `STAR_COMMS_OWNER_KEY` environment variable. Do not add a real key to this repository.

## PowerShell

```powershell
$env:STAR_COMMS_OWNER_KEY = 'YOUR_ROTATED_OWNER_KEY'
node tests/star-comms-owner-api.mjs status
```

## Bash / macOS / Linux

```bash
export STAR_COMMS_OWNER_KEY='YOUR_ROTATED_OWNER_KEY'
node tests/star-comms-owner-api.mjs status
```

## Read tests

```text
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
