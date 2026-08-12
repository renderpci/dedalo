<?php
/**
 * Dump the harness MariaDB database — rows or schema — to a JSON file.
 *
 * Thin CLI wrapper around _harness_dump.php. It bootstraps the v6 config only to
 * pick up the MYSQL_DEDALO_* connection constants; it resolves the target database
 * from $HARNESS_DB (or --db=), never from a literal and never from HARNESS_SCRATCH_DB.
 *
 * Usage:
 *   HARNESS_DB=web_madres_e_hijas php harness_dump_db.php --out=rows.json
 *   HARNESS_DB=web_madres_e_hijas php harness_dump_db.php --schema --out=schema.json
 *
 * Options:
 *   --out=FILE   destination JSON file (required)
 *   --schema     dump SHOW COLUMNS structure instead of rows
 *   --db=NAME    the database to dump (defaults to $HARNESS_DB; there is no literal default)
 *
 * Exit: 0 ok · 2 usage/IO error
 */

ob_start();
require_once __DIR__ . '/../../../../../../../../config/config.php';
ob_end_clean();
require_once __DIR__ . '/_harness_dump.php';

// --- args ---
	$out_file	= null;
	$schema		= false;
	// Resolved locally, NOT from HARNESS_SCRATCH_DB: that constant still carries the historical
	// numisdata literal for the legacy destructive callers (build_v7_dump.php,
	// run_v6_diffusion.php), and silently dumping it instead of the harness DB would produce a
	// snapshot of the wrong database.
	$db_env		= getenv('HARNESS_DB');
	$db			= (is_string($db_env) && $db_env !== '') ? $db_env : null;
	foreach (array_slice($argv, 1) as $a) {
		if (str_starts_with($a, '--out=')) {
			$out_file = substr($a, 6);
		} elseif (str_starts_with($a, '--db=')) {
			$db = substr($a, 5);
		} elseif ($a === '--schema') {
			$schema = true;
		} else {
			fwrite(STDERR, "harness_dump_db: unknown option '$a'\n");
			exit(2);
		}
	}

	if (empty($out_file)) {
		fwrite(STDERR, "harness_dump_db: --out=FILE is required\n");
		exit(2);
	}
	if (empty($db)) {
		fwrite(STDERR, "harness_dump_db: no database resolved (set HARNESS_DB or pass --db=)\n");
		exit(2);
	}

// --- dump ---
	try {
		$data = $schema
			? harness_dump_schema($db)
			: harness_dump_scratch($db);
	} catch (Throwable $t) {
		fwrite(STDERR, 'harness_dump_db: ' . $t->getMessage() . "\n");
		exit(2);
	}

	$json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	if ($json === false || file_put_contents($out_file, $json) === false) {
		fwrite(STDERR, "harness_dump_db: failed writing $out_file\n");
		exit(2);
	}

// --- summary ---
	$kind		= $schema ? 'schema' : 'rows';
	$summary	= array_map(fn($v) => count($v), $data);
	fwrite(STDERR, "[dump] db=$db kind=$kind tables=" . count($data) . ' ' . json_encode($summary) . "\n");
	echo "$kind dump ($db) -> $out_file (" . count($data) . " tables)\n";

	exit(0);
