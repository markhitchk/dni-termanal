-- DNI Operational Clearance Enforcement — Step 7
-- Extends the clearance model beyond Documents/Mail to Sectors, Assets,
-- Personnel, Services, assignment history, and audit activity.
--
-- Existing operational records are intentionally preserved at CL/NON. New
-- MariaDB records fail secure at CLA/DIS unless an authorized server path
-- explicitly assigns a lower permitted classification.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE dni_sectors
    ADD COLUMN IF NOT EXISTS minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER active;
ALTER TABLE dni_assets
    ADD COLUMN IF NOT EXISTS minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER active;
ALTER TABLE dni_personnel
    ADD COLUMN IF NOT EXISTS minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER other_status;
ALTER TABLE dni_service_requests
    ADD COLUMN IF NOT EXISTS minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER notes;
ALTER TABLE dni_personnel_assignment_history
    ADD COLUMN IF NOT EXISTS minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER reason;
ALTER TABLE dni_service_request_events
    ADD COLUMN IF NOT EXISTS minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER note;
ALTER TABLE dni_audit_log
    ADD COLUMN IF NOT EXISTS minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER details_json;

ALTER TABLE dni_sectors
    ADD INDEX idx_dni_sectors_clearance (active, minimum_clearance),
    ADD CONSTRAINT fk_dni_sector_clearance FOREIGN KEY (minimum_clearance)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT;
ALTER TABLE dni_assets
    ADD INDEX idx_dni_assets_clearance (active, minimum_clearance),
    ADD CONSTRAINT fk_dni_asset_clearance FOREIGN KEY (minimum_clearance)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT;
ALTER TABLE dni_personnel
    ADD INDEX idx_dni_personnel_clearance (status, minimum_clearance),
    ADD CONSTRAINT fk_dni_personnel_clearance FOREIGN KEY (minimum_clearance)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT;
ALTER TABLE dni_service_requests
    ADD INDEX idx_dni_service_clearance (minimum_clearance, status, updated_at),
    ADD CONSTRAINT fk_dni_service_clearance FOREIGN KEY (minimum_clearance)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT;
ALTER TABLE dni_personnel_assignment_history
    ADD INDEX idx_dni_assignment_clearance (minimum_clearance, changed_at),
    ADD CONSTRAINT fk_dni_assignment_clearance FOREIGN KEY (minimum_clearance)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT;
ALTER TABLE dni_service_request_events
    ADD INDEX idx_dni_service_event_clearance (minimum_clearance, created_at),
    ADD CONSTRAINT fk_dni_service_event_clearance FOREIGN KEY (minimum_clearance)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT;
ALTER TABLE dni_audit_log
    ADD INDEX idx_dni_audit_clearance (minimum_clearance, created_at),
    ADD CONSTRAINT fk_dni_audit_clearance FOREIGN KEY (minimum_clearance)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT;

-- Existing data existed before operational classification and remains CL/NON.
UPDATE dni_sectors SET minimum_clearance = 0 WHERE minimum_clearance IS NULL;
UPDATE dni_assets SET minimum_clearance = 0 WHERE minimum_clearance IS NULL;
UPDATE dni_personnel SET minimum_clearance = 0 WHERE minimum_clearance IS NULL;
UPDATE dni_service_requests SET minimum_clearance = 0 WHERE minimum_clearance IS NULL;
UPDATE dni_personnel_assignment_history SET minimum_clearance = 0 WHERE minimum_clearance IS NULL;
UPDATE dni_service_request_events SET minimum_clearance = 0 WHERE minimum_clearance IS NULL;
UPDATE dni_audit_log SET minimum_clearance = 0 WHERE minimum_clearance IS NULL;

-- Any older/legacy MariaDB writer that omits classification now fails secure.
ALTER TABLE dni_sectors MODIFY minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 6;
ALTER TABLE dni_assets MODIFY minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 6;
ALTER TABLE dni_personnel MODIFY minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 6;
ALTER TABLE dni_service_requests MODIFY minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 6;
ALTER TABLE dni_personnel_assignment_history MODIFY minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 6;
ALTER TABLE dni_service_request_events MODIFY minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 6;
ALTER TABLE dni_audit_log MODIFY minimum_clearance TINYINT UNSIGNED NOT NULL DEFAULT 6;

INSERT IGNORE INTO dni_permissions (permission_key, description) VALUES
    ('operational.classify', 'Assign classification to sectors, assets, personnel and service records'),
    ('operational.audit', 'View clearance-filtered operational security audit history');

INSERT IGNORE INTO dni_discord_role_permissions (discord_role_id, permission_key)
SELECT role_id, permission_key
FROM (
    SELECT '1107373118412030063' AS role_id UNION ALL
    SELECT '1429298416189444256'
) admins
CROSS JOIN (
    SELECT 'operational.classify' AS permission_key UNION ALL
    SELECT 'operational.audit'
) permissions;
