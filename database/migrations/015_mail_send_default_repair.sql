-- DNI Mail permission repair.
-- Direct mail is available to every authenticated DNI account. Keep this as a
-- separate migration so servers that already recorded older mail migrations
-- still receive the corrected default permission on the next deployment.

INSERT IGNORE INTO dni_permissions (permission_key, description)
VALUES ('mail.send', 'Send clearance-controlled direct DNI Mail');

INSERT IGNORE INTO dni_default_permissions (permission_key)
VALUES ('mail.read'), ('mail.send');
