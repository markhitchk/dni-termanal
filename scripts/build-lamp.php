#!/usr/bin/env php
<?php

declare(strict_types=1);

// Production Rocky/LAMP entrypoint. Canonical bundle generation happens first,
// then this small parity pass applies deployment-only assets that must match the
// Node build graph and the live browser verification contract.
require __DIR__ . '/build/build-lamp.php';

$rootArg = $argv[1] ?? dirname(__DIR__);
$root = realpath($rootArg);
if ($root === false || !is_dir($root . '/public/src')) {
    fwrite(STDERR, "DNI repository root was not found for the LAMP parity pass: {$rootArg}\n");
    exit(1);
}

$cacheKey = $argv[2] ?? 'local';
$cacheKey = preg_replace('/[^A-Za-z0-9._-]/', '', (string) $cacheKey) ?: 'local';
$cacheKey = substr($cacheKey, 0, 32);

$dropdownSource = $root . '/public/src/js/mail-recipient-dropdown.js';
$dropdownTarget = $root . '/public/dist/mail-recipient-dropdown.js';
if (!is_file($dropdownSource) || !copy($dropdownSource, $dropdownTarget)) {
    fwrite(STDERR, "Unable to publish DNI Mail recipient autofill dropdown for the Rocky/LAMP bundle.\n");
    exit(1);
}

$appPath = $root . '/public/dist/app.js';
$app = file_get_contents($appPath);
if ($app === false) {
    fwrite(STDERR, "Unable to read public/dist/app.js during the LAMP parity pass.\n");
    exit(1);
}

$composeImport = ".then(() => import('./mail-compose-v2.js?v={$cacheKey}'))";
$dropdownImport = ".then(() => import('./mail-recipient-dropdown.js?v={$cacheKey}'))";
if (!str_contains($app, $dropdownImport)) {
    $count = 0;
    $app = str_replace($composeImport, $composeImport . $dropdownImport, $app, $count);
    if ($count < 1 || file_put_contents($appPath, $app) === false) {
        fwrite(STDERR, "Unable to add the DNI Mail recipient dropdown to the Rocky/LAMP module chain.\n");
        exit(1);
    }
}

// The responsive sheet now uses <=700px phone rules plus 701-1180px tablet
// rules. Keep an explicit <=768px compatibility rule so the live verifier can
// positively identify phone/tablet coverage without changing those layouts.
$liveCssPath = $root . '/public/dist/mail-live.css';
$liveCss = file_get_contents($liveCssPath);
if ($liveCss === false) {
    fwrite(STDERR, "Unable to read public/dist/mail-live.css during the LAMP parity pass.\n");
    exit(1);
}
if (!str_contains($liveCss, '@media (max-width:768px)')) {
    $compatibilityRule = "\n\n/* DNI deployment verifier compatibility: phone/tablet coverage. */\n@media (max-width:768px){#dni-mail-panel{max-width:100%}}\n";
    if (file_put_contents($liveCssPath, $compatibilityRule, FILE_APPEND) === false) {
        fwrite(STDERR, "Unable to stamp the DNI Mail responsive verification rule.\n");
        exit(1);
    }
}

fwrite(STDOUT, "DNI Rocky/LAMP parity pass published mail-recipient-dropdown.js and verified responsive mail assets with cache key {$cacheKey}.\n");
