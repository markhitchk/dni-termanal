#!/usr/bin/env php
<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "build-lamp.php must be run from the command line.\n");
    exit(2);
}

$rootArg = $argv[1] ?? dirname(__DIR__, 2);
$root = realpath($rootArg);
if ($root === false || !is_dir($root . '/public/src')) {
    fwrite(STDERR, "DNI repository root was not found: {$rootArg}\n");
    exit(2);
}

$cacheKey = $argv[2] ?? 'local';
$cacheKey = preg_replace('/[^A-Za-z0-9._-]/', '', $cacheKey) ?: 'local';
$cacheKey = substr($cacheKey, 0, 32);

$pairs = [
    ['public/src/js/script.js', 'public/dist/app.js'],
    ['public/src/js/terminal-session-guard.js', 'public/dist/terminal-session-guard.js'],
    ['public/src/js/terminal-error-modal.js', 'public/dist/terminal-error-modal.js'],
    ['public/src/js/terminal-developer-login.js', 'public/dist/terminal-developer-login.js'],
    ['public/src/js/terminal-help-cleanup.js', 'public/dist/terminal-help-cleanup.js'],
    ['public/src/js/mail.js', 'public/dist/mail.js'],
    ['public/src/js/mail-ux.js', 'public/dist/mail-ux.js'],
    ['public/src/js/mail-compose-v2.js', 'public/dist/mail-compose-v2.js'],
    ['public/src/js/mail-controls.js', 'public/dist/mail-controls.js'],
    ['public/src/js/mail-profile-pics.js', 'public/dist/mail-profile-pics.js'],
    ['public/src/js/mail-state-guard.js', 'public/dist/mail-state-guard.js'],
    ['public/src/js/mail-address-client.js', 'public/dist/mail-address-client.js'],
    ['public/src/js/mail-upload-button.js', 'public/dist/mail-upload-button.js'],
    ['public/src/js/mail-attachment-preview.js', 'public/dist/mail-attachment-preview.js'],
    ['public/src/js/mail/mail-realtime.js', 'public/dist/mail-realtime.js'],
    ['public/src/js/mail-priority-live.js', 'public/dist/mail-priority-live.js'],
    ['public/src/js/access.js', 'public/dist/access.js'],
    ['public/src/js/document-terminal.js', 'public/dist/document-terminal.js'],
    ['public/src/js/documents-workflow.js', 'public/dist/documents-workflow.js'],
    ['public/src/js/clearance-admin.js', 'public/dist/clearance-admin.js'],
    ['public/src/js/operational-admin.js', 'public/dist/operational-admin.js'],
    ['public/src/js/star-comms-api.js', 'public/dist/star-comms-api.js'],
    ['public/src/js/comms-provider.js', 'public/dist/comms-provider.js'],
    ['public/src/js/communication/comms-resilience-ui.js', 'public/dist/comms-resilience-ui.js'],
    ['public/src/js/authz.js', 'public/dist/authz.js'],
    ['public/src/js/dashboard.js', 'public/dist/dashboard.js'],
    ['public/src/js/discord-role-names.js', 'public/dist/discord-role-names.js'],
    ['public/src/js/ranks-data.js', 'public/dist/ranks-data.js'],
    ['public/src/js/ranks.js', 'public/dist/ranks.js'],
    ['public/src/js/services.js', 'public/dist/services.js'],
    ['public/src/js/system-effects.js', 'public/dist/system-effects.js'],
    ['public/src/js/sectors-bootstrap.js', 'public/dist/sectors-bootstrap.js'],
    ['public/src/js/sectors/sectors-home-base.js', 'public/dist/sectors-home-base.js'],
    ['public/src/js/sectors/sectors-command-workflows.js', 'public/dist/sectors-command-workflows.js'],
    ['public/src/js/sectors/sectors-strategic-layout.js', 'public/dist/sectors-strategic-layout.js'],
    ['public/src/js/sectors-admin.js', 'public/dist/sectors-admin.js'],
    ['public/src/js/admin.js', 'public/dist/admin.js'],
    ['public/src/js/admin-mail-address-editor.js', 'public/dist/admin-mail-address-editor.js'],
    ['public/src/js/admin-role-prefill.js', 'public/dist/admin-role-prefill.js'],
    ['public/src/js/admin-controls.js', 'public/dist/admin-controls.js'],
    ['public/src/js/sectors.js', 'public/dist/sectors.js'],
    ['public/src/js/sectors-data.js', 'public/dist/sectors-data.js'],
    ['public/src/js/sectors-store.js', 'public/dist/sectors-store.js'],
    ['public/src/js/sectors-api.js', 'public/dist/sectors-api.js'],
    ['public/src/js/routing.js', 'public/dist/routing.js'],
    ['public/src/css/style.css', 'public/dist/style.css'],
    ['public/src/css/responsive.css', 'public/dist/responsive.css'],
    ['public/src/css/mobile-large.css', 'public/dist/mobile-large.css'],
    ['public/src/css/mobile-fit.css', 'public/dist/mobile-fit.css'],
    ['public/src/css/mobile-readable.css', 'public/dist/mobile-readable.css'],
    ['public/src/css/modules.css', 'public/dist/modules.css'],
    ['public/src/css/polish.css', 'public/dist/polish.css'],
    ['public/src/css/documents-workflow.css', 'public/dist/documents-workflow.css'],
    ['public/src/css/ranks.css', 'public/dist/ranks.css'],
    ['public/src/css/mail.css', 'public/dist/mail.css'],
    ['public/src/css/mail-ux.css', 'public/dist/mail-ux.css'],
    ['public/src/css/mail/mail-live.css', 'public/dist/mail-live.css'],
    ['public/src/css/dni.css', 'public/dist/dni.css'],
    ['public/src/css/sectors.css', 'public/dist/sectors.css'],
    ['public/src/css/sectors-theme.css', 'public/dist/sectors-theme.css'],
    ['public/src/css/sectors-mobile-fit.css', 'public/dist/sectors-mobile-fit.css'],
    ['public/src/css/sectors-readable.css', 'public/dist/sectors-readable.css'],
];

