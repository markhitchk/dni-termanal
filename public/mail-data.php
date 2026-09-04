<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni-mail-web-push-hook.php';
dni_mail_web_push_begin_delivery_hook();

/*
 * Public compatibility controller.
 * The implementation lives outside Apache's public/ DocumentRoot in server-http/.
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);