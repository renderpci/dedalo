<?php
/**
* KERNEL — Dédalo bootstrap orchestrator
* --------------------------------------------------------------------------
* Deterministic boot sequence that replaces the legacy monolithic config.php
* body. Preserves every ordering dependency of the original include chain:
*
*   paths -> includes(version/logger/core_functions) -> state -> db -> sentinel
*   -> dd_tipos -> registry boot+emit(declarative) -> derived -> session
*   -> debug -> loader -> logger -> request-scoped langs -> post-tipos
*
* Pure-declaration constants come from the registry (defaults.env + schema).
* Computed paths come from paths.php. Everything imperative (session_start,
* logger::register, class loading) is isolated here and guarded for CLI /
* persistent-worker (DEDALO_RR_WORKER) modes.
* --------------------------------------------------------------------------
*/

// ---- 1. computed path / host constants -------------------------------------
	require __DIR__ . '/paths.php';

// ---- 2. required files (functions/classes the rest of boot depends on) -----
	// version. Info about current version and build
	include(DEDALO_CORE_PATH . '/base/version.inc');
	// logger. Logger class (before any logging)
	include(DEDALO_CORE_PATH . '/logger/class.logger.php');
	// core_functions. Basic common functions (before session start)
	include(DEDALO_SHARED_PATH . '/core_functions.php');

// ---- 3. declarative configuration registry ---------------------------------
	// Loads defaults.env (+ later: profiles + /private/.env + real env vars),
	// coerces per schema, validates fail-closed, and emits the legacy constants.
	// Runs BEFORE config_db/config_core because those files reference declarative
	// constants (e.g. config_db builds DEDALO_INFO_KEY from DEDALO_ENTITY).
	require __DIR__ . '/class.dd_config.php';
	require __DIR__ . '/class.dd_config_state.php'; // atomic config_core.php writer
	// /private lives outside the web root (sibling of the install root, where
	// config.inc/sessions/backups already live). Override with DEDALO_PRIVATE_DIR.
	$dedalo_private_dir = getenv('DEDALO_PRIVATE_DIR') ?: (dirname(DEDALO_ROOT_PATH, 1) . '/private');

	// resolve active profile (replaces the /private/config.inc SERVER_NAME switch):
	//   DEDALO_PROFILE / DEDALO_ENV env var  >  /private/hosts.map[HTTP_HOST]  >  none
	$dedalo_profile = getenv('DEDALO_PROFILE') ?: getenv('DEDALO_ENV') ?: '';
	if ($dedalo_profile==='' && is_file($dedalo_private_dir . '/hosts.map')) {
		$dedalo_host_map = dd_config::parse_env_file($dedalo_private_dir . '/hosts.map');
		$dedalo_req_host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '';
		$dedalo_profile  = $dedalo_host_map[$dedalo_req_host] ?? ($dedalo_host_map['*'] ?? '');
	}

	// layer order (lowest -> highest precedence):
	//   defaults.env  <  profiles/<profile>.env  <  /private/.env  <  real env vars
	$dedalo_layers = [ DEDALO_CONFIG_PATH . '/defaults.env' ];
	if ($dedalo_profile!=='') {
		// basename() blocks path traversal from an untrusted host map / env var
		$dedalo_profile_file = DEDALO_CONFIG_PATH . '/profiles/' . basename($dedalo_profile) . '.env';
		if (is_file($dedalo_profile_file)) {
			$dedalo_layers[] = $dedalo_profile_file;
		}
	}
	$dedalo_layers[] = $dedalo_private_dir . '/.env'; // real values + secrets

	dd_config::boot([
		'schema_file' => __DIR__ . '/schema.php',
		'layers'      => $dedalo_layers
	]);
	dd_config::emit_constants(); // phase 'main' (non-secret declarative)

