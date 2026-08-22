<?php declare(strict_types=1);
/**
* PHASE 3 — diffusion ontology migration  (isolated, LAST step)
*
* Runs the v6→v7 diffusion-ontology migration as its OWN engine process, after
* the data/schema migration (phases 1–2) has completed. The diffusion migration
* is a separate, still-evolving axis: it is NOT wired into update::update_version()
* — it is the standalone engine script diffusion/migration/migrate_diffusion_properties.php,
* which self-bootstraps the bundled engine, self-logs-in as superuser, and rewrites
* dd_ontology.properties (+ matrix_ontology) from the migrated v6 propiedades.
*
* This phase is a thin launcher: it locates that script under the bundled engine
* and execs it as a child (the script boots the engine itself — do NOT boot here).
*
* Prerequisite (met by phases 1–2): dd_ontology exists and carries `propiedades`
* (v6_to_v7::create_dd_ontology_table copies it). Writes unconditionally, so this
* phase runs ONLY with --yes (never in the dry-run preflight).
*
* Non-fatal by design: phases 1–2 (the correctness-critical DB migration) have
* already succeeded and been version-stamped before this runs. A diffusion failure
* is reported with a distinct exit code (7) and a re-run hint, but does not mean the
* database migration failed.
*
* Exit codes: 0 ok / skipped-absent · 2 usage · 7 diffusion migration failed
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/

require_once __DIR__ . '/lib/engine_boot.php';   // defines the path resolver; does NOT boot the engine
$paths = prepare_v7_resolve_paths();

$opts     = getopt('', ['yes', 'dry-run', 'log:']);
$has_yes  = isset($opts['yes']);
$is_dry   = isset($opts['dry-run']);
$log_file = $opts['log'] ?? ($paths['var_dir'] . '/prepare_v7.log');

$log = function(string $line) use ($log_file) : void {
	@file_put_contents($log_file, date('c') . ' [phase3] ' . $line . PHP_EOL, FILE_APPEND | LOCK_EX);
	fwrite(STDOUT, $line . PHP_EOL);
};

// uncaught throwable / fatal ⇒ logged + non-zero exit (never a silent "success")
prepare_v7_fail_loud($log_file, 'phase3');

if (!$has_yes && !$is_dry) {
	$log('Refusing to run the diffusion migration without --yes (or --dry-run to preview it).');
	exit(2);
}

$engine = $paths['engine_root'];
$script = $engine . '/diffusion/migration/migrate_diffusion_properties.php';

if (!is_file($script)) {
	// The diffusion migration is optional/isolated; if it was not bundled, skip cleanly.
	$log('Diffusion ontology migration script not bundled (' . $script . '); skipping.');
	exit(0);
}

$php = PHP_BINARY ?: 'php';

// The script echoes, per ontology node, the v6 properties, the v7 properties it derived
// and a [TEST PASS]/[TEST FAIL] read-back check. That output IS the audit trail of what
// this phase changed, so it goes VERBATIM to its own file — the runner distils phase
// stdout into a 10s heartbeat, which is right for per-row progress and wrong for this.
$diffusion_log = $paths['var_dir'] . ($is_dry
	? '/diffusion_migration.dry-run.log'   // never overwrite a real run's audit trail
	: '/diffusion_migration.log');
$cmd = escapeshellarg($php) . ' ' . escapeshellarg($script)
	. ($is_dry ? ' --dry-run' : '')
	. ' > ' . escapeshellarg($diffusion_log) . ' 2>&1';

$log(($is_dry ? 'PREVIEW (dry-run) of the' : 'Running') . ' diffusion ontology properties migration'
	. ' (isolated engine process):');
$log('  ' . $script);
$log('  full per-node output → ' . $diffusion_log);

$code = 0;
passthru($cmd, $code);   // the script self-boots + self-logs-in

// The preview needs dd_ontology, which the REAL phase 1 creates. Exit 3 from the
// script means "not there yet" — informative, not a failure of the preflight.
if ($is_dry && $code === 3) {
	$log('Diffusion preview unavailable: dd_ontology does not exist yet. It is created by the '
		. 'real phase 1 (pre_update) from jer_dd, so the diffusion mapping can only be previewed '
		. 'after the database migration has run.');
	exit(0);
}

// summarise the audit trail into the main log
// [UNMAPPED] (v6 propiedades that matched no mapping branch) and [FALLBACK] (a value the
// migration could not derive from the ontology and took from overrides.json) are COVERAGE
// signals: non-fatal, but a run with 30 of them is not the same as a clean one, and until
// they were counted here the summary line said "warnings=0" for it.
$pass = $fail = $warn = $pending = $unmapped = $fallback = 0;
$total = '';
if (is_file($diffusion_log) && ($fh = @fopen($diffusion_log, 'r')) !== false) {
	while (($line = fgets($fh)) !== false) {
		if (strpos($line, '[TEST PASS]') !== false) { $pass++; continue; }
		if (strpos($line, '[TEST FAIL]') !== false) { $fail++; continue; }
		if (strpos($line, '[WARN]')      !== false) { $warn++; continue; }
		if (strpos($line, '[UNMAPPED]')  !== false) { $unmapped++; continue; }
		if (strpos($line, '[FALLBACK]')  !== false) { $fallback++; continue; }
		if (strpos($line, '[DRY RUN]')   !== false) { $pending++; continue; }
		if (strpos($line, 'Total nodes processed:') !== false) { $total = trim($line); }
	}
	fclose($fh);
}

$coverage = 'unmapped=' . $unmapped . ' fallback=' . $fallback;

if ($is_dry) {
	$log('diffusion preview: ' . $pending . ' node(s) would be written, nothing changed'
		. ' | ' . $coverage
		. ($total !== '' ? ' | ' . $total : ''));
	$log('Review the mapping (V6/V7 pairs per node) in ' . $diffusion_log . '.');
	exit($code === 0 ? 0 : 7);
}

$log('diffusion nodes: verified=' . $pass . ' mismatched=' . $fail . ' warnings=' . $warn
	. ' | ' . $coverage
	. ($total !== '' ? ' | ' . $total : ''));

// PROOF-OF-COMPLETION gate. "Total nodes processed:" is echoed only after
// traverse_ontology_recursive() returns, so its ABSENCE is the one reliable signal that the
// traversal did not finish — whether it traversed nothing at all, or died part-way through.
// $total === '' is therefore fatal on its own. It used to be conjoined with pass===0 && fail===0,
// which meant a run that migrated 200 nodes and then aborted (pass>0) sailed past this check and
// was reported as a clean migration, leaving the rest of the diffusion tree with properties NULL.
if ($total === '') {
	$log('ERROR: the diffusion migration never reported "Total nodes processed" — the traversal did');
	$log('not run to completion. Nodes verified before it stopped: ' . $pass . '.');
	if ($pass === 0 && $fail === 0) {
		$log('No per-node audit output at all: check that ' . $script . ' ran as the entry script');
		$log('(see the autorun guard at its foot).');
	} else {
		$log('It stopped part-way: the diffusion tree is PARTIALLY migrated. Read the end of');
		$log('  ' . $diffusion_log);
		$log('for the failing node, then re-run — the step is idempotent (it reads the untouched v6');
		$log('`propiedades` and rewrites v7 `properties`).');
	}
	exit(7);
}

// Coverage, not correctness: reported, never fatal.
if ($unmapped > 0) {
	$log('NOTE: ' . $unmapped . ' node(s) carry v6 propiedades that matched no mapping branch. '
		. 'Search "[UNMAPPED]" in ' . $diffusion_log . ' — a coverage gap, not a failure.');
}
if ($fallback > 0) {
	$log('NOTE: ' . $fallback . ' value(s) could not be derived from the ontology and came from '
		. 'overrides.json (or were omitted). Search "[FALLBACK]" in ' . $diffusion_log . '.');
}

// A read-back mismatch means a node's properties were NOT stored as computed. The script
// reports it inline and still exits 0, so surface it here rather than calling that success.
if ($fail > 0) {
	$log('WARNING: ' . $fail . ' node(s) failed their read-back verification. '
		. 'Search "[TEST FAIL]" in ' . $diffusion_log . '.');
	$log('The core v6→v7 DATABASE migration (phases 1–2) already completed and was version-stamped.');
	$log('This isolated diffusion step reads the untouched v6 `propiedades` and can be re-run:');
	$log('  php ' . $script);
	exit(7);
}

if ($code !== 0) {
	$log('WARNING: diffusion properties migration exited with code ' . $code . '.');
	$log('The core v6→v7 DATABASE migration (phases 1–2) already completed and was version-stamped.');
	$log('This isolated diffusion step can be re-run on its own:');
	$log('  php ' . $script);
	exit(7);
}

$log('Diffusion ontology properties migration done.');
exit(0);
