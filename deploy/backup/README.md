# DNI database backups

The production Rocky Linux VPS writes encrypted database snapshots back to this repository under:

`database/backups/`

The repository is public, so **raw database contents are never committed**. Database payloads are compressed and encrypted on the VPS before GitHub receives them.

## What is backed up

- `data/dni-embedded.json` when present.
- The configured MariaDB database when `DNI_DB_USER` and `DNI_DB_PASSWORD` are present and the existing VPS provides `mariadb-dump` or `mysqldump`.

Runtime secrets are deliberately excluded: `data/dni-runtime.env`, Discord OAuth secrets, deploy keys, maintenance bypass tokens, the GitHub backup token, and the backup encryption key are never copied into a backup payload.

Each database payload is encrypted with AES-256-CBC using PBKDF2-SHA256 (250,000 iterations). The backup folder retains 14 snapshots by default. Because the repository is public, use a strong random encryption key and keep that key somewhere outside GitHub and outside the VPS.

## GitHub token

Use a fine-grained GitHub personal access token restricted to `markhitchk/dni-termanal` with repository **Contents: Read and write** permission. Do not commit the token into any file.

The VPS setup helper stores the token in `/etc/dni-terminal/backup.env` with root-only permissions:

```bash
sudo /opt/dni-terminal/deploy/backup/configure-backups.sh
```

The helper also asks for the backup encryption key. If left blank, it generates a 64-character recovery key. Save that recovery key somewhere off the VPS; without it, encrypted backups cannot be restored after a total VPS loss.

You may also keep the PAT in GitHub Actions as a repository secret named `DNI_BACKUP_GITHUB_TOKEN`, but GitHub Actions secrets are not automatically readable by the VPS. The server still needs the one-time backup configuration above unless a future secret-sync path is explicitly configured.

## Schedule and status

The systemd timer runs once daily around 04:10 UTC with up to 15 minutes of randomized delay.

```bash
sudo systemctl status dni-db-backup.timer
sudo systemctl start dni-db-backup.service
sudo journalctl -u dni-db-backup.service -n 100 --no-pager
```

Backup-only commits under `database/backups/**` are excluded from the normal production deployment trigger so the backup process does not create a deploy loop.
