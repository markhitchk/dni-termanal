<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-embedded.php';
require_once dirname(__DIR__) . '/server/php/dni-mail.php';

$token = dni_mail_share_token($_GET['share'] ?? null);
$snapshot = dni_embedded_transaction();
$message = $token !== null ? dni_embedded_mail_share_preview($snapshot, $token) : null;

$messageCode = is_array($message)
    ? (string)($message['id'] ?? $message['message_code'] ?? '')
    : '';

$query = [];
if ($messageCode !== '') $query['message'] = $messageCode;
if ($token !== null) $query['share'] = $token;
$virtual = '/mail' . ($query !== [] ? '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986) : '');

$originalRequestUri = $_SERVER['REQUEST_URI'] ?? '/mail-preview.php';
$_SERVER['REQUEST_URI'] = $virtual;

ob_start();
require __DIR__ . '/index.php';
$html = (string)ob_get_clean();

$_SERVER['REQUEST_URI'] = $originalRequestUri;

$browserTarget = $messageCode !== ''
    ? '/mail?message=' . rawurlencode($messageCode) . '&share=' . rawurlencode((string)$token)
    : '/mail';

$handoff = '<meta name="dni-mail-browser-target" content="' .
    htmlspecialchars($browserTarget, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') .
    '">' . "\n" .
    '  <script src="/dist/mail-preview-redirect.js"></script>';

if (str_contains($html, '</head>')) {
    $html = str_replace('</head>', "  {$handoff}\n</head>", $html);
} else {
    $html = $handoff . $html;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=60, must-revalidate');
echo $html;
