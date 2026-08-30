<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';
require_once __DIR__ . '/../../server/php/api-runtime.php';
require_once __DIR__ . '/../../server/php/dni-embedded.php';
require_once __DIR__ . '/../../server/php/dni-authz.php';

dni_start_session();

function dni_dev_terminal_actor(): array
{
    $userId = dni_current_user_id();

    if ($userId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        try {
            $pdo = dni_db();
            $user = dni_require_user();
            $permissions = dni_effective_permissions($pdo, $userId);
            return [
                'authenticated' => true,
                'admin' => in_array('admin', $permissions, true),
                'username' => (string)($user['guild_nick'] ?? $user['global_name'] ?? $user['username'] ?? 'developer'),
                'permissions' => $permissions,
                'source' => 'mariadb',
            ];
        } catch (Throwable $error) {
            error_log('[DNI developer terminal MariaDB fallback] ' . $error->getMessage());
        }
    }

    try {
        $db = dni_embedded_transaction();
        $user = dni_embedded_current_user($db);
        if ($user !== null) {
            return [
                'authenticated' => true,
                'admin' => dni_is_admin_authorized($user),
                'username' => (string)($user['guildNick'] ?? $user['globalName'] ?? $user['username'] ?? 'developer'),
                'permissions' => dni_is_admin_authorized($user) ? dni_admin_permission_keys() : [],
                'source' => 'embedded-server',
            ];
        }
    } catch (Throwable $error) {
        error_log('[DNI developer terminal embedded auth] ' . $error->getMessage());
    }

    return [
        'authenticated' => false,
        'admin' => false,
        'username' => 'guest',
        'permissions' => [],
        'source' => 'none',
    ];
}

function dni_dev_terminal_flag(): string
{
    return dirname(__DIR__) . '/.dni-maintenance';
}

function dni_dev_terminal_build_info(): array
{
    $configPath = DNI_ROOT . '/configs/deploy.config.json';
    $config = [];
    if (is_file($configPath)) {
        $decoded = json_decode((string)file_get_contents($configPath), true);
        if (is_array($decoded)) $config = $decoded;
    }

    $commit = null;
    $headPath = DNI_ROOT . '/.git/HEAD';
    if (is_file($headPath)) {
        $head = trim((string)file_get_contents($headPath));
        if (str_starts_with($head, 'ref: ')) {
            $ref = trim(substr($head, 5));
            if ($ref !== '' && !str_contains($ref, '..')) {
                $refPath = DNI_ROOT . '/.git/' . $ref;
                if (is_file($refPath)) $commit = trim((string)file_get_contents($refPath));
            }
        } elseif (preg_match('/^[0-9a-f]{40}$/i', $head)) {
            $commit = $head;
        }
    }

    return [
        'version' => '4.3.0',
        'title' => (string)($config['title'] ?? 'DNI Terminal'),
        'buildLabel' => (string)($config['buildLabel'] ?? 'unknown'),
        'deploymentNote' => (string)($config['deploymentNote'] ?? ''),
        'commit' => $commit !== null && preg_match('/^[0-9a-f]{40}$/i', $commit) ? substr($commit, 0, 12) : 'unknown',
    ];
}

function dni_dev_terminal_runtime_info(array $actor): array
{
    return [
        'runtime' => 'rocky-lamp',
        'php' => PHP_VERSION,
        'sapi' => PHP_SAPI,
        'server' => (string)($_SERVER['SERVER_SOFTWARE'] ?? 'unknown'),
        'databaseMode' => $actor['source'],
        'starCommsConfigured' => dni_is_configured('STAR_COMMS_OWNER_KEY'),
        'maintenance' => is_file(dni_dev_terminal_flag()),
        'utc' => gmdate('c'),
    ];
}

function dni_dev_terminal_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    try {
        $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        dni_json(400, ['ok' => false, 'error' => 'Invalid Developer Terminal request body.']);
    }
    return is_array($decoded) ? $decoded : [];
}

function dni_dev_terminal_require_admin(array $actor): void
{
    if (!$actor['authenticated']) {
        dni_json(401, [
            'ok' => false,
            'error' => 'Discord sign-in required for Developer Terminal.',
            'loginUrl' => '/auth/discord/login?next=/dev/termanal',
        ]);
    }
    if (!$actor['admin']) {
        dni_json(403, ['ok' => false, 'error' => 'DNI administrator permission required.']);
    }
}

