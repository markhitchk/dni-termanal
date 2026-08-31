<?php

declare(strict_types=1);

$screen = __DIR__ . '/maintenance.html';
$appRoot = dirname(__DIR__, 2);
$publicRoot = dirname(__DIR__);
$maintenanceFlag = $publicRoot . '/.dni-maintenance';
$appPinHashFile = $appRoot . '/data/maintenance-pin.hash';
$legacyPinHashFile = '/etc/dni-terminal/maintenance-pin.hash';
$pinHashFile = getenv('DNI_MAINTENANCE_PIN_HASH_FILE') ?: (is_readable($appPinHashFile) ? $appPinHashFile : $legacyPinHashFile);
$accessStateFile = $appRoot . '/data/maintenance-access.json';
$embeddedPinHash = '$2y$12$kym/ebEdL6sTBXh3WN/uMuJ3XhY2WXegoEVXC0BjoCyq8JC5bDJP.';

function maintenance_headers(): void
{
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('Retry-After: 30');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
}

function render_maintenance(string $screen, string $error = ''): never
{
    maintenance_headers();

    if (!is_file($screen) || !is_readable($screen)) {
        echo '<!doctype html><meta charset="utf-8"><title>DNI Maintenance</title><body style="background:#000;color:#ddd;font-family:monospace;padding:32px">DNI SYSTEM UPDATE IN PROGRESS</body>';
        exit;
    }

    $html = file_get_contents($screen);
    if ($html === false) {
        echo '<!doctype html><meta charset="utf-8"><title>DNI Maintenance</title><body style="background:#000;color:#ddd;font-family:monospace;padding:32px">DNI SYSTEM UPDATE IN PROGRESS</body>';
        exit;
    }

    $errorMarkup = '';
    if ($error !== '') {
        $errorMarkup = '<div class="pin-error" role="alert">' . htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</div>';
    }

    echo str_replace('<!-- DNI_PIN_ERROR -->', $errorMarkup, $html);
    exit;
}

function maintenance_access_script(): never
{
    header('Content-Type: text/javascript; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    echo <<<'JS'
(() => {
  const STORAGE_KEY = 'dni.maintenance.access';
  const PARAM = 'dni_access';
  const TOKEN_RE = /^[a-f0-9]{64}$/i;
  const scriptUrl = (() => {
    try { return new URL(document.currentScript?.src || '', window.location.href); }
    catch { return new URL(window.location.href); }
  })();
  const mode = scriptUrl.searchParams.get('mode') || 'site';
  const current = new URL(window.location.href);
  const urlToken = current.searchParams.get(PARAM) || '';

  const readStored = () => {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY) || '';
      return TOKEN_RE.test(value) ? value : '';
    } catch { return ''; }
  };
  const store = value => {
    try {
      if (TOKEN_RE.test(value)) sessionStorage.setItem(STORAGE_KEY, value);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  };
  const stripVisibleToken = () => {
    if (!current.searchParams.has(PARAM)) return;
    current.searchParams.delete(PARAM);
    history.replaceState(history.state, '', current.pathname + current.search + current.hash);
  };

  if (mode === 'maintenance') {
    if (TOKEN_RE.test(urlToken)) {
      store('');
      stripVisibleToken();
      return;
    }
    const stored = readStored();
    if (stored) {
      current.searchParams.set(PARAM, stored);
      window.location.replace(current.pathname + current.search + current.hash);
    }
    return;
  }

  if (TOKEN_RE.test(urlToken)) {
    store(urlToken);
    stripVisibleToken();
  }

  const token = TOKEN_RE.test(urlToken) ? urlToken : readStored();
  if (!token) return;

  const shouldAttach = url => {
    if (url.origin !== window.location.origin) return false;
    const path = url.pathname;
    if (/^\/(?:api|auth|dev)(?:\/|$)/i.test(path)) return false;
    if (/^\/errors\/maintenance(?:\.php|\.html)?$/i.test(path)) return false;
    if (/^\/(?:deploy\.php|github-webhook\.php|sync-runtime-secrets\.php)$/i.test(path)) return false;
    if (/^\/(?:dist|src)\//i.test(path)) return false;
    return true;
  };

  const withToken = raw => {
    const url = new URL(raw, window.location.href);
    if (shouldAttach(url)) url.searchParams.set(PARAM, token);
    return url;
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      if (input instanceof Request) {
        const url = withToken(input.url);
        if (url.href !== input.url) input = new Request(url.href, input);
      } else {
        const url = withToken(String(input));
        input = url.href;
      }
    } catch {}
    return originalFetch(input, init);
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    try { url = withToken(String(url)).href; } catch {}
    return xhrOpen.call(this, method, url, ...rest);
  };

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a[href]');
    if (!anchor) return;
    const raw = anchor.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^(?:mailto:|tel:|javascript:)/i.test(raw)) return;
    try {
      const url = withToken(anchor.href);
      if (url.origin === window.location.origin) anchor.href = url.href;
    } catch {}
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    try {
      const action = new URL(form.action || window.location.href, window.location.href);
      if (!shouldAttach(action)) return;
      let hidden = form.querySelector('input[data-dni-maintenance-access]');
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = PARAM;
        hidden.dataset.dniMaintenanceAccess = '1';
        form.append(hidden);
      }
      hidden.value = token;
    } catch {}
  }, true);
})();
JS;
    exit;
}

