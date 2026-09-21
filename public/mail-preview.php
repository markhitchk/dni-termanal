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

$script = '<script>(function(){try{history.replaceState({panel:"mail"},"",' .
    json_encode($browserTarget, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) .
    ');}catch(e){location.replace(' .
    json_encode($browserTarget, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) .
    ');}})();</script>';

if (str_contains($html, '</head>')) {
    $html = str_replace('</head>', "  {$script}\n</head>", $html);
} else {
    $html = $script . $html;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=60, must-revalidate');
echo $html;