$actor = dni_dev_terminal_actor();
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'POST') {
    dni_dev_terminal_require_admin($actor);
    dni_require_csrf();
    $body = dni_dev_terminal_json_body();
    $action = strtolower(trim((string)($body['action'] ?? '')));
    $flag = dni_dev_terminal_flag();

    if ($action === 'maintenance-status') {
        dni_json(200, ['ok' => true, 'maintenance' => is_file($flag)]);
    }

    if ($action === 'maintenance-on') {
        $stamp = 'enabled=' . gmdate('c') . "\nsource=developer-terminal\n";
        if (file_put_contents($flag, $stamp, LOCK_EX) === false) {
            dni_json(500, ['ok' => false, 'error' => 'Unable to enable DNI maintenance mode.']);
        }
        @chmod($flag, 0644);
        dni_json(200, ['ok' => true, 'maintenance' => true]);
    }

    if ($action === 'maintenance-off') {
        if (is_file($flag) && !@unlink($flag)) {
            dni_json(500, ['ok' => false, 'error' => 'Unable to disable DNI maintenance mode.']);
        }
        dni_json(200, ['ok' => true, 'maintenance' => false]);
    }

    if ($action === 'runtime') {
        dni_json(200, ['ok' => true, 'runtime' => dni_dev_terminal_runtime_info($actor)]);
    }

    if ($action === 'build') {
        dni_json(200, ['ok' => true, 'build' => dni_dev_terminal_build_info()]);
    }

    if ($action === 'whoami') {
        dni_json(200, ['ok' => true, 'user' => [
            'name' => $actor['username'],
            'admin' => true,
            'source' => $actor['source'],
        ]]);
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown Developer Terminal action.']);
}

if ($method !== 'GET') {
    header('Allow: GET, POST');
    dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
}

if (!$actor['authenticated']) {
    http_response_code(401);
    header('Content-Type: text/html; charset=utf-8');
    dni_security_headers();
    ?>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Developer Terminal Login // DNI</title>
<style>html,body{min-height:100%;margin:0}body{display:grid;place-items:center;padding:18px;background:#000;color:#eee;font-family:"Courier New",monospace}.dialog{width:min(620px,100%);border:1px solid #454545;background:#202020;box-shadow:0 24px 80px #000}.cap{padding:18px 24px;background:#191919;border-bottom:1px solid #333;font-weight:700;letter-spacing:2px}.banner{padding:20px 26px;background:linear-gradient(#bf1e22,#971416);font-size:20px;font-weight:800;letter-spacing:2px}.body{padding:34px 28px;color:#ccc;line-height:1.7}.actions{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid #454545}.actions a{border:1px solid #777;padding:12px 14px;color:#fff;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:1px}.login{background:#171717}.cancel{background:#505050}@media(max-width:560px){.actions{flex-direction:column}.actions a{text-align:center}}</style></head><body><main class="dialog"><div class="cap">ERROR</div><div class="banner">AUTHENTICATION REQUIRED</div><div class="body">Would you like to login with Discord to access the DNI Developer Terminal?</div><div class="actions"><a class="login" href="/auth/discord/login?next=/dev/termanal">LOGIN WITH DISCORD</a><a class="cancel" href="/">CANCEL</a></div></main></body></html>
<?php
    exit;
}

if (!$actor['admin']) {
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    dni_security_headers();
    readfile(dirname(__DIR__) . '/errors/403.html');
    exit;
}

$csrf = htmlspecialchars(dni_csrf_token(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$username = htmlspecialchars($actor['username'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#050606">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="dni-csrf" content="<?= $csrf ?>">
  <title>DNI Developer Terminal</title>
  <style>
    :root{color-scheme:dark;--gold:#d2b36c;--muted:#737373;--line:#3e3520;--danger:#c6373b;--green:#72b98d}*{box-sizing:border-box}html,body{min-height:100%;margin:0}body{background:#000;color:#dedede;font-family:"Courier New",ui-monospace,Consolas,monospace;padding:14px;overflow-x:hidden}body:before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(180deg,rgba(255,255,255,.018) 0 1px,transparent 1px 4px);animation:scan 8s linear infinite}.shell{width:min(1000px,100%);min-height:calc(100vh - 28px);margin:auto;border:1px solid #3b3220;background:#050606;box-shadow:0 18px 70px #000;display:flex;flex-direction:column}.top{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);background:#090a0a}.logo{width:34px;height:34px;object-fit:contain}.title b{display:block;color:var(--gold);font-size:12px;letter-spacing:1.8px}.title span{display:block;margin-top:3px;color:#666;font-size:9px;letter-spacing:1px}.badge{margin-left:auto;border:1px solid #5a4c2d;padding:6px 8px;color:#bba56f;font-size:9px;letter-spacing:1px}.screen{flex:1;min-height:0;overflow:auto;padding:18px 18px 8px;font-size:13px;line-height:1.55;text-shadow:0 0 5px rgba(210,179,108,.08)}.screen .muted{color:var(--muted)}.screen .good{color:var(--green)}.screen .bad{color:#dd6d70}.screen .sep{color:#75623a}.prompt{display:flex;align-items:center;gap:0;padding:10px 18px 18px;border-top:1px solid #151515}.prompt-user{color:var(--gold)}.prompt-host{color:#8d8d8d}.prompt input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#fff;font:inherit;caret-color:var(--gold);padding:0 0 0 7px}.foot{padding:9px 14px;border-top:1px solid #1d1b15;color:#4f4f4f;font-size:8px;letter-spacing:1px}@keyframes scan{to{transform:translateY(4px)}}@media(max-width:560px){body{padding:0}.shell{min-height:100vh;border-left:0;border-right:0}.screen{padding:14px 12px 8px;font-size:12px}.prompt{padding:10px 12px 16px}.badge{display:none}}@media(prefers-reduced-motion:reduce){body:before{animation:none}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="top"><img class="logo" src="/src/images/dni-helmet.webp" alt="DNI helmet"><div class="title"><b>DNI DEVELOPER TERMINAL</b><span>AUTHORIZED SYSTEM CONTROL // /dev/termanal</span></div><div class="badge">ADMIN SESSION</div></header>
    <section id="dev-output" class="screen" aria-live="polite"></section>
    <form id="dev-form" class="prompt" autocomplete="off"><span class="prompt-user"><?= $username ?></span><span>@</span><span class="prompt-host">dni-dev</span><span>:~$</span><input id="dev-input" aria-label="Developer Terminal command" autofocus spellcheck="false"></form>
    <footer class="foot">DNI DEVELOPER TERMINAL // SAFE SERVER CONTROLS ONLY // NO ARBITRARY SHELL EXECUTION</footer>
  </main>
  <script src="/dev/termanal.js" defer></script>
</body>
</html>
