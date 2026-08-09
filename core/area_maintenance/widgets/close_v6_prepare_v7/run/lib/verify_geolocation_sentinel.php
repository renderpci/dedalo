<?php declare(strict_types=1);
/**
* VERIFY_GEOLOCATION_SENTINEL
*
* Exercises v6_to_v7_normalize::geolocation_value() and its predicates over synthetic
* values. CLI only, offline: it boots NO engine, opens NO database and reads NO real data.
*
* WHY IT EXISTS AND WHY IT LOOKS LIKE THIS
* The migration package has no test harness (the host v6 phpunit suite covers the host
* engine, needs a live server and never touches core/base/upgrade/). The geolocation repair
* decides, per item, between dropping a coordinate and AUTHORING one, over records of
* hand-drawn geometry — so it is not something to ship on a code read. Its predicates are
* pure, which is what makes this possible without a database.
*
* The class's only external dependency is json_handler::encode (used by the finding
* sample), so a five-line shim is enough to load it standalone.
*
* The cases mirror, one for one, the v7-side gate
* (v7 test/unit/geolocation_sentinel_repair.test.ts) that pins the SAME law on the other
* side of the migration. A verdict that differs between the two is a silent divergence.
*
* Usage:  php run/lib/verify_geolocation_sentinel.php
* Exit:   0 = every case passed · 1 = at least one failed
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/

if (PHP_SAPI !== 'cli') {
	die('CLI only');
}

// Minimal stand-in for engine/core/db/class.json_handler.php: the ONLY thing
// v6_to_v7_normalize needs from the engine (finding samples are encoded with it).
if (!class_exists('json_handler')) {
	class json_handler {
		public static function encode(mixed $value) : string|false {
			return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		}
	}
}

require_once dirname(__DIR__, 2) . '/engine/core/base/upgrade/class.v6_to_v7_normalize.php';


$failed	= 0;
$passed	= 0;

/**
* CHECK
* One assertion. Values are compared by their JSON rendering, so a float, an object and a
* nested list all report readably when they differ.
*/
function check(string $name, mixed $expected, mixed $actual) : void {

	global $failed, $passed;

	$a = json_encode($expected);
	$b = json_encode($actual);
	if ($a === $b) {
		$passed++;
		echo "  ok    $name\n";
	}else{
		$failed++;
		echo "  FAIL  $name\n        expected: $a\n        actual:   $b\n";
	}
}

/**
* ITEMS
* Decodes a JSON list into the exact shape json_decode hands the migration: stdClass
* objects for maps, plain arrays for lists.
*/
function items(string $json) : array {

	return (array)json_decode($json, false, 512, JSON_THROW_ON_ERROR);
}

/**
* LAYERS
* One lib_data layer holding a FeatureCollection of the given geometry JSON fragments.
*/
function layers(string ...$geometries) : string {

	$features = [];
	foreach ($geometries as $geometry) {
		$features[] = '{"type":"Feature","geometry":' . $geometry . '}';
	}

	return '"lib_data":[{"layer_data":{"type":"FeatureCollection","features":['
		. implode(',', $features) . ']}}]';
}

/**
* RUN
* Drives one adjudication end to end: reset, adjudicate on a NESTED response (as
* migrate_component_data does), then merge into a top-level one (as
* process_matrix_row_data does) and read the aggregated report.
*
* @return array{value:?array, codes:array<string,int>, severities:array<string,string>,
*               groups:int, errors:int, msgs:array<string,string>}
*/
function run(?string $model, array $items, bool $auto_fix = true, array $extra_calls = []) : array {

	v6_to_v7_normalize::reset();
	v6_to_v7_normalize::$auto_fix = $auto_fix;

	$ctx = [
		'section_tipo'	=> 'rsc167',
		'section_id'	=> 42,
		'tipo'			=> 'rsc900',
		'model'			=> $model,
		'stored_model'	=> null
	];

	$top = (object)['errors' => [], 'findings' => []];

	$value = null;
	foreach (array_merge([$items], $extra_calls) as $index => $call_items) {
		$nested = (object)['errors' => [], 'findings' => []];
		$result = v6_to_v7_normalize::geolocation_value($model, $call_items, $ctx, $nested);
		if ($index === 0) {
			$value = $result;
		}
		v6_to_v7_normalize::merge($top, $nested, 'matrix');
	}

	$report		= v6_to_v7_normalize::get_report();
	$codes		= [];
	$severities	= [];
	$msgs		= [];
	foreach ($report->groups as $group) {
		$codes[$group->code]		= $group->count;
		$severities[$group->code]	= $group->severity;
		$msgs[$group->code]			= $group->msg;
	}

	return [
		'value'			=> $value,
		'codes'			=> $codes,
		'severities'	=> $severities,
		'groups'		=> count($report->groups),
		'errors'		=> count($top->errors),
		'msgs'			=> $msgs
	];
}

