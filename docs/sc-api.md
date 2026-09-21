# DNI Star Citizen API

The DNI Terminal exposes a StarCitizen-API v1-compatible read API. First-party website code uses the keyless internal route:

`https://www.dreadnoughtimperium.org/api/dni/sc/v1/{mode}/...`

No API key is required for this internal read-only route. The `/api/sc/{apikey}/v1/...` form remains available only for external StarCitizen-API URL compatibility.

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

Without a legacy upstream key, DNI-native resources and the keyless game-data resources above remain functional. Only RSI-account-specific compatibility resources that have no permitted keyless provider require the optional server-side legacy upstream.

The compatibility controller supports ETags, `If-None-Match`, CORS GET access, and per-IP/key rate limiting.

## Bounty Board integration

The Bounty Board reads its public board/detail data through the keyless internal API. Authenticated owner actions such as create, edit, archive, restore, and organization membership changes remain on the CSRF-protected private controller.

The composer can also use `user/{handle}` and `organization/{sid}` lookups to populate profile and organization data without exposing any API key in browser JavaScript.


## Backend providers

The API no longer has a single upstream dependency.

- **DNI database**: bounties, bounty detail, locally known citizens, DNI identities, organizations, and organization members.
- **Star Citizen Wiki API**: keyless game-data backend for ships, versions, crowdfunding stats, starmap systems/locations, items, commodities, missions, manufacturers, and unified game-data search.
- **Optional legacy StarCitizen-API upstream**: server-side only for citizen/organization lookups not already known to DNI and compatibility resources such as roadmap, progress tracker, telemetry, tunnels, and species. The browser never receives this credential.

Provider-backed internal endpoints include:

```text
/api/dni/sc/v1/auto/versions
/api/dni/sc/v1/auto/ships
/api/dni/sc/v1/auto/stats
/api/dni/sc/v1/auto/starmap/systems
/api/dni/sc/v1/auto/starmap/search?name=Stanton
/api/dni/sc/v1/auto/locations?system=Stanton%20System
/api/dni/sc/v1/auto/items?name=railgun
/api/dni/sc/v1/auto/commodities?name=agricium
/api/dni/sc/v1/auto/missions?system=Stanton
/api/dni/sc/v1/auto/manufacturers
/api/dni/sc/v1/auto/search?query=Carrack
/api/dni/sc/v1/auto/health
```

The keyless game-data provider is cached through `data/sc-api-cache`. A transient provider outage falls back to stale cache when available instead of taking down the whole DNI API.
