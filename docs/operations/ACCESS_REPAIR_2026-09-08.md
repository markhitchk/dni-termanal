# DNI Operations access and routing repair

Repair commit: `d45b645e758a7375b905259cee8e8df09559b256`.

The single existing DNI Operations workspace is available at `/operations` and `/operations/`. The LAMP builder now generates its route entrypoint and `public/deploy.php` verifies the route and required source files. The browser router registers Operations instead of falling back to Terminal. A failed API request displays its actual access or availability error rather than silently redirecting an authorized visitor.

## Staff authorization

The Operations-only policy in `server/php/dni-operations-access.php` accepts active authenticated accounts with the existing Owner/Admin authorization, the canonical `developerAdmin` flag, or a Discord user ID in the server-side `DNI_DEVELOPER_DISCORD_IDS` allowlist. It also preserves ordinary membership through the synchronized Imperial member role. Display names, mail domains, URL paths, and client-supplied role labels never establish permission. The global `dni_is_admin_authorized()` policy is unchanged.

Operations staff receive the workspace's administrative capabilities. Existing effective-clearance checks remain in force, and restricted ISB records and case management still require their separate Security-scoped grants. This repair does not add fabricated Discord roles, modify the rank hierarchy, reset sessions, or migrate the database.

## Validation and deployment

The repair passed PHP and JavaScript syntax checks, synthetic authorization regressions, and a fresh LAMP build verifying that `public/operations/index.html` matches the generated main entrypoint. The temporary repair workflow and patch script were removed by the verified commit. The persistent checks are `php tests/operations/verify-access.php` and `node tests/operations/verify-access.js`.

This documentation commit intentionally triggers the repository's existing `Deploy DNI VPS` workflow on main. That workflow verifies the project and invokes `deploy/scripts/github-actions-deploy.sh`, which uses the authenticated POST to `https://www.dreadnoughtimperium.org/deploy.php`. The deployment must be considered complete only after the workflow reports success for this revision. A public HTTP check cannot establish an authenticated user's role access; verify Owner, Admin, and Developer sessions against the Operations API after deployment.
