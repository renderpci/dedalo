<?php
/**
 * COLUMN-COVERAGE comparator. Aggregates two accumulated snapshots (v6 vs v7,
 * each built from MANY section_ids) and classifies EVERY column:
 *
 *   OK        — populated (non-empty) in >=1 row AND every populated row matches v6.
 *   MISMATCH  — at least one row where v6 != v7 (shows count + one example).
 *   UNTESTED  — never populated in any tested section_id (column never exercised;
 *               a green here is meaningless — it only ever compared empty==empty).
 *
 * This is the rigorous check: a table is only truly verified when every one of its
 * columns is OK (not UNTESTED), i.e. each column was diffused on a section where its
 * source actually has data, and matched.
 *
 * Usage:
 *   php coverage_compare.php [v6_cov.json] [v7_cov.json] [--tables=t1,t2] [--show-untested]
 */

$v6_file = $argv[1] ?? (__DIR__ . '/v6_cov.json');
$v7_file = $argv[2] ?? (__DIR__ . '/v7_cov.json');

$only_tables = [];
$show_untested = false;
$only_ids = null; // restrict comparison to explicitly-diffused section_ids (excludes v6 cascade rows)
foreach ($argv as $a) {
	if (str_starts_with($a, '--tables=')) $only_tables = array_filter(explode(',', substr($a, 9)));
	elseif (str_starts_with($a, '--ids=')) $only_ids = array_flip(array_filter(explode(',', substr($a, 6))));
	elseif ($a === '--show-untested') $show_untested = true;
}

$IGNORE_COLS = ['id', 'dd_tm', 'section_id', 'section_tipo', 'lang'];

$v6 = json_decode(file_get_contents($v6_file), true);
$v7 = json_decode(file_get_contents($v7_file), true);
if (!is_array($v6) || !is_array($v7)) { fwrite(STDERR, "Error reading snapshots\n"); exit(2); }

$is_empty = fn($v) => $v === null || $v === '' || $v === '[]' || $v === '{}';

$index = function(array $rows) : array {
	$out = [];
	foreach ($rows as $r) {
		$out[($r['section_id'] ?? '?') . '|' . ($r['lang'] ?? '?')] = $r;
	}
	return $out;
};

$tables = array_unique(array_merge(array_keys($v6), array_keys($v7)));
sort($tables);

$grand = ['ok' => 0, 'mismatch' => 0, 'untested' => 0];
$report = [];

foreach ($tables as $t) {
	if ($only_tables && !in_array($t, $only_tables, true)) continue;
	if (!isset($v6[$t])) { $report[] = "TABLE $t: only in V7"; continue; }
	if (!isset($v7[$t])) { $report[] = "TABLE $t: only in V6"; continue; }

	$i6 = $index($v6[$t]); $i7 = $index($v7[$t]);
	$keys = array_unique(array_merge(array_keys($i6), array_keys($i7)));
	if ($only_ids !== null) {
		$keys = array_filter($keys, fn($k) => isset($only_ids[explode('|', $k)[0]]));
	}

	// all columns seen
	$cols = [];
	foreach (array_merge($v6[$t], $v7[$t]) as $r) foreach (array_keys($r) as $c) $cols[$c] = true;
	$cols = array_keys($cols);

	$stat = []; // col => [v6pop, match, mism, example]
	foreach ($cols as $c) {
		if (in_array($c, $IGNORE_COLS, true)) continue;
		$v6pop = 0; $match = 0; $mism = 0; $ex = null;
		foreach ($keys as $k) {
			$a = $i6[$k][$c] ?? null;
			$b = $i7[$k][$c] ?? null;
			if (!$is_empty($a)) $v6pop++;
			if ((string)$a === (string)$b) {
				$match++;
			} else {
				$mism++;
				if ($ex === null) $ex = "[$k] v6=" . json_encode($a) . " v7=" . json_encode($b);
			}
		}
		$stat[$c] = [$v6pop, $match, $mism, $ex];
	}

	$ok = []; $bad = []; $untested = [];
	foreach ($stat as $c => [$v6pop, $match, $mism, $ex]) {
		if ($mism > 0)        { $bad[] = "$c (mism=$mism, pop=$v6pop) e.g. " . substr((string)$ex, 0, 140); $grand['mismatch']++; }
		elseif ($v6pop === 0) { $untested[] = $c; $grand['untested']++; }
		else                  { $ok[] = "$c($v6pop)"; $grand['ok']++; }
	}

	$report[] = sprintf("TABLE %s: %d OK, %d MISMATCH, %d UNTESTED  (rows V6=%d V7=%d, keys=%d)",
		$t, count($ok), count($bad), count($untested), count($v6[$t]), count($v7[$t]), count($keys));
	if ($ok)  $report[] = "  OK       : " . implode(', ', $ok);
	if ($bad) foreach ($bad as $b) $report[] = "  MISMATCH : $b";
	if ($untested && $show_untested) $report[] = "  UNTESTED : " . implode(', ', $untested);
	elseif ($untested) $report[] = "  UNTESTED : " . count($untested) . " cols (--show-untested to list)";
}

echo implode("\n", $report) . "\n\n";
printf("TOTALS: %d OK, %d MISMATCH, %d UNTESTED columns\n", $grand['ok'], $grand['mismatch'], $grand['untested']);
exit($grand['mismatch'] > 0 ? 1 : 0);
