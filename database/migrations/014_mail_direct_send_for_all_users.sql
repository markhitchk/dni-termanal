-- DNI Mail direct messaging is a per-user feature.
-- Every authenticated DNI account that already has mail.read also receives
-- mail.send. Announcement and service-broadcast permissions remain restricted.

INSERT IGNORE INTO dni_default_permissions (permission_key)
VALUES ('mail.send');
