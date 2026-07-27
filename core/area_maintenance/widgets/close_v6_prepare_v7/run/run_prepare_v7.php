<?php declare(strict_types=1);
/**
* RUN_PREPARE_V7 — orchestrator for "Close v6 / Prepare installation for v7".
*
* Thin CLI that sequences the migration as SEPARATE bundled-engine child
* processes (so each phase boots with a clean ontology cache — the CLI
* equivalent of the pre_update → logout → login → update boundary). It does NOT
* boot the engine itself; it only spawns:
*
*   --dry-run : phase1 --dry-run                         (preflight, writes nothing)
*   (real)    : phase1 --yes [--skip-backup] → phase2 --yes   (backup, then migrate)
*
* The v6 widget imports the v6 config into the bundled engine (copies the legacy
* config files into engine/config/; the engine bootstrap auto-migrates them to
* ../private/.env on first boot) and then spawns THIS script in the background.
*
* Usage:
*   php run/run_prepare_v7.php --dry-run
*   php run/run_prepare_v7.php --yes [--skip-backup] [--backup-dir=PATH] [--log=PATH]
*   php run/run_prepare_v7.php --help
*
* Exit code == the exit code of the last child that ran.
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/

if (PHP_SAPI !== 'cli') {
	fwrite(STDERR, "run_prepare_v7.php must be run from the command line\n");
	exit(2);
}

$opts = getopt('', ['dry-run', 'yes', 'skip-backup', 'backup-dir:', 'log:', 'engine-root:', 'help']);

if (isset($opts['help'])) {
	fwrite(STDOUT, <<<TXT
Close v6 / Prepare installation for v7

  --dry-run              Preflight only (version gate, connectivity, pg_dump, data review). No writes.
  --yes                  Apply the migration (REQUIRED to write anything).
  --skip-backup          Skip the mandatory pre-migration backup (only if you already have one).
  --backup-dir=PATH      Where to write the pg_dump (default: <package>/var/backup).
  --log=PATH             Log file (default: <package>/var/prepare_v7.log).
  --engine-root=PATH     Bundled engine root (default: <package>/engine, else the repo).
  --help                 This help.

The bundled engine reads its DB credentials from <engine>/../private/.env, which
the v6 widget generates from the live v6 config before launching this script.

TXT);
	exit(0);
}

$is_dry      = isset($opts['dry-run']);
$has_yes     = isset($opts['yes']);
$skip_backup = isset($opts['skip-backup']);

// paths (this file: <package>/run/run_prepare_v7.php)
$run_dir      = __DIR__;
$package_root = dirname($run_dir);
$var_dir      = $package_root . '/var';
if (!is_dir($var_dir)) { @mkdir($var_dir, 0775, true); }

$log_file   = $opts['log']        ?? ($var_dir . '/prepare_v7.log');
$backup_dir = $opts['backup-dir'] ?? ($var_dir . '/backup');

// propagate an explicit engine root to the children (they also auto-resolve)
if (!empty($opts['engine-root'])) {
	putenv('PREPARE_V7_ENGINE_ROOT=' . $opts['engine-root']);
}

$php = PHP_BINARY ?: 'php';

$emit = function(string $line) use ($log_file) : void {
	@file_put_contents($log_file, date('c') . ' [run] ' . $line . PHP_EOL, FILE_APPEND | LOCK_EX);
	fwrite(STDOUT, $line . PHP_EOL);
};

/**
* spawn a child phase, streaming its output; returns its exit code.
*/
$spawn = function(string $script, array $args) use ($php, $run_dir, $emit) : int {
	$cmd = escapeshellarg($php) . ' ' . escapeshellarg($run_dir . '/' . $script);
	foreach ($args as $a) { $cmd .= ' ' . $a; }
	$emit('spawn: ' . $script . ' ' . implode(' ', $args));
	$code = 0;
	passthru($cmd, $code);
	$emit($script . ' exited with code ' . $code);
	return $code;
};

$log_arg    = '--log=' . escapeshellarg($log_file);
$backup_arg = '--backup-dir=' . escapeshellarg($backup_dir);

// ---------------------------------------------------------------- DRY RUN
if ($is_dry) {
	$emit('=== PREPARE V7: PREFLIGHT (dry-run) ===');
	$code = $spawn('phase1_backup_pre_update.php', ['--dry-run', $log_arg]);
	$emit('Note: the real run also executes a final diffusion ontology step '
		. '(diffusion/migration/migrate_diffusion_properties.php), which has no dry-run.');
	$emit($code === 0 ? 'Preflight PASSED. Re-run with --yes to apply.' : 'Preflight FAILED (see above).');
	exit($code);
}

// ---------------------------------------------------------------- REAL RUN
if (!$has_yes) {
	$emit('Nothing to do. Use --dry-run for a preflight, or --yes to apply the migration.');
	exit(2);
}

$emit('=== PREPARE V7: MIGRATION (real run) ===');

// Phase 1: backup + pre_update
$p1_args = ['--yes', $log_arg, $backup_arg];
if ($skip_backup) { $p1_args[] = '--skip-backup'; }
$code1 = $spawn('phase1_backup_pre_update.php', $p1_args);
if ($code1 !== 0) {
	$emit('ABORT after phase 1 (code ' . $code1 . '). No further steps run.');
	exit($code1);
}

// Phase 2: full update (fresh process ⇒ clean ontology cache)
$code2 = $spawn('phase2_update.php', ['--yes', $log_arg]);
if ($code2 !== 0) {
	$emit('Migration FAILED in phase 2 (code ' . $code2 . '). Restore from backup if needed.');
	exit($code2);
}

// Phase 3: diffusion ontology migration (isolated LAST step —
// diffusion/migration/migrate_diffusion_properties.php). The DB migration is
// already complete + version-stamped at this point; a diffusion failure is
// reported but does not undo phases 1–2.
$code3 = $spawn('phase3_diffusion.php', ['--yes', $log_arg]);
if ($code3 !== 0) {
	$emit('DATABASE migration DONE (phases 1–2, version-stamped). '
		. 'The diffusion ontology step reported code ' . $code3 . ' — see the log; it can be re-run standalone.');
	exit($code3);
}

$emit('=== PREPARE V7: DONE. v6 database migrated to the v7 data model + diffusion ontology migrated. ===');
exit(0);
