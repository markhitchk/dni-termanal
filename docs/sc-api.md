# DNI Star Citizen API

The DNI Terminal exposes a StarCitizen-API v1-compatible read API at:

`https://www.dreadnoughtimperium.org/api/sc/{apikey}/v1/{mode}/...`

The public website can use the read-only key `public`. Additional keys can be configured with `DNI_SC_API_KEYS` or `DNI_SC_API_KEY`.

## Compatibility

The response envelope matches the StarCitizen-API v1 website API:

```json
{
  "message": "ok",
  "success": 1,
  "source": "dni",
  "data": {}
}
```

Supported modes are `live`, `cache`, `auto`, and `eager`.

## Star Citizen resource routes

- `/user/{handle}`
- `/organization/{sid}`
- `/organization_members/{sid}`
- `/versions`
- `/ships`
- `/roadmap/{board}`
- `/progress-tracker`
- `/progress-tracker/{team_slug}`
- `/stats`
- `/telemetry/{version}`
- `/starmap/systems`
- `/starmap/tunnels`
- `/starmap/species`
- `/starmap/affiliations`
- `/starmap/object`
- `/starmap/star-system`
- `/starmap/search`

Example:

```text
/api/sc/public/v1/auto/organization/DNI
/api/sc/public/v1/auto/starmap/systems?name=Stanton
/api/sc/public/v1/cache/ships?classification=combat
```

## DNI-native extensions

- `/bounties` — active DNI bounty records
- `/bounty/{code}` — one bounty record
- `/dni/organizations` — organizations registered with the DNI Bounty Network
- `/status` — compatibility layer/cache status

Examples:

```text
/api/sc/public/v1/auto/bounties
/api/sc/public/v1/auto/bounty/E9NDTD
/api/sc/public/v1/auto/dni/organizations
```

## Data source and caching

DNI-owned data is read directly from the DNI database. External Star Citizen resources are cache-first.

For optional live upstream refreshes configure:

- `DNI_SC_API_UPSTREAM_KEY`
- `DNI_SC_API_UPSTREAM_BASE` (defaults to `https://api.starcitizen-api.com`)
- `DNI_SC_API_RATE_LIMIT` (requests/minute, default 120)

Without an upstream key, DNI-native resources remain fully functional and external resources can still be served from previously populated cache data.

The compatibility controller supports ETags, `If-None-Match`, CORS GET access, and per-IP/key rate limiting.
