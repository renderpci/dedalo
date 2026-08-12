<?php
/**
 * Drop every table in the harness MariaDB database — nothing else.
 *
 * Used BEFORE EVERY publication pass of the parity loop, not only between them. Neither
 * publisher truncates: v7 does idempotent upserts keyed by (section_id,lang) and v6 creates a
 * table only when it writes its first row, so a leftover table set from a PREVIOUS run is
 * indistinguishable from freshly published rows. A v7 pass that publishes nothing would then be
 * dumped as the previous run's v6 output and read back as PARITY.
 *
 * The database itself is never dropped, only its tables, so a non-admin MariaDB user
 * (render_dev) can run this.
 *
 * Usage:
 *   HARNESS_DB=web_madres_e_hijas php harness_refresh_only.php
 *   php harness_refresh_only.php --db=web_madres_e_hijas
 *
 * There is NO default database. This script DROPS TABLES, so it refuses to guess: the target
 * must come from $HARNESS_DB or --db=. In particular it must never inherit the historical
 * numisdata HARNESS_SCRATCH_DB literal that _harness_dump.php still defines for its legacy
 * callers.
 *
 * Exit: 0 ok · 2 usage/IO error
 */

ob_start();
require_once __DIR__ . '/../../../../../../../../config/config.php';
ob_end_clean();
require_once __DIR__ . '/_harness_dump.php';

// --- args ---
	$db = getenv('HARNESS_DB');
	$db = (is_string($db) && $db !== '') ? $db : null;
	$count_only = false;
	foreach (array_slice($argv, 1) as $a) {
		if (str_starts_with($a, '--db=')) {
			$db = substr($a, 5);
		} elseif ($a === '--count-only') {
			$count_only = true;
		} else {
			fwrite(STDERR, "harness_refresh_only: unknown option '$a'\n");
			exit(2);
		}
	}

	if (empty($db)) {
		fwrite(STDERR, "harness_refresh_only: no database resolved (set HARNESS_DB or pass --db=)\n");
		exit(2);
	}

// --- inventory what is about to be destroyed ---
	// COUNT(*) per table, not harness_dump_scratch(): a whole-element snapshot is tens of MB and
	// this runs twice per parity run purely to answer "is this database empty".
	try {
		$conn = harness_admin_conn();
		mysqli_select_db($conn, $db);
		$tables = [];
		$res = mysqli_query($conn, 'SHOW TABLES');
		while ($res && ($row = mysqli_fetch_array($res, MYSQLI_NUM))) {
			$tables[] = $row[0];
		}
		$rows_total = 0;
		foreach ($tables as $t) {
			$cres = mysqli_query($conn, "SELECT COUNT(*) FROM `$t`");
			if ($cres && ($c = mysqli_fetch_array($cres, MYSQLI_NUM))) {
				$rows_total += (int)$c[0];
			}
		}
		mysqli_close($conn);
	} catch (Throwable $t) {
		fwrite(STDERR, 'harness_refresh_only: ' . $t->getMessage() . "\n");
		exit(2);
	}

	// --count-only is the orchestrator's drop gate: report, destroy nothing.
	if ($count_only===true) {
		echo count($tables), ' ', $rows_total, "\n";
		exit(0);
	}

	fwrite(STDERR, sprintf(
		"[refresh] %s currently holds %d table(s), %d row(s) — dropping all of them\n",
		$db, count($tables), $rows_total
	));

// --- refresh ---
	try {
		harness_refresh_scratch($db);
	} catch (Throwable $t) {
		fwrite(STDERR, 'harness_refresh_only: ' . $t->getMessage() . "\n");
		exit(2);
	}

	echo "refreshed (all tables dropped): $db\n";

	exit(0);
