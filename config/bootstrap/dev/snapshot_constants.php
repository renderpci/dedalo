<?php declare(strict_types=1);
/**
* snapshot_constants.php
* --------------------------------------------------------------------------
* Golden-master harness for the configuration refactor.
*
* Boots a Dédalo config entry point in an isolated CLI process and emits a
* deterministic, sorted JSON map of every user-defined constant it produced
* ({ CONSTANT_NAME : json_encoded_value }). The output is the parity oracle:
* the new bootstrap architecture must reproduce the same map, byte for byte,
* as the legacy `sample.config.php` (modulo constants intentionally excluded
* in worker mode — see the plan).
*
* Usage:
*   php config/bootstrap/dev/snapshot_constants.php [config_file] > out.json
*
*   config_file  Path to the config entry to boot.
*                Default: config/sample.config.php (the canonical template).
*
* Compare two snapshots with diff_constants.php (or any `diff`/`jq`).
*
* Notes:
*  - IS_UNIT_TEST is defined so the secret sentinel guard is skipped and the
*    boot does not abort on sample-default credentials.
*  - Booting has side effects (session files, class loading); that is expected
*    and harmless for a dev tool. The DB is only touched lazily, so no live
*    PostgreSQL is required to capture the constant set.
*  - Run each boot in its OWN process: PHP constants cannot be redefined, so
*    two config files cannot be booted in a single process.
* --------------------------------------------------------------------------
*/

if (PHP_SAPI !== 'cli') {
	fwrite(STDERR, "Error: CLI only.\n");
	exit(2);
}

// keep stdout clean (JSON only); push engine noise to stderr
error_reporting(E_ALL & ~E_DEPRECATED & ~E_WARNING & ~E_NOTICE);
ini_set('display_errors', 'stderr');

// skip the SEC-094 sentinel so sample-default secrets do not abort the boot
if (!defined('IS_UNIT_TEST')) {
	define('IS_UNIT_TEST', true);
}

$config_dir  = dirname(__DIR__, 2);            // .../config/bootstrap/dev -> .../config
$config_file = $argv[1] ?? ($config_dir . '/sample.config.php');

if (!is_file($config_file)) {
	fwrite(STDERR, "Error: config file not found: {$config_file}\n");
	exit(2);
}

// capture the user-constant delta produced by booting the config file
$before = get_defined_constants(true)['user'] ?? [];

$included = include $config_file;
if ($included === false) {
	fwrite(STDERR, "Error: include returned false for {$config_file}\n");
	exit(1);
}

$after = get_defined_constants(true)['user'] ?? [];
$delta = array_diff_key($after, $before);

// serialize each value deterministically; arrays keep insertion order
$out = [];
foreach ($delta as $name => $value) {
	$out[$name] = json_encode(
		$value,
		JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR
	);
}
ksort($out, SORT_STRING);

fwrite(STDERR, sprintf(
	"snapshot: %s -> %d user constants\n",
	basename($config_file),
	count($out)
));

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
exit(0);
