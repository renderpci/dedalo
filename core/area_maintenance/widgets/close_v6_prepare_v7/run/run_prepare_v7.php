<?php declare(strict_types=1);
/**
* RUN_PREPARE_V7 — orchestrator for "Close v6 / Prepare installation for v7".
*
* Thin CLI that sequences the migration as SEPARATE bundled-engine child
* processes (so each phase boots with a clean ontology cache — the CLI
* equivalent of the pre_update → logout → login → update boundary). It does NOT
* boot the engine itself; it only spawns:
*
*   --dry-run        : phase1 --dry-run                    (preflight, writes nothing)
*   --deep-preflight : phase1 --yes → phase1 --dry-run → phase3 --dry-run
*                      (backup + pre_update, then a MEANINGFUL data review and the
*                       diffusion preview; stops before the matrix rewrite)
*   (real)           : phase1 --yes [--skip-backup] → phase2 --yes → phase3 --yes
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

$opts = getopt('', ['dry-run', 'yes', 'skip-backup', 'deep-preflight', 'backup-dir:', 'log:', 'engine-root:', 'help']);

if (isset($opts['help'])) {
	fwrite(STDOUT, <<<TXT
Close v6 / Prepare installation for v7

  --dry-run              Preflight only (version gate, connectivity, pg_dump, data review). No writes.
  --deep-preflight       Backup + pre_update, then review the data WITH the ontology in place,
                         then preview the diffusion mapping. STOPS before the matrix rewrite.
                         Writes (pre_update), so it is as explicit as --yes.
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
$is_deep     = isset($opts['deep-preflight']);
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

/** Seconds between progress heartbeats distilled from a phase's row-level output. */
const PREPARE_V7_HEARTBEAT_SECONDS = 10;

/**
* spawn a child phase; returns its exit code.
*
* The engine's migration steps print ONE progress line PER ROW to stdout
* (update::tables_rows_iterator → print_cli). On a real database that is millions of
* lines — streaming it into the caller's log file produced a 285 MB spawn.log for a
* dry-run alone. So stdout is consumed here and distilled into a heartbeat: at most one
* 'progress:' line every PREPARE_V7_HEARTBEAT_SECONDS, plus the last line seen when the
* phase ends. STDERR is NOT throttled — warnings and fatals go to the log verbatim,
* because that is where a phase death is diagnosed.
*/
$spawn = function(string $script, array $args) use ($php, $run_dir, $emit) : int {

	$cmd = escapeshellarg($php) . ' ' . escapeshellarg($run_dir . '/' . $script);
	foreach ($args as $a) { $cmd .= ' ' . $a; }
	$emit('spawn: ' . $script . ' ' . implode(' ', $args));

	$descriptors = [
		1 => ['pipe', 'w'],
		2 => ['pipe', 'w']
	];
	$pipes = [];
	$proc = proc_open($cmd, $descriptors, $pipes);
	if (!is_resource($proc)) {
		$emit($script . ': FAILED to start the child process.');
		return 1;
	}

	stream_set_blocking($pipes[1], false);
	stream_set_blocking($pipes[2], false);

	$buffer		= [1 => '', 2 => ''];
	$last_out	= '';
	$last_beat	= 0;
	$lines_out	= 0;

	while (!empty($pipes)) {

		$read	= array_values($pipes);
		$write	= null;
		$except	= null;
		if (@stream_select($read, $write, $except, 1) === false) {
			break;
		}

		foreach ($pipes as $fd => $pipe) {

			if (!in_array($pipe, $read, true)) {
				if (feof($pipe)) { fclose($pipe); unset($pipes[$fd]); }
				continue;
			}

			$chunk = fread($pipe, 65536);
			if ($chunk === false || ($chunk === '' && feof($pipe))) {
				fclose($pipe);
				unset($pipes[$fd]);
				continue;
			}
			$buffer[$fd] .= $chunk;

			// consume whole lines only
			while (($pos = strpos($buffer[$fd], "\n")) !== false) {
				$line = rtrim(substr($buffer[$fd], 0, $pos), "\r");
				$buffer[$fd] = substr($buffer[$fd], $pos + 1);
				if ($line === '') {
					continue;
				}
				if ($fd === 2) {
					$emit($script . ' [stderr] ' . $line); // never throttled
					continue;
				}
				$lines_out++;
				$last_out = $line;
				$now = time();
				if (($now - $last_beat) >= PREPARE_V7_HEARTBEAT_SECONDS) {
					$last_beat = $now;
					$emit($script . ' progress: ' . mb_strimwidth($line, 0, 300, '…'));
				}
			}
		}
	}

	$code = proc_close($proc);

	if ($last_out !== '' && $lines_out > 0) {
		$emit($script . ' last output (' . $lines_out . ' lines): ' . mb_strimwidth($last_out, 0, 300, '…'));
	}
	$emit($script . ' exited with code ' . $code);

	return $code;
};

