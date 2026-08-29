-- DNI Clearance Core — Step 1
--
-- Security invariant:
--   A user may receive a resource only when their effective clearance is
--   greater than or equal to that resource's required clearance, and they
--   hold any additional capability required for the action.
--
-- Every DNI document always carries a mandatory clearance. "Provisional"
-- means awaiting final classification; it never means unclassified.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- -------------------------------------------------------------------------
-- 1. Exact DNI clearance ladder
-- -------------------------------------------------------------------------
-- Existing level 5 represented the old highest COMMAND clearance. Preserve
-- that security boundary by moving existing level-5 grants/documents to the
-- new highest level (CLA/DIS) before level 5 is repurposed as CL4/MET.

INSERT INTO dni_clearance_levels (level, code, name, description)
VALUES (6, 'CLA/DIS', 'Absolute', 'HC-1, HC-2s, and HC-3 absolute DNI clearance')
ON DUPLICATE KEY UPDATE
    code = VALUES(code),
    name = VALUES(name),
    description = VALUES(description);

INSERT IGNORE INTO dni_discord_role_clearances (discord_role_id, clearance_level)
SELECT discord_role_id, 6
  FROM dni_discord_role_clearances
 WHERE clearance_level = 5;
DELETE FROM dni_discord_role_clearances WHERE clearance_level = 5;

INSERT IGNORE INTO dni_user_clearances (user_id, clearance_level, source, granted_at, expires_at)
SELECT user_id, 6, source, granted_at, expires_at
  FROM dni_user_clearances
 WHERE clearance_level = 5;
DELETE FROM dni_user_clearances WHERE clearance_level = 5;

UPDATE dni_documents
   SET minimum_clearance = 6
 WHERE minimum_clearance = 5;

UPDATE dni_clearance_levels
   SET code = 'CL/NON',
       name = 'Unclassified',
       description = 'Open information safe for release; public information, recruitment notices, and public event schedules'
 WHERE level = 0;

UPDATE dni_clearance_levels
   SET code = 'CL0/UTO',
       name = 'Official',
       description = 'Basic DNI organization operations available to all DNI members'
 WHERE level = 1;

UPDATE dni_clearance_levels
   SET code = 'CL1/FOR',
       name = 'Level 1',
       description = 'DNI Level 1 clearance; normally E-1 through E-4'
 WHERE level = 2;

UPDATE dni_clearance_levels
   SET code = 'CL2/VER',
       name = 'Level 2',
       description = 'DNI Level 2 clearance; normally E-5 through E-8 and W-1 through W-3'
 WHERE level = 3;

UPDATE dni_clearance_levels
   SET code = 'CL3/CON',
       name = 'Level 3',
       description = 'DNI Level 3 clearance; normally E-9, D-9s, and O-1 through O-5'
 WHERE level = 4;

UPDATE dni_clearance_levels
   SET code = 'CL4/MET',
       name = 'Level 4',
       description = 'DNI Level 4 clearance; normally O-6 through O-9'
 WHERE level = 5;

-- Re-assert the highest level in case this migration is resumed after a
-- partially completed deployment.
INSERT INTO dni_clearance_levels (level, code, name, description)
VALUES (6, 'CLA/DIS', 'Absolute', 'HC-1, HC-2s, and HC-3 absolute DNI clearance')
ON DUPLICATE KEY UPDATE
    code = VALUES(code),
    name = VALUES(name),
    description = VALUES(description);

-- -------------------------------------------------------------------------
-- 2. Rank-derived clearance + persistent administrative override
-- -------------------------------------------------------------------------

ALTER TABLE dni_ranks
    ADD COLUMN IF NOT EXISTS default_clearance_level TINYINT UNSIGNED NULL AFTER sort_order;

ALTER TABLE dni_ranks
    ADD CONSTRAINT fk_dni_rank_default_clearance
        FOREIGN KEY (default_clearance_level)
        REFERENCES dni_clearance_levels(level)
        ON DELETE SET NULL;

ALTER TABLE dni_users
    ADD COLUMN IF NOT EXISTS clearance_override_level TINYINT UNSIGNED NULL AFTER account_status,
    ADD COLUMN IF NOT EXISTS clearance_override_set_by BIGINT UNSIGNED NULL AFTER clearance_override_level,
    ADD COLUMN IF NOT EXISTS clearance_override_reason VARCHAR(500) NULL AFTER clearance_override_set_by,
    ADD COLUMN IF NOT EXISTS clearance_override_set_at DATETIME(6) NULL AFTER clearance_override_reason;

