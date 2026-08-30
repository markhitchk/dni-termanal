<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-documents.php';

dni_start_session();
dni_require_method('GET');

$action = strtolower(trim((string)($_GET['action'] ?? 'list')));
$number = $_GET['number'] ?? null;
$query = trim((string)($_GET['q'] ?? ''));
if (strlen($query) > 100) $query = substr($query, 0, 100);

function dni_documents_embedded_request(string $action, mixed $number, string $query): never
{
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    $context = dni_embedded_document_context($user);

    if ($action === 'list' || $action === 'search') {
        $documents = dni_embedded_authorized_documents($db, $user, $action === 'search' ? $query : '', false);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'effectiveClearance' => $context['state'],
            'documents' => $documents,
        ]);
    }

    if ($action === 'record' || $action === 'download') {
        $document = dni_embedded_authorized_document($db, $user, $number);
        if ($document === null) dni_json(404, ['ok' => false, 'error' => 'DNI record not found.']);

        if ($action === 'record') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'embedded-server',
                'effectiveClearance' => $context['state'],
                'document' => $document,
            ]);
        }

        dni_security_headers();
        header('Content-Type: text/plain; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $document['file_code'] . '.txt"');
        header('X-DNI-Classification: ' . $document['classification']);
        echo dni_document_download_text($document);
        exit;
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI document operation.']);
}

function dni_documents_mariadb_request(PDO $pdo, ?int $userId, string $action, mixed $number, string $query): never
{
    $context = dni_mariadb_document_context($pdo, $userId);

    if ($action === 'list' || $action === 'search') {
        $documents = dni_mariadb_authorized_documents($pdo, $userId, $action === 'search' ? $query : '', false);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'mariadb',
            'effectiveClearance' => $context['state'],
            'documents' => $documents,
        ]);
    }

    if ($action === 'record' || $action === 'download') {
        $document = dni_mariadb_authorized_document($pdo, $userId, $number);
        if ($document === null) dni_json(404, ['ok' => false, 'error' => 'DNI record not found.']);

        if ($action === 'record') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'mariadb',
                'effectiveClearance' => $context['state'],
                'document' => $document,
            ]);
        }

        if ($userId !== null) {
            dni_audit($pdo, $userId, 'documents.download', 'document', (string)$document['file_code'], [
                'clearance' => $document['classification'],
            ]);
        }
        dni_security_headers();
        header('Content-Type: text/plain; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $document['file_code'] . '.txt"');
        header('X-DNI-Classification: ' . $document['classification']);
        echo dni_document_download_text($document);
        exit;
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI document operation.']);
}

try {
    // Prefer the authenticated MariaDB identity when one exists. Otherwise an
    // authenticated embedded-server identity remains authoritative for that
    // session. Public requests may use MariaDB when configured, with CL/NON.
    $mariaUserId = dni_current_user_id();
    if ($mariaUserId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        dni_documents_mariadb_request(dni_db(), $mariaUserId, $action, $number, $query);
    }

    $embeddedDb = dni_embedded_transaction();
    $embeddedUser = dni_embedded_current_user($embeddedDb);
    if ($embeddedUser !== null) {
        dni_documents_embedded_request($action, $number, $query);
    }

    if (dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        try {
            dni_documents_mariadb_request(dni_db(), null, $action, $number, $query);
        } catch (Throwable $error) {
            error_log('[DNI documents MariaDB public fallback] ' . $error->getMessage());
        }
    }

    dni_documents_embedded_request($action, $number, $query);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) {
        error_log('[DNI documents] ' . $error->getMessage());
        dni_json(500, ['ok' => false, 'error' => 'DNI document service unavailable.']);
    }
    dni_json($status, ['ok' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI documents] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI document service unavailable.']);
}
