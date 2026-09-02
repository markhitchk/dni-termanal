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
    if ($arg === '--maintenance-token-file') {
        // Legacy compatibility only. Maintenance cookie bypass has been removed.
        array_shift($args);
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
$cdnDomain = 'cdn.' . $domain;
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

function ensure_server_alias(string $block, string $alias): string
{
    $clean = without_comments($block);
    if (preg_match_all('/^[ \t]*ServerAlias[ \t]+([^\r\n#]+)/mi', $clean, $matches)) {
        foreach ($matches[1] as $rawNames) {
            foreach (preg_split('/\s+/', trim($rawNames)) ?: [] as $name) {
                if (strtolower(rtrim($name, '.')) === strtolower($alias)) return $block;
            }
        }
    }

    $updated = preg_replace(
        '/^([ \t]*ServerName[ \t]+[^\r\n#]+)(\r?\n)/mi',
        '$1$2    ServerAlias ' . $alias . '$2',
        $block,
        1
    );
    if ($updated !== null && $updated !== $block) return $updated;

    return preg_replace(
        '/^(\s*<VirtualHost\b[^>]*>\s*\R)/i',
        '$1    ServerAlias ' . $alias . "\n",
        $block,
        1
    ) ?? $block;
}

function update_vhost_block(
    string $block,
    string $publicRoot,
    string $cdnDomain,
    string $markerStart,
    string $markerEnd
): string {
    $quotedRoot = '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $publicRoot) . '"';
    $quotedFilesRoot = '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $publicRoot . '/files') . '"';
    $cdnHostPattern = preg_quote($cdnDomain, '/');

    $managedPattern = '~^[ \t]*' . preg_quote($markerStart, '~') . '\R.*?^[ \t]*' . preg_quote($markerEnd, '~') . '[ \t]*\R?~ms';
    $block = preg_replace($managedPattern, '', $block) ?? $block;
    $block = ensure_server_alias($block, $cdnDomain);

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
        . "\n"
        . "            # The CDN hostname is deliberately file-only. Uploads are placed under public/files/.\n"
        . "            RewriteCond %{HTTP_HOST} ^{$cdnHostPattern}(?::[0-9]+)?$ [NC]\n"
        . "            RewriteCond %{REQUEST_URI} !^/files(?:/|$) [NC]\n"
        . "            RewriteRule ^ - [R=404,L]\n"
        . "            RewriteCond %{HTTP_HOST} ^{$cdnHostPattern}(?::[0-9]+)?$ [NC]\n"
        . "            RewriteCond %{REQUEST_URI} ^/files(?:/|$) [NC]\n"
        . "            RewriteRule ^ - [L]\n"
        . "\n"
        . "            # A hidden flag enables the branded maintenance screen for browser pages.\n"
        . "            # No browser cookie or PIN bypass is permitted.\n"
        . "            # API/auth/deployment and Developer Terminal endpoints remain available so an update can complete safely.\n"
        . "            RewriteCond %{DOCUMENT_ROOT}/.dni-maintenance -f\n"
        . "            RewriteCond %{REQUEST_URI} !^/errors/maintenance(?:\\.php|\\.html)$ [NC]\n"
        . "            RewriteCond %{REQUEST_URI} !^/src/images/dni-helmet(?:-icon)?\\.webp$ [NC]\n"
        . "            RewriteCond %{REQUEST_URI} !^/dev/termanal(?:\\.php|\\.js|/|$) [NC]\n"
        . "            RewriteCond %{REQUEST_URI} !^/dev/private/files/dni_terminal\\.db$ [NC]\n"
        . "            RewriteCond %{REQUEST_URI} !^/(?:deploy\\.php|github-webhook\\.php|sync-runtime-secrets\\.php)$ [NC]\n"
        . "            RewriteCond %{REQUEST_URI} !^/(?:api|auth)(?:/|$) [NC]\n"
        . "            RewriteRule ^ /errors/maintenance.php [L]\n"
        . "\n"
        . "            RewriteRule ^dev/termanal/?$ /dev/termanal.php [QSA,L]\n"
        . "            RewriteRule ^dev/private/files/dni_terminal\\.db$ /dev/private/files/dni-terminal-download.php [QSA,L]\n"
        . "            # Discord must land on the branded callback result screen first.\n"
        . "            # That page calls auth/index.php internally so SUCCESS/DENIED is visible before navigation.\n"
        . "            RewriteRule ^auth/discord/callback/?$ /auth/discord/callback/index.html [QSA,L]\n"
        . "            RewriteRule ^auth/discord/login/?$ /auth/index.php?dni_auth_route=login [QSA,L]\n"
        . "            RewriteRule ^auth/logout/?$ /auth/index.php?dni_auth_route=logout [QSA,L]\n"
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
        . "    # Public DNI CDN storage. Treat every upload as static content; never execute handlers here.\n"
        . "    <Directory {$quotedFilesRoot}>\n"
        . "        Options -Indexes -ExecCGI -Includes\n"
        . "        AllowOverride None\n"
        . "        Require all granted\n"
        . "        <FilesMatch \".*\">\n"
        . "            SetHandler none\n"
        . "        </FilesMatch>\n"
        . "        <IfModule mod_mime.c>\n"
        . "            RemoveHandler .php .php3 .php4 .php5 .php7 .php8 .phtml .pht .phar .cgi .fcgi .pl .py .rb .sh\n"
        . "            RemoveType .php .php3 .php4 .php5 .php7 .php8 .phtml .pht .phar .cgi .fcgi .pl .py .rb .sh\n"
        . "        </IfModule>\n"
        . "        <IfModule mod_php.c>\n"
        . "            php_admin_flag engine off\n"
        . "        </IfModule>\n"
        . "    </Directory>\n"
        . "\n"
        . "    <IfModule mod_headers.c>\n"
        . "        Header always set X-Content-Type-Options \"nosniff\"\n"
        . "        Header always set X-Frame-Options \"DENY\"\n"
        . "        Header always set Referrer-Policy \"same-origin\"\n"
        . "        Header always set Permissions-Policy \"camera=(), microphone=(), geolocation=()\"\n"
        . "        Header always set Content-Security-Policy \"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com https://{$cdnDomain} data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'\"\n"
        . "        Header always set Strict-Transport-Security \"max-age=31536000; includeSubDomains\"\n"
        . "        <LocationMatch \"^/files/\">\n"
        . "            Header always set X-Content-Type-Options \"nosniff\"\n"
        . "            Header always set Content-Security-Policy \"default-src 'none'; sandbox\"\n"
        . "            Header always set Cross-Origin-Resource-Policy \"cross-origin\"\n"
        . "            Header always set Cache-Control \"public, max-age=31536000, immutable\"\n"
        . "        </LocationMatch>\n"
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
        static function (array $match) use ($acceptedNames, $resolvedRoot, $cdnDomain, $markerStart, $markerEnd, &$countForFile): string {
            $block = $match[0];
            if (!handles_domain($block, $acceptedNames)) {
                return $block;
            }
            $countForFile++;
            return update_vhost_block($block, $resolvedRoot, $cdnDomain, $markerStart, $markerEnd);
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

fwrite(STDOUT, "[bootstrap] Apache configuration matched {$total} DNI VirtualHost block(s); {$cdnDomain} is enabled as the file-only CDN alias.\n");