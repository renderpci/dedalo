<?php
/**
 * Publish a WHOLE v6 diffusion element (every section, every record) into the harness
 * MariaDB database and snapshot the result — the v6 reference side of the parity loop.
 *
 * Usage:
 *   HARNESS_DB=web_madres_e_hijas php run_v6_diffusion_full.php <element_tipo> [options]
 *
 * Options:
 *   --sections=a,b            restrict to these section tipos (default: all in the tables map)
 *   --no-refresh              do NOT drop the harness tables first (accumulate)
 *   --yes-drop                confirm dropping a harness database that is not already empty
 *   --out=FILE                row snapshot destination   (default helpers/out/v6_full_result.json)
 *   --run-info=FILE           run metadata destination   (default helpers/out/v6_full_run_info.json)
 *   --print-env-only          print the run environment as JSON and exit (langs, media_url, …)
 *   --check-only              run the safety belt (element target DB vs HARNESS_DB) and exit
 *
 * THERE IS NO --limit-per-section. A per-record limit could not be made symmetric with the v7
 * publisher across the frontier-hop resolver, and an asymmetric limit produces a huge bogus diff
 * that hides every real finding. Restrict a smoke run with --sections=<tipo> on BOTH sides.
 *
 * Exit: 0 ok · 1 one or more errors during publication · 2 usage / refusal
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SCRIPT EXISTS INSTEAD OF tool_diffusion::export_list()
 *
 * export_list() cannot run from the CLI as-is:
 *   · its list branch reads the per-user session SQO ($_SESSION['dedalo']['config']['sqo'][…]),
 *     which does not exist outside a browser session, and
 *   · it creates a DEDALO_BULK_PROCESS_SECTION_TIPO record in the v6 Postgres on every call,
 *     which would pollute the source database once per parity iteration.
 * So we replicate its 1000-row chunk loop here, build the SQO ourselves, and call the public
 * static tool_diffusion::iterate_rows() directly with diffusion::$bulk_process_id = null.
 *
 * PARITY KNOBS ARE SET EXPLICITLY, NOT INHERITED. Both live in $_SESSION and both silently
 * change the published bytes, so leaving them at "whatever the environment happens to hold"
 * makes a run unreproducible:
 *   · DEDALO_DIFFUSION_RESOLVE_LEVELS = 2  — matches the v7 plan.recursion.maxLevels
 *   · skip_publication_state_check     = 0  — publish only records in a publishable state
 *
 * ONE PROCESS, ONE TIMESTAMP — AND v6 RUNS FIRST.
 * diffusion::get_publication_unix_timestamp() is a function-static memo: it calls time() once and
 * returns that same value for the rest of the process, and there is NO injection point. It can
 * therefore only be pinned by letting THIS process choose it and reporting the value it actually
 * used. Capturing it as the first thing after bootstrap and running every section inside this ONE
 * process makes every column fed by process_dato='diffusion::get_publication_unix_timestamp'
 * (actv104, rsc712, rsc1209, hierarchy78 on mht) comparable instead of noise.
 *
 * So the orchestrator runs v6 FIRST, reads run_started_at out of the run info written below, and
 * hands it to the v7 pass via --run-started-at. A separate "print the timestamp" process would be
 * useless: the real publish process would memoise a fresh time() of its own.
 * The v6 write-back below cannot contaminate the v7 read — v6 writes Postgres dedalo_v6_mht and
 * v7 reads dedalo_v7_mht, different databases.
 */

// CLI ONLY -- checked BEFORE the bootstrap, deliberately.
// This script forges an is_developer + is_global_admin session with no credential check and
// then does destructive work. The guard exists to keep it unreachable over HTTP: the package
// .htaccess ('Require all denied') is Apache-only and INERT under nginx, where the operator
// must hand-add a deny rule. Same position and reason as run/lib/engine_boot.php:28.
if (PHP_SAPI !== 'cli' || isset($_SERVER['REQUEST_METHOD'])) {
    header('HTTP/1.1 403 Forbidden', true, 403);
    die("This helper can only be run from the command line\n");
}

ob_start();
require_once __DIR__ . '/../../../../../../../../config/config.php';
ob_end_clean();
require_once __DIR__ . '/_harness_dump.php';

