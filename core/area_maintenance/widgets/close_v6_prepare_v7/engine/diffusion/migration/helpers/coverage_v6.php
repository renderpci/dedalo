<?php
/**
 * COVERAGE v6 runner — accumulating variant of run_v6_diffusion.php.
 * Refreshes the scratch DB ONCE, then diffuses a LIST of section_ids (so every
 * column gets exercised on a section where its source is populated), and dumps
 * the accumulated MariaDB rows to a JSON snapshot.
 *
 * Usage:
 *   php coverage_v6.php <element_tipo> <section_tipo> <id1,id2,...> [out_file]
 */

ob_start();
require_once '/Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/config/config.php';
ob_end_clean();
require_once __DIR__ . '/_harness_dump.php';

$element      = $argv[1] ?? 'numisdata29';
$section_tipo = $argv[2] ?? 'numisdata6';
$ids          = array_values(array_filter(array_map('intval', explode(',', (string)($argv[3] ?? '2')))));
$out_file     = $argv[4] ?? (__DIR__ . '/v6_cov.json');
$scratch      = HARNESS_SCRATCH_DB;

$_SESSION['dedalo']['auth']['user_id']         = 1;
$_SESSION['dedalo']['auth']['username']        = 'root';
$_SESSION['dedalo']['auth']['full_username']   = 'root';
$_SESSION['dedalo']['auth']['is_developer']    = true;
$_SESSION['dedalo']['auth']['is_global_admin'] = true;
$_SESSION['dedalo']['auth']['is_logged']       = 1;

fwrite(STDERR, "[v6cov] element=$element section=$section_tipo ids=" . implode(',', $ids) . " scratch=$scratch\n");

diffusion_sql::$database_name = $scratch;
harness_refresh_scratch($scratch); // ONCE

$diffusion = new diffusion_mysql((object)['diffusion_element_tipo' => $element]);

$ok = 0; $fail = 0;
foreach ($ids as $section_id) {
	try {
		$resp = $diffusion->update_record((object)[
			'section_tipo'           => $section_tipo,
			'section_id'             => $section_id,
			'diffusion_element_tipo' => $element,
			'resolve_references'     => false
		]);
		if (!empty($resp->result)) { $ok++; } else { $fail++; }
	} catch (Throwable $t) {
		$fail++;
		fwrite(STDERR, "[v6cov] id=$section_id EXCEPTION: " . $t->getMessage() . "\n");
	}
}
fwrite(STDERR, "[v6cov] diffused ok=$ok fail=$fail\n");

$dump = harness_dump_scratch($scratch);
file_put_contents($out_file, json_encode($dump, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$summary = array_map(fn($rows) => count($rows), $dump);
fwrite(STDERR, '[v6cov] tables: ' . json_encode($summary) . "\n");
echo "v6 coverage -> $out_file (" . count($dump) . " tables)\n";
