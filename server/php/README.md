# DNI PHP Backend Layout

The PHP backend is grouped by subsystem without changing the stable Rocky Linux/Apache runtime paths.

- `core/` — aliases for shared API and embedded-runtime helpers.
- `auth/` — authorization helpers.
- `admin/` — server-side Admin/auth role registry configuration.
- `clearance/` — clearance engine, mutation capabilities, and clearance administration.
- `documents/` — classified document access and document workflow.
- `mail/` — DNI Mail backend logic.
- `operations/` — operational security and classification filtering.

The real runtime files remain at `server/php/*.php`. The live Apache/PHP deployment, public endpoint loaders, migration checks, and regression tests already depend on these stable paths. During Patch 5 testing, making those runtime paths Git symlinks passed CI but caused a live PHP 500 on the Admin API, so production keeps them as regular files.

The subsystem folders are Git aliases back to the stable runtime files. This provides organized browsing without duplicating backend implementation or changing any public/runtime include path.

`server/php/dni.php` remains the root bootstrap and continues to define `DNI_ROOT` from its established directory.

New backend work should be classified by the matching subsystem. A future runtime-path migration must use real PHP compatibility loaders and pass both CI and the live API smoke suite before the flat runtime paths can be retired.
