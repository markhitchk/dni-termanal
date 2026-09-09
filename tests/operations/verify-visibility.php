<?php
declare(strict_types=1);
$root = dirname(__DIR__, 2);
$tmp = sys_get_temp_dir() . '/dni-ops-status-' . bin2hex(random_bytes(5));
mkdir($tmp, 0700, true);
try {
    // Only this helper's dependencies are stubbed; its production source is copied intact.
    file_put_contents($tmp . '/dni-authz.php', <<<'PHP'
<?php
const DNI_DEFAULT_OWNER_DISCORD_ROLE_ID = '100000000000000001';
const DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID = '100000000000000002';
function dni_config(string $key, string $default = ''): string { return $GLOBALS['testConfig'][$key] ?? $default; }
function dni_parse_discord_role_ids(string $raw): array { return array_values(array_filter(preg_split('/[\s,;]+/', trim($raw)) ?: [], fn($id) => $id !== '' && ctype_digit($id))); }
function dni_user_has_discord_role(?array $user, string $id): bool { return in_array($id, array_map('strval', $user['roles'] ?? []), true); }
function dni_is_admin_authorized(?array $user): bool { return $user !== null && ((empty($user['developerAdmin']) && !empty($user['directAdmin'])) || dni_user_has_discord_role($user, DNI_DEFAULT_OWNER_DISCORD_ROLE_ID) || dni_user_has_discord_role($user, DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID)); }
PHP);
    copy($root . '/server/php/dni-operations-access.php', $tmp . '/dni-operations-access.php');
    require $tmp . '/dni-operations-access.php';
    $GLOBALS['testConfig'] = ['DNI_DEVELOPER_DISCORD_IDS'=>'100000000000000003'];
    $base = ['id'=>1,'accountStatus'=>'active','discordUserId'=>'100000000000000004','roles'=>[]];
    $owner = $base; $owner['roles']=[DNI_DEFAULT_OWNER_DISCORD_ROLE_ID];
    $admin = $base; $admin['roles']=[DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID];
    $dev = $base; $dev['discordUserId']='100000000000000003';
    $flagged = $base; $flagged['developerAdmin']=true;
    $direct = $base; $direct['directAdmin']=true;
    $expected = [
        [$owner, [true,true,true,false]],
        [$admin, [true,false,true,false]],
        [$dev, [true,false,false,true]],
        [$flagged, [true,false,false,true]],
        [$direct, [true,false,true,false]],
        [$base, [false,false,false,false]],
    ];
    foreach ($expected as [$user,$flags]) {
        $value=dni_operations_access_descriptor($user);
        $actual=array_values($value);
        if ($actual !== $flags) throw new RuntimeException('Unexpected access descriptor.');
    }
    $forged=$base; $forged['role']='owner'; $forged['identityType']='developer'; $forged['mailDomain']='dev.dni.org';
    if (dni_operations_access_descriptor($forged)['staff']) throw new RuntimeException('Untrusted display label granted access.');
    foreach ([$dev,$owner,$admin] as $user) {
        $user['accountStatus']='inactive';
        if (dni_operations_access_descriptor($user)['staff']) throw new RuntimeException('Inactive account granted access.');
        $user['accountStatus']='active'; $user['id']=0;
        if (dni_operations_access_descriptor($user)['staff']) throw new RuntimeException('Invalid account granted access.');
    }
    if (dni_operations_access_descriptor(null)['staff']) throw new RuntimeException('Anonymous account granted access.');
    if (dni_is_admin_authorized($dev)) throw new RuntimeException('Developer must not receive global admin authorization.');
    echo "DNI Operations trusted access-descriptor checks passed.\n";
} finally {
    foreach (['dni-authz.php','dni-operations-access.php'] as $file) if (is_file($tmp.'/'.$file)) unlink($tmp.'/'.$file);
    rmdir($tmp);
}
