<?php declare(strict_types=1);
/**
* diff_constants.php
* --------------------------------------------------------------------------
* Compares two constant snapshots produced by snapshot_constants.php and
* reports any divergence: constants present in one but not the other, or
* whose values differ. Exit code 0 means the constant contract is preserved
* (the primary gate for every phase of the config refactor).
*
* Usage:
*   php config/bootstrap/dev/diff_constants.php baseline.json candidate.json [--ignore NAME,NAME]
*
*   --ignore  Comma-separated constant names to exclude from the diff
*             (e.g. request-scoped values deliberately not frozen in worker
*             mode: DEDALO_APPLICATION_LANG,DEDALO_DATA_LANG,SHOW_DEBUG,...).
* --------------------------------------------------------------------------
*/

if (PHP_SAPI !== 'cli') {
	fwrite(STDERR, "Error: CLI only.\n");
	exit(2);
}

$baseline_file  = $argv[1] ?? null;
$candidate_file = $argv[2] ?? null;
if (!$baseline_file || !$candidate_file) {
	fwrite(STDERR, "Usage: diff_constants.php baseline.json candidate.json [--ignore NAME,NAME]\n");
	exit(2);
}

$ignore = [];
foreach ($argv as $i => $arg) {
	if ($arg === '--ignore' && isset($argv[$i + 1])) {
		$ignore = array_filter(array_map('trim', explode(',', $argv[$i + 1])));
	}
}
$ignore = array_flip($ignore);

$load = static function (string $path): array {
	$raw = @file_get_contents($path);
	if ($raw === false) {
		fwrite(STDERR, "Error: cannot read {$path}\n");
		exit(2);
	}
	$data = json_decode($raw, true);
	if (!is_array($data)) {
		fwrite(STDERR, "Error: invalid JSON in {$path}\n");
		exit(2);
	}
	return $data;
};

$baseline  = $load($baseline_file);
$candidate = $load($candidate_file);

$missing = []; // in baseline, absent from candidate
$added   = []; // in candidate, absent from baseline
$changed = []; // present in both, value differs

foreach ($baseline as $name => $value) {
	if (isset($ignore[$name])) { continue; }
	if (!array_key_exists($name, $candidate)) {
		$missing[$name] = $value;
	} elseif ($candidate[$name] !== $value) {
		$changed[$name] = ['baseline' => $value, 'candidate' => $candidate[$name]];
	}
}
foreach ($candidate as $name => $value) {
	if (isset($ignore[$name])) { continue; }
	if (!array_key_exists($name, $baseline)) {
		$added[$name] = $value;
	}
}

$report = static function (string $title, array $rows): void {
	if (empty($rows)) { return; }
	fwrite(STDERR, "\n== {$title} (" . count($rows) . ") ==\n");
	foreach ($rows as $name => $value) {
		if (is_array($value) && isset($value['baseline'])) {
			fwrite(STDERR, sprintf("  %-44s\n      baseline:  %s\n      candidate: %s\n",
				$name, $value['baseline'], $value['candidate']));
		} else {
			fwrite(STDERR, sprintf("  %-44s = %s\n", $name, $value));
		}
	}
};

$report('MISSING in candidate', $missing);
$report('ADDED in candidate',   $added);
$report('CHANGED value',        $changed);

$total = count($missing) + count($added) + count($changed);
if ($total === 0) {
	fwrite(STDERR, sprintf("\nOK: constant contract preserved (%d constants, %d ignored).\n",
		count($baseline), count($ignore)));
	exit(0);
}

fwrite(STDERR, sprintf("\nFAIL: %d divergence(s) (%d missing, %d added, %d changed).\n",
	$total, count($missing), count($added), count($changed)));
exit(1);
