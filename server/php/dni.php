<?php

declare(strict_types=1);

const DNI_ROOT = __DIR__ . '/../..';
const DNI_STORAGE_MODE = 'sqlite';

function dni_runtime_values(): array
{
    static $values = null;
    if (is_array($values)) {
        return $values;
    }

    $values = [];
    $path = DNI_ROOT . '/data/dni-runtime.env';
    if (!is_file($path)) {
        return $values;
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $separator = strpos($line, '=');
        if ($separator === false) {
            continue;
        }
        $key = trim(substr($line, 0, $separator));
        $value = trim(substr($line, $separator + 1));
        if ($key === '') {
            continue;
        }
        if (strlen($value) >= 2) {
            $first = $value[0];
            $last = $value[strlen($value) - 1];
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $value = substr($value, 1, -1);
            }
        }
        $values[$key] = $value;
    }

    return $values;
}

function dni_config(string $key, ?string $default = null): string
{
    $environment = getenv($key);
    if ($environment !== false && trim((string)$environment) !== '') {
        return trim((string)$environment);
    }

    $runtime = dni_runtime_values();
    if (isset($runtime[$key]) && trim((string)$runtime[$key]) !== '') {
        return trim((string)$runtime[$key]);
    }

    if ($default !== null) {
        return $default;
    }

    throw new RuntimeException("Missing DNI runtime configuration: {$key}");
}

function dni_is_configured(string $key): bool
{
    // DNI Terminal now uses one authoritative SQLite .db file. Keep legacy
    // MariaDB credentials inert even if old values still exist on the VPS so
    // individual endpoints cannot split live data between two databases.
    if (in_array($key, ['DNI_DB_DSN', 'DNI_DB_USER', 'DNI_DB_PASSWORD'], true)) {
        return false;
    }

    try {
        return dni_config($key) !== '';
    } catch (Throwable) {
        return false;
    }
}

function dni_db(): PDO
{
    throw new RuntimeException(
        'MariaDB storage is disabled. DNI Terminal uses SQLite at data/dni_terminal.db.'
    );
}

function dni_session_ttl_seconds(): int
{
    $default = 30 * 24 * 60 * 60;
    $configured = trim(dni_config('DNI_SESSION_TTL_SECONDS', (string)$default));
    if ($configured === '' || !ctype_digit($configured)) {
        return $default;
    }

    // Keep configuration useful without accidentally creating nearly immortal
    // browser sessions. One hour minimum, ninety days maximum.
    return max(3600, min((int)$configured, 90 * 24 * 60 * 60));
}

final class DniSqliteSessionHandler implements SessionHandlerInterface, SessionUpdateTimestampHandlerInterface
{
    private ?PDO $pdo = null;

    public function __construct(private readonly int $ttl)
    {
    }

    private function database(): PDO
    {
        if ($this->pdo instanceof PDO) {
            return $this->pdo;
        }

        if (!extension_loaded('pdo_sqlite')) {
            throw new RuntimeException('The PHP pdo_sqlite extension is required for DNI sessions.');
        }

        $path = DNI_ROOT . '/data/dni_terminal.db';
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new RuntimeException('Unable to create DNI SQLite database directory for sessions.');
        }

        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec('PRAGMA busy_timeout = 10000');
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS dni_sessions (\n"
            . "  session_key TEXT PRIMARY KEY,\n"
            . "  session_data BLOB NOT NULL,\n"
            . "  created_at INTEGER NOT NULL,\n"
            . "  last_seen_at INTEGER NOT NULL,\n"
            . "  expires_at INTEGER NOT NULL\n"
            . ")"
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_dni_sessions_expires_at ON dni_sessions (expires_at)');
        @chmod($path, 0600);

        $this->pdo = $pdo;
        return $pdo;
    }

    private function key(string $id): string
    {
        return hash('sha256', $id);
    }

    private function legacySessionPath(string $id): ?string
    {
        // Migrate sessions created by the short-lived filesystem backend from
        // the previous build. New sessions are never written to this path.
        if (!preg_match('/^[A-Za-z0-9,-]{16,256}$/D', $id)) {
            return null;
        }
        return DNI_ROOT . '/data/sessions/sess_' . $id;
    }

