<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-citizen.php';

dni_start_session();
dni_security_headers();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Robots-Tag: noindex, nofollow, noarchive');

function dni_admin_citizens_mail_local(string $username, int $fallbackId): string
{
    $local = strtolower(trim($username));
    if ($local === '') $local = $fallbackId > 0 ? 'user' . $fallbackId : 'user';
    $local = preg_replace('/[^a-z0-9._-]+/', '-', $local) ?? '';
    $local = trim($local, '.-');
    if ($local === '') $local = $fallbackId > 0 ? 'user' . $fallbackId : 'user';
    return substr($local, 0, 64);
}

function dni_admin_citizens_name(array $row): string
{
    $name = trim((string)($row['guild_nick'] ?? ''));
    if ($name === '') $name = trim((string)($row['global_name'] ?? ''));
    if ($name === '') $name = trim((string)($row['username'] ?? ''));
    return $name !== '' ? $name : 'DNI Citizen';
}

function dni_admin_citizens_source_label(string $source): string
{
    return match ($source) {
        'citizen_role' => 'Citizen role',
        'ally' => 'Ally',
        'merchant' => 'Merchant',
        'not_org_member' => 'Not an organization member',
        'outside_discord_server' => 'Outside DNI Discord server',
        default => $source !== '' ? str_replace('_', ' ', $source) : 'Citizen',
    };
}

try {
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
        header('Allow: GET');
        dni_json(405, ['ok' => false, 'error' => 'GET required.']);
    }

    $action = strtolower(trim((string)($_GET['action'] ?? 'bootstrap')));
    if ($action !== 'bootstrap') dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Citizen Admin operation.']);

    $db = dni_embedded_transaction();
    $actor = dni_require_admin_authorized_user(dni_embedded_current_user($db));

    $shadowIds = [];
    foreach ((array)($db['users'] ?? []) as $user) {
        if (!is_array($user)) continue;
        $discordId = trim((string)($user['discordUserId'] ?? ''));
        if ($discordId !== '') $shadowIds[$discordId] = (int)($user['id'] ?? 0);
    }

    $pdo = dni_citizen_sqlite();
    $statement = $pdo->query(
        "SELECT id, discord_user_id, username, global_name, guild_nick, citizen_source, in_dni_discord,\n"
        . "       discord_roles_json, account_status, first_seen_at, last_login_at, last_role_sync_at, promoted_to_member_at\n"
        . "  FROM dni_citizen_users\n"
        . " WHERE promoted_to_member_at IS NULL AND account_status <> 'member'\n"
        . " ORDER BY COALESCE(guild_nick, global_name, username) COLLATE NOCASE ASC, id ASC"
    );

    $citizens = [];
    $insideDiscord = 0;
    $outsideDiscord = 0;
    $sourceCounts = [];

    while ($row = $statement->fetch()) {
        if (!is_array($row)) continue;
        $id = (int)($row['id'] ?? 0);
        $discordId = trim((string)($row['discord_user_id'] ?? ''));
        $username = trim((string)($row['username'] ?? ''));
        $source = trim((string)($row['citizen_source'] ?? 'citizen'));
        $inDniDiscord = (int)($row['in_dni_discord'] ?? 0) === 1;
        $roles = json_decode((string)($row['discord_roles_json'] ?? '[]'), true);
        if (!is_array($roles)) $roles = [];
        $roles = dni_citizen_role_ids($roles);

        if ($inDniDiscord) $insideDiscord++; else $outsideDiscord++;
        $sourceCounts[$source] = ($sourceCounts[$source] ?? 0) + 1;

        $citizens[] = [
            'id' => $id,
            'shadow_user_id' => $shadowIds[$discordId] ?? null,
            'discord_user_id' => $discordId,
            'username' => $username,
            'display_name' => dni_admin_citizens_name($row),
            'global_name' => $row['global_name'] ?? null,
            'guild_nick' => $row['guild_nick'] ?? null,
            'citizen_source' => $source,
            'citizen_source_label' => dni_admin_citizens_source_label($source),
            'in_dni_discord' => $inDniDiscord,
            'discord_roles' => $roles,
            'account_status' => (string)($row['account_status'] ?? 'active'),
            'mail_address' => dni_admin_citizens_mail_local($username, $id) . '@citizen.dni.org',
            'clearance' => ['level' => 0, 'code' => 'CL/NON', 'name' => 'Unclassified'],
            'first_seen_at' => $row['first_seen_at'] ?? null,
            'last_login_at' => $row['last_login_at'] ?? null,
            'last_role_sync_at' => $row['last_role_sync_at'] ?? null,
        ];
    }

    ksort($sourceCounts);
    dni_json(200, [
        'ok' => true,
        'databaseMode' => 'sqlite',
        'identityDatabase' => DNI_CITIZEN_TABLE,
        'actorUserId' => (int)($actor['id'] ?? 0),
        'citizens' => $citizens,
        'counts' => [
            'total' => count($citizens),
            'inDniDiscord' => $insideDiscord,
            'outsideDniDiscord' => $outsideDiscord,
            'sources' => $sourceCounts,
        ],
    ]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Admin Citizens] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Citizen database is unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Admin Citizens] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Citizen database is unavailable.']);
}
