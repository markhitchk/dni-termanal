-- DNI Clearance Security Cleanup — Step 10
--
-- Completes the rank-derived clearance path created in migration 005.
-- Canonical DNI ranks receive explicit default clearance levels so personnel
-- clearance does not depend exclusively on Discord role IDs.
--
-- Existing legacy generic ranks are retained at the conservative CL0/UTO
-- member baseline. They are not guessed into E/O/W equivalents; current
-- Discord role grants or a canonical personnel rank may raise clearance.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Legacy seed ranks: safe DNI-member baseline only.
UPDATE dni_ranks
   SET default_clearance_level = 1
 WHERE code IN (
    'recruit', 'specialist', 'chief-specialist',
    'lieutenant', 'commander', 'captain', 'admiral'
 );

-- Canonical enlisted ranks.
INSERT INTO dni_ranks (code, name, sort_order, default_clearance_level) VALUES
    ('e-1', 'E-1', 101, 2),
    ('e-2', 'E-2', 102, 2),
    ('e-3', 'E-3', 103, 2),
    ('e-4', 'E-4', 104, 2),
    ('e-5', 'E-5', 105, 3),
    ('e-6', 'E-6', 106, 3),
    ('e-7', 'E-7', 107, 3),
    ('e-8', 'E-8', 108, 3),
    ('e-9', 'E-9', 109, 4),
    ('e-9s', 'E-9S', 110, 4)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    sort_order = VALUES(sort_order),
    default_clearance_level = VALUES(default_clearance_level);

-- Canonical warrant ranks.
INSERT INTO dni_ranks (code, name, sort_order, default_clearance_level) VALUES
    ('w-1', 'W-1', 121, 3),
    ('w-2', 'W-2', 122, 3),
    ('w-3', 'W-3', 123, 3)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    sort_order = VALUES(sort_order),
    default_clearance_level = VALUES(default_clearance_level);

-- DNI D-9 command classification. This rank-derived path is intentionally
-- independent of a Discord role ID, because no verified D-9 role ID exists in
-- the current role registry.
INSERT INTO dni_ranks (code, name, sort_order, default_clearance_level) VALUES
    ('d-9', 'D-9', 130, 4)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    sort_order = VALUES(sort_order),
    default_clearance_level = VALUES(default_clearance_level);

-- Canonical commissioned officer ranks.
INSERT INTO dni_ranks (code, name, sort_order, default_clearance_level) VALUES
    ('o-1', 'O-1', 141, 4),
    ('o-2', 'O-2', 142, 4),
    ('o-3', 'O-3', 143, 4),
    ('o-4', 'O-4', 144, 4),
    ('o-5', 'O-5', 145, 4),
    ('o-6', 'O-6', 146, 5),
    ('o-7', 'O-7', 147, 5),
    ('o-8', 'O-8', 148, 5),
    ('o-9', 'O-9', 149, 5)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    sort_order = VALUES(sort_order),
    default_clearance_level = VALUES(default_clearance_level);

-- High Command / Absolute clearance.
INSERT INTO dni_ranks (code, name, sort_order, default_clearance_level) VALUES
    ('hc-1', 'HC-1', 161, 6),
    ('hc-2', 'HC-2', 162, 6),
    ('hc-2s', 'HC-2S | High Lords', 163, 6),
    ('hc-3', 'HC-3 | Lord Sovereign', 164, 6)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    sort_order = VALUES(sort_order),
    default_clearance_level = VALUES(default_clearance_level);

-- E-1 and D-9 therefore have a complete server-side rank-derived clearance
-- even though their Discord role IDs remain intentionally unguessed.
