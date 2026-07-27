<?php declare(strict_types=1);

require_once __DIR__ . '/class.installer_config_persistor.php';
require_once __DIR__ . '/class.installer_secret.php';
require_once dirname(__DIR__) . '/base/boot/class.env_loader.php';

/**
* INSTALL_SETUP_MANAGER
* The collect → validate → persist half of the modernized installer (the part the legacy
* installer left to hand-editing config files). It builds the three machine-managed config
* artifacts from the values the administrator submits in the UI and routes each value to its
* correct destination in the v7 config engine:
*   - PostgreSQL config, entity, locale + the auto-generated secrets  → ../private/.env
*   - install fingerprints (info_key, information)                    → ../private/state.php
*   - the MariaDB/diffusion subset (+ shared token)                   → diffusion/api/v1/.env
* build_artifacts() is pure (content strings only); persist() is the thin disk-commit wrapper.
*/
final class installer_setup_manager {

	/**
	* BUILD_ARTIFACTS
	* Pure: turn submitted values + what already exists on disk into the artifact contents.
	* Secrets already present in $existing_env are PRESERVED (never rotated); missing ones are
	* generated and returned in `generated` for one-time display to the administrator.
	*
	* @param object $submitted     UI values (db_*, entity, entity_label, timezone, locale,
	*                              information, info_key, diffusion, mysql_*).
	* @param array<string,string> $existing_env   parsed current ../private/.env, or []
	* @param array<string,mixed>  $existing_state  current ../private/state.php array, or []
	* @param bool   $diffusion     whether the optional diffusion step is enabled
	* @return object {env_php:string, env_bun:?string, state_php:string, generated:array<string,string>}
	*/
	public static function build_artifacts(object $submitted, array $existing_env, array $existing_state, bool $diffusion) : object {

		$generated = [];

		// --- ../private/.env : PostgreSQL + entity + locale (by constant name) ---
		$env_values = [
			'DEDALO_DATABASE_CONN' => $submitted->db_database ?? null,
			'DEDALO_USERNAME_CONN' => $submitted->db_username ?? null,
			'DEDALO_PASSWORD_CONN' => $submitted->db_password ?? null,
			'DEDALO_HOSTNAME_CONN' => $submitted->db_hostname ?? 'localhost',
			'DEDALO_DB_PORT_CONN'  => $submitted->db_port ?? null,
			'DEDALO_SOCKET_CONN'   => $submitted->db_socket ?? null,
			'DEDALO_ENTITY'        => $submitted->entity ?? null,
			'DEDALO_ENTITY_LABEL'  => $submitted->entity_label ?? ($submitted->entity ?? null),
			'DEDALO_TIMEZONE'      => $submitted->timezone ?? 'Europe/Madrid',
			'DEDALO_LOCALE'        => $submitted->locale ?? 'es-ES',
		];
		if (isset($submitted->entity_id)) {
			$env_values['DEDALO_ENTITY_ID'] = (int) $submitted->entity_id;
		}

		// salt: preserve an existing one (rotating it makes stored creds unreadable), else generate
		$salt = (isset($existing_env['DEDALO_SALT_STRING']) && $existing_env['DEDALO_SALT_STRING'] !== '')
			? $existing_env['DEDALO_SALT_STRING']
			: null;
		if ($salt === null) {
			$salt = installer_secret::generate_token(32);
			$generated['DEDALO_SALT_STRING'] = $salt;
		}
		$env_values['DEDALO_SALT_STRING'] = $salt;

		// --- diffusion (optional): MariaDB is Bun-ONLY — written to the Bun .env, NEVER the PHP
		//     .env. Only the shared internal token is dual-written (PHP also uses it for the
		//     server-to-server diffusion calls). ---
		$env_bun = null;
		if ($diffusion === true) {
			$mysql_socket = $submitted->mysql_socket ?? null;

			$token = (isset($existing_env['DEDALO_DIFFUSION_INTERNAL_TOKEN']) && $existing_env['DEDALO_DIFFUSION_INTERNAL_TOKEN'] !== '')
				? $existing_env['DEDALO_DIFFUSION_INTERNAL_TOKEN']
				: null;
			if ($token === null) {
				$token = installer_secret::generate_token(32);
				$generated['DEDALO_DIFFUSION_INTERNAL_TOKEN'] = $token;
			}
			$env_values['DEDALO_DIFFUSION_INTERNAL_TOKEN'] = $token; // shared → also the PHP .env

			// Bun .env: MariaDB creds (translated to DB_* via env_sync::BUN_DB_MAP) + the shared
			// token. Keyed here by the legacy MYSQL_DEDALO_* names purely as the BUN_DB_MAP lookup;
			// these names are NOT written to the PHP side.
			$bun_values = [
				'MYSQL_DEDALO_HOSTNAME_CONN'      => $submitted->mysql_hostname ?? 'localhost',
				'MYSQL_DEDALO_DB_PORT_CONN'       => $submitted->mysql_port ?? 3306,
				'MYSQL_DEDALO_USERNAME_CONN'      => $submitted->mysql_username ?? null,
				'MYSQL_DEDALO_PASSWORD_CONN'      => $submitted->mysql_password ?? null,
				'MYSQL_DEDALO_DATABASE_CONN'      => $submitted->mysql_database ?? null,
				'DEDALO_DIFFUSION_INTERNAL_TOKEN' => $token,
			];
			// MariaDB transport for the Bun engine:
			//  - socket provided → DB_SOCKET; db_config.ts treats any non-empty DB_SOCKET as the
			//    transport, so we omit the key entirely when there is no socket.
			//  - no socket → DB_FORCE_TCP=1 so Bun uses DB_HOST/DB_PORT instead of silently falling
			//    back to its default /tmp/mysql.sock and ignoring the host/port we wrote.
			// NOTE: this is the DB connection socket — distinct from DEDALO_DIFFUSION_SOCKET_PATH
			// (the Bun HTTP listen socket), which maps separately to SOCKET_PATH.
			$bun_extra = [];
			if (!empty($mysql_socket)) {
				$bun_values['MYSQL_DEDALO_SOCKET_CONN'] = $mysql_socket;
			} else {
				$bun_extra['DB_FORCE_TCP'] = '1';
			}

			$env_bun = installer_config_persistor::render_bun($bun_values, $bun_extra);
		}

		// --- ../private/state.php : install fingerprints (STATE scope, by dot-path) ---
		$state_values = [
			'state.information' => $submitted->information ?? null,
			'state.info_key'    => $submitted->info_key ?? null,
		];

		return (object)[
			'env_php'   => installer_config_persistor::render_env($existing_env, $env_values),
			'env_bun'   => $env_bun,
			'state_php' => installer_config_persistor::render_state($existing_state, $state_values),
			'generated' => $generated,
		];
	}//end build_artifacts



