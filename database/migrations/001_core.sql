SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS dni_permissions (
    permission_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_clearance_levels (
    level TINYINT UNSIGNED PRIMARY KEY,
    code VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    discord_user_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    username VARCHAR(64) NOT NULL,
    global_name VARCHAR(128) NULL,
    guild_nick VARCHAR(128) NULL,
    avatar_hash VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    account_status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    last_login_at DATETIME(6) NULL,
    last_role_sync_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_user_discord_roles (
    user_id BIGINT UNSIGNED NOT NULL,
    discord_role_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    synced_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id, discord_role_id),
    CONSTRAINT fk_dni_user_role_user FOREIGN KEY (user_id)
        REFERENCES dni_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_default_permissions (
    permission_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    CONSTRAINT fk_dni_default_permission FOREIGN KEY (permission_key)
        REFERENCES dni_permissions(permission_key) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_discord_role_permissions (
    discord_role_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    permission_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (discord_role_id, permission_key),
    CONSTRAINT fk_dni_role_permission FOREIGN KEY (permission_key)
        REFERENCES dni_permissions(permission_key) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_user_permissions (
    user_id BIGINT UNSIGNED NOT NULL,
    permission_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    granted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id, permission_key),
    CONSTRAINT fk_dni_user_permission_user FOREIGN KEY (user_id)
        REFERENCES dni_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_user_permission_permission FOREIGN KEY (permission_key)
        REFERENCES dni_permissions(permission_key) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_discord_role_clearances (
    discord_role_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    clearance_level TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (discord_role_id, clearance_level),
    CONSTRAINT fk_dni_role_clearance_level FOREIGN KEY (clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_user_clearances (
    user_id BIGINT UNSIGNED NOT NULL,
    clearance_level TINYINT UNSIGNED NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'manual',
    granted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at DATETIME(6) NULL,
    PRIMARY KEY (user_id, clearance_level, source),
    CONSTRAINT fk_dni_user_clearance_user FOREIGN KEY (user_id)
        REFERENCES dni_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_user_clearance_level FOREIGN KEY (clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_ranks (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_corps (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_sectors (
    id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    code VARCHAR(16) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'SECURE',
    control_percent DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    primary_location VARCHAR(160) NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_assets (
    id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    sector_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    parent_asset_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    home_base_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    type ENUM('fleet', 'base', 'station', 'installation') NOT NULL,
    name VARCHAR(160) NOT NULL,
    short_name VARCHAR(100) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPERATIONAL',
    location VARCHAR(180) NULL,
    vessel_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    map_x DECIMAL(6,2) NULL,
    map_y DECIMAL(6,2) NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_dni_assets_sector (sector_id),
    INDEX idx_dni_assets_type (type),
    CONSTRAINT fk_dni_asset_sector FOREIGN KEY (sector_id)
        REFERENCES dni_sectors(id),
    CONSTRAINT fk_dni_asset_parent FOREIGN KEY (parent_asset_id)
        REFERENCES dni_assets(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_asset_home_base FOREIGN KEY (home_base_id)
        REFERENCES dni_assets(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_personnel (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL UNIQUE,
    service_number VARCHAR(32) NULL UNIQUE,
    display_name VARCHAR(128) NOT NULL,
    rank_id SMALLINT UNSIGNED NULL,
    corp_id INT UNSIGNED NULL,
    status ENUM('active', 'reserve', 'leave', 'inactive') NOT NULL DEFAULT 'active',
    current_sector_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    assigned_fleet_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    duty_station_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    other_status VARCHAR(255) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_dni_personnel_sector (current_sector_id),
    INDEX idx_dni_personnel_fleet (assigned_fleet_id),
    INDEX idx_dni_personnel_station (duty_station_id),
    CONSTRAINT fk_dni_personnel_user FOREIGN KEY (user_id)
        REFERENCES dni_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_personnel_rank FOREIGN KEY (rank_id)
        REFERENCES dni_ranks(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_personnel_corp FOREIGN KEY (corp_id)
        REFERENCES dni_corps(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_personnel_sector FOREIGN KEY (current_sector_id)
        REFERENCES dni_sectors(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_personnel_fleet FOREIGN KEY (assigned_fleet_id)
        REFERENCES dni_assets(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_personnel_station FOREIGN KEY (duty_station_id)
        REFERENCES dni_assets(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_personnel_assignment_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    personnel_id BIGINT UNSIGNED NOT NULL,
    from_sector_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    to_sector_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    from_fleet_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    to_fleet_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    from_station_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    to_station_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    changed_by BIGINT UNSIGNED NULL,
    reason VARCHAR(500) NULL,
    changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_dni_assignment_personnel (personnel_id, changed_at),
    CONSTRAINT fk_dni_assignment_personnel FOREIGN KEY (personnel_id)
        REFERENCES dni_personnel(id),
    CONSTRAINT fk_dni_assignment_actor FOREIGN KEY (changed_by)
        REFERENCES dni_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_service_types (
    type_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(255) NOT NULL,
    claim_permission VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_dni_service_claim_permission FOREIGN KEY (claim_permission)
        REFERENCES dni_permissions(permission_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_service_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    priority ENUM('low', 'normal', 'high', 'critical') NOT NULL DEFAULT 'normal',
    status ENUM('open', 'claimed', 'in_progress', 'completed') NOT NULL DEFAULT 'open',
    requester_user_id BIGINT UNSIGNED NOT NULL,
    claimed_by_user_id BIGINT UNSIGNED NULL,
    sector_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    asset_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    location VARCHAR(180) NOT NULL,
    notes TEXT NULL,
    claimed_at DATETIME(6) NULL,
    in_progress_at DATETIME(6) NULL,
    completed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_dni_service_status_priority (status, priority, created_at),
    INDEX idx_dni_service_requester (requester_user_id, created_at),
    INDEX idx_dni_service_claimant (claimed_by_user_id, status),
    CONSTRAINT fk_dni_service_type FOREIGN KEY (type_key)
        REFERENCES dni_service_types(type_key),
    CONSTRAINT fk_dni_service_requester FOREIGN KEY (requester_user_id)
        REFERENCES dni_users(id),
    CONSTRAINT fk_dni_service_claimant FOREIGN KEY (claimed_by_user_id)
        REFERENCES dni_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_service_sector FOREIGN KEY (sector_id)
        REFERENCES dni_sectors(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_service_asset FOREIGN KEY (asset_id)
        REFERENCES dni_assets(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_service_request_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT UNSIGNED NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    event_type ENUM('created', 'claimed', 'started', 'completed') NOT NULL,
    note VARCHAR(500) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_dni_service_event_request (request_id, created_at),
    CONSTRAINT fk_dni_service_event_request FOREIGN KEY (request_id)
        REFERENCES dni_service_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_service_event_actor FOREIGN KEY (actor_user_id)
        REFERENCES dni_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_documents (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    file_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    title VARCHAR(180) NOT NULL,
    summary VARCHAR(500) NOT NULL,
    body MEDIUMTEXT NOT NULL,
    classification VARCHAR(64) NOT NULL DEFAULT 'DNI INTERNAL',
    minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 0,
    required_permission VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_dni_documents_access (status, minimum_clearance),
    CONSTRAINT fk_dni_document_clearance FOREIGN KEY (minimum_clearance)
        REFERENCES dni_clearance_levels(level),
    CONSTRAINT fk_dni_document_permission FOREIGN KEY (required_permission)
        REFERENCES dni_permissions(permission_key) ON DELETE SET NULL,
    CONSTRAINT fk_dni_document_creator FOREIGN KEY (created_by)
        REFERENCES dni_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_document_updater FOREIGN KEY (updated_by)
        REFERENCES dni_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_user_id BIGINT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NULL,
    details_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_dni_audit_created (created_at),
    INDEX idx_dni_audit_actor (actor_user_id, created_at),
    CONSTRAINT fk_dni_audit_actor FOREIGN KEY (actor_user_id)
        REFERENCES dni_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO dni_clearance_levels (level, code, name, description) VALUES
    (0, 'PUBLIC', 'Public', 'Public DNI material'),
    (1, 'DNI-1', 'DNI Level 1', 'Basic member access'),
    (2, 'DNI-2', 'DNI Level 2', 'Operational access'),
    (3, 'DNI-3', 'DNI Level 3', 'Restricted operational access'),
    (4, 'DNI-4', 'DNI Level 4', 'Command restricted access'),
    (5, 'COMMAND', 'DNI Command', 'Highest command authorization');

INSERT IGNORE INTO dni_permissions (permission_key, description) VALUES
    ('admin', 'Full DNI administrative access'),
    ('dashboard.read', 'View personal dashboard'),
    ('documents.read', 'View authorized DNI documents'),
    ('services.request', 'Submit service requests'),
    ('services.claim.medical', 'Claim medical requests'),
    ('services.claim.engineering', 'Claim engineering requests'),
    ('services.claim.fuel', 'Claim fueling requests'),
    ('services.manage', 'Manage all service requests'),
    ('sectors.read', 'View DNI sectors'),
    ('sectors.manage', 'Create and modify sectors and assets'),
    ('personnel.transfer', 'Transfer personnel'),
    ('fleet.redeploy', 'Redeploy fleets'),
    ('assets.manage', 'Create or modify DNI assets'),
    ('communication.read', 'View DNI Communications'),
    ('communication.write', 'Perform Star Comms owner actions'),
    ('audit.read', 'View DNI audit records');

INSERT IGNORE INTO dni_default_permissions (permission_key) VALUES
    ('dashboard.read'),
    ('documents.read'),
    ('services.request'),
    ('sectors.read'),
    ('communication.read');

INSERT IGNORE INTO dni_service_types (type_key, name, description, claim_permission, sort_order) VALUES
    ('medic', 'Medical', 'Medical assistance, rescue, and recovery.', 'services.claim.medical', 10),
    ('engineer', 'Engineering', 'Engineering, repair, and technical assistance.', 'services.claim.engineering', 20),
    ('fuel', 'Fuel', 'Fueling and logistics support.', 'services.claim.fuel', 30);
