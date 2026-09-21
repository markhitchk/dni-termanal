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

The first-party backend follows the same RSI request flow used by the public RSI-Scraper project that powers starcitizen-api.com, but is implemented independently in PHP:

- `GET https://robertsspaceindustries.com/citizens/{handle}` — citizen profile.
- `GET https://robertsspaceindustries.com/citizens/{handle}/organizations` — citizen affiliations.
- `GET https://robertsspaceindustries.com/orgs/{sid}` — organization page/details.
- `POST https://robertsspaceindustries.com/api/orgs/getOrgs` — organization search metadata.
- `POST https://robertsspaceindustries.com/api/orgs/getOrgMembers` — paginated organization members.

RSI requests use an English locale, `Cache-Control: no-cache`, an empty `Rsi-Token` cookie, and the DNI API user-agent. Returned HTML/JSON fragments are parsed server-side into the v1-compatible response shape and cached by DNI. The browser never contacts RSI directly.

The compatibility controller supports ETags, `If-None-Match`, CORS GET access, and per-IP/key rate limiting.

## Bounty Board integration

The Bounty Board reads its public board/detail data through the keyless internal API. Authenticated owner actions such as create, edit, archive, restore, and organization membership changes remain on the CSRF-protected private controller.

The composer can also use `user/{handle}` and `organization/{sid}` lookups to populate profile and organization data without exposing any API key in browser JavaScript.


## Backend providers

The API no longer has a single upstream dependency.

- **DNI database**: bounties, bounty detail, registered organizations, local identities, and fallback records.
- **DNI RSI parser**: DNI-owned citizen, affiliation, organization, and organization-member lookup using the same public RSI page/API request pattern as RSI-Scraper. No third-party StarCitizen-API service or API key is involved.
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


### RSI identity scraping compatibility

The DNI citizen/organization backend now mirrors the request flow used by the public `RSI-Scraper` project that powered the unofficial StarCitizen-API identity endpoints, while remaining implemented in DNI PHP code:

- Citizen profile: `GET https://robertsspaceindustries.com/citizens/{handle}`
- Citizen affiliations: `GET https://robertsspaceindustries.com/citizens/{handle}/organizations`
- Organization page: `GET https://robertsspaceindustries.com/orgs/{sid}`
- Organization search metadata: `POST https://robertsspaceindustries.com/api/orgs/getOrgs`
- Organization members: `POST https://robertsspaceindustries.com/api/orgs/getOrgMembers` with 32-member pages

RSI requests send an English locale, `Cache-Control: no-cache`, an empty `Rsi-Token` cookie, and the DNI API user agent. Citizen parsing uses the profile section's `thumb` image rather than guessing from unrelated RSI media. Organization-member requests support `page`, `rank`, `role`, and `main_org` filters.


## RSI-Scraper-compatible identity fields

Citizen results include the same core fields the reference scraper extracts: page URL/title, citizen record ID, display name, handle, badge/badge image, exact Profile thumbnail image, main organization image/name/SID/rank/stars, enlist date, structured location, fluency, website, bio, and organization affiliations.

Organization results merge the RSI organization page with `getOrgs` metadata: logo, name/SID, focus, banner, headline/history/manifesto/charter, archetype, language, commitment, recruiting, roleplay, and member count.

Organization-member results use `getOrgMembers` with the same 32-member page size and support `page`, `rank`, `role`, and `main_org` filters.
