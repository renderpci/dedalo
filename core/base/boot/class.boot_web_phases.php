<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';

/**
* BOOT_WEB_PHASES
* The logic-bearing functioning phases of the WEB boot (beyond the constant surface):
* logger registration, session start, and the request/user-scoped define()s. These run
* real v6 subsystem code and constants that exist only after the surface + include phases,
* so the closures are exercised at the live boot (flip-time), not in the hermetic harness;
* the unit tests assert phase NAME + skip_in only.
*
* The request-state phase keeps define()-ing DEDALO_APPLICATION_LANG / DEDALO_DATA_LANG /
* SHOW_DEBUG / SHOW_DEVELOPER / LOGGER_LEVEL the FPM-safe way — the ~300 read-sites still
* depend on the constants; the worker-safe accessor conversion is the deferred Phase 5.
* (compat_shim still never emits these; they come from here.) Transcribed verbatim from
* config/sample.config.php (session lines 182–235; request-state lines 251–339).
*/
final class boot_web_phases {

	/** P8 — include the logger and register the lazy 'activity' backend (no DB connect yet). */
	public static function logger_phase(string $logger_file) : boot_phase {
		return new boot_phase('logger', static function () use ($logger_file) : void {
			require_once $logger_file;
			logger::register('activity', 'activity://auto:auto@auto:5432/log_data?table=matrix_activity');
			logger::$obj['activity'] = logger::get_instance('activity');
		});
	}//end logger_phase

	/** P13 — start the PHP session (WEB only). Handler-conditional save path; v6 guard preserved. */
	public static function session_phase() : boot_phase {
		return new boot_phase('session_start', static function () : void {
			self::start_web_session();
		}, ['cli', 'cron', 'worker_init', 'test']);
	}//end session_phase



	/**
	* START_WEB_SESSION
	* Configures and starts the PHP session from the resolved Dédalo session constants
	* (handler, save path, name, cookie flags). Idempotent: returns immediately when a
	* session is already active or under a RoadRunner worker.
	*
	* Normally run by session_phase() during a WEB boot. It is ALSO called directly by
	* core/base/process_runner.php: background CLI jobs boot under the CLI profile (which
	* skips session_phase), yet must restore the caller's session — addressed by its forced
	* session_id — so login::is_logged() can authenticate the job. Must run AFTER the boot
	* has defined the DEDALO_SESSION_* / DEDALO_ENTITY / DEDALO_PROTOCOL constants.
	*/
	public static function start_web_session() : void {
		if (session_status() === PHP_SESSION_ACTIVE || defined('DEDALO_RR_WORKER')) {
			return;
		}
		$handler   = defined('DEDALO_SESSION_HANDLER') ? DEDALO_SESSION_HANDLER : 'files';
		// Honor an explicit DEDALO_SESSION_SAVE_PATH (e.g. a redis unix socket) as v6 did; else map by handler.
		// The catalog always emits the constant (empty when unset), so test for a non-empty value, not defined().
		$save_path = (defined('DEDALO_SESSION_SAVE_PATH') && DEDALO_SESSION_SAVE_PATH !== '') ? DEDALO_SESSION_SAVE_PATH : match ($handler) {
			'redis'     => 'tcp://127.0.0.1:6379',
			'memcached' => '127.0.0.1:11211',
			default     => DEDALO_SESSIONS_PATH,
		};
		// Defensive: a 'files' handler cannot use a stream-wrapper save path (e.g. a redis
		// 'tcp://…' left over from a v6→v7 migration, where the save path was migrated but the
		// handler defaulted to 'files'). session_start_manager would then call is_dir('tcp://…')
		// and fatal ("Unable to find the wrapper tcp"). Fall back to the local sessions dir so a
		// mis-migrated save path can never break session start / login.
		if ($handler === 'files' && is_string($save_path) && strpos($save_path, '://') !== false) {
			debug_log(__METHOD__
				. " Ignoring non-filesystem session save_path for the 'files' handler; using DEDALO_SESSIONS_PATH." . PHP_EOL
				. ' ignored save_path: ' . $save_path
				, logger::WARNING
			);
			$save_path = DEDALO_SESSIONS_PATH;
		}
		session_start_manager([
			'save_handler'         => $handler,
			'timeout_seconds'      => 8 * 3600,
			'save_path'            => $save_path,
			'prevent_session_lock' => defined('PREVENT_SESSION_LOCK') ? PREVENT_SESSION_LOCK : false,
			// PHP session names must be alphanumeric (no spaces/dots/etc.), so sanitize the entity
			// — otherwise an entity like "My entity" yields an invalid name and session_start fails.
			'session_name'         => 'dedalo_' . preg_replace('/[^A-Za-z0-9]/', '_', (string) DEDALO_ENTITY),
			'cookie_secure'        => (DEDALO_PROTOCOL === 'https://'),
			'cookie_samesite'      => (defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER === true) ? 'Lax' : 'Strict',
		]);
	}//end start_web_session

	/** P14 — request/user-scoped define()s (WEB only). FPM-safe; needs session + core_functions + dd_tipos. */
	public static function request_state_phase() : boot_phase {
		return new boot_phase('request_state', static function () : void {
			if (!defined('SHOW_DEBUG')) {
				define('SHOW_DEBUG', (logged_user_id() == DEDALO_SUPERUSER));
			}
			if (!defined('SHOW_DEVELOPER')) {
				define('SHOW_DEVELOPER', (logged_user_is_developer() === true));
			}
			if (!defined('LOGGER_LEVEL')) {
				define('LOGGER_LEVEL', (SHOW_DEBUG === true || SHOW_DEVELOPER === true) ? logger::DEBUG : logger::ERROR);
			}
			if (!defined('DEDALO_APPLICATION_LANG')) {
				define('DEDALO_APPLICATION_LANG', fix_cascade_config_var('dedalo_application_lang', DEDALO_APPLICATION_LANGS_DEFAULT));
			}
			if (!defined('DEDALO_DATA_LANG')) {
				define('DEDALO_DATA_LANG', fix_cascade_config_var('dedalo_data_lang', DEDALO_DATA_LANG_DEFAULT));
			}
				// SHOW_DEBUG is now defined — re-apply error reporting (P0 used a production-safe default)
				if (class_exists('dd_error')) {
					dd_error::apply_reporting();
				}
		}, ['worker_init', 'test']);
	}//end request_state_phase
}