const SENTINEL		= '"lat":39.462571,"lon":-0.376295';
const GEO_MODEL		= 'component_geolocation';


echo "verify_geolocation_sentinel — offline, no database\n\n";


echo "coord_key — the stored-coordinate normalization (mixed string/number)\n";
check('number form of the sentinel lat',	'39.462571',	v6_to_v7_normalize::coord_key(39.462571));
check('string form',						'39.462571',	v6_to_v7_normalize::coord_key('39.462571'));
check('comma decimal',						'39.462571',	v6_to_v7_normalize::coord_key('39,462571'));
check('padded string',						'39.462571',	v6_to_v7_normalize::coord_key(' 39.462571 '));
check('sentinel lon, number',				'-0.376295',	v6_to_v7_normalize::coord_key(-0.376295));
check('sentinel lon, comma decimal',		'-0.376295',	v6_to_v7_normalize::coord_key('-0,376295'));
check('0 is a coordinate (number)',			'0',			v6_to_v7_normalize::coord_key(0));
check('0 is a coordinate (string)',			'0',			v6_to_v7_normalize::coord_key('0'));
check('-0 folds onto 0',					'0',			v6_to_v7_normalize::coord_key('-0'));
check('0.0 folds onto 0',					'0',			v6_to_v7_normalize::coord_key('0.0'));
check('whole number carries no float mark',	'20',			v6_to_v7_normalize::coord_key(20.0));
check('null is absent',						null,			v6_to_v7_normalize::coord_key(null));
check('empty string is absent',				null,			v6_to_v7_normalize::coord_key(''));
check('blank string is absent',				null,			v6_to_v7_normalize::coord_key('   '));
check('non-numeric text is absent',			null,			v6_to_v7_normalize::coord_key('abc'));
check('trailing garbage is absent',			null,			v6_to_v7_normalize::coord_key('12abc'));
check('multi-comma text is absent',			null,			v6_to_v7_normalize::coord_key('3,1,4'));
check('true is NOT coordinate 1',			null,			v6_to_v7_normalize::coord_key(true));
check('array is absent',					null,			v6_to_v7_normalize::coord_key([1, 2]));
check('NAN is absent',						null,			v6_to_v7_normalize::coord_key(NAN));
check('INF is absent',						null,			v6_to_v7_normalize::coord_key(INF));


echo "\nis_sentinel_centred\n";
check('numbers',		true,	v6_to_v7_normalize::is_sentinel_centred(json_decode('{' . SENTINEL . '}')));
check('strings',		true,	v6_to_v7_normalize::is_sentinel_centred(json_decode('{"lat":"39.462571","lon":"-0.376295"}')));
check('comma decimals',	true,	v6_to_v7_normalize::is_sentinel_centred(json_decode('{"lat":"39,462571","lon":"-0,376295"}')));
check('one axis off',	false,	v6_to_v7_normalize::is_sentinel_centred(json_decode('{"lat":39.462571,"lon":-0.376296}')));
check('lat only',		false,	v6_to_v7_normalize::is_sentinel_centred(json_decode('{"lat":39.462571}')));
check('empty item',		false,	v6_to_v7_normalize::is_sentinel_centred(json_decode('{}')));
check('0/0',			false,	v6_to_v7_normalize::is_sentinel_centred(json_decode('{"lat":0,"lon":0}')));


