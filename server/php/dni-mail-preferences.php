<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-mail.php';
require_once __DIR__ . '/dni-mail-support-routes.php';

function dni_mail_protected_senders(): array
{
    return ['system@dni.org','noreply@dni.org','dev@support.dni.org','general@support.dni.org','support@support.dni.org','admin@support.dni.org'];
}

function dni_mail_user_preferences(array $db, int $userId): array
{
    return array_values(array_map(fn(array $p): array => [
        'targetType'=>(string)($p['targetType'] ?? ''),
        'targetKey'=>(string)($p['targetKey'] ?? ''),
        'preference'=>(string)($p['preference'] ?? ''),
        'createdAt'=>$p['createdAt'] ?? null,
    ], array_filter((array)($db['mailPreferences'] ?? []), fn($p): bool => is_array($p) && (int)($p['userId'] ?? 0) === $userId)));
}

function dni_mail_set_preference(array $user, array $input): array
{
    $userId = (int)($user['id'] ?? 0);
    $type = strtolower(trim((string)($input['targetType'] ?? 'sender')));
    $key = strtolower(trim((string)($input['targetKey'] ?? '')));
    $pref = strtolower(trim((string)($input['preference'] ?? '')));
    $enabled = ($input['enabled'] ?? true) !== false;
    if ($type !== 'sender' || $key === '' || !str_contains($key,'@')) throw new RuntimeException('A DNI Mail sender address is required.', 422);
    if (!in_array($pref,['blocked','muted'],true)) throw new RuntimeException('Unknown DNI Mail preference.', 422);
    if ($pref === 'blocked' && in_array($key,dni_mail_protected_senders(),true)) throw new RuntimeException('Protected DNI system and support identities cannot be blocked.', 403);
    dni_embedded_transaction(function (array &$db) use ($userId,$type,$key,$pref,$enabled): void {
        $list = is_array($db['mailPreferences'] ?? null) ? array_values($db['mailPreferences']) : [];
        $list = array_values(array_filter($list, fn($p): bool => !(is_array($p) && (int)($p['userId'] ?? 0)===$userId && (string)($p['targetType'] ?? '')===$type && (string)($p['targetKey'] ?? '')===$key && (string)($p['preference'] ?? '')===$pref)));
        if ($enabled) $list[] = ['userId'=>$userId,'targetType'=>$type,'targetKey'=>$key,'preference'=>$pref,'createdAt'=>dni_embedded_now()];
        $db['mailPreferences'] = $list;
    });
    $fresh = dni_embedded_transaction();
    return dni_mail_user_preferences($fresh,$userId);
}

function dni_mail_sender_address(array $message): string
{
    $address = strtolower(trim((string)($message['from_address'] ?? '')));
    if ($address !== '') return $address;
    $name = strtoupper((string)($message['from_name'] ?? $message['from'] ?? ''));
    $type = strtolower((string)($message['message_type'] ?? ''));
    if (str_contains($name,'SYSTEM') || $type === 'service_announcement') return 'system@dni.org';
    if ($type === 'announcement' || str_contains($name,'DNI SERVICES')) return 'noreply@dni.org';
    return '';
}

function dni_mail_pref_has(array $prefs, string $address, string $pref): bool
{
    foreach ($prefs as $p) if (($p['targetType'] ?? '')==='sender' && ($p['targetKey'] ?? '')===$address && ($p['preference'] ?? '')===$pref) return true;
    return false;
}

function dni_mail_apply_preferences(array $message, array $prefs): array
{
    $address = dni_mail_sender_address($message);
    $protected = in_array($address,dni_mail_protected_senders(),true);
    $critical = $address === 'system@dni.org' && (strtolower((string)($message['message_type'] ?? '')) === 'service_announcement' || preg_match('/\b(SECURITY|AUTH|ACCOUNT|ACCESS|CLEARANCE|VERIFICATION|LOCKED)\b/i',(string)($message['subject'] ?? '')) === 1);
    $message['from_address'] = $address !== '' ? $address : ($message['from_address'] ?? null);
    $message['mail_protected_sender'] = $protected;
    $message['mail_blocked'] = !$protected && $address !== '' && dni_mail_pref_has($prefs,$address,'blocked');
    $message['mail_muted'] = !$critical && $address !== '' && dni_mail_pref_has($prefs,$address,'muted');
    $message['mail_critical'] = $critical;
    return $message;
}

function dni_mail_filter_output(string $buffer): string
{
    if (!str_starts_with(ltrim($buffer),'{')) return $buffer;
    try {
        $payload = json_decode($buffer,true,512,JSON_THROW_ON_ERROR);
        if (!is_array($payload) || empty($payload['ok'])) return $buffer;
        dni_start_session();
        $db = dni_embedded_transaction();
        $user = dni_embedded_current_user($db);
        if (!is_array($user)) return $buffer;
        $prefs = dni_mail_user_preferences($db,(int)$user['id']);
        $action = strtolower(trim((string)($_GET['action'] ?? 'list')));
        if ($action === 'list' && is_array($payload['messages'] ?? null)) {
            $out=[];
            foreach ($payload['messages'] as $m) if (is_array($m)) { $m=dni_mail_apply_preferences($m,$prefs); if (empty($m['mail_blocked'])) $out[]=$m; }
            $payload['messages']=$out;
            $payload['mailPreferences']=$prefs;
        }
        if (in_array($action,['record','mark-read'],true) && is_array($payload['message'] ?? null)) {
            $m=dni_mail_apply_preferences($payload['message'],$prefs);
            if (!empty($m['mail_blocked'])) { http_response_code(404); return json_encode(['ok'=>false,'error'=>'DNI Mail record not found.']); }
            $payload['message']=$m;
        }
        if ($action === 'directory' && is_array($payload['users'] ?? null)) {
            foreach (dni_mail_support_routes() as $route) $payload['users'][]=$route;
        }
        return json_encode($payload,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        error_log('[DNI Mail Preferences] '.$e->getMessage());
        return $buffer;
    }
}

function dni_mail_begin_preference_filter(): void
{
    static $started=false;
    if (!$started) { $started=true; ob_start('dni_mail_filter_output'); }
}
