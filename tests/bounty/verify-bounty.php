<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/server/php/dni-bounty.php';

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

$mine = $ownerService->mine();
expect_true(count($mine['bounties'] ?? []) === 1, 'Owner should see their bounty.');

$board = $ownerService->board();
expect_true(count($board['bounties'] ?? []) === 1, 'Active bounty should appear on board.');

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

$restored = $ownerService->archive((string)$bounty['code'], true);
expect_true(($restored['bounty']['status'] ?? '') === 'active', 'Owner restore failed.');

$adminService = new DniBounty($pdo, $db, $admin);
$adminService->adminDelete((string)$bounty['code']);
expect_true(count($ownerService->mine()['bounties'] ?? []) === 0, 'Admin permanent delete failed.');

$auditCount = (int)$pdo->query("SELECT COUNT(*) FROM dni_bounty_audit WHERE action='bounty.permanent_delete'")->fetchColumn();
expect_true($auditCount === 1, 'Permanent deletion must leave an audit record.');

echo "DNI bounty regression checks passed.\n";
