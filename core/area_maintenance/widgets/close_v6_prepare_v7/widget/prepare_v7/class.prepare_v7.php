<?php declare(strict_types=1);
/**
* PREPARE_V7
* v6 area-maintenance widget: "Prepare installation for v7".
*
* This is the thin v6-facing launcher for the isolated v6→v7 migration package.
* It runs INSIDE the host v6 process, so it must NEVER load the bundled v7 engine
* in-process (v6 ships its own classes with the same names — that would collide).
* Instead it:
*   1. enforces the same guards as the current update widget (DEDALO_SUPERUSER +
*      maintenance mode),
*   2. imports the v6 config into the bundled engine (copies the legacy config
*      files into engine/config/; the engine bootstrap then auto-migrates them to
*      ../private/.env on boot), so the engine subprocess uses the v6 config,
*   3. spawns run/run_prepare_v7.php as a DETACHED background CLI and returns its
*      PID (same nohup/echo-$! technique as backup::init_backup_sequence).
*
* The heavy lifting (backup, pre_update, full update, store backfills) happens in
* the spawned bundled-engine processes; see close_v6_prepare_v7/run/*.
*
* Package location: resolved from PREPARE_V7_PACKAGE_ROOT if set, otherwise from
* this file's location (…/<package>/widget/prepare_v7/class.prepare_v7.php).
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/
class prepare_v7 {

	/** SEC-044: methods callable through the maintenance widget API */
	public const API_ACTIONS = [
		'prepare_v7'
	];


	/**
	* PACKAGE_ROOT
	* Absolute path of the deployed migration package.
	*/
	private static function package_root() : string {

		$env = getenv('PREPARE_V7_PACKAGE_ROOT');
		if (is_string($env) && $env !== '' && is_dir($env)) {
			return rtrim($env, DIRECTORY_SEPARATOR);
		}
		// this file: <package>/widget/prepare_v7/class.prepare_v7.php
		return dirname(__DIR__, 2);
	}//end package_root


	/**
	* IMPORT_V6_CONFIG
	* Copies the running v6 install's legacy config files into the bundled engine's
	* config/ dir so the engine's own bootstrap can auto-migrate them to ../private/.env.
	*
	* The files are read STATICALLY by config_auto_migrate (tokenized define() scan) —
	* they are never executed by the engine (its entry point is config/bootstrap.php).
	* The migration sentinel + any prior generated env are cleared so the next engine
	* boot re-imports the freshly-copied config.
	*
	* @param string $engine - bundled engine root (…/engine)
	* @return object { result: bool, msg: string, copied: array }
	*/
	private static function import_v6_config(string $engine) : object {

		$response = (object)['result' => false, 'msg' => '', 'copied' => []];

		// locate the v6 config dir (this widget runs INSIDE v6)
		$v6_config = (defined('DEDALO_CONFIG_PATH') && DEDALO_CONFIG_PATH !== '')
			? DEDALO_CONFIG_PATH
			: (defined('DEDALO_ROOT_PATH') ? DEDALO_ROOT_PATH . '/config' : null);
		if (!$v6_config || !is_dir($v6_config)) {
			$response->msg = 'Cannot locate the v6 config dir (DEDALO_CONFIG_PATH).';
			return $response;
		}

		$dest = $engine . '/config';
		if (!is_dir($dest)) {
			$response->msg = "Bundled engine config dir missing: $dest";
			return $response;
		}

		// legacy sources config_auto_migrate reads (config_core.php/config_db.php trigger it)
		$copied = [];
		foreach (['config.php', 'config_db.php', 'config_areas.php', 'config_core.php'] as $f) {
			$src = $v6_config . '/' . $f;
			if (is_file($src)) {
				if (@copy($src, $dest . '/' . $f) === false) {
					$response->msg = "Failed copying v6 config file: $f";
					return $response;
				}
				$copied[] = $f;
			}
		}
		if (!in_array('config_db.php', $copied, true) && !in_array('config_core.php', $copied, true)) {
			$response->msg = "No v6 legacy config found in $v6_config (need config_core.php / config_db.php).";
			return $response;
		}

		// force a fresh import on the next boot (clear sentinel + prior generated env)
		$private = dirname($engine) . '/private';
		if (!is_dir($private)) { @mkdir($private, 0770, true); }
		@unlink($private . '/.migration.json');
		@unlink($private . '/.env');

		$response->result = true;
		$response->copied = $copied;
		$response->msg    = 'Imported v6 config (' . implode(', ', $copied) . '); engine will auto-migrate to .env on boot.';
		return $response;
	}//end import_v6_config


	/**
	* GET_VALUE
	* Readiness snapshot for the dashboard (no writes, no engine boot).
	*
	* @return object { result: object, msg: string, errors: array }
	*/
	public static function get_value() : object {

		$pkg         = self::package_root();
		$engine_root = is_file($pkg . '/engine/config/bootstrap.php')
			? $pkg . '/engine'
			: '(not bundled — set PREPARE_V7_ENGINE_ROOT)';
		$maintenance = defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
			? DEDALO_MAINTENANCE_MODE_CUSTOM
			: (defined('DEDALO_MAINTENANCE_MODE') ? DEDALO_MAINTENANCE_MODE : false);

		$log_file = $pkg . '/var/prepare_v7.log';
		$log_tail = is_file($log_file)
			? implode("\n", array_slice(preg_split('/\r\n|\r|\n/', (string)file_get_contents($log_file)), -40))
			: '';

		$result = (object)[
			'is_superuser'     => (function_exists('logged_user_id') && logged_user_id() == DEDALO_SUPERUSER),
			'maintenance_mode' => ($maintenance === true),
			'database'         => defined('DEDALO_DATABASE_CONN') ? DEDALO_DATABASE_CONN : null,
			'package_root'     => $pkg,
			'engine_root'      => $engine_root,
			'engine_present'   => is_file($pkg . '/engine/config/bootstrap.php'),
			'runner_present'   => is_file($pkg . '/run/run_prepare_v7.php'),
			'php_binary'       => PHP_BINARY ?: 'php',
			'log_tail'         => $log_tail,
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK';
			$response->errors	= [];

		return $response;
	}//end get_value


	/**
	* PREPARE_V7
	* Launch endpoint. Writes the engine env and spawns the runner in background.
	*
	* @param object $options {
	*   mode:        string  'preflight' (dry-run) | 'migrate' (default 'preflight')
	*   skip_backup: bool    only honoured in migrate mode (default false)
	* }
	* @return object { result: bool, pid: int|null, msg: string, errors: array }
	*/
	public static function prepare_v7(object $options) : object {

		$mode        = ($options->mode ?? 'preflight') === 'migrate' ? 'migrate' : 'preflight';
		$skip_backup = ($options->skip_backup ?? false) === true;

		$response = new stdClass();
			$response->result	= false;
			$response->pid		= null;
			$response->msg		= '';
			$response->errors	= [];

		// guard 1: superuser only (same as update_data_version)
		if (!function_exists('logged_user_id') || logged_user_id() != DEDALO_SUPERUSER) {
			$response->msg = 'Error. Only the Dédalo superuser can prepare the v7 installation.';
			return $response;
		}

		// guard 2: maintenance mode (writes forbidden with users online)
		$maintenance = defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
			? DEDALO_MAINTENANCE_MODE_CUSTOM
			: (defined('DEDALO_MAINTENANCE_MODE') ? DEDALO_MAINTENANCE_MODE : false);
		if ($mode === 'migrate' && $maintenance !== true) {
			$response->msg = 'Error. Enable maintenance mode before running the migration.';
			return $response;
		}

		$pkg        = self::package_root();
		$runner     = $pkg . '/run/run_prepare_v7.php';
		$engine     = $pkg . '/engine';
		$var_dir    = $pkg . '/var';
		$spawn_log  = $var_dir . '/spawn.log';

		if (!is_file($runner)) {
			$response->msg = "Error. Runner not found: $runner";
			return $response;
		}
		if (!is_dir($var_dir) && !@mkdir($var_dir, 0775, true) && !is_dir($var_dir)) {
			$response->msg = "Error. Could not create work dir: $var_dir";
			return $response;
		}

		// 1. import the v6 config into the bundled engine.
		//    We copy the v6 install's legacy config files (config_core.php / config_db.php / …)
		//    into engine/config/. On the next engine boot, bootstrap.php detects them and runs
		//    config_auto_migrate → generates a COMPLETE ../private/.env (DB + langs + entity +
		//    paths + install status). This is Dédalo's own v6→v7 config path.
		$import = self::import_v6_config($engine);
		if ($import->result !== true) {
			$response->msg = 'Error importing v6 config: ' . $import->msg;
			return $response;
		}

		// 2. build the runner command
		$php   = PHP_BINARY ?: (defined('PHP_BIN_PATH') ? PHP_BIN_PATH : 'php');
		$flags = ($mode === 'migrate')
			? ('--yes' . ($skip_backup ? ' --skip-backup' : ''))
			: '--dry-run';
		$cmd = escapeshellarg($php) . ' ' . escapeshellarg($runner) . ' ' . $flags;

		// 3. spawn DETACHED in the background, capture the PID
		//    (nohup + '& echo $!' returns immediately with the child PID; same
		//     technique as backup::init_backup_sequence).
		putenv('PREPARE_V7_PACKAGE_ROOT=' . $pkg);
		putenv('PREPARE_V7_ENGINE_ROOT=' . $engine);
		$bg  = 'nohup sh -c ' . escapeshellarg('nice -n 10 ' . $cmd)
			. ' > ' . escapeshellarg($spawn_log) . ' 2>&1 & echo $!';
		$pid = (int)trim((string)shell_exec($bg));

		if ($pid < 1) {
			$response->msg = 'Error. Could not spawn the migration runner (no PID). See ' . $spawn_log;
			return $response;
		}

		$response->result	= true;
		$response->pid		= $pid;
		$response->msg		= ($mode === 'migrate')
			? "Migration started in background (pid $pid). Watch var/prepare_v7.log."
			: "Preflight started in background (pid $pid). Watch var/prepare_v7.log.";

		return $response;
	}//end prepare_v7


}//end prepare_v7
