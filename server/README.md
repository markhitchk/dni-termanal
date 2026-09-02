# DNI Server Runtime

The production website is Apache/PHP first. The Node runtime remains as a compatibility bridge for localhost deployment handoff and optional static serving, but it no longer owns a separate application database or JSON state file.

## Application persistence

All application API, authentication, Developer Terminal PHP, and other PHP endpoint requests received by the Node compatibility runtime are forwarded to the canonical Apache/PHP runtime. Apache/PHP persists through the single authoritative SQLite database:

`data/dni_terminal.db`

The Node runtime does not read or write `dni-network.json`, does not use `DNI_DB_USER` / `DNI_DB_PASSWORD`, and does not provide a MariaDB fallback. Its local `/node-healthz` endpoint reports the compatibility process itself; `/api/dni/*` health and application endpoints are handled by canonical PHP/SQLite.

## Layout

- `php/` — canonical PHP backend/runtime modules and SQLite storage layer.
- `runtime/node/server.mjs` — canonical Node compatibility entrypoint.
- `runtime/node/deploy.mjs` — canonical Node deployment bridge entrypoint.
- `runtime/node/runtime-env.mjs` — canonical runtime environment loader.
- `dni-server.mjs`, `dni-deploy.mjs`, and `runtime-env.mjs` — legacy implementation paths retained for compatibility while existing VPS callers migrate.

`npm start` and `npm run start:vps` use the canonical `server/runtime/node/` entrypoints. The systemd unit continues to call `npm run start:vps`, so no service-file or VPS command change is required.

The Node deployment bridge must remain reachable on the local runtime because the Apache/PHP deploy endpoint may hand off a pending runtime update to `http://127.0.0.1:8080/deploy.php`.