    private function importLegacySession(string $id): bool
    {
        $path = $this->legacySessionPath($id);
        if ($path === null || !is_file($path)) {
            return false;
        }

        $modified = filemtime($path);
        if (!is_int($modified) || $modified < (time() - $this->ttl)) {
            @unlink($path);
            return false;
        }

        $data = file_get_contents($path);
        if (!is_string($data)) {
            return false;
        }

        $now = time();
        $statement = $this->database()->prepare(
            'INSERT INTO dni_sessions (session_key, session_data, created_at, last_seen_at, expires_at) '
            . 'VALUES (?, ?, ?, ?, ?) '
            . 'ON CONFLICT(session_key) DO UPDATE SET '
            . 'session_data = excluded.session_data, last_seen_at = excluded.last_seen_at, expires_at = excluded.expires_at'
        );
        $statement->execute([$this->key($id), $data, $modified, $now, $now + $this->ttl]);
        @unlink($path);
        return true;
    }

    public function open(string $path, string $name): bool
    {
        $this->database();
        return true;
    }

    public function close(): bool
    {
        return true;
    }

    public function read(string $id): string|false
    {
        $pdo = $this->database();
        $statement = $pdo->prepare(
            'SELECT session_data, expires_at FROM dni_sessions WHERE session_key = ? LIMIT 1'
        );
        $statement->execute([$this->key($id)]);
        $row = $statement->fetch();

        if (!is_array($row)) {
            if (!$this->importLegacySession($id)) {
                return '';
            }
            $statement->execute([$this->key($id)]);
            $row = $statement->fetch();
        }

        if (!is_array($row) || (int)($row['expires_at'] ?? 0) <= time()) {
            $this->destroy($id);
            return '';
        }

        return (string)($row['session_data'] ?? '');
    }

    public function write(string $id, string $data): bool
    {
        $now = time();
        $statement = $this->database()->prepare(
            'INSERT INTO dni_sessions (session_key, session_data, created_at, last_seen_at, expires_at) '
            . 'VALUES (?, ?, ?, ?, ?) '
            . 'ON CONFLICT(session_key) DO UPDATE SET '
            . 'session_data = excluded.session_data, last_seen_at = excluded.last_seen_at, expires_at = excluded.expires_at'
        );
        return $statement->execute([$this->key($id), $data, $now, $now, $now + $this->ttl]);
    }

    public function destroy(string $id): bool
    {
        $statement = $this->database()->prepare('DELETE FROM dni_sessions WHERE session_key = ?');
        $statement->execute([$this->key($id)]);

        $legacyPath = $this->legacySessionPath($id);
        if ($legacyPath !== null && is_file($legacyPath)) {
            @unlink($legacyPath);
        }

        return true;
    }

    public function gc(int $max_lifetime): int|false
    {
        $statement = $this->database()->prepare('DELETE FROM dni_sessions WHERE expires_at <= ?');
        $statement->execute([time()]);
        return $statement->rowCount();
    }

    public function validateId(string $id): bool
    {
        $statement = $this->database()->prepare(
            'SELECT 1 FROM dni_sessions WHERE session_key = ? AND expires_at > ? LIMIT 1'
        );
        $statement->execute([$this->key($id), time()]);
        if ($statement->fetchColumn() !== false) {
            return true;
        }

        return $this->importLegacySession($id);
    }

    public function updateTimestamp(string $id, string $data): bool
    {
        $now = time();
        $statement = $this->database()->prepare(
            'UPDATE dni_sessions SET last_seen_at = ?, expires_at = ? WHERE session_key = ?'
        );
        $statement->execute([$now, $now + $this->ttl, $this->key($id)]);
        return $statement->rowCount() > 0;
    }
}

