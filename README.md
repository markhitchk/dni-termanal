# DNI Terminal

**Dreadnought Imperium**  
**Tag:** `DNI`

DNI Terminal is the Dreadnought Imperium-branded direct access terminal, currently being adapted for GitHub Pages.

## Live site

https://markhitchk.github.io/dni-termanal/

## Rebrand status

- DNI Terminal product name
- Dreadnought Imperium organization branding
- DNI Direct Access Terminal shell text
- DNI Communications / Services / Dashboard naming where present
- GitHub Pages project-path support
- Current logo replacement: **pending**

The first rebrand pass intentionally does **not** blindly replace every `SCP` reference. SCP/database/lore identifiers are being kept intact until they can be reviewed separately so functionality and content are not accidentally broken.

## Deployment

The GitHub Pages workflow mirrors the current public terminal frontend, adapts Vite assets for `/dni-termanal/`, applies DNI shell branding, removes credentials that GitHub Push Protection will not permit to be republished, and deploys the result through GitHub Pages.

## Upstream source and licensing

This project began from the public SCiPNET Direct Access Terminal project. Upstream/source details are recorded in [`UPSTREAM_SOURCE.md`](UPSTREAM_SOURCE.md).

Original UI/CSS licensing terms are retained in [`public/codepen.txt`](public/codepen.txt). Existing upstream license/attribution files should remain preserved while DNI-specific branding and code are added.
