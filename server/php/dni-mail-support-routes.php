<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-authz.php';
require_once __DIR__ . '/dni-clearance.php';
require_once __DIR__ . '/dni-mail.php';

const DNI_MAIL_ROUTE_DEV = -9101;
const DNI_MAIL_ROUTE_SUPPORT = -9102;
const DNI_MAIL_ROUTE_ADMIN = -9103;

function dni_mail_support_routes(): array
{
    return [
        ['id'=>DNI_MAIL_ROUTE_DEV,'key'=>'developer','name'=>'Developer Support','address'=>'dev@support.dni.org','label'=>'Developer Support <dev@support.dni.org> · ROUTED CHANNEL'],
        ['id'=>DNI_MAIL_ROUTE_SUPPORT,'key'=>'support','name'=>'General Support','address'=>'support@support.dni.org','label'=>'General Support <support@support.dni.org> · ROUTED CHANNEL'],
        ['id'=>DNI_MAIL_ROUTE_ADMIN,'key'=>'admin','name'=>'Administration','address'=>'admin@support.dni.org','label'=>'Administration <admin@support.dni.org> · ROUTED CHANNEL'],
    ];
}

function dni_mail_support_developer(array $user): bool
{
    if (!empty($user['developerAdmin'])) return true;
    $discordId = trim((string)($user['discordUserId'] ?? $user['discord_user_id'] ?? ''));
    if ($discordId === '') return false;
    $raw = trim(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
    $ids = $raw === '' ? [] : (preg_split('/[\s,;]+/', $raw, -1, PREG_SPLIT_NO_EMPTY) ?: []);
    return in_array($discordId, array_map('strval', $ids), true);
}

function dni_mail_support_role(array $user): bool
{
    if (dni_is_admin_authorized($user) || dni_mail_support_developer($user)) return true;
    $configured = dni_parse_discord_role_ids(trim(dni_config('DNI_SUPPORT_DISCORD_ROLE_IDS', '')));
    return (bool)array_intersect(dni_user_discord_role_ids($user), $configured);
}

function dni_mail_support_recipient_ids(array $db, string $key): array
{
    $ids = [];
    foreach ((array)($db['users'] ?? []) as $user) {
        if (!is_array($user) || (string)($user['accountStatus'] ?? 'active') !== 'active') continue;
        $allowed = match ($key) {
            'developer' => dni_mail_support_developer($user),
            'support' => dni_mail_support_role($user),
            'admin' => dni_is_admin_authorized($user),
            default => false,
        };
        if ($allowed && (int)($user['id'] ?? 0) > 0) $ids[] = (int)$user['id'];
    }
    return array_values(array_unique($ids));
}

function dni_mail_support_expand(array $db, array $rawIds): array
{
    $ids = [];
    $routes = [];
    foreach ($rawIds as $raw) {
        if (!(is_int($raw) || preg_match('/^-?\d+$/', (string)$raw))) continue;
        $id = (int)$raw;
        if ($id > 0) { $ids[] = $id; continue; }
        $route = null;
        foreach (dni_mail_support_routes() as $candidate) if ((int)$candidate['id'] === $id) { $route = $candidate; break; }
        if ($route === null) throw new RuntimeException('Unknown DNI Mail support route.', 422);
        $resolved = dni_mail_support_recipient_ids($db, (string)$route['key']);
        if ($resolved === []) throw new RuntimeException($route['name'] . ' currently has no authorized recipients.', 503);
        $ids = array_merge($ids, $resolved);
        $routes[$route['key']] = $route;
    }
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn(int $v): bool => $v > 0)));
    if ($routes === []) throw new RuntimeException('A DNI Mail support route is required.', 422);
    if (count($ids) > 50) throw new RuntimeException('DNI Mail recipient limit exceeded after support routing.', 422);
    return [$ids, array_values($routes)];
}

function dni_mail_support_is_citizen(array $user): bool
{
    return (($user['accountClass'] ?? '') === 'citizen') || dni_is_citizen_user($user);
}

function dni_mail_support_citizen_send(array $user, array $input, array $ids, array $routes): array
{
    if (dni_clearance_normalize_level($input['clearanceLevel'] ?? 0) !== DNI_CLEARANCE_CL_NON) throw new RuntimeException('Citizen DNI Mail is limited to CL/NON.', 403);
    if (array_filter((array)($input['attachmentCodes'] ?? []), fn($v): bool => trim((string)$v) !== '')) throw new RuntimeException('Citizen DNI Mail cannot attach classified DNI documents.', 403);
    $subject = dni_mail_text($input['subject'] ?? '', 180, 'Subject');
    $body = dni_mail_text($input['body'] ?? '', 100000, 'Message body');
    $result = null;
    dni_embedded_transaction(function (array &$db) use ($user,$ids,$routes,$subject,$body,&$result): void {
        $active = [];
        foreach ((array)($db['users'] ?? []) as $candidate) if (is_array($candidate) && (string)($candidate['accountStatus'] ?? 'active') === 'active') $active[(int)($candidate['id'] ?? 0)] = true;
        foreach ($ids as $id) if (!isset($active[$id])) throw new RuntimeException('A routed recipient is unavailable.', 422);
        $seen = [];
        foreach (dni_embedded_mail_rows($db) as $row) $seen[(string)($row['messageCode'] ?? '')] = true;
        do { $code = dni_mail_message_code(); } while (isset($seen[$code]));
        $label = trim((string)($user['guildNick'] ?? $user['globalName'] ?? $user['username'] ?? 'DNI Citizen'));
        $now = dni_embedded_now();
        $db['mailMessages'][] = ['messageCode'=>$code,'messageType'=>'message','audienceType'=>'direct','senderUserId'=>(int)$user['id'],'senderLabel'=>$label,'senderAccountType'=>'citizen','subject'=>$subject,'body'=>$body,'clearanceLevel'=>0,'requiredPermissions'=>[],'recipientUserIds'=>$ids,'attachments'=>[],'deliveryRoutes'=>array_column($routes,'address'),'status'=>'sent','createdAt'=>$now,'sentAt'=>$now];
        $result = ['message_code'=>$code,'clearance'=>dni_clearance_descriptor(0),'notification_preview'=>dni_mail_safe_notification_preview()];
    });
    return $result ?? throw new RuntimeException('Unable to send routed DNI Mail.', 500);
}

function dni_mail_support_send(array $user, array $input): array
{
    $db = dni_embedded_transaction();
    [$ids,$routes] = dni_mail_support_expand($db, (array)($input['recipientUserIds'] ?? []));
    $input['recipientUserIds'] = $ids;
    $input['messageType'] = 'message';
    $sent = dni_mail_support_is_citizen($user)
        ? dni_mail_support_citizen_send($user,$input,$ids,$routes)
        : dni_embedded_mail_send($user,$input);
    $sent['routes'] = array_map(fn(array $r): array => ['name'=>$r['name'],'address'=>$r['address']], $routes);
    return $sent;
}
