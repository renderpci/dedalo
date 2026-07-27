<?php
/**
 * Run the v6 diffusion process for a single record into the scratch DB and dump
 * the resulting MariaDB tables to a JSON snapshot (the v6 reference).
 *
 * Usage:
 *   php run_v6_diffusion.php <element_tipo> <section_tipo> <section_id> [out_file]
 *
 * Example (mints test node):
 *   php run_v6_diffusion.php numisdata29 numisdata6 2
 *
 * Writes nothing to the live diffusion DB: diffusion_sql::$database_name redirects
 * every write to the scratch database (see the guarded override in class.diffusion_sql.php).
 */

ob_start();
require_once '/Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/config/config.php';
ob_end_clean();
require_once __DIR__ . '/_harness_dump.php';

// --- args ---
$element      = $argv[1] ?? 'numisdata29';
$section_tipo = $argv[2] ?? 'numisdata6';
$section_id   = (int)($argv[3] ?? 2);
$out_file     = $argv[4] ?? (__DIR__ . '/v6_result.json');
$scratch      = HARNESS_SCRATCH_DB;

// --- login as root developer (dev server) ---
$_SESSION['dedalo']['auth']['user_id']         = 1;
$_SESSION['dedalo']['auth']['username']        = 'root';
$_SESSION['dedalo']['auth']['full_username']   = 'root';
$_SESSION['dedalo']['auth']['is_developer']    = true;
$_SESSION['dedalo']['auth']['is_global_admin'] = true;
$_SESSION['dedalo']['auth']['is_logged']       = 1;

fwrite(STDERR, "[v6] element=$element section=$section_tipo id=$section_id scratch=$scratch\n");

// --- redirect all writes to scratch DB and start fresh ---
diffusion_sql::$database_name = $scratch;
harness_refresh_scratch($scratch);

// --- run the v6 diffusion for this single record ---
$diffusion = new diffusion_mysql((object)[
	'diffusion_element_tipo' => $element
]);

try {
	$resp = $diffusion->update_record((object)[
		'section_tipo'           => $section_tipo,
		'section_id'             => $section_id,
		'diffusion_element_tipo' => $element,
		'resolve_references'     => false
	]);
	fwrite(STDERR, '[v6] update_record result=' . var_export($resp->result ?? null, true) . "\n");
	if (!empty($resp->msg)) {
		fwrite(STDERR, '[v6] msg: ' . (is_array($resp->msg) ? implode(' | ', $resp->msg) : $resp->msg) . "\n");
	}
} catch (Throwable $t) {
	fwrite(STDERR, '[v6] EXCEPTION: ' . $t->getMessage() . "\n" . $t->getTraceAsString() . "\n");
}

// --- dump scratch tables ---
$dump = harness_dump_scratch($scratch);
file_put_contents(
	$out_file,
	json_encode($dump, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
);

$summary = array_map(fn($rows) => count($rows), $dump);
fwrite(STDERR, '[v6] tables: ' . json_encode($summary) . "\n");
echo "v6 result -> $out_file (" . count($dump) . " tables)\n";
