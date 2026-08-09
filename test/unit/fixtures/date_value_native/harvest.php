<?php
/**
 * Capture component_date::data_item_to_value from the FROZEN PHP oracle.
 *
 * The method is static and depends only on dd_date + label::get_label +
 * debug_log, so the real dd_date class is included verbatim and the method
 * SOURCE TEXT is extracted verbatim from class.component_date.php and eval'd
 * as a standalone function. Nothing is re-implemented here.
 */

define('SHOW_DEBUG', false);
class logger { const ERROR = 'ERROR'; const WARNING = 'WARNING'; const DEBUG = 'DEBUG'; }
function debug_log($msg, $level = null) { /* silent */ }
function to_string($v) { return var_export($v, true); }
function dump($a, $b = null) {}
class label {
	// The three period units the method localizes. The harvest asks for the
	// MASTER (English) strings, which is what the TS catalog serves for lg-eng.
	public static function get_label(string $key) { return $key; }
}

$FROZEN = '/Users/paco/Trabajos/Dedalo/v7_php_frozen/master_dedalo';
require_once $FROZEN . '/core/common/class.dd_date.php';

// --- extract the method source verbatim ------------------------------------
$src = file_get_contents($FROZEN . '/core/component_date/class.component_date.php');
$start = strpos($src, 'public static function data_item_to_value(');
if ($start === false) { fwrite(STDERR, "method not found\n"); exit(1); }
// brace-match from the first '{' after the signature
$open = strpos($src, '{', $start);
$depth = 0; $i = $open;
for (; $i < strlen($src); $i++) {
	if ($src[$i] === '{') $depth++;
	elseif ($src[$i] === '}') { $depth--; if ($depth === 0) break; }
}
$body = substr($src, $open + 1, $i - $open - 1);
eval('function data_item_to_value(object $data_item, string $date_mode, string $sep="/") : string {' . $body . '}');

// --- the corpus -------------------------------------------------------------
$cases = [
	// ---- mode 'date' -------------------------------------------------------
	['id' => 'date_full',            'mode' => 'date',       'item' => ['start' => ['year' => 1628, 'month' => 6, 'day' => 9]]],
	['id' => 'date_year_month',      'mode' => 'date',       'item' => ['start' => ['year' => 1975, 'month' => 3]]],
	['id' => 'date_year_only',       'mode' => 'date',       'item' => ['start' => ['year' => 1975]]],
	['id' => 'date_bce_year_only',   'mode' => 'date',       'item' => ['start' => ['year' => -238]]],
	['id' => 'date_bce_year_month',  'mode' => 'date',       'item' => ['start' => ['year' => -44, 'month' => 3]]],
	['id' => 'date_short_year_full', 'mode' => 'date',       'item' => ['start' => ['year' => 238, 'month' => 6, 'day' => 9]]],
	['id' => 'date_no_start_wrap',   'mode' => 'date',       'item' => ['year' => 1912, 'month' => 11]],
	['id' => 'date_day_no_month',    'mode' => 'date',       'item' => ['start' => ['year' => 1912, 'day' => 4]]],
	['id' => 'date_empty_start',     'mode' => 'date',       'item' => ['start' => new stdClass()], 'raw' => '{"start":{}}'],
	['id' => 'date_yearless',        'mode' => 'date',       'item' => ['start' => ['month' => 6, 'day' => 9]]],
	['id' => 'date_null_start',      'mode' => 'date',       'item' => ['start' => null, 'year' => 1955]],
	// ---- mode 'range' ------------------------------------------------------
	['id' => 'range_full',           'mode' => 'range',      'item' => ['start' => ['year' => 1628, 'month' => 6, 'day' => 9], 'end' => ['year' => 2024, 'month' => 6, 'day' => 25]]],
	['id' => 'range_year_month',     'mode' => 'range',      'item' => ['start' => ['year' => 1987, 'month' => 4], 'end' => ['year' => 1988, 'month' => 11]]],
	['id' => 'range_years',          'mode' => 'range',      'item' => ['start' => ['year' => 1987], 'end' => ['year' => 1988]]],
	['id' => 'range_open_end',       'mode' => 'range',      'item' => ['start' => ['year' => 1987, 'month' => 4]]],
	['id' => 'range_mixed',          'mode' => 'range',      'item' => ['start' => ['year' => 1930, 'month' => 3], 'end' => ['year' => 1930, 'month' => 3, 'day' => 15]]],
	// ---- mode 'time' -------------------------------------------------------
	['id' => 'time_full',            'mode' => 'time',       'item' => ['start' => ['hour' => 17, 'minute' => 33, 'second' => 49]]],
	['id' => 'time_partial',         'mode' => 'time',       'item' => ['start' => ['hour' => 9]]],
	['id' => 'time_no_start_wrap',   'mode' => 'time',       'item' => ['hour' => 9, 'minute' => 5]],
	// ---- mode 'time_range' -------------------------------------------------
	['id' => 'time_range_full',      'mode' => 'time_range', 'item' => ['start' => ['hour' => 1, 'minute' => 2, 'second' => 3], 'end' => ['hour' => 4, 'minute' => 5, 'second' => 6]]],
	['id' => 'time_range_open',      'mode' => 'time_range', 'item' => ['start' => ['hour' => 1, 'minute' => 2, 'second' => 3]]],
	// ---- mode 'date_time' --------------------------------------------------
	['id' => 'date_time_full',       'mode' => 'date_time',  'item' => ['start' => ['year' => 2012, 'month' => 11, 'day' => 7, 'hour' => 17, 'minute' => 33, 'second' => 49]]],
	['id' => 'date_time_partial',    'mode' => 'date_time',  'item' => ['start' => ['year' => 2012, 'month' => 11]]],
	['id' => 'datetime_alias',       'mode' => 'datetime',   'item' => ['start' => ['year' => 2012, 'month' => 11, 'day' => 7, 'hour' => 17, 'minute' => 33, 'second' => 49]]],
	// ---- mode 'period' -----------------------------------------------------
	['id' => 'period_full',          'mode' => 'period',     'item' => ['period' => ['year' => 2, 'month' => 3, 'day' => 4]]],
	['id' => 'period_year_only',     'mode' => 'period',     'item' => ['period' => ['year' => 5]]],
	['id' => 'period_month_only',    'mode' => 'period',     'item' => ['period' => ['month' => 7]]],
	['id' => 'period_absent',        'mode' => 'period',     'item' => ['start' => ['year' => 1975]]],
	// ---- unknown mode falls through to 'date' (PHP default:) ---------------
	['id' => 'unknown_mode',         'mode' => 'not_a_mode', 'item' => ['start' => ['year' => 1975, 'month' => 3]]],
];

$out = [];
foreach ($cases as $case) {
	$item = json_decode(json_encode($case['item']));
	$out[] = [
		'id'    => $case['id'],
		'mode'  => $case['mode'],
		'item'  => $case['item'],
		'php'   => data_item_to_value($item, $case['mode']),
	];
}

echo json_encode([
	'_source'  => 'v7_php_frozen/master_dedalo/core/component_date/class.component_date.php::data_item_to_value (method source eval\'d verbatim over the real dd_date)',
	'_php'     => PHP_VERSION,
	'_recapture' => 'php test/unit/fixtures/date_value_native/harvest.php > test/unit/fixtures/date_value_native/date_value.oracle.json',
	'_labels'  => 'label::get_label(x) stubbed to return x — the master.json English strings for years/months/days',
	'cases'    => $out,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