function maintenance_pin_hash(string $pinHashFile, string $embeddedPinHash): string
{
    if (is_readable($pinHashFile)) {
        $candidate = trim((string) file_get_contents($pinHashFile));
        if ($candidate !== '' && password_get_info($candidate)['algo'] !== null) {
            return $candidate;
        }
    }

    return $embeddedPinHash;
}

function request_original_path(): string
{
    $candidates = [];

    if (!empty($_SERVER['REDIRECT_URL'])) {
        $candidates[] = (string) $_SERVER['REDIRECT_URL'];
    }

    if (!empty($_SERVER['THE_REQUEST'])
        && preg_match('~^[A-Z]+\s+([^\s]+)~', (string) $_SERVER['THE_REQUEST'], $match)) {
        $candidates[] = $match[1];
    }

    if (!empty($_SERVER['REQUEST_URI'])) {
        $candidates[] = (string) $_SERVER['REQUEST_URI'];
    }

    foreach ($candidates as $candidate) {
        $path = parse_url($candidate, PHP_URL_PATH);
        if (!is_string($path) || $path === '') continue;
        $decoded = rawurldecode($path);
        if (str_contains($decoded, "\0") || str_contains($decoded, '..')) continue;
        return '/' . ltrim($decoded, '/');
    }

    return '/';
}

function static_content_type(string $path): string
{
    return match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
        'html', 'htm' => 'text/html; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'js', 'mjs' => 'text/javascript; charset=utf-8',
        'json', 'map', 'webmanifest' => 'application/json; charset=utf-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'ico' => 'image/x-icon',
        'txt' => 'text/plain; charset=utf-8',
        'xml' => 'application/xml; charset=utf-8',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        'ttf' => 'font/ttf',
        'wasm' => 'application/wasm',
        default => 'application/octet-stream',
    };
}

function resolve_public_file(string $publicRoot, string $path): ?string
{
    $resolvedRoot = realpath($publicRoot);
    if ($resolvedRoot === false) return null;

    $candidate = $publicRoot . '/' . ltrim($path, '/');
    if (is_dir($candidate)) $candidate = rtrim($candidate, '/') . '/index.html';
    $resolved = realpath($candidate);

    if ($resolved === false
        || !str_starts_with($resolved, rtrim($resolvedRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)
        || !is_file($resolved)) {
        return null;
    }

    return $resolved;
}

function serve_public_static_asset(string $publicRoot, string $path): bool
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET', 'HEAD'], true)) return false;

    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $allowed = ['css', 'js', 'mjs', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'wasm', 'map', 'webmanifest'];
    if (!in_array($extension, $allowed, true)) return false;

    $resolved = resolve_public_file($publicRoot, $path);
    if ($resolved === null) return false;

    http_response_code(200);
    header('Content-Type: ' . static_content_type($resolved));
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');
    $size = filesize($resolved);
    if ($size !== false) header('Content-Length: ' . $size);
    if ($method !== 'HEAD') readfile($resolved);
    exit;
}

function maintenance_access_state(string $accessStateFile, string $maintenanceFlag): ?array
{
    if (!is_readable($accessStateFile) || !is_file($maintenanceFlag)) return null;
    $decoded = json_decode((string) file_get_contents($accessStateFile), true);
    if (!is_array($decoded)) return null;

    $token = strtolower(trim((string) ($decoded['token'] ?? '')));
    $issued = (int) ($decoded['issued'] ?? 0);
    $expires = (int) ($decoded['expires'] ?? 0);
    $maintenanceStarted = @filemtime($maintenanceFlag);

    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    if ($issued <= 0 || $expires <= time()) return null;
    if ($maintenanceStarted !== false && $issued < ((int) $maintenanceStarted - 2)) return null;

    return ['token' => $token, 'issued' => $issued, 'expires' => $expires];
}

