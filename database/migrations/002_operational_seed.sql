SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE dni_assets
    ADD COLUMN IF NOT EXISTS commander_name VARCHAR(128) NULL AFTER home_base_id;

INSERT IGNORE INTO dni_permissions (permission_key, description) VALUES
    ('asset.assign', 'Change asset assignments and home bases'),
    ('fleet.commander', 'Assign fleet commanders'),
    ('sectors.audit', 'View detailed strategic audit activity'),
    ('sectors.create', 'Create DNI sectors'),
    ('sectors.delete', 'Remove DNI sectors'),
    ('assets.create', 'Create DNI strategic assets'),
    ('assets.delete', 'Remove DNI strategic assets');

INSERT INTO dni_ranks (code, name, sort_order) VALUES
    ('recruit', 'Recruit', 10),
    ('specialist', 'Specialist', 20),
    ('chief-specialist', 'Chief Specialist', 30),
    ('lieutenant', 'Lieutenant', 40),
    ('commander', 'Commander', 50),
    ('captain', 'Captain', 60),
    ('admiral', 'Admiral', 70)
ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order);

INSERT INTO dni_corps (code, name, active) VALUES
    ('command', 'DNI Command', TRUE),
    ('navy', 'Imperial Navy', TRUE),
    ('medical', 'Medical Corps', TRUE),
    ('engineering', 'Engineering Corps', TRUE),
    ('logistics', 'Logistics Corps', TRUE),
    ('research', 'Research Division', TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name), active = VALUES(active);

INSERT INTO dni_sectors (id, code, name, status, control_percent, primary_location, active) VALUES
    ('sol', '01', 'SOL', 'SECURE', 100.00, 'SOL PRIME', TRUE),
    ('acheron', '02', 'ACHERON', 'CONTESTED', 87.00, 'ACHERON PRIME', TRUE),
    ('vega', '03', 'VEGA', 'SECURE', 96.00, 'VEGA PRIME', TRUE),
    ('nyx', '04', 'NYX', 'ALERT', 74.00, 'NYX ANCHOR', TRUE),
    ('arcadia', '05', 'ARCADIA', 'SECURE', 93.00, 'ARCADIA', TRUE),
    ('helios', '06', 'HELIOS', 'SECURE', 91.00, 'HELIOS GATE', TRUE),
    ('orpheus', '07', 'ORPHEUS', 'UNKNOWN', 61.00, 'ORPHEUS DEEP', TRUE),
    ('frontier', '08', 'FRONTIER', 'ALERT', 68.00, 'FRONTIER LINE', TRUE)
ON DUPLICATE KEY UPDATE
    code = VALUES(code), name = VALUES(name), status = VALUES(status),
    control_percent = VALUES(control_percent), primary_location = VALUES(primary_location), active = TRUE;

INSERT INTO dni_assets
    (id, sector_id, type, name, short_name, status, location, vessel_count, map_x, map_y, active)
VALUES
    ('bastion-prime', 'sol', 'base', 'BASTION PRIME', NULL, 'OPERATIONAL', 'SOL PRIME', 0, 24, 43, TRUE),
    ('sol-relay', 'sol', 'station', 'SOL RELAY STATION', NULL, 'OPERATIONAL', 'SOL HIGH ORBIT', 0, 51, 18, TRUE),
    ('sol-yard', 'sol', 'installation', 'SOL NAVAL YARD', NULL, 'OPERATIONAL', 'INNER SYSTEM', 0, 48, 78, TRUE),
    ('cerberus', 'acheron', 'base', 'CERBERUS FORWARD BASE', 'CERBERUS', 'OPERATIONAL', 'ACHERON PRIME', 0, 22, 48, TRUE),
    ('relay-04', 'acheron', 'station', 'RELAY 04', NULL, 'OPERATIONAL', 'ACHERON OUTER', 0, 50, 18, TRUE),
    ('vega-bastion', 'vega', 'base', 'VEGA BASTION', NULL, 'OPERATIONAL', 'VEGA PRIME', 0, 25, 50, TRUE),
    ('vega-relay', 'vega', 'station', 'VEGA RELAY', NULL, 'OPERATIONAL', 'VEGA GATE', 0, 50, 18, TRUE),
    ('nyx-watch', 'nyx', 'installation', 'NYX WATCH', NULL, 'ALERT', 'NYX ANCHOR', 0, 25, 45, TRUE),
    ('arcadia-base', 'arcadia', 'base', 'ARCADIA COMMAND', NULL, 'OPERATIONAL', 'ARCADIA', 0, 25, 50, TRUE),
    ('arcadia-station', 'arcadia', 'station', 'ARCADIA RELAY', NULL, 'OPERATIONAL', 'ARCADIA HIGH', 0, 50, 18, TRUE),
    ('helios-base', 'helios', 'base', 'HELIOS GARRISON', NULL, 'OPERATIONAL', 'HELIOS GATE', 0, 25, 50, TRUE),
    ('helios-array', 'helios', 'installation', 'HELIOS SENSOR ARRAY', NULL, 'OPERATIONAL', 'GATE PERIMETER', 0, 50, 20, TRUE),
    ('orpheus-post', 'orpheus', 'base', 'ORPHEUS LISTENING POST', NULL, 'UNKNOWN', 'ORPHEUS DEEP', 0, 25, 50, TRUE),
    ('orpheus-relay', 'orpheus', 'station', 'ORPHEUS RELAY', NULL, 'OFFLINE', 'OUTER ORPHEUS', 0, 50, 18, TRUE),
    ('frontier-base', 'frontier', 'base', 'FRONTIER BASTION', NULL, 'ALERT', 'FRONTIER LINE', 0, 25, 50, TRUE),
    ('frontier-station', 'frontier', 'station', 'FRONTIER RELAY 06', NULL, 'OPERATIONAL', 'FRONTIER APPROACH', 0, 50, 18, TRUE)
