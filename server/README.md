# DNI Server Runtime

The production website is Apache/PHP first. The Node runtime remains as a compatibility/runtime bridge for localhost deployment handoff and selected API/static fallback behavior.

## Layout

- `php/` — PHP backend compatibility/runtime modules.
- `runtime/node/server.mjs` — canonical Node runtime entrypoint.
- `runtime/node/deploy.mjs` — canonical Node deployment bridge entrypoint.
- `runtime/node/runtime-env.mjs` — canonical runtime environment loader.
- `dni-server.mjs`, `dni-deploy.mjs`, and `runtime-env.mjs` — legacy implementation paths retained for compatibility while existing VPS callers migrate.

`npm start` and `npm run start:vps` use the canonical `server/runtime/node/` entrypoints. The systemd unit continues to call `npm run start:vps`, so no service-file or VPS command change is required.

The Node deployment bridge must remain reachable on the local runtime because the Apache/PHP deploy endpoint may hand off a pending runtime update to `http://127.0.0.1:8080/deploy.php`.
