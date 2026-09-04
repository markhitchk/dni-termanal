<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';

const DNI_MAIL_WEB_PUSH_KEY_FILE = DNI_ROOT . '/data/dni-web-push-vapid.json';
const DNI_MAIL_WEB_PUSH_SUBSCRIPTIONS_FILE = DNI_ROOT . '/data/dni-web-push-subscriptions.json';

function dni_mail_web_push_b64url(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function dni_mail_web_push_runtime_dir(): string
{
    $dir = DNI_ROOT . '/data';
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new RuntimeException('Unable to create DNI Mail Web Push runtime directory.');
    }
    return $dir;
}

function dni_mail_web_push_atomic_json_write(string $path, array $payload): void
{
    dni_mail_web_push_runtime_dir();
    $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        throw new RuntimeException('Unable to write DNI Mail Web Push runtime data.');
    }
    @chmod($tmp, 0600);
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('Unable to activate DNI Mail Web Push runtime data.');
    }
    @chmod($path, 0600);
}

function dni_mail_web_push_vapid_keys(): array
{
    static $cached = null;
    if (is_array($cached)) return $cached;

    $path = DNI_MAIL_WEB_PUSH_KEY_FILE;
    if (is_file($path)) {
        $decoded = json_decode((string)file_get_contents($path), true);
        if (is_array($decoded)
            && trim((string)($decoded['privateKeyPem'] ?? '')) !== ''
            && trim((string)($decoded['publicKey'] ?? '')) !== '') {
            return $cached = $decoded;
        }
    }

    if (!extension_loaded('openssl')) {
        throw new RuntimeException('OpenSSL is required for DNI Mail Web Push.');
    }

    dni_mail_web_push_runtime_dir();
    $lockPath = $path . '.lock';
    $lock = fopen($lockPath, 'c+');
    if ($lock === false) throw new RuntimeException('Unable to create DNI Mail Web Push key lock.');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Unable to lock DNI Mail Web Push key store.');
        clearstatcache(true, $path);
        if (is_file($path)) {
            $decoded = json_decode((string)file_get_contents($path), true);
            if (is_array($decoded)
                && trim((string)($decoded['privateKeyPem'] ?? '')) !== ''
                && trim((string)($decoded['publicKey'] ?? '')) !== '') {
                return $cached = $decoded;
            }
        }

        $resource = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);
        if ($resource === false) throw new RuntimeException('Unable to generate DNI Mail VAPID key.');

        $privatePem = '';
        if (!openssl_pkey_export($resource, $privatePem) || $privatePem === '') {
            throw new RuntimeException('Unable to export DNI Mail VAPID private key.');
        }

        $details = openssl_pkey_get_details($resource);
        $x = is_array($details) ? ($details['ec']['x'] ?? null) : null;
        $y = is_array($details) ? ($details['ec']['y'] ?? null) : null;
        if (!is_string($x) || !is_string($y) || strlen($x) !== 32 || strlen($y) !== 32) {
            throw new RuntimeException('Unable to derive DNI Mail VAPID public key.');
        }

        $record = [
            'privateKeyPem' => $privatePem,
            'publicKey' => dni_mail_web_push_b64url("\x04" . $x . $y),
            'createdAt' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
        dni_mail_web_push_atomic_json_write($path, $record);
        return $cached = $record;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
        @unlink($lockPath);
    }
}

function dni_mail_web_push_public_key(): string
{
    return (string)dni_mail_web_push_vapid_keys()['publicKey'];
}

function dni_mail_web_push_read_subscriptions(): array
{
    $path = DNI_MAIL_WEB_PUSH_SUBSCRIPTIONS_FILE;
    if (!is_file($path)) return [];
    $decoded = json_decode((string)file_get_contents($path), true);
    if (!is_array($decoded)) return [];
    return array_values(array_filter($decoded, 'is_array'));
}