echo "\nhas_drawn_geometry\n";
check('non-empty FeatureCollection',	true,	v6_to_v7_normalize::has_drawn_geometry(json_decode('{' . layers('{"type":"Point","coordinates":[1,2]}') . '}')));
check('layer_data null is NOT geometry',false,	v6_to_v7_normalize::has_drawn_geometry(json_decode('{"lib_data":[{"layer_data":null}]}')));
check('empty feature list',				false,	v6_to_v7_normalize::has_drawn_geometry(json_decode('{"lib_data":[{"layer_data":{"type":"FeatureCollection","features":[]}}]}')));
check('empty lib_data',					false,	v6_to_v7_normalize::has_drawn_geometry(json_decode('{"lib_data":[]}')));
check('no lib_data',					false,	v6_to_v7_normalize::has_drawn_geometry(json_decode('{}')));


echo "\nderive_centre_from_geometry — the ENGINE-AUTHORED coordinate\n";
check(
	'a single Point derives to EXACTLY itself, unrounded',
	['lat' => 41.858199, 'lon' => 3.14754],
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{' . layers('{"type":"Point","coordinates":[3.14754,41.858199]}') . '}'))
);
check(
	'a Point with more decimals than the rounding step stays exact',
	['lat' => 41.9876543219, 'lon' => 3.1234567891],
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{' . layers('{"type":"Point","coordinates":[3.1234567891,41.9876543219]}') . '}'))
);
check(
	'a LineString derives the bbox centre, not the vertex mean',
	['lat' => 20.0, 'lon' => 5.0],
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{' . layers('{"type":"LineString","coordinates":[[0,0],[10,0],[0,40]]}') . '}'))
);
check(
	'a Polygon ring derives its bbox centre',
	['lat' => 41.0, 'lon' => 3.0],
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{' . layers('{"type":"Polygon","coordinates":[[[2,40],[4,40],[4,42],[2,42],[2,40]]]}') . '}'))
);
check(
	'a MultiPolygon spans every ring of every polygon',
	['lat' => 5.0, 'lon' => 5.0],
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{' . layers('{"type":"MultiPolygon","coordinates":[[[[0,0],[2,0],[2,2],[0,0]]],[[[8,8],[10,8],[10,10],[8,8]]]]}') . '}'))
);
check(
	'a GeometryCollection is walked',
	['lat' => 4.0, 'lon' => 2.0],
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{' . layers('{"type":"GeometryCollection","geometries":[{"type":"Point","coordinates":[0,0]},{"type":"Point","coordinates":[4,8]}]}') . '}'))
);
check(
	'the bbox spans ALL features across ALL layers',
	['lat' => 10.0, 'lon' => 5.0],
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{"lib_data":[{"layer_data":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[0,0]}}]}},{"layer_data":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[10,20]}}]}}]}'))
);
check(
	'an odd centre is rounded to 6 decimals (~0.1 m)',
	['lat' => 0.071429, 'lon' => 0.166667],
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{' . layers('{"type":"LineString","coordinates":[[0,0],[' . (1 / 3) . ',' . (1 / 7) . ']]}') . '}'))
);
check(
	'string positions are read the same way stored coordinates are',
	[[3.14754, 41.858199]],
	v6_to_v7_normalize::item_positions(json_decode('{' . layers('{"type":"Point","coordinates":["3,14754","41,858199"]}') . '}'))
);
check(
	'empty coordinates derive NOTHING',
	null,
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{' . layers('{"type":"Point","coordinates":[]}') . '}'))
);
check(
	'unparseable coordinates derive NOTHING',
	null,
	v6_to_v7_normalize::derive_centre_from_geometry(json_decode('{' . layers('{"type":"Point","coordinates":["x","y"]}') . '}'))
);


echo "\ngeolocation_value — CLEAR: the bare fabricated centre is dropped\n";
$case = run(GEO_MODEL, items('[{' . SENTINEL . ',"zoom":9,"alt":16}]'));
check('value becomes an empty list',	[],								$case['value']);
check('one finding, counted once',		['GEOLOCATION_FABRICATED_CENTRE' => 1],	$case['codes']);
check('severity is fixed',				'fixed',						$case['severities']['GEOLOCATION_FABRICATED_CENTRE'] ?? null);
check('nothing reaches ->errors',		0,								$case['errors']);
echo '        msg: ' . ($case['msgs']['GEOLOCATION_FABRICATED_CENTRE'] ?? '') . "\n";

