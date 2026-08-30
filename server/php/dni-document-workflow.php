<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-clearance.php';
require_once __DIR__ . '/dni-documents.php';

const DNI_DOCUMENT_WORKFLOW_EDITABLE = ['draft', 'changes_requested'];
const DNI_DOCUMENT_WORKFLOW_REVIEWABLE = ['in_review'];

function dni_workflow_text(mixed $value, int $max, string $field, bool $required = true): string
{
    $value = trim((string)$value);
    if ($required && $value === '') throw new RuntimeException("{$field} is required.", 422);
    if (mb_strlen($value) > $max) throw new RuntimeException("{$field} is too long.", 422);
    return $value;
}

function dni_workflow_file_code(): string
{
    return 'DNI-' . str_pad((string)random_int(1, 999999), 6, '0', STR_PAD_LEFT);
}

function dni_workflow_has(array $permissions, string $permission): bool
{
    return in_array('admin', $permissions, true) || in_array($permission, $permissions, true);
}

function dni_workflow_require(array $permissions, string $permission): void
{
    if (!dni_workflow_has($permissions, $permission)) {
        throw new RuntimeException('DNI document workflow permission required.', 403);
    }
}

function dni_workflow_classification_label(int $level): string
{
    return (string)dni_clearance_descriptor($level)['code'];
}

function dni_mariadb_workflow_context(PDO $pdo, int $userId): array
{
    $state = dni_effective_clearance_state($pdo, $userId);
    return [
        'level' => (int)$state['level'],
        'clearance' => $state,
        'permissions' => dni_effective_permissions($pdo, $userId),
    ];
}

function dni_mariadb_workflow_row(PDO $pdo, string $fileCode, bool $forUpdate = false): ?array
{
    $sql = "SELECT id, file_code, title, summary, body, classification, classification_status,
                   minimum_clearance, required_permission, status, created_by, updated_by,
                   classifier_id, classified_at, classification_reason, submitted_by,
                   submitted_at, reviewer_id, reviewed_at, review_reason, published_by,
                   published_at, created_at, updated_at
              FROM dni_documents
             WHERE file_code = ?
             LIMIT 1" . ($forUpdate ? ' FOR UPDATE' : '');
    $statement = $pdo->prepare($sql);
    $statement->execute([$fileCode]);
    $row = $statement->fetch();
    return is_array($row) ? $row : null;
}

function dni_mariadb_workflow_authorized_row(PDO $pdo, int $userId, mixed $number, bool $forUpdate = false): ?array
{
    $fileCode = dni_document_file_code($number);
    if ($fileCode === null) return null;
    $row = dni_mariadb_workflow_row($pdo, $fileCode, $forUpdate);
    if ($row === null) return null;
    $context = dni_mariadb_workflow_context($pdo, $userId);
    $level = dni_clearance_normalize_level((int)$row['minimum_clearance']);
    if ($level > $context['level']) return null;
    if (!dni_document_permission_allowed($context['permissions'], $row['required_permission'] ?? null)) return null;
    return $row;
}

function dni_workflow_shape(array $row): array
{
    $document = dni_document_shape($row, true);
    $document['created_by'] = isset($row['created_by']) ? (int)$row['created_by'] : ($row['createdBy'] ?? null);
    $document['updated_by'] = isset($row['updated_by']) ? (int)$row['updated_by'] : ($row['updatedBy'] ?? null);
    $document['submitted_by'] = isset($row['submitted_by']) ? ($row['submitted_by'] === null ? null : (int)$row['submitted_by']) : ($row['submittedBy'] ?? null);
    $document['submitted_at'] = $row['submitted_at'] ?? $row['submittedAt'] ?? null;
    $document['reviewer_id'] = isset($row['reviewer_id']) ? ($row['reviewer_id'] === null ? null : (int)$row['reviewer_id']) : ($row['reviewerId'] ?? null);
    $document['reviewed_at'] = $row['reviewed_at'] ?? $row['reviewedAt'] ?? null;
    $document['review_reason'] = $row['review_reason'] ?? $row['reviewReason'] ?? null;
    $document['published_by'] = isset($row['published_by']) ? ($row['published_by'] === null ? null : (int)$row['published_by']) : ($row['publishedBy'] ?? null);
    $document['published_at'] = $row['published_at'] ?? $row['publishedAt'] ?? null;
    $document['classified_at'] = $row['classified_at'] ?? $row['classifiedAt'] ?? null;
    $document['classification_reason'] = $row['classification_reason'] ?? $row['classificationReason'] ?? null;
    return $document;
}

