<?php
/**
* KERNEL — Dédalo bootstrap orchestrator
* --------------------------------------------------------------------------
* Deterministic boot sequence that replaces the legacy monolithic config.php
* body and the per-entity /private/config.inc.
*
* Order (key dependencies noted):
*   paths -> registry boot+emit(main) -> version.inc (reads DEVELOPMENT_SERVER)
*   -> logger/core_functions -> config_core -> config_db + emit(secrets)
*   -> sentinel -> dd_tipos -> derived paths -> session -> debug -> loader
*   -> logger::register -> request langs -> post-tipos -> /private/config.local.php
*
* Declarative values come from the layered registry (defaults.env < profile <
* /private/.env < env vars). Computed/structural paths come from paths.php.
* Install-specific imperative overrides live in the optional, out-of-webroot
* /private/config.local.php (the escape hatch that replaces config.inc).
* --------------------------------------------------------------------------
*/

// ---- 1. structural path / host constants -----------------------------------
	require __DIR__ . '/paths.php';

// ---- 2. configuration registry classes -------------------------------------
	require __DIR__ . '/class.dd_config.php';
	require __DIR__ . '/class.dd_config_state.php'; // atomic config_core.php writer

// ---- 3. declarative configuration (layered, typed, validated) --------------
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
	dd_config::emit_constants(); // phase 'main' — emits DEVELOPMENT_SERVER, entity, etc.

	// locale / timezone / encoding (side effects; need DEDALO_TIMEZONE/DEDALO_LOCALE)
	date_default_timezone_set(DEDALO_TIMEZONE);
	setlocale(LC_ALL, DEDALO_LOCALE);
	mb_internal_encoding('UTF-8');

// ---- 4. version (reads DEVELOPMENT_SERVER, set just above) ------------------
	include(DEDALO_CORE_PATH . '/base/version.inc');

// ---- 5. logger + core functions --------------------------------------------
	include(DEDALO_CORE_PATH . '/logger/class.logger.php');
	include(DEDALO_SHARED_PATH . '/core_functions.php');

// ---- 6. runtime state (install status, maintenance, media-access overrides) -
	if (is_file(DEDALO_CONFIG_PATH . '/config_core.php')) {
		include(DEDALO_CONFIG_PATH . '/config_core.php');
	}

// ---- 7. database credentials -----------------------------------------------
	// Legacy config_db.php is optional once credentials move to /private/.env.
	// Included BEFORE the secrets emit so a legacy config_db.php wins (zero-touch
	// upgrade); anything it does not define is supplied from /private/.env.
	if (is_file(DEDALO_CONFIG_PATH . '/config_db.php')) {
		include(DEDALO_CONFIG_PATH . '/config_db.php');
	}
	dd_config::emit_constants('secrets'); // fills any DB/secret constant not already defined

// ---- 8. secret sentinel (SEC-094) ------------------------------------------
	if (function_exists('dedalo_assert_secrets_initialised')) {
		dedalo_assert_secrets_initialised();
	}

// ---- 9. resolved tipo constants --------------------------------------------
	include(DEDALO_CORE_PATH . '/base/dd_tipos.php');