$case = run(GEO_MODEL, items('[{"lat":"39.462571","lon":"-0.376295"}]'));
check('string-typed sentinel is dropped too',	[], $case['value']);
$case = run(GEO_MODEL, items('[{"lat":"39,462571","lon":"-0,376295"}]'));
check('comma-decimal sentinel is dropped too',	[], $case['value']);
$case = run(GEO_MODEL, items('[{' . SENTINEL . ',"lib_data":[{"layer_data":null}]}]'));
check('layer_data:null is bare, not geometry',	[], $case['value']);
$case = run(GEO_MODEL, items('[{' . SENTINEL . ',"lib_data":[{"layer_data":{"type":"FeatureCollection","features":[]}}]}]'));
check('an empty feature list is bare too',		[], $case['value']);
$case = run(GEO_MODEL, items('[{' . SENTINEL . '},{' . SENTINEL . ',"zoom":4}]'));
check('an all-fabricated list drops entirely',	[], $case['value']);
check('counted per ITEM, one group',			['GEOLOCATION_FABRICATED_CENTRE' => 2], $case['codes']);


echo "\ngeolocation_value — DERIVE: framing replaced by the centre of the drawn work\n";
$case = run(GEO_MODEL, items('[{"id":7,' . SENTINEL . ',"zoom":13,"alt":null,' . layers('{"type":"Point","coordinates":[3.14754,41.858199]}') . '}]'));
check(
	'lat/lon rewritten; id, zoom, alt and lib_data byte-identical',
	json_decode('[{"id":7,"lat":41.858199,"lon":3.14754,"zoom":13,"alt":null,' . layers('{"type":"Point","coordinates":[3.14754,41.858199]}') . '}]'),
	$case['value']
);
check('one derive finding',	['GEOLOCATION_CENTRE_DERIVED' => 1],	$case['codes']);
check('severity is fixed',	'fixed',								$case['severities']['GEOLOCATION_CENTRE_DERIVED'] ?? null);
echo '        msg: ' . ($case['msgs']['GEOLOCATION_CENTRE_DERIVED'] ?? '') . "\n";

check('the repaired value is stable (re-running is a no-op)', null, run(GEO_MODEL, (array)$case['value'])['value']);

$case = run(GEO_MODEL, items('[{' . SENTINEL . ',' . layers('{"type":"LineString","coordinates":[[0,0],[10,0],[0,40]]}') . '}]'));
check('LineString → bbox centre', 20.0, $case['value'][0]->lat);
check('LineString → bbox centre', 5.0,  $case['value'][0]->lon);

$case = run(GEO_MODEL, items('[{' . SENTINEL . ',' . layers('{"type":"Polygon","coordinates":[[[2,40],[4,40],[4,42],[2,42],[2,40]]]}') . '}]'));
check('Polygon → bbox centre', 41.0, $case['value'][0]->lat);
check('Polygon → bbox centre', 3.0,  $case['value'][0]->lon);

$case = run(GEO_MODEL, items('[{"id":1,' . SENTINEL . ',' . layers('{"type":"Point","coordinates":[1,2]}') . '},{"id":2,"lat":41.6523,"lon":-4.7245}]'));
check(
	'a real sibling survives untouched beside a derived item',
	json_decode('[{"id":1,"lat":2,"lon":1,' . layers('{"type":"Point","coordinates":[1,2]}') . '},{"id":2,"lat":41.6523,"lon":-4.7245}]'),
	$case['value']
);


echo "\ngeolocation_value — HELD: reported, never guessed, never dropped\n";
$case = run(GEO_MODEL, items('[{' . SENTINEL . ',' . layers('{"type":"Point","coordinates":["x","y"]}') . '}]'));
check('geometry with no position leaves the list alone',	null,	$case['value']);
check('reported as a notice',	['GEOLOCATION_GEOMETRY_NO_POSITION' => 1],	$case['codes']);
check('severity is notice',		'notice',	$case['severities']['GEOLOCATION_GEOMETRY_NO_POSITION'] ?? null);
check('does not fail the review',	0,		$case['errors']);
echo '        msg: ' . ($case['msgs']['GEOLOCATION_GEOMETRY_NO_POSITION'] ?? '') . "\n";