function dni_mariadb_workflow_event(
    PDO $pdo,
    int $documentId,
    int $actorUserId,
    string $eventType,
    ?string $fromStatus,
    string $toStatus,
    int $clearanceLevel,
    ?string $note = null
): void {
    $statement = $pdo->prepare(
        'INSERT INTO dni_document_workflow_events
            (document_id, actor_user_id, event_type, from_status, to_status, clearance_level, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $documentId,
        $actorUserId,
        $eventType,
        $fromStatus,
        $toStatus,
        dni_clearance_normalize_level($clearanceLevel),
        $note === null ? null : mb_substr(trim($note), 0, 1000),
    ]);
}

function dni_mariadb_workflow_version(PDO $pdo, array $row, int $actorUserId): void
{
    $next = $pdo->prepare('SELECT COALESCE(MAX(version_number), 0) + 1 FROM dni_document_versions WHERE document_id = ?');
    $next->execute([(int)$row['id']]);
    $version = max(1, (int)$next->fetchColumn());
    $insert = $pdo->prepare(
        'INSERT INTO dni_document_versions
            (document_id, version_number, title, summary, body, classification,
             classification_status, clearance_level, author_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insert->execute([
        (int)$row['id'], $version, (string)$row['title'], (string)$row['summary'],
        (string)$row['body'], (string)$row['classification'], (string)$row['classification_status'],
        (int)$row['minimum_clearance'], $actorUserId,
    ]);
}

function dni_mariadb_workflow_list(PDO $pdo, int $userId, string $scope): array
{
    $context = dni_mariadb_workflow_context($pdo, $userId);
    $scope = strtolower(trim($scope));
    $where = ['minimum_clearance <= ?'];
    $params = [$context['level']];

    if ($scope === 'own') {
        $where[] = 'created_by = ?';
        $where[] = "status IN ('draft','in_review','changes_requested','rejected','approved')";
        $params[] = $userId;
    } elseif ($scope === 'review') {
        dni_workflow_require($context['permissions'], 'documents.view_review_queue');
        $where[] = "status IN ('in_review','approved')";
    } else {
        throw new RuntimeException('Unknown document workflow scope.', 404);
    }

    $sql = "SELECT id, file_code, title, summary, body, classification, classification_status,
                   minimum_clearance, required_permission, status, created_by, updated_by,
                   classifier_id, classified_at, classification_reason, submitted_by,
                   submitted_at, reviewer_id, reviewed_at, review_reason, published_by,
                   published_at, created_at, updated_at
              FROM dni_documents
             WHERE " . implode(' AND ', $where) . '
             ORDER BY updated_at DESC
             LIMIT 250';
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    $out = [];
    foreach ($statement->fetchAll() as $row) {
        if (!dni_document_permission_allowed($context['permissions'], $row['required_permission'] ?? null)) continue;
        $out[] = dni_workflow_shape($row);
    }
    return $out;
}

function dni_mariadb_workflow_create(PDO $pdo, int $userId, array $input): array
{
    $context = dni_mariadb_workflow_context($pdo, $userId);
    dni_workflow_require($context['permissions'], 'documents.create');
    $title = dni_workflow_text($input['title'] ?? '', 180, 'Title');
    $summary = dni_workflow_text($input['summary'] ?? '', 500, 'Summary');
    $body = dni_workflow_text($input['body'] ?? '', 200000, 'Body');
    $level = $context['level']; // fail-secure provisional classification
    $classification = dni_workflow_classification_label($level);

    $pdo->beginTransaction();
    try {
        $fileCode = null;
        $insert = $pdo->prepare(
            "INSERT INTO dni_documents
                (file_code, title, summary, body, classification, classification_status,
                 minimum_clearance, required_permission, status, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, 'provisional', ?, NULL, 'draft', ?, ?)"
        );
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $candidate = dni_workflow_file_code();
            try {
                $insert->execute([$candidate, $title, $summary, $body, $classification, $level, $userId, $userId]);
                $fileCode = $candidate;
                break;
            } catch (PDOException $error) {
                if ((string)$error->getCode() !== '23000') throw $error;
            }
        }
        if ($fileCode === null) throw new RuntimeException('Unable to allocate a DNI document number.', 503);
        $row = dni_mariadb_workflow_row($pdo, $fileCode, true);
        if ($row === null) throw new RuntimeException('Unable to load the new DNI document.', 500);
        dni_mariadb_workflow_version($pdo, $row, $userId);
        dni_mariadb_workflow_event($pdo, (int)$row['id'], $userId, 'created', null, 'draft', $level,
            'Draft created with fail-secure provisional clearance at the creator effective clearance.');
        dni_audit($pdo, $userId, 'documents.draft.create', 'document', $fileCode, ['clearance' => $classification]);
        $pdo->commit();
        return dni_workflow_shape($row);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function dni_mariadb_workflow_edit(PDO $pdo, int $userId, mixed $number, array $input): array
{
    $context = dni_mariadb_workflow_context($pdo, $userId);
    dni_workflow_require($context['permissions'], 'documents.edit_own');
    $title = dni_workflow_text($input['title'] ?? '', 180, 'Title');
    $summary = dni_workflow_text($input['summary'] ?? '', 500, 'Summary');
    $body = dni_workflow_text($input['body'] ?? '', 200000, 'Body');
    $fileCode = dni_document_file_code($number);
    if ($fileCode === null) throw new RuntimeException('DNI record not found.', 404);

    $pdo->beginTransaction();
    try {
        $row = dni_mariadb_workflow_authorized_row($pdo, $userId, $fileCode, true);
        if ($row === null) throw new RuntimeException('DNI record not found.', 404);
        if (!in_array((string)$row['status'], DNI_DOCUMENT_WORKFLOW_EDITABLE, true)) {
            throw new RuntimeException('This DNI document is locked for workflow review.', 409);
        }
        if ((int)$row['created_by'] !== $userId && !dni_workflow_has($context['permissions'], 'admin')) {
            throw new RuntimeException('DNI record not found.', 404);
        }
        $update = $pdo->prepare('UPDATE dni_documents SET title = ?, summary = ?, body = ?, updated_by = ? WHERE id = ?');
        $update->execute([$title, $summary, $body, $userId, (int)$row['id']]);
        $row = dni_mariadb_workflow_row($pdo, $fileCode, true);
        dni_mariadb_workflow_version($pdo, $row, $userId);
        dni_mariadb_workflow_event($pdo, (int)$row['id'], $userId, 'edited', (string)$row['status'], (string)$row['status'], (int)$row['minimum_clearance']);
        dni_audit($pdo, $userId, 'documents.draft.edit', 'document', $fileCode);
        $pdo->commit();
        return dni_workflow_shape($row);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function dni_mariadb_workflow_submit(PDO $pdo, int $userId, mixed $number): array
{
    $context = dni_mariadb_workflow_context($pdo, $userId);
    dni_workflow_require($context['permissions'], 'documents.submit_review');
    $fileCode = dni_document_file_code($number);
    if ($fileCode === null) throw new RuntimeException('DNI record not found.', 404);

    $pdo->beginTransaction();
    try {
        $row = dni_mariadb_workflow_authorized_row($pdo, $userId, $fileCode, true);
        if ($row === null) throw new RuntimeException('DNI record not found.', 404);
        if ((int)$row['created_by'] !== $userId && !dni_workflow_has($context['permissions'], 'admin')) {
            throw new RuntimeException('DNI record not found.', 404);
        }
        if (!in_array((string)$row['status'], DNI_DOCUMENT_WORKFLOW_EDITABLE, true)) {
            throw new RuntimeException('Only an editable DNI draft can be submitted.', 409);
        }
        if ((string)$row['classification_status'] !== 'provisional') {
            throw new RuntimeException('Only provisional documents can enter ISB review.', 409);
        }
        $from = (string)$row['status'];
        $update = $pdo->prepare(
            "UPDATE dni_documents
                SET status = 'in_review', submitted_by = ?, submitted_at = UTC_TIMESTAMP(6),
                    reviewer_id = NULL, reviewed_at = NULL, review_reason = NULL, updated_by = ?
              WHERE id = ?"
        );
        $update->execute([$userId, $userId, (int)$row['id']]);
        $row = dni_mariadb_workflow_row($pdo, $fileCode, true);
        dni_mariadb_workflow_event($pdo, (int)$row['id'], $userId, 'submitted', $from, 'in_review', (int)$row['minimum_clearance']);
        dni_audit($pdo, $userId, 'documents.review.submit', 'document', $fileCode);
        $pdo->commit();
        return dni_workflow_shape($row);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function dni_mariadb_workflow_review(PDO $pdo, int $userId, mixed $number, string $decision, array $input): array
{
    $context = dni_mariadb_workflow_context($pdo, $userId);
    dni_workflow_require($context['permissions'], 'documents.review');
    $fileCode = dni_document_file_code($number);
    if ($fileCode === null) throw new RuntimeException('DNI record not found.', 404);
    $decision = strtolower(trim($decision));
    if (!in_array($decision, ['changes_requested', 'rejected', 'approved'], true)) {
        throw new RuntimeException('Unknown ISB review decision.', 422);
    }
    $reason = dni_workflow_text($input['reason'] ?? '', 1000, 'Review reason');

    $pdo->beginTransaction();
    try {
        $row = dni_mariadb_workflow_authorized_row($pdo, $userId, $fileCode, true);
        if ($row === null || (string)$row['status'] !== 'in_review') {
            throw new RuntimeException('DNI record not found.', 404);
        }
        $oldLevel = dni_clearance_normalize_level((int)$row['minimum_clearance']);

        if ($decision === 'approved') {
            dni_workflow_require($context['permissions'], 'documents.classify');
            $newLevel = dni_clearance_normalize_level($input['clearanceLevel'] ?? -1);
            if ($newLevel > $context['level']) {
                throw new RuntimeException('You cannot classify a document above your own clearance.', 403);
            }
            $classification = dni_workflow_classification_label($newLevel);
            $update = $pdo->prepare(
                "UPDATE dni_documents
                    SET status = 'approved', classification = ?, classification_status = 'final',
                        minimum_clearance = ?, classifier_id = ?, classified_at = UTC_TIMESTAMP(6),
                        classification_reason = ?, reviewer_id = ?, reviewed_at = UTC_TIMESTAMP(6),
                        review_reason = ?, updated_by = ?
                  WHERE id = ?"
            );
            $update->execute([$classification, $newLevel, $userId, $reason, $userId, $reason, $userId, (int)$row['id']]);
            $classificationEvent = $pdo->prepare(
                "INSERT INTO dni_document_classification_events
                    (document_id, actor_user_id, old_clearance_level, new_clearance_level, event_type, reason)
                 VALUES (?, ?, ?, ?, 'classified', ?)"
            );
            $classificationEvent->execute([(int)$row['id'], $userId, $oldLevel, $newLevel, mb_substr($reason, 0, 500)]);
            $row = dni_mariadb_workflow_row($pdo, $fileCode, true);
            dni_mariadb_workflow_version($pdo, $row, $userId);
            dni_mariadb_workflow_event($pdo, (int)$row['id'], $userId, 'approved', 'in_review', 'approved', $newLevel, $reason);
            dni_mariadb_workflow_event($pdo, (int)$row['id'], $userId, 'classified', 'in_review', 'approved', $newLevel, $reason);
        } else {
            $update = $pdo->prepare(
                'UPDATE dni_documents SET status = ?, reviewer_id = ?, reviewed_at = UTC_TIMESTAMP(6), review_reason = ?, updated_by = ? WHERE id = ?'
            );
            $update->execute([$decision, $userId, $reason, $userId, (int)$row['id']]);
            $row = dni_mariadb_workflow_row($pdo, $fileCode, true);
            dni_mariadb_workflow_event($pdo, (int)$row['id'], $userId, $decision, 'in_review', $decision, $oldLevel, $reason);
        }
        dni_audit($pdo, $userId, 'documents.review.' . $decision, 'document', $fileCode, ['reason' => $reason]);
        $pdo->commit();
        return dni_workflow_shape($row);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function dni_mariadb_workflow_publish(PDO $pdo, int $userId, mixed $number): array
{
    $context = dni_mariadb_workflow_context($pdo, $userId);
    dni_workflow_require($context['permissions'], 'documents.publish');
    $fileCode = dni_document_file_code($number);
    if ($fileCode === null) throw new RuntimeException('DNI record not found.', 404);

    $pdo->beginTransaction();
    try {
        $row = dni_mariadb_workflow_authorized_row($pdo, $userId, $fileCode, true);
        if ($row === null || (string)$row['status'] !== 'approved' || (string)$row['classification_status'] !== 'final') {
            throw new RuntimeException('DNI record not found.', 404);
        }
        $update = $pdo->prepare(
            "UPDATE dni_documents
                SET status = 'published', published_by = ?, published_at = UTC_TIMESTAMP(6), updated_by = ?
              WHERE id = ?"
        );
        $update->execute([$userId, $userId, (int)$row['id']]);
        $row = dni_mariadb_workflow_row($pdo, $fileCode, true);
        dni_mariadb_workflow_event($pdo, (int)$row['id'], $userId, 'published', 'approved', 'published', (int)$row['minimum_clearance']);
        dni_audit($pdo, $userId, 'documents.publish', 'document', $fileCode, ['clearance' => (string)$row['classification']]);
        $pdo->commit();
        return dni_workflow_shape($row);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function dni_embedded_workflow_permissions(array $user): array
{
    $permissions = function_exists('dni_embedded_permissions') ? dni_embedded_permissions($user) : [];
    $roles = array_map('strval', is_array($user['roles'] ?? null) ? $user['roles'] : []);
    $officerRoles = [
        '1503543937917386792', '1424475940263825418', '1424476432364732568',
        '1420736834710929458', '1420736749524750397', '1420736707262939207',
        '1420736520184266752', '1424476471325622333', '1424476500379435170', '1420736542137122856',
    ];
    $isbRoles = ['1424823667195510866'];
    if (array_intersect($roles, $officerRoles)) {
        $permissions = array_merge($permissions, ['documents.create', 'documents.edit_own', 'documents.submit_review']);
    }
    if (array_intersect($roles, $isbRoles)) {
        $permissions = array_merge($permissions, [
            'documents.create', 'documents.edit_own', 'documents.submit_review', 'documents.review',
            'documents.view_review_queue', 'documents.classify', 'documents.reclassify',
            'documents.declassify', 'documents.publish',
        ]);
    }
    if (!empty($user['directAdmin'])) {
        $permissions = array_merge($permissions, [
            'admin', 'documents.create', 'documents.edit_own', 'documents.submit_review',
            'documents.review', 'documents.view_review_queue', 'documents.classify',
            'documents.reclassify', 'documents.declassify', 'documents.publish', 'documents.archive',
        ]);
    }
    return array_values(array_unique(array_map('strval', $permissions)));
}

function dni_embedded_workflow_list(array $db, array $user, string $scope): array
{
    $context = dni_embedded_document_context($user);
    $permissions = dni_embedded_workflow_permissions($user);
    $scope = strtolower(trim($scope));
    if ($scope === 'review') dni_workflow_require($permissions, 'documents.view_review_queue');
    if (!in_array($scope, ['own', 'review'], true)) throw new RuntimeException('Unknown document workflow scope.', 404);
    $out = [];
    foreach (dni_embedded_document_rows($db) as $row) {
        if (!array_key_exists('clearanceLevel', $row)) continue;
        $level = dni_clearance_normalize_level($row['clearanceLevel']);
        if ($level > $context['level']) continue;
        $status = strtolower((string)($row['status'] ?? ''));
        if ($scope === 'own') {
            if ((int)($row['createdBy'] ?? 0) !== (int)$user['id']) continue;
            if (!in_array($status, ['draft','in_review','changes_requested','rejected','approved'], true)) continue;
        } else {
            if (!in_array($status, ['in_review','approved'], true)) continue;
        }
        $out[] = dni_workflow_shape($row);
    }
    usort($out, static fn(array $a, array $b): int => strcmp((string)($b['updated_at'] ?? ''), (string)($a['updated_at'] ?? '')));
    return $out;
}

function dni_embedded_workflow_mutate(array $user, string $action, mixed $number, array $input): array
{
    $permissions = dni_embedded_workflow_permissions($user);
    $userId = (int)$user['id'];
    $result = null;
    dni_embedded_transaction(function (array &$db) use ($user, $userId, $permissions, $action, $number, $input, &$result): void {
        $db['documents'] = is_array($db['documents'] ?? null) ? array_values($db['documents']) : [];
        $db['documentVersions'] = is_array($db['documentVersions'] ?? null) ? array_values($db['documentVersions']) : [];
        $db['documentWorkflowEvents'] = is_array($db['documentWorkflowEvents'] ?? null) ? array_values($db['documentWorkflowEvents']) : [];
        $state = dni_embedded_effective_clearance_state($user);
        $currentLevel = (int)$state['level'];
        $now = dni_embedded_now();

        if ($action === 'create') {
            dni_workflow_require($permissions, 'documents.create');
            $title = dni_workflow_text($input['title'] ?? '', 180, 'Title');
            $summary = dni_workflow_text($input['summary'] ?? '', 500, 'Summary');
            $body = dni_workflow_text($input['body'] ?? '', 200000, 'Body');
            do { $fileCode = dni_workflow_file_code(); }
            while (array_filter($db['documents'], static fn(array $d): bool => (string)($d['fileCode'] ?? '') === $fileCode));
            $row = [
                'fileCode' => $fileCode, 'title' => $title, 'summary' => $summary, 'body' => $body,
                'sector' => 'DNI ARCHIVE', 'classification' => dni_workflow_classification_label($currentLevel),
                'classificationStatus' => 'provisional', 'clearanceLevel' => $currentLevel,
                'requiredPermission' => null, 'status' => 'draft', 'createdBy' => $userId,
                'updatedBy' => $userId, 'createdAt' => $now, 'updatedAt' => $now,
            ];
            $db['documents'][] = $row;
            $db['documentVersions'][] = $row + ['versionNumber' => 1, 'authorUserId' => $userId];
            $db['documentWorkflowEvents'][] = ['fileCode' => $fileCode, 'actorUserId' => $userId, 'eventType' => 'created', 'fromStatus' => null, 'toStatus' => 'draft', 'clearanceLevel' => $currentLevel, 'createdAt' => $now];
            $result = dni_workflow_shape($row);
            return;
        }

        $fileCode = dni_document_file_code($number);
        if ($fileCode === null) throw new RuntimeException('DNI record not found.', 404);
        $index = null;
        foreach ($db['documents'] as $i => $row) if ((string)($row['fileCode'] ?? '') === $fileCode) { $index = $i; break; }
        if ($index === null) throw new RuntimeException('DNI record not found.', 404);
        $row = $db['documents'][$index];
        if (!array_key_exists('clearanceLevel', $row) || dni_clearance_normalize_level($row['clearanceLevel']) > $currentLevel) {
            throw new RuntimeException('DNI record not found.', 404);
        }

        if ($action === 'edit') {
            dni_workflow_require($permissions, 'documents.edit_own');
            if ((int)($row['createdBy'] ?? 0) !== $userId && !dni_workflow_has($permissions, 'admin')) throw new RuntimeException('DNI record not found.', 404);
            if (!in_array(strtolower((string)$row['status']), DNI_DOCUMENT_WORKFLOW_EDITABLE, true)) throw new RuntimeException('This DNI document is locked for workflow review.', 409);
            $row['title'] = dni_workflow_text($input['title'] ?? '', 180, 'Title');
            $row['summary'] = dni_workflow_text($input['summary'] ?? '', 500, 'Summary');
            $row['body'] = dni_workflow_text($input['body'] ?? '', 200000, 'Body');
            $row['updatedBy'] = $userId; $row['updatedAt'] = $now;
            $db['documents'][$index] = $row;
            $version = 1 + count(array_filter($db['documentVersions'], static fn(array $v): bool => (string)($v['fileCode'] ?? '') === $fileCode));
            $db['documentVersions'][] = $row + ['versionNumber' => $version, 'authorUserId' => $userId];
            $db['documentWorkflowEvents'][] = ['fileCode' => $fileCode, 'actorUserId' => $userId, 'eventType' => 'edited', 'fromStatus' => $row['status'], 'toStatus' => $row['status'], 'clearanceLevel' => $row['clearanceLevel'], 'createdAt' => $now];
        } elseif ($action === 'submit') {
            dni_workflow_require($permissions, 'documents.submit_review');
            if ((int)($row['createdBy'] ?? 0) !== $userId && !dni_workflow_has($permissions, 'admin')) throw new RuntimeException('DNI record not found.', 404);
            if (!in_array(strtolower((string)$row['status']), DNI_DOCUMENT_WORKFLOW_EDITABLE, true) || strtolower((string)($row['classificationStatus'] ?? '')) !== 'provisional') throw new RuntimeException('Only an editable provisional DNI draft can be submitted.', 409);
            $from = $row['status']; $row['status'] = 'in_review'; $row['submittedBy'] = $userId; $row['submittedAt'] = $now; $row['updatedBy'] = $userId; $row['updatedAt'] = $now;
            $db['documents'][$index] = $row;
            $db['documentWorkflowEvents'][] = ['fileCode' => $fileCode, 'actorUserId' => $userId, 'eventType' => 'submitted', 'fromStatus' => $from, 'toStatus' => 'in_review', 'clearanceLevel' => $row['clearanceLevel'], 'createdAt' => $now];
        } elseif ($action === 'review') {
            dni_workflow_require($permissions, 'documents.review');
            if (strtolower((string)$row['status']) !== 'in_review') throw new RuntimeException('DNI record not found.', 404);
            $decision = strtolower(trim((string)($input['decision'] ?? '')));
            if (!in_array($decision, ['changes_requested','rejected','approved'], true)) throw new RuntimeException('Unknown ISB review decision.', 422);
            $reason = dni_workflow_text($input['reason'] ?? '', 1000, 'Review reason');
            if ($decision === 'approved') {
                dni_workflow_require($permissions, 'documents.classify');
                $newLevel = dni_clearance_normalize_level($input['clearanceLevel'] ?? -1);
                if ($newLevel > $currentLevel) throw new RuntimeException('You cannot classify a document above your own clearance.', 403);
                $row['classification'] = dni_workflow_classification_label($newLevel); $row['classificationStatus'] = 'final'; $row['clearanceLevel'] = $newLevel;
                $row['classifierId'] = $userId; $row['classifiedAt'] = $now; $row['classificationReason'] = $reason;
            }
            $row['status'] = $decision; $row['reviewerId'] = $userId; $row['reviewedAt'] = $now; $row['reviewReason'] = $reason; $row['updatedBy'] = $userId; $row['updatedAt'] = $now;
            $db['documents'][$index] = $row;
            if ($decision === 'approved') {
                $version = 1 + count(array_filter($db['documentVersions'], static fn(array $v): bool => (string)($v['fileCode'] ?? '') === $fileCode));
                $db['documentVersions'][] = $row + ['versionNumber' => $version, 'authorUserId' => $userId];
            }
            $db['documentWorkflowEvents'][] = ['fileCode' => $fileCode, 'actorUserId' => $userId, 'eventType' => $decision, 'fromStatus' => 'in_review', 'toStatus' => $decision, 'clearanceLevel' => $row['clearanceLevel'], 'note' => $reason, 'createdAt' => $now];
        } elseif ($action === 'publish') {
            dni_workflow_require($permissions, 'documents.publish');
            if (strtolower((string)$row['status']) !== 'approved' || strtolower((string)($row['classificationStatus'] ?? '')) !== 'final') throw new RuntimeException('DNI record not found.', 404);
            $row['status'] = 'published'; $row['publishedBy'] = $userId; $row['publishedAt'] = $now; $row['updatedBy'] = $userId; $row['updatedAt'] = $now;
            $db['documents'][$index] = $row;
            $db['documentWorkflowEvents'][] = ['fileCode' => $fileCode, 'actorUserId' => $userId, 'eventType' => 'published', 'fromStatus' => 'approved', 'toStatus' => 'published', 'clearanceLevel' => $row['clearanceLevel'], 'createdAt' => $now];
        } else {
            throw new RuntimeException('Unknown DNI document workflow action.', 404);
        }
        $result = dni_workflow_shape($row);
    });
    if (!is_array($result)) throw new RuntimeException('DNI document workflow failed.', 500);
    return $result;
}