// --- resolve the harness database ---
// Locally, NOT from HARNESS_SCRATCH_DB: that constant still carries the historical numisdata
// literal for the legacy destructive callers (removed 2026-08 with run_compare.sh), and this
// script DROPS EVERY TABLE of whatever it resolves. There is no default — an unset HARNESS_DB is
// a refusal, never a guess.
	$harness_db = getenv('HARNESS_DB');
	$harness_db = (is_string($harness_db) && $harness_db !== '') ? $harness_db : null;

// --- login as root developer (dev server) ---
// Must precede any publication: update_publication_data() stamps logged_user_id().
	$_SESSION['dedalo']['auth']['user_id']			= 1;
	$_SESSION['dedalo']['auth']['username']			= 'root';
	$_SESSION['dedalo']['auth']['full_username']	= 'root';
	$_SESSION['dedalo']['auth']['is_developer']		= true;
	$_SESSION['dedalo']['auth']['is_global_admin']	= true;
	$_SESSION['dedalo']['auth']['is_logged']		= 1;

// --- PIN THE PUBLICATION TIMESTAMP (must be the first statement after bootstrap+login) ---
	$run_started_at = diffusion::get_publication_unix_timestamp();

// --- args ---
	$element			= null;
	$only_sections		= [];
	$refresh			= true;
	$yes_drop			= false;
	// Default artifacts go under helpers/out/, which .gitignore covers. helpers/ itself is
	// tracked and a whole-element row snapshot is tens of MB.
	$out_file			= __DIR__ . '/out/v6_full_result.json';
	$run_info_file		= __DIR__ . '/out/v6_full_run_info.json';
	$env_only			= false;
	$check_only			= false;

	foreach (array_slice($argv, 1) as $a) {
		if (str_starts_with($a, '--sections=')) {
			$only_sections = array_values(array_filter(array_map('trim', explode(',', substr($a, 11)))));
		} elseif (str_starts_with($a, '--out=')) {
			$out_file = substr($a, 6);
		} elseif (str_starts_with($a, '--run-info=')) {
			$run_info_file = substr($a, 11);
		} elseif ($a === '--no-refresh') {
			$refresh = false;
		} elseif ($a === '--yes-drop') {
			$yes_drop = true;
		} elseif ($a === '--print-env-only') {
			$env_only = true;
		} elseif ($a === '--check-only') {
			$check_only = true;
		} elseif (str_starts_with($a, '--')) {
			fwrite(STDERR, "run_v6_diffusion_full: unknown option '$a'\n");
			exit(2);
		} elseif ($element === null) {
			$element = $a;
		} else {
			fwrite(STDERR, "run_v6_diffusion_full: unexpected argument '$a'\n");
			exit(2);
		}
	}

// --- --print-env-only. The environment the v7 pass must be reconciled to; mutates nothing ---
	if ($env_only===true) {
		// NO run_started_at here on purpose. This is a DIFFERENT process from the one that
		// publishes, and get_publication_unix_timestamp() memoises a fresh time() per process,
		// so a value printed here would not be the value the publish actually uses. The
		// authoritative value is the one the real run writes into its run info.
		echo json_encode([
			'langs'				=> defined('DEDALO_DIFFUSION_LANGS') ? array_values((array)DEDALO_DIFFUSION_LANGS) : [],
			'media_url'			=> defined('DEDALO_MEDIA_URL') ? DEDALO_MEDIA_URL : null,
			'diffusion_domain'	=> defined('DEDALO_DIFFUSION_DOMAIN') ? DEDALO_DIFFUSION_DOMAIN : null,
			'resolve_levels'	=> 2,
			'harness_db'		=> $harness_db
		], JSON_UNESCAPED_SLASHES) . "\n";
		exit(0);
	}

	if (empty($element)) {
		fwrite(STDERR, "run_v6_diffusion_full: <element_tipo> is required\n");
		exit(2);
	}

	if (empty($harness_db)) {
		fwrite(STDERR,
			"run_v6_diffusion_full: REFUSING TO RUN — no harness database resolved.\n" .
			"  Set HARNESS_DB to the MariaDB database this run may publish into (and DROP).\n" .
			"  There is no default: a missing expectation is a refusal, never 'trust the ontology'.\n"
		);
		exit(2);
	}

