<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-clearance.php';

function dni_document_normalize_number(mixed $value): ?string
{
    $raw = strtoupper(trim((string)$value));
    $raw = preg_replace('/^DNI-/', '', $raw) ?? $raw;
    if (!preg_match('/^\d{1,6}$/', $raw)) return null;
    return str_pad((string)(int)$raw, 3, '0', STR_PAD_LEFT);
}

function dni_document_file_code(mixed $value): ?string
{
    $number = dni_document_normalize_number($value);
    return $number === null ? null : 'DNI-' . $number;
}

function dni_document_permission_allowed(array $permissions, ?string $requiredPermission): bool
{
    $requiredPermission = trim((string)$requiredPermission);
    if ($requiredPermission === '') return true;
    return in_array('admin', $permissions, true) || in_array($requiredPermission, $permissions, true);
}

function dni_document_shape(array $row, bool $includeBody = false): array
{
    $level = dni_clearance_normalize_level((int)($row['minimum_clearance'] ?? $row['clearanceLevel'] ?? -1));
    $clearance = dni_clearance_descriptor($level);
    $fileCode = (string)($row['file_code'] ?? $row['fileCode'] ?? '');

    $document = [
        'id' => $fileCode,
        'file_code' => $fileCode,
        'fileCode' => $fileCode,
        'title' => (string)($row['title'] ?? ''),
        'summary' => (string)($row['summary'] ?? ''),
        'sector' => (string)($row['sector'] ?? 'DNI ARCHIVE'),
        'classification' => $clearance['code'],
        'minimum_clearance' => $level,
        'clearance' => $clearance,
        'classification_status' => (string)($row['classification_status'] ?? $row['classificationStatus'] ?? 'final'),
        'status' => strtoupper((string)($row['status'] ?? 'published')),
        'updated_at' => $row['updated_at'] ?? $row['updatedAt'] ?? null,
    ];

    if ($includeBody) $document['body'] = (string)($row['body'] ?? '');
    return $document;
}

function dni_mariadb_document_context(PDO $pdo, ?int $userId): array
{
    if ($userId === null) {
        return [
            'level' => DNI_CLEARANCE_CL_NON,
            'permissions' => [],
            'state' => dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'public', 'override' => false],
        ];
    }

    $state = dni_effective_clearance_state($pdo, $userId);
    return [
        'level' => (int)$state['level'],
        'permissions' => dni_effective_permissions($pdo, $userId),
        'state' => $state,
    ];
}

function dni_mariadb_authorized_documents(
    PDO $pdo,
    ?int $userId,
    string $query = '',
    bool $includeBody = false
): array {
    $context = dni_mariadb_document_context($pdo, $userId);
    $query = trim($query);

    $columns = 'id, file_code, title, summary, classification, classification_status, minimum_clearance, required_permission, status, updated_at';
    if ($includeBody) $columns .= ', body';

    $sql = "SELECT {$columns}
              FROM dni_documents
             WHERE status = 'published'
               AND classification_status = 'final'
               AND minimum_clearance <= ?";
    $params = [$context['level']];

    if ($query !== '') {
        $sql .= ' AND (file_code LIKE ? OR title LIKE ? OR summary LIKE ? OR body LIKE ?)';
        $needle = '%' . mb_substr($query, 0, 100) . '%';
        array_push($params, $needle, $needle, $needle, $needle);
    }

    $sql .= ' ORDER BY minimum_clearance ASC, file_code ASC LIMIT 250';
    $statement = $pdo->prepare($sql);
    $statement->execute($params);

    $documents = [];
    foreach ($statement->fetchAll() as $row) {
        if (!dni_document_permission_allowed($context['permissions'], $row['required_permission'] ?? null)) continue;
        $documents[] = dni_document_shape($row, $includeBody);
    }
    return $documents;
}

function dni_mariadb_authorized_document(PDO $pdo, ?int $userId, mixed $number): ?array
{
    $fileCode = dni_document_file_code($number);
    if ($fileCode === null) return null;
    $context = dni_mariadb_document_context($pdo, $userId);

    $statement = $pdo->prepare(
        "SELECT id, file_code, title, summary, body, classification, classification_status,
                minimum_clearance, required_permission, status, updated_at
           FROM dni_documents
          WHERE file_code = ?
            AND status = 'published'
            AND classification_status = 'final'
            AND minimum_clearance <= ?
          LIMIT 1"
    );
    $statement->execute([$fileCode, $context['level']]);
    $row = $statement->fetch();
    if (!$row) return null;
    if (!dni_document_permission_allowed($context['permissions'], $row['required_permission'] ?? null)) return null;
    return dni_document_shape($row, true);
}

