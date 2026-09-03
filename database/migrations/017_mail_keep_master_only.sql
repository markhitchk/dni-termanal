-- One-time DNI Mail cleanup.
-- Migration 016 creates MAIL-000004 first; this migration removes every other
-- historical DNI Mail record. Foreign-key cascades remove related recipients,
-- receipts, attachments, and message-permission rows for deleted messages.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

DELETE FROM dni_mail_messages
WHERE message_code <> 'MAIL-000004';