// --- resolve the element tables map (authoritative: it is what the writer itself uses) ---
	$tables_map = diffusion_sql::get_diffusion_element_tables_map($element);
	if (empty($tables_map) || !is_object($tables_map) || count((array)$tables_map)===0) {
		fwrite(STDERR, "run_v6_diffusion_full: no tables map resolved for element '$element'\n");
		exit(2);
	}

// --- SAFETY BELT ---
// The old diffusion_sql::$database_name redirection is commented out in
// class.diffusion_sql.php (:142-155), so it CANNOT send writes anywhere. The only real
// protection is to read where this element actually writes and refuse to run if that is
// not the harness database.
	$target_databases = [];
	foreach ((array)$tables_map as $section_tipo => $map) {
		$db = $map->database_name ?? null;
		if (!empty($db)) {
			$target_databases[$db] = true;
		}
	}
	$target_databases = array_keys($target_databases);

	if ($target_databases !== [$harness_db]) {
		fwrite(STDERR,
			"run_v6_diffusion_full: REFUSING TO RUN.\n" .
			"  element '$element' publishes into: " . implode(', ', $target_databases) . "\n" .
			"  harness database (HARNESS_DB)    : $harness_db\n" .
			"  These must be identical. v6 writes to the database declared in the ontology;\n" .
			"  there is no runtime redirection.\n" .
			"  PREFERRED FIX: point the ELEMENT at a scratch database and set HARNESS_DB to it.\n" .
			"  Pointing HARNESS_DB at the element's real publication database instead makes this\n" .
			"  harness drop and rewrite every table of that real database on every pass.\n"
		);
		exit(2);
	}

// --- --check-only. The safety belt passed; report and exit without touching anything ---
	if ($check_only===true) {
		echo "OK: element '$element' publishes into '$harness_db' (" . count((array)$tables_map) . " section table(s))\n";
		exit(0);
	}

// --- sections to publish ---
	$all_sections = array_keys((array)$tables_map);
	sort($all_sections);
	if (!empty($only_sections)) {
		$unknown = array_values(array_diff($only_sections, $all_sections));
		if (!empty($unknown)) {
			fwrite(STDERR, 'run_v6_diffusion_full: --sections contains tipos not in the tables map: ' . implode(', ', $unknown) . "\n");
			exit(2);
		}
		// Sort the restricted list too: the v7 twin sorts UNCONDITIONALLY, and section order is what
		// decides which projection survives given v6's first-write-wins vs v7's last-write-wins dedupe.
		// Without this, --sections=rt1,mht4 walks v6 as [rt1,mht4] and v7 as [mht4,rt1].
		$sections = $only_sections;
		sort($sections);
	} else {
		$sections = $all_sections;
	}

// --- diffusion class for this element ---
	$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
	if (!isset($ar_diffusion_map_elements[$element])) {
		fwrite(STDERR, "run_v6_diffusion_full: element '$element' not found in the diffusion map of domain " . DEDALO_DIFFUSION_DOMAIN . "\n");
		exit(2);
	}
	$diffusion_class_name = $ar_diffusion_map_elements[$element]->class_name;
	require_once DEDALO_CORE_PATH . '/diffusion/class.' . $diffusion_class_name . '.php';

// --- parity knobs. Explicit, never inherited ---
	$resolve_levels = 2; // matches the v7 plan.recursion.maxLevels
	$_SESSION['dedalo']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS']	= $resolve_levels;
	$_SESSION['dedalo']['config']['skip_publication_state_check']	= 0;

// --- no bulk process record. export_list() creates one in Postgres; we must not ---
	diffusion::$bulk_process_id = null;