$log_arg    = '--log=' . escapeshellarg($log_file);
$backup_arg = '--backup-dir=' . escapeshellarg($backup_dir);

// ---------------------------------------------------------------- DRY RUN
if ($is_dry) {
	$emit('=== PREPARE V7: PREFLIGHT (dry-run) ===');
	$code = $spawn('phase1_backup_pre_update.php', ['--dry-run', $log_arg]);

	// Diffusion preview. It needs dd_ontology (built by the REAL phase 1), so on an
	// unmigrated database it reports "unavailable yet" and exits 0 — it never turns a
	// passing preflight into a failure.
	$spawn('phase3_diffusion.php', ['--dry-run', $log_arg]);

	$emit($code === 0 ? 'Preflight PASSED. Re-run with --yes to apply.' : 'Preflight FAILED (see above).');
	exit($code);
}

// --------------------------------------------------------- DEEP PREFLIGHT
// The plain preflight reviews the data BEFORE dd_ontology exists, so no component
// model resolves and every value degenerates into "Ignored empty model" — it cannot
// tell you anything about your data. This mode fixes the ordering: it runs the real
// phase 1 (backup + pre_update), which only ADDS the v7 ontology (new jer_dd columns
// filled from the legacy ones, which stay; new dd_ontology table) and does NOT touch
// matrix data, then re-runs the review with the ontology in place — so the reported
// issues are real — and finally previews the diffusion mapping, which also needs
// dd_ontology. It stops before phase 2, the step that rewrites the matrix tables.
//
// Re-runnable: pre_update is guarded/idempotent and the legacy jer_dd data is intact,
// so the ontology can be rebuilt. Phase 2 continues from this state when you are ready.
if ($is_deep) {

	$emit('=== PREPARE V7: DEEP PREFLIGHT (backup + pre_update, then review) ===');
	$emit('Matrix data is NOT rewritten in this mode; it stops before phase 2.');

	$p1_args = ['--yes', $log_arg, $backup_arg];
	if ($skip_backup) { $p1_args[] = '--skip-backup'; }
	$code1 = $spawn('phase1_backup_pre_update.php', $p1_args);
	if ($code1 !== 0) {
		$emit('ABORT after phase 1 (code ' . $code1 . '). No review ran.');
		exit($code1);
	}

	$emit('pre_update done: dd_ontology is in place and matrix data is untouched. '
		. 'Reviewing the data again, now that component models resolve …');
	$code_review = $spawn('phase1_backup_pre_update.php', ['--dry-run', $log_arg]);

	$emit('Previewing the diffusion ontology mapping (now possible: dd_ontology exists) …');
	$spawn('phase3_diffusion.php', ['--dry-run', $log_arg]);

	if ($code_review === 6) {
		$emit('DEEP PREFLIGHT: data issues found — see the reports above. '
			. 'Fix or accept them, then run --yes to apply the full migration.');
	}else if ($code_review === 0) {
		$emit('DEEP PREFLIGHT PASSED: no data issues with the ontology in place. '
			. 'Run --yes to apply the full migration.');
	}else{
		$emit('DEEP PREFLIGHT: the review ended with code ' . $code_review . ' — see above.');
	}
	$emit('The database now carries the v7 ontology (dd_ontology) and the ORIGINAL v6 data. '
		. 'Phase 2 (--yes) is what rewrites the matrix tables.');

	exit($code_review);
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
