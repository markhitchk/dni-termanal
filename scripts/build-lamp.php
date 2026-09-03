#!/usr/bin/env php
<?php

declare(strict_types=1);

// Compatibility entrypoint. Canonical implementation: scripts/build/build-lamp.php
require __DIR__ . '/build/build-lamp.php';

$rootArg = $argv[1] ?? dirname(__DIR__);
$root = realpath($rootArg);
if ($root === false || !is_dir($root . '/public/src/js')) {
    fwrite(STDERR, "DNI repository root was not found for Mail priority post-build: {$rootArg}\n");
    exit(2);
}

$cacheKey = $argv[2] ?? 'local';
$cacheKey = preg_replace('/[^A-Za-z0-9._-]/', '', (string)$cacheKey) ?: 'local';
$cacheKey = substr($cacheKey, 0, 32);
$source = $root . '/public/src/js/mail-priority-live.js';
$target = $root . '/public/dist/mail-priority-live.js';
$appPath = $root . '/public/dist/app.js';

if (!is_file($source) || !is_file($appPath)) {
    fwrite(STDERR, "DNI Mail live priority source or built app is missing.\n");
    exit(1);
}
if (!copy($source, $target)) {
    fwrite(STDERR, "Unable to copy DNI Mail live priority module into public/dist.\n");
    exit(1);
}

$app = file_get_contents($appPath);
if ($app === false) {
    fwrite(STDERR, "Unable to read public/dist/app.js for DNI Mail priority bootstrap.\n");
    exit(1);
}
if (!str_contains($app, 'mail-priority-live.js?v=')) {
    $import = "\nvoid import('./mail-priority-live.js?v={$cacheKey}').catch(error => console.error('DNI Mail live priority data failed', error));\n";
    if (file_put_contents($appPath, $import, FILE_APPEND) === false) {
        fwrite(STDERR, "Unable to append DNI Mail live priority bootstrap to public/dist/app.js.\n");
        exit(1);
    }
}

fwrite(STDOUT, "DNI Mail live priority data bundle added with cache key {$cacheKey}.\n");
