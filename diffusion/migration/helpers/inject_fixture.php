<?php
/**
 * FIXTURE INJECTOR — set IDENTICAL source data into an EMPTY component in BOTH the
 * v6 (dedalo7_mib) and v7 (dedalo_mib_v7) Postgres source DBs, so column-coverage
 * testing can exercise components that no real record populates.
 *
 * Both DBs use the same matrix/matrix_hierarchy schema with type-split JSONB columns
 * (string|date|number|iri|geo|relation), each keyed by component tipo. A literal dato
 * looks like: [{"id":1,"lang":"lg-eng","value":"…"}].
 *
 * SAFETY: 'inject' refuses to overwrite — it only writes when the key is ABSENT/null
 * in BOTH DBs (so it never clobbers real data). 'clear' removes the key, restoring the
 * original empty state exactly. Always pair inject↔clear around a test.
 *
 * Usage:
 *   php inject_fixture.php inject <matrix|matrix_hierarchy> <section_tipo> <section_id> <col> <tipo> '<json>'
 *   php inject_fixture.php clear  <matrix|matrix_hierarchy> <section_tipo> <section_id> <col> <tipo>
 *   php inject_fixture.php check  <matrix|matrix_hierarchy> <section_tipo> <section_id> <col> <tipo>
 *
 * Example (set a definition text on dc1/187 in both DBs):
 *   php inject_fixture.php inject matrix_hierarchy dc1 187 string dd9999 \
 *     '[{"id":1,"lang":"lg-eng","value":"FIXTURE"},{"id":1,"lang":"lg-spa","value":"FIXTURE"}]'
 */

$action  = $argv[1] ?? 'check';
$table   = $argv[2] ?? 'matrix_hierarchy';
$st      = $argv[3] ?? null;
$sid     = $argv[4] ?? null;
$col     = $argv[5] ?? null;      // string|date|number|iri|geo|relation|data
$tipo    = $argv[6] ?? null;      // component tipo (JSONB key)
$json    = $argv[7] ?? null;      // dato array (inject only)

if (!in_array($table, ['matrix','matrix_hierarchy'], true) ||
    !in_array($col, ['string','date','number','iri','geo','relation','data'], true) ||
    $st === null || $sid === null || $tipo === null) {
	fwrite(STDERR, "bad args\n"); exit(2);
}

$DBS = [
	'v6' => 'host=/tmp dbname=dedalo7_mib user=render',
	'v7' => 'host=/tmp dbname=dedalo_mib_v7 user=render',
];

function key_value($conn, $table, $col, $st, $sid, $tipo) {
	$sql = "SELECT \"$col\"->'" . pg_escape_string($tipo) . "' FROM $table WHERE section_tipo=$1 AND section_id=$2";
	$r = pg_query_params($conn, $sql, [$st, (int)$sid]);
	if ($r === false) return '__ERR__';
	$row = pg_fetch_row($r);
	return $row === false ? '__NOROW__' : ($row[0] === null ? null : $row[0]);
}

$conns = [];
foreach ($DBS as $k => $dsn) {
	$c = @pg_connect($dsn);
	if ($c === false) { fwrite(STDERR, "[$k] connect failed\n"); exit(2); }
	$conns[$k] = $c;
}

if ($action === 'check') {
	foreach ($conns as $k => $c) {
		$v = key_value($c, $table, $col, $st, $sid, $tipo);
		echo "[$k] $col.$tipo = " . ($v === null ? 'NULL' : substr((string)$v, 0, 120)) . "\n";
	}
	exit(0);
}

if ($action === 'clear') {
	foreach ($conns as $k => $c) {
		$sql = "UPDATE $table SET \"$col\" = \"$col\" - '" . pg_escape_string($tipo) . "' WHERE section_tipo=$1 AND section_id=$2";
		$r = pg_query_params($c, $sql, [$st, (int)$sid]);
		echo "[$k] cleared $col.$tipo (" . ($r !== false ? pg_affected_rows($r) : 'ERR') . " rows)\n";
	}
	exit(0);
}

if ($action === 'inject') {
	if ($json === null || json_decode($json) === null) { fwrite(STDERR, "inject needs valid json\n"); exit(2); }
	// guard: refuse unless ABSENT/null in BOTH dbs
	foreach ($conns as $k => $c) {
		$v = key_value($c, $table, $col, $st, $sid, $tipo);
		if ($v === '__NOROW__') { fwrite(STDERR, "[$k] no such section $st/$sid in $table\n"); exit(3); }
		if ($v !== null) { fwrite(STDERR, "[$k] REFUSING: $col.$tipo already has data ($v) — won't clobber\n"); exit(3); }
	}
	foreach ($conns as $k => $c) {
		$sql = "UPDATE $table SET \"$col\" = jsonb_set(COALESCE(\"$col\",'{}'::jsonb), $1, $2::jsonb, true) WHERE section_tipo=$3 AND section_id=$4";
		$r = pg_query_params($c, $sql, ['{' . $tipo . '}', $json, $st, (int)$sid]);
		echo "[$k] injected $col.$tipo (" . ($r !== false ? pg_affected_rows($r) : 'ERR: ' . pg_last_error($c)) . " rows)\n";
	}
	exit(0);
}

fwrite(STDERR, "unknown action $action\n"); exit(2);
