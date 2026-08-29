#!/usr/bin/env php
<?php

declare(strict_types=1);

function audit_test(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$root = dirname(__DIR__);
$operational = (string)file_get_contents($root . '/database/migrations/010_operational_clearance.sql');
$audit = (string)file_get_contents($root . '/database/migrations/011_audit_hardening.sql');
$legacy = (string)file_get_contents($root . '/public/api/legacy.php');

foreach (['dni_sectors','dni_assets','dni_personnel','dni_service_requests','dni_audit_log'] as $table) {
    audit_test(str_contains($operational, $table), "operational migration covers {$table}");
}
audit_test(str_contains($operational, 'DEFAULT 6'), 'new legacy MariaDB operational writes fail secure at CLA/DIS');
audit_test(str_contains($operational, 'operational.classify'), 'operational classification capability exists');

foreach ([
    'trg_dni_audit_log_no_update', 'trg_dni_audit_log_no_delete',
    'trg_dni_clearance_events_no_update', 'trg_dni_clearance_events_no_delete',
    'trg_dni_document_classification_no_update', 'trg_dni_document_classification_no_delete',
    'trg_dni_document_workflow_no_update', 'trg_dni_document_workflow_no_delete',
    'trg_dni_assignment_history_no_update', 'trg_dni_assignment_history_no_delete',
    'trg_dni_service_events_no_update', 'trg_dni_service_events_no_delete',
] as $trigger) {
    audit_test(str_contains($audit, $trigger), "append-only migration contains {$trigger}");
}
audit_test(substr_count($audit, "SIGNAL SQLSTATE '45000'") >= 12, 'append-only triggers fail closed on mutation');

audit_test(str_contains($legacy, 'Legacy DNI operational write route is disabled.'), 'legacy MariaDB write dispatcher is disabled');
audit_test(str_contains($legacy, 'dni_mariadb_secure_network'), 'legacy sector read uses secure operational query');
audit_test(str_contains($legacy, 'dni_mariadb_secure_service_rows'), 'legacy service read uses secure operational query');
audit_test(!str_contains($legacy, "UPDATE dni_assets SET"), 'legacy compatibility endpoint contains no direct asset mutation');
audit_test(!str_contains($legacy, "UPDATE dni_personnel SET"), 'legacy compatibility endpoint contains no direct personnel mutation');

fwrite(STDOUT, "DNI append-only audit and legacy-route hardening verification passed.\n");