	/**
	* PRIVATE_DIR
	* The out-of-web-root directory holding .env + state.php (one level above the install,
	* exactly as config/config.php resolves it: $repo . '/../private').
	* @return string
	*/
	private static function private_dir() : string {
		return dirname(DEDALO_ROOT_PATH) . '/private';
	}//end private_dir



	/**
	* TEST_DB_CONNECTION
	* Interactive PostgreSQL check with the values the administrator just typed (NOT the live
	* constants). Distinguishes the three failure modes the UI must explain differently:
	* cannot reach/authenticate, connects but the target DB is missing, connects but the role
	* lacks DDL privilege. Runs a CREATE TEMP TABLE / INSERT / DROP probe to prove full rights.
	*
	* @param object $o {db_hostname, db_port, db_socket, db_database, db_username, db_password}
	* @return object {result, can_connect, db_exists, can_create, msg}
	*/
	public static function test_db_connection(object $o) : object {

		$host	= $o->db_hostname ?? 'localhost';
		$port	= ($o->db_port ?? '') === '' ? null : $o->db_port;
		$socket	= ($o->db_socket ?? null) ?: null;
		$db		= $o->db_database ?? '';
		$user	= $o->db_username ?? '';
		$pw		= $o->db_password ?? '';

		$response = (object)[
			'result'      => false,
			'can_connect' => false,
			'db_exists'   => false,
			'can_create'  => false,
			'msg'         => ''
		];

		// 1) try the target database
		$conn = self::safe_pg_connect($host, $user, $pw, $db, $port, $socket);
		if ($conn === false) {
			// 2) probe the maintenance DB to tell "DB missing" from "auth/host wrong"
			$maint = self::safe_pg_connect($host, $user, $pw, 'postgres', $port, $socket);
			if ($maint !== false) {
				$response->can_connect	= true;   // credentials/host are fine
				$response->db_exists	= false;
				$response->msg			= "Connected to PostgreSQL, but the database '{$db}' does not exist yet. "
					. "Create it (or use the Create database button) with this role as owner.";
				return $response;
			}
			$response->msg = "Cannot connect to PostgreSQL at '{$host}'. Check the host/port/socket, the "
				. "username and password, and that the server accepts connections from this machine "
				. "(pg_hba.conf / listen_addresses).";
			return $response;
		}

		$response->can_connect	= true;
		$response->db_exists	= true;

		// 3) prove DDL privilege with a temp-table probe
		$probe = '_dedalo_install_write_test_' . getmypid();
		$ok = false;
		try {
			$cr = @pg_query($conn, "CREATE TEMP TABLE {$probe} (id serial PRIMARY KEY, val text NOT NULL)");
			if ($cr !== false) {
				$ir = @pg_query($conn, "INSERT INTO {$probe} (val) VALUES ('write_test')");
				$dr = @pg_query($conn, "DROP TABLE IF EXISTS {$probe}");
				$ok = ($ir !== false && $dr !== false);
			}
		} catch (Throwable $e) {
			$ok = false;
		}

		$response->can_create = $ok;
		if ($ok === true) {
			$response->result	= true;
			$response->msg		= "OK. Connected to '{$db}' and verified privileges to create tables, indexes and functions.";
		} else {
			$response->msg = "Connected to '{$db}', but the role '{$user}' cannot create objects there. "
				. "Grant it full privileges (owner of the database, or CREATE on the schema).";
		}

		return $response;
	}//end test_db_connection