// --- LOUD WARNING: this run mutates the v6 SOURCE database ---
	$media_url	= defined('DEDALO_MEDIA_URL') ? DEDALO_MEDIA_URL : null;
	$langs		= defined('DEDALO_DIFFUSION_LANGS') ? (array)DEDALO_DIFFUSION_LANGS : [];

	fwrite(STDERR,
		"\n" .
		"╔══════════════════════════════════════════════════════════════════════════════╗\n" .
		"║  WARNING — THIS RUN IS DESTRUCTIVE ON TWO DATABASES                           ║\n" .
		"╚══════════════════════════════════════════════════════════════════════════════╝\n" .
		"  1. MariaDB '$harness_db' — unless --no-refresh is given, EVERY TABLE in this\n" .
		"     database is DROPPED before publishing (see the inventory printed below).\n" .
		"\n" .
		"  2. The v6 SOURCE Postgres — diffusion_sql::update_record() calls\n" .
		"     diffusion::update_publication_data() for EVERY published record, which saves 4\n" .
		"     publication components (publication_first / publication_last + their user\n" .
		"     components). The source therefore DRIFTS run over run: after the first pass the\n" .
		"     'first publication' components exist and are no longer written, and the 'last\n" .
		"     publication' date advances on every pass.\n" .
		"     Worse, the drift is not confined to those components. save_tm=false is set only\n" .
		"     on the publication_FIRST pair and on publication_last_USER\n" .
		"     (class.diffusion.php:1462, :1484, :1528); the publication_LAST DATE component is\n" .
		"     saved with time-machine recording ON (:1501-1507), so every pass also APPENDS a\n" .
		"     matrix time-machine row per published record to the v6 source Postgres.\n" .
		"     A repeatable v6 pass therefore REQUIRES a Postgres snapshot taken before the\n" .
		"     first pass and restored before each subsequent one — dropping the MariaDB\n" .
		"     harness tables is not enough.\n" .
		"\n"
	);

	fwrite(STDERR, sprintf(
		"[v6] element=%s db=%s sections=%d run_started_at=%d langs=%d media_url=%s resolve_levels=%d\n",
		$element, $harness_db, count($sections), $run_started_at, count($langs), (string)$media_url, $resolve_levels
	));

// --- refresh the harness DB ---
// The safety belt above only proves HARNESS_DB is the element's own publication database — which
// on a normal install is a REAL database. So say out loud what is about to be destroyed and, when
// it is not already empty, require an explicit go-ahead.
	if ($refresh===true) {

		$existing		= harness_dump_scratch($harness_db);
		$table_count	= count($existing);
		$row_count		= array_sum(array_map(fn($rows) => count($rows), $existing));
		unset($existing);

		fwrite(STDERR, sprintf(
			"[v6] about to DROP EVERY TABLE in MariaDB '%s': %d table(s), %d row(s)\n",
			$harness_db, $table_count, $row_count
		));

		if ($table_count > 0 && $yes_drop!==true) {
			$confirmed = false;
			if (defined('STDIN') && stream_isatty(STDIN)) {
				fwrite(STDERR, "[v6] type the database name to confirm the drop: ");
				$typed = trim((string)fgets(STDIN));
				$confirmed = ($typed === $harness_db);
			}
			if ($confirmed!==true) {
				fwrite(STDERR,
					"run_v6_diffusion_full: REFUSING TO DROP a non-empty database.\n" .
					"  '$harness_db' holds $table_count table(s) / $row_count row(s).\n" .
					"  Re-run with --yes-drop if that is really the harness database, or with\n" .
					"  --no-refresh to publish on top of what is already there.\n"
				);
				exit(2);
			}
		}

		harness_refresh_scratch($harness_db);
		fwrite(STDERR, "[v6] harness database refreshed ($table_count table(s) dropped)\n");
	} else {
		// C5: neither publisher truncates, so keeping the existing tables means the snapshot
		// below can contain rows this run did not write.
		fwrite(STDERR, "[v6] --no-refresh: keeping existing harness tables — the snapshot may\n" .
			"     contain rows from a PREVIOUS run, which are indistinguishable from this run's\n" .
			"     output. Do not use --no-refresh for a parity comparison.\n");
	}

