<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-embedded.php';

function dni_meta_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function dni_meta_compact(string $value, int $max = 300): string
{
    $value = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        if (mb_strlen($value, 'UTF-8') <= $max) return $value;
        return rtrim(mb_substr($value, 0, max(1, $max - 1), 'UTF-8')) . '…';
    }
    if (strlen($value) <= $max) return $value;
    return rtrim(substr($value, 0, max(1, $max - 3))) . '...';
}

function dni_meta_path(): string
{
    $path = (string)(parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?? '/');
    $path = '/' . ltrim($path, '/');
    $path = preg_replace('~/+~', '/', $path) ?? $path;
    if ($path !== '/') $path = rtrim($path, '/');
    return $path === '' ? '/' : $path;
}

function dni_meta_route(string $path): string
{
    if (preg_match('~^/bounty/[A-Za-z0-9]{6}$~', $path)) return 'bounty';
    return match ($path) {
        '/', '/terminal' => 'terminal',
        '/dashboard' => 'dashboard',
        '/ranks' => 'ranks',
        '/docs', '/documents' => 'documents',
        '/services', '/services/dispatch' => 'services',
        '/communication' => 'communication',
        '/sectors' => 'sectors',
        '/mail' => 'mail',
        '/bounty', '/bounty/index.php', '/bountyboard' => 'bounty',
        '/admin' => 'admin',
        '/operations' => 'operations',
        default => 'terminal',
    };
}

function dni_meta_bounty_status(string $status): string
{
    return match (strtoupper(trim($status))) {
        'DEAD_OR_ALIVE' => 'DEAD OR ALIVE',
        'ALIVE_ONLY' => 'ALIVE ONLY',
        default => 'WANTED',
    };
}

function dni_meta_count(PDO $pdo, string $table, string $where = ''): ?int
{
    if (!preg_match('/^[a-z0-9_]+$/i', $table)) return null;
    try {
        $exists = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1");
        $exists->execute([$table]);
        if ($exists->fetchColumn() === false) return null;
        $sql = "SELECT COUNT(*) FROM {$table}" . ($where !== '' ? " WHERE {$where}" : '');
        return (int)$pdo->query($sql)->fetchColumn();
    } catch (Throwable) {
        return null;
    }
}

function dni_meta_base(string $route): array
{
    return match ($route) {
        'dashboard' => [
            'title' => 'DNI Dashboard | Dreadnought Imperium',
            'description' => 'Dreadnought Imperium personnel, network status, assignments, and operational overview.',
        ],
        'ranks' => [
            'title' => 'DNI Ranks | Dreadnought Imperium',
            'description' => 'Dreadnought Imperium rank structure and personnel directory.',
        ],
        'documents' => [
            'title' => 'DNI Records | Dreadnought Imperium',
            'description' => 'Dreadnought Imperium records and document network. Access-controlled records remain private.',
        ],
        'services' => [
            'title' => 'DNI Services | Dreadnought Imperium',
            'description' => 'Dreadnought Imperium service dispatch and support network.',
        ],
        'communication' => [
            'title' => 'DNI Communications | Dreadnought Imperium',
            'description' => 'Dreadnought Imperium communications and command-network status.',
        ],
        'sectors' => [
            'title' => 'DNI Sectors | Dreadnought Imperium',
            'description' => 'Dreadnought Imperium sector, fleet, asset, and personnel deployment network.',
        ],
        'mail' => [
            'title' => 'DNI Mail | Dreadnought Imperium',
            'description' => 'Secure Dreadnought Imperium internal messaging. Message contents are never exposed in public previews.',
        ],
        'bounty' => [
            'title' => 'DNI Bounty Board | Dreadnought Imperium',
            'description' => 'Dreadnought Imperium Bounty Network: active public bounty records and organization-issued contracts.',
        ],
        'admin' => [
            'title' => 'DNI Administration | Dreadnought Imperium',
            'description' => 'Restricted Dreadnought Imperium administration interface. Administrative data is not exposed publicly.',
        ],
        'operations' => [
            'title' => 'DNI Operations | Dreadnought Imperium',
            'description' => 'Dreadnought Imperium operations network. Restricted operational details are not exposed in public previews.',
        ],
        default => [
            'title' => 'DNI Terminal | Dreadnought Imperium',
            'description' => 'Dreadnought Imperium database network for sectors, records, communications, services, and operations.',
        ],
    };
}

$path = dni_meta_path();
$route = dni_meta_route($path);
$origin = rtrim(dni_config('DNI_CANONICAL_ORIGIN', 'https://www.dreadnoughtimperium.org'), '/');
$meta = dni_meta_base($route);
$meta['image'] = $origin . '/src/images/dni-helmet.png';
$meta['imageAlt'] = 'Dreadnought Imperium';
$meta['siteName'] = 'Dreadnought Imperium';
$meta['card'] = 'summary_large_image';

$query = [];
parse_str((string)(parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_QUERY) ?? ''), $query);
$code = strtoupper(trim((string)($query['code'] ?? '')));
if ($code === '' && preg_match('~^/bounty/([A-Za-z0-9]{6})$~', $path, $match)) {
    $code = strtoupper($match[1]);
}

