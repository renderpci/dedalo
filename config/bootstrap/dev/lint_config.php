<?php declare(strict_types=1);
/**
* lint_config.php
* --------------------------------------------------------------------------
* Cross-checks the three faces of the declarative configuration so missing or
* inconsistent definitions surface immediately (the "visual correlation"
* guarantee): schema.php  <->  defaults.env  <->  emitted constants.
*
* Reports, and exits non-zero on, any of:
*   - a key in defaults.env that has no schema entry      (orphan value)
*   - a schema key with no value in defaults.env and no
*     schema default and not flagged 'required'/secret    (undefined -> would emit null)
*   - a duplicate key in defaults.env                      (ambiguous)
*   - a value that fails its declared type/enum coercion   (invalid)
*   - a schema 'const' that does not actually get emitted  (emit gap)
*
* Usage:
*   php config/bootstrap/dev/lint_config.php [defaults.env] [schema.php]
* --------------------------------------------------------------------------
*/

if (PHP_SAPI !== 'cli') { fwrite(STDERR, "CLI only.\n"); exit(2); }
if (!defined('IS_UNIT_TEST')) { define('IS_UNIT_TEST', true); }

$config_dir   = dirname(__DIR__, 2);          // .../config/bootstrap/dev -> .../config
$bootstrap    = dirname(__DIR__, 1);          // .../config/bootstrap
$defaults_env = $argv[1] ?? ($config_dir . '/defaults.env');
$schema_file  = $argv[2] ?? ($bootstrap . '/schema.php');

require $bootstrap . '/class.dd_config.php';

$problems = [];

// --- 1. duplicate keys in defaults.env --------------------------------------
$seen = [];
foreach (file($defaults_env, FILE_IGNORE_NEW_LINES) ?: [] as $n => $line) {
	$t = ltrim($line);
	if ($t==='' || $t[0]==='#' || !str_contains($line, '=')) { continue; }
	$key = trim(substr($line, 0, strpos($line, '=')));
	if (isset($seen[$key])) {
		$problems[] = "duplicate key in defaults.env: '{$key}' (lines {$seen[$key]} and " . ($n+1) . ")";
	}
	$seen[$key] = $n + 1;
}

// --- 2. key-set consistency schema <-> defaults.env -------------------------
$env_keys    = dd_config::parse_env_file($defaults_env);
$schema      = include $schema_file;
$schema_keys = array_keys($schema);

foreach (array_keys($env_keys) as $k) {
	if (!isset($schema[$k])) {
		$problems[] = "defaults.env key '{$k}' has no schema entry (orphan value)";
	}
}
foreach ($schema as $k => $spec) {
	$flags   = (array)($spec[3] ?? []);
	$default = $spec[2] ?? null;
	$is_secret_or_required = in_array('required', $flags, true) || in_array('secret', $flags, true);
	if (!array_key_exists($k, $env_keys) && $default===null && !$is_secret_or_required) {
		$problems[] = "schema key '{$k}' has no defaults.env value, no default, and is not required/secret (would emit null)";
	}
}

// --- 3. coercion + emit check (real boot in this throwaway process) ----------
dd_config::boot([
	'schema_file' => $schema_file,
	'layers'      => [$defaults_env],
	'use_env'     => false
]);
$notices = [];
foreach (dd_config::warnings() as $w) {
	// a sentinel match on the DEFAULTS layer is expected: defaults.env carries
	// the placeholder that real installs override in /private/.env. Informational.
	if (str_contains($w, 'sample-default value')) {
		$notices[] = $w;
		continue;
	}
	$problems[] = "boot warning: {$w}";
}
$emitted = dd_config::emit_constants();
foreach ($schema as $k => $spec) {
	$const = $spec[1] ?? $k;
	$phase = $spec[4] ?? 'main';
	if ($phase!=='main') { continue; }
	if (!defined($const)) {
		$problems[] = "schema const '{$const}' (key '{$k}') was not emitted";
	}
}

// --- report -----------------------------------------------------------------
foreach ($notices as $n) {
	fwrite(STDERR, "  notice: {$n} (override in /private/.env)\n");
}
if (empty($problems)) {
	fwrite(STDERR, sprintf(
		"OK: config lint clean — %d schema keys, %d defaults.env values, %d constants emitted.\n",
		count($schema_keys), count($env_keys), count($emitted)
	));
	exit(0);
}
fwrite(STDERR, "FAIL: config lint found " . count($problems) . " problem(s):\n");
foreach ($problems as $p) {
	fwrite(STDERR, "  - {$p}\n");
}
exit(1);
