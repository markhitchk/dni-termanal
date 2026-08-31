#!/usr/bin/env php
<?php

declare(strict_types=1);

// Compatibility entrypoint. Canonical implementation: scripts/build/build-lamp.php
require __DIR__ . '/build/build-lamp.php';

$helpSource = $root . '/public/src/js/terminal-help-cleanup.js';
$helpTarget = $root . '/public/dist/terminal-help-cleanup.js';

if (!is_file($helpSource) || !copy($helpSource, $helpTarget)) {
    fwrite(STDERR, "Unable to bundle organized DNI Terminal help response.\n");
    exit(1);
}

$helpImport = "\nvoid import('./terminal-help-cleanup.js?v={$cacheKey}').catch(error => console.error('DNI Terminal help cleanup failed', error));\n";
if (file_put_contents($appPath, $helpImport, FILE_APPEND) === false) {
    fwrite(STDERR, "Unable to attach organized DNI Terminal help response.\n");
    exit(1);
}
