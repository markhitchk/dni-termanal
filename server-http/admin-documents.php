<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-documents.php';

dni_start_session();

function dni_admin_documents_file_code(array $row): string
{
    return (string)($row['fileCode'] ?? $row['file_code'] ?? '');
}

function dni_admin_documents_level(array $row): ?int
{
    if (array_key_exists('clearanceLevel', $row)) return dni_clearance_normalize_level($row['clearanceLevel']);
    if (array_key_exists('minimum_clearance', $row)) return dni_clearance_normalize_level($row['minimum_clearance']);
    return null;
}

function dni_admin_documents_snapshot(array $db, array $actor): array
{
    $actorLevel = (int)dni_embedded_effective_clearance_state($actor)['level'];
    $documents = [];

    foreach (is_array($db['documents'] ?? null) ? $db['documents'] : [] as $row) {
        if (!is_array($row)) continue;
        try {
            $level = dni_admin_documents_level($row);
        } catch (Throwable) {
            continue;
        }
        if ($level === null || $level > $actorLevel) continue;
        $fileCode = dni_admin_documents_file_code($row);
        if ($fileCode === '') continue;

        $document = dni_document_shape($row, false);
        $document['created_by'] = $row['createdBy'] ?? $row['created_by'] ?? null;
        $documents[] = $document;
    }

    usort($documents, static function (array $a, array $b): int {
        $updated = strcmp((string)($b['updated_at'] ?? ''), (string)($a['updated_at'] ?? ''));
        return $updated !== 0 ? $updated : strcmp((string)$a['file_code'], (string)$b['file_code']);
    });

    return [
        'ok' => true,
        'databaseMode' => 'embedded-server',
        'csrfToken' => dni_csrf_token(),
        'documents' => $documents,
    ];
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'list' : ''))));
    $db = dni_embedded_transaction();
    $actor = dni_require_admin_authorized_user(dni_embedded_current_user($db));
    $actorLevel = (int)dni_embedded_effective_clearance_state($actor)['level'];

    if ($method === 'GET' && $action === 'list') {
        dni_json(200, dni_admin_documents_snapshot($db, $actor));
    }

    if ($method !== 'POST') {
        header('Allow: GET, POST');
        dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    }
    dni_require_csrf();
    if ($action !== 'archive') dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Admin document operation.']);

    $body = dni_read_json_body();
    $fileCode = dni_document_file_code($body['number'] ?? $body['fileCode'] ?? null);
    if ($fileCode === null) throw new RuntimeException('Valid DNI document number required.', 422);

    dni_embedded_transaction(function (array &$store) use ($fileCode, $actor, $actorLevel): void {
        $documents = is_array($store['documents'] ?? null) ? array_values($store['documents']) : [];
        $found = false;
        $now = dni_embedded_now();

        foreach ($documents as $index => $row) {
            if (!is_array($row) || dni_admin_documents_file_code($row) !== $fileCode) continue;
            $level = dni_admin_documents_level($row);
            if ($level === null || $level > $actorLevel) throw new RuntimeException('DNI document not found.', 404);
            if (strtolower((string)($row['status'] ?? '')) === 'archived') throw new RuntimeException('DNI document is already removed from active records.', 409);

            $fromStatus = (string)($row['status'] ?? 'draft');
            $row['status'] = 'archived';
            $row['updatedBy'] = (int)$actor['id'];
            $row['updatedAt'] = $now;
            $documents[$index] = $row;

            $store['documentWorkflowEvents'] = is_array($store['documentWorkflowEvents'] ?? null)
                ? array_values($store['documentWorkflowEvents'])
                : [];
            $store['documentWorkflowEvents'][] = [
                'fileCode' => $fileCode,
                'actorUserId' => (int)$actor['id'],
                'eventType' => 'archived',
                'fromStatus' => $fromStatus,
                'toStatus' => 'archived',
                'clearanceLevel' => $level,
                'note' => 'Removed from active DNI documents by an administrator.',
                'createdAt' => $now,
            ];
            $found = true;
            break;
        }

        if (!$found) throw new RuntimeException('DNI document not found.', 404);
        $store['documents'] = $documents;
    });

    $updatedDb = dni_embedded_transaction();
    $updatedActor = dni_require_admin_authorized_user(dni_embedded_current_user($updatedDb));
    dni_json(200, dni_admin_documents_snapshot($updatedDb, $updatedActor) + ['archived' => $fileCode]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI admin documents] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Admin document operation failed.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI admin documents] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Admin document operation failed.']);
}
