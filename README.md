# DNI Terminal

DNI Terminal is the Dreadnought Imperium network terminal experience.

## Runtime

The archive side of DNI is static and local-first. The `ACCESS` command opens DNI records bundled with the application and does not scrape or proxy external lore sites.

DNI Communication can optionally connect to Star Comms through the Cloudflare Worker in `cloudflare/star-comms-proxy`. The GitHub Pages browser code never stores or sends the Star Comms Owner API key directly; it only talks to the Worker URL. Without a configured Worker, the communication panel stays in API-contract simulation mode.

## Development

```bash
npm run build
npm run verify
```

`npm run build` copies source JavaScript and CSS into `public/dist`. GitHub Pages rebuilds those production files during deployment and `npm run verify` confirms the source, generated bundle, DNI branding contract, and Star Comms secret-safety rules.

## Star Comms

See `cloudflare/star-comms-proxy/README.md` for Worker deployment and configuration. Store `STAR_COMMS_API_KEY` and `STAR_COMMS_SHARD_URL` as Cloudflare Worker secrets, not GitHub Secrets or browser configuration.

Historical upstream attribution is retained only in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