function requested_access_token(): string
{
    foreach ([$_GET['dni_access'] ?? null, $_POST['dni_access'] ?? null] as $candidate) {
        if (!is_scalar($candidate)) continue;
        $token = strtolower(trim((string) $candidate));
        if (preg_match('/^[a-f0-9]{64}$/', $token)) return $token;
    }
    return '';
}

function serve_unlocked_request(string $publicRoot, string $path): never
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $routePath = $path;

    if ($routePath === '/' || preg_match('~^/(?:terminal|dashboard|ranks|documents|services|communication|sectors|admin)/?$~i', $routePath)) {
        $routePath = '/index.html';
    }

    $resolved = resolve_public_file($publicRoot, $routePath);
    if ($resolved === null && pathinfo($routePath, PATHINFO_EXTENSION) === '') {
        $resolved = resolve_public_file($publicRoot, '/index.html');
        $routePath = '/index.html';
    }

    if ($resolved === null) {
        http_response_code(404);
        header('Content-Type: text/html; charset=utf-8');
        $fallback = $publicRoot . '/errors/404.html';
        if (is_readable($fallback)) readfile($fallback); else echo 'Not Found';
        exit;
    }

    $extension = strtolower(pathinfo($resolved, PATHINFO_EXTENSION));
    if ($extension === 'php') {
        $_SERVER['SCRIPT_FILENAME'] = $resolved;
        $_SERVER['SCRIPT_NAME'] = $routePath;
        $_SERVER['PHP_SELF'] = $routePath;
        chdir(dirname($resolved));
        require $resolved;
        exit;
    }

    if (!in_array($method, ['GET', 'HEAD'], true)) {
        header('Allow: GET, HEAD');
        http_response_code(405);
        exit;
    }

    http_response_code(200);
    header('Content-Type: ' . static_content_type($resolved));
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');

    if (in_array($extension, ['html', 'htm'], true)) {
        $html = file_get_contents($resolved);
        if ($html === false) {
            http_response_code(500);
            exit;
        }
        $helper = '<script src="/errors/maintenance.php?asset=access-js&amp;mode=site"></script>';
        if (stripos($html, '</head>') !== false) {
            $html = preg_replace('~</head>~i', $helper . "\n</head>", $html, 1) ?? $html;
        } else {
            $html = $helper . $html;
        }
        if ($method !== 'HEAD') echo $html;
        exit;
    }

    $size = filesize($resolved);
    if ($size !== false) header('Content-Length: ' . $size);
    if ($method !== 'HEAD') readfile($resolved);
    exit;
}

if (isset($_GET['asset']) && $_GET['asset'] === 'access-js') {
    maintenance_access_script();
}

$originalPath = request_original_path();
$directMaintenance = preg_match('~^/errors/maintenance(?:\.php|\.html)?$~i', $originalPath) === 1;

if (!$directMaintenance) {
    serve_public_static_asset($publicRoot, $originalPath);

    $state = maintenance_access_state($accessStateFile, $maintenanceFlag);
    $requestedToken = requested_access_token();
    if ($state !== null && $requestedToken !== '' && hash_equals($state['token'], $requestedToken)) {
        serve_unlocked_request($publicRoot, $originalPath);
    }
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'GET' || $method === 'HEAD') {
    render_maintenance($screen);
}

if ($method !== 'POST') {
    header('Allow: GET, HEAD, POST');
    render_maintenance($screen, 'Unsupported maintenance request.');
}

if (!is_file($maintenanceFlag)) {
    header('Location: /', true, 303);
    exit;
}

$pin = isset($_POST['developer_pin']) ? trim((string) $_POST['developer_pin']) : '';
if (!preg_match('/^[0-9]{4,12}$/', $pin)) {
    usleep(350000);
    render_maintenance($screen, 'Developer PIN rejected.');
}

$pinHash = maintenance_pin_hash($pinHashFile, $embeddedPinHash);
if (!password_verify($pin, $pinHash)) {
    usleep(500000);
    render_maintenance($screen, 'Developer PIN rejected.');
}

$token = bin2hex(random_bytes(32));
$now = time();
$state = json_encode([
    'token' => $token,
    'issued' => $now,
    'expires' => $now + 3600,
], JSON_UNESCAPED_SLASHES);

if ($state === false || file_put_contents($accessStateFile, $state . "\n", LOCK_EX) === false) {
    render_maintenance($screen, 'Developer access could not be initialized on this server.');
}
@chmod($accessStateFile, 0640);

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Referrer-Policy: no-referrer');
header('Location: /?dni_access=' . rawurlencode($token), true, 303);
exit;
