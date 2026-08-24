# DNI Terminal

DNI Terminal is the Dreadnought Imperium network terminal experience.

## Runtime

The archive side of DNI is static and local-first. The `ACCESS` command opens DNI records bundled with the application and does not scrape or proxy external lore sites.

DNI Communication supports Star Comms directly from GitHub Pages by using Star Comms' documented public website API. The browser calls `/api/v1/embed/status?token=...` with a Star Comms public token. The Owner API key is not stored in GitHub, localStorage, HTML, or browser JavaScript.

## Development

```bash
npm run build
npm run verify
```

`npm run build` copies source JavaScript and CSS into `public/dist`. GitHub Pages rebuilds those production files during deployment and `npm run verify` confirms the source, generated bundle, DNI branding contract, and Star Comms browser-safety rules.

## Star Comms public website API

Star Comms documents this public-site flow:

1. Use the Owner API outside the browser to request `/api/v1/public-token` with a key that has `read:status`.
2. Use the returned public token on the website with `/api/v1/embed/status?token=...` or `/api/v1/embed/widget?token=...`.
3. Never put an Owner `scok_` key in GitHub Pages JavaScript.

After you have the shard URL and public token, open DNI Terminal and run:

```text
starcomms public https://YOUR-SHARD.example.com YOUR_PUBLIC_TOKEN
starcomms refresh
```

DNI stores only the shard URL and public website token locally in the browser. Public live mode is intentionally read-only; owner actions remain simulation-only on GitHub Pages.

Historical upstream attribution is retained only in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
