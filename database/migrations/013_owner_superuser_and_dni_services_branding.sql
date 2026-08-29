-- DNI Owner/Admin system-wide permission repair + DNI Services branding
-- HC-3 | Lord Sovereign (Owner) and Admin must always receive every registered
-- permission and the highest clearance in the MariaDB authorization path.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Grant every currently registered permission to Owner and Admin. This avoids
-- feature-specific gaps when newer modules add permissions after initial setup.
INSERT IGNORE INTO dni_discord_role_permissions (discord_role_id, permission_key)
SELECT privileged_roles.discord_role_id, permissions.permission_key
FROM (
    SELECT '1107373118412030063' AS discord_role_id
    UNION ALL
    SELECT '1429298416189444256'
) privileged_roles
CROSS JOIN dni_permissions permissions;

-- Re-assert absolute clearance for both protected administrative roles.
INSERT IGNORE INTO dni_discord_role_clearances (discord_role_id, clearance_level) VALUES
    ('1107373118412030063', 6),
    ('1429298416189444256', 6);

-- Update already-deployed DNI Mail branding without retaining the retired
-- studio name as a literal in current source.
UPDATE dni_mail_messages
   SET sender_label = REPLACE(sender_label, CONCAT('HARLEY', CHAR(39), 'S STUDIOS'), 'DNI SERVICES'),
       body = REPLACE(body, CONCAT('Harley', CHAR(39), 's Studios'), 'DNI Services')
 WHERE sender_label LIKE '%HARLEY%STUDIOS%'
    OR body LIKE '%Harley%Studios%';