ON DUPLICATE KEY UPDATE
    sector_id = VALUES(sector_id), type = VALUES(type), name = VALUES(name), short_name = VALUES(short_name),
    status = VALUES(status), location = VALUES(location), vessel_count = VALUES(vessel_count),
    map_x = VALUES(map_x), map_y = VALUES(map_y), active = TRUE;

INSERT INTO dni_assets
    (id, sector_id, home_base_id, commander_name, type, name, short_name, status, location, vessel_count, map_x, map_y, active)
VALUES
    ('1st-fleet', 'sol', 'bastion-prime', 'ADM. CAELUS', 'fleet', '1ST IMPERIAL FLEET', '1ST FLEET', 'OPERATIONAL', 'ORBIT — SOL PRIME', 8, 76, 46, TRUE),
    ('4th-fleet', 'acheron', 'cerberus', 'ADM. VORAN', 'fleet', '4TH IMPERIAL FLEET', '4TH FLEET', 'OPERATIONAL', 'ORBIT — ACHERON PRIME', 9, 78, 48, TRUE),
    ('7th-support', 'acheron', 'cerberus', 'CDR. TAL', 'fleet', '7TH SUPPORT GROUP', NULL, 'OPERATIONAL', 'CERBERUS APPROACH', 4, 72, 75, TRUE),
    ('5th-fleet', 'vega', 'vega-bastion', 'ADM. RHEA', 'fleet', '5TH IMPERIAL FLEET', '5TH FLEET', 'OPERATIONAL', 'VEGA PRIME', 6, 76, 48, TRUE),
    ('9th-fleet', 'nyx', NULL, 'CDR. KEST', 'fleet', '9TH IMPERIAL FLEET', '9TH FLEET', 'ALERT', 'NYX PERIMETER', 5, 75, 50, TRUE),
    ('2nd-fleet', 'arcadia', 'arcadia-base', 'ADM. ORIS', 'fleet', '2ND IMPERIAL FLEET', '2ND FLEET', 'OPERATIONAL', 'ARCADIA ORBIT', 7, 75, 50, TRUE),
    ('3rd-fleet', 'helios', 'helios-base', 'ADM. MERIDIAN', 'fleet', '3RD IMPERIAL FLEET', '3RD FLEET', 'OPERATIONAL', 'HELIOS GATE', 6, 75, 50, TRUE),
    ('11th-fleet', 'orpheus', 'orpheus-post', 'CDR. SERA', 'fleet', '11TH RECON FLEET', '11TH FLEET', 'OPERATIONAL', 'ORPHEUS DEEP', 4, 75, 50, TRUE),
    ('12th-fleet', 'frontier', 'frontier-base', 'CDR. HOLT', 'fleet', '12TH IMPERIAL FLEET', '12TH FLEET', 'ALERT', 'FRONTIER LINE', 5, 75, 50, TRUE)
ON DUPLICATE KEY UPDATE
    sector_id = VALUES(sector_id), home_base_id = VALUES(home_base_id), commander_name = VALUES(commander_name),
    type = VALUES(type), name = VALUES(name), short_name = VALUES(short_name), status = VALUES(status),
    location = VALUES(location), vessel_count = VALUES(vessel_count), map_x = VALUES(map_x), map_y = VALUES(map_y), active = TRUE;

INSERT INTO dni_documents
    (file_code, title, summary, body, classification, minimum_clearance, required_permission, status)
VALUES
    ('DNI-001', 'DNI Network Orientation', 'Orientation and operating expectations for authenticated DNI personnel.', 'DNI Terminal is the central operational interface for personnel status, strategic sectors, service dispatch, and approved communication systems. Access is logged and restricted by Discord-derived permissions and clearance.', 'DNI INTERNAL', 0, 'documents.read', 'active'),
    ('DNI-101', 'Strategic Sector Handling', 'Rules for sector, fleet, and personnel assignment changes.', 'Strategic changes must be performed through authenticated command controls. Personnel transfers, fleet redeployments, and asset changes are recorded in the DNI audit log and must reflect current operational assignments.', 'DNI-1', 1, 'documents.read', 'active'),
    ('DNI-220', 'Service Dispatch Protocol', 'Operational handling for medical, engineering, and fuel support requests.', 'Service requests progress through OPEN, CLAIMED, IN PROGRESS, and COMPLETED. Claim rights are derived from Discord role permissions. Request state changes are transactional and audit logged.', 'DNI-2', 2, 'documents.read', 'active')
ON DUPLICATE KEY UPDATE
    title = VALUES(title), summary = VALUES(summary), body = VALUES(body), classification = VALUES(classification),
    minimum_clearance = VALUES(minimum_clearance), required_permission = VALUES(required_permission), status = VALUES(status);