// ---- 4. runtime state (install status, maintenance, media-access overrides) -
	// config_core. Auto-managed status file (absent on a brand-new install).
	if (is_file(DEDALO_CONFIG_PATH . '/config_core.php')) {
		include(DEDALO_CONFIG_PATH . '/config_core.php');
	}

// ---- 5. database credentials -----------------------------------------------
	// config_db. Legacy PostgreSQL + MariaDB connection constants. Optional once
	// the credentials have moved to /private/.env. Included BEFORE the secrets
	// emit so a legacy config_db.php wins (zero-touch upgrade); anything it does
	// not define is then supplied from /private/.env by the secrets phase.
	if (is_file(DEDALO_CONFIG_PATH . '/config_db.php')) {
		include(DEDALO_CONFIG_PATH . '/config_db.php');
	}
	dd_config::emit_constants('secrets'); // fills any DB/secret constant not already defined

// ---- 6. secret sentinel (SEC-094) ------------------------------------------
	// Refuse to boot with sample-default secrets when enforcement is on; the
	// function self-skips under IS_UNIT_TEST and only logs by default.
	if (function_exists('dedalo_assert_secrets_initialised')) {
		dedalo_assert_secrets_initialised();
	}

// ---- 7. resolved tipo constants --------------------------------------------
	include(DEDALO_CORE_PATH . '/base/dd_tipos.php');

// ---- 8. derived constants (depend on emitted values and/or computed paths) --
	// entity label follows entity unless explicitly overridden
	if (!defined('DEDALO_ENTITY_LABEL')) {
		define('DEDALO_ENTITY_LABEL', DEDALO_ENTITY);
	}
	// diffusion langs default to project langs
	if (!defined('DEDALO_DIFFUSION_LANGS')) {
		define('DEDALO_DIFFUSION_LANGS', DEDALO_PROJECTS_DEFAULT_LANGS);
	}
	// media-derived paths/urls
	define('DEDALO_AV_FFMPEG_SETTINGS',					DEDALO_CORE_PATH . '/media_engine/lib/ffmpeg_settings');
	define('DEDALO_AV_WATERMARK_FILE',					DEDALO_MEDIA_PATH .'/'. DEDALO_AV_FOLDER . '/watermark/watermark.png');
	define('DEDALO_IMAGE_FILE_URL',						DEDALO_CORE_URL . '/media_engine/img.php');
	define('COLOR_PROFILES_PATH',						DEDALO_CORE_PATH . '/media_engine/lib/color_profiles_icc/');
	define('DEDALO_UPLOAD_TMP_DIR',						DEDALO_MEDIA_PATH . '/upload/service_upload/tmp');
	define('DEDALO_UPLOAD_TMP_URL',						DEDALO_MEDIA_URL  . '/upload/service_upload/tmp');
	define('DEDALO_TOOL_EXPORT_FOLDER_PATH',			DEDALO_MEDIA_PATH . '/export/files');
	define('DEDALO_TOOL_EXPORT_FOLDER_URL',				DEDALO_MEDIA_URL  . '/export/files');
	define('DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH',	DEDALO_MEDIA_PATH . '/import/files');
	define('ONTOLOGY_DATA_IO_DIR',						DEDALO_INSTALL_PATH . '/import/ontology');
	define('ONTOLOGY_DATA_IO_URL',						DEDALO_INSTALL_URL . '/import/ontology');
	define('DEDALO_SOURCE_VERSION_LOCAL_DIR',			'/tmp/'.DEDALO_ENTITY);
	// cache manager (files cache lives in the sessions dir)
	define('DEDALO_CACHE_MANAGER', [
		'manager'		=> 'files',
		'files_path'	=> DEDALO_SESSIONS_PATH
	]);

