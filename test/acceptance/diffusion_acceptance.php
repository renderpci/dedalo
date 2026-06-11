<?php
/**
* DIFFUSION_ACCEPTANCE
* End-to-end acceptance gate for the diffusion system, run against a LIVE
* dev instance (PostgreSQL + Bun engine + configured diffusion ontology).
* NOT part of CI: this is the manual production-quality gate.
*
* Usage:
* 	php test/acceptance/diffusion_acceptance.php
*
* Prerequisites:
* 	- Bun engine running on DEDALO_DIFFUSION_SOCKET_PATH
* 	- Internal token pair configured (DEDALO_DIFFUSION_INTERNAL_TOKEN in
* 	  config/config.php = DIFFUSION_INTERNAL_TOKEN in diffusion/api/v1/.env)
* 	- Diffusion ontology seeded (sql element; rdf element with service_name
* 	  for the RDF checks)
*
* Safety: only FABRICATED record ids are used for delete/pending checks;
* activity rows created by the run are cleaned up.
*/

if (php_sapi_name()!=='cli') {
	die('This script must be run from CLI'.PHP_EOL);
}

require_once __DIR__ . '/../../config/config.php';

// CLI superuser context (development servers only): validate() is admin-gated
// and diffuse() checks section permissions — both need a logged user.
// Mirrors test/server/login/login_Test.php::force_login minimally.
if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
	die('This script only runs on development servers (DEVELOPMENT_SERVER=true)'.PHP_EOL);
}
$acceptance_user_id = -1; // DEDALO_SUPERUSER
$_SESSION['dedalo']['auth']['user_id']			= $acceptance_user_id;
$_SESSION['dedalo']['auth']['username']			= 'acceptance';
$_SESSION['dedalo']['auth']['full_username']	= 'diffusion acceptance gate';
$_SESSION['dedalo']['auth']['is_logged']		= 1;
$_SESSION['dedalo']['auth']['is_global_admin']	= (bool)security::is_global_admin($acceptance_user_id);
$_SESSION['dedalo']['auth']['is_developer']		= (bool)security::is_developer($acceptance_user_id);
$_SESSION['dedalo']['auth']['salt_secure']		= dedalo_encrypt_openssl(DEDALO_SALT_STRING);
$_SESSION['dedalo']['auth']['login_type']		= 'default';

$results = [];
function check(string $name, bool $ok, string $detail=''): bool {
	global $results;
	$results[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail];
	printf("[%s] %s%s\n", $ok ? 'PASS' : 'FAIL', $name, $detail!=='' ? " — $detail" : '');
	return $ok;
}
function skip(string $name, string $reason): void {
	global $results;
	$results[] = ['name' => $name, 'ok' => null, 'detail' => $reason];
	printf("[SKIP] %s — %s\n", $name, $reason);
}

$FABRICATED_ID = 99900199;

echo "=== Dédalo diffusion acceptance gate ===\n\n";

// -----------------------------------------------------------------
// 1. Engine reachable
// -----------------------------------------------------------------
$socket_ok = defined('DEDALO_DIFFUSION_SOCKET_PATH') && file_exists(DEDALO_DIFFUSION_SOCKET_PATH);
check('Engine socket present', $socket_ok, DEDALO_DIFFUSION_SOCKET_PATH ?? '(undefined)');
if (!$socket_ok) {
	echo "\nABORT: start the Bun engine first (bun run index.ts in diffusion/api/v1)\n";
	exit(1);
}

// -----------------------------------------------------------------
// 2. Server-to-server auth (token pair)
// -----------------------------------------------------------------
$probe = diffusion_api_client::call((object)['action' => 'check_database', 'database_name' => 'information_schema']);
$auth_ok = !empty($probe->result);
check('Server-to-server auth (internal token pair)', $auth_ok,
	$auth_ok ? 'check_database answered' : to_string($probe->msg ?? ''));
if (!$auth_ok) {
	echo "\nABORT: configure DEDALO_DIFFUSION_INTERNAL_TOKEN = DIFFUSION_INTERNAL_TOKEN and restart the engine\n";
	exit(1);
}