	/**
	* SAFE_PG_CONNECT
	* Attempt a PostgreSQL connection that NEVER escapes as a fatal: a failed pg_connect emits a
	* PHP warning that Dédalo's error handler can promote to an exception, so we both wrap it in
	* try/catch and silence warnings — returning false on any failure. Used by the interactive
	* connection test where "could not connect" is an expected, reportable outcome.
	* @return \PgSql\Connection|false
	*/
	private static function safe_pg_connect(?string $host, string $user, string $pw, string $db, int|string|null $port, ?string $socket) : \PgSql\Connection|false {
		try {
			set_error_handler(static function() : bool { return true; }); // swallow connection warnings
			$conn = DBi::_getNewConnection($host, $user, $pw, $db, $port, $socket);
			restore_error_handler();
			return $conn;
		} catch (\Throwable $e) {
			restore_error_handler();
			return false;
		}
	}//end safe_pg_connect



	/**
	* TEST_DIFFUSION_CONNECTION
	* Interactive MariaDB/MySQL check for the optional diffusion engine, with the submitted
	* values. Connection-only (the schema is created by the diffusion engine), so a successful
	* TCP+auth handshake to the named database is the success criterion.
	*
	* @param object $o {mysql_hostname, mysql_port, mysql_socket, mysql_database, mysql_username, mysql_password}
	* @return object {result, msg}
	*/
	public static function test_diffusion_connection(object $o) : object {

		$response = (object)['result' => false, 'msg' => ''];

		if (!extension_loaded('mysqli')) {
			$response->msg = 'The PHP mysqli extension is not installed; it is required to use the diffusion database.';
			return $response;
		}

		$host	= $o->mysql_hostname ?? 'localhost';
		$port	= (int)($o->mysql_port ?? 3306);
		$socket	= ($o->mysql_socket ?? null) ?: null;
		$db		= $o->mysql_database ?? '';
		$user	= $o->mysql_username ?? '';
		$pw		= $o->mysql_password ?? '';

		mysqli_report(MYSQLI_REPORT_OFF);
		$conn = false;
		try {
			set_error_handler(static function() : bool { return true; }); // swallow connection warnings
			$conn = @mysqli_connect($host, $user, $pw, $db, $port, $socket);
			restore_error_handler();
		} catch (\Throwable $e) {
			restore_error_handler();
			$conn = false;
		}
		if ($conn === false || $conn === null) {
			$response->msg = "Cannot connect to MariaDB/MySQL at '{$host}:{$port}' (database '{$db}'). "
				. 'Check the host/port/socket, the username and password, and that the database exists. '
				. (function_exists('mysqli_connect_error') ? ('Server said: ' . mysqli_connect_error()) : '');
			return $response;
		}
		@mysqli_close($conn);

		$response->result	= true;
		$response->msg		= "OK. Connected to the diffusion database '{$db}' on '{$host}'.";
		return $response;
	}//end test_diffusion_connection



