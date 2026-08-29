-- DNI Admin roster hierarchy and performance indexes.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- E-0 is the lowest canonical enlisted paygrade and receives the DNI-member
-- baseline. Higher canonical ranks are maintained by migration 012.
INSERT INTO dni_ranks (code, name, sort_order, default_clearance_level) VALUES
    ('e-0', 'E-0', 100, 1)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    sort_order = VALUES(sort_order),
    default_clearance_level = VALUES(default_clearance_level);

-- The Admin roster displays paygrade codes as the primary identity. Discord
-- role titles remain in the separate server-side role registry.
UPDATE dni_ranks
   SET name = UPPER(code)
 WHERE code IN (
    'hc-3', 'hc-2s', 'hc-2', 'hc-1',
    'o-9', 'o-8', 'o-7', 'o-6', 'o-5', 'o-4', 'o-3', 'o-2', 'o-1',
    'w-3', 'w-2', 'w-1',
    'e-9s', 'e-9', 'e-8', 'e-7', 'e-6', 'e-5', 'e-4', 'e-3', 'e-2', 'e-1', 'e-0'
 );

-- Preserve existing corps IDs used by personnel while aligning visible names
-- with the canonical DNI organization. Research is retained but hidden until
-- any historical assignments have been manually remapped.
UPDATE dni_corps SET name = 'Imperial Government', active = TRUE WHERE code = 'command';
UPDATE dni_corps SET name = 'Imperial Navy Corp', active = TRUE WHERE code = 'navy';
UPDATE dni_corps SET name = 'Imperial Medical Corp', active = TRUE WHERE code = 'medical';
UPDATE dni_corps SET name = 'Imperial Engineering Corp', active = TRUE WHERE code = 'engineering';
UPDATE dni_corps SET name = 'Imperial Logistic Corp', active = TRUE WHERE code = 'logistics';
UPDATE dni_corps SET name = 'Research Division (Legacy)', active = FALSE WHERE code = 'research';

INSERT INTO dni_corps (code, name, active) VALUES
    ('security', 'Imperial Security Bureau', TRUE),
    ('army', 'Imperial Army Corp', TRUE)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    active = VALUES(active);

ALTER TABLE dni_personnel
    ADD INDEX IF NOT EXISTS idx_dni_personnel_roster
        (status, rank_id, corp_id, display_name, id),
    ADD INDEX IF NOT EXISTS idx_dni_personnel_updated
        (updated_at, id);

ALTER TABLE dni_users
    ADD INDEX IF NOT EXISTS idx_dni_users_status_id
        (account_status, id);

ALTER TABLE dni_ranks
    ADD INDEX IF NOT EXISTS idx_dni_ranks_sort
        (sort_order, id);
