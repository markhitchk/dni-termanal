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
<html><head><title>StarCitizens - Roberts Space Industries</title></head><body>
<section>
  <div class="title">Profile</div>
  <div class="profile-body">
    <div class="thumb"><img src="/media/test-avatar/heap_infobox/StarCitizens.png" alt="StarCitizens"></div>
    <div class="info">
      <p><span class="value">Star Citizen</span></p>
      <p><span class="value">Pathfinder</span></p>
      <div class="entry"><span class="icon"><img src="/media/badge.png"></span></div>
    </div>
  </div>
</section>
<div><span class="label">UEE Citizen Record</span><span class="value">245359</span></div>
<div><span class="label">Handle name</span><span class="value">StarCitizens</span></div>
<section>
  <div class="title">Main organization</div>
  <div>
    <div class="thumb"><a><img src="/media/org/heap_infobox/IMPERIUM.png"></a></div>
    <a class="value data">Imperium</a>
    <div class="ranking"><span class="active"></span><span class="active"></span></div>
  </div>
</section>
<div><span class="label">Spectrum Identification (SID)</span><span class="value">IMPERIUM</span></div>
<div><span class="label">Organization rank</span><span class="value">SCB Affiliate</span></div>
<div><span class="label">Enlisted</span><span class="value">Sep 6, 2013</span></div>
<div><span class="label">Location</span><span class="value">United States, New Jersey</span></div>
<div><span class="label">Fluency</span><span class="value">English, French</span></div>
<div><span class="label">Website</span><span class="value">https://example.invalid</span></div>
<div><span class="label">Bio</span><div class="value">Citizen bio text.</div></div>
</body></html>
HTML;
$parsedProfile = dni_sc_api_parse_rsi_user_html($profileHtml, 'StarCitizens', 'https://robertsspaceindustries.com/citizens/StarCitizens');
sc_expect(($parsedProfile['profile']['handle'] ?? '') === 'StarCitizens', 'RSI citizen handle parsing failed.');
sc_expect((string)($parsedProfile['profile']['id'] ?? '') === '245359', 'RSI citizen record parsing failed.');
sc_expect(($parsedProfile['profile']['display'] ?? '') === 'Star Citizen', 'RSI citizen display parsing failed.');
sc_expect(($parsedProfile['profile']['image'] ?? '') === 'https://robertsspaceindustries.com/media/test-avatar/heap_infobox/StarCitizens.png', 'RSI citizen Profile-thumb image selector mismatch.');
sc_expect(str_contains((string)($parsedProfile['profile']['image_proxy'] ?? ''), '/api/sc-image.php?url='), 'RSI citizen image proxy missing.');
sc_expect(($parsedProfile['organization']['sid'] ?? '') === 'IMPERIUM', 'RSI main organization parsing failed.');
sc_expect(($parsedProfile['organization']['rank'] ?? '') === 'SCB Affiliate', 'RSI organization rank parsing failed.');
sc_expect((int)($parsedProfile['organization']['stars'] ?? 0) === 2, 'RSI organization stars parsing failed.');
sc_expect(($parsedProfile['profile']['location']['country'] ?? '') === 'United States', 'RSI citizen country parsing failed.');
sc_expect(($parsedProfile['profile']['location']['region'] ?? '') === 'New Jersey', 'RSI citizen region parsing failed.');
sc_expect(($parsedProfile['profile']['bio'] ?? '') === 'Citizen bio text.', 'RSI citizen bio parsing failed.');

$orgPageHtml = <<<'HTML'
<html><head><title>The Organization [ORG]</title></head><body>
<div id="organization"><h1>The Organization / </h1></div>
<div class="logo noshadow"><img src="/media/org/logo.png"></div>
<div class="primary tooltip-wrap"><img src="/media/focus-primary.png" alt="Bounty Hunting"></div>
<div class="secondary tooltip-wrap"><img src="/media/focus-secondary.png" alt="Security"></div>
<div class="banner"><img src="/media/org/banner.png"></div>
<div class="body markitup-text">Organization headline</div>
<div id="tab-history"><div>History text</div></div>
<div id="tab-manifesto"><div>Manifesto text</div></div>
<div id="tab-charter"><div>Charter text</div></div>
</body></html>
HTML;
$parsedOrgPage = dni_sc_api_parse_rsi_organization_page($orgPageHtml, 'ORG', 'https://robertsspaceindustries.com/orgs/ORG');
sc_expect(($parsedOrgPage['sid'] ?? '') === 'ORG', 'RSI organization SID parsing failed.');
sc_expect(($parsedOrgPage['name'] ?? '') === 'The Organization', 'RSI organization page name parsing failed.');
sc_expect(($parsedOrgPage['focus']['primary']['name'] ?? '') === 'Bounty Hunting', 'RSI primary focus parsing failed.');
sc_expect(($parsedOrgPage['headline']['plaintext'] ?? '') === 'Organization headline', 'RSI organization headline parsing failed.');

