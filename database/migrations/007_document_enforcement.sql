-- DNI Clearance Core — Step 3
-- Normalize document classification metadata and seed the public Terminal
-- orientation record. Restricted documents remain database-only and are
-- never embedded in browser JavaScript.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- The clearance FK is authoritative. Keep the legacy classification display
-- field synchronized to the exact DNI clearance code so contradictory labels
-- cannot be returned to clients.
UPDATE dni_documents d
INNER JOIN dni_clearance_levels cl ON cl.level = d.minimum_clearance
   SET d.classification = cl.code;

-- CL/NON is intentionally public and therefore cannot require an authenticated
-- capability in addition to its public clearance level.
UPDATE dni_documents
   SET required_permission = NULL
 WHERE minimum_clearance = 0;

-- Public record used by the Terminal help/example. No classified sample record
-- is committed to the public repository.
INSERT INTO dni_documents
    (file_code, title, summary, body, classification, classification_status,
     minimum_clearance, required_permission, status, classification_reason)
VALUES
    ('DNI-173',
     'DNI Terminal Orientation',
     'Public orientation record for DNI Terminal document access and clearance handling.',
     'DNI Terminal retrieves documents from the server and only returns records authorized for the current clearance. Restricted document metadata is not exposed to unauthorized clients.',
     'CL/NON', 'final', 0, NULL, 'published',
     'Public orientation document for the DNI Terminal clearance system.')
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    summary = VALUES(summary),
    body = VALUES(body),
    classification = 'CL/NON',
    classification_status = 'final',
    minimum_clearance = 0,
    required_permission = NULL,
    status = 'published',
    classification_reason = VALUES(classification_reason);

-- Re-normalize after the upsert in case an older deployment had a conflicting
-- display classification value.
UPDATE dni_documents d
INNER JOIN dni_clearance_levels cl ON cl.level = d.minimum_clearance
   SET d.classification = cl.code;