// -----------------------------------------------------------------
// 3. Ontology: usable SQL element
// -----------------------------------------------------------------
$sql_config = null;
foreach (diffusion_utils::get_ar_diffusion_map_elements() as $element) {
	if (($element->type ?? null)!=='sql') continue;
	$sections = diffusion_utils::get_diffusion_sections_from_diffusion_element($element->element_tipo);
	if (empty($sections)) continue;
	$sql_config = (object)[
		'element_tipo'	=> $element->element_tipo,
		'section_tipo'	=> reset($sections),
		'database_name'	=> $element->database_name ?? null
	];
	break;
}
check('SQL diffusion element resolvable', $sql_config!==null,
	$sql_config ? "{$sql_config->element_tipo} → {$sql_config->section_tipo} → db {$sql_config->database_name}" : 'none found');

// target database exists in MariaDB
if ($sql_config && !empty($sql_config->database_name)) {
	check('Target MariaDB database exists', diffusion_utils::database_exits($sql_config->database_name), $sql_config->database_name);
}

// -----------------------------------------------------------------
// 4. validate() reports the configuration state
// -----------------------------------------------------------------
$validate = dd_diffusion_api::validate((object)['action' => 'validate']);
$invalid = 0;
foreach ($validate->data ?? [] as $report) {
	if ($report->result===false) $invalid++;
}
check('validate() runs over the whole domain', !empty($validate->result),
	count($validate->data ?? []) . ' element(s), ' . $invalid . ' with issues' . ($invalid>0 ? ' (review them!)' : ''));

// -----------------------------------------------------------------
// 5. PHP publish pipeline (datum production for a real record)
// -----------------------------------------------------------------
if ($sql_config) {
	$table	= common::get_matrix_table_from_tipo($sql_config->section_tipo) ?? 'matrix';
	$res	= pg_query_params(DBi::_getConnection(),
		'SELECT section_id FROM "' . $table . '" WHERE section_tipo = $1 ORDER BY section_id ASC LIMIT 1',
		[$sql_config->section_tipo]);
	$row	= pg_fetch_object($res);

	if (empty($row)) {
		skip('PHP publish pipeline', "no records in section {$sql_config->section_tipo}");
	}else{
		$locator = new locator();
			$locator->set_section_tipo($sql_config->section_tipo);
			$locator->set_section_id((int)$row->section_id);

		$diffusion_tipo = diffusion_utils::get_table_tipo($sql_config->element_tipo, $sql_config->section_tipo);
		$diffuse = dd_diffusion_api::diffuse((object)[
			'action'	=> 'diffuse',
			'source'	=> (object)['type' => 'diffuse'],
			'sqo'		=> (object)[
				'section_tipo'			=> [$sql_config->section_tipo],
				'filter_by_locators'	=> [$locator],
				'limit'					=> 1
			],
			'options'	=> (object)[
				'diffusion_tipo'			=> $diffusion_tipo,
				'diffusion_element_tipo'	=> $sql_config->element_tipo,
				'levels'					=> 1
			]
		]);
		check('PHP publish pipeline (diffuse → datum)', !empty($diffuse->result) && !empty($diffuse->datum),
			'record ' . $row->section_id . ', ' . count($diffuse->datum ?? []) . ' datum group(s)');
	}
}

// -----------------------------------------------------------------
// 6. Hybrid delete cycle (fabricated id: no real data touched)
// -----------------------------------------------------------------
$baseline_res = pg_query(DBi::_getConnection(), 'SELECT COALESCE(MAX(section_id),0) AS m FROM matrix_activity_diffusion');
$baseline = (int)pg_fetch_object($baseline_res)->m;

if ($sql_config) {
	try {
		// outage
		diffusion_api_client::$endpoint_override = '/tmp/no_such_diffusion_engine.sock';
		diffusion_activity_logger::reset_cache();
		$outage = diffusion_delete::delete_record($sql_config->section_tipo, $FABRICATED_ID,
			(object)['only_element_tipos' => [$sql_config->element_tipo]]);
		check('Outage leaves durable pending row', !$outage->result && !empty($outage->ar_pending) && diffusion_delete::count_pending()>=1);

		// heal
		diffusion_api_client::$endpoint_override = null;
		diffusion_activity_logger::reset_cache();
		$retry = diffusion_delete::retry_pending();
		check('Retry heals the pending row', $retry->retried>=1, $retry->msg);

		// no pending rows remain from this run
		$res = pg_query_params(DBi::_getConnection(),
			'SELECT relation FROM matrix_activity_diffusion WHERE section_id > $1', [$baseline]);
		$stale_pending = false;
		while ($r = pg_fetch_object($res)) {
			$relation = json_decode($r->relation);
			foreach ($relation->{diffusion_activity_logger::ACTION_TIPO} ?? [] as $loc) {
				if ((int)$loc->section_id===diffusion_activity_logger::ACTION_UNPUBLISH_PENDING) $stale_pending = true;
			}
		}
		check('Pending row flipped to unpublished', !$stale_pending);

	} finally {
		diffusion_api_client::$endpoint_override = null;
		pg_query_params(DBi::_getConnection(), 'DELETE FROM matrix_activity_diffusion WHERE section_id > $1', [$baseline]);
	}
}

