<?php
/**
 * Build the v7 diffusion "dump" (datum[]) for a single record by calling the PHP
 * diffusion API (dd_diffusion_api::diffuse), then rewrite its database node to point
 * at the scratch DB. The Bun engine (run_v7_processor.ts) consumes this dump and
 * performs the actual MariaDB writes.
 *
 * Usage:
 *   php build_v7_dump.php <element_tipo> <section_tipo> <section_id> [dump_file]
 *
 * Example:
 *   php build_v7_dump.php numisdata29 numisdata6 2
 *
 * Default dump_file is the repo-root v7_dump.json (the path run_v7_processor.ts reads).
 */

ob_start();
require_once __DIR__ . '/../../../config/bootstrap.php';
ob_clean();

require_once __DIR__ . '/_harness_dump.php';

// --- args ---
$element      = $argv[1] ?? 'numisdata29';
$section_tipo = $argv[2] ?? 'numisdata6';
$section_id   = (int)($argv[3] ?? 2);
$dump_file    = $argv[4] ?? realpath(__DIR__ . '/../../../') . '/v7_dump.json';
$scratch      = HARNESS_SCRATCH_DB;

// --- force-login as root developer (dev server) ---
function harness_force_login(int $user_id) : void {
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception('Only development servers can use this method', 1);
	}
	$init_response = require DEDALO_CORE_PATH.'/base/dd_init_test.php';
	$_SESSION['dedalo']['auth']['is_global_admin'] = (bool)security::is_global_admin($user_id);
	$_SESSION['dedalo']['auth']['is_developer']    = (bool)security::is_developer($user_id);
	$_SESSION['dedalo']['auth']['user_id']         = $user_id;
	$_SESSION['dedalo']['auth']['username']        = 'test ' . $user_id;
	$_SESSION['dedalo']['auth']['is_logged']       = 1;
	$_SESSION['dedalo']['auth']['salt_secure']     = dedalo_encrypt_v2(DEDALO_SALT_STRING);
	$_SESSION['dedalo']['auth']['login_type']      = 'default';
}
harness_force_login(-1);

// Clear the scratch DB so the Bun run that consumes this dump starts fresh
// (removes any v6 tables left from the reference run). The coverage harness sets
// HARNESS_NO_REFRESH=1 to ACCUMULATE many section_ids across successive calls.
if (getenv('HARNESS_NO_REFRESH') !== '1') {
	harness_refresh_scratch(HARNESS_SCRATCH_DB);
}

fwrite(STDERR, "[v7] element=$element section=$section_tipo id=$section_id\n");

// --- resolve the diffusion node (table node) for this element+section ---
$table_node = diffusion_utils::get_section_node_for_element($element, $section_tipo);
if (!$table_node || empty($table_node->tipo)) {
	fwrite(STDERR, "[v7] ERROR: no diffusion node for element=$element section=$section_tipo\n");
	exit(1);
}
$diffusion_tipo = $table_node->tipo;
fwrite(STDERR, "[v7] diffusion_tipo=$diffusion_tipo (".($table_node->label ?? '?').")\n");

// --- build the SQO selecting just this record ---
$locator = new locator();
$locator->set_section_tipo($section_tipo);
$locator->set_section_id($section_id);

$rqo = (object)[
	'action'  => 'diffuse',
	'sqo'     => (object)[
		'section_tipo'       => [$section_tipo],
		'limit'              => 1,
		'offset'             => 0,
		'filter_by_locators' => [$locator]
	],
	'options' => (object)[
		'diffusion_tipo'         => $diffusion_tipo,
		'diffusion_element_tipo' => $element
		// levels omitted → diffuse() uses DEDALO_DIFFUSION_RESOLVE_LEVELS (production
		// default 2), matching v6's column resolution for ≤3-ddo chains.
	]
];

// --- call the diffusion API to get the datum[] dump ---
$response = dd_diffusion_api::diffuse($rqo);

if (empty($response->result)) {
	fwrite(STDERR, '[v7] diffuse failed: ' . json_encode($response->errors ?? $response->msg ?? null) . "\n");
	exit(1);
}

// --- redirect the dump's database node to the scratch DB ---
$overridden = false;
foreach (($response->main ?? []) as $node) {
	if (isset($node->model) && ($node->model === 'database' || $node->model === 'database_alias')) {
		$node->term = $scratch;
		$overridden = true;
	}
}
if (!$overridden) {
	// no explicit database node: inject one so resolve_database_name() finds it
	$response->main[] = (object)['model' => 'database', 'term' => $scratch];
}

// --- write the dump ---
file_put_contents(
	$dump_file,
	json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
);

$datum_count = is_array($response->datum ?? null) ? count($response->datum) : 0;
fwrite(STDERR, "[v7] datum groups: $datum_count -> $dump_file (db=$scratch)\n");
echo "v7 dump -> $dump_file\n";
