-- Replace the two original DNI Mail notices with one canonical master welcome.
-- Runtime personalization replaces {DISPLAY_NAME} and {DNI_MAIL_ADDRESS} for
-- the authenticated user before the message is returned to the client.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

DELETE FROM dni_mail_messages
WHERE message_code IN ('MAIL-000001', 'MAIL-000002', 'MAIL-000004');

INSERT INTO dni_mail_messages
    (message_code, message_type, audience_type, sender_user_id, sender_label,
     subject, body, clearance_level, status, created_at, sent_at)
VALUES
    ('MAIL-000004', 'service_announcement', 'all_members', NULL, 'DNI AUTOMATED SYSTEM',
     'Welcome to the Dreadnought Imperium Database Network',
     CONCAT(
        'WELCOME TO THE DREADNOUGHT IMPERIUM DATABASE NETWORK\n\n',
        'Welcome, @{DISPLAY_NAME}.\n\n',
        'Your access to the Dreadnought Imperium Database Network has been established.\n\n',
        'Your DNI Mail identity is:\n\n',
        '{DNI_MAIL_ADDRESS}\n\n',
        'This address is assigned automatically from your authenticated DNI identity and account type.\n\n',
        'DNI Terminal provides secure access to organization services, communications, DNI Mail, personnel resources, operational information, and other systems available to your account based on your permissions and clearance level.\n\n',
        'NETWORK STATUS\n\n',
        'The DNI Terminal is currently under active development.\n\n',
        'Features, services, interfaces, and connected systems may receive updates or maintenance as development continues.\n\n',
        'Important service notifications will be delivered through DNI Mail by the DNI AUTOMATED SYSTEM when maintenance is required, service availability changes, major updates are deployed, services are restored, or your account and access configuration requires an automated notification.\n\n',
        'DNI MAIL SUPPORT CHANNELS\n\n',
        'For general assistance:\n\n',
        'general@support.dni.org\n\n',
        'For bugs, technical problems, broken functionality, or DNI Terminal development issues:\n\n',
        'dev@support.dni.org\n\n',
        'For account permissions, access authorization, personnel information, clearance concerns, or administrative requests:\n\n',
        'admin@support.dni.org\n\n',
        'Support addresses automatically route messages to authorized DNI personnel responsible for that channel.\n\n',
        'SECURITY AND ACCESS\n\n',
        'Your DNI Terminal access is determined by your authenticated identity, organizational status, permissions, roles, and applicable clearance level.\n\n',
        'Information outside your authorized access level will remain restricted.\n\n',
        'Official automated DNI messages are sent from:\n\n',
        'DNI AUTOMATED SYSTEM\n',
        'system@dni.org\n\n',
        'This identity is reserved for system-generated communications.\n\n',
        'FEEDBACK\n\n',
        'If you encounter incorrect information, unexpected behavior, or broken functionality, report it through the appropriate DNI Mail support channel or the official Dreadnought Imperium Discord support system.\n\n',
        'DNI Terminal and its connected services are developed and maintained by DNI Services / HarleyTG.\n\n',
        'Thank you for using the Dreadnought Imperium Database Network, @{DISPLAY_NAME}.\n\n',
        'DNI AUTOMATED SYSTEM\n',
        'system@dni.org\n\n',
        'This is an automated DNI system message. Replies to this address are not monitored.'
     ),
     0, 'sent', CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6));
