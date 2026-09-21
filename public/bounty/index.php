<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/server/php/dni.php';
require_once dirname(__DIR__, 2) . '/server/php/dni-embedded.php';

function bounty_preview_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function bounty_preview_status(string $status): string
{
    return match (strtoupper(trim($status))) {
        'DEAD_OR_ALIVE' => 'DEAD OR ALIVE',
        'ALIVE_ONLY' => 'ALIVE ONLY',
        default => 'WANTED',
    };
}

function bounty_preview_compact(string $value, int $max = 240): string
{
    $value = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    if (mb_strlen($value, 'UTF-8') <= $max) return $value;
    return rtrim(mb_substr($value, 0, max(1, $max - 1), 'UTF-8')) . '…';
}

$publicRoot = dirname(__DIR__);
$indexPath = $publicRoot . '/index.html';
$html = @file_get_contents($indexPath);
if ($html === false) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'DNI Bounty Network is temporarily unavailable.';
    exit;
}

$code = strtoupper(trim((string)($_GET['code'] ?? '')));
$row = null;

if (preg_match('/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/D', $code)) {
    try {
        $pdo = dni_embedded_sqlite();
        $statement = $pdo->prepare(
            "SELECT b.*, o.logo_url AS organization_logo_url
             FROM dni_bounties b
             LEFT JOIN dni_bounty_organizations o ON o.id=b.organization_id
             WHERE b.code=? COLLATE NOCASE AND b.status='active'
             LIMIT 1"
        );
        $statement->execute([$code]);
        $candidate = $statement->fetch(PDO::FETCH_ASSOC);
        if (is_array($candidate)) $row = $candidate;
    } catch (Throwable $error) {
        error_log('[DNI bounty preview] ' . $error->getMessage());
    }
}

$origin = rtrim(dni_config('DNI_CANONICAL_ORIGIN', 'https://www.dreadnoughtimperium.org'), '/');
$title = 'DNI Bounty Board | Dreadnought Imperium';
$description = 'View the Dreadnought Imperium Bounty Board and active bounty records.';
$image = $origin . '/src/images/dni-helmet.png';
$canonical = $origin . '/bounty' . ($code !== '' ? '?code=' . rawurlencode($code) : '');
$imageAlt = 'Dreadnought Imperium';

if ($row !== null) {
    $status = bounty_preview_status((string)($row['wanted_status'] ?? 'WANTED'));
    $target = trim((string)($row['target_name'] ?? 'Unknown Target')) ?: 'Unknown Target';
    $publicId = trim((string)($row['public_id'] ?? ('DNI-BT-' . $code)));
    $reward = number_format((int)($row['reward_amount'] ?? 0)) . ' ' . trim((string)($row['reward_currency'] ?? 'aUEC'));

    $orgName = trim((string)($row['organization_name_snapshot'] ?? ''));
    $orgTag = trim((string)($row['organization_tag_snapshot'] ?? ''));
    $organization = $orgName !== ''
        ? $orgName . ($orgTag !== '' ? " [{$orgTag}]" : '')
        : 'Independent / No Organization';

    $parts = [$reward, $publicId, $organization];
    $location = trim((string)($row['last_known_location'] ?? ''));
    if ($location !== '') $parts[] = 'Last known: ' . $location;
    $charges = trim((string)($row['charges'] ?? ''));
    if ($charges !== '') $parts[] = 'Charges: ' . $charges;
    $notes = trim((string)($row['description'] ?? ''));
    if ($notes !== '') $parts[] = $notes;

    $title = "{$status} · {$target} | DNI Bounty Network";
    $description = bounty_preview_compact(implode(' · ', $parts), 300);
    $imageAlt = $target . ' bounty image';

    $targetImage = trim((string)($row['target_image_url'] ?? ''));
    $orgImage = trim((string)($row['organization_logo_url'] ?? ''));
    if ($targetImage !== '' && preg_match('~^https://~i', $targetImage)) {
        $image = $targetImage;
    } elseif ($orgImage !== '' && preg_match('~^https://~i', $orgImage)) {
        $image = $orgImage;
        $imageAlt = $organization . ' logo';
    }
}

$meta = '  <meta property="og:type" content="website">' . "\n"
    . '  <meta property="og:site_name" content="DNI Bounty Network">' . "\n"
    . '  <meta property="og:title" content="' . bounty_preview_escape($title) . '">' . "\n"
    . '  <meta property="og:description" content="' . bounty_preview_escape($description) . '">' . "\n"
    . '  <meta property="og:url" content="' . bounty_preview_escape($canonical) . '">' . "\n"
    . '  <meta property="og:image" content="' . bounty_preview_escape($image) . '">' . "\n"
    . '  <meta property="og:image:alt" content="' . bounty_preview_escape($imageAlt) . '">' . "\n"
    . '  <meta name="twitter:card" content="summary_large_image">' . "\n"
    . '  <meta name="twitter:title" content="' . bounty_preview_escape($title) . '">' . "\n"
    . '  <meta name="twitter:description" content="' . bounty_preview_escape($description) . '">' . "\n"
    . '  <meta name="twitter:image" content="' . bounty_preview_escape($image) . '">' . "\n"
    . '  <link rel="canonical" href="' . bounty_preview_escape($canonical) . '">';

$html = preg_replace(
    '~<meta\s+name=["\']description["\'][^>]*>~i',
    '<meta name="description" content="' . bounty_preview_escape($description) . '">' . "\n" . $meta,
    $html,
    1
) ?? $html;

$html = preg_replace(
    '~<title>.*?</title>~is',
    '<title>' . bounty_preview_escape($title) . '</title>',
    $html,
    1
) ?? $html;

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=60, must-revalidate');
echo $html;