function dni_mail_web_push_mutate_subscriptions(callable $mutator): array
{
    dni_mail_web_push_runtime_dir();
    $path = DNI_MAIL_WEB_PUSH_SUBSCRIPTIONS_FILE;
    $lockPath = $path . '.lock';
    $lock = fopen($lockPath, 'c+');
    if ($lock === false) throw new RuntimeException('Unable to create DNI Mail Web Push subscription lock.');

    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Unable to lock DNI Mail Web Push subscriptions.');
        $list = dni_mail_web_push_read_subscriptions();
        $result = $mutator($list);
        dni_mail_web_push_atomic_json_write($path, array_values($list));
        return is_array($result) ? $result : [];
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
        @unlink($lockPath);
    }
}

function dni_mail_web_push_normalize_endpoint(mixed $value): string
{
    $endpoint = trim((string)$value);
    if ($endpoint === '' || strlen($endpoint) > 4096) throw new RuntimeException('Web Push endpoint is invalid.', 422);
    $parts = parse_url($endpoint);
    if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https' || empty($parts['host'])) {
        throw new RuntimeException('Web Push endpoint must use HTTPS.', 422);
    }
    return $endpoint;
}

function dni_mail_web_push_upsert_subscription(int $userId, array $subscription, string $userAgent = ''): array
{
    if ($userId <= 0) throw new RuntimeException('DNI Mail user record is unavailable.', 404);

    $endpoint = dni_mail_web_push_normalize_endpoint($subscription['endpoint'] ?? '');
    $expirationTime = $subscription['expirationTime'] ?? null;
    $keys = is_array($subscription['keys'] ?? null) ? $subscription['keys'] : [];
    $p256dh = trim((string)($keys['p256dh'] ?? ''));
    $auth = trim((string)($keys['auth'] ?? ''));
    if (strlen($p256dh) > 512 || strlen($auth) > 256) throw new RuntimeException('Web Push subscription keys are invalid.', 422);

    $record = [];
    dni_mail_web_push_mutate_subscriptions(function (array &$list) use ($userId, $endpoint, $expirationTime, $p256dh, $auth, $userAgent, &$record): array {
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $next = [
            'userId' => $userId,
            'endpoint' => $endpoint,
            'expirationTime' => is_numeric($expirationTime) ? (float)$expirationTime : null,
            'p256dh' => $p256dh,
            'auth' => $auth,
            'userAgent' => substr($userAgent, 0, 500),
            'createdAt' => $now,
            'updatedAt' => $now,
        ];

        $found = false;
        foreach ($list as $index => $candidate) {
            if (!is_array($candidate) || (string)($candidate['endpoint'] ?? '') !== $endpoint) continue;
            $next['createdAt'] = (string)($candidate['createdAt'] ?? $now);
            $list[$index] = $next;
            $found = true;
            break;
        }
        if (!$found) $list[] = $next;
        $record = $next;
        return $next;
    });

    return $record;
}

function dni_mail_web_push_remove_subscription(int $userId, string $endpoint): bool
{
    $endpoint = trim($endpoint);
    if ($userId <= 0 || $endpoint === '') return false;

    $removed = false;
    dni_mail_web_push_mutate_subscriptions(function (array &$list) use ($userId, $endpoint, &$removed): array {
        $before = count($list);
        $list = array_values(array_filter(
            $list,
            static function ($candidate) use ($userId, $endpoint): bool {
                if (!is_array($candidate)) return false;
                $match = (int)($candidate['userId'] ?? 0) === $userId
                    && hash_equals((string)($candidate['endpoint'] ?? ''), $endpoint);
                return !$match;
            }
        ));
        $removed = count($list) !== $before;
        return ['removed' => $removed];
    });
    return $removed;
}

function dni_mail_web_push_remove_endpoints(array $endpoints): void
{
    $keys = [];
    foreach ($endpoints as $endpoint) {
        $endpoint = trim((string)$endpoint);
        if ($endpoint !== '') $keys[$endpoint] = true;
    }
    if ($keys === []) return;

    dni_mail_web_push_mutate_subscriptions(function (array &$list) use ($keys): array {
        $list = array_values(array_filter(
            $list,
            static fn($candidate): bool => is_array($candidate)
                && !isset($keys[(string)($candidate['endpoint'] ?? '')])
        ));
        return [];
    });
}

function dni_mail_web_push_user_subscription_count(int $userId): int
{
    $count = 0;
    foreach (dni_mail_web_push_read_subscriptions() as $candidate) {
        if (is_array($candidate) && (int)($candidate['userId'] ?? 0) === $userId) $count++;
    }
    return $count;
}

