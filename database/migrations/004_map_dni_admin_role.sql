-- P1 authorization parity for optional MariaDB deployments.
-- The approved DNI Admin Discord role must resolve to the server-side admin
-- permission after Discord role synchronization.

INSERT IGNORE INTO dni_discord_role_permissions (discord_role_id, permission_key)
VALUES ('1429298416189444256', 'admin');
