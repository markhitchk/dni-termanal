# DNI Terminal

DNI Terminal is the Dreadnought Imperium network terminal experience.

## Runtime

The application is a static, local-first terminal. The `ACCESS` command opens DNI archive records bundled with the application and does not scrape or proxy external lore sites.

The public DNI Communication module remains API-contract simulation only. Live Star Comms Owner API testing is isolated under `tests/` and is not deployed by GitHub Pages.

## Development

```bash
npm run build
npm run verify
```

`npm run build` copies the committed source JavaScript and CSS into `public/dist`. `npm run verify` checks the DNI branding contract and confirms the built files match source.

For Star Comms Owner API testing, see `tests/README.md`. The test harness targets the Dreadnought Imperium shard and reads the Owner API key only from a local environment variable.

Historical upstream attribution is retained only in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
