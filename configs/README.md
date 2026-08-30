# Configuration Layout

DNI configuration is grouped by purpose.

- `deploy/` — deployment metadata and deployment stamps.
- `integrations/` — external integration configuration such as Star Comms.
- `app/` — reserved for application-level configuration.
- `discord/` — reserved for Discord-specific application configuration that is not owned by the standalone bot folder.

The previous top-level config filenames remain as Git symlinks for compatibility during the staged repository cleanup.
