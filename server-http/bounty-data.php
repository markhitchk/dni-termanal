<?php
declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-bounty.php';

dni_start_session();

function dni_bounty_controller(): DniBounty
{
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db) ?? [];
    return new DniBounty(dni_embedded_sqlite(), $db, $user);
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = strtolower(trim((string)($_GET['action'] ?? 'session')));
    $bounty = dni_bounty_controller();

    if ($method === 'GET') {
        if ($action === 'session') dni_json(200, $bounty->session());
        if ($action === 'mine') dni_json(200, $bounty->mine());
        if ($action === 'board') {
            $org = isset($_GET['organizationId']) && ctype_digit((string)$_GET['organizationId'])
                ? (int)$_GET['organizationId'] : null;
            dni_json(200, $bounty->board($org));
        }
        if ($action === 'detail') dni_json(200, $bounty->detail((string)($_GET['code'] ?? '')));
        if ($action === 'admin-bootstrap') dni_json(200, $bounty->adminBootstrap());
        dni_json(404, ['ok' => false, 'error' => 'Unknown DNI bounty read operation.']);
    }

    if ($method !== 'POST') {
        dni_json(405, ['ok' => false, 'error' => 'Unsupported DNI bounty request method.']);
    }

    dni_require_csrf();
    $body = dni_read_json_body();

    if ($action === 'create') dni_json(201, $bounty->create($body));
    if ($action === 'update') dni_json(200, $bounty->update($body));
    if ($action === 'archive') dni_json(200, $bounty->archive((string)($body['code'] ?? ''), false));
    if ($action === 'restore') dni_json(200, $bounty->archive((string)($body['code'] ?? ''), true));
    if ($action === 'claim') dni_json(201, $bounty->submitClaim((string)($body['code'] ?? ''), $body));
    if ($action === 'claim-review') {
        dni_json(200, $bounty->reviewClaim(
            (int)($body['claimId'] ?? 0),
            (string)($body['decision'] ?? ''),
            (string)($body['reviewNote'] ?? '')
        ));
    }
    if ($action === 'claim-withdraw') dni_json(200, $bounty->withdrawClaim((int)($body['claimId'] ?? 0)));
    if ($action === 'add-org') dni_json(201, $bounty->addOrganization($body));
    if ($action === 'admin-delete') dni_json(200, $bounty->adminDelete((string)($body['code'] ?? '')));
    if ($action === 'admin-org-status') dni_json(200, $bounty->adminSetOrganizationStatus($body));
    if ($action === 'admin-org-role') dni_json(200, $bounty->adminSetOrganizationDiscordRole($body));
    if ($action === 'admin-membership-status') dni_json(200, $bounty->adminSetMembershipStatus($body));
    if ($action === 'admin-configure-webhook') {
        dni_json(200, $bounty->configureWebhook((string)($body['webhookUrl'] ?? '')));
    }
    if ($action === 'admin-test-webhook') dni_json(200, $bounty->testWebhook());

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI bounty write operation.']);
} catch (Throwable $error) {
    $code = (int)$error->getCode();
    $status = $code >= 400 && $code <= 599 ? $code : 500;
    if ($status >= 500) error_log('[DNI bounty] ' . $error->getMessage());
    dni_json($status, [
        'ok' => false,
        'error' => $status >= 500 ? 'DNI Bounty Network is temporarily unavailable.' : $error->getMessage(),
    ]);
}
