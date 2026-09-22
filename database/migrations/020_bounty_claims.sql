PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dni_bounty_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bounty_id INTEGER,
    bounty_public_id TEXT NOT NULL COLLATE NOCASE,
    claimant_user_id INTEGER NOT NULL,
    claimant_name_snapshot TEXT NOT NULL,
    proof_summary TEXT NOT NULL,
    proof_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected','withdrawn')),
    reviewer_user_id INTEGER,
    reviewer_note TEXT,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bounty_id) REFERENCES dni_bounties(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dni_bounty_claims_bounty_status
    ON dni_bounty_claims(bounty_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_dni_bounty_claims_claimant
    ON dni_bounty_claims(claimant_user_id, status, submitted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dni_bounty_claims_one_pending_per_user
    ON dni_bounty_claims(bounty_id, claimant_user_id)
    WHERE status='pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dni_bounty_claims_one_approved
    ON dni_bounty_claims(bounty_public_id)
    WHERE status='approved';
