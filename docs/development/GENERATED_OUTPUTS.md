# Generated frontend outputs

Keep the canonical source under `public/src/` and build scripts under `scripts/`. The generated frontend bundle and SPA entrypoints are not source files and should not be committed.

The `.gitignore` lists the generated web paths. Source PHP endpoints, authored static pages, logos and emblems, uploads, database files, and backup snapshots are not part of this cleanup.

Removing generated files from Git does not remove untracked files already on the VPS or repair filesystem permissions. A deployment still needs permission to write its build outputs. Do not delete runtime data or broaden filesystem permissions to work around a build failure.
