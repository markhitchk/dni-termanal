<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function webhook_respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

function webhook_runtime_secret(string $root, string $name): string
{
    $path = $root . '/data/dni-runtime.env';
    if (!is_file($path) || !is_readable($path)) {
        return '';
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return '';
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        $separator = strpos($line, '=');
        if ($separator === false) {
            continue;
        }

        $key = trim(substr($line, 0, $separator));
        if ($key !== $name) {
            continue;
        }

        return trim(substr($line, $separator + 1));
    }

    return '';
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    webhook_respond(405, ['ok' => false, 'error' => 'POST required.']);
}

$root = realpath(__DIR__ . '/..');
if ($root === false || !is_dir($root . '/.git')) {
    webhook_respond(500, ['ok' => false, 'error' => 'DNI repository checkout was not found behind the Apache document root.']);
}

$rawBody = file_get_contents('php://input');
if ($rawBody === false || $rawBody === '') {
    webhook_respond(400, ['ok' => false, 'error' => 'Webhook payload is empty.']);
}

$signature = trim((string)($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? ''));
if (!preg_match('/^sha256=[0-9a-f]{64}$/iD', $signature)) {
    webhook_respond(401, ['ok' => false, 'error' => 'Valid X-Hub-Signature-256 header required.']);
}

// Reuse the already-synchronized repository secret so no second VPS secret
// needs to be provisioned. Configure the GitHub webhook Secret field with the
// exact same value as the repository's STAR_COMMS_OWNER_KEY secret.
$webhookSecret = webhook_runtime_secret($root, 'STAR_COMMS_OWNER_KEY');
if ($webhookSecret === '') {
    webhook_respond(503, [
        'ok' => false,
        'error' => 'Webhook verification secret is not available on the VPS.',
        'hint' => 'Run the existing GitHub Actions deployment once so STAR_COMMS_OWNER_KEY is synchronized.'
    ]);
}

$expectedSignature = 'sha256=' . hash_hmac('sha256', $rawBody, $webhookSecret);
if (!hash_equals($expectedSignature, strtolower($signature))) {
    webhook_respond(401, ['ok' => false, 'error' => 'Webhook signature verification failed.']);
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    webhook_respond(400, ['ok' => false, 'error' => 'Webhook payload must be valid JSON.']);
}

$event = strtolower(trim((string)($_SERVER['HTTP_X_GITHUB_EVENT'] ?? '')));
$delivery = trim((string)($_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? ''));
$repository = trim((string)($payload['repository']['full_name'] ?? ''));

if ($repository !== 'markhitchk/dni-termanal') {
    webhook_respond(403, [
        'ok' => false,
        'error' => 'Webhook repository does not match markhitchk/dni-termanal.',
        'delivery' => $delivery
    ]);
}

if ($event === 'ping') {
    webhook_respond(200, [
        'ok' => true,
        'status' => 'pong',
        'repository' => $repository,
        'delivery' => $delivery
    ]);
}

if ($event !== 'push') {
    webhook_respond(202, [
        'ok' => true,
        'status' => 'ignored',
        'reason' => 'Only push events trigger deployment.',
        'event' => $event,
        'delivery' => $delivery
    ]);
}

$ref = trim((string)($payload['ref'] ?? ''));
if ($ref !== 'refs/heads/main' || !empty($payload['deleted'])) {
    webhook_respond(202, [
        'ok' => true,
        'status' => 'ignored',
        'reason' => 'Only non-deleted pushes to main trigger deployment.',
        'ref' => $ref,
        'delivery' => $delivery
    ]);
}

// Mark the request so deploy.php can distinguish a verified GitHub webhook
// from the existing GitHub Actions deployment path.
$_SERVER['HTTP_X_DNI_DEPLOY_SOURCE'] = 'github-webhook';
require __DIR__ . '/deploy.php';
