<?php declare(strict_types=1);
/**
 * MIGRATE_CONFIG CLI
 * Standalone CLI script to migrate legacy Dédalo config.php + config_db.php
 * into a .env file compatible with the new bootstrap.php + env_loader architecture.
 *
 * Usage:
 *   php core/base/migrate_config.php              # Normal migration
 *   php core/base/migrate_config.php --dry-run    # Preview without writing
 *   php core/base/migrate_config.php --force      # Overwrite existing .env
 *
 * @package Dedalo
 * @subpackage Core
 */

// CLI-only: block any HTTP access
if (php_sapi_name() !== 'cli') {
	http_response_code(403);
	die('Forbidden: CLI only');
}

// ── Parse CLI flags ────────────────────────────────────────────────────────────
$dry_run	= in_array('--dry-run', $argv, true);
$force		= in_array('--force', $argv, true);
$help		= in_array('--help', $argv, true) || in_array('-h', $argv, true);

if ($help) {
	echo <<<HELP
Dédalo Config Migrator — migrate config.php + config_db.php → .env

Usage:
  php core/base/migrate_config.php [options]

Options:
  --dry-run    Preview what would be written without creating files
  --force      Overwrite existing .env file
  --help       Show this help message

Description:
  Reads legacy config/config.php and config/config_db.php define() calls
  and generates a /private/.env file compatible with the new
  config/bootstrap.php + env_loader architecture.

  After successful migration and system stability verification (DB connection
  test), old config files are moved to /private/config_backup/ with a timestamp.
  If the stability check fails, old config files remain in place.

  This script is also called automatically by bootstrap.php on first
  boot when no .env file exists but legacy config.php does.

HELP;
	exit(0);
}

// ── Resolve paths ──────────────────────────────────────────────────────────────
$script_dir	= __DIR__;
$core_dir	= dirname($script_dir); // core/
$root_dir	= dirname($core_dir);  // master_dedalo/
$config_dir	= $root_dir . '/config';
$private_dir= dirname($root_dir) . '/private';

// ── Load config_migrator ───────────────────────────────────────────────────────
if (!file_exists($script_dir . '/class.config_migrator.php')) {
	fwrite(STDERR, "Error: class.config_migrator.php not found in {$script_dir}\n");
	exit(1);
}
require_once $script_dir . '/class.config_migrator.php';

// ── Run migration ──────────────────────────────────────────────────────────────
echo "Dédalo Config Migrator\n";
echo "======================\n\n";

echo "Config dir:   {$config_dir}\n";
echo "Private dir:  {$private_dir}\n";
echo "Mode:         " . ($dry_run ? 'DRY RUN' : 'LIVE') . "\n";
echo "Force:        " . ($force ? 'yes' : 'no') . "\n\n";

// Check for old config files
$old_config	= $config_dir . '/config.php';
$old_db		= $config_dir . '/config_db.php';
$env_path	= $private_dir . '/.env';

echo "Legacy config.php:  " . (file_exists($old_config) ? 'FOUND' : 'NOT FOUND') . "\n";
echo "Legacy config_db:   " . (file_exists($old_db) ? 'FOUND' : 'NOT FOUND') . "\n";
echo "Target .env:        " . (file_exists($env_path) ? 'EXISTS' : 'DOES NOT EXIST') . "\n\n";

if (!file_exists($old_config) && !file_exists($old_db)) {
	fwrite(STDERR, "No legacy config files found. Nothing to migrate.\n");
	exit(1);
}

$result = config_migrator::migrate_to_env(
	$config_dir,
	$private_dir,
	$dry_run,
	$force
);

if ($result->success) {
	echo "✓ " . $result->message . "\n";
	echo "  Lines written: " . $result->lines_written . "\n";
	echo "  Target path:   " . $result->env_path . "\n";

	if (!empty($result->warnings)) {
		echo "\nWarnings:\n";
		foreach ($result->warnings as $w) {
			echo "  ⚠ {$w}\n";
		}
	}

	if ($dry_run && isset($result->content)) {
		echo "\n--- .env content (dry run) ---\n";
		echo $result->content;
		echo "--- end ---\n";
	}
} else {
	fwrite(STDERR, "✗ " . $result->message . "\n");
	if (!empty($result->warnings)) {
		foreach ($result->warnings as $w) {
			fwrite(STDERR, "  ⚠ {$w}\n");
		}
	}
	exit(1);
}