// --- publish, section by section ---
	$errors			= [];
	$section_counts	= [];
	$chunk_n_rows	= 1000; // same chunk size as tool_diffusion::export_list

	foreach ($sections as $section_tipo) {

		$counter = 0;

		// pdata. iterate_rows() takes it by reference and only reads/writes it under CLI
		$pdata = new stdClass();
			$pdata->msg		= 'Processing';
			$pdata->counter	= 0;
			$pdata->total	= 0;
			$pdata->current	= new stdClass();
				$pdata->current->section_tipo = $section_tipo;
			$pdata->total_ms	= 0;
			$pdata->errors		= [];

		// sqo. Built here rather than read from the session (there is no session in CLI)
		$sqo = (object)[
			'section_tipo'	=> [$section_tipo],
			'limit'			=> $chunk_n_rows,
			'offset'		=> 0,
			'order'			=> false
		];

		try {
			$search = search::get_instance($sqo);
		} catch (Throwable $t) {
			$errors[] = "[$section_tipo] search instance failed: " . $t->getMessage();
			$section_counts[$section_tipo] = 0;
			continue;
		}

		// iterate as long as records are found (export_list's chunk loop).
		// EVERY record of the section is published: there is no per-record limit, because it
		// could not be made symmetric with the v7 side (see the docblock).
		while (true) {

			try {
				$rows_data = $search->search();
			} catch (Throwable $t) {
				$errors[] = "[$section_tipo] search failed at offset {$sqo->offset}: " . $t->getMessage();
				break;
			}

			$found_records = count($rows_data->ar_records ?? []);
			if ($found_records < 1) {
				break;
			}

			try {
				$chunk_response = tool_diffusion::iterate_rows(
					$rows_data->ar_records,	// rows
					$element,				// diffusion_element_tipo
					$diffusion_class_name,	// diffusion class
					$counter,				// by reference
					$pdata					// by reference
				);
				foreach (($chunk_response->errors ?? []) as $e) {
					$errors[] = "[$section_tipo] $e";
				}
			} catch (Throwable $t) {
				$errors[] = "[$section_tipo] iterate_rows exception: " . $t->getMessage();
				break;
			}

			if ($found_records < $sqo->limit) {
				break;
			}

			$sqo->offset = $sqo->offset + $found_records;

			gc_collect_cycles();
		}

		$section_counts[$section_tipo] = $counter;
		fwrite(STDERR, "[v6] section $section_tipo: $counter record(s)\n");
	}

// --- snapshot the harness database ---
	foreach ([$out_file, $run_info_file] as $f) {
		$dir = dirname($f);
		if (!is_dir($dir) && !mkdir($dir, 0777, true) && !is_dir($dir)) {
			fwrite(STDERR, "run_v6_diffusion_full: cannot create directory $dir\n");
			exit(2);
		}
	}

	$dump = harness_dump_scratch($harness_db);
	$json = json_encode($dump, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	if ($json === false || file_put_contents($out_file, $json) === false) {
		fwrite(STDERR, "run_v6_diffusion_full: failed writing $out_file\n");
		exit(2);
	}

// --- run info. Everything the comparator needs to interpret the snapshot ---
	$run_info = [
		'side'					=> 'v6',
		'element'				=> $element,
		'database'				=> $harness_db,
		'run_started_at'		=> $run_started_at,
		'run_started_at_iso'	=> date('c', $run_started_at),
		'langs'					=> array_values($langs),
		'langs_count'			=> count($langs),
		'media_url'				=> $media_url,
		'resolve_levels'		=> $resolve_levels,
		'skip_publication_state_check'	=> 0,
		'diffusion_class'		=> $diffusion_class_name,
		'diffusion_domain'		=> defined('DEDALO_DIFFUSION_DOMAIN') ? DEDALO_DIFFUSION_DOMAIN : null,
		'sections'				=> array_values($sections),
		'sections_available'	=> $all_sections,
		'refreshed'				=> $refresh,
		'section_row_counts'	=> $section_counts,
		'records_published'		=> array_sum($section_counts),
		'tables_dumped'			=> count($dump),
		'table_row_counts'		=> array_map(fn($rows) => count($rows), $dump),
		'errors'				=> $errors,
		'errors_count'			=> count($errors)
	];
	file_put_contents(
		$run_info_file,
		json_encode($run_info, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
	);

	fwrite(STDERR, '[v6] tables: ' . json_encode($run_info['table_row_counts']) . "\n");
	echo 'v6 rows     -> ' . $out_file . ' (' . count($dump) . " tables)\n";
	echo 'v6 run info -> ' . $run_info_file . "\n";

	if (!empty($errors)) {
		fwrite(STDERR, '[v6] ' . count($errors) . " ERROR(S):\n");
		foreach (array_slice($errors, 0, 20) as $e) {
			fwrite(STDERR, "  · $e\n");
		}
		if (count($errors) > 20) {
			fwrite(STDERR, '  · … ' . (count($errors) - 20) . " more (see $run_info_file)\n");
		}
		exit(1);
	}

	exit(0);
