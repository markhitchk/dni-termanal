<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-clearance.php';

const DNI_MAIL_MASTER_WELCOME_CODE = 'MAIL-000004';
const DNI_MAIL_MASTER_WELCOME_TAG = 'dni-master-welcome-v1';
const DNI_MAIL_LEGACY_NOTICE_CODES = ['MAIL-000001', 'MAIL-000002'];

function dni_mail_master_welcome_body(): string
{
    return <<<'TEXT'
WELCOME TO THE DREADNOUGHT IMPERIUM DATABASE NETWORK

Welcome, @{DISPLAY_NAME}.

Your access to the Dreadnought Imperium Database Network has been established.

Your DNI Mail identity is:

{DNI_MAIL_ADDRESS}

This address is assigned automatically from your authenticated DNI identity and account type.

DNI Terminal provides secure access to organization services, communications, DNI Mail, personnel resources, operational information, and other systems available to your account based on your permissions and clearance level.

NETWORK STATUS

The DNI Terminal is currently under active development.

Features, services, interfaces, and connected systems may receive updates or maintenance as development continues.

Important service notifications will be delivered through DNI Mail by the DNI AUTOMATED SYSTEM when maintenance is required, service availability changes, major updates are deployed, services are restored, or your account and access configuration requires an automated notification.

DNI MAIL SUPPORT CHANNELS

For general assistance:

general@support.dni.org

For bugs, technical problems, broken functionality, or DNI Terminal development issues:

dev@support.dni.org

For account permissions, access authorization, personnel information, clearance concerns, or administrative requests:

admin@support.dni.org

Support addresses automatically route messages to authorized DNI personnel responsible for that channel.

SECURITY AND ACCESS

Your DNI Terminal access is determined by your authenticated identity, organizational status, permissions, roles, and applicable clearance level.

Information outside your authorized access level will remain restricted.

Official automated DNI messages are sent from:

DNI AUTOMATED SYSTEM
system@dni.org

This identity is reserved for system-generated communications.

FEEDBACK

If you encounter incorrect information, unexpected behavior, or broken functionality, report it through the appropriate DNI Mail support channel or the official Dreadnought Imperium Discord support system.

DNI Terminal and its connected services are developed and maintained by DNI Services / HarleyTG.

Thank you for using the Dreadnought Imperium Database Network, @{DISPLAY_NAME}.

DNI AUTOMATED SYSTEM
system@dni.org

This is an automated DNI system message. Replies to this address are not monitored.
TEXT;
}

function dni_mail_master_welcome_canonical(): array
{
    return [
        'messageCode' => DNI_MAIL_MASTER_WELCOME_CODE,
        'messageType' => 'service_announcement',
        'audienceType' => 'all_members',
        'senderUserId' => 0,
        'senderLabel' => 'DNI AUTOMATED SYSTEM',
        'senderAccountType' => 'system',
        'subject' => 'Welcome to the Dreadnought Imperium Database Network',
        'body' => dni_mail_master_welcome_body(),
        'clearanceLevel' => DNI_CLEARANCE_CL_NON,
        'requiredPermissions' => [],
        'recipientUserIds' => [],
        'attachments' => [],
        'status' => 'sent',
        'systemTag' => DNI_MAIL_MASTER_WELCOME_TAG,
    ];
}

function dni_mail_master_welcome_is_current(array $message): bool
{
    $canonical = dni_mail_master_welcome_canonical();
    foreach ($canonical as $key => $value) {
        if (($message[$key] ?? null) !== $value) return false;
    }
    return true;
}

/**
 * Converge the authoritative SQLite-backed mail store on MAIL-000004.
 * Legacy MAIL-000001/2 are removed if they were persisted. The embedded mail
 * engine also carries immutable compatibility seeds for those codes, so the
 * response filter below suppresses those legacy seed records from both list
 * and direct-record responses without creating a second mail implementation.
 */
