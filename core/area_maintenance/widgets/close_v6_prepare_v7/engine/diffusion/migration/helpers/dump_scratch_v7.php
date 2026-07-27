<?php
/**
 * Dump every table currently in the scratch DB to a JSON snapshot (the v7 result),
 * after the Bun processor (run_v7_processor.ts) has written it.
 *
 * Usage:
 *   php dump_scratch_v7.php [out_file]
 */

ob_start();
require_once __DIR__ . '/../../../config/bootstrap.php';
ob_clean();

require_once __DIR__ . '/_harness_dump.php';

$out_file = $argv[1] ?? (__DIR__ . '/v7_result.json');

$dump = harness_dump_scratch(HARNESS_SCRATCH_DB);
file_put_contents(
	$out_file,
	json_encode($dump, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
);

$summary = array_map(fn($rows) => count($rows), $dump);
fwrite(STDERR, '[v7] tables: ' . json_encode($summary) . "\n");
echo "v7 result -> $out_file (" . count($dump) . " tables)\n";
