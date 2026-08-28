-- P1 authorization cleanup.
-- Remove the legacy hard-coded developer-admin grant from the MariaDB permission table.
-- Ongoing DNI Admin access is granted by synchronized Discord roles or an explicitly
-- configured DNI_BOOTSTRAP_ADMIN_DISCORD_ID.

DELETE permission_row
  FROM dni_user_permissions AS permission_row
  INNER JOIN dni_users AS user_row ON user_row.id = permission_row.user_id
 WHERE permission_row.permission_key = 'admin'
   AND user_row.discord_user_id = '1459731143472713922';
