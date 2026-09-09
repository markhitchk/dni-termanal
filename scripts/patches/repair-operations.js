#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const changes = new Map();
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function put(file, text) { changes.set(file, text); }
function replace(file, oldText, newText) {
  const text = changes.has(file) ? changes.get(file) : read(file);
  if (text.includes(newText)) return;
  const count = text.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${file}: expected exactly one matching source block; found ${count}`);
  put(file, text.replace(oldText, newText));
}
const helper = `<?php

declare(strict_types=1);

/**
 * Operations-only staff authorization. Never infer privileges from a URL,
 * display tag, email domain, or browser-supplied identity claim.
 */
require_once __DIR__ . '/dni-authz.php';

function dni_operations_developer_authorized(?array $user): bool
{
    if ($user === null) return false;
    // developerAdmin is supplied by the canonical authenticated user store.
    if (!empty($user['developerAdmin'])) return true;
    $discordId = trim((string)($user['discordUserId'] ?? $user['discord_user_id'] ?? ''));
    if ($discordId === '' || !ctype_digit($discordId)) return false;
    $allowed = dni_parse_discord_role_ids(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
    return in_array($discordId, $allowed, true);
}

function dni_operations_staff_authorized(?array $user): bool
{
    if ($user === null || (int)($user['id'] ?? 0) < 1
        || ($user['accountStatus'] ?? '') !== 'active') return false;
    return dni_is_admin_authorized($user)
        || dni_operations_developer_authorized($user);
}
`;
put('server/php/dni-operations-access.php', helper);
replace('server/php/dni-operations.php',
  "require_once __DIR__ . '/dni-authz.php';\n",
  "require_once __DIR__ . '/dni-authz.php';\nrequire_once __DIR__ . '/dni-operations-access.php';\n");
replace('server/php/dni-operations.php',
  '$this->admin = dni_is_admin_authorized($user);',
  '$this->admin = dni_operations_staff_authorized($user);');
replace('server/php/dni-operations.php',
  'return dni_is_admin_authorized($user)\n            || dni_user_has_discord_role($user, DNI_BASE_MEMBER_DISCORD_ROLE_ID);',
  'return dni_operations_staff_authorized($user)\n            || dni_user_has_discord_role($user, DNI_BASE_MEMBER_DISCORD_ROLE_ID);');
replace('server-http/operations-data.php',
  "require_once __DIR__ . '/../server/php/dni-authz.php';\n",
  "require_once __DIR__ . '/../server/php/dni-authz.php';\nrequire_once __DIR__ . '/../server/php/dni-operations-access.php';\n");
replace('server-http/operations-data.php',
  'if (dni_is_citizen_user($user)) {',
  'if (dni_is_citizen_user($user) && !dni_operations_staff_authorized($user)) {');
replace('public/src/js/routing.js',
  "  ranks: '/ranks',\n", "  ranks: '/ranks',\n  operations: '/operations',\n");
replace('public/src/js/routing.js',
  "    case '/ranks': return 'ranks';\n", "    case '/ranks': return 'ranks';\n    case '/operations': return 'operations';\n");
replace('public/src/js/authz.js',
  "  '/documents',\n  '/services',", "  '/documents',\n  '/operations',\n  '/services',");
replace('scripts/build/build-lamp.php',
  "'mail', 'admin'];", "'mail', 'admin', 'operations'];");
replace('public/deploy.php',
  "'mail', 'admin'];", "'mail', 'admin', 'operations'];");
replace('public/deploy.php',
  "foreach (['/', '/terminal/', '/api/dni/session', '/dist/mail.js'] as $path) {",
  "foreach (['/', '/terminal/', '/operations/', '/api/dni/session', '/dist/mail.js'] as $path) {");
replace('public/deploy.php',
  "    $need('public/index.html');\n",
  "    $need('public/index.html');\n    foreach (['public/src/js/routing.js', 'public/src/js/operations/operations-app.js',\n        'public/src/js/operations/operations-navigation.js', 'server/php/dni-operations-access.php'] as $source) {\n        if (!is_file($root . '/' . $source)) {\n            throw new RuntimeException('missing Operations source: ' . $source);\n        }\n    }\n");
replace('public/src/js/operations/operations-app.js',
  "      if(location.pathname.replace(/\\/+$/,'')==='/operations') location.replace(error.status===401?'/terminal':'/dashboard');",
  "      if(location.pathname.replace(/\\/+$/,'')==='/operations') {\n        if(error.status===401) {\n          location.replace('/auth/discord/login?next=%2Foperations');\n        } else {\n          showTab(true);\n          panel.hidden=false;\n          shell.dataset.panel='operations';\n          content.replaceChildren(section(title(error.status===403?'Access restricted':'Operations unavailable'),paragraph(error.message),button('Retry',initialize)));\n          showError(error);\n        }\n      }");
replace('public/src/js/operations/operations-app.js',
  "      showTab(true);\n      const path=location.pathname.replace(/\\/+$/,'');",
  "      showTab(true);\n      window.dispatchEvent(new CustomEvent('dni:operations-ready'));\n      const path=location.pathname.replace(/\\/+$/,'');");
replace('public/src/js/routing.js',
  "    const tab = tabForPanel(panel);\n    if (!tab) return;\n    suppressHistory = true;\n    tab.click();\n    suppressHistory = false;",
  "    const tab = tabForPanel(panel);\n    if (!tab) return;\n    if (panel === 'operations' && tab.hidden) return;\n    suppressHistory = true;\n    tab.click();\n    suppressHistory = false;");
replace('public/src/js/routing.js',
  "  const initialPath = normalizePath(window.location.pathname);",
  "  window.addEventListener('dni:operations-ready', () => {\n    if (panelFromPath(window.location.pathname) === 'operations'\n        && currentPanel(shell) !== 'operations') applyPanel('operations');\n  });\n\n  const initialPath = normalizePath(window.location.pathname);");
const tests = `<?php

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
foreach (['dni.php','dni-embedded.php','dni-clearance.php','dni-operational-security.php','dni-documents.php'] as $file) file_put_contents($php . '/' . $file, "<?php\\n");
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
echo "DNI Operations access checks passed.\\n";
`;
put('tests/operations/verify-access.php', tests);
const frontendTests = `const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const routing = read('public/src/js/routing.js');
const build = read('scripts/build/build-lamp.php');
const deploy = read('public/deploy.php');
const controller = read('server-http/operations-data.php');
const operations = read('server/php/dni-operations.php');
assert.match(routing, /operations: '\/operations'/);
assert.match(routing, /case '\/operations': return 'operations'/);
assert.match(routing, /dni:operations-ready/);
assert.match(build, /'admin', 'operations'/);
assert.match(deploy, /'admin', 'operations'/);
assert.match(deploy, /'\/operations\/'/);
assert.match(controller, /dni_operations_staff_authorized\(\$user\)/);
assert.match(operations, /\$this->admin = dni_operations_staff_authorized\(\$user\)/);
assert.match(operations, /operations\.isb\.read_restricted/);
assert.match(read('public/src/js/operations/operations-app.js'), /dni:operations-ready/);
console.log('DNI Operations routing, deployment and authorization checks passed.');
`;
put('tests/operations/verify-access.js', frontendTests);
for (const [file, text] of changes) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  if (!fs.existsSync(target) || fs.readFileSync(target,'utf8') !== text) fs.writeFileSync(target,text);
}
console.log(`Applied DNI Operations repair to ${changes.size} source/test files.`);
