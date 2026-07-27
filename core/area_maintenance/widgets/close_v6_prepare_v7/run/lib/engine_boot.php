<?php declare(strict_types=1);
/**
* ENGINE_BOOT — boot the BUNDLED v7 engine for a migration phase (CLI only).
*
* Every migration phase (preflight / pre_update / update) runs in its own PHP
* process and starts by requiring this file. It:
*   1. resolves the bundled engine root,
*   2. requires <engine>/config/bootstrap.php (loads the whole v7 engine, its
*      autoloader, and the config from <engine>/../private/.env — which bootstrap
*      auto-migrates from the v6 config files placed in <engine>/config/),
*   3. establishes a CLI DEDALO_SUPERUSER session (same pattern as
*      tools/tool_common/cli/export_register.php),
*   4. loads the package helper libs.
*
* Engine-root resolution (first hit wins):
*   a. env PREPARE_V7_ENGINE_ROOT      (explicit; use this for in-place testing)
*   b. <package>/engine                (packaged layout: dist/prepare_v7/engine)
*   c. dirname(<package>)              (source layout: the v7_php_frozen master_dedalo
*                                       repo itself acts as the engine)
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
* @return array{engine_root:string, package_root:string, var_dir:string}
*/

if (PHP_SAPI !== 'cli') {
	fwrite(STDERR, "prepare_v7 phases must be run from the command line\n");
	exit(2);
}

/**
* prepare_v7_resolve_paths
* @return array{engine_root:string, package_root:string, var_dir:string}
*/
function prepare_v7_resolve_paths() : array {

	// this file lives at <package>/run/lib/engine_boot.php
	$package_root = dirname(__DIR__, 2);

	$env_root = getenv('PREPARE_V7_ENGINE_ROOT');
	if (is_string($env_root) && $env_root !== '' && is_file($env_root . '/config/bootstrap.php')) {
		$engine_root = rtrim($env_root, DIRECTORY_SEPARATOR);
	} elseif (is_file($package_root . '/engine/config/bootstrap.php')) {
		$engine_root = $package_root . '/engine';                 // packaged layout
	} elseif (is_file(dirname($package_root) . '/config/bootstrap.php')) {
		$engine_root = dirname($package_root);                    // source layout (repo == engine)
	} else {
		fwrite(STDERR, "Could not locate the bundled engine (no config/bootstrap.php found).\n"
			. "Set PREPARE_V7_ENGINE_ROOT to the engine root.\n");
		exit(2);
	}

	$var_dir = $package_root . '/var';

	return [
		'engine_root'  => $engine_root,
		'package_root' => $package_root,
		'var_dir'      => $var_dir,
	];
}//end prepare_v7_resolve_paths


/**
* prepare_v7_boot_engine
* Boots the bundled engine and a CLI superuser session. Returns resolved paths.
* @return array{engine_root:string, package_root:string, var_dir:string}
*/
function prepare_v7_boot_engine() : array {

	$paths = prepare_v7_resolve_paths();

	require_once $paths['engine_root'] . '/config/bootstrap.php';

	// The migration orchestrator + upgrade classes are NOT autoloaded (in the app
	// they are include_once'd by the caller — e.g. the update_data_version widget).
	// Require the entry class explicitly; update::get_updates() then pulls in
	// updates.php, class.v6_to_v7.php and class.dataframe_v7_migration.php.
	require_once DEDALO_CORE_PATH . '/base/update/class.update.php';
	require_once DEDALO_CORE_PATH . '/base/upgrade/class.v6_to_v7.php';

	// CLI superuser context (shell access already implies full trust; same model
	// as tools/tool_common/cli/export_register.php and core/rag/cli/*).
	if (!class_exists('login') || login::is_logged() !== true) {
		$_SESSION['dedalo']['auth']['user_id']		= DEDALO_SUPERUSER;
		$_SESSION['dedalo']['auth']['username']		= 'cli-prepare-v7';
		$_SESSION['dedalo']['auth']['is_logged']	= 1;
		$_SESSION['dedalo']['auth']['salt_secure']	= bin2hex(random_bytes(16));
	}

	// package helper libs (need engine constants/classes already loaded)
	require_once __DIR__ . '/blocking_backup.php';
	require_once __DIR__ . '/version_gate.php';

	if (!is_dir($paths['var_dir'])) {
		@mkdir($paths['var_dir'], 0775, true);
	}

	return $paths;
}//end prepare_v7_boot_engine
