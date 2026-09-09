<?php

declare(strict_types=1);

$root = dirname(__DIR__, 2);
$tmp = sys_get_temp_dir() . '/dni-ops-access-test-' . bin2hex(random_bytes(5));
$php = $tmp . '/server/php';
mkdir($php, 0700, true);
function test_assert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
function dni_config(string $key, string $default = ''): string {
    return $GLOBALS['testConfig'][$key] ?? $default;
}
function dni_embedded_corps(): array { return [['id'=>1,'code'=>'army','active'=>true]]; }
function dni_embedded_ranks(): array { return [['id'=>1,'code'=>'o-1']]; }
function dni_embedded_effective_clearance_state(array $user): array { return ['level'=>2]; }
$files = ['dni-authz.php','dni-operations-access.php','dni-operations.php'];
foreach ($files as $file) copy($root . '/server/php/' . $file, $php . '/' . $file);
foreach (['dni.php','dni-embedded.php','dni-clearance.php','dni-operational-security.php','dni-documents.php'] as $file) file_put_contents($php . '/' . $file, "<?php\n");
define('DNI_ROOT', $tmp);
require $php . '/dni-operations.php';
$GLOBALS['testConfig'] = ['DNI_DEVELOPER_DISCORD_IDS'=>'555555555555555555'];
$base = ['id'=>1,'accountStatus'=>'active','discordUserId'=>'111111111111111111','roles'=>[],
    'personnel'=>['corpId'=>1,'rankId'=>1,'status'=>'active']];
$owner = $base; $owner['roles'] = [DNI_DEFAULT_OWNER_DISCORD_ROLE_ID];
$admin = $base; $admin['roles'] = [DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID];
$dev = $base; $dev['discordUserId'] = '555555555555555555';
$flagged = $base; $flagged['developerAdmin'] = true;
$member = $base; $member['roles'] = [DNI_BASE_MEMBER_DISCORD_ROLE_ID];
$citizen = $base; $citizen['roles'] = [DNI_CITIZEN_DISCORD_ROLE_ID];
foreach ([$owner,$admin,$dev,$flagged] as $user) test_assert(dni_operations_staff_authorized($user), 'Authorized staff denied.');
foreach ([$member,$citizen,$base] as $user) test_assert(!dni_operations_staff_authorized($user), 'Non-staff elevated.');
$forged = $base; $forged['identityType']='owner'; $forged['mailDomain']='dev.dni.org'; $forged['role']='admin';
test_assert(!dni_operations_staff_authorized($forged), 'Display labels must not grant access.');
$inactive = $dev; $inactive['accountStatus']='inactive';
test_assert(!dni_operations_staff_authorized($inactive), 'Inactive developer elevated.');
$invalid = $dev; $invalid['id']=0;
test_assert(!dni_operations_staff_authorized($invalid), 'Invalid actor elevated.');
test_assert(!dni_is_admin_authorized($dev), 'Global admin authorization must remain unchanged.');
if (extension_loaded('pdo_sqlite')) {
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE dni_ops_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)');
    foreach ([$owner,$admin,$dev,$flagged] as $user) {
        $ops = new DniOperations($pdo, ['users'=>[$user]], $user);
        test_assert($ops->can('operations.admin'), 'Staff Operations admin denied.');
        test_assert($ops->can('operations.tasks.read','navy'), 'Staff cross-department access denied.');
        test_assert(!$ops->can('operations.isb.read_restricted','security'), 'ISB grant bypassed.');
    }
    foreach ([$member,$citizen,$base,$inactive] as $user) {
        try { new DniOperations($pdo,['users'=>[$user]],$user); }
        catch (RuntimeException $e) { continue; }
        if ($user === $member) continue;
        throw new RuntimeException('Unprivileged actor was admitted to Operations.');
    }
}
foreach (array_reverse($files) as $file) unlink($php . '/' . $file);
foreach (['dni.php','dni-embedded.php','dni-clearance.php','dni-operational-security.php','dni-documents.php'] as $file) unlink($php . '/' . $file);
rmdir($php); rmdir(dirname($php)); rmdir($tmp);
echo "DNI Operations access checks passed.\n";