function dni_mail_master_welcome_sync(): void
{
    $db = dni_embedded_transaction();
    $needsWrite = false;

    foreach ((array)($db['mailMessages'] ?? []) as $message) {
        if (!is_array($message)) continue;
        $code = strtoupper(trim((string)($message['messageCode'] ?? '')));
        if (in_array($code, DNI_MAIL_LEGACY_NOTICE_CODES, true)) {
            $needsWrite = true;
            break;
        }
        if ($code === DNI_MAIL_MASTER_WELCOME_CODE && !dni_mail_master_welcome_is_current($message)) {
            $needsWrite = true;
            break;
        }
    }

    $hasMaster = false;
    foreach ((array)($db['mailMessages'] ?? []) as $message) {
        if (is_array($message) && strtoupper(trim((string)($message['messageCode'] ?? ''))) === DNI_MAIL_MASTER_WELCOME_CODE) {
            $hasMaster = true;
            break;
        }
    }
    if (!$hasMaster) $needsWrite = true;
    if (!$needsWrite) return;

    dni_embedded_transaction(function (array &$db): void {
        $messages = is_array($db['mailMessages'] ?? null) ? array_values($db['mailMessages']) : [];
        $createdAt = null;
        $sentAt = null;

        $messages = array_values(array_filter($messages, static function (mixed $message) use (&$createdAt, &$sentAt): bool {
            if (!is_array($message)) return true;
            $code = strtoupper(trim((string)($message['messageCode'] ?? '')));
            if ($code === DNI_MAIL_MASTER_WELCOME_CODE) {
                $createdAt = $message['createdAt'] ?? $createdAt;
                $sentAt = $message['sentAt'] ?? $sentAt;
                return false;
            }
            return !in_array($code, DNI_MAIL_LEGACY_NOTICE_CODES, true);
        }));

        $now = dni_embedded_now();
        $master = dni_mail_master_welcome_canonical();
        $master['createdAt'] = $createdAt ?: $now;
        $master['sentAt'] = $sentAt ?: $now;
        $messages[] = $master;
        $db['mailMessages'] = $messages;

        if (is_array($db['mailReceipts'] ?? null)) {
            $db['mailReceipts'] = array_values(array_filter($db['mailReceipts'], static function (mixed $receipt): bool {
                if (!is_array($receipt)) return true;
                $code = strtoupper(trim((string)($receipt['messageCode'] ?? '')));
                return !in_array($code, DNI_MAIL_LEGACY_NOTICE_CODES, true);
            }));
        }
    });
}

function dni_mail_master_welcome_code(array $message): string
{
    return strtoupper(trim((string)($message['message_code'] ?? $message['messageCode'] ?? $message['id'] ?? '')));
}

function dni_mail_master_welcome_personalize(array $message, array $identity): array
{
    if (dni_mail_master_welcome_code($message) !== DNI_MAIL_MASTER_WELCOME_CODE) return $message;

    $displayName = trim((string)($identity['name'] ?? ''));
    if ($displayName === '') $displayName = 'DNI User';
    $mailAddress = strtolower(trim((string)($identity['address'] ?? '')));
    if ($mailAddress === '') $mailAddress = 'unavailable@dni.org';

    $replace = static fn(string $text): string => str_replace(
        ['{DISPLAY_NAME}', '{DNI_MAIL_ADDRESS}'],
        [$displayName, $mailAddress],
        $text
    );

    if (array_key_exists('body', $message)) $message['body'] = $replace((string)$message['body']);
    if (array_key_exists('preview', $message)) $message['preview'] = $replace((string)$message['preview']);
    $message['from'] = 'DNI AUTOMATED SYSTEM';
    $message['from_name'] = 'DNI AUTOMATED SYSTEM';
    $message['from_address'] = 'system@dni.org';
    $message['from_account_type'] = 'system';
    $message['from_identity_type'] = 'system';
    return $message;
}

function dni_mail_master_welcome_filter_output(string $buffer): string
{
    if (!str_starts_with(ltrim($buffer), '{')) return $buffer;

    try {
        $payload = json_decode($buffer, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($payload) || empty($payload['ok']) || !is_array($payload['identity'] ?? null)) return $buffer;
        $identity = $payload['identity'];
        $action = strtolower(trim((string)($_GET['action'] ?? 'list')));

        if (is_array($payload['messages'] ?? null)) {
            $messages = [];
            foreach ($payload['messages'] as $message) {
                if (!is_array($message)) continue;
                if (in_array(dni_mail_master_welcome_code($message), DNI_MAIL_LEGACY_NOTICE_CODES, true)) continue;
                $messages[] = dni_mail_master_welcome_personalize($message, $identity);
            }
            $payload['messages'] = $messages;
        }

        if (is_array($payload['message'] ?? null)) {
            if (in_array(dni_mail_master_welcome_code($payload['message']), DNI_MAIL_LEGACY_NOTICE_CODES, true)) {
                if (in_array($action, ['record', 'mark-read'], true)) http_response_code(404);
                return json_encode(['ok' => false, 'error' => 'DNI Mail record not found.'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            }
            $payload['message'] = dni_mail_master_welcome_personalize($payload['message'], $identity);
        }

        return json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        error_log('[DNI Mail Master Welcome] ' . $error->getMessage());
        return $buffer;
    }
}

function dni_mail_begin_master_welcome_filter(): void
{
    static $started = false;
    if ($started) return;
    $started = true;
    ob_start('dni_mail_master_welcome_filter_output');
}