	/**
	* CHECK_DIRECTORIES
	* Verify (and optionally create) the main writable directories the install requires. Write
	* permission is proven by actually writing+deleting a temp file, not just is_writable().
	* Media path is derived from the entity, so this step is meant to run AFTER the config is
	* persisted and active (so the real entity-based media path is checked).
	*
	* @param object $o {create?:bool}
	* @return object {result, dirs:array<int,{label,path,exists,writable}>, msg}
	*/
	public static function check_directories(object $o) : object {

		$create = (bool)($o->create ?? false);

		$targets = [
			['label' => 'Private (config + secrets)', 'path' => self::private_dir()],
			['label' => 'Sessions', 'path' => defined('DEDALO_SESSIONS_PATH') ? DEDALO_SESSIONS_PATH : ''],
			['label' => 'Cache',    'path' => defined('DEDALO_CACHE_PATH') ? DEDALO_CACHE_PATH : ''],
			['label' => 'Media',    'path' => defined('DEDALO_MEDIA_PATH') ? DEDALO_MEDIA_PATH : ''],
			['label' => 'Backup',   'path' => defined('DEDALO_BACKUP_PATH') ? DEDALO_BACKUP_PATH : ''],
		];

		$dirs	= [];
		$all_ok	= true;
		foreach ($targets as $t) {
			$path = $t['path'];
			if ($path === '') {
				continue; // constant not defined in this context
			}
			$exists = is_dir($path);
			if ($exists === false && $create === true) {
				create_directory($path); // shared/core_functions.php (mkdir -p, 0750)
				$exists = is_dir($path);
			}
			$writable = $exists ? self::dir_is_writable($path) : false;
			if ($writable === false) {
				$all_ok = false;
			}
			$dirs[] = (object)[
				'label'    => $t['label'],
				'path'     => $path,
				'exists'   => $exists,
				'writable' => $writable
			];
		}

		return (object)[
			'result' => $all_ok,
			'dirs'   => $dirs,
			'msg'    => $all_ok
				? 'OK. All required directories exist and are writable.'
				: 'Some directories are missing or not writable by the web-server user. Create them or fix permissions.'
		];
	}//end check_directories



	/** Prove write permission by creating and removing a temp file inside $path. */
	private static function dir_is_writable(string $path) : bool {
		$probe = rtrim($path, '/') . '/.dedalo_write_test_' . getmypid();
		$ok = @file_put_contents($probe, 'x');
		if ($ok === false) {
			return false;
		}
		@unlink($probe);
		return true;
	}//end dir_is_writable



