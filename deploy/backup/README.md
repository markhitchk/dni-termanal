# DNI database backups

This subsystem creates encrypted backups on the Rocky Linux VPS and pushes them to a **separate private GitHub repository**. The public `markhitchk/dni-termanal` source repository is intentionally blocked as a backup destination.

## What is backed up

- `data/dni-embedded.json` when present.
- The configured MariaDB database when `DNI_DB_USER` and `DNI_DB_PASSWORD` are present and the existing VPS provides `mariadb-dump` or `mysqldump`.

Runtime secrets are deliberately excluded: `data/dni-runtime.env`, Discord OAuth secrets, deploy keys, maintenance bypass tokens, and the GitHub backup token are never copied into the backup payload.

Every database payload is compressed and then encrypted with AES-256-CBC using PBKDF2-SHA256 before GitHub sees it. The backup branch contains a configurable number of snapshots (14 by default) and is force-rewritten as a single-root snapshot branch so encrypted database blobs do not build an unbounded visible Git history.

## Setup

Create a separate **private** repository, then run on the VPS:

```bash
sudo /opt/dni-terminal/deploy/backup/configure-backups.sh
```

The helper asks for the private `owner/repo`, a fine-grained GitHub PAT, and an encryption key/passphrase. The PAT should be limited to that backup repository with repository **Contents: Read and write**. The token and encryption key are stored only in `/etc/dni-terminal/backup.env` with root-only permissions.

If the helper generates the encryption key, save that key somewhere off the VPS. Without it, encrypted backups cannot be restored after total VPS loss.

## Schedule and status

The systemd timer runs once daily around 04:10 UTC with up to 15 minutes of randomized delay.

```bash
sudo systemctl status dni-db-backup.timer
sudo systemctl start dni-db-backup.service
sudo journalctl -u dni-db-backup.service -n 100 --no-pager
```
