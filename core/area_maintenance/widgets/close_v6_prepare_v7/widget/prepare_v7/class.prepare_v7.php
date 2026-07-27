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
*   2. imports the v6 config into the bundled engine (writes a LITERAL snapshot of
*      the live v6 config constants into engine/config/config_db.php; the engine
*      bootstrap then auto-migrates it to ../private/.env on boot), so the engine
*      subprocess uses the v6 config,
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

	/** Lines of var/prepare_v7.log returned to the client on every get_value() poll */
	private const LOG_TAIL_LINES = 60;


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
	* CONFIG_SNAPSHOT
	* v6 constant names imported into the bundled engine, mirroring the engine's own
	* config catalog (core/base/config/catalog/domains/*.php) for the domains a CLI
	* migration needs: db, identity, lang, runtime, state, defaults, diffusion.
	*
	* The `paths` domain is deliberately EXCLUDED: those are DERIVED in v7 and the
	* bundled engine must resolve its OWN root, never the v6 one. Media/mailer/rag
	* constants are excluded too (no media or mail is touched by the migration; the
	* engine's catalog defaults cover them).
	*/
	private const CONFIG_SNAPSHOT = [
		// db
		'DEDALO_DB_TYPE', 'DEDALO_HOSTNAME_CONN', 'DEDALO_DB_PORT_CONN', 'DEDALO_SOCKET_CONN',
		'DEDALO_DATABASE_CONN', 'DEDALO_USERNAME_CONN', 'DEDALO_PASSWORD_CONN', 'SLOW_QUERY_MS',
		'DEDALO_DB_MANAGEMENT', 'DB_BIN_PATH', 'PHP_BIN_PATH',
		// identity
		'DEDALO_SALT_STRING', 'DEDALO_TIMEZONE', 'DEDALO_LOCALE', 'DEDALO_DATE_ORDER',
		'DEDALO_ENTITY', 'DEDALO_ENTITY_LABEL', 'DEDALO_ENTITY_ID', 'DEVELOPMENT_SERVER',
		'ENCRYPTION_MODE',
		// lang
		'DEDALO_STRUCTURE_LANG', 'DEDALO_APPLICATION_LANGS', 'DEDALO_APPLICATION_LANGS_DEFAULT',
		'DEDALO_APPLICATION_LANG', 'DEDALO_DATA_LANG_DEFAULT', 'DEDALO_DATA_LANG',
		'DEDALO_DATA_LANG_SELECTOR', 'DEDALO_DATA_LANG_SYNC', 'DEDALO_DATA_NOLAN',
		'DEDALO_PROJECTS_DEFAULT_LANGS', 'DEDALO_DIFFUSION_LANGS',
		// runtime
		'DEDALO_SESSION_HANDLER', 'DEDALO_SESSION_SAVE_PATH', 'DEDALO_CACHE_MANAGER',
		'SHOW_DEBUG', 'SHOW_DEVELOPER', 'LOGGER_LEVEL', 'DEDALO_BACKUP_ON_LOGIN',
		'DEDALO_BACKUP_TIME_RANGE',
		// state
		'DEDALO_INSTALL_STATUS', 'DEDALO_MAINTENANCE_MODE', 'DEDALO_INFORMATION', 'DEDALO_INFO_KEY',
		'DEDALO_MAINTENANCE_MODE_CUSTOM', 'DEDALO_NOTIFICATION_CUSTOM',
		'DEDALO_MEDIA_ACCESS_MODE_CUSTOM', 'DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM',
		'DEDALO_RECOVERY_MODE',
		// defaults
		'DEDALO_PREFIX_TIPOS', 'MAIN_FALLBACK_SECTION', 'NUMERICAL_MATRIX_VALUE_YES',
		'NUMERICAL_MATRIX_VALUE_NO', 'DEDALO_MAX_ROWS_PER_PAGE', 'DEDALO_PROFILE_DEFAULT',
		'DEDALO_DEFAULT_PROJECT', 'DEDALO_FILTER_SECTION_TIPO_DEFAULT',
		// diffusion
		'DEDALO_DIFFUSION_DOMAIN', 'DEDALO_DIFFUSION_RESOLVE_LEVELS', 'DEDALO_PUBLICATION_CLEAN_URL',
		'DEDALO_DIFFUSION_CUSTOM', 'API_WEB_USER_CODE_MULTIPLE', 'STRUCTURE_FROM_SERVER',
		'IS_AN_ONTOLOGY_SERVER', 'ONTOLOGY_SERVERS', 'IS_A_CODE_SERVER', 'CODE_SERVERS'
	];


	/**
	* IMPORT_V6_CONFIG
	* Writes the running v6 install's configuration into the bundled engine's config/
	* dir so the engine's own bootstrap can auto-migrate it to ../private/.env.
	*
	* We do NOT copy the v6 config files: on most installs config/config_db.php is a
	* thin stub that `include`s ../private/config_db.inc (and values may be built from
	* variables), while config_auto_migrate reads its sources STATICALLY (a tokenized
	* define() scan, never executed) and can only migrate LITERALS — a copied stub
	* yields zero constants, and a non-literal secret makes it refuse outright.
	*
	* Instead we snapshot the constants as this v6 process actually resolved them
	* (whatever include chain / profile / env produced them) into ONE generated file,
	* engine/config/config_db.php — a name config_auto_migrate recognises as the legacy
	* fingerprint, so the next engine boot migrates it and then quarantines it out of
	* the engine tree. The file carries the DB password: it is written 0600, lives in
	* the gitignored package dir, and is regenerated on every launch.
	*
	* The migration sentinel + any prior generated env are cleared so the next engine
	* boot re-imports the freshly-written snapshot.
	*
	* @param string $engine - bundled engine root (…/engine)
	* @return object { result: bool, msg: string, imported: array }
	*/
	private static function import_v6_config(string $engine) : object {

		$response = (object)['result' => false, 'msg' => '', 'imported' => []];

		$dest = $engine . '/config';
		if (!is_dir($dest)) {
			$response->msg = "Bundled engine config dir missing: $dest";
			return $response;
		}

		// mandatory minimum: without these the engine cannot reach the v6 database
		foreach (['DEDALO_DATABASE_CONN', 'DEDALO_USERNAME_CONN'] as $mandatory) {
			if (!defined($mandatory)) {
				$response->msg = "The v6 install has no $mandatory defined; cannot configure the engine.";
				return $response;
			}
		}

		// literal snapshot of the live v6 constants
		$imported	= [];
		$lines		= [
			'<?php',
			'// GENERATED by the v6 maintenance widget "prepare_v7" on ' . date('c') . '.',
			'// Literal snapshot of the live v6 configuration, read by the engine bootstrap',
			'// (config_auto_migrate) and migrated into ../private/.env. Never edit by hand:',
			'// it is rewritten on every launch and quarantined after each migration.',
			''
		];
		foreach (self::CONFIG_SNAPSHOT as $name) {
			if (!defined($name)) {
				continue;
			}
			$value = constant($name);
			if (!is_scalar($value) && !is_null($value) && !is_array($value)) {
				continue; // objects/resources are not migratable literals
			}
			$lines[]	= 'define(' . var_export($name, true) . ', ' . var_export($value, true) . ');';
			$imported[]	= $name;
		}
		$lines[] = '';

		$file = $dest . '/config_db.php';
		if (@file_put_contents($file, implode(PHP_EOL, $lines)) === false) {
			$response->msg = "Failed writing the engine config snapshot: $file";
			return $response;
		}
		@chmod($file, 0600); // carries DEDALO_PASSWORD_CONN

		// remove any stale copies of the other legacy names (they would be scanned too,
		// and a previous run may have left them behind)
		foreach (['config.php', 'config_areas.php', 'config_core.php'] as $stale) {
			if (is_file($dest . '/' . $stale)) {
				@unlink($dest . '/' . $stale);
			}
		}

		// force a fresh import on the next boot (clear sentinel + prior generated env)
		$private = dirname($engine) . '/private';
		if (!is_dir($private)) {
			@mkdir($private, 0770, true);
		}
		foreach (['.migration.json', '.env'] as $generated) {
			if (is_file($private . '/' . $generated)) {
				@unlink($private . '/' . $generated);
			}
		}

		$response->result	= true;
		$response->imported	= $imported;
		$response->msg		= 'Imported ' . count($imported) . ' v6 config constants; engine will auto-migrate to .env on boot.';
		return $response;
	}//end import_v6_config


	/**
	* RUN_SUMMARY
	* Lifts the LAST '=== DATA REVIEW SUMMARY ===' block out of the run log.
	*
	* The log tail alone is a poor report: the interesting verdict scrolls away behind
	* progress heartbeats, and the engine's own detail goes to a separate file. The phases
	* delimit their verdict so the widget can show it as a block of its own.
	*
	* @param string $log_file
	* @return string - '' when the current run has not produced one yet
	*/
	private static function run_summary(string $log_file) : string {

		if (!is_file($log_file)) {
			return '';
		}

		$lines	= preg_split('/\r\n|\r|\n/', (string)file_get_contents($log_file));
		$start	= null;
		$end	= null;
		foreach ($lines as $i => $line) {
			if (strpos($line, '=== DATA REVIEW SUMMARY ===') !== false) {
				$start	= $i;
				$end	= null; // a later run supersedes an earlier one
			}else if ($start !== null && $end === null && strpos($line, '=== END SUMMARY ===') !== false) {
				$end = $i;
			}
		}
		if ($start === null) {
			return '';
		}
		$slice = array_slice($lines, $start, ($end ?? (count($lines) - 1)) - $start + 1);

		// drop the per-line timestamp+tag prefix: the block is read as a report, not a log
		$clean = array_map(
			static fn(string $l) : string => (string)preg_replace('/^\S+ \[[a-z0-9_]+\] /', '', $l),
			$slice
		);

		return implode("\n", $clean);
	}//end run_summary


	/**
	* TAIL
	* Last LOG_TAIL_LINES lines of a text file
	* @param string $file
	* @return string
	*/
	private static function tail(string $file) : string {

		$content = (string)file_get_contents($file);

		return implode("\n", array_slice(preg_split('/\r\n|\r|\n/', $content), -self::LOG_TAIL_LINES));
	}//end tail


	/**
	* PHP_CLI_BINARY
	* Absolute path of the PHP *CLI* binary used to spawn the runner.
	*
	* This widget runs under the WEB SAPI (php-fpm / apache module), where PHP_BINARY is the
	* web-server binary: `php-fpm script.php` does NOT run the script, it prints its usage and
	* exits — the runner would silently never start. v6 configures the CLI binary in
	* PHP_BIN_PATH (config_db.php), the same constant exec_::request_cli uses.
	*
	* @return string
	*/
	private static function php_cli_binary() : string {

		if (defined('PHP_BIN_PATH') && PHP_BIN_PATH !== '') {
			$bin = is_dir(PHP_BIN_PATH)
				? rtrim(PHP_BIN_PATH, DIRECTORY_SEPARATOR) . '/php' // some installs set the bin DIR
				: PHP_BIN_PATH;
			if (is_file($bin) && is_executable($bin)) {
				return $bin;
			}
		}

		// CLI context (headless call to this class): the running binary is already the right one
		if (PHP_SAPI === 'cli' && PHP_BINARY !== '') {
			return PHP_BINARY;
		}

		// sibling 'php' next to the web SAPI binary (…/bin/php-fpm → …/bin/php)
		if (PHP_BINARY !== '') {
			$sibling = dirname(PHP_BINARY) . '/php';
			if (is_file($sibling) && is_executable($sibling)) {
				return $sibling;
			}
		}

		return 'php'; // last resort: whatever is in PATH
	}//end php_cli_binary


	/**
	* PHP_CLI_CHECK
	* Verifies the resolved binary really is a PHP CLI binary before spawning anything,
	* so a misconfigured PHP_BIN_PATH is reported instead of failing silently in background.
	*
	* @param string $php
	* @return object { result: bool, version: string, msg: string }
	*/
	private static function php_cli_check(string $php) : object {

		$out = (string)@shell_exec(escapeshellarg($php) . ' -v 2>&1');
		$version = trim(strtok($out, "\n") ?: '');

		$response = new stdClass();
			$response->result	= (strpos($out, '(cli)') !== false);
			$response->version	= $version;
			$response->msg		= $response->result
				? 'OK'
				: 'Not a PHP CLI binary: ' . $php . ' — set PHP_BIN_PATH in the v6 config to the php CLI binary.';

		return $response;
	}//end php_cli_check


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

		// Runner log. When the runner never started (nothing wrote the log) fall back to the
		// spawn output, which is where a failure to even launch the child shows up.
		$log_file	= $pkg . '/var/prepare_v7.log';
		$spawn_log	= $pkg . '/var/spawn.log';
		$log_tail	= '';
		if (is_file($log_file)) {
			$log_tail = self::tail($log_file);
		} else if (is_file($spawn_log) && filesize($spawn_log) > 0) {
			$log_tail = "The runner produced no log. Spawn output (var/spawn.log):\n\n" . self::tail($spawn_log);
		}

		// data version currently recorded in the v6 database (matrix_updates).
		// The runner's version gate is authoritative; this is only informative.
		$data_version = function_exists('get_current_version_in_db')
			? implode('.', (array)get_current_version_in_db())
			: null;

		// PHP CLI binary. Under php-fpm PHP_BINARY cannot run scripts, so this is a
		// real readiness item: without a CLI binary nothing can be spawned.
		$php_cli	= self::php_cli_binary();
		$php_check	= self::php_cli_check($php_cli);

		$result = (object)[
			'is_superuser'     => (function_exists('logged_user_id') && logged_user_id() == DEDALO_SUPERUSER),
			'maintenance_mode' => ($maintenance === true),
			'database'         => defined('DEDALO_DATABASE_CONN') ? DEDALO_DATABASE_CONN : null,
			'data_version'     => $data_version,
			'dedalo_version'   => defined('DEDALO_VERSION') ? DEDALO_VERSION : null,
			'package_root'     => $pkg,
			'engine_root'      => $engine_root,
			'engine_present'   => is_file($pkg . '/engine/config/bootstrap.php'),
			'runner_present'   => is_file($pkg . '/run/run_prepare_v7.php'),
			'php_binary'       => $php_cli,
			'php_cli_ok'       => $php_check->result,
			'php_cli_version'  => $php_check->version,
			'log_file'         => $log_file,
			'log_tail'         => $log_tail,
			'run_summary'      => self::run_summary($log_file),
			'engine_log'       => is_file($pkg . '/var/data_review.engine.log')
				? $pkg . '/var/data_review.engine.log'
				: null,
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
	*   mode:        string  'preflight' (dry-run, no writes)
	*                      | 'deep'      (backup + pre_update, then a real data review;
	*                                     stops before the matrix rewrite)
	*                      | 'migrate'   (the full migration)
	*                      default 'preflight'
	*   skip_backup: bool    only honoured in the writing modes (default false)
	* }
	* @return object { result: bool, pid: int|null, msg: string, errors: array }
	*/
	public static function prepare_v7(object $options) : object {

		$mode        = in_array(($options->mode ?? ''), ['migrate', 'deep'], true)
			? (string)$options->mode
			: 'preflight';
		$skip_backup = ($options->skip_backup ?? false) === true;
		$writes      = ($mode !== 'preflight');

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
		if ($writes === true && $maintenance !== true) {
			$response->msg = 'Error. Enable maintenance mode before running anything that writes.';
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
		//    We write a literal snapshot of the live v6 constants into engine/config/config_db.php.
		//    On the next engine boot, bootstrap.php detects it and runs config_auto_migrate →
		//    generates a COMPLETE ../private/.env (DB + langs + entity + install status).
		//    This is Dédalo's own v6→v7 config path.
		$import = self::import_v6_config($engine);
		if ($import->result !== true) {
			$response->msg = 'Error importing v6 config: ' . $import->msg;
			return $response;
		}

		// 2. rotate the previous run's log, so the log (and the client polling it)
		//    always shows the CURRENT run only. One generation is kept.
		$log_file = $var_dir . '/prepare_v7.log';
		if (is_file($log_file)) {
			@rename($log_file, $log_file . '.previous');
		}

		// 3. build the runner command.
		//    NOTE: not PHP_BINARY — under php-fpm that is the FPM binary, which prints its
		//    usage instead of running the script (the runner would never start, silently).
		$php	= self::php_cli_binary();
		$check	= self::php_cli_check($php);
		if ($check->result !== true) {
			$response->msg = 'Error. ' . $check->msg;
			return $response;
		}
		switch ($mode) {
			case 'migrate':
				$flags = '--yes' . ($skip_backup ? ' --skip-backup' : '');
				break;
			case 'deep':
				$flags = '--deep-preflight' . ($skip_backup ? ' --skip-backup' : '');
				break;
			default:
				$flags = '--dry-run';
				break;
		}
		$cmd = escapeshellarg($php) . ' ' . escapeshellarg($runner) . ' ' . $flags;

		// 4. spawn DETACHED in the background, capture the PID
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

		$labels = [
			'migrate'	=> 'Migration',
			'deep'		=> 'Deep preflight (backup + pre_update, then data review)',
			'preflight'	=> 'Preflight'
		];

		$response->result	= true;
		$response->pid		= $pid;
		$response->msg		= $labels[$mode] . " started in background (pid $pid). Watch var/prepare_v7.log.";

		return $response;
	}//end prepare_v7


}//end prepare_v7
