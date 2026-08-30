# DNI PHP Backend Layout

The PHP backend is organized by subsystem while legacy flat paths remain available as compatibility symlinks.

- `core/` — runtime helpers, embedded database runtime, and shared API helpers.
- `auth/` — authorization and session-role authorization helpers.
- `admin/` — server-side Admin/auth role registry configuration.
- `clearance/` — clearance engine, mutation capabilities, and clearance administration.
- `documents/` — classified document access and document workflow.
- `mail/` — DNI Mail backend logic.
- `operations/` — operational security and classification filtering.

`server/php/dni.php` intentionally remains at the backend root because it is the stable bootstrap that defines `DNI_ROOT`. `core/dni.php` is a compatibility alias to that root bootstrap.

Existing files such as `server/php/dni-mail.php` and `server/php/dni-clearance.php` are retained as Git symlinks so current public endpoints, tests, deployment scripts, and third-party references continue to work while implementation files live in their subsystem directories.

New backend implementation code should be added to the appropriate subsystem directory instead of the flat `server/php/` root.
