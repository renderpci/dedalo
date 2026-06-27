<?php
/**
 * Compare two scratch-DB snapshots (v6 reference vs v7 result) table by table,
 * column by column, keyed by section_id+lang. Exits non-zero on any mismatch.
 *
 * Usage:
 *   php compare_tables.php [v6_file] [v7_file] [--tables=mints,map_global] [--quiet]
 *
 * Volatile columns that legitimately differ per run are ignored: id, dd_tm.
 */

$v6_file = $argv[1] ?? (__DIR__ . '/v6_result.json');
$v7_file = $argv[2] ?? (__DIR__ . '/v7_result.json');

$only_tables = [];
$quiet = false;
foreach ($argv as $a) {
	if (str_starts_with($a, '--tables=')) {
		$only_tables = array_filter(explode(',', substr($a, 9)));
	} elseif ($a === '--quiet') {
		$quiet = true;
	}
}

$IGNORE_COLS = ['id', 'dd_tm'];

$v6 = json_decode(file_get_contents($v6_file), true);
$v7 = json_decode(file_get_contents($v7_file), true);
if (!is_array($v6) || !is_array($v7)) {
	fwrite(STDERR, "Error reading snapshots\n");
	exit(2);
}

// row key: section_id + lang (covers both normal tables and global tables)
$index = function(array $rows) : array {
	$out = [];
	foreach ($rows as $r) {
		$key = ($r['section_id'] ?? '?') . '|' . ($r['lang'] ?? '?');
		$out[$key] = $r;
	}
	return $out;
};

$tables = array_unique(array_merge(array_keys($v6), array_keys($v7)));
sort($tables);

$total_mismatch = 0;
$report = [];

foreach ($tables as $t) {
	if ($only_tables && !in_array($t, $only_tables, true)) {
		continue;
	}

	$in6 = isset($v6[$t]);
	$in7 = isset($v7[$t]);
	if (!$in6) { $report[] = "TABLE $t: only in V7 (".count($v7[$t])." rows)"; $total_mismatch++; continue; }
	if (!$in7) { $report[] = "TABLE $t: only in V6 (".count($v6[$t])." rows)"; $total_mismatch++; continue; }

	$i6 = $index($v6[$t]);
	$i7 = $index($v7[$t]);
	$keys = array_unique(array_merge(array_keys($i6), array_keys($i7)));
	sort($keys);

	$col_mismatch = [];      // col => count
	$row_only6 = []; $row_only7 = [];

	foreach ($keys as $k) {
		if (!isset($i6[$k])) { $row_only7[] = $k; $total_mismatch++; continue; }
		if (!isset($i7[$k])) { $row_only6[] = $k; $total_mismatch++; continue; }
		$r6 = $i6[$k]; $r7 = $i7[$k];
		$cols = array_unique(array_merge(array_keys($r6), array_keys($r7)));
		foreach ($cols as $c) {
			if (in_array($c, $IGNORE_COLS, true)) continue;
			$a = $r6[$c] ?? null; $b = $r7[$c] ?? null;
			if ((string)$a !== (string)$b) {
				$col_mismatch[$c] = ($col_mismatch[$c] ?? 0) + 1;
				$total_mismatch++;
			}
		}
	}

	$cols_all = !empty($v6[$t]) ? array_keys($v6[$t][0]) : (!empty($v7[$t]) ? array_keys($v7[$t][0]) : []);
	$ok_cols = []; $bad_cols = [];
	foreach ($cols_all as $c) {
		if (in_array($c, $IGNORE_COLS, true)) continue;
		if (isset($col_mismatch[$c])) $bad_cols[] = "$c({$col_mismatch[$c]})"; else $ok_cols[] = $c;
	}

	$line = "TABLE $t: rows V6=".count($v6[$t])." V7=".count($v7[$t]);
	if ($row_only6) $line .= " | rows only in V6: ".implode(',', $row_only6);
	if ($row_only7) $line .= " | rows only in V7: ".implode(',', $row_only7);
	$report[] = $line;
	$report[] = "  OK  cols: ".implode(', ', $ok_cols);
	if ($bad_cols) $report[] = "  XX  cols: ".implode(', ', $bad_cols);
}

echo implode("\n", $report) . "\n";
if ($total_mismatch === 0) {
	echo "RESULT: ✅ MATCH (".count($only_tables ?: $tables)." table(s))\n";
	exit(0);
}
echo "RESULT: ❌ $total_mismatch mismatch(es)\n";
exit(1);