function dni_mail_web_push_der_signature_to_raw(string $der, int $partLength = 32): string
{
    $offset = 0;
    if (($der[$offset++] ?? '') !== "\x30") throw new RuntimeException('Invalid VAPID signature.');

    $length = ord($der[$offset++] ?? "\0");
    if ($length & 0x80) {
        $bytes = $length & 0x7f;
        $length = 0;
        for ($i = 0; $i < $bytes; $i++) $length = ($length << 8) | ord($der[$offset++] ?? "\0");
    }

    $readInteger = static function () use (&$der, &$offset, $partLength): string {
        if (($der[$offset++] ?? '') !== "\x02") throw new RuntimeException('Invalid VAPID signature integer.');
        $length = ord($der[$offset++] ?? "\0");
        if ($length & 0x80) {
            $bytes = $length & 0x7f;
            $length = 0;
            for ($i = 0; $i < $bytes; $i++) $length = ($length << 8) | ord($der[$offset++] ?? "\0");
        }
        $value = substr($der, $offset, $length);
        $offset += $length;
        $value = ltrim($value, "\0");
        if (strlen($value) > $partLength) $value = substr($value, -$partLength);
        return str_pad($value, $partLength, "\0", STR_PAD_LEFT);
    };

    return $readInteger() . $readInteger();
}