ALTER TABLE dni_users
    ADD CONSTRAINT fk_dni_user_clearance_override
        FOREIGN KEY (clearance_override_level)
        REFERENCES dni_clearance_levels(level)
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_dni_user_clearance_override_actor
        FOREIGN KEY (clearance_override_set_by)
        REFERENCES dni_users(id)
        ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dni_user_clearance_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    old_clearance_level TINYINT UNSIGNED NULL,
    new_clearance_level TINYINT UNSIGNED NULL,
    assignment_type ENUM(
        'rank',
        'discord_role',
        'manual_override',
        'override_removed',
        'system'
    ) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_dni_user_clearance_events_user (user_id, created_at),
    INDEX idx_dni_user_clearance_events_actor (actor_user_id, created_at),
    CONSTRAINT fk_dni_user_clearance_event_user FOREIGN KEY (user_id)
        REFERENCES dni_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_user_clearance_event_actor FOREIGN KEY (actor_user_id)
        REFERENCES dni_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_user_clearance_event_old FOREIGN KEY (old_clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT,
    CONSTRAINT fk_dni_user_clearance_event_new FOREIGN KEY (new_clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- 3. Document lifecycle and mandatory classification metadata
-- -------------------------------------------------------------------------
-- minimum_clearance remains the authoritative required clearance column so
-- existing application code continues to work while the clearance engine is
-- upgraded in later steps. It is already NOT NULL and foreign-key constrained.

ALTER TABLE dni_documents
    MODIFY COLUMN status ENUM('active', 'draft', 'in_review', 'published', 'archived')
        NOT NULL DEFAULT 'draft';

UPDATE dni_documents
   SET status = 'published'
 WHERE status = 'active';

ALTER TABLE dni_documents
    MODIFY COLUMN status ENUM('draft', 'in_review', 'published', 'archived')
        NOT NULL DEFAULT 'draft';

ALTER TABLE dni_documents
    ADD COLUMN IF NOT EXISTS classification_status ENUM('provisional', 'final')
        NOT NULL DEFAULT 'final' AFTER classification,
    ADD COLUMN IF NOT EXISTS classifier_id BIGINT UNSIGNED NULL AFTER updated_by,
    ADD COLUMN IF NOT EXISTS classified_at DATETIME(6) NULL AFTER classifier_id,
    ADD COLUMN IF NOT EXISTS classification_reason VARCHAR(500) NULL AFTER classified_at;

ALTER TABLE dni_documents
    ADD CONSTRAINT fk_dni_document_classifier
        FOREIGN KEY (classifier_id)
        REFERENCES dni_users(id)
        ON DELETE SET NULL;

UPDATE dni_documents
   SET classified_at = COALESCE(classified_at, updated_at, created_at)
 WHERE classification_status = 'final';

CREATE TABLE IF NOT EXISTS dni_document_versions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    document_id BIGINT UNSIGNED NOT NULL,
    version_number INT UNSIGNED NOT NULL,
    title VARCHAR(180) NOT NULL,
    summary VARCHAR(500) NOT NULL,
    body MEDIUMTEXT NOT NULL,
    classification VARCHAR(64) NOT NULL,
    classification_status ENUM('provisional', 'final') NOT NULL,
    clearance_level TINYINT UNSIGNED NOT NULL,
    author_user_id BIGINT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_dni_document_version (document_id, version_number),
    INDEX idx_dni_document_versions_clearance (clearance_level, created_at),
    CONSTRAINT fk_dni_document_version_document FOREIGN KEY (document_id)
        REFERENCES dni_documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_document_version_clearance FOREIGN KEY (clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT,
    CONSTRAINT fk_dni_document_version_author FOREIGN KEY (author_user_id)
        REFERENCES dni_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO dni_document_versions
    (document_id, version_number, title, summary, body, classification,
     classification_status, clearance_level, author_user_id, created_at)
SELECT id, 1, title, summary, body, classification,
       classification_status, minimum_clearance, COALESCE(updated_by, created_by), created_at
  FROM dni_documents;

CREATE TABLE IF NOT EXISTS dni_document_classification_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    document_id BIGINT UNSIGNED NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    old_clearance_level TINYINT UNSIGNED NULL,
    new_clearance_level TINYINT UNSIGNED NOT NULL,
    event_type ENUM('classified', 'reclassified', 'declassified', 'migration') NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_dni_document_classification_document (document_id, created_at),
    INDEX idx_dni_document_classification_actor (actor_user_id, created_at),
    CONSTRAINT fk_dni_document_classification_document FOREIGN KEY (document_id)
        REFERENCES dni_documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_document_classification_actor FOREIGN KEY (actor_user_id)
        REFERENCES dni_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_document_classification_old FOREIGN KEY (old_clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT,
    CONSTRAINT fk_dni_document_classification_new FOREIGN KEY (new_clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT INTO dni_document_classification_events
    (document_id, actor_user_id, old_clearance_level, new_clearance_level, event_type, reason, created_at)
SELECT d.id, NULL, NULL, d.minimum_clearance, 'migration',
       'Baseline classification recorded during DNI Clearance Core migration.',
       COALESCE(d.classified_at, d.updated_at, d.created_at)
  FROM dni_documents d
 WHERE NOT EXISTS (
       SELECT 1
         FROM dni_document_classification_events e
        WHERE e.document_id = d.id
          AND e.event_type = 'migration'
 );

-- -------------------------------------------------------------------------
-- 4. Capabilities required by the clearance administration/document flow
-- -------------------------------------------------------------------------

INSERT IGNORE INTO dni_permissions (permission_key, description) VALUES
    ('clearance.view', 'View personnel clearance assignments and clearance history'),
    ('clearance.assign', 'Assign an authorized personnel clearance'),
    ('clearance.override_rank', 'Persist a manual clearance independently of rank synchronization'),
    ('clearance.assign_absolute', 'Assign CLA/DIS Absolute clearance'),
    ('documents.create', 'Create DNI document drafts'),
    ('documents.review', 'Review provisional DNI documents'),
    ('documents.classify', 'Assign a final DNI document clearance'),
    ('documents.reclassify', 'Change the clearance of an already classified document'),
    ('documents.declassify', 'Lower or remove restrictions from a classified DNI document'),
    ('documents.archive', 'Archive DNI documents'),
    ('documents.download', 'Download authorized DNI documents');