// ---- 10. derived constants (depend on emitted values and/or computed paths) -
	// media base: ROOT + subdir (subdir overridable via DEDALO_MEDIA_SUBDIR, e.g.
	// '/media_<entity>'); no_emit so DEDALO_MEDIA_SUBDIR itself is not a constant.
	$dedalo_media_subdir = dd_config::get('DEDALO_MEDIA_SUBDIR', '/media');
	if (!defined('DEDALO_MEDIA_PATH')) define('DEDALO_MEDIA_PATH', DEDALO_ROOT_PATH . $dedalo_media_subdir);
	if (!defined('DEDALO_MEDIA_URL'))  define('DEDALO_MEDIA_URL',  DEDALO_ROOT_WEB  . $dedalo_media_subdir);

	// backups (kept outside httpdocs). DEDALO_BACKUP_PATH is an 'optional' schema
	// key: if /private/.env supplies it, the registry already emitted it above and
	// this default is skipped.
	if (!defined('DEDALO_BACKUP_PATH'))			define('DEDALO_BACKUP_PATH', dirname(DEDALO_ROOT_PATH, 2) . '/backups');
	if (!defined('DEDALO_BACKUP_PATH_TEMP'))		define('DEDALO_BACKUP_PATH_TEMP', DEDALO_BACKUP_PATH . '/temp');
	if (!defined('DEDALO_BACKUP_PATH_DB'))		define('DEDALO_BACKUP_PATH_DB', DEDALO_BACKUP_PATH . '/db');
	if (!defined('DEDALO_BACKUP_PATH_ONTOLOGY'))	define('DEDALO_BACKUP_PATH_ONTOLOGY', DEDALO_BACKUP_PATH . '/ontology');

	// entity label follows entity unless explicitly overridden
	if (!defined('DEDALO_ENTITY_LABEL')) {
		define('DEDALO_ENTITY_LABEL', DEDALO_ENTITY);
	}
	// diffusion langs default to project langs
	if (!defined('DEDALO_DIFFUSION_LANGS')) {
		define('DEDALO_DIFFUSION_LANGS', DEDALO_PROJECTS_DEFAULT_LANGS);
	}
	// media-derived paths/urls
	if (!defined('DEDALO_AV_FFMPEG_SETTINGS'))			define('DEDALO_AV_FFMPEG_SETTINGS',					DEDALO_CORE_PATH . '/media_engine/lib/ffmpeg_settings');
	if (!defined('DEDALO_AV_WATERMARK_FILE'))			define('DEDALO_AV_WATERMARK_FILE',					DEDALO_MEDIA_PATH .'/'. DEDALO_AV_FOLDER . '/watermark/watermark.png');
	if (!defined('DEDALO_IMAGE_FILE_URL'))				define('DEDALO_IMAGE_FILE_URL',						DEDALO_CORE_URL . '/media_engine/img.php');
	if (!defined('COLOR_PROFILES_PATH'))				define('COLOR_PROFILES_PATH',						DEDALO_CORE_PATH . '/media_engine/lib/color_profiles_icc/');
	if (!defined('DEDALO_UPLOAD_TMP_DIR'))				define('DEDALO_UPLOAD_TMP_DIR',						DEDALO_MEDIA_PATH . '/upload/service_upload/tmp');
	if (!defined('DEDALO_UPLOAD_TMP_URL'))				define('DEDALO_UPLOAD_TMP_URL',						DEDALO_MEDIA_URL  . '/upload/service_upload/tmp');
	if (!defined('DEDALO_TOOL_EXPORT_FOLDER_PATH'))		define('DEDALO_TOOL_EXPORT_FOLDER_PATH',			DEDALO_MEDIA_PATH . '/export/files');
	if (!defined('DEDALO_TOOL_EXPORT_FOLDER_URL'))		define('DEDALO_TOOL_EXPORT_FOLDER_URL',				DEDALO_MEDIA_URL  . '/export/files');
	if (!defined('DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH')) define('DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH',	DEDALO_MEDIA_PATH . '/import/files');
	if (!defined('ONTOLOGY_DATA_IO_DIR'))				define('ONTOLOGY_DATA_IO_DIR',						DEDALO_INSTALL_PATH . '/import/ontology');
	if (!defined('ONTOLOGY_DATA_IO_URL'))				define('ONTOLOGY_DATA_IO_URL',						DEDALO_INSTALL_URL . '/import/ontology');
	if (!defined('DEDALO_SOURCE_VERSION_LOCAL_DIR'))	define('DEDALO_SOURCE_VERSION_LOCAL_DIR',			'/tmp/'.DEDALO_ENTITY);
	// cache manager (files cache lives in the sessions dir)
	if (!defined('DEDALO_CACHE_MANAGER')) {
		define('DEDALO_CACHE_MANAGER', [
			'manager'		=> 'files',
			'files_path'	=> DEDALO_SESSIONS_PATH
		]);
	}

// ---- 11. session -----------------------------------------------------------
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

// ---- 12. debug / developer flags (request-scoped; overridable via /private) -
	if (!defined('SHOW_DEBUG')) {
		define('SHOW_DEBUG', (logged_user_id()==DEDALO_SUPERUSER)
			? true
			: false
		);
	}
	if (!defined('SHOW_DEVELOPER')) {
		define('SHOW_DEVELOPER', (logged_user_is_developer()===true)
			? true
			: false
		);
	}

// ---- 13. class loader ------------------------------------------------------
	include DEDALO_CORE_PATH . '/base/class.loader.php';

// ---- 14. activity log ------------------------------------------------------
	if (!defined('LOGGER_LEVEL')) {
		define('LOGGER_LEVEL', (SHOW_DEBUG===true || SHOW_DEVELOPER===true)
			? logger::DEBUG
			: logger::ERROR
		);
	}
	logger::register('activity'	, 'activity://auto:auto@auto:5432/log_data?table=matrix_activity');
	logger::$obj['activity'] = logger::get_instance('activity');

// ---- 15. request-scoped languages ------------------------------------------
	// cascade calculate from get, post, session vars, default
	if (!defined('DEDALO_APPLICATION_LANG'))	define('DEDALO_APPLICATION_LANG',	fix_cascade_config_var('dedalo_application_lang', DEDALO_APPLICATION_LANGS_DEFAULT));
	if (!defined('DEDALO_DATA_LANG'))			define('DEDALO_DATA_LANG',			fix_cascade_config_var('dedalo_data_lang', DEDALO_DATA_LANG_DEFAULT));

	// Persistent-worker hazard: these request-scoped constants freeze on the FIRST
	// request a worker process handles. Until call sites migrate to the resolver
	// (dd_config::request('application_lang') etc.), make the hazard visible.
	if (defined('DEDALO_RR_WORKER')) {
		@error_log('[dd_config] worker mode: request-scoped constants (DEDALO_APPLICATION_LANG, DEDALO_DATA_LANG, SHOW_DEBUG, SHOW_DEVELOPER) are frozen for this worker process; per-request code should use dd_config::request(...) to avoid state bleed.');
	}

// ---- 16. post-tipos derived constants --------------------------------------
	if (!defined('DEDALO_FILTER_SECTION_TIPO_DEFAULT')) {
		define('DEDALO_FILTER_SECTION_TIPO_DEFAULT', DEDALO_SECTION_PROJECTS_TIPO);
	}

// ---- 17. install-specific overrides (optional, outside the web root) --------
	// Escape hatch that replaces the per-entity config.inc: arbitrary PHP for
	// custom constants / computed paths that do not fit the declarative model.
	// Runs last, so it can use any constant, class or function. Define with
	// if(!defined()) inside the file to override, or plain define() for additions.
	if (is_file($dedalo_private_dir . '/config.local.php')) {
		include $dedalo_private_dir . '/config.local.php';
	}
