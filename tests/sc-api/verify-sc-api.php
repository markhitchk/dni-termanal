<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/server/php/dni-sc-api.php';

function sc_expect(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$ok = dni_sc_api_envelope(['test' => true], 'dni');
sc_expect(($ok['message'] ?? '') === 'ok', 'Envelope message must match StarCitizen-API v1.');
sc_expect(($ok['success'] ?? 0) === 1, 'Envelope success must be numeric 1.');
sc_expect(($ok['source'] ?? '') === 'dni', 'Envelope source missing.');
sc_expect(dni_sc_api_key_allowed('public'), 'Public compatibility API key must remain available.');
sc_expect(dni_sc_api_key_allowed('internal'), 'Internal first-party API route must not require an API key.');

$docs = dni_sc_api_docs();
$routes = (array)($docs['routes'] ?? []);
foreach ([
    'user/{handle}',
    'organization/{sid}',
    'organization_members/{sid}',
    'versions',
    'ships',
    'roadmap/{board}',
    'progress-tracker',
    'progress-tracker/{team_slug}',
    'stats',
    'telemetry/{version}',
    'starmap/systems',
    'starmap/tunnels',
    'starmap/species',
    'starmap/affiliations',
    'starmap/object',
    'starmap/star-system',
    'starmap/search',
    'bounties',
    'bounty/{code}',
] as $route) {
    sc_expect(in_array($route, $routes, true), 'Missing compatibility route: ' . $route);
}

sc_expect(in_array('live', DNI_SC_API_MODES, true), 'live mode missing.');
sc_expect(in_array('cache', DNI_SC_API_MODES, true), 'cache mode missing.');
sc_expect(in_array('auto', DNI_SC_API_MODES, true), 'auto mode missing.');
sc_expect(in_array('eager', DNI_SC_API_MODES, true), 'eager mode missing.');

echo "DNI Star Citizen API compatibility tests passed.\n";
