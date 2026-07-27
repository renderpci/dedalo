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

$opts     = getopt('', ['yes', 'log:']);
$has_yes  = isset($opts['yes']);
$log_file = $opts['log'] ?? ($paths['var_dir'] . '/prepare_v7.log');

$log = function(string $line) use ($log_file) : void {
	@file_put_contents($log_file, date('c') . ' [phase3] ' . $line . PHP_EOL, FILE_APPEND | LOCK_EX);
	fwrite(STDOUT, $line . PHP_EOL);
};

if (!$has_yes) {
	$log('Refusing to run the diffusion migration without --yes.');
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
$cmd = escapeshellarg($php) . ' ' . escapeshellarg($script);

$log('Running diffusion ontology properties migration (isolated engine process):');
$log('  ' . $script);

$code = 0;
passthru($cmd, $code);   // streams the script's own output; it self-boots + self-logs-in

if ($code !== 0) {
	$log('WARNING: diffusion properties migration exited with code ' . $code . '.');
	$log('The core v6→v7 DATABASE migration (phases 1–2) already completed and was version-stamped.');
	$log('This isolated diffusion step can be re-run on its own:');
	$log('  php ' . $script);
	exit(7);
}

$log('Diffusion ontology properties migration done.');
exit(0);
