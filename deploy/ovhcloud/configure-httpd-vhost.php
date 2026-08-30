#!/usr/bin/env php
<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "configure-httpd-vhost.php must be run from the command line.\n");
    exit(2);
}

$args = $argv;
array_shift($args);
$publicRoot = null;
$domain = 'dreadnoughtimperium.org';
$paths = [];

while ($args !== []) {
    $arg = array_shift($args);
    if ($arg === '--public-root') {
        $publicRoot = array_shift($args) ?: null;
        continue;
    }
    if ($arg === '--domain') {
        $domain = array_shift($args) ?: $domain;
        continue;
    }
    $paths[] = $arg;
}

if ($publicRoot === null || $paths === []) {
    fwrite(STDERR, "Usage: configure-httpd-vhost.php --public-root PATH [--domain DOMAIN] CONFIG...\n");
    exit(2);
}

$resolvedRoot = realpath($publicRoot);
if ($resolvedRoot === false || !is_dir($resolvedRoot)) {
    fwrite(STDERR, "Public root does not exist: {$publicRoot}\n");
    exit(2);
}

$resolvedRoot = rtrim($resolvedRoot, '/');
$domain = strtolower(trim($domain));
$acceptedNames = [$domain, 'www.' . $domain];
$markerStart = '# BEGIN DNI TERMINAL ROCKY 9 LAMP';
$markerEnd = '# END DNI TERMINAL ROCKY 9 LAMP';

function without_comments(string $text): string
{
    return preg_replace('/^[ \t]*#.*$/m', '', $text) ?? $text;
}

function handles_domain(string $block, array $acceptedNames): bool
{
    $clean = without_comments($block);
    if (!preg_match_all('/^[ \t]*Server(?:Name|Alias)[ \t]+([^\r\n#]+)/mi', $clean, $matches)) {
        return false;
    }

    foreach ($matches[1] as $rawNames) {
        foreach (preg_split('/\s+/', trim($rawNames)) ?: [] as $name) {
            $name = strtolower(rtrim(trim($name), '.'));
            if (in_array($name, $acceptedNames, true)) {
                return true;
            }
        }
    }
    return false;
}

function update_vhost_block(string $block, string $publicRoot, string $markerStart, string $markerEnd): string
{
    $quotedRoot = '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $publicRoot) . '"';

    $managedPattern = '~^[ \t]*' . preg_quote($markerStart, '~') . '\R.*?^[ \t]*' . preg_quote($markerEnd, '~') . '[ \t]*\R?~ms';
    $block = preg_replace($managedPattern, '', $block) ?? $block;

    $documentRootCount = 0;
    $block = preg_replace_callback(
        '/^([ \t]*)DocumentRoot[ \t]+[^\r\n]+/mi',
        static function (array $match) use ($quotedRoot, &$documentRootCount): string {
            $documentRootCount++;
            if ($documentRootCount > 1) {
                return $match[0];
            }
            return $match[1] . 'DocumentRoot ' . $quotedRoot;
        },
        $block
    ) ?? $block;

    if ($documentRootCount === 0) {
        $block = preg_replace(
            '/^(\s*<VirtualHost\b[^>]*>\s*\R)/i',
            '$1    DocumentRoot ' . $quotedRoot . "\n",
            $block,
            1
        ) ?? $block;
    }

    $managed = "\n    {$markerStart}\n"
        . "    <Directory {$quotedRoot}>\n"
        . "        Options -Indexes +FollowSymLinks\n"
        . "        AllowOverride None\n"
        . "        Require all granted\n"
        . "        DirectoryIndex index.html\n"
        . "\n"
        . "        <FilesMatch \"^\\.\">\n"
        . "            Require all denied\n"
        . "        </FilesMatch>\n"
        . "\n"
        . "        <IfModule mod_rewrite.c>\n"
        . "            RewriteEngine On\n"
        . "            RewriteRule ^auth/(?:discord/(?:login|callback)|logout)$ /auth/index.php [QSA,L]\n"
        . "            RewriteRule ^api/dni(?:/.*)?$ /api/index.php [QSA,L]\n"
        . "\n"
        . "            RewriteCond %{REQUEST_FILENAME} -f [OR]\n"
        . "            RewriteCond %{REQUEST_FILENAME} -d\n"
        . "            RewriteRule ^ - [L]\n"
        . "\n"
        . "            RewriteRule ^(?:terminal|dashboard|services|communication|sectors)/?$ /index.html [L]\n"
        . "        </IfModule>\n"
        . "    </Directory>\n"
        . "\n"
        . "    <IfModule mod_headers.c>\n"
        . "        Header always set X-Content-Type-Options \"nosniff\"\n"
        . "        Header always set X-Frame-Options \"DENY\"\n"
        . "        Header always set Referrer-Policy \"same-origin\"\n"
        . "        Header always set Permissions-Policy \"camera=(), microphone=(), geolocation=()\"\n"
        . "        Header always set Content-Security-Policy \"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'\"\n"
        . "        Header always set Strict-Transport-Security \"max-age=31536000; includeSubDomains\"\n"
        . "    </IfModule>\n"
        . "\n"
        . "    ErrorDocument 403 /errors/403.html\n"
        . "    ErrorDocument 404 /errors/404.html\n"
        . "    ErrorDocument 500 /errors/500.html\n"
        . "    ErrorDocument 503 /errors/503.html\n"
        . "    {$markerEnd}\n";

    $updated = preg_replace('/\s*<\/VirtualHost>\s*$/i', $managed . '</VirtualHost>', $block, 1);
    return $updated ?? $block;
}

$total = 0;
foreach ($paths as $rawPath) {
    if (!is_file($rawPath) || !is_readable($rawPath) || !is_writable($rawPath)) {
        continue;
    }

    $original = file_get_contents($rawPath);
    if ($original === false) {
        continue;
    }

    $countForFile = 0;
    $updated = preg_replace_callback(
        '~<VirtualHost\b[^>]*>.*?</VirtualHost>~is',
        static function (array $match) use ($acceptedNames, $resolvedRoot, $markerStart, $markerEnd, &$countForFile): string {
            $block = $match[0];
            if (!handles_domain($block, $acceptedNames)) {
                return $block;
            }
            $countForFile++;
            return update_vhost_block($block, $resolvedRoot, $markerStart, $markerEnd);
        },
        $original
    );

    if ($updated === null) {
        fwrite(STDERR, "Unable to parse Apache config: {$rawPath}\n");
        exit(1);
    }

    if ($countForFile > 0 && $updated !== $original) {
        if (file_put_contents($rawPath, $updated) === false) {
            fwrite(STDERR, "Unable to update Apache config: {$rawPath}\n");
            exit(1);
        }
        fwrite(STDOUT, "[bootstrap] Configured {$countForFile} matching Apache VirtualHost block(s) in {$rawPath}\n");
    } elseif ($countForFile > 0) {
        fwrite(STDOUT, "[bootstrap] Apache VirtualHost already configured in {$rawPath}\n");
    }

    $total += $countForFile;
}

if ($total === 0) {
    fwrite(STDERR, "No Apache VirtualHost for {$domain} or www.{$domain} was found.\n");
    exit(2);
}

fwrite(STDOUT, "[bootstrap] Apache configuration matched {$total} DNI VirtualHost block(s).\n");
