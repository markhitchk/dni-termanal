-- DNI Document Workflow — Step 4
-- Draft -> ISB review -> final classification -> publish.
-- Every document remains classified at all times; provisional is a workflow
-- state, never a public/unclassified fallback.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- -------------------------------------------------------------------------
-- 1. Workflow states and review metadata
-- -------------------------------------------------------------------------

ALTER TABLE dni_documents
    MODIFY COLUMN status ENUM(
        'draft',
        'in_review',
        'changes_requested',
        'rejected',
        'approved',
        'published',
        'archived'
    ) NOT NULL DEFAULT 'draft';

ALTER TABLE dni_documents
    ADD COLUMN IF NOT EXISTS submitted_by BIGINT UNSIGNED NULL AFTER classification_reason,
    ADD COLUMN IF NOT EXISTS submitted_at DATETIME(6) NULL AFTER submitted_by,
    ADD COLUMN IF NOT EXISTS reviewer_id BIGINT UNSIGNED NULL AFTER submitted_at,
    ADD COLUMN IF NOT EXISTS reviewed_at DATETIME(6) NULL AFTER reviewer_id,
    ADD COLUMN IF NOT EXISTS review_reason VARCHAR(1000) NULL AFTER reviewed_at,
    ADD COLUMN IF NOT EXISTS published_by BIGINT UNSIGNED NULL AFTER review_reason,
    ADD COLUMN IF NOT EXISTS published_at DATETIME(6) NULL AFTER published_by;

ALTER TABLE dni_documents
    ADD CONSTRAINT fk_dni_document_submitter
        FOREIGN KEY (submitted_by) REFERENCES dni_users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_dni_document_reviewer
        FOREIGN KEY (reviewer_id) REFERENCES dni_users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_dni_document_publisher
        FOREIGN KEY (published_by) REFERENCES dni_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dni_documents_workflow
    ON dni_documents (status, minimum_clearance, updated_at);

-- -------------------------------------------------------------------------
-- 2. Immutable document workflow history
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dni_document_workflow_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    document_id BIGINT UNSIGNED NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    event_type ENUM(
        'created',
        'edited',
        'submitted',
        'changes_requested',
        'rejected',
        'approved',
        'classified',
        'published',
        'archived'
    ) NOT NULL,
    from_status VARCHAR(32) NULL,
    to_status VARCHAR(32) NOT NULL,
    clearance_level TINYINT UNSIGNED NOT NULL,
    note VARCHAR(1000) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_dni_document_workflow_document (document_id, created_at),
    INDEX idx_dni_document_workflow_actor (actor_user_id, created_at),
    CONSTRAINT fk_dni_document_workflow_document FOREIGN KEY (document_id)
        REFERENCES dni_documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_document_workflow_actor FOREIGN KEY (actor_user_id)
        REFERENCES dni_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_document_workflow_clearance FOREIGN KEY (clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Backfill a baseline workflow event without duplicating it on reruns.
INSERT INTO dni_document_workflow_events
    (document_id, actor_user_id, event_type, from_status, to_status,
     clearance_level, note, created_at)
SELECT d.id,
       COALESCE(d.updated_by, d.created_by),
       CASE WHEN d.status = 'published' THEN 'published' ELSE 'created' END,
       NULL,
       d.status,
       d.minimum_clearance,
       'Baseline workflow state recorded during Step 4 migration.',
       COALESCE(d.updated_at, d.created_at)
  FROM dni_documents d
 WHERE NOT EXISTS (
       SELECT 1
         FROM dni_document_workflow_events e
        WHERE e.document_id = d.id
 );

-- -------------------------------------------------------------------------
-- 3. Workflow capabilities
-- -------------------------------------------------------------------------

INSERT IGNORE INTO dni_permissions (permission_key, description) VALUES
    ('documents.edit_own', 'Edit an owned DNI draft that is not locked for review'),
    ('documents.submit_review', 'Submit an owned DNI draft to ISB for classification review'),
    ('documents.view_review_queue', 'View DNI documents awaiting ISB review at or below effective clearance'),
    ('documents.publish', 'Publish an ISB-approved and finally classified DNI document');

-- Officers can draft and submit. This intentionally includes the Officer Corps
-- role as well as explicit O-1 through O-9 ranks.
INSERT IGNORE INTO dni_discord_role_permissions (discord_role_id, permission_key)
SELECT role_id, permission_key
FROM (
    SELECT '1503543937917386792' AS role_id UNION ALL -- Officer Corps
    SELECT '1424475940263825418' UNION ALL -- O-1
    SELECT '1424476432364732568' UNION ALL -- O-2
    SELECT '1420736834710929458' UNION ALL -- O-3
    SELECT '1420736749524750397' UNION ALL -- O-4
    SELECT '1420736707262939207' UNION ALL -- O-5
    SELECT '1420736520184266752' UNION ALL -- O-6
    SELECT '1424476471325622333' UNION ALL -- O-7
    SELECT '1424476500379435170' UNION ALL -- O-8
    SELECT '1420736542137122856'           -- O-9
) roles
CROSS JOIN (
    SELECT 'documents.create' AS permission_key UNION ALL
    SELECT 'documents.edit_own' UNION ALL
    SELECT 'documents.submit_review'
) permissions;

-- ISB owns review/classification/publish. ISB may also draft its own documents.
INSERT IGNORE INTO dni_discord_role_permissions (discord_role_id, permission_key)
SELECT '1424823667195510866', permission_key
FROM (
    SELECT 'documents.create' AS permission_key UNION ALL
    SELECT 'documents.edit_own' UNION ALL
    SELECT 'documents.submit_review' UNION ALL
    SELECT 'documents.review' UNION ALL
    SELECT 'documents.view_review_queue' UNION ALL
    SELECT 'documents.classify' UNION ALL
    SELECT 'documents.reclassify' UNION ALL
    SELECT 'documents.declassify' UNION ALL
    SELECT 'documents.publish'
) permissions;

-- Owner/Admin receive the complete Step 4 document workflow permission set.
INSERT IGNORE INTO dni_discord_role_permissions (discord_role_id, permission_key)
SELECT role_id, permission_key
FROM (
    SELECT '1107373118412030063' AS role_id UNION ALL -- HC-3 | Lord Sovereign / Owner
    SELECT '1429298416189444256'                         -- Admin
) roles
CROSS JOIN (
    SELECT 'documents.create' AS permission_key UNION ALL
    SELECT 'documents.edit_own' UNION ALL
    SELECT 'documents.submit_review' UNION ALL
    SELECT 'documents.review' UNION ALL
    SELECT 'documents.view_review_queue' UNION ALL
    SELECT 'documents.classify' UNION ALL
    SELECT 'documents.reclassify' UNION ALL
    SELECT 'documents.declassify' UNION ALL
    SELECT 'documents.publish' UNION ALL
    SELECT 'documents.archive' UNION ALL
    SELECT 'documents.download'
) permissions;