try {
    $pdo = dni_embedded_sqlite();

    if ($route === 'sectors') {
        $sectors = dni_meta_count($pdo, 'dni_sectors');
        $assets = dni_meta_count($pdo, 'dni_assets');
        if ($sectors !== null || $assets !== null) {
            $parts = [];
            if ($sectors !== null) $parts[] = number_format($sectors) . ' sectors';
            if ($assets !== null) $parts[] = number_format($assets) . ' tracked assets';
            $meta['description'] = 'Dreadnought Imperium sector network · ' . implode(' · ', $parts) . '.';
        }
    } elseif ($route === 'ranks') {
        $personnel = dni_meta_count($pdo, 'dni_personnel');
        if ($personnel !== null) {
            $meta['description'] = 'Dreadnought Imperium rank structure and personnel directory · ' . number_format($personnel) . ' personnel records.';
        }
    } elseif ($route === 'services') {
        $open = dni_meta_count($pdo, 'dni_service_requests', "status NOT IN ('completed','cancelled')");
        if ($open !== null) {
            $meta['description'] = 'Dreadnought Imperium service dispatch · ' . number_format($open) . ' active service request' . ($open === 1 ? '' : 's') . '.';
        }
    } elseif ($route === 'bounty') {
        $active = dni_meta_count($pdo, 'dni_bounties', "status='active'");
        if ($active !== null) {
            $meta['description'] = 'Dreadnought Imperium Bounty Network · ' . number_format($active) . ' active public bounty record' . ($active === 1 ? '' : 's') . '.';
        }

        if (preg_match('/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/D', $code)) {
            $statement = $pdo->prepare(
                "SELECT b.*, o.logo_url AS organization_logo_url
                 FROM dni_bounties b
                 LEFT JOIN dni_bounty_organizations o ON o.id=b.organization_id
                 WHERE b.code=? COLLATE NOCASE AND b.status='active'
                 LIMIT 1"
            );
            $statement->execute([$code]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
            if (is_array($row)) {
                $status = dni_meta_bounty_status((string)($row['wanted_status'] ?? 'WANTED'));
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

                $meta['title'] = "{$status} · {$target} | DNI Bounty Network";
                $meta['description'] = dni_meta_compact(implode(' · ', $parts));
                $meta['siteName'] = 'DNI Bounty Network';
                $meta['imageAlt'] = $target . ' bounty image';

                $targetImage = trim((string)($row['target_image_url'] ?? ''));
                $orgImage = trim((string)($row['organization_logo_url'] ?? ''));
                if ($targetImage !== '' && preg_match('~^https://~i', $targetImage)) {
                    $meta['image'] = $targetImage;
                } elseif ($orgImage !== '' && preg_match('~^https://~i', $orgImage)) {
                    $meta['image'] = $orgImage;
                    $meta['imageAlt'] = $organization . ' logo';
                }
            }
        }
    }
} catch (Throwable $error) {
    error_log('[DNI site metadata] ' . $error->getMessage());
}

$canonicalPath = $path;
if ($route === 'bounty' && $code !== '') $canonicalPath = '/bounty?code=' . rawurlencode($code);
$canonical = $origin . ($canonicalPath === '/' ? '/' : $canonicalPath);

$htmlPath = __DIR__ . '/index.html';
$html = @file_get_contents($htmlPath);
if ($html === false) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'DNI Terminal is temporarily unavailable.';
    exit;
}

$tags = '  <meta name="dni-dynamic-meta" content="server">' . "\n"
    . '  <meta property="og:type" content="website">' . "\n"
    . '  <meta property="og:site_name" content="' . dni_meta_escape((string)$meta['siteName']) . '">' . "\n"
    . '  <meta property="og:title" content="' . dni_meta_escape((string)$meta['title']) . '">' . "\n"
    . '  <meta property="og:description" content="' . dni_meta_escape((string)$meta['description']) . '">' . "\n"
    . '  <meta property="og:url" content="' . dni_meta_escape($canonical) . '">' . "\n"
    . '  <meta property="og:image" content="' . dni_meta_escape((string)$meta['image']) . '">' . "\n"
    . '  <meta property="og:image:alt" content="' . dni_meta_escape((string)$meta['imageAlt']) . '">' . "\n"
    . '  <meta name="twitter:card" content="' . dni_meta_escape((string)$meta['card']) . '">' . "\n"
    . '  <meta name="twitter:title" content="' . dni_meta_escape((string)$meta['title']) . '">' . "\n"
    . '  <meta name="twitter:description" content="' . dni_meta_escape((string)$meta['description']) . '">' . "\n"
    . '  <meta name="twitter:image" content="' . dni_meta_escape((string)$meta['image']) . '">' . "\n"
    . '  <link rel="canonical" href="' . dni_meta_escape($canonical) . '">';

$html = preg_replace(
    '~<meta\s+name=["\']description["\'][^>]*>~i',
    '<meta name="description" content="' . dni_meta_escape((string)$meta['description']) . '">' . "\n" . $tags,
    $html,
    1
) ?? $html;

$html = preg_replace(
    '~<title>.*?</title>~is',
    '<title>' . dni_meta_escape((string)$meta['title']) . '</title>',
    $html,
    1
) ?? $html;

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=60, must-revalidate');
echo $html;
