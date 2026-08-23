# DNI Terminal

DNI Terminal is the Dreadnought Imperium network terminal experience.

## Runtime

The application is a static, local-first terminal. The `ACCESS` command opens DNI archive records bundled with the application and does not scrape or proxy external lore sites.

## Development

```bash
npm run build
npm run verify
```

`npm run build` copies the committed source JavaScript and CSS into `public/dist`. `npm run verify` checks the DNI branding contract and confirms the built files match source.

Historical upstream attribution is retained only in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
