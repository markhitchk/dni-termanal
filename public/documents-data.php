<?php

declare(strict_types=1);

/*
 * Public compatibility controller.
 * The implementation lives outside Apache's public/ DocumentRoot in server-http/.
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