$spaRoutes = ['terminal', 'dashboard', 'ranks', 'docs', 'documents', 'services', 'communication', 'sectors', 'mail', 'admin'];

foreach ($pairs as [$from, $to]) {
    $source = $root . '/' . $from;
    $target = $root . '/' . $to;
    if (!is_file($source)) {
        fwrite(STDERR, "Missing build source: {$from}\n");
        exit(1);
    }
    if (!is_dir(dirname($target)) && !mkdir(dirname($target), 0775, true) && !is_dir(dirname($target))) {
        fwrite(STDERR, "Unable to create build directory: " . dirname($target) . "\n");
        exit(1);
    }
    if (!copy($source, $target)) {
        fwrite(STDERR, "Unable to copy {$from} to {$to}\n");
        exit(1);
    }
}

// authz.js lazy-loads the Admin controls. Stamp that dependency with the same
// deployment cache key as the LAMP bundle so new Admin UI cannot stay cached.
$authzPath = $root . '/public/dist/authz.js';
$authz = file_get_contents($authzPath);
if ($authz === false) {
    fwrite(STDERR, "Unable to read public/dist/authz.js\n");
    exit(1);
}
$updatedAuthz = preg_replace(
    '~admin-controls\.js\?v=[^\'"`]+~',
    'admin-controls.js?v=' . $cacheKey,
    $authz
);
if ($updatedAuthz === null || file_put_contents($authzPath, $updatedAuthz) === false) {
    fwrite(STDERR, "Unable to stamp Admin controls cache key in public/dist/authz.js\n");
    exit(1);
}

// Keep the full Mail module graph on one deployment revision. Without this,
// mobile browsers can retain the former fixed mail.js query string and run an
// obsolete reader even though Apache has deployed the current source files.
$mailUxPath = $root . '/public/dist/mail-ux.js';
$mailUx = file_get_contents($mailUxPath);
if ($mailUx === false) {
    fwrite(STDERR, "Unable to read public/dist/mail-ux.js\n");
    exit(1);
}
$updatedMailUx = preg_replace_callback(
    '~(mail(?:-address-client|-upload-button|-profile-pics)?\.js)\?v=[^\'"`]+~',
    static fn(array $match): string => $match[1] . '?v=' . $cacheKey,
    $mailUx
);
if ($updatedMailUx === null || file_put_contents($mailUxPath, $updatedMailUx) === false) {
    fwrite(STDERR, "Unable to stamp DNI Mail module cache keys in public/dist/mail-ux.js\n");
    exit(1);
}

