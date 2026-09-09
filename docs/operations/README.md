# DNI Operations — Phase 1 completion

This patch completes the existing unified DNI Operations navigation shell. It is based on `markhitchk/dni-termanal` at commit `81476e690328ace710fe476df50987539988f1bb` and replaces the supplied MariaDB-only Phase 1 migration with a schema compatible with the repository's canonical PHP/SQLite runtime. It does not create a second application, user database, authentication mechanism, or top-level department tabs.

## Scope and architecture

The existing Discord session, synchronized membership roles, personnel roster, rank hierarchy, clearance engine, and document authorization remain authoritative. Operations records use additional tables in the same `data/dni_terminal.db`. The existing JSON-backed `dni_store` remains the source of truth for identities and personnel. The new tables store existing numeric user IDs and canonical department codes; those references are validated through the existing roster because the identities themselves reside in JSON rather than separate relational tables. No Discord role IDs are seeded or fabricated.

The workspace includes the five requested departments, administrative directory editing, training-document references, shared department-owned tasks and contracts, separate Logistics and Engineering inventories, supply requests, Army/Navy equipment catalogs and requisitions, and restricted ISB operation requests. Standard Issue is free, optional aUEC prices are configurable, and no currency is deducted. Images are optional and not required. All operational mutations are server-authorized and use prepared SQL, validation, transactions, CSRF protection, append-only history, and idempotency keys.

### Modified and new files

| Path | Purpose |
| --- | --- |
| `database/migrations/018_dni_operations.sql` | Versioned SQLite schema, constraints, indexes, immutable event triggers. |
| `server/php/dni-operations.php` | Central policy engine, validation, resource reads and transactional workflows. |
| `server-http/operations-data.php` | Authenticated JSON controller with CSRF and error handling. |
| `public/operations-data.php` | Thin public entrypoint to canonical controller. |
| `public/src/js/operations/operations-navigation.js` | Reuses the existing single-tab shell and mounts the completed workspace. |
| `public/src/js/operations/operations-app.js` | Functional department screens, forms, queues, histories and access settings. |
| `public/src/css/operations/operations.css` | Scoped responsive command-and-control styling. |
| `scripts/database/migrate.php` | Runs migration 018 without changing the existing session-preservation policy. |
| `package.json` | Adds `test:operations` to the existing verification chain. |
| `tests/operations/*` | Isolated PHP/SQLite workflow tests and frontend structure checks. |
| `docs/operations/README.md` | This implementation and deployment guide. |
| `docs/operations/permissions.example.json` | Configuration shape without live IDs or secrets. |

### Migration

Run the existing migration command against the same PHP runtime and database used by the application:

```bash
npm run db:migrate
```

Migration 018 creates 20 `dni_ops_*` tables and immutable history triggers. It uses a schema checksum and an immediate SQLite transaction. A previously applied matching schema is a no-op; a checksum mismatch or unversioned partial Operations tables causes a clear failure instead of silently overwriting data. Changes to an already deployed schema require a new migration, not editing migration 018 in place. The existing `dni_store.schema_version` is not repurposed. The migration runner reports `operationsSchemaVersion: 18` separately.

Back up `data/dni_terminal.db` using the existing SQLite backup process before deployment. Do not replace the database with the original MariaDB SQL, run both schemas, or delete existing user/personnel records. No existing user data is migrated or reset. The existing optional session-expiration setting remains disabled by default. The Operations API also initializes this schema for an authenticated user if the normal migration step has not yet run.

### Routes

The public API is `/operations-data.php`. Every request requires the existing authenticated, active, non-Citizen DNI session. POST also requires the existing `X-DNI-CSRF` token and JSON content type. No browser-provided role, clearance, user identity, or department membership is trusted.

| GET resource | Result |
| --- | --- |
| `session` | Effective user, clearance, scoped capabilities and CSRF token. |
| `directory&corp=...` | Authorized department directory and training-document references. |
| `personnel&corp=...` | Authorized current personnel for assignment controls. |
| `tasks&corp=...` | Department tasks/contracts and activity history. |
| `inventory&corp=...` | Authorized owner inventory and, for managers, stock history. |
| `supply-catalog` | Cross-department supply metadata without shared stock totals. |
| `inventory-requests` | Authorized interdepartmental supply requests. |
| `loadout&corp=army/navy` | Branch equipment and Standard Issue configuration. |
| `requisitions` | Own requests or an authorized fulfillment queue. |
| `isb` | Authorized ISB requests; restricted case notes are separately filtered. |
| `settings` | Existing DNI administrators only: scoped grants and audit metadata. |

All writes are POST requests to the same endpoint with an `action`, a random `requestKey`, and the action-specific fields. Actions: `directory.save`, `task.save`, `task.comment`, `inventory.save`, `inventory.adjust`, `loadout.save`, `requisition.submit`, `requisition.map`, `requisition.transition`, `inventory-request.submit`, `inventory-request.transition`, `isb.submit`, `isb.manage`, `isb.note`, and `settings.save`. Replaying an identical request key returns a minimal acknowledgement without reapplying the mutation or disclosing a stale cached response. Reusing a key for different data returns HTTP 409.

### Permission model