/**
 * Embedded-server documents are read from the server-side embedded database.
 * A single CL/NON orientation record is supplied until the embedded database
 * has a documents collection. No restricted record metadata is hard-coded in
 * browser assets or sent to unauthorized clients.
 */
function dni_embedded_document_rows(array $db): array
{
    $rows = is_array($db['documents'] ?? null) ? array_values($db['documents']) : [];
    $hasOrientation = false;
    foreach ($rows as $row) {
        if ((string)($row['fileCode'] ?? '') === 'DNI-173') $hasOrientation = true;
    }
    if (!$hasOrientation) {
        $rows[] = [
            'fileCode' => 'DNI-173',
            'title' => 'DNI Terminal Orientation',
            'summary' => 'Public orientation record for DNI Terminal document access and clearance handling.',
            'body' => 'DNI Terminal retrieves documents from the server and only returns records authorized for the current clearance. Restricted document metadata is not exposed to unauthorized clients.',
            'sector' => 'DNI NETWORK',
            'clearanceLevel' => DNI_CLEARANCE_CL_NON,
            'requiredPermission' => null,
            'classificationStatus' => 'final',
            'status' => 'published',
            'updatedAt' => null,
        ];
    }
    return $rows;
}

function dni_embedded_document_context(?array $user): array
{
    if ($user === null) {
        return [
            'level' => DNI_CLEARANCE_CL_NON,
            'permissions' => [],
            'state' => dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'public', 'override' => false],
        ];
    }

    $state = dni_embedded_effective_clearance_state($user);
    $permissions = function_exists('dni_embedded_permissions') ? dni_embedded_permissions($user) : [];
    // Authenticated DNI members receive the same baseline document-read
    // capability as the MariaDB default-permissions table.
    $permissions[] = 'documents.read';
    $permissions = array_values(array_unique(array_map('strval', $permissions)));

    return [
        'level' => (int)$state['level'],
        'permissions' => $permissions,
        'state' => $state,
    ];
}

function dni_embedded_authorized_documents(
    array $db,
    ?array $user,
    string $query = '',
    bool $includeBody = false
): array {
    $context = dni_embedded_document_context($user);
    $query = mb_strtolower(trim($query));
    $documents = [];

    foreach (dni_embedded_document_rows($db) as $row) {
        if (!array_key_exists('clearanceLevel', $row)) continue; // no clearance = no document
        try {
            $level = dni_clearance_normalize_level($row['clearanceLevel']);
        } catch (Throwable) {
            continue;
        }
        if ($level > $context['level']) continue;
        if (strtolower((string)($row['status'] ?? '')) !== 'published') continue;
        if (strtolower((string)($row['classificationStatus'] ?? '')) !== 'final') continue;
        if (!dni_document_permission_allowed($context['permissions'], $row['requiredPermission'] ?? null)) continue;

        if ($query !== '') {
            $haystack = mb_strtolower(implode(' ', [
                (string)($row['fileCode'] ?? ''),
                (string)($row['title'] ?? ''),
                (string)($row['summary'] ?? ''),
                (string)($row['body'] ?? ''),
            ]));
            if (!str_contains($haystack, $query)) continue;
        }
        $documents[] = dni_document_shape($row, $includeBody);
    }

    usort($documents, static function (array $a, array $b): int {
        $level = ((int)$a['minimum_clearance']) <=> ((int)$b['minimum_clearance']);
        return $level !== 0 ? $level : strcmp((string)$a['file_code'], (string)$b['file_code']);
    });
    return $documents;
}

function dni_embedded_authorized_document(array $db, ?array $user, mixed $number): ?array
{
    $fileCode = dni_document_file_code($number);
    if ($fileCode === null) return null;
    foreach (dni_embedded_authorized_documents($db, $user, '', true) as $document) {
        if ((string)$document['file_code'] === $fileCode) return $document;
    }
    return null;
}

function dni_document_download_text(array $document): string
{
    $clearance = $document['clearance'] ?? dni_clearance_descriptor((int)($document['minimum_clearance'] ?? 0));
    return implode("\n", [
        (string)$document['file_code'],
        (string)$document['title'],
        'CLASSIFICATION: ' . (string)$clearance['code'] . ' — ' . (string)$clearance['name'],
        'STATUS: ' . (string)$document['status'],
        '',
        (string)$document['summary'],
        '',
        (string)($document['body'] ?? ''),
        '',
    ]);
}
