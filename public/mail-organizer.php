<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni-mail-web-push-hook.php';
dni_mail_web_push_begin_delivery_hook();

/* DNI Mail organized folders / Send All compatibility controller. */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);