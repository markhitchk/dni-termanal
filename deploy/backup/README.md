# DNI database backups

The production Rocky Linux VPS writes encrypted database snapshots back to this repository under:

`database/backups/`

The repository is public, so **raw database contents are never committed**. Database payloads are compressed and encrypted on the VPS before GitHub receives them.

## Zero-touch setup

The VPS already downloads the full `markhitchk/dni-termanal` repository during normal deployment. No separate VPS setup script is required for the normal backup path.

GitHub Actions securely synchronizes the backup credentials to the deployed VPS, then the VPS runs `deploy/backup/backup-databases.sh` and pushes the encrypted snapshot back to `main/database/backups/`.

The automatic workflow runs:

- after a successful production `Deploy DNI VPS` workflow,
- every day at 04:10 UTC,
- or manually through **Actions → Backup DNI Databases → Run workflow**.

Backup-only commits under `database/backups/**` are ignored by the normal deploy workflow, preventing a backup/deploy loop.

## Required GitHub repository secrets

Add these under **Settings → Secrets and variables → Actions → Repository secrets**:

- `DNI_BACKUP_GITHUB_TOKEN` — a fine-grained GitHub PAT restricted to `markhitchk/dni-termanal` with repository **Contents: Read and write**.
- `DNI_BACKUP_ENCRYPTION_KEY` — a strong random recovery key of at least 32 characters. A 64-character random value is recommended.

`STAR_COMMS_OWNER_KEY` remains the authentication key used by GitHub Actions to reach the protected VPS synchronization and backup endpoints.

The GitHub token and encryption key are synchronized over HTTPS to the VPS and written only to ignored private runtime data under `data/`. They are never included in a backup commit or API response.

Keep a separate copy of `DNI_BACKUP_ENCRYPTION_KEY`. If the VPS and GitHub Actions secret are both lost, the encrypted database backups cannot be recovered.

## What is backed up

- `data/dni-embedded.json` when present.
- The configured MariaDB database when `DNI_DB_USER` and `DNI_DB_PASSWORD` are present and the existing VPS provides `mariadb-dump` or `mysqldump`.

Runtime secrets are deliberately excluded: `data/dni-runtime.env`, Discord OAuth secrets, deploy keys, maintenance bypass tokens, the GitHub backup token, and the backup encryption key are never copied into a backup payload.

Each database payload is encrypted with AES-256-CBC using PBKDF2-SHA256 (250,000 iterations). The backup folder retains 14 snapshots by default.

## Optional legacy/local service

The checked-in systemd helper remains available for an administrator who specifically wants a VPS-local timer independent of GitHub Actions, but it is not required for production backups. The supported zero-touch path is `.github/workflows/database-backup.yml` plus the protected VPS backup endpoints.
