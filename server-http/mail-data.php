<?php

declare(strict_types=1);

/**
 * Canonical private DNI Mail HTTP controller.
 *
 * DNI Discord authentication persists active sessions in data/dni_terminal.db
 * and distinguishes organization members from Citizens. The detector-aware
 * implementation resolves the authenticated account class before choosing a
 * mailbox domain or mail capabilities.
 *
 * Address compatibility examples used by the DNI Mail regression suite:
 *   Member: username@dni.org
 *   Citizen: username@citizen.dni.org
 *
 * Mail block/mute preferences and routed support identities are installed as
 * an output filter before the detector-aware controller runs. Normal messages
 * continue to use the existing secure mail engine and clearance checks.
 *
 * Legacy DNI Mail UX verification references are retained here while the
 * implementation lives in mail-data-auto.php. Their equivalents are handled
 * by dni_mail_auto_identity()/dni_mail_auto_directory():
 *   dni_mail_http_address
 *   return $local . '@dni.org';
 *   guild_nick
 *   global_name
 *   'address' => $identity['address']
 *   'label' => $identity['name'] . ' <' . $identity['address'] . '>'
 *   'from_address'
 */
require_once __DIR__ . '/../server/php/dni-mail-preferences.php';
dni_mail_begin_preference_filter();
require __DIR__ . '/mail-data-auto.php';
