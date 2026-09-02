<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-authz.php';
require_once __DIR__ . '/dni-embedded.php';

const DNI_CITIZEN_TABLE = 'dni_citizen_users';

function dni_citizen_sqlite(): PDO
{
    $pdo = dni_embedded_sqlite();
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS dni_citizen_users (\n"
        . "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
        . "  discord_user_id TEXT NOT NULL UNIQUE,\n"
        . "  username TEXT NOT NULL,\n"
        . "  global_name TEXT NULL,\n"
        . "  guild_nick TEXT NULL,\n"
        . "  avatar_hash TEXT NULL,\n"
        . "  citizen_source TEXT NOT NULL,\n"
        . "  in_dni_discord INTEGER NOT NULL DEFAULT 0,\n"
        . "  discord_roles_json TEXT NOT NULL DEFAULT '[]',\n"
        . "  account_status TEXT NOT NULL DEFAULT 'active',\n"
        . "  first_seen_at TEXT NOT NULL,\n"
        . "  last_login_at TEXT NOT NULL,\n"
        . "  last_role_sync_at TEXT NOT NULL,\n"
        . "  promoted_to_member_at TEXT NULL\n"
        . ")"
    );
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_dni_citizen_users_status ON dni_citizen_users (account_status, last_login_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_dni_citizen_users_source ON dni_citizen_users (citizen_source, in_dni_discord)');
    return $pdo;
}

function dni_citizen_role_ids(array $roles): array
{
    $clean = [];
    foreach ($roles as $roleId) {
        $id = trim((string)$roleId);
        if ($id !== '' && ctype_digit($id)) $clean[$id] = true;
    }
    return array_keys($clean);
}

function dni_citizen_upsert_record(
    array $identity,
    array $member,
    string $source,
    bool $inDniDiscord,
    array $actualRoles
): array {
    $discordId = trim((string)($identity['id'] ?? ''));
    $username = trim((string)($identity['username'] ?? ''));
    if ($discordId === '' || $username === '') {
        throw new RuntimeException('Discord identity response is incomplete.');
    }

    $now = dni_embedded_now();
    $roles = dni_citizen_role_ids($actualRoles);
    $rolesJson = json_encode($roles, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $pdo = dni_citizen_sqlite();
    $statement = $pdo->prepare(
        "INSERT INTO dni_citizen_users (\n"
        . "  discord_user_id, username, global_name, guild_nick, avatar_hash, citizen_source,\n"
        . "  in_dni_discord, discord_roles_json, account_status, first_seen_at, last_login_at, last_role_sync_at, promoted_to_member_at\n"
        . ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL)\n"
        . "ON CONFLICT(discord_user_id) DO UPDATE SET\n"
        . "  username = excluded.username,\n"
        . "  global_name = excluded.global_name,\n"
        . "  guild_nick = excluded.guild_nick,\n"
        . "  avatar_hash = excluded.avatar_hash,\n"
        . "  citizen_source = excluded.citizen_source,\n"
        . "  in_dni_discord = excluded.in_dni_discord,\n"
        . "  discord_roles_json = excluded.discord_roles_json,\n"
        . "  account_status = 'active',\n"
        . "  last_login_at = excluded.last_login_at,\n"
        . "  last_role_sync_at = excluded.last_role_sync_at,\n"
        . "  promoted_to_member_at = NULL"
    );
    $statement->execute([
        $discordId,
        $username,
        $identity['global_name'] ?? null,
        $member['nick'] ?? null,
        $identity['avatar'] ?? null,
        $source,
        $inDniDiscord ? 1 : 0,
        $rolesJson,
        $now,
        $now,
        $now,
    ]);

    $select = $pdo->prepare('SELECT * FROM dni_citizen_users WHERE discord_user_id = ? LIMIT 1');
    $select->execute([$discordId]);
    $row = $select->fetch();
    if (!is_array($row)) throw new RuntimeException('Unable to persist DNI Citizen identity.');
    return $row;
}

function dni_citizen_upsert_discord_user(
    array $identity,
    array $member,
    string $source,
    bool $inDniDiscord,
    array $actualRoles
): array {
    $row = dni_citizen_upsert_record($identity, $member, $source, $inDniDiscord, $actualRoles);
    $syntheticRoles = dni_citizen_role_ids(array_merge($actualRoles, [DNI_CITIZEN_DISCORD_ROLE_ID]));
    $syntheticRoles = array_values(array_filter(
        $syntheticRoles,
        static fn(string $roleId): bool => $roleId !== DNI_BASE_MEMBER_DISCORD_ROLE_ID
    ));

    $shadowMember = $member;
    $shadowMember['roles'] = $syntheticRoles;
    $shadow = dni_embedded_upsert_discord_user($identity, $shadowMember);
    $discordId = (string)$identity['id'];
    $result = $shadow;

    dni_embedded_transaction(function (array &$db) use ($discordId, $row, $source, $inDniDiscord, $actualRoles, $syntheticRoles, &$result): void {
        foreach ($db['users'] as $index => $user) {
            if ((string)($user['discordUserId'] ?? '') !== $discordId) continue;

            if (($user['accountClass'] ?? 'member') !== 'citizen' && is_array($user['personnel'] ?? null)) {
                $db['users'][$index]['citizenArchivedPersonnel'] = $user['personnel'];
            }

            $db['users'][$index]['accountClass'] = 'citizen';
            $db['users'][$index]['citizenUserId'] = (int)$row['id'];
            $db['users'][$index]['citizenSource'] = $source;
            $db['users'][$index]['citizenInDniDiscord'] = $inDniDiscord;
            $db['users'][$index]['citizenDiscordRoles'] = dni_citizen_role_ids($actualRoles);
            $db['users'][$index]['roles'] = $syntheticRoles;
            $db['users'][$index]['personnel'] = null;
            $db['users'][$index]['clearances'] = [];
            $db['users'][$index]['directAdmin'] = false;
            $result = $db['users'][$index];
            break;
        }
        dni_embedded_sync_personnel($db);
    });

    return $result;
}

function dni_citizen_mark_promoted(string $discordId): void
{
    $discordId = trim($discordId);
    if ($discordId === '') return;

    $pdo = dni_citizen_sqlite();
    $statement = $pdo->prepare(
        "UPDATE dni_citizen_users\n"
        . "   SET account_status = 'member', promoted_to_member_at = ?, last_role_sync_at = ?\n"
        . " WHERE discord_user_id = ?"
    );
    $now = dni_embedded_now();
    $statement->execute([$now, $now, $discordId]);
}

function dni_citizen_promote_to_member(array $identity, array $member): array
{
    $discordId = trim((string)($identity['id'] ?? ''));
    $user = dni_embedded_upsert_discord_user($identity, $member);
    $result = $user;

    dni_embedded_transaction(function (array &$db) use ($discordId, $identity, $member, &$result): void {
        foreach ($db['users'] as $index => $stored) {
            if ((string)($stored['discordUserId'] ?? '') !== $discordId) continue;

            if (!is_array($stored['personnel'] ?? null)) {
                if (is_array($stored['citizenArchivedPersonnel'] ?? null)) {
                    $db['users'][$index]['personnel'] = $stored['citizenArchivedPersonnel'];
                } else {
                    $personnelId = $db['nextPersonnelId']++;
                    $db['users'][$index]['personnel'] = [
                        'id' => $personnelId,
                        'serviceNumber' => null,
                        'displayName' => $member['nick'] ?? $identity['global_name'] ?? $identity['username'] ?? 'DNI Member',
                        'rankId' => null,
                        'corpId' => null,
                        'status' => 'active',
                        'sectorId' => null,
                        'fleetId' => null,
                        'dutyStationId' => null,
                        'otherStatus' => null,
                    ];
                }
            }

            unset(
                $db['users'][$index]['accountClass'],
                $db['users'][$index]['citizenUserId'],
                $db['users'][$index]['citizenSource'],
                $db['users'][$index]['citizenInDniDiscord'],
                $db['users'][$index]['citizenDiscordRoles'],
                $db['users'][$index]['citizenArchivedPersonnel']
            );
            $result = $db['users'][$index];
            break;
        }
        dni_embedded_sync_personnel($db);
    });

    dni_citizen_mark_promoted($discordId);
    return $result;
}
