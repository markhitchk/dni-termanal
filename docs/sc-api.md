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

Citizen and organization lookups are implemented by the DNI backend itself against public RSI pages. No StarCitizen-API key or third-party citizen/organization API is used.

The first-party backend requests:

- `https://robertsspaceindustries.com/en/citizens/{handle}`
- `https://robertsspaceindustries.com/en/orgs/{sid}`
- `https://robertsspaceindustries.com/en/orgs/{sid}/members`

Those pages are parsed server-side into the DNI v1-compatible JSON envelope and cached by DNI. The browser never contacts RSI directly.

The compatibility controller supports ETags, `If-None-Match`, CORS GET access, and per-IP/key rate limiting.

## Bounty Board integration

The Bounty Board reads its public board/detail data through the keyless internal API. Authenticated owner actions such as create, edit, archive, restore, and organization membership changes remain on the CSRF-protected private controller.

The composer can also use `user/{handle}` and `organization/{sid}` lookups to populate profile and organization data without exposing any API key in browser JavaScript.


## Backend providers

The API no longer has a single upstream dependency.

- **DNI database**: bounties, bounty detail, registered organizations, local identities, and fallback records.
- **DNI RSI parser**: DNI-owned citizen, organization, and organization-member lookup directly from public RSI pages. No third-party StarCitizen-API service or API key is involved.
- **Star Citizen Wiki API**: keyless game-data backend for ships, versions, crowdfunding stats, starmap systems/locations, items, commodities, missions, manufacturers, and unified game-data search.

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


## Citizen / organization lookup behavior

The four v1 modes apply to RSI-backed resources too:

- `live` — fetch the public RSI page now, parse it, and refresh DNI cache.
- `cache` — return DNI cache only; never contact RSI.
- `auto` — use fresh DNI cache first; fetch RSI when cache is missing/expired.
- `eager` — fetch RSI first; fall back to DNI cache if the live request fails.

Example:

```text
/api/dni/sc/v1/auto/user/StarCitizens
/api/dni/sc/v1/live/organization/ORG
/api/dni/sc/v1/cache/organization_members/ORG
```