// -----------------------------------------------------------------
// 7. RDF deterministic file publish + delete (fabricated id)
// -----------------------------------------------------------------
$rdf_config = null;
foreach (diffusion_utils::get_ar_diffusion_map_elements() as $element) {
	if (($element->type ?? null)!=='rdf') continue;
	$sections = diffusion_utils::get_diffusion_sections_from_diffusion_element($element->element_tipo);
	foreach ($sections as $section_tipo) {
		if (diffusion_rdf::get_record_file_path($element->element_tipo, $section_tipo, 0)!==null) {
			$rdf_config = (object)['element_tipo' => $element->element_tipo, 'section_tipo' => $section_tipo];
			break 2;
		}
	}
}
if ($rdf_config===null) {
	skip('RDF deterministic file cycle', 'no fully-configured RDF element (service_name + owl:Class) — see validate() report');
}else{
	$file_info = diffusion_rdf::get_record_file_path($rdf_config->element_tipo, $rdf_config->section_tipo, $FABRICATED_ID);
	if (!is_dir(dirname($file_info->file_path))) mkdir(dirname($file_info->file_path), 0777, true);
	file_put_contents($file_info->file_path, '<rdf:RDF/>');
	$deleted = diffusion_rdf::delete_record_file($rdf_config->element_tipo, $rdf_config->section_tipo, $FABRICATED_ID);
	check('RDF deterministic file delete', $deleted->result===true && !file_exists($file_info->file_path), $file_info->file_name);
}

// -----------------------------------------------------------------
// 8. XML deterministic file publish + delete (fabricated id)
// -----------------------------------------------------------------
$xml_config = null;
foreach (diffusion_utils::get_ar_diffusion_map_elements() as $element) {
	if (($element->type ?? null)!=='xml') continue;
	$sections = diffusion_utils::get_diffusion_sections_from_diffusion_element($element->element_tipo);
	foreach ($sections as $section_tipo) {
		if (diffusion_xml::get_record_file_path($element->element_tipo, $section_tipo, 0)!==null) {
			$xml_config = (object)['element_tipo' => $element->element_tipo, 'section_tipo' => $section_tipo];
			break 2;
		}
	}
}
if ($xml_config===null) {
	skip('XML deterministic file cycle', 'no fully-configured XML element (service_name) — see validate() report');
}else{
	$file_info = diffusion_xml::get_record_file_path($xml_config->element_tipo, $xml_config->section_tipo, $FABRICATED_ID);
	if (!is_dir(dirname($file_info->file_path))) mkdir(dirname($file_info->file_path), 0777, true);
	file_put_contents($file_info->file_path, '<records/>');
	$deleted = diffusion_xml::delete_record_file($xml_config->element_tipo, $xml_config->section_tipo, $FABRICATED_ID);
	check('XML deterministic file delete', $deleted->result===true && !file_exists($file_info->file_path), $file_info->file_name);
}

// -----------------------------------------------------------------
// Summary
// -----------------------------------------------------------------
$failed = count(array_filter($results, fn($r) => $r['ok']===false));
$passed = count(array_filter($results, fn($r) => $r['ok']===true));
$skipped = count(array_filter($results, fn($r) => $r['ok']===null));

echo "\n=== Summary: $passed passed, $failed failed, $skipped skipped ===\n";
if ($failed===0) {
	echo "Diffusion acceptance gate: GREEN (note: full SQL row write/delete verification additionally requires one publish from the tool_diffusion UI)\n";
}
exit($failed===0 ? 0 : 1);
