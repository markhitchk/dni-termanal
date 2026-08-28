SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE dni_assets
    ADD COLUMN IF NOT EXISTS commander_name VARCHAR(128) NULL AFTER home_base_id;

INSERT IGNORE INTO dni_permissions (permission_key, description) VALUES
    ('sectors.create', 'Create DNI sectors'),
    ('sectors.delete', 'Remove DNI sectors'),
    ('sectors.audit', 'View detailed sector administrative activity'),
    ('assets.create', 'Create DNI assets'),
    ('assets.delete', 'Remove DNI assets'),
    ('asset.assign', 'Change asset assignments'),
    ('fleet.commander', 'Assign fleet commanders');

INSERT IGNORE INTO dni_sectors (id, code, name, status, control_percent, primary_location, active) VALUES
    ('sol', '01', 'SOL', 'SECURE', 100, 'SOL PRIME', TRUE),
    ('acheron', '02', 'ACHERON', 'CONTESTED', 87, 'ACHERON PRIME', TRUE),
    ('vega', '03', 'VEGA', 'SECURE', 96, 'VEGA PRIME', TRUE),
    ('nyx', '04', 'NYX', 'ALERT', 74, 'NYX ANCHOR', TRUE),
    ('arcadia', '05', 'ARCADIA', 'SECURE', 93, 'ARCADIA', TRUE),
    ('helios', '06', 'HELIOS', 'SECURE', 91, 'HELIOS GATE', TRUE),
    ('orpheus', '07', 'ORPHEUS', 'UNKNOWN', 61, 'ORPHEUS DEEP', TRUE),
    ('frontier', '08', 'FRONTIER', 'ALERT', 68, 'FRONTIER LINE', TRUE);

INSERT IGNORE INTO dni_assets
(id, sector_id, type, name, short_name, status, location, vessel_count, map_x, map_y, active) VALUES
    ('bastion-prime','sol','base','BASTION PRIME',NULL,'OPERATIONAL','SOL PRIME',0,24,43,TRUE),
    ('1st-fleet','sol','fleet','1ST IMPERIAL FLEET','1ST FLEET','OPERATIONAL','ORBIT — SOL PRIME',8,76,46,TRUE),
    ('sol-relay','sol','station','SOL RELAY STATION',NULL,'OPERATIONAL','SOL HIGH ORBIT',0,51,18,TRUE),
    ('sol-yard','sol','installation','SOL NAVAL YARD',NULL,'OPERATIONAL','INNER SYSTEM',0,48,78,TRUE),
    ('cerberus','acheron','base','CERBERUS FORWARD BASE','CERBERUS','OPERATIONAL','ACHERON PRIME',0,22,48,TRUE),
    ('4th-fleet','acheron','fleet','4TH IMPERIAL FLEET','4TH FLEET','OPERATIONAL','ORBIT — ACHERON PRIME',9,78,48,TRUE),
    ('7th-support','acheron','fleet','7TH SUPPORT GROUP',NULL,'OPERATIONAL','CERBERUS APPROACH',4,72,75,TRUE),
    ('relay-04','acheron','station','RELAY 04',NULL,'OPERATIONAL','ACHERON OUTER',0,50,18,TRUE),
    ('vega-bastion','vega','base','VEGA BASTION',NULL,'OPERATIONAL','VEGA PRIME',0,25,50,TRUE),
    ('5th-fleet','vega','fleet','5TH IMPERIAL FLEET','5TH FLEET','OPERATIONAL','VEGA PRIME',6,76,48,TRUE),
    ('vega-relay','vega','station','VEGA RELAY',NULL,'OPERATIONAL','VEGA GATE',0,50,18,TRUE),
    ('nyx-watch','nyx','installation','NYX WATCH',NULL,'ALERT','NYX ANCHOR',0,25,45,TRUE),
    ('9th-fleet','nyx','fleet','9TH IMPERIAL FLEET','9TH FLEET','ALERT','NYX PERIMETER',5,75,50,TRUE),
    ('arcadia-base','arcadia','base','ARCADIA COMMAND',NULL,'OPERATIONAL','ARCADIA',0,25,50,TRUE),
    ('2nd-fleet','arcadia','fleet','2ND IMPERIAL FLEET','2ND FLEET','OPERATIONAL','ARCADIA ORBIT',7,75,50,TRUE),
    ('arcadia-station','arcadia','station','ARCADIA RELAY',NULL,'OPERATIONAL','ARCADIA HIGH',0,50,18,TRUE),
    ('helios-base','helios','base','HELIOS GARRISON',NULL,'OPERATIONAL','HELIOS GATE',0,25,50,TRUE),
    ('3rd-fleet','helios','fleet','3RD IMPERIAL FLEET','3RD FLEET','OPERATIONAL','HELIOS GATE',6,75,50,TRUE),
    ('helios-array','helios','installation','HELIOS SENSOR ARRAY',NULL,'OPERATIONAL','GATE PERIMETER',0,50,20,TRUE),
    ('orpheus-post','orpheus','base','ORPHEUS LISTENING POST',NULL,'UNKNOWN','ORPHEUS DEEP',0,25,50,TRUE),
    ('11th-fleet','orpheus','fleet','11TH RECON FLEET','11TH FLEET','OPERATIONAL','ORPHEUS DEEP',4,75,50,TRUE),
    ('orpheus-relay','orpheus','station','ORPHEUS RELAY',NULL,'OFFLINE','OUTER ORPHEUS',0,50,18,TRUE),
    ('frontier-base','frontier','base','FRONTIER BASTION',NULL,'ALERT','FRONTIER LINE',0,25,50,TRUE),
    ('12th-fleet','frontier','fleet','12TH IMPERIAL FLEET','12TH FLEET','ALERT','FRONTIER LINE',5,75,50,TRUE),
    ('frontier-station','frontier','station','FRONTIER RELAY 06',NULL,'OPERATIONAL','FRONTIER APPROACH',0,50,18,TRUE);

UPDATE dni_assets SET home_base_id = 'bastion-prime' WHERE id = '1st-fleet';
UPDATE dni_assets SET home_base_id = 'cerberus' WHERE id IN ('4th-fleet','7th-support');
UPDATE dni_assets SET home_base_id = 'vega-bastion' WHERE id = '5th-fleet';
UPDATE dni_assets SET home_base_id = 'arcadia-base' WHERE id = '2nd-fleet';
UPDATE dni_assets SET home_base_id = 'helios-base' WHERE id = '3rd-fleet';
UPDATE dni_assets SET home_base_id = 'orpheus-post' WHERE id = '11th-fleet';
UPDATE dni_assets SET home_base_id = 'frontier-base' WHERE id = '12th-fleet';
