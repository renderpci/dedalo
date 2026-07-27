<?php declare(strict_types=1);
/**
* PHASE 1 — backup + pre_update  (bundled-engine process)
*
* Runs in its OWN engine process. Two modes:
*
*   --dry-run  : PREFLIGHT only, writes nothing. Verifies the version gate, DB
*                connectivity and pg_dump availability, then runs the data
*                reformat in REVIEW mode (save=false) to surface bad-data errors.
*
*   (real)     : requires --yes. Takes a BLOCKING full pg_dump (abort on failure
*                unless --skip-backup), then runs update::pre_update_version(),
*                which creates dd_ontology from jer_dd. This must complete before
*                phase 2, whose fresh process then has a clean ontology cache
*                (mirroring the pre_update → logout → login → update boundary).
*
* Exit codes: 0 ok · 2 usage/boot · 3 not eligible · 4 backup failed ·
*             5 pre_update failed · 6 preflight data errors
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/

require_once __DIR__ . '/lib/engine_boot.php';
$paths = prepare_v7_boot_engine();

$opts        = getopt('', ['dry-run', 'skip-backup', 'yes', 'backup-dir:', 'log:']);
$is_dry      = isset($opts['dry-run']);
$skip_backup = isset($opts['skip-backup']);
$has_yes     = isset($opts['yes']);
$backup_dir  = $opts['backup-dir'] ?? ($paths['var_dir'] . '/backup');
$log_file    = $opts['log']        ?? ($paths['var_dir'] . '/prepare_v7.log');

/** append one line to the log file and echo it */
$log = function(string $line) use ($log_file) : void {
	$stamp = date('c') . ' [phase1] ';
	@file_put_contents($log_file, $stamp . $line . PHP_EOL, FILE_APPEND | LOCK_EX);
	fwrite(STDOUT, $line . PHP_EOL);
};

$log(($is_dry ? 'PREFLIGHT' : 'REAL RUN') . ' start. db=' . (defined('DEDALO_DATABASE_CONN') ? DEDALO_DATABASE_CONN : '?'));

// 1. version gate --------------------------------------------------------------
$gate = prepare_v7_version_gate::check();
$log('version gate: ' . $gate->msg);
if ($gate->result !== true) {
	$log('ABORT: database not eligible for the v6→v7 migration.');
	exit(3);
}

// 2. DB connectivity sanity ----------------------------------------------------
$ping = false;
try {
	$res  = DBi::_getConnection();
	$ping = ($res !== false);
} catch (\Throwable $e) {
	$log('DB connection error: ' . $e->getMessage());
}
if ($ping !== true) {
	$log('ABORT: cannot connect to the database.');
	exit(2);
}
$log('DB connectivity: OK');

// 3. pg_dump availability ------------------------------------------------------
$pg_dump = system::get_pg_bin_path() . 'pg_dump';
$probe_out = []; $probe_code = 0;
DBi::pg_exec(escapeshellarg($pg_dump) . ' --version', $probe_out, $probe_code);
$pg_dump_ok = ($probe_code === 0);
$log('pg_dump (' . $pg_dump . '): ' . ($pg_dump_ok ? trim(implode(' ', $probe_out)) : 'NOT AVAILABLE'));

// ---------------------------------------------------------------------- DRY RUN
if ($is_dry) {

	if (!$pg_dump_ok) {
		$log('WARNING: pg_dump not available — the real run will refuse unless --skip-backup.');
	}

	// data-review pass (save=false): discover v6 source tables (those still
	// carrying the legacy `datos` column) and run the reformat in review mode.
	$ar_tables = prepare_v7_discover_datos_tables();
	$log('data-review tables (' . count($ar_tables) . '): ' . implode(', ', $ar_tables));

	if (empty($ar_tables)) {
		$log('No tables with a legacy `datos` column found. '
			. 'Either already migrated, or not a v6 data layout — review manually.');
	}

	$review = v6_to_v7::reformat_matrix_data($ar_tables, false); // false = no save
	$n_err  = is_array($review->errors ?? null) ? count($review->errors) : 0;
	$log('data-review: ' . ($review->msg ?? 'n/a') . ' | errors: ' . $n_err);
	if ($n_err > 0) {
		foreach (array_slice($review->errors, 0, 50) as $e) {
			$log('  · ' . $e);
		}
		$log('PREFLIGHT found ' . $n_err . ' data issue(s). Review before running for real.');
		exit(6);
	}

	$log('PREFLIGHT OK. Re-run with --yes to apply the migration.');
	exit(0);
}

// ------------------------------------------------------------------- REAL RUN
if (!$has_yes) {
	$log('Refusing to write without --yes.');
	exit(2);
}

// 4. blocking backup (unless explicitly skipped) -------------------------------
if ($skip_backup) {
	$log('Backup SKIPPED (--skip-backup). Ensure you have a current backup.');
} else {
	if (!$pg_dump_ok) {
		$log('ABORT: pg_dump not available and backup is mandatory. '
			. 'Install PostgreSQL client tools or pass --skip-backup with a manual backup.');
		exit(4);
	}
	$log('Backup starting (blocking pg_dump -F c) → ' . $backup_dir);
	$bk = prepare_v7_backup::run($backup_dir);
	$log('Backup: ' . $bk->msg);
	if ($bk->result !== true) {
		$log('ABORT: backup failed; migration will not proceed.');
		exit(4);
	}
}

// 5. pre_update (creates dd_ontology from jer_dd) ------------------------------
$log('pre_update_version() starting …');
$pre = update::pre_update_version();
$log('pre_update_version(): result=' . var_export($pre->result ?? false, true) . ' | ' . ($pre->msg ?? ''));
if (($pre->result ?? false) !== true) {
	if (!empty($pre->errors)) {
		foreach ($pre->errors as $e) { $log('  · ' . $e); }
	}
	$log('ABORT: pre_update failed. Restore from the backup before retrying.');
	exit(5);
}

$log('PHASE 1 done. dd_ontology provisioned.');
exit(0);


/**
* prepare_v7_discover_datos_tables
* Discover matrix tables that still carry the legacy v6 `datos` column — the
* exact set reformat_matrix_data() must process. Self-contained so the review
* does not depend on the private $ar_tables list inside updates.php.
* @return array<int,string>
*/
function prepare_v7_discover_datos_tables() : array {

	$sql = "SELECT table_name
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND column_name  = 'datos'
		  AND table_name LIKE 'matrix%'
		  AND table_name <> 'matrix_time_machine'
		ORDER BY table_name";
	$out = [];
	try {
		$res = matrix_db_manager::exec_search($sql, [], false);
		if ($res) {
			while ($row = pg_fetch_assoc($res)) {
				$out[] = $row['table_name'];
			}
		}
	} catch (\Throwable $e) {
		// leave empty on error; caller logs the empty set
	}

	return $out;
}//end prepare_v7_discover_datos_tables