	/**
	* PERSIST_CONFIG
	* The "Save configuration" action: merge the submitted values over whatever already exists
	* on disk, then atomically write ../private/.env, ../private/state.php and (when diffusion is
	* enabled) diffusion/api/v1/.env — backing up any existing file and chmod'ing the .env files
	* to 0600. Returns the auto-generated secrets so the UI can display them ONCE.
	*
	* @param object $o submitted values (see build_artifacts) + {diffusion?:bool}
	* @return object {result, generated:array<string,string>, report:array, msg}
	*/
	public static function persist_config(object $o) : object {

		require_once DEDALO_ROOT_PATH . '/install/class.migration_committer.php';

		$response = (object)['result' => false, 'generated' => [], 'report' => [], 'msg' => 'Error. Request failed'];

		$private = self::private_dir();
		if (!is_dir($private) && !@mkdir($private, 0700, true) && !is_dir($private)) {
			$response->msg = "The private directory does not exist and could not be created: {$private}. "
				. 'Create it (one level above the install) writable by the web-server user.';
			return $response;
		}
		if (self::dir_is_writable($private) === false) {
			$response->msg = "The private directory is not writable by the web-server user: {$private}.";
			return $response;
		}

		// read what already exists so prior steps' values/secrets survive
		$env_path	= $private . '/.env';
		$state_path	= $private . '/state.php';
		$existing_env	= is_file($env_path) ? env_loader::parse((string)file_get_contents($env_path)) : [];
		// state.php is a required PHP file; a partial/corrupt one (manual edit, disk-full mid-write)
		// would otherwise fatal here. Treat any load failure as "no prior state" — migration_committer
		// backs up the existing file before overwrite, so nothing is silently lost.
		$existing_state	= [];
		if (is_file($state_path)) {
			try {
				$existing_state = (array)(require $state_path);
			} catch (\Throwable $e) {
				$existing_state = [];
			}
		}

		$diffusion	= (bool)($o->diffusion ?? false);
		$artifacts	= self::build_artifacts($o, $existing_env, $existing_state, $diffusion);

		$artifact_map = ['env_php' => $artifacts->env_php, 'state' => $artifacts->state_php];
		$targets      = ['env_php' => $env_path, 'state' => $state_path];
		if ($artifacts->env_bun !== null) {
			$bun_path = DEDALO_ROOT_PATH . '/diffusion/api/v1/.env';
			$artifact_map['env_bun'] = $artifacts->env_bun;
			$targets['env_bun']      = $bun_path;
		}

		// sample.env — a documented reference of every configurable constant, regenerated
		// from the catalog on every save so ../private/ always ships current config help.
		// Non-secret (defaults + placeholders) → default perms (NOT in the 0600 list).
		// Never block the install: a render failure is logged and skipped; the critical
		// files (.env/state.php) still commit.
		require_once DEDALO_CORE_PATH . '/base/config/class.sample_env_renderer.php';
		try {
			$artifact_map['sample_env'] = sample_env_renderer::render();
			$targets['sample_env']      = $private . '/sample.env';
		} catch (\Throwable $e) {
			debug_log(__METHOD__ . ' sample.env render skipped: ' . $e->getMessage(), logger::WARNING);
		}

		try {
			$report = migration_committer::commit(
				$artifact_map,
				$targets,
				$private . '/.install_backups',
				['env_php', 'env_bun'] // chmod 0600
			);
		} catch (Throwable $e) {
			$response->msg = 'Error writing configuration: ' . $e->getMessage();
			return $response;
		}

		$response->result		= true;
		$response->generated	= $artifacts->generated;
		$response->report		= $report;
		$response->msg			= 'OK. Configuration written to ../private/.env'
			. ($artifacts->env_bun !== null ? ' and the diffusion engine .env' : '')
			. '. Reload php-fpm if the next check is not green.';
		return $response;
	}//end persist_config



	/**
	* VERIFY_ACTIVE_CONFIG
	* The activation gate. Called on a FRESH request after persist_config: confirms the live
	* DEDALO_* constants now reflect the saved values. Goes green only when active; otherwise the
	* process is serving cached config (persistent worker) and a php-fpm reload is required.
	*
	* @param object $o submitted values to compare against the now-live constants
	* @return object {result, active, msg}
	*/
	public static function verify_active_config(object $o) : object {

		$checks = [
			'DEDALO_DATABASE_CONN' => $o->db_database ?? null,
			'DEDALO_USERNAME_CONN' => $o->db_username ?? null,
			// password is the value most likely to still be stale after a worker reload, so verify it.
			// hostname/port are intentionally NOT checked here: their submitted vs catalog-normalized
			// forms ('' vs 'localhost', "5432" vs 5432) would yield false "not active" results under
			// the strict !== compare below.
			'DEDALO_PASSWORD_CONN' => $o->db_password ?? null,
			'DEDALO_ENTITY'        => $o->entity ?? null,
		];

		$active	= true;
		foreach ($checks as $const => $expected) {
			if ($expected === null) {
				continue;
			}
			if (!defined($const) || constant($const) !== $expected) {
				$active = false;
				break;
			}
		}

		return (object)[
			'result' => $active,
			'active' => $active,
			'msg'    => $active
				? 'OK. The saved configuration is active.'
				: 'The saved configuration is not active yet. Reload php-fpm (and restart the Bun engine if '
					. 'you configured diffusion), then re-check.'
		];
	}//end verify_active_config
}
