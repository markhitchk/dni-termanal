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

$versionsRoute = dni_sc_api_wiki_route('versions', []);
sc_expect(is_array($versionsRoute), 'Keyless versions provider route missing.');
sc_expect(($versionsRoute['path'] ?? '') === '/api/game-versions', 'Versions provider path mismatch.');

$shipsRoute = dni_sc_api_wiki_route('ships', ['name' => 'Carrack']);
sc_expect(is_array($shipsRoute), 'Keyless ships provider route missing.');
sc_expect(($shipsRoute['path'] ?? '') === '/api/vehicles', 'Ships provider path mismatch.');
sc_expect(($shipsRoute['params']['filter[name]'] ?? '') === 'Carrack', 'Ship-name provider filter mismatch.');

$systemsRoute = dni_sc_api_wiki_route('starmap/systems', []);
sc_expect(($systemsRoute['path'] ?? '') === '/api/starsystems', 'Starmap systems provider path mismatch.');

$locationsRoute = dni_sc_api_wiki_route('locations', ['system' => 'Stanton System']);
sc_expect(($locationsRoute['path'] ?? '') === '/api/locations', 'Locations provider path mismatch.');
sc_expect(($locationsRoute['params']['filter[system]'] ?? '') === 'Stanton System', 'Locations provider system filter mismatch.');

$versions = dni_sc_api_transform_wiki('versions', [
    'data' => [
        ['code' => '4.8.0-LIVE.11825000'],
        ['code' => '4.7.0-LIVE.11518367'],
    ],
], []);
sc_expect($versions === ['4.8.0-LIVE.11825000','4.7.0-LIVE.11518367'], 'Version transform mismatch.');

$ships = dni_sc_api_transform_wiki('ships', [
    'data' => [[
        'uuid' => 'ship-1',
        'name' => 'Carrack',
        'classification' => 'exploration',
        'cargo_capacity' => 456,
        'crew' => ['min' => 4, 'max' => 6],
        'dimensions' => ['length' => 126, 'width' => 76.5, 'height' => 30],
    ]],
], ['name' => 'Carrack']);
sc_expect(count($ships) === 1, 'Ship transform should return one record.');
sc_expect(($ships[0]['name'] ?? '') === 'Carrack', 'Ship transform name mismatch.');
sc_expect((int)($ships[0]['cargocapacity'] ?? 0) === 456, 'Ship transform cargo mismatch.');

sc_expect(dni_sc_api_wiki_route('roadmap/starcitizen', []) === null, 'Roadmap is not provided by the game-data provider.');

sc_expect(function_exists('dni_sc_api_rsi_user'), 'RSI citizen parser/request function missing.');
sc_expect(function_exists('dni_sc_api_rsi_organization'), 'RSI organization parser/request function missing.');
sc_expect(function_exists('dni_sc_api_rsi_org_members'), 'RSI organization member parser/request function missing.');
sc_expect(function_exists('dni_sc_api_rsi_request'), 'RSI resource dispatcher missing.');
sc_expect(function_exists('dni_sc_api_provider_request'), 'DNI provider dispatcher missing.');

$profileHtml = <<<'HTML'
<html><head><title>Citizen Test</title><meta property="og:image" content="https://robertsspaceindustries.com/media/avatar.png"></head><body>
<h1>CITIZEN DOSSIER</h1>
<div>UEE Citizen Record #245359</div>
<div>Profile</div><div>Star Citizen</div>
<div>Handle name</div><div>StarCitizens</div>
<div>Main organization</div><div>Imperium</div>
<div>Spectrum Identification (SID)</div><div>IMPERIUM</div>
<div>Organization rank</div><div>SCB Affiliate</div>
<div>Enlisted</div><div>Sep 6, 2013</div>
<div>Location</div><div>United States , New Jersey</div>
<div>Fluency</div><div>English</div>
</body></html>
HTML;
$parsedProfile = dni_sc_api_parse_rsi_user_html($profileHtml, 'StarCitizens', 'https://robertsspaceindustries.com/en/citizens/StarCitizens');
sc_expect(($parsedProfile['profile']['handle'] ?? '') === 'StarCitizens', 'RSI citizen handle parsing failed.');
sc_expect((int)($parsedProfile['profile']['id'] ?? 0) === 245359, 'RSI citizen record parsing failed.');
sc_expect(($parsedProfile['organization']['sid'] ?? '') === 'IMPERIUM', 'RSI main organization parsing failed.');

$orgHtml = <<<'HTML'
<html><head><title>The Organization [ORG]</title></head><body>
<div>44 members</div><h1>The Organization / ORG</h1>
<div>Corporation</div><div>Hardcore</div><div>Role play</div><div>Exclusive</div>
</body></html>
HTML;
$parsedOrg = dni_sc_api_parse_rsi_organization_html($orgHtml, 'ORG', 'https://robertsspaceindustries.com/en/orgs/ORG');
sc_expect(($parsedOrg['sid'] ?? '') === 'ORG', 'RSI organization SID parsing failed.');
sc_expect(($parsedOrg['name'] ?? '') === 'The Organization', 'RSI organization name parsing failed.');
sc_expect((int)($parsedOrg['members'] ?? 0) === 44, 'RSI organization member count parsing failed.');

$membersHtml = <<<'HTML'
<html><body>
<div class="member"><a href="/en/citizens/Agent-Omicron">Agent-Omicron</a><span>Agent</span></div>
<div class="member"><a href="/en/citizens/Grysage">Grysage</a><span>Informant</span></div>
</body></html>
HTML;
$parsedMembers = dni_sc_api_parse_rsi_org_members_html($membersHtml);
sc_expect(count($parsedMembers) === 2, 'RSI organization member list parsing failed.');
sc_expect(($parsedMembers[0]['handle'] ?? '') === 'Agent-Omicron', 'RSI organization member handle parsing failed.');

$source = (string)file_get_contents(dirname(__DIR__, 2) . '/server/php/dni-sc-api.php');
sc_expect(str_contains($source, 'https://robertsspaceindustries.com'), 'RSI public website origin missing.');
sc_expect(!str_contains($source, 'api.starcitizen-api.com'), 'DNI backend must not depend on StarCitizen-API.');
sc_expect(!str_contains($source, 'DNI_SC_API_UPSTREAM_KEY'), 'DNI backend must not require a StarCitizen-API upstream key.');

echo "DNI Star Citizen API compatibility tests passed.\n";
