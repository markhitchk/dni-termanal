# DNI Terminal

DNI Terminal is the Dreadnought Imperium network terminal experience.

## Runtime

The archive side of DNI is static and local-first. The `ACCESS` command opens DNI records bundled with the application and does not scrape or proxy external lore sites.

DNI Communication is configured for the Dreadnought Imperium Star Comms shard:

```text
https://s-dreadnought-imperium.star-comms.org/api/v1
```

The communication panel can open a direct Star Comms Owner API session. The Owner API key is entered into a password field at runtime and is kept only in `sessionStorage` for the current browser tab. No real Owner API key is committed to this repository or built into GitHub Pages.

## Star Comms Owner API

Star Comms documents the Owner API as the shard URL plus `/api/v1/...`, authenticated with an Owner key in the `Authorization: Bearer ...` header.

DNI currently integrates these Owner API operations:

- `GET /api/v1/status` — operation state, nets, occupancy and TX
- `GET /api/v1/roster` — connected personnel
- `GET /api/v1/assignments` — stored assignment map
- `GET /api/v1/ready-checks/status` — ready-check state
- `GET /api/v1/metrics` — metrics when the key has access
- `POST /api/v1/assignments` — assign personnel to nets
- `POST /api/v1/nets` — create nets
- `POST /api/v1/ready-checks` + `/start` — create/start a DNI ready check
- `POST /api/v1/acars` — send an ACARS alert

The Owner key must contain the corresponding Star Comms scopes for each action. If a scope is missing, DNI displays the API error returned by the shard.

### Connecting

1. Open **DNI Communication**.
2. Enter the Star Comms Owner API key in **Owner API key · current tab only**.
3. Select **Connect**.
4. DNI immediately refreshes the live shard state.

Select **Disconnect** to remove the key from the tab session and return to simulation mode.

Because this is a static GitHub Pages application, the Owner key exists in browser memory/session storage while connected. Star Comms recommends public website widgets for public read-only pages; use this Owner API mode only from a trusted admin browser session and never hard-code the key into repository files.

## Development

```bash
npm run build
npm run verify
```

`npm run build` copies source JavaScript and CSS into `public/dist`. GitHub Pages rebuilds those production files during deployment and `npm run verify` confirms the source, generated bundle, DNI branding contract, fixed Dreadnought Imperium shard, tab-session key storage, and checks that no real-looking Owner API key was committed.

Historical upstream attribution is retained only in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