// ---- 9. session ------------------------------------------------------------
	// save_path: derive from the (declarative) handler unless explicitly set
	if (!defined('DEDALO_SESSION_SAVE_PATH')) {
		switch (DEDALO_SESSION_HANDLER) {
			case 'redis':
				define('DEDALO_SESSION_SAVE_PATH', 'tcp://127.0.0.1:6379');
				break;
			case 'memcached':
				define('DEDALO_SESSION_SAVE_PATH', '127.0.0.1:11211');
				break;
			case 'files':
			default:
				define('DEDALO_SESSION_SAVE_PATH', DEDALO_SESSIONS_PATH);
				break;
		}
	}

	if (session_status()!==PHP_SESSION_ACTIVE && !defined('DEDALO_RR_WORKER')) {

		// lifetime: max duration of dedalo user session (default 8 hours)
		$session_duration_hours	= $session_duration_hours ?? 8;
		$timeout_seconds		= intval($session_duration_hours*3600);

		// session name
		$sesion_name = 'dedalo_'.DEDALO_ENTITY;

		// cookie params
		$cookie_secure		= (DEDALO_PROTOCOL==='https://');
		$cookie_samesite	= (DEVELOPMENT_SERVER===true) ? 'Lax' : 'Strict';

		session_start_manager([
			'save_handler'				=> DEDALO_SESSION_HANDLER,
			'timeout_seconds'			=> $timeout_seconds,
			'save_path'					=> DEDALO_SESSION_SAVE_PATH,
			'prevent_session_lock'		=> defined('PREVENT_SESSION_LOCK') ? PREVENT_SESSION_LOCK : false,
			'session_name'				=> $sesion_name,
			'cookie_secure'				=> $cookie_secure,
			'cookie_samesite'			=> $cookie_samesite
		]);
	}//end if (session_status()!==PHP_SESSION_ACTIVE)

// ---- 10. debug / developer flags (request-scoped) --------------------------
	if (!defined('SHOW_DEBUG')) {
		define('SHOW_DEBUG', (logged_user_id()==DEDALO_SUPERUSER)
			? true
			: false
		);
	}
	define('SHOW_DEVELOPER', (logged_user_is_developer()===true)
		? true
		: false
	);

// ---- 11. class loader ------------------------------------------------------
	// auto load main classes and manage class calls
	include DEDALO_CORE_PATH . '/base/class.loader.php';

// ---- 12. activity log ------------------------------------------------------
	define('LOGGER_LEVEL', (SHOW_DEBUG===true || SHOW_DEVELOPER===true)
		? logger::DEBUG
		: logger::ERROR
	);
	logger::register('activity'	, 'activity://auto:auto@auto:5432/log_data?table=matrix_activity');
	logger::$obj['activity'] = logger::get_instance('activity');

// ---- 13. request-scoped languages ------------------------------------------
	// cascade calculate from get, post, session vars, default
	define('DEDALO_APPLICATION_LANG',	fix_cascade_config_var('dedalo_application_lang', DEDALO_APPLICATION_LANGS_DEFAULT));
	define('DEDALO_DATA_LANG',			fix_cascade_config_var('dedalo_data_lang', DEDALO_DATA_LANG_DEFAULT));

	// Persistent-worker hazard: SHOW_DEBUG / SHOW_DEVELOPER / DEDALO_APPLICATION_LANG /
	// DEDALO_DATA_LANG are request-scoped but, as constants, freeze on the FIRST
	// request this worker process handles. Until call sites migrate to the
	// request-scoped resolver (dd_config::request('application_lang') etc.),
	// make the hazard visible instead of silent. Logged once per worker process.
	if (defined('DEDALO_RR_WORKER')) {
		@error_log('[dd_config] worker mode: request-scoped constants (DEDALO_APPLICATION_LANG, DEDALO_DATA_LANG, SHOW_DEBUG, SHOW_DEVELOPER) are frozen for this worker process; per-request code should use dd_config::request(...) to avoid state bleed.');
	}

// ---- 14. post-tipos derived constants --------------------------------------
	// target filter section (depends on dd_tipos)
	define('DEDALO_FILTER_SECTION_TIPO_DEFAULT', DEDALO_SECTION_PROJECTS_TIPO);