$case = run(GEO_MODEL, items('[{' . SENTINEL . '},{"lat":41.6523,"lon":-4.7245}]'));
check('a bare sentinel beside a real item is held',	null,	$case['value']);
check('reported as a notice',	['GEOLOCATION_SENTINEL_MIXED' => 1],	$case['codes']);
echo '        msg: ' . ($case['msgs']['GEOLOCATION_SENTINEL_MIXED'] ?? '') . "\n";

$case = run(GEO_MODEL, items('[{' . SENTINEL . '},{' . SENTINEL . ',' . layers('{"type":"Point","coordinates":[1,2]}') . '}]'));
check('a bare sentinel beside a drawn one is held',	null,	$case['value']);
check('reported as MIXED',	['GEOLOCATION_SENTINEL_MIXED' => 1],	$case['codes']);

$case = run(GEO_MODEL, items('[{' . SENTINEL . '},null]'));
check('a bare sentinel beside a non-object is held',	null,	$case['value']);


echo "\ngeolocation_value — UNTOUCHED: 0 is a legal coordinate, and so is everything else\n";
foreach ([
	'a real coordinate'					=> '[{"lat":41.6523,"lon":-4.7245}]',
	'0 / 0 (Null Island)'				=> '[{"lat":0,"lon":0}]',
	'lat 0 on the equator'				=> '[{"lat":0,"lon":37.9}]',
	'lon 0 on the prime meridian'		=> '[{"lat":51.4778,"lon":0}]',
	'0 / 0 as strings'					=> '[{"lat":"0","lon":"0"}]',
	'the sentinel lat with another lon'	=> '[{"lat":39.462571,"lon":2.15}]',
	'an item with no coordinates'		=> '[{"zoom":9}]',
	'an empty list'						=> '[]'
] as $name => $json) {
	$case = run(GEO_MODEL, items($json));
	check($name . ' — value untouched',		null,	$case['value']);
	check($name . ' — nothing reported',	0,		$case['groups']);
}

$case = run('component_input_text', items('[{' . SENTINEL . '}]'));
check('another model is untouched even when it holds the pair',	null,	$case['value']);
check('another model reports nothing',							0,		$case['groups']);
$case = run(null, items('[{' . SENTINEL . '}]'));
check('an unresolved model is untouched',						null,	$case['value']);


echo "\n--no-auto-fix — the pre-repair picture: report, repair nothing\n";
$case = run(GEO_MODEL, items('[{' . SENTINEL . '}]'), false);
check('the fabricated centre survives',	null,		$case['value']);
check('still reported',					['GEOLOCATION_FABRICATED_CENTRE' => 1],	$case['codes']);
check('as a notice, not a failure',		'notice',	$case['severities']['GEOLOCATION_FABRICATED_CENTRE'] ?? null);
check('nothing reaches ->errors',		0,			$case['errors']);
echo '        msg: ' . ($case['msgs']['GEOLOCATION_FABRICATED_CENTRE'] ?? '') . "\n";

$case = run(GEO_MODEL, items('[{' . SENTINEL . ',' . layers('{"type":"Point","coordinates":[1,2]}') . '}]'), false);
check('no coordinate is authored either',	null,	$case['value']);
check('still reported',	['GEOLOCATION_CENTRE_DERIVED' => 1],	$case['codes']);
v6_to_v7_normalize::$auto_fix = true;


echo "\nMEMORY — one group with a count, never one object per row\n";
$many = [];
for ($i = 0; $i < 5000; $i++) {
	$many[] = items('[{' . SENTINEL . '}]');
}
$case = run(GEO_MODEL, array_shift($many), true, $many);
check('5000 fabricated items collapse to ONE group',	1,		$case['groups']);
check('with the full count on it',					['GEOLOCATION_FABRICATED_CENTRE' => 5000],	$case['codes']);
check('and no error strings',						0,		$case['errors']);


// ---------------------------------------------------------------------------
// LIVE DATA — the repaired shape the caller acts on
// ---------------------------------------------------------------------------
echo "\nLIVE DATA — the repaired shape the caller acts on\n";