$orgSearchHtml = <<<'HTML'
<div class="org-cell">
  <a href="/orgs/ORG">
    <div class="left">
      <div class="thumb"><img src="/media/org/search-logo.png"></div>
      <div class="identity"><div class="symbol">ORG</div><div class="name">The Organization</div></div>
    </div>
    <div class="right">
      <div class="infocontainer">
        <div class="infoitem"><div class="value">Corporation</div></div>
        <div class="infoitem"><div class="value">English</div></div>
        <div class="infoitem"><div class="value">Hardcore</div></div>
      </div>
      <div class="infocontainer">
        <div class="infoitem"><div class="value">Yes</div></div>
        <div class="infoitem"><div class="value">No</div></div>
        <div class="infoitem"><div class="value">44</div></div>
      </div>
    </div>
  </a>
</div>
HTML;
$parsedOrgSearch = dni_sc_api_parse_rsi_org_search_html($orgSearchHtml, 'ORG');
sc_expect(is_array($parsedOrgSearch), 'RSI organization search row parsing failed.');
sc_expect(($parsedOrgSearch['sid'] ?? '') === 'ORG', 'RSI organization search SID mismatch.');
sc_expect(($parsedOrgSearch['archetype'] ?? '') === 'Corporation', 'RSI organization archetype parsing failed.');
sc_expect(($parsedOrgSearch['recruiting'] ?? false) === true, 'RSI organization recruiting parsing failed.');
sc_expect((int)($parsedOrgSearch['members'] ?? 0) === 44, 'RSI organization member count parsing failed.');

$membersHtml = <<<'HTML'
<div class="member-item">
  <div class="nick">Agent-Omicron</div>
  <div class=" name">Agent Omicron</div>
  <div class="stars" style="width: 80%"></div>
  <div class="rank">Agent</div>
  <ul class="rolelist"><li>Recruitment</li><li>Operations</li></ul>
  <img src="/media/member1.png">
</div>
<div class="member-item">
  <div class="nick">Grysage</div>
  <div class=" name">Grysage</div>
  <div class="stars" style="width: 40%"></div>
  <div class="rank">Informant</div>
  <ul class="rolelist"><li>Intel</li></ul>
  <img src="/media/member2.png">
</div>
HTML;
$parsedMembers = dni_sc_api_parse_rsi_org_members_html($membersHtml);
sc_expect(count($parsedMembers) === 2, 'RSI organization member list parsing failed.');
sc_expect(($parsedMembers[0]['handle'] ?? '') === 'Agent-Omicron', 'RSI organization member handle parsing failed.');
sc_expect(($parsedMembers[0]['display'] ?? '') === 'Agent Omicron', 'RSI organization member display parsing failed.');
sc_expect((int)($parsedMembers[0]['stars'] ?? 0) === 4, 'RSI organization member stars parsing failed.');
sc_expect(($parsedMembers[0]['rank'] ?? '') === 'Agent', 'RSI organization member rank parsing failed.');
sc_expect(($parsedMembers[0]['roles'] ?? []) === ['Recruitment','Operations'], 'RSI organization member roles parsing failed.');

sc_expect(dni_sc_api_absolute_rsi_url('https://media.robertsspaceindustries.com/test/source.webp') !== null, 'RSI media subdomain must be allowed.');
sc_expect(dni_sc_api_absolute_rsi_url('https://example.com/not-rsi.png') === null, 'Non-RSI image hosts must be rejected.');

$source = (string)file_get_contents(dirname(__DIR__, 2) . '/server/php/dni-sc-api.php');
sc_expect(str_contains($source, 'https://robertsspaceindustries.com'), 'RSI public website origin missing.');
sc_expect(!str_contains($source, 'api.starcitizen-api.com'), 'DNI backend must not depend on StarCitizen-API.');
sc_expect(!str_contains($source, 'DNI_SC_API_UPSTREAM_KEY'), 'DNI backend must not require a StarCitizen-API upstream key.');

echo "DNI Star Citizen API compatibility tests passed.\n";