function dni_refresh_session_cookie(int $ttl): void
{
    if (headers_sent() || session_status() !== PHP_SESSION_ACTIVE || session_id() === '') {
        return;
    }

    $now = time();
    $lastRefresh = (int)($_SESSION['dni_cookie_refreshed_at'] ?? 0);
    if ($lastRefresh > 0 && ($now - $lastRefresh) < 21600) {
        return;
    }

    setcookie(session_name(), session_id(), [
        'expires' => $now + $ttl,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    $_SESSION['dni_cookie_refreshed_at'] = $now;
}

function dni_start_session(): void
{
    $ttl = dni_session_ttl_seconds();

    if (session_status() === PHP_SESSION_ACTIVE) {
        dni_refresh_session_cookie($ttl);
        return;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string)$ttl);
    ini_set('session.cookie_lifetime', (string)$ttl);
    ini_set('session.gc_probability', '1');
    ini_set('session.gc_divisor', '100');
    ini_set('session.lazy_write', '1');

    session_name('dni_session');
    session_set_cookie_params([
        'lifetime' => $ttl,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    $handler = new DniSqliteSessionHandler($ttl);
    session_set_save_handler($handler, true);
    session_start();
    dni_refresh_session_cookie($ttl);
}

function dni_security_headers(): void
{
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
}

function dni_json(int $status, array $payload): never
{
    dni_security_headers();
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    exit;
}

function dni_redirect(string $url, int $status = 302): never
{
    dni_security_headers();
    header('Location: ' . $url, true, $status);
    exit;
}

function dni_local_redirect_target(?string $value, string $fallback = '/dashboard'): string
{
    $target = trim((string)$value);
    if ($target === '' || $target[0] !== '/' || str_starts_with($target, '//')) {
        return $fallback;
    }
    $parts = parse_url($target);
    if ($parts === false || isset($parts['host']) || isset($parts['scheme'])) {
        return $fallback;
    }
    return $target;
}

function dni_request_path(): string
{
    $uri = (string)($_SERVER['REQUEST_URI'] ?? '/');
    $path = parse_url($uri, PHP_URL_PATH);
    return is_string($path) && $path !== '' ? $path : '/';
}

function dni_require_method(string $method): void
{
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== strtoupper($method)) {
        header('Allow: ' . strtoupper($method));
        dni_json(405, ['ok' => false, 'error' => strtoupper($method) . ' required.']);
    }
}

function dni_current_user_id(): ?int
{
    dni_start_session();
    $value = $_SESSION['dni_user_id'] ?? null;
    return is_int($value) || ctype_digit((string)$value) ? (int)$value : null;
}

function dni_csrf_token(): string
{
    dni_start_session();
    if (!isset($_SESSION['dni_csrf']) || !is_string($_SESSION['dni_csrf']) || strlen($_SESSION['dni_csrf']) < 32) {
        $_SESSION['dni_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['dni_csrf'];
}

function dni_require_csrf(): void
{
    $expected = dni_csrf_token();
    $provided = (string)($_SERVER['HTTP_X_DNI_CSRF'] ?? ($_POST['_csrf'] ?? ''));
    if ($provided === '' || !hash_equals($expected, $provided)) {
        dni_json(403, ['ok' => false, 'error' => 'Invalid DNI CSRF token.']);
    }
}

function dni_effective_permissions(PDO $pdo, int $userId): array
{
    $statement = $pdo->prepare(
        "SELECT permission_key FROM dni_default_permissions
         UNION
         SELECT permission_key FROM dni_user_permissions WHERE user_id = ?
         UNION
         SELECT rp.permission_key
           FROM dni_user_discord_roles ur
           INNER JOIN dni_discord_role_permissions rp ON rp.discord_role_id = ur.discord_role_id
          WHERE ur.user_id = ?"
    );
    $statement->execute([$userId, $userId]);
    $permissions = array_values(array_unique(array_map(
        static fn(array $row): string => (string)$row['permission_key'],
        $statement->fetchAll()
    )));
    sort($permissions, SORT_STRING);
    return $permissions;
}

function dni_effective_clearances(PDO $pdo, int $userId): array
{
    $statement = $pdo->prepare(
        "SELECT DISTINCT cl.level, cl.code, cl.name
           FROM dni_clearance_levels cl
           INNER JOIN (
               SELECT clearance_level
                 FROM dni_user_clearances
                WHERE user_id = ?
                  AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(6))
               UNION
               SELECT rc.clearance_level
                 FROM dni_user_discord_roles ur
                 INNER JOIN dni_discord_role_clearances rc ON rc.discord_role_id = ur.discord_role_id
                WHERE ur.user_id = ?
           ) effective ON effective.clearance_level = cl.level
          ORDER BY cl.level ASC"
    );
    $statement->execute([$userId, $userId]);
    return $statement->fetchAll();
}

function dni_has_permission(PDO $pdo, int $userId, string $permission): bool
{
    $permissions = dni_effective_permissions($pdo, $userId);
    return in_array('admin', $permissions, true) || in_array($permission, $permissions, true);
}

function dni_require_user(): array
{
    $userId = dni_current_user_id();
    if ($userId === null) {
        dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login']);
    }

    $pdo = dni_db();
    $statement = $pdo->prepare(
        "SELECT id, discord_user_id, username, global_name, guild_nick, avatar_hash, account_status, last_login_at, last_role_sync_at
           FROM dni_users
          WHERE id = ?
          LIMIT 1"
    );
    $statement->execute([$userId]);
    $user = $statement->fetch();
    if (!$user || $user['account_status'] !== 'active') {
        dni_logout_session();
        dni_json(403, ['ok' => false, 'error' => 'DNI account access is disabled.']);
    }
    return $user;
}

function dni_logout_session(): void
{
    dni_start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'] ?: '/',
            'domain' => $params['domain'] ?: '',
            'secure' => (bool)$params['secure'],
            'httponly' => (bool)$params['httponly'],
            'samesite' => $params['samesite'] ?: 'Lax',
        ]);
    }
    session_destroy();
}

