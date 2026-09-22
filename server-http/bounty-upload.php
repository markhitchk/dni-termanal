<?php

declare(strict_types=1);

define('DNI_CDN_UPLOAD_LIBRARY_ONLY', true);
require_once __DIR__ . '/mail-upload.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-bounty.php';

function dni_bounty_upload_authorize(string $code): array
{
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) {
        dni_json(401, [
            'ok' => false,
            'error' => 'Discord sign-in required to upload bounty proof.',
            'loginUrl' => '/auth/discord/login',
        ]);
    }

    $service = new DniBounty(dni_embedded_sqlite(), $db, $user);
    $detail = $service->detail($code);
    $bounty = is_array($detail['bounty'] ?? null) ? $detail['bounty'] : [];
    if (($bounty['status'] ?? '') !== 'active') {
        throw new RuntimeException('Proof can only be uploaded for an active bounty.', 409);
    }
    if (empty($bounty['canClaim'])) {
        throw new RuntimeException('This account is not allowed to submit a claim for this bounty.', 403);
    }

    return [
        'mode' => 'embedded-server',
        'userId' => (int)($user['id'] ?? 0),
        'bounty' => $bounty,
    ];
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method !== 'POST') {
        header('Allow: POST');
        dni_json(405, ['ok' => false, 'error' => 'POST required for bounty proof uploads.']);
    }

    $action = strtolower(trim((string)($_GET['action'] ?? 'chunk')));
    if ($action !== 'chunk') throw new RuntimeException('Unknown bounty proof upload operation.', 404);

    $code = dni_mail_upload_text($_POST['code'] ?? '', 64, 'Bounty code');
    $auth = dni_bounty_upload_authorize($code);
    if ((int)$auth['userId'] < 1) throw new RuntimeException('Bounty claimant identity is invalid.', 401);

    dni_require_csrf();
    $result = dni_mail_upload_chunk((int)$auth['userId']);

    if ($result['complete'] ?? false) {
        error_log(sprintf(
            '[DNI Bounty CDN] user=%d bounty=%s file=%s bytes=%d sha256=%s',
            (int)$auth['userId'],
            $code,
            (string)($result['upload']['name'] ?? ''),
            (int)($result['upload']['size'] ?? 0),
            (string)($result['upload']['sha256'] ?? '')
        ));
    }

    dni_json(200, [
        'ok' => true,
        'databaseMode' => $auth['mode'],
        'csrfToken' => dni_csrf_token(),
        ...$result,
    ]);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Bounty CDN] ' . $error->getMessage());
    dni_json($status, [
        'ok' => false,
        'error' => $status >= 500 ? 'DNI bounty proof upload service unavailable.' : $error->getMessage(),
    ]);
} catch (Throwable $error) {
    error_log('[DNI Bounty CDN] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI bounty proof upload service unavailable.']);
}