$appPath = $root . '/public/dist/app.js';
$imports = "\nvoid import('./terminal-error-modal.js?v={$cacheKey}').then(() => import('./terminal-session-guard.js?v={$cacheKey}')).catch(error => console.error('DNI Terminal lock dialog/session guard failed', error));\n"
    . "void import('./terminal-help-cleanup.js?v={$cacheKey}').catch(error => console.error('DNI Terminal help cleanup failed', error));\n"
    . "void import('./system-effects.js?v={$cacheKey}').catch(error => console.error('DNI system effects failed', error));\n"
    . "void import('./dashboard.js?v={$cacheKey}').catch(error => console.error('DNI Dashboard failed', error));\n"
    . "void import('./discord-role-names.js?v={$cacheKey}').catch(error => console.error('DNI Discord role labels failed', error));\n"
    . "void import('./ranks.js?v={$cacheKey}').catch(error => console.error('DNI Ranks failed', error));\n"
    . "void import('./documents-workflow.js?v={$cacheKey}').catch(error => console.error('DNI Documents browser/admin workflow failed', error));\n"
    . "void import('./services.js?v={$cacheKey}').catch(error => console.error('DNI Services failed', error));\n"
    . "void import('./mail-controls.js?v={$cacheKey}').then(() => import('./mail-ux.js?v={$cacheKey}')).then(() => import('./mail-compose-v2.js?v={$cacheKey}')).then(() => import('./mail-realtime.js?v={$cacheKey}')).then(() => import('./mail-priority-live.js?v={$cacheKey}')).catch(error => console.error('DNI Mail gate UX failed (controls/compose/realtime chain)', error));\n"
    . "void import('./mail-state-guard.js?v={$cacheKey}').catch(error => console.error('DNI Mail authorization state guard failed', error));\n"
    . "void import('./mail-attachment-preview.js?v={$cacheKey}').catch(error => console.error('DNI Mail attachment previews failed', error));\n"
    . "void import('./comms-resilience-ui.js?v={$cacheKey}').catch(error => console.error('DNI Communication resilience UI failed', error));\n"
    . "void import('./sectors-bootstrap.js?v={$cacheKey}').catch(error => console.error('DNI Sectors bootstrap failed', error));\n"
    . "void import('./admin.js?v={$cacheKey}').catch(error => console.error('DNI Admin failed', error));\n"
    . "void import('./admin-role-prefill.js?v={$cacheKey}').catch(error => console.error('DNI Admin Discord role prefill failed', error));\n"
    . "void import('./routing.js?v={$cacheKey}').catch(error => console.error('DNI routing bootstrap failed', error));\n";
if (file_put_contents($appPath, $imports, FILE_APPEND) === false) {
    fwrite(STDERR, "Unable to finish public/dist/app.js\n");
    exit(1);
}

$indexPath = $root . '/public/index.html';
$html = file_get_contents($indexPath);
if ($html === false) {
    fwrite(STDERR, "Unable to read public/index.html\n");
    exit(1);
}

if (preg_match('/<base\s+href=/i', $html)) {
    $updated = preg_replace('/<base\s+href=["\'][^"\']*["\']\s*\/?\s*>/i', '<base href="/">', $html, 1);
    if ($updated === null) {
        fwrite(STDERR, "Unable to normalize production base URL.\n");
        exit(1);
    }
    $html = $updated;
} else {
    $updated = preg_replace('/(<meta\s+name=["\']viewport["\'][^>]*>)/i', '$1' . "\n  <base href=\"/\">", $html, 1);
    if ($updated === null || $updated === $html) {
        fwrite(STDERR, "Unable to insert production base URL.\n");
        exit(1);
    }
    $html = $updated;
}

$versionedAssets = [
    'dist/authz.js', 'dist/app.js', 'dist/mail.js', 'dist/mail-compose-v2.js', 'dist/style.css', 'dist/responsive.css', 'dist/mobile-large.css',
    'dist/mobile-fit.css', 'dist/mobile-readable.css', 'dist/modules.css', 'dist/polish.css', 'dist/documents-workflow.css',
    'src/js/page-loader.js',
];
foreach ($versionedAssets as $asset) {
    $pattern = '~' . preg_quote($asset, '~') . '(?:\?v=[^"\']*)?~';
    $replacement = $asset . '?v=' . $cacheKey;
    $updated = preg_replace($pattern, $replacement, $html, 1);
    if ($updated === null) {
        fwrite(STDERR, "Unable to stamp asset: {$asset}\n");
        exit(1);
    }
    $html = $updated;
}

if (file_put_contents($indexPath, $html) === false) {
    fwrite(STDERR, "Unable to write public/index.html\n");
    exit(1);
}

foreach ($spaRoutes as $route) {
    $routeDir = $root . '/public/' . $route;
    if (!is_dir($routeDir) && !mkdir($routeDir, 0775, true) && !is_dir($routeDir)) {
        fwrite(STDERR, "Unable to create SPA route directory: {$routeDir}\n");
        exit(1);
    }
    if (file_put_contents($routeDir . '/index.html', $html) === false) {
        fwrite(STDERR, "Unable to write SPA route entrypoint: {$route}/index.html\n");
        exit(1);
    }
}

fwrite(STDOUT, "DNI LAMP bundle rebuilt with terminal session tabs, organized terminal help, startup/auth-locked DNI Mail access, direct /mail routing, repaired mail authorization state handling, attachment previews for legacy and current CDN messages, bounded DNI Mail realtime/typing presence, authoritative support-recipient routing, grouped To/CC/BCC delivery, Sent mailbox UI, @user compose mentions, categorized Support/DNI Member/Citizen recipient tabs, responsive phone/tablet mail layout, system boot transitions, named Discord role sync, full DNI Ranks directory, clearance-filtered /docs classified records, Officer/ISB document administration inside /admin, secure DNI Mail, sender block/mute controls, functional mail loading/authentication gate, Discord role personnel prefills, personnel and operational classification administration, clearance-filtered modules, guarded DNI Admin, bundled Admin controls, complete Sectors command modules, and server-side Star Comms with cache key {$cacheKey}.\n");