| Capability | Default authorization |
| --- | --- |
| Ordinary directory read | Authenticated DNI member, subject to individual record/document clearance. |
| Directory authoring | Existing administrator, or department HC+ with explicit `operations.division.manage` grant. |
| Task/contract read | Own department and sufficient record clearance. Ordinary Security tasks are separate from ISB case records. |
| Task/contract management | O-1+ in the respective department, or an explicitly scoped management grant. |
| Inventory read | Own Logistics/Engineering inventory and sufficient clearance. |
| Inventory management | O-1+ in the owning department, or explicitly scoped management grant. |
| Branch loadout configuration | HC+ leadership of that Army/Navy branch, or existing administrator. |
| Loadout request | Member of the respective Army/Navy branch. |
| Fulfillment | O-1+ Logistics/Engineering manager of the selected queue, or explicitly scoped grant. |
| ISB submission | HC-2, HC-2S, HC-3, or an explicit `operations.isb.submit` grant. |
| ISB review/management | Security membership, officer/HC rank, and explicit `operations.isb.manage` grant; existing administrators still require an explicit ISB grant. |
| Restricted ISB records | Explicit `operations.isb.read_restricted` grant scoped to Security. Case-note authorship additionally requires case assignment or management. |
| Operations access settings | Existing DNI administrator authorization. |

Canonical rank codes are checked directly. Clearance level 4 alone is not treated as O-1, because senior enlisted personnel can share that clearance. Unknown legacy rank codes do not grant officer authority. Active synchronized DNI membership is required; a stored personnel rank alone cannot restore a revoked membership. The established HC-3, HC-2S, HC-2, HC-1 and O-9 through O-1 hierarchy is preserved. No role IDs are invented, and no global administrative access is granted to all officers.

### Administrative configuration

Open DNI Operations → Access Settings using an existing DNI administrator. Grants are scoped by capability and department, with optional existing user IDs or synchronized Discord role IDs. The server rejects malformed IDs, unknown synchronized role IDs, and ISB grants outside Security. The example JSON is only a shape; populate it with the real IDs from the existing roster after verifying the intended access. No secrets, bot tokens, or Discord OAuth credentials belong in this configuration.

Before allowing ISB reviews, choose the actual ISB managers and restricted-case readers. Decide whether any additional authorized personnel should receive the distinct ISB submission grant. Configure directory editors if leadership should edit division pages without a global admin account. Establish the Army and Navy Standard Issue equipment and optional aUEC prices; none are invented or seeded by this patch. Confirm which stock items each fulfillment department owns before mapping requisition lines. The default is separate inventories, not a shared pool.

### Workflow rules

Tasks support task/contract type, descriptions, priorities, deadlines, assignees, status transitions and activity notes. New tasks begin open or assigned; active assignments require personnel. Records use optimistic versions to reject stale edits. Assignees must be active authorized personnel in the owning department with sufficient clearance. Classified records cannot be downgraded without the existing operational classification permission.

Inventory starts at zero. Every adjustment records a reason and an immutable stock-ledger entry. Stock cannot become negative or exceed the configured integer limit. Fulfillment debits are aggregated by inventory item and committed with status and history in one transaction. Requisition lines preserve equipment names, quantities, Standard Issue flags and optional cost quotes at submission time. Approval does not reserve stock or deduct aUEC; fulfillment requires a valid mapping to active stock in the assigned queue. Insufficient stock rolls back the entire fulfillment. Interdepartmental supply requests are tracked separately and issue stock from the owner; they do not silently merge the two inventories or credit a receiving inventory without an explicit receipt workflow.

ISB requests support Investigations, Field Ops and Reconnaissance, review, assignment, active/completed/rejected states and immutable case notes. Submitters may view their own permitted request summary/status, but not restricted notes or internal case activity. Restricted records are never included in ordinary department task listings. Case notes remain in the server-side database, not browser assets. The existing SQLite file permissions, encrypted backups, and operational access controls should protect that database; this patch does not claim application-level encryption or introduce a separate evidence-upload system.

### Verification and deployment

Run the new tests and the repository's existing checks before deploying:

```bash
npm run test:operations
npm run verify
npm run build
npm run db:migrate
```

The isolated backend suite executes the actual Operations SQL and PHP engine against a disposable SQLite database and synthetic roster. It covers rank boundaries, cross-department access, tasks, inventory, idempotency, fulfillment rollback, Standard Issue pricing, supply coordination, ISB authorization, immutable notes and integrity. A test-only SQLite FFI adapter is available when `pdo_sqlite` is absent in the test environment; production still requires the repository's existing PDO SQLite driver. The UI checks verify module syntax, a single navigation tab, API action wiring, safe DOM construction and responsive CSS breakpoints. The optional browser fixture under `tests/operations/browser/` uses synthetic responses only and is not production code.

This package was prepared without a full local checkout of the repository, so the existing project-wide build/regression suite and real Discord/live-server integration could not be completed here. Do not treat those checks as passed. Apply the patch to a clean checkout, run the commands above and review the changes before merging or deploying. No live database, Discord roles, currency balance, or production website is modified by the patch package itself.

### Rollback

Before migration, retain a SQLite backup. If application behavior fails, revert the application commit and restore the pre-migration database when a full rollback is required. Do not manually delete Operations tables after live records have been created; use a planned migration or restore procedure. Existing user and service data must remain intact. The patch does not alter the deployment ownership protections or remove generated pages.
