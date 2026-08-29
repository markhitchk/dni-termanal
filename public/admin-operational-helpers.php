<?php

declare(strict_types=1);

/**
 * Small compatibility layer for the secure Admin endpoint.
 * The Sectors bridge has equivalent local helpers; Admin loads these before
 * admin-secure.php so both entrypoints use the same fail-closed semantics.
 */
function dni_sector_find(array $rows, string $id): ?array
{
    foreach ($rows as $row) {
        if ((string)($row['id'] ?? '') === $id) return $row;
    }
    return null;
}

function dni_sector_activity(array &$db, string $type, string $text, int $level): void
{
    $level = dni_clearance_normalize_level($level);
    $db['network']['activity'] = is_array($db['network']['activity'] ?? null)
        ? array_values($db['network']['activity'])
        : [];
    array_unshift($db['network']['activity'], [
        'id' => 'evt-' . bin2hex(random_bytes(6)),
        'time' => gmdate('H:i'),
        'publicText' => $text,
        'adminText' => $text,
        'type' => strtoupper($type),
        'minimumClearance' => $level,
    ]);
    $db['network']['activity'] = array_slice($db['network']['activity'], 0, 100);
}