$tm_bare = run(GEO_MODEL, items('[{' . SENTINEL . ',"zoom":16,"alt":0}]'));
check('a bare fabricated centre repairs to an EMPTY list',
	[],
	$tm_bare['value']);

$tm_geo = run(GEO_MODEL, items('[{' . SENTINEL . ',"zoom":12,"alt":16,' .
	layers('{"type":"Point","coordinates":[3.14754,41.858199]}') . '}]'));
check('an item with drawn geometry keeps exactly one item',
	1,
	is_array($tm_geo['value']) ? count($tm_geo['value']) : -1);
check('and carries a machine-derived centre (lat), not the fabricated one',
	41.858199,
	is_array($tm_geo['value']) ? (float)$tm_geo['value'][0]->lat : null);
check('and the derived lon — GeoJSON is [lon,lat], the item is latitude-first',
	3.14754,
	is_array($tm_geo['value']) ? (float)$tm_geo['value'][0]->lon : null);
check('the drawn geometry itself is untouched',
	true,
	is_array($tm_geo['value']) && isset($tm_geo['value'][0]->lib_data));


// ---------------------------------------------------------------------------
// TIME MACHINE — history is never repaired; disposable rows are DELETED
// ---------------------------------------------------------------------------
// A TM row says what the data WAS at a timestamp. Two rules, both pinned here:
//   1. $history_pass makes every value-level repair inert, so no coordinate is
//      dropped and no machine-derived centre is ever stamped into the past.
//   2. is_disposable_studio_default_list() decides deletion: a row whose WHOLE
//      payload is the fabricated centre records a change that never happened
//      and the row is deleted; anything real keeps the row byte for byte.
echo "\nTIME MACHINE — history is never repaired; disposable rows are DELETED\n";

v6_to_v7_normalize::$history_pass = true;
$hist = run(GEO_MODEL, items('[{' . SENTINEL . ',"zoom":16,"alt":0}]'));
check('history pass: a fabricated centre is NOT repaired',	null,	$hist['value']);
check('history pass: and nothing is reported as fixed',		0,		count($hist['codes']));

$hist_geo = run(GEO_MODEL, items('[{' . SENTINEL . ',"zoom":12,"alt":16,' .
	layers('{"type":"Point","coordinates":[3.14754,41.858199]}') . '}]'));
check('history pass: no centre is authored into the past',	null,	$hist_geo['value']);
v6_to_v7_normalize::$history_pass = false;

$disposable = fn(string $json) => v6_to_v7_normalize::is_disposable_studio_default_list(items($json));

check('DELETE: payload is only the fabricated centre',
	true,	$disposable('[{' . SENTINEL . ',"zoom":16,"alt":0}]'));
check('DELETE: several fabricated items, nothing else',
	true,	$disposable('[{' . SENTINEL . '},{' . SENTINEL . '}]'));
check('DELETE: the pair stored as strings',
	true,	$disposable('[{"lat":"39.462571","lon":"-0.376295"}]'));
check('DELETE: an empty lib_data layer is not real work',
	true,	$disposable('[{' . SENTINEL . ',"lib_data":[{"layer_data":{"type":"FeatureCollection","features":[]}}]}]'));

check('KEEP: drawn geometry is real history',
	false,	$disposable('[{' . SENTINEL . ',' .
		layers('{"type":"Point","coordinates":[3.14754,41.858199]}') . '}]'));
check('KEEP: a real coordinate',
	false,	$disposable('[{"lat":41.385064,"lon":2.173403}]'));
check('KEEP: 0/0 is a legal coordinate, not the fabricated pair',
	false,	$disposable('[{"lat":0,"lon":0}]'));
check('KEEP: the fabricated lat with another lon',
	false,	$disposable('[{"lat":39.462571,"lon":2.173403}]'));
check('KEEP: a fabricated item beside a real one',
	false,	$disposable('[{' . SENTINEL . '},{"lat":41.385064,"lon":2.173403}]'));
check('KEEP: an empty payload is not disposable',
	false,	$disposable('[]'));


echo "\n" . ($failed === 0 ? "PASS" : "FAIL") . " — $passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
