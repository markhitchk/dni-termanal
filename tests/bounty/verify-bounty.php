<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/server/php/dni-bounty.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    // Keep this isolated regression test on PHP's normal temporary session
    // storage. Production uses the SQLite session handler configured by
    // dni_start_session(), but the test must not create repo-root data/.
    session_start();
}
$_SESSION['dni_csrf'] = str_repeat('a', 64);

function expect_true(bool $value, string $message): void
{
    if (!$value) throw new RuntimeException($message);
}

$pdo = new PDO('sqlite::memory:', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys = ON');

DniBounty::schema($pdo);

$citizen = [
    'id' => 1,
    'username' => 'citizen-one',
    'globalName' => 'Citizen One',
    'guildNick' => null,
    'roles' => [DNI_CITIZEN_DISCORD_ROLE_ID],
    'accountStatus' => 'active',
    'directAdmin' => false,
    'personnel' => ['displayName' => 'Citizen One'],
];
$other = [
    'id' => 2,
    'username' => 'citizen-two',
    'globalName' => 'Citizen Two',
    'guildNick' => null,
    'roles' => [DNI_CITIZEN_DISCORD_ROLE_ID],
    'accountStatus' => 'active',
    'directAdmin' => false,
    'personnel' => ['displayName' => 'Citizen Two'],
];
$admin = [
    'id' => 3,
    'username' => 'dni-admin',
    'globalName' => 'DNI Admin',
    'guildNick' => null,
    'roles' => [],
    'accountStatus' => 'active',
    'directAdmin' => true,
    'personnel' => ['displayName' => 'DNI Admin'],
];
$db = ['users' => [$citizen, $other, $admin]];

$ownerService = new DniBounty($pdo, $db, $citizen);
$orgSession = $ownerService->addOrganization([
    'orgTag' => 'NOVA',
    'orgName' => 'Nova Intergalactic',
    'rsiUrl' => 'https://robertsspaceindustries.com/orgs/NOVA',
    'logoUrl' => '',
    'memberRole' => 'Pilot',
]);
expect_true(count($orgSession['memberships'] ?? []) === 1, 'Citizen should be able to self-declare an ORG.');
$membership = $orgSession['memberships'][0];
expect_true(($membership['membership_status'] ?? '') === 'self_declared', 'Manual ORG membership must remain self-declared.');

$created = $ownerService->create([
    'organizationId' => (int)$membership['organization_id'],
    'targetName' => 'Raven',
    'targetHandle' => 'RAVEN-01',
    'wantedStatus' => 'DEAD_OR_ALIVE',
    'rewardAmount' => '25000',
    'charges' => 'Contract violation',
    'lastKnownLocation' => 'Stanton',
    'description' => 'Regression test bounty.',
    'targetImageUrl' => '',
]);
$bounty = $created['bounty'] ?? [];
expect_true((bool)preg_match('/^DNI-BT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/D', (string)($bounty['publicId'] ?? '')), 'Public bounty ID format is invalid.');
expect_true(($bounty['status'] ?? '') === 'active', 'New bounty should be active.');
expect_true(($bounty['organizationTag'] ?? '') === 'NOVA', 'Bounty should retain ORG snapshot.');
expect_true(
    ($bounty['url'] ?? '') === '/bounty/?code=' . rawurlencode((string)($bounty['code'] ?? '')),
    'Bounty detail URL must use the deploy-safe physical /bounty/ route.'
);

$embedMethod = new ReflectionMethod(DniBounty::class, 'webhookEmbed');
$embedMethod->setAccessible(true);
$storedRow = $pdo->query('SELECT * FROM dni_bounties LIMIT 1')->fetch(PDO::FETCH_ASSOC);
$embed = $embedMethod->invoke($ownerService, $storedRow);
expect_true(str_contains((string)($embed['title'] ?? ''), 'Raven'), 'Discord bounty embed title should include the target.');
expect_true(isset($embed['thumbnail']['url']), 'Discord bounty embed should always include a thumbnail.');
expect_true(!isset($embed['image']), 'Discord bounty embed should use a compact thumbnail instead of a full-width image.');
expect_true(count($embed['fields'] ?? []) <= 2, 'Discord bounty embed should remain compact on mobile.');
expect_true(str_contains((string)($embed['description'] ?? ''), 'DNI-BT-'), 'Discord bounty embed summary should include the bounty ID.');

$mine = $ownerService->mine();
expect_true(count($mine['bounties'] ?? []) === 1, 'Owner should see their bounty.');

$board = $ownerService->board();
expect_true(count($board['bounties'] ?? []) === 1, 'Active bounty should appear on board.');

$guestService = new DniBounty($pdo, $db, []);
$guestSession = $guestService->session();
expect_true(($guestSession['authenticated'] ?? true) === false, 'Main bounty board session should support public/guest viewing.');
expect_true(count($guestService->board()['bounties'] ?? []) === 1, 'Guest should be able to view the Main Bounty Board.');
$guestDetail = $guestService->detail((string)$bounty['code']);
expect_true(($guestDetail['bounty']['publicId'] ?? '') === ($bounty['publicId'] ?? ''), 'Guest should be able to open an active bounty record.');
$guestMutationBlocked = false;
try {
    $guestService->mine();
} catch (RuntimeException $error) {
    $guestMutationBlocked = $error->getCode() === 401;
}
expect_true($guestMutationBlocked, 'Guest must not be able to access bounty composer management data.');

$otherService = new DniBounty($pdo, $db, $other);
$blocked = false;
try {
    $otherService->archive((string)$bounty['code']);
} catch (RuntimeException $error) {
    $blocked = $error->getCode() === 403;
}
expect_true($blocked, 'Non-owner must not be able to archive another user bounty.');

$archived = $ownerService->archive((string)$bounty['code']);
expect_true(($archived['bounty']['status'] ?? '') === 'archived', 'Owner archive failed.');
expect_true(count($ownerService->board()['bounties'] ?? []) === 0, 'Archived bounty must leave active board.');
$ownerArchivedRecords = $ownerService->mine()['bounties'] ?? [];
expect_true(count($ownerArchivedRecords) === 1, 'Archiving must retain the bounty in the issuer owner records.');
expect_true(($ownerArchivedRecords[0]['status'] ?? '') === 'archived', 'Issuer owner record must show archived status.');

$otherRestoreBlocked = false;
try {
    $otherService->archive((string)$bounty['code'], true);
} catch (RuntimeException $error) {
    $otherRestoreBlocked = $error->getCode() === 403;
}
expect_true($otherRestoreBlocked, 'Non-owner must not be able to restore another user bounty.');

$restored = $ownerService->archive((string)$bounty['code'], true);
expect_true(($restored['bounty']['status'] ?? '') === 'active', 'Owner restore failed.');

$ownerDeleteBlocked = false;
try {
    $ownerService->adminDelete((string)$bounty['code']);
} catch (RuntimeException $error) {
    $ownerDeleteBlocked = $error->getCode() === 403;
}
expect_true($ownerDeleteBlocked, 'Bounty issuer must not be able to permanently delete a bounty; permanent deletion is admin-only.');

$adminService = new DniBounty($pdo, $db, $admin);
$adminService->adminDelete((string)$bounty['code']);
expect_true(count($ownerService->mine()['bounties'] ?? []) === 0, 'Admin permanent delete failed.');

$archiveAuditCount = (int)$pdo->query("SELECT COUNT(*) FROM dni_bounty_audit WHERE action='bounty.archive'")->fetchColumn();
$restoreAuditCount = (int)$pdo->query("SELECT COUNT(*) FROM dni_bounty_audit WHERE action='bounty.restore'")->fetchColumn();
expect_true($archiveAuditCount === 1, 'Owner archive must leave an audit record.');
expect_true($restoreAuditCount === 1, 'Owner restore must leave an audit record.');

$auditCount = (int)$pdo->query("SELECT COUNT(*) FROM dni_bounty_audit WHERE action='bounty.permanent_delete'")->fetchColumn();
expect_true($auditCount === 1, 'Permanent deletion must leave an audit record.');

echo "DNI bounty regression checks passed.\n";
