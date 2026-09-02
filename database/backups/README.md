# Encrypted production database backups

This directory is reserved for automated **encrypted** DNI Terminal SQLite snapshots produced by the production VPS.

Only ciphertext (`*.enc`) and non-secret snapshot metadata may be committed here. The live `data/dni_terminal.db`, legacy JSON data, raw SQL/database dumps, runtime `.env` files, OAuth credentials, deployment keys, maintenance tokens, GitHub tokens, and encryption keys must never be committed.

Backups are created from the authoritative SQLite database with a consistent `VACUUM INTO` snapshot, verified with `PRAGMA integrity_check`, then encrypted on the VPS with AES-256-CBC using PBKDF2-SHA256 before GitHub receives them. Keep the backup encryption key outside this repository; the repository is public and anyone can download the encrypted blobs.