function dni_session_payload(PDO $pdo, ?int $userId): array
{
    if ($userId === null) {
        return [
            'authenticated' => false,
            'loginUrl' => '/auth/discord/login',
            'permissions' => [],
            'clearances' => [],
        ];
    }

    $statement = $pdo->prepare(
        "SELECT u.id, u.discord_user_id, u.username, u.global_name, u.guild_nick, u.avatar_hash,
                p.display_name, p.status AS personnel_status,
                r.name AS rank_name, c.name AS corp_name,
                s.name AS sector_name, f.name AS fleet_name, d.name AS duty_station_name
           FROM dni_users u
           LEFT JOIN dni_personnel p ON p.user_id = u.id
           LEFT JOIN dni_ranks r ON r.id = p.rank_id
           LEFT JOIN dni_corps c ON c.id = p.corp_id
           LEFT JOIN dni_sectors s ON s.id = p.current_sector_id
           LEFT JOIN dni_assets f ON f.id = p.assigned_fleet_id
           LEFT JOIN dni_assets d ON d.id = p.duty_station_id
          WHERE u.id = ? AND u.account_status = 'active'
          LIMIT 1"
    );
    $statement->execute([$userId]);
    $user = $statement->fetch();
    if (!$user) {
        return ['authenticated' => false, 'loginUrl' => '/auth/discord/login', 'permissions' => [], 'clearances' => []];
    }

    return [
        'authenticated' => true,
        'user' => $user,
        'permissions' => dni_effective_permissions($pdo, $userId),
        'clearances' => dni_effective_clearances($pdo, $userId),
        'csrfToken' => dni_csrf_token(),
        'logoutUrl' => '/auth/logout',
    ];
}

function dni_discord_request(string $method, string $url, ?string $bearer = null, ?array $form = null): array
{
    if (!extension_loaded('curl')) {
        throw new RuntimeException('The PHP curl extension is required for Discord OAuth.');
    }

    $curl = curl_init($url);
    if ($curl === false) {
        throw new RuntimeException('Unable to initialize Discord request.');
    }

    $headers = ['Accept: application/json', 'User-Agent: DNI-Terminal/4.2'];
    if ($bearer !== null) {
        $headers[] = 'Authorization: Bearer ' . $bearer;
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
    ]);

    if ($form !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, http_build_query($form, '', '&', PHP_QUERY_RFC3986));
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
    }

    $body = curl_exec($curl);
    if ($body === false) {
        $message = curl_error($curl);
        curl_close($curl);
        throw new RuntimeException('Discord request failed: ' . $message);
    }

    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    $payload = json_decode((string)$body, true);
    if (!is_array($payload)) {
        $payload = ['raw' => (string)$body];
    }

    if ($status < 200 || $status >= 300) {
        $detail = (string)($payload['message'] ?? $payload['error_description'] ?? $payload['error'] ?? 'Discord API request failed.');
        throw new RuntimeException("Discord API returned {$status}: {$detail}", $status);
    }

    return $payload;
}

