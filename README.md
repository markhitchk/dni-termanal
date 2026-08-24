# DNI Terminal

DNI Terminal is the Dreadnought Imperium network terminal experience.

## Runtime

The archive side of DNI remains static and local-first. The `ACCESS` command opens DNI records bundled with the application.

DNI Communication now includes a **GitHub Pages Star Comms test mode** inside the full DNI interface. It accepts the complete Star Comms launch URL and an Owner API key at runtime, keeps both values in `sessionStorage` for the current browser tab, parses the launch URL for its shard / launch ID / launch token, and uses the derived shard for direct `/api/v1` Owner API calls.

The Owner API key and complete launch URL are **not committed to this repository**. They are entered on the DNI Communication screen for the current test session.

Supported live test operations include status, roster, assignments, metrics, net creation, ready checks, and ACARS. The Star Comms launch button uses the complete launch URL supplied to the test session.

If the test session is not connected, DNI Communication falls back to its API-contract simulation.

## Development

```bash
npm run build
npm run verify
```

`npm run build` copies source JavaScript and CSS into `public/dist`. GitHub Pages rebuilds the production files during deployment, and `npm run verify` checks the DNI UI, generated bundle, Star Comms test-mode contract, and guards against committing a real-looking Owner API key.

The separate `tests/` harness remains available for command-line/local API checks, but it is not required for the GitHub Pages DNI test mode.

Historical upstream attribution is retained only in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
