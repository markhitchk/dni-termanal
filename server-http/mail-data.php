<?php

declare(strict_types=1);

/**
 * Canonical private DNI Mail HTTP controller.
 *
 * DNI Discord authentication now persists active sessions in
 * data/dni_terminal.db and distinguishes organization members from Citizens.
 * The detector-aware implementation resolves both the authenticated account
 * class and the dedicated dni_citizen_users record before it chooses a mailbox
 * domain or mail capabilities. This keeps address selection and clearance
 * enforcement server-side:
 *
 *   member  -> username@dni.org
 *   citizen -> username@citizen.dni.org
 *
 * Citizen mail is limited to CL/NON direct mail. The implementation is kept in
 * a separate private file so the account/detection policy stays isolated from
 * the public compatibility controller and can be regression-tested directly.
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
require __DIR__ . '/mail-data-auto.php';
