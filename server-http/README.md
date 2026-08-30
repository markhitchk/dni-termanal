# DNI Private HTTP Controllers

`server-http/` contains the PHP application controllers that back legacy/public DNI URLs.

Apache serves only `public/`. Files in this directory are private runtime implementation files and are loaded through thin compatibility controllers such as `public/dashboard-data.php` or `public/admin-secure.php`.

Rules:

- Keep browser-facing URLs stable in `public/`.
- Keep reusable domain logic in `server/php/`.
- Keep request/response orchestration in `server-http/`.
- Do not expose `server-http/` through Apache aliases or rewrites.
- Public compatibility controllers should contain no business logic; they should only load the matching private implementation.
- When adding a new controller, add it to `tests/regression/verify-http-controllers.js` so CI verifies the private/public pairing.

This layout deliberately keeps the private controllers at repository root level because their existing `../server/php/...` includes remain valid there, avoiding another risky PHP runtime-path migration on Rocky Linux.
