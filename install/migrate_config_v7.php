<?php declare(strict_types=1);

/**
* MIGRATE_CONFIG_V7 (CLI) — v6→v7 config migration orchestrator (spec §5.10).
* Default-safe: prints a redacted plan and writes NOTHING unless --yes is given.
* Tokenizes the legacy config (never includes it). All paths are overridable so this is
* testable against a sandbox; the defaults target the real install.
*
* Usage: php install/migrate_config_v7.php [--dry-run] [--yes] [--config-dir=DIR]
*        [--private-dir=DIR] [--bun-env=FILE] [--target-config-dir=DIR] [--backup-base=DIR]
* Exit:  0 ok / dry-run, 1 commit refused (no --yes), 2 usage / lock / read error.
*/
if (php_sapi_name() !== 'cli') {
	http_response_code(404);
	exit(2);
}

$repo = dirname(__DIR__);

require_once $repo . '/core/base/config/class.config_scope.php';
require_once $repo . '/core/base/config/class.config_merge.php';
require_once $repo . '/core/base/config/class.config_key.php';
require_once $repo . '/install/class.migration_runner.php';
require_once $repo . '/install/class.migration_committer.php';

// --- args ---
$opts = ['dry-run' => false, 'yes' => false];
$paths = [
	'config-dir'        => $repo . '/config',
	'private-dir'       => $repo . '/../private',
	'bun-env'           => $repo . '/diffusion/api/v1/.env',
	'target-config-dir' => $repo . '/config',
	'backup-base'       => $repo . '/../backups/config_migration',
];
foreach (array_slice($argv, 1) as $arg) {
	if ($arg === '--dry-run') { $opts['dry-run'] = true; continue; }
	if ($arg === '--yes')     { $opts['yes'] = true; continue; }
	if (preg_match('/^--([a-z-]+)=(.*)$/', $arg, $m) && isset($paths[$m[1]])) { $paths[$m[1]] = $m[2]; continue; }
	fwrite(STDERR, "migrate_config_v7: unknown argument: {$arg}\n");
	exit(2);
}

// --- discover sources (tokenized, never included) ---
$sources = [];
foreach (['config.php', 'config_db.php', 'config_areas.php', 'config_core.php'] as $name) {
	$p = $paths['config-dir'] . '/' . $name;
	if (is_file($p)) { $sources[] = $p; }
}
if ($sources === []) {
	fwrite(STDERR, "migrate_config_v7: no legacy config files found in {$paths['config-dir']}\n");
	exit(2);
}

// --- single-runner lock ---
$lockfile = sys_get_temp_dir() . '/dedalo_migrate_config_v7.lock';
$lock = fopen($lockfile, 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
	fwrite(STDERR, "migrate_config_v7: another migration is already running\n");
	exit(2);
}

$catalog = require $repo . '/core/base/config/catalog/catalog.php';
$plan = migration_runner::plan($sources, $catalog);

// --- dry-run (default-safe) ---
if (!$opts['yes']) {
	fwrite(STDOUT, migration_runner::dry_run_report($plan));
	if (!$opts['dry-run']) {
		fwrite(STDERR, "\nNothing written. Re-run with --yes to commit (after reviewing the plan above).\n");
		flock($lock, LOCK_UN);
		exit(1);
	}
	flock($lock, LOCK_UN);
	exit(0);
}

// --- commit (requires --yes) ---
$host  = gethostname() ?: 'host';
$entity = $plan['entity'] ?? 'entity';
$stamp = date('Ymd_His');
$backup_dir = $paths['backup-base'] . '/' . $host . '.' . $entity . '/' . $stamp;

// Config goes into .env (secrets + general config). config.local.php is NOT written — it's an
// optional admin-only file the shim still loads if present.
$targets = [
	'env_php'     => $paths['private-dir'] . '/.env',
	'env_bun'     => $paths['bun-env'],
	'state'       => $paths['private-dir'] . '/state.php',
	'passthrough' => $paths['private-dir'] . '/passthrough.php',
];

$report = migration_committer::commit($plan['artifacts'], $targets, $backup_dir);

// marker for schema version + key
$marker = $paths['private-dir'] . '/.migration.json';
@mkdir(dirname($marker), 0755, true);
@file_put_contents($marker, json_encode([
	'schema_version' => migration_runner::SCHEMA_VERSION,
	'key'            => $host . '.' . $entity,
	'stamp'          => $stamp,
], JSON_PRETTY_PRINT) . "\n");

fwrite(STDOUT, "migration committed (schema_version " . migration_runner::SCHEMA_VERSION . ", backups in {$backup_dir}):\n");
foreach ($report as $key => $status) {
	fwrite(STDOUT, "  - {$key}: {$status}\n");
}
flock($lock, LOCK_UN);
exit(0);
