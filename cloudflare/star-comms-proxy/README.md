# DNI Star Comms Cloudflare Worker

This Worker keeps the Star Comms Owner API key out of GitHub Pages and browser JavaScript.

## Required Cloudflare secrets

Do not commit either value to GitHub.

```bash
npx wrangler login
npx wrangler secret put STAR_COMMS_API_KEY
npx wrangler secret put STAR_COMMS_SHARD_URL
npx wrangler deploy
```

`STAR_COMMS_API_KEY` must be a newly rotated Star Comms Owner key. A key pasted into chat, an issue, a commit, browser JavaScript, or any other public/client-side location should be treated as exposed and revoked.

`STAR_COMMS_SHARD_URL` is the shard base URL, for example `https://your-shard.example.com` without `/api/v1` at the end.

The Worker allows requests from `https://markhitchk.github.io` and forwards only the Star Comms routes DNI uses.

## DNI connection

After deployment, open DNI Terminal and run:

```text
starcomms proxy https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
starcomms refresh
```

The Worker URL is public configuration and is safe to store in the browser. The Owner API key is never sent to DNI.

## Write operations

Writes are disabled by default. This prevents anyone visiting the public GitHub Pages site from creating nets, changing assignments, starting ready checks, or sending ACARS through your Owner key.

To enable writes safely, protect the Worker with Cloudflare Access, then configure these Worker variables:

- `ENABLE_DNI_WRITES=true`
- `REQUIRE_CF_ACCESS_FOR_WRITES=true`
- `CF_ACCESS_TEAM_DOMAIN=https://YOUR-TEAM.cloudflareaccess.com`
- `CF_ACCESS_AUD=YOUR_ACCESS_APPLICATION_AUD`

The Worker verifies the Cloudflare Access JWT before forwarding a write request. Do not disable Access protection for a public deployment.
