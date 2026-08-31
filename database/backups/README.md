# Encrypted production database backups

This directory is reserved for automated **encrypted** DNI Terminal database snapshots produced by the production VPS.

Only ciphertext (`*.enc`) and non-secret snapshot metadata may be committed here. Raw MariaDB SQL, raw `dni-embedded.json`, runtime `.env` files, OAuth credentials, deployment keys, maintenance tokens, GitHub tokens, and encryption keys must never be committed.

Backups are encrypted on the VPS with AES-256-CBC using PBKDF2-SHA256 before GitHub receives them. Keep the backup encryption key outside this repository; the repository is public and anyone can download the encrypted blobs.
