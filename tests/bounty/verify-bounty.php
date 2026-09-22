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
    'discordUserId' => '123456789012345678',
    'avatarHash' => 'avatarhashone',
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
    'discordUserId' => '223456789012345678',
    'avatarHash' => 'avatarhashtwo',
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
    ($bounty['issuerAvatarUrl'] ?? '') === 'https://cdn.discordapp.com/avatars/123456789012345678/avatarhashone.png?size=128',
    'Bounty issuer avatar should be derived from the connected Discord account.'
);
expect_true(
    ($bounty['url'] ?? '') === '/bounty/?code=' . rawurlencode((string)($bounty['code'] ?? '')),
    'Bounty detail URL must use the clean deploy-safe physical /bounty/ route.'
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

$selfClaimBlocked = false;
try {
    $ownerService->submitClaim((string)$bounty['code'], [
        'proofSummary' => 'Issuer attempting to claim own bounty.',
        'proofUrl' => 'https://example.com/proof/self',
    ]);
} catch (RuntimeException $error) {
    $selfClaimBlocked = $error->getCode() === 409;
}
expect_true($selfClaimBlocked, 'Bounty issuer must not be able to claim their own bounty.');

$missingProofBlocked = false;
try {
    $otherService->submitClaim((string)$bounty['code'], [
        'proofSummary' => 'Claim without an evidence link.',
        'proofUrl' => '',
    ]);
} catch (RuntimeException $error) {
    $missingProofBlocked = $error->getCode() === 422;
}
expect_true($missingProofBlocked, 'A bounty claim must require a proof link.');

$claimPayload = $otherService->submitClaim((string)$bounty['code'], [
    'proofSummary' => 'Screenshot and combat log show the contract target was completed.',
    'proofUrl' => 'https://example.com/proof/raven-01',
]);
$claimRows = $claimPayload['bounty']['claims'] ?? [];
expect_true(count($claimRows) === 1, 'Claimant should see their submitted bounty claim.');
$claim = $claimRows[0];
expect_true(($claim['status'] ?? '') === 'pending', 'New bounty claim should be pending issuer review.');
expect_true(($claim['proofUrl'] ?? '') === 'https://example.com/proof/raven-01', 'Claim proof URL was not retained.');
expect_true(
    ($claim['claimantAvatarUrl'] ?? '') === 'https://cdn.discordapp.com/avatars/223456789012345678/avatarhashtwo.png?size=128',
    'Claimant avatar should be derived from the connected Discord account.'
);

$duplicateClaimBlocked = false;
try {
    $otherService->submitClaim((string)$bounty['code'], [
        'proofSummary' => 'Duplicate pending proof.',
        'proofUrl' => 'https://example.com/proof/duplicate',
    ]);
} catch (RuntimeException $error) {
    $duplicateClaimBlocked = $error->getCode() === 409;
}
expect_true($duplicateClaimBlocked, 'A user must not be able to create duplicate pending claims for one bounty.');

$claimantReviewBlocked = false;
try {
    $otherService->reviewClaim((int)$claim['id'], 'approved');
} catch (RuntimeException $error) {
    $claimantReviewBlocked = $error->getCode() === 403;
}
expect_true($claimantReviewBlocked, 'Claimant must not be able to approve their own claim.');

$issuerDetail = $ownerService->detail((string)$bounty['code']);
$issuerClaims = $issuerDetail['bounty']['claims'] ?? [];
expect_true(count($issuerClaims) === 1, 'Bounty issuer should see the claim review queue.');
expect_true(($issuerDetail['bounty']['claimReviewAllowed'] ?? false) === true, 'Issuer should be allowed to review claims.');

$guestClaimDetail = $guestService->detail((string)$bounty['code']);
expect_true(count($guestClaimDetail['bounty']['claims'] ?? []) === 0, 'Public bounty viewers must not receive private claim proof.');

$approvedClaimPayload = $ownerService->reviewClaim((int)$claim['id'], 'approved', 'Proof accepted.');
expect_true(($approvedClaimPayload['bounty']['status'] ?? '') === 'archived', 'Approved claim should archive the bounty as resolved.');
expect_true(($approvedClaimPayload['bounty']['approvedClaim'] ?? false) === true, 'Approved claim state should be exposed on the bounty detail.');
expect_true(($approvedClaimPayload['bounty']['claims'][0]['status'] ?? '') === 'approved', 'Approved claim should retain its approved status.');

$claimantArchivedDetail = $otherService->detail((string)$bounty['code']);
expect_true(($claimantArchivedDetail['bounty']['claims'][0]['status'] ?? '') === 'approved', 'Claimant should retain access to their approved proof history.');

$archivedClaimBlocked = false;
try {
    $otherService->submitClaim((string)$bounty['code'], [
        'proofSummary' => 'Cannot claim a resolved bounty.',
        'proofUrl' => 'https://example.com/proof/late',
    ]);
} catch (RuntimeException $error) {
    $archivedClaimBlocked = $error->getCode() === 409;
}
expect_true($archivedClaimBlocked, 'Archived/resolved bounties must not accept new claims.');

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
$claimSubmitAuditCount = (int)$pdo->query("SELECT COUNT(*) FROM dni_bounty_audit WHERE action='bounty.claim.submit'")->fetchColumn();
$claimApproveAuditCount = (int)$pdo->query("SELECT COUNT(*) FROM dni_bounty_audit WHERE action='bounty.claim.approved'")->fetchColumn();
expect_true($archiveAuditCount === 1, 'Owner archive must leave an audit record.');
expect_true($restoreAuditCount === 1, 'Owner restore must leave an audit record.');
expect_true($claimSubmitAuditCount === 1, 'Claim submission must leave an audit record.');
expect_true($claimApproveAuditCount === 1, 'Claim approval must leave an audit record.');

$auditCount = (int)$pdo->query("SELECT COUNT(*) FROM dni_bounty_audit WHERE action='bounty.permanent_delete'")->fetchColumn();
expect_true($auditCount === 1, 'Permanent deletion must leave an audit record.');

echo "DNI bounty regression checks passed.\n";
