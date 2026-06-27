<?php
/**
 * Shared MariaDB scratch-DB helpers for the v6↔v7 diffusion migration test harness.
 *
 * Assumes the host framework (v6 or v7) has already been bootstrapped so the
 * MYSQL_DEDALO_* connection constants are defined. The same MariaDB server is
 * shared by both v6 and v7, so this file is framework-agnostic.
 *
 * The scratch database isolates test runs: the live diffusion DB is never touched.
 */

if (!defined('HARNESS_SCRATCH_DB')) {
	define('HARNESS_SCRATCH_DB', 'web_numisdata_mib_difftest');
}

/**
 * Resolve a MariaDB credential. v6 defines the legacy MYSQL_DEDALO_* constants;
 * v7 moved config to ../private/.env, so fall back to that file (or getenv).
 */
function harness_db_cred(string $key, $default = null) {

	if (defined($key)) {
		return constant($key);
	}
	$env = getenv($key);
	if ($env !== false && $env !== '') {
		return $env;
	}

	static $envcache = null;
	if ($envcache === null) {
		$envcache = [];
		// helpers → migration → diffusion → master_dedalo → ../private/.env
		$envfile = __DIR__ . '/../../../../private/.env';
		if (is_file($envfile)) {
			foreach (file($envfile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
				$line = trim($line);
				if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
					continue;
				}
				[$k, $v] = explode('=', $line, 2);
				$envcache[trim($k)] = trim($v);
			}
		}
	}

	return $envcache[$key] ?? $default;
}

/**
 * Server-level mysqli connection (no database selected).
 */
function harness_admin_conn() : mysqli {

	$host   = harness_db_cred('MYSQL_DEDALO_HOSTNAME_CONN', 'localhost');
	$user   = harness_db_cred('MYSQL_DEDALO_USERNAME_CONN', 'render_dev');
	$pass   = harness_db_cred('MYSQL_DEDALO_PASSWORD_CONN', '');
	$socket = harness_db_cred('MYSQL_DEDALO_SOCKET_CONN', '/tmp/mysql.sock');
	$port_raw = harness_db_cred('MYSQL_DEDALO_DB_PORT_CONN', 0);
	$port   = is_numeric($port_raw) ? (int)$port_raw : 0;
	$socket = (is_string($socket) && $socket !== '' && $socket !== 'null') ? $socket : null;

	$conn = mysqli_init();
	$ok = mysqli_real_connect($conn, $host, $user, $pass, '', $port, $socket ?? '');
	if (!$ok) {
		throw new Exception('harness_admin_conn failed: ' . mysqli_connect_error());
	}
	mysqli_set_charset($conn, 'utf8mb4');

	return $conn;
}

/**
 * Empty the scratch database (drop every table) so the next run starts fresh.
 *
 * The database itself must already exist and the framework's MariaDB user must
 * have privileges on it (one-time setup, see setup_scratch_db.sh). We drop tables
 * rather than the database so a non-admin user (render_dev) can refresh it.
 */
function harness_refresh_scratch(string $scratch_db = HARNESS_SCRATCH_DB) : void {

	$conn = harness_admin_conn();
	mysqli_select_db($conn, $scratch_db);

	$tables = [];
	$res = mysqli_query($conn, 'SHOW TABLES');
	if ($res) {
		while ($row = mysqli_fetch_array($res, MYSQLI_NUM)) {
			$tables[] = $row[0];
		}
	}

	if (!empty($tables)) {
		mysqli_query($conn, 'SET FOREIGN_KEY_CHECKS=0');
		foreach ($tables as $t) {
			mysqli_query($conn, "DROP TABLE IF EXISTS `$t`");
		}
		mysqli_query($conn, 'SET FOREIGN_KEY_CHECKS=1');
	}

	mysqli_close($conn);
}

/**
 * Dump every table in the scratch database to a PHP array: [ table_name => [ row, ... ] ].
 * Rows are ordered deterministically (section_id+lang when present, else id) so the
 * v6 and v7 snapshots are directly comparable.
 */
function harness_dump_scratch(string $scratch_db = HARNESS_SCRATCH_DB) : array {

	$conn = harness_admin_conn();
	mysqli_select_db($conn, $scratch_db);

	// table list
	$tables = [];
	$res = mysqli_query($conn, 'SHOW TABLES');
	while ($row = mysqli_fetch_array($res, MYSQLI_NUM)) {
		$tables[] = $row[0];
	}
	sort($tables);

	$out = [];
	foreach ($tables as $t) {

		// columns (to choose a stable ORDER BY)
		$cols = [];
		$colres = mysqli_query($conn, "SHOW COLUMNS FROM `$t`");
		while ($c = mysqli_fetch_assoc($colres)) {
			$cols[] = $c['Field'];
		}

		$order = '';
		if (in_array('section_id', $cols, true) && in_array('lang', $cols, true)) {
			$order = 'ORDER BY `section_id`, `lang`';
		} elseif (in_array('section_id', $cols, true)) {
			$order = 'ORDER BY `section_id`';
		} elseif (in_array('id', $cols, true)) {
			$order = 'ORDER BY `id`';
		}

		$rows = [];
		$rres = mysqli_query($conn, "SELECT * FROM `$t` $order");
		if ($rres) {
			while ($r = mysqli_fetch_assoc($rres)) {
				$rows[] = $r;
			}
		}
		$out[$t] = $rows;
	}

	mysqli_close($conn);

	return $out;
}
