#!/usr/bin/env php
<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "build-lamp.php must be run from the command line.\n");
    exit(2);
}

$rootArg = $argv[1] ?? dirname(__DIR__);
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
    ['public/src/js/access.js', 'public/dist/access.js'],
    ['public/src/js/star-comms-api.js', 'public/dist/star-comms-api.js'],
    ['public/src/js/comms-provider.js', 'public/dist/comms-provider.js'],
    ['public/src/js/star-comms-github-pages.js', 'public/dist/star-comms-github-pages.js'],
    ['public/src/js/sectors-bootstrap.js', 'public/dist/sectors-bootstrap.js'],
    ['public/src/js/sectors.js', 'public/dist/sectors.js'],
    ['public/src/js/sectors-data.js', 'public/dist/sectors-data.js'],
    ['public/src/js/sectors-store.js', 'public/dist/sectors-store.js'],
    ['public/src/js/sectors-api.js', 'public/dist/sectors-api.js'],
    ['public/src/css/style.css', 'public/dist/style.css'],
    ['public/src/css/responsive.css', 'public/dist/responsive.css'],
    ['public/src/css/mobile-large.css', 'public/dist/mobile-large.css'],
    ['public/src/css/mobile-fit.css', 'public/dist/mobile-fit.css'],
    ['public/src/css/mobile-readable.css', 'public/dist/mobile-readable.css'],
    ['public/src/css/dni.css', 'public/dist/dni.css'],
    ['public/src/css/sectors.css', 'public/dist/sectors.css'],
    ['public/src/css/sectors-theme.css', 'public/dist/sectors-theme.css'],
    ['public/src/css/sectors-mobile-fit.css', 'public/dist/sectors-mobile-fit.css'],
    ['public/src/css/sectors-readable.css', 'public/dist/sectors-readable.css'],
];

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

$appPath = $root . '/public/dist/app.js';
$imports = "\nvoid import('./star-comms-github-pages.js?v={$cacheKey}').catch(error => console.error('Star Comms Pages patch failed', error));\n"
    . "void import('./sectors-bootstrap.js?v={$cacheKey}').catch(error => console.error('DNI Sectors bootstrap failed', error));\n";
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

if (!str_contains($html, 'dist/mobile-readable.css')) {
    $html = str_replace(
        '<link rel="stylesheet" href="dist/mobile-fit.css">',
        '<link rel="stylesheet" href="dist/mobile-fit.css">' . "\n  " . '<link rel="stylesheet" href="dist/mobile-readable.css">',
        $html
    );
}

$versionedAssets = [
    'dist/app.js',
    'dist/style.css',
    'dist/responsive.css',
    'dist/mobile-large.css',
    'dist/mobile-fit.css',
    'dist/mobile-readable.css',
];

foreach ($versionedAssets as $asset) {
    $pattern = '~' . preg_quote($asset, '~') . '(?:\\?v=[^"\']*)?~';
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

fwrite(STDOUT, "DNI LAMP bundle rebuilt with cache key {$cacheKey}.\n");
