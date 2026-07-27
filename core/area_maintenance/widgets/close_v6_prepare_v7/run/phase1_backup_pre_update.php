<?php declare(strict_types=1);
/**
* PHASE 1 — backup + pre_update  (bundled-engine process)
*
* Runs in its OWN engine process. Two modes:
*
*   --dry-run  : PREFLIGHT only, writes nothing. Verifies the version gate, DB
*                connectivity and that pg_dump can actually dump THIS server (a
*                client older than the server refuses), then runs the data reformat
*                in REVIEW mode (save=false) to surface bad-data errors. An unusable
*                pg_dump FAILS the preflight (exit 4) unless --skip-backup is given:
*                the backup is the real run's first step, so it is a blocker.
*
*   (real)     : requires --yes. Takes a BLOCKING full pg_dump (abort on failure
*                unless --skip-backup), then runs update::pre_update_version(),
*                which creates dd_ontology from jer_dd. This must complete before
*                phase 2, whose fresh process then has a clean ontology cache
*                (mirroring the pre_update → logout → login → update boundary).
*
* Exit codes: 0 ok · 2 usage/boot · 3 not eligible · 4 backup failed ·
*             5 pre_update failed · 6 preflight data errors ·
*             9 died on an uncaught throwable (see prepare_v7_fail_loud)
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

// uncaught throwable / fatal ⇒ logged + non-zero exit (never a silent "success")
prepare_v7_fail_loud($log_file, 'phase1');

$log(($is_dry ? 'PREFLIGHT' : 'REAL RUN') . ' start. db=' . (defined('DEDALO_DATABASE_CONN') ? DEDALO_DATABASE_CONN : '?'));

// 1. version gate --------------------------------------------------------------
// Accepts the range [update_from, target) — any v6 at or after the descriptor's
// minimum. When the DB is PAST the minimum the descriptor must be told, because the
// engine selects it by an exact match (see version_gate::apply_update_from).
$gate = prepare_v7_version_gate::check();
$log('version gate: ' . $gate->msg);
if ($gate->result !== true) {
	$log('ABORT: database not eligible for the v6→v7 migration.');
	exit(3);
}
if ($gate->aligned === true) {
	prepare_v7_version_gate::apply_update_from($gate);
	$log('descriptor update_from aligned to ' . implode('.', $gate->current)
		. ' (declared minimum: ' . implode('.', $gate->expected) . ').');
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

// 3. pg_dump availability AND version compatibility ----------------------------
// Present is not enough: pg_dump refuses to dump a server newer than itself, which
// would abort the migration at its first step. The preflight must surface that here.
$pg_check	= prepare_v7_backup::check_pg_dump();
$pg_dump_ok	= ($pg_check->result === true);
$log('pg_dump (' . $pg_check->pg_dump . '): ' . ($pg_dump_ok ? $pg_check->msg : 'UNUSABLE'));
if (!$pg_dump_ok) {
	$log('  ' . $pg_check->msg);
}

// ---------------------------------------------------------------------- DRY RUN
if ($is_dry) {

	// A blocker, not a warning: the backup is the real run's FIRST step, so an unusable
	// pg_dump means the migration cannot start. Reporting "PREFLIGHT OK" here would be a
	// false green — the whole point of the preflight is to catch this before the button.
	// --skip-backup (a manual backup already in hand) downgrades it to a warning.
	if (!$pg_dump_ok) {
		if ($skip_backup) {
			$log('WARNING: pg_dump is unusable, but --skip-backup was passed: the real run would '
				. 'proceed WITHOUT a backup. Make sure you have a current one.');
		}else{
			$log('PREFLIGHT FAILED: the mandatory pre-migration backup cannot run.');
			$log('  ' . $pg_check->msg);
			$log('  Fix it, or re-run the preflight with --skip-backup if you already have a backup.');
			exit(4);
		}
	}

	// data-review pass (save=false): review EXACTLY the tables the real run reformats
	// (from the descriptor), so the preflight exercises the same code path on the same
	// data. Discovery is only the fallback, and is also used to report v6 tables that
	// still carry a legacy `datos` column but are NOT in the migration list.
	$ar_tables  = prepare_v7_migration_tables();
	$discovered = prepare_v7_discover_datos_tables();

	if (empty($ar_tables)) {
		$log('WARNING: the descriptor declares no reformat_matrix_data table list; '
			. 'falling back to discovery.');
		$ar_tables = $discovered;
	}

	$log('data-review tables (' . count($ar_tables) . '): ' . implode(', ', $ar_tables));

	$untouched = array_values(array_diff($discovered, $ar_tables));
	if (!empty($untouched)) {
		$log('NOTE: these tables carry a legacy `datos` column but are NOT reformatted into the '
			. 'typed v7 columns: ' . implode(', ', $untouched) . '. '
			. 'Some are still handled by the schema steps (matrix_notifications and matrix_updates '
			. 'have `datos` RENAMED to `data`, a general JSON column). The final '
			. 'drop_legacy_datos_column step only touches the reformatted list above, so no table '
			. 'ever loses `datos` without its data having been migrated first.');
	}

	if (empty($ar_tables)) {
		$log('No tables to review. '
			. 'Either already migrated, or not a v6 data layout — review manually.');
	}

	// `dd_ontology` is created by the REAL phase 1 (pre_update), so in a preflight it is
	// normally absent. The per-row progress line calls label::get_label(), which queries
	// that missing table, and the engine logs ONE error per row to PHP's error_log —
	// tens of GB on a real database. The review's own findings are RETURNED (not logged),
	// so PHP error logging is suspended for the review pass only.
	// The engine reports each finding TWICE: a short line in $review->errors (returned) and a
	// detailed one via debug_log → php's error_log (the actual offending value, e.g.
	// 'component value (dd547) out of format: "2022-01-10 17:58:37"'). That detail is what you
	// want when judging an issue, but it lands in the SYSTEM log where the widget cannot show
	// it. So point error_log at a file inside the package for the duration of the review.
	$ontology_ready	= prepare_v7_dd_ontology_exists();
	$log_errors		= ini_get('log_errors');
	$error_log_prev	= ini_get('error_log');
	$engine_log		= $paths['var_dir'] . '/data_review.engine.log';

	if (!$ontology_ready) {
		// Without the ontology every row fails its label lookup: millions of meaningless
		// lines. Suppress rather than redirect — the review's own findings are RETURNED.
		$log('NOTE: table `dd_ontology` does not exist yet (the real phase 1 creates it). '
			. 'The data review still runs, but per-row label lookups fail against it, so PHP '
			. 'error logging is suspended for the review pass (it would otherwise write one '
			. 'error per row to php error_log).');
		@ini_set('log_errors', '0');
	}else{
		@file_put_contents($engine_log, '# engine detail for the data review of ' . date('c') . PHP_EOL);
		@ini_set('error_log', $engine_log);
		$log('engine-level detail for this review → ' . $engine_log);
	}

	$review = v6_to_v7::reformat_matrix_data($ar_tables, false); // false = no save

	if (!$ontology_ready) {
		@ini_set('log_errors', (string)$log_errors);
	}else{
		@ini_set('error_log', (string)$error_log_prev);
	}

	$errors = is_array($review->errors ?? null) ? $review->errors : [];
	$log('data-review: ' . ($review->msg ?? 'n/a') . ' | reports: ' . count($errors));

	// Without `dd_ontology` no component model resolves, so EVERY value reports
	// "Ignored empty model". That is the ontology's absence (expected in a preflight),
	// not a data defect: count it once and judge the run on the remaining reports.
	if (!$ontology_ready && !empty($errors)) {
		$no_model	= 0;
		$rest		= [];
		foreach ($errors as $e) {
			if (is_string($e) && strpos($e, 'Ignored empty model') !== false) {
				$no_model++;
				continue;
			}
			$rest[] = $e;
		}
		if ($no_model > 0) {
			$log('NOTE: ' . $no_model . ' "Ignored empty model" report(s) discounted — caused by '
				. '`dd_ontology` not existing yet, not by the data. Component models can only be '
				. 'validated by a preflight run AFTER a real phase 1.');
		}
		$errors = $rest;
	}

	$n_err = count($errors);

	// One grouped summary, not a wall of near-identical lines: 34 rows failing on the same
	// tipo is ONE thing to decide about, not 34. This block is what the widget shows.
	prepare_v7_log_summary(
		$log,
		$errors,
		$ontology_ready
			? 'engine-level detail (offending values) in ' . $engine_log
			: 'component models could not be checked: dd_ontology does not exist yet'
	);

	if ($n_err > 0) {
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
		$log('ABORT before touching anything: the backup is mandatory and pg_dump is unusable.');
		$log('  ' . $pg_check->msg);
		$log('  Or pass --skip-backup if you already have a current backup.');
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
* prepare_v7_log_summary
* Writes the run's FINAL, human-readable verdict: the findings grouped by what they
* actually are, most frequent first, with one real example each.
*
* The raw list is unusable as a report — 34 rows failing on the same tipo is one
* decision, not 34 lines to read. Row ids / section ids are normalised out of the
* grouping key so identical issues collapse, and the block is delimited by markers so
* the widget can lift it out of the log and show it on its own.
*
* @param callable $log
* @param array $errors - the review's returned findings
* @param string $note  - one line of context (where the detail is, or why it is limited)
* @return void
*/
function prepare_v7_log_summary(callable $log, array $errors, string $note) : void {

	$log('=== DATA REVIEW SUMMARY ===');

	if (empty($errors)) {
		$log('No data issues found.');
		$log($note);
		$log('=== END SUMMARY ===');
		return;
	}

	// group: strip the row-specific parts so the same problem collapses into one entry
	$groups = [];
	foreach ($errors as $error) {
		$text = is_string($error) ? $error : json_encode($error);
		$key  = preg_replace(
			['/\bID \d+/', "/section_id: '[^']*'/", '/\bid: \d+/'],
			['ID *', "section_id: '*'", 'id: *'],
			$text
		);
		if (!isset($groups[$key])) {
			$groups[$key] = ['count' => 0, 'example' => $text];
		}
		$groups[$key]['count']++;
	}
	uasort($groups, static fn(array $a, array $b) : int => $b['count'] <=> $a['count']);

	$log(count($errors) . ' issue(s) in ' . count($groups) . ' distinct kind(s):');

	$shown = 0;
	foreach ($groups as $group) {
		if ($shown >= 20) {
			$log('  … and ' . (count($groups) - $shown) . ' more kind(s); see the full log.');
			break;
		}
		$log('  ' . str_pad((string)$group['count'], 6, ' ', STR_PAD_LEFT) . ' × ' . $group['example']);
		$shown++;
	}

	$log($note);
	$log('=== END SUMMARY ===');
}//end prepare_v7_log_summary


/**
* prepare_v7_dd_ontology_exists
* True when the v7 ontology table is already present (i.e. a real phase 1 has run).
* @return bool
*/
function prepare_v7_dd_ontology_exists() : bool {

	try {
		$res = matrix_db_manager::exec_search("SELECT to_regclass('public.dd_ontology') AS t", [], false);
		if ($res) {
			$row = pg_fetch_assoc($res);
			return !empty($row['t']);
		}
	} catch (\Throwable $e) {
		// unknown → assume absent, the caller only uses this to reduce log noise
	}

	return false;
}//end prepare_v7_dd_ontology_exists


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