function dni_mail_web_push_vapid_authorization(string $endpoint): array
{
    $parts = parse_url($endpoint);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        throw new RuntimeException('Web Push endpoint is invalid.');
    }

    $audience = strtolower((string)$parts['scheme']) . '://' . strtolower((string)$parts['host']);
    if (isset($parts['port'])) $audience .= ':' . (int)$parts['port'];

    $keys = dni_mail_web_push_vapid_keys();
    $header = dni_mail_web_push_b64url(json_encode(['typ' => 'JWT', 'alg' => 'ES256'], JSON_THROW_ON_ERROR));
    $claims = dni_mail_web_push_b64url(json_encode([
        'aud' => $audience,
        'exp' => time() + 12 * 60 * 60,
        'sub' => 'https://www.dreadnoughtimperium.org/',
    ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    $signingInput = $header . '.' . $claims;

    $private = openssl_pkey_get_private((string)$keys['privateKeyPem']);
    if ($private === false) throw new RuntimeException('Unable to load DNI Mail VAPID signing key.');

    $der = '';
    if (!openssl_sign($signingInput, $der, $private, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Unable to sign DNI Mail Web Push request.');
    }

    $jwt = $signingInput . '.' . dni_mail_web_push_b64url(dni_mail_web_push_der_signature_to_raw($der));
    return [
        'Authorization: vapid t=' . $jwt . ', k=' . (string)$keys['publicKey'],
        'TTL: 120',
        'Urgency: normal',
        'Content-Length: 0',
    ];
}

function dni_mail_web_push_send_endpoint(string $endpoint): int
{
    if (!extension_loaded('curl')) throw new RuntimeException('cURL is required for DNI Mail Web Push.');

    $endpoint = dni_mail_web_push_normalize_endpoint($endpoint);
    $curl = curl_init($endpoint);
    if ($curl === false) throw new RuntimeException('Unable to initialize DNI Mail Web Push.');

    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => dni_mail_web_push_vapid_authorization($endpoint),
    ]);
    curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($status === 0 && $error !== '') error_log('[DNI Mail Web Push] ' . $error);
    return $status;
}

function dni_mail_web_push_notify_endpoint_for_user(int $userId, string $endpoint): array
{
    $endpoint = dni_mail_web_push_normalize_endpoint($endpoint);
    $authorized = false;
    foreach (dni_mail_web_push_read_subscriptions() as $candidate) {
        if (!is_array($candidate)) continue;
        if ((int)($candidate['userId'] ?? 0) === $userId
            && hash_equals((string)($candidate['endpoint'] ?? ''), $endpoint)) {
            $authorized = true;
            break;
        }
    }
    if (!$authorized) return ['attempted' => 0, 'delivered' => 0, 'stale' => 0];

    try {
        $status = dni_mail_web_push_send_endpoint($endpoint);
        if ($status >= 200 && $status < 300) return ['attempted' => 1, 'delivered' => 1, 'stale' => 0];
        if (in_array($status, [404, 410], true)) {
            dni_mail_web_push_remove_endpoints([$endpoint]);
            return ['attempted' => 1, 'delivered' => 0, 'stale' => 1];
        }
        if ($status > 0) error_log('[DNI Mail Web Push] endpoint returned HTTP ' . $status);
    } catch (Throwable $error) {
        error_log('[DNI Mail Web Push] ' . $error->getMessage());
    }
    return ['attempted' => 1, 'delivered' => 0, 'stale' => 0];
}

function dni_mail_web_push_notify_users(array $userIds): array
{
    $ids = [];
    foreach ($userIds as $value) {
        $id = (int)$value;
        if ($id > 0) $ids[$id] = true;
    }
    if ($ids === []) return ['attempted' => 0, 'delivered' => 0, 'stale' => 0];

    $targets = [];
    foreach (dni_mail_web_push_read_subscriptions() as $candidate) {
        if (!is_array($candidate) || !isset($ids[(int)($candidate['userId'] ?? 0)])) continue;
        $endpoint = trim((string)($candidate['endpoint'] ?? ''));
        if ($endpoint !== '') $targets[$endpoint] = true;
    }
    if ($targets === []) return ['attempted' => 0, 'delivered' => 0, 'stale' => 0];

    if (!extension_loaded('curl') || !function_exists('curl_multi_init')) {
        $delivered = 0;
        $stale = [];
        foreach (array_keys($targets) as $endpoint) {
            try {
                $status = dni_mail_web_push_send_endpoint($endpoint);
                if ($status >= 200 && $status < 300) $delivered++;
                elseif (in_array($status, [404, 410], true)) $stale[] = $endpoint;
            } catch (Throwable $error) {
                error_log('[DNI Mail Web Push] ' . $error->getMessage());
            }
        }
        if ($stale !== []) dni_mail_web_push_remove_endpoints($stale);
        return ['attempted' => count($targets), 'delivered' => $delivered, 'stale' => count($stale)];
    }

    $multi = curl_multi_init();
    $handles = [];
    try {
        foreach (array_keys($targets) as $endpoint) {
            try {
                $curl = curl_init(dni_mail_web_push_normalize_endpoint($endpoint));
                if ($curl === false) continue;
                curl_setopt_array($curl, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_FOLLOWLOCATION => false,
                    CURLOPT_CONNECTTIMEOUT => 4,
                    CURLOPT_TIMEOUT => 8,
                    CURLOPT_HTTPHEADER => dni_mail_web_push_vapid_authorization($endpoint),
                ]);
                curl_multi_add_handle($multi, $curl);
                $handles[$endpoint] = $curl;
            } catch (Throwable $error) {
                error_log('[DNI Mail Web Push] ' . $error->getMessage());
            }
        }

        do {
            $code = curl_multi_exec($multi, $active);
            if ($code !== CURLM_OK) break;
            if ($active > 0) {
                $selected = curl_multi_select($multi, 1.0);
                if ($selected === -1) usleep(10000);
            }
        } while ($active > 0);

        $delivered = 0;
        $stale = [];
        foreach ($handles as $endpoint => $curl) {
            $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            $error = curl_error($curl);
            if ($status >= 200 && $status < 300) {
                $delivered++;
            } elseif (in_array($status, [404, 410], true)) {
                $stale[] = $endpoint;
            } elseif ($status > 0) {
                error_log('[DNI Mail Web Push] endpoint returned HTTP ' . $status);
            } elseif ($error !== '') {
                error_log('[DNI Mail Web Push] ' . $error);
            }
        }
        if ($stale !== []) dni_mail_web_push_remove_endpoints($stale);
        return ['attempted' => count($handles), 'delivered' => $delivered, 'stale' => count($stale)];
    } finally {
        foreach ($handles as $curl) {
            @curl_multi_remove_handle($multi, $curl);
            @curl_close($curl);
        }
        curl_multi_close($multi);
    }
}