function dni_upsert_discord_user(PDO $pdo, array $identity, array $member): int
{
    $discordId = trim((string)($identity['id'] ?? ''));
    $username = trim((string)($identity['username'] ?? ''));
    if ($discordId === '' || $username === '') {
        throw new RuntimeException('Discord identity response is incomplete.');
    }

    $globalName = isset($identity['global_name']) ? trim((string)$identity['global_name']) : null;
    $guildNick = isset($member['nick']) ? trim((string)$member['nick']) : null;
    $avatarHash = isset($identity['avatar']) ? trim((string)$identity['avatar']) : null;

    $statement = $pdo->prepare(
        "INSERT INTO dni_users (discord_user_id, username, global_name, guild_nick, avatar_hash, last_login_at, last_role_sync_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
         ON DUPLICATE KEY UPDATE
             username = VALUES(username),
             global_name = VALUES(global_name),
             guild_nick = VALUES(guild_nick),
             avatar_hash = VALUES(avatar_hash),
             last_login_at = UTC_TIMESTAMP(6),
             last_role_sync_at = UTC_TIMESTAMP(6)"
    );
    $statement->execute([$discordId, $username, $globalName ?: null, $guildNick ?: null, $avatarHash ?: null]);

    $lookup = $pdo->prepare('SELECT id, account_status FROM dni_users WHERE discord_user_id = ? LIMIT 1');
    $lookup->execute([$discordId]);
    $user = $lookup->fetch();
    if (!$user) {
        throw new RuntimeException('Unable to create DNI user record.');
    }
    if ($user['account_status'] !== 'active') {
        throw new RuntimeException('DNI account access is disabled.', 403);
    }
    return (int)$user['id'];
}

function dni_sync_discord_roles(PDO $pdo, int $userId, array $roles): void
{
    $normalized = [];
    foreach ($roles as $roleId) {
        $roleId = trim((string)$roleId);
        if ($roleId !== '' && ctype_digit($roleId)) {
            $normalized[$roleId] = true;
        }
    }

    $pdo->beginTransaction();
    try {
        $delete = $pdo->prepare('DELETE FROM dni_user_discord_roles WHERE user_id = ?');
        $delete->execute([$userId]);

        if ($normalized !== []) {
            $insert = $pdo->prepare(
                'INSERT INTO dni_user_discord_roles (user_id, discord_role_id, synced_at) VALUES (?, ?, UTC_TIMESTAMP(6))'
            );
            foreach (array_keys($normalized) as $roleId) {
                $insert->execute([$userId, $roleId]);
            }
        }

        $touch = $pdo->prepare('UPDATE dni_users SET last_role_sync_at = UTC_TIMESTAMP(6) WHERE id = ?');
        $touch->execute([$userId]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function dni_grant_bootstrap_admin(PDO $pdo, int $userId, string $discordUserId): void
{
    $configured = trim(dni_config('DNI_BOOTSTRAP_ADMIN_DISCORD_ID', ''));
    if ($configured === '' || !hash_equals($configured, $discordUserId)) {
        return;
    }
    $statement = $pdo->prepare(
        "INSERT IGNORE INTO dni_user_permissions (user_id, permission_key) VALUES (?, 'admin')"
    );
    $statement->execute([$userId]);
}

function dni_audit(PDO $pdo, ?int $actorUserId, string $action, string $entityType, ?string $entityId, array $details = []): void
{
    $statement = $pdo->prepare(
        'INSERT INTO dni_audit_log (actor_user_id, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $actorUserId,
        $action,
        $entityType,
        $entityId,
        $details === [] ? null : json_encode($details, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);
}