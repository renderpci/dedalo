<?php declare(strict_types=1);

/**
* VALIDATE_MIGRATION (CLI) — CONTROLLER one-shot, gated.
* Proves a real migration is faithful BEFORE committing it: boots the real config.php (old
* surface; needs the live DB), runs the migration plan, writes artifacts to a TEMP staging
* dir, boots the migrated-config-consuming pipeline against staging, and diffs. Writes only
* to temp staging; commits NOTHING. Prints a redacted verdict (names + counts; values only
* for non-secret mismatches). Run this ONCE on the install box before migrate_config_v7 --yes.
*
* Usage: php install/validate_migration.php [--config-dir=DIR]
* Exit:  0 faithful, 1 unfaithful, 2 usage/read/capture error.
*/
if (php_sapi_name() !== 'cli') { http_response_code(404); exit(2); }

$repo = dirname(__DIR__);
require_once $repo . '/core/base/config/class.config_scope.php';
require_once $repo . '/core/base/config/class.config_merge.php';
require_once $repo . '/core/base/config/class.config_key.php';
require_once $repo . '/install/class.migration_runner.php';
require_once $repo . '/install/class.migration_committer.php';
require_once $repo . '/install/class.migration_validator.php';

$config_dir = $repo . '/config';
foreach (array_slice($argv, 1) as $arg) {
	if (preg_match('/^--config-dir=(.*)$/', $arg, $m)) { $config_dir = $m[1]; }
}

$sources = [];
foreach (['config.php', 'config_db.php', 'config_areas.php', 'config_core.php'] as $n) {
	if (is_file($config_dir . '/' . $n)) { $sources[] = $config_dir . '/' . $n; }
}
if ($sources === []) { fwrite(STDERR, "validate_migration: no legacy config in {$config_dir}\n"); exit(2); }

// Refuse on an ALREADY-FLIPPED box: post-migration config/config.php is the generated shim
// (`require __DIR__.'/bootstrap.php'`), so booting it as the "old surface" would re-enter the v7
// pipeline and the diff would compare the new surface against itself → a meaningless faithful=YES.
// This validator must run ONCE, BEFORE committing the migration.
$config_php = $config_dir . '/config.php';
if (is_file($config_php) && strpos((string) file_get_contents($config_php), 'bootstrap.php') !== false) {
	fwrite(STDERR, "validate_migration: {$config_php} is the post-flip shim — this box is already migrated.\n"
		. "Validation must run BEFORE the flip, against the legacy config.\n");
	exit(2);
}

// OLD surface — boot the real config in a subprocess (never read as source)
$old_cmd = escapeshellarg(PHP_BINARY) . ' -d error_reporting=0 -d display_errors=0 -r '
	. escapeshellarg('include ' . var_export($config_dir . '/config.php', true) . '; echo json_encode(get_defined_constants(true)["user"], JSON_INVALID_UTF8_SUBSTITUTE);') . ' 2>/dev/null';
$old = json_decode((string) shell_exec($old_cmd), true);
if (!is_array($old)) { fwrite(STDERR, "validate_migration: legacy boot capture failed\n"); exit(2); }

// migrate to a TEMP staging dir
$catalog = require $repo . '/core/base/config/catalog/catalog.php';
$plan = migration_runner::plan($sources, $catalog);
$staging = sys_get_temp_dir() . '/dedalo_migrate_staging_' . getmypid();
$targets = [
	'env_php'     => $staging . '/private/.env',
	'state'       => $staging . '/config/state.php',
	'passthrough' => $staging . '/config/local/passthrough.php',
];
migration_committer::commit($plan['artifacts'], $targets, $staging . '/backup');

// MIGRATED surface — boot the migrated-config-consuming pipeline against staging
$mig_cmd = escapeshellarg(PHP_BINARY) . ' -d error_reporting=0 -d display_errors=0 ' . escapeshellarg($repo . '/install/boot_diff_migrated_surface.php')
	. ' ' . escapeshellarg('--staging=' . $staging)
	. ' ' . escapeshellarg('--catalog=' . $repo . '/core/base/config/catalog/catalog.php')
	. ' ' . escapeshellarg('--subsystem=' . $repo . '/core/base/version.inc')
	. ' ' . escapeshellarg('--subsystem=' . $repo . '/core/base/dd_tipos.php') . ' 2>/dev/null';
$migrated = json_decode((string) shell_exec($mig_cmd), true);
if (!is_array($migrated)) { fwrite(STDERR, "validate_migration: migrated boot capture failed\n"); exit(2); }

$r = migration_validator::validate($old, $migrated, $catalog);

fwrite(STDOUT, "=== migration validation ===\n");
fwrite(STDOUT, 'faithful: ' . ($r['faithful'] ? 'YES' : 'NO') . "\n");
fwrite(STDOUT, 'missing in migrated (' . count($r['missing']) . '): ' . implode(', ', $r['missing']) . "\n");
fwrite(STDOUT, 'value mismatches (' . count($r['value_mismatches']) . '): ' . implode(', ', $r['value_mismatches']) . "\n");
fwrite(STDOUT, 'excluded REQUEST/USER absent (ok) (' . count($r['excluded_absent_ok']) . ')' . "\n");
fwrite(STDOUT, 'derived-request diffs (non-fatal; boot_paths web-root) (' . count($r['derived_request_diffs']) . '): ' . implode(', ', $r['derived_request_diffs']) . "\n");
fwrite(STDOUT, "staging (temp, inspect then delete): {$staging}\n");
exit($r['faithful'] ? 0 : 1);
