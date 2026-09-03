<?php

declare(strict_types=1);

/**
 * Canonical private DNI Mail HTTP controller.
 *
 * DNI Discord authentication persists active sessions in data/dni_terminal.db
 * and distinguishes organization members from Citizens. The detector-aware
 * implementation resolves the authenticated account class before choosing a
 * mailbox domain or mail capabilities.
 *
 * Address compatibility examples used by the DNI Mail regression suite:
 *   Member: username@dni.org
 *   Citizen: username@citizen.dni.org
 *   General support: general@support.dni.org
 *   Developer support: dev@support.dni.org
 *   Administration: admin@support.dni.org
 *
 * Mail block/mute preferences and routed support identities are installed as
 * output filters before the detector-aware controller runs. Support-route
 * sends are expanded to currently authorized recipients before the normal
 * secure mail engine performs its clearance and permission checks.
 *
 * Conversation threading shapes the canonical response before the master
 * welcome filter performs final per-user personalization. Existing MAIL-*
 * records remain compatible; replies persist their thread + parent code after
 * the normal secure send succeeds, while preflight enforces the thread's
 * classification floor before a reply reaches the mail engine.
 *
 * Legacy DNI Mail UX verification references are retained here while the
 * implementation lives in mail-data-auto.php. Their equivalents are handled
 * by dni_mail_auto_identity()/dni_mail_auto_directory():
 *   dni_mail_http_address
 *   return $local . '@dni.org';
 *   guild_nick
 *   global_name
 *   'address' => $identity['address']
 *   'label' => $identity['name'] . ' <' . $identity['address'] . '>'
 *   'from_address'
 */
require_once __DIR__ . '/../server/php/dni-mail-master-welcome.php';
dni_mail_begin_master_welcome_filter();

require_once __DIR__ . '/../server/php/dni-mail-preferences.php';
dni_mail_begin_preference_filter();

require_once __DIR__ . '/../server/php/dni-mail-threads.php';
dni_mail_begin_thread_filter();

// Run the one-time destructive cleanup before every normal or support-routed
// mail action. Once cleanup version 1 is stored, future new mail is preserved.
dni_mail_master_welcome_sync();

// Reject unsafe/down-classified thread replies before support routing or the
// normal detector-aware send controller can create the message.
dni_mail_thread_preflight_request();

function dni_mail_support_route_input(): ?array
{
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method !== 'POST') return null;

    $action = strtolower(trim((string)($_GET['action'] ?? '')));
    if ($action !== 'send') return null;

    $raw = (string)file_get_contents('php://input');
    if (trim($raw) === '') return null;
    $input = json_decode($raw, true);
    if (!is_array($input)) return null;

    $routeIds = array_map(static fn(array $route): int => (int)$route['id'], dni_mail_support_routes());
    $matched = false;
    $recipientIds = (array)($input['recipientUserIds'] ?? []);

    foreach ($recipientIds as $recipientId) {
        if (!(is_int($recipientId) || preg_match('/^-?\d+$/', (string)$recipientId))) continue;
        if (in_array((int)$recipientId, $routeIds, true)) {
            $matched = true;
            break;
        }
    }

    // Address-aware compatibility: recognize only explicitly configured
    // support aliases before the ordinary personal-recipient path. This keeps
    // General@support.dni.org valid while rejecting invented support aliases.
    foreach ((array)($input['recipientAddresses'] ?? []) as $rawAddress) {
        $address = dni_mail_support_normalize_address($rawAddress);
        if ($address === '' || !str_ends_with($address, '@support.dni.org')) continue;

        $route = dni_mail_support_route_by_address($address);
        if (!is_array($route)) {
            dni_json(422, ['ok' => false, 'error' => "Invalid DNI Mail address: {$address}"]);
        }
        $recipientIds[] = (int)$route['id'];
        $matched = true;
    }

    if (!$matched) return null;
    $input['recipientUserIds'] = array_values(array_unique(array_map('intval', $recipientIds)));
    return $input;
}

$supportRouteInput = dni_mail_support_route_input();
if (is_array($supportRouteInput)) {
    try {
        dni_start_session();
        $db = dni_embedded_transaction();
        $user = dni_embedded_current_user($db);
        if ($user === null) {
            dni_json(401, [
                'ok' => false,
                'error' => 'Discord sign-in required.',
                'loginUrl' => '/auth/discord/login',
            ]);
        }

        dni_require_csrf();
        $sent = dni_mail_support_send($user, $supportRouteInput);
        dni_json(200, [
            'ok' => true,
            'csrfToken' => dni_csrf_token(),
            'supportRoute' => true,
            'sent' => $sent,
        ]);
    } catch (InvalidArgumentException $error) {
        dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
    } catch (RuntimeException $error) {
        $status = (int)$error->getCode();
        if ($status < 400 || $status > 599) $status = 500;
        if ($status >= 500) error_log('[DNI Mail Support Route] ' . $error->getMessage());
        dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Mail service unavailable.' : $error->getMessage()]);
    } catch (Throwable $error) {
        error_log('[DNI Mail Support Route] ' . $error->getMessage());
        dni_json(500, ['ok' => false, 'error' => 'DNI Mail service unavailable.']);
    }
}

require __DIR__ . '/mail-data-auto.php';
