PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dni_bounty_organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_tag TEXT NOT NULL COLLATE NOCASE UNIQUE,
    org_name TEXT NOT NULL,
    rsi_url TEXT,
    logo_url TEXT,
    discord_role_id TEXT UNIQUE,
    verification_status TEXT NOT NULL DEFAULT 'self_declared'
        CHECK (verification_status IN ('verified','self_declared','pending','disabled')),
    created_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dni_bounty_org_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    membership_source TEXT NOT NULL DEFAULT 'self_declared'
        CHECK (membership_source IN ('discord_role','self_declared','admin_verified')),
    membership_status TEXT NOT NULL DEFAULT 'self_declared'
        CHECK (membership_status IN ('verified','self_declared','pending','revoked')),
    member_role TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, user_id),
    FOREIGN KEY (organization_id) REFERENCES dni_bounty_organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dni_bounties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    public_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
    creator_user_id INTEGER NOT NULL,
    issuer_name_snapshot TEXT NOT NULL,
    organization_id INTEGER,
    organization_name_snapshot TEXT,
    organization_tag_snapshot TEXT,
    organization_membership_status TEXT,
    target_name TEXT NOT NULL,
    target_handle TEXT,
    wanted_status TEXT NOT NULL
        CHECK (wanted_status IN ('WANTED','DEAD_OR_ALIVE','ALIVE_ONLY')),
    reward_amount INTEGER NOT NULL DEFAULT 0 CHECK (reward_amount >= 0),
    reward_currency TEXT NOT NULL DEFAULT 'aUEC',
    charges TEXT,
    last_known_location TEXT,
    description TEXT,
    target_image_url TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','archived')),
    archived_at TEXT,
    archived_by_user_id INTEGER,
    discord_message_id TEXT,
    discord_sync_status TEXT NOT NULL DEFAULT 'not_sent'
        CHECK (discord_sync_status IN ('not_sent','synced','failed','archived','deleted')),
    discord_last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES dni_bounty_organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dni_bounties_status_created
    ON dni_bounties(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dni_bounties_creator
    ON dni_bounties(creator_user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dni_bounties_org
    ON dni_bounties(organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS dni_bounty_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bounty_id INTEGER,
    public_id TEXT NOT NULL,
    actor_user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dni_bounty_audit_public
    ON dni_bounty_audit(public_id, created_at DESC);
