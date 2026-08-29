-- DNI Mail Clearance Enforcement — Step 5
-- Every message has a mandatory clearance. Direct mail additionally requires
-- an explicit recipient relationship. Attachment classification propagates
-- upward into the message classification at send time.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS dni_mail_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    message_type ENUM('message', 'announcement', 'service_announcement') NOT NULL DEFAULT 'message',
    audience_type ENUM('direct', 'all_members') NOT NULL DEFAULT 'direct',
    sender_user_id BIGINT UNSIGNED NULL,
    sender_label VARCHAR(128) NOT NULL,
    subject VARCHAR(180) NOT NULL,
    body MEDIUMTEXT NOT NULL,
    clearance_level TINYINT UNSIGNED NOT NULL,
    status ENUM('draft', 'sent', 'archived') NOT NULL DEFAULT 'draft',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    sent_at DATETIME(6) NULL,
    INDEX idx_dni_mail_delivery (status, clearance_level, sent_at),
    INDEX idx_dni_mail_sender (sender_user_id, sent_at),
    CONSTRAINT fk_dni_mail_sender FOREIGN KEY (sender_user_id)
        REFERENCES dni_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_dni_mail_clearance FOREIGN KEY (clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_mail_recipients (
    message_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    delivered_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (message_id, user_id),
    INDEX idx_dni_mail_recipient_user (user_id, message_id),
    CONSTRAINT fk_dni_mail_recipient_message FOREIGN KEY (message_id)
        REFERENCES dni_mail_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_mail_recipient_user FOREIGN KEY (user_id)
        REFERENCES dni_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_mail_receipts (
    message_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    read_at DATETIME(6) NULL,
    archived_at DATETIME(6) NULL,
    PRIMARY KEY (message_id, user_id),
    INDEX idx_dni_mail_receipt_user (user_id, read_at),
    CONSTRAINT fk_dni_mail_receipt_message FOREIGN KEY (message_id)
        REFERENCES dni_mail_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_mail_receipt_user FOREIGN KEY (user_id)
        REFERENCES dni_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_mail_attachments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT UNSIGNED NOT NULL,
    document_id BIGINT UNSIGNED NOT NULL,
    attachment_name VARCHAR(180) NOT NULL,
    clearance_level TINYINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_dni_mail_attachment_document (message_id, document_id),
    INDEX idx_dni_mail_attachment_message (message_id),
    CONSTRAINT fk_dni_mail_attachment_message FOREIGN KEY (message_id)
        REFERENCES dni_mail_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_mail_attachment_document FOREIGN KEY (document_id)
        REFERENCES dni_documents(id) ON DELETE RESTRICT,
    CONSTRAINT fk_dni_mail_attachment_clearance FOREIGN KEY (clearance_level)
        REFERENCES dni_clearance_levels(level) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dni_mail_message_permissions (
    message_id BIGINT UNSIGNED NOT NULL,
    permission_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (message_id, permission_key),
    CONSTRAINT fk_dni_mail_message_permission_message FOREIGN KEY (message_id)
        REFERENCES dni_mail_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_dni_mail_message_permission_key FOREIGN KEY (permission_key)
        REFERENCES dni_permissions(permission_key) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT IGNORE INTO dni_permissions (permission_key, description) VALUES
    ('mail.read', 'Read DNI Mail authorized by recipient relationship and clearance'),
    ('mail.send', 'Send clearance-controlled direct DNI Mail'),
    ('mail.announce', 'Send clearance-controlled DNI announcements'),
    ('mail.service_announce', 'Send clearance-controlled DNI service announcements'),
    ('mail.audit', 'Review DNI Mail security audit activity');

INSERT IGNORE INTO dni_default_permissions (permission_key) VALUES
    ('mail.read');

-- Officers may send direct internal mail. Standard users remain read-only.
INSERT IGNORE INTO dni_discord_role_permissions (discord_role_id, permission_key)
SELECT role_id, 'mail.send'
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
) officer_roles;

-- ISB may send direct classified mail, but does not receive announcement power.
INSERT IGNORE INTO dni_discord_role_permissions (discord_role_id, permission_key)
VALUES ('1424823667195510866', 'mail.send');

-- Owner/Admin may send direct mail and network-wide announcements.
INSERT IGNORE INTO dni_discord_role_permissions (discord_role_id, permission_key)
SELECT role_id, permission_key
FROM (
    SELECT '1107373118412030063' AS role_id UNION ALL -- HC-3 | Lord Sovereign / Owner
    SELECT '1429298416189444256'                         -- Admin
) privileged_roles
CROSS JOIN (
    SELECT 'mail.send' AS permission_key UNION ALL
    SELECT 'mail.announce' UNION ALL
    SELECT 'mail.service_announce' UNION ALL
    SELECT 'mail.audit'
) mail_permissions;

-- The two original DNI Mail notices are now server-side records rather than
-- browser JavaScript constants. CL/NON is still authenticated-mail only; it
-- does not make the mailbox public.
INSERT IGNORE INTO dni_mail_messages
    (message_code, message_type, audience_type, sender_user_id, sender_label,
     subject, body, clearance_level, status, created_at, sent_at)
VALUES
    ('MAIL-000001', 'announcement', 'all_members', NULL, "HARLEY'S STUDIOS / HARLEYTG",
     '🚧 UNDER CONSTRUCTION 🚧',
     CONCAT(
        'DREADNOUGHT IMPERIUM DATABASE NETWORK is currently under construction.\n\n',
        'Made by Harley''s Studios aka HarleyTG.\n\n',
        'Please send all feedback to a support ticket within the Discord server or by DM to HarleyTG (temp).'
     ),
     0, 'sent', '2026-08-28 00:00:00.000000', '2026-08-28 00:00:00.000000'),
    ('MAIL-000002', 'service_announcement', 'all_members', NULL, 'DNI SERVICE OPERATIONS',
     'Service Announcement Channel Online',
     'DNI service announcements will be delivered here when network services require maintenance, experience availability changes, or return to normal operation.',
     0, 'sent', '2026-08-28 00:00:00.000000', '2026-08-28 00:00:00.000000');