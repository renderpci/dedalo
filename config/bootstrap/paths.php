<?php
/**
* PATHS — computed path / host constants
* --------------------------------------------------------------------------
* The constants that CANNOT live in defaults.env because they are derived
* from the filesystem location (__DIR__), the request host ($_SERVER) or from
* each other. Pure declaration, no side effects. Included first by kernel.php.
*
* Anchored on this file's own location (config/bootstrap/paths.php), so it
* resolves the install root identically whether the orchestrator is
* config/config.php or config/sample.config.php.
* --------------------------------------------------------------------------
*/

// host
	define('DEDALO_HOST', php_sapi_name()==='cli'
		? 'localhost'
		: $_SERVER['HTTP_HOST'] ?? ''
	);
	define('DEDALO_PROTOCOL', (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on') ? 'https://' : 'http://');

// root paths
	// .../config/bootstrap -> dirname x2 -> install root
	define('DEDALO_ROOT_PATH',	dirname(__DIR__, 2));
	define('DEDALO_ROOT_WEB',	php_sapi_name()==='cli'
		? '/dedalo'
		: '/' . explode('/', $_SERVER["REQUEST_URI"])[1]
	);

// base path fragments
	define('DEDALO_CONFIG',	'config');
	define('DEDALO_CORE',	'core');
	define('DEDALO_SHARED',	'shared');
	define('DEDALO_TOOLS',	'tools');
	define('DEDALO_LIB',	'lib');

// config
	define('DEDALO_CONFIG_PATH',		DEDALO_ROOT_PATH .'/'. DEDALO_CONFIG );

// core
	define('DEDALO_CORE_PATH',			DEDALO_ROOT_PATH .'/'. DEDALO_CORE);
	define('DEDALO_CORE_URL',			DEDALO_ROOT_WEB .'/'. DEDALO_CORE );

// shared
	define('DEDALO_SHARED_PATH',		DEDALO_ROOT_PATH .'/'. DEDALO_SHARED);
	define('DEDALO_SHARED_URL',			DEDALO_ROOT_WEB  .'/'. DEDALO_SHARED );

// tools
	define('DEDALO_TOOLS_PATH',			DEDALO_ROOT_PATH .'/'. DEDALO_TOOLS);
	define('DEDALO_TOOLS_URL',			DEDALO_ROOT_WEB .'/'. DEDALO_TOOLS );

// lib
	define('DEDALO_LIB_PATH',			DEDALO_ROOT_PATH .'/'. DEDALO_LIB);
	define('DEDALO_LIB_URL',			DEDALO_ROOT_WEB .'/'. DEDALO_LIB );

// widgets
	define('DEDALO_WIDGETS_PATH',		DEDALO_CORE_PATH . '/widgets');
	define('DEDALO_WIDGETS_URL',		DEDALO_CORE_URL . '/widgets');

// extras
	define('DEDALO_EXTRAS_PATH',		DEDALO_CORE_PATH . '/extras');
	define('DEDALO_EXTRAS_URL',			DEDALO_CORE_URL . '/extras');

// install
	define('DEDALO_INSTALL_PATH',		DEDALO_ROOT_PATH . '/install');
	define('DEDALO_INSTALL_URL',		DEDALO_ROOT_WEB . '/install');

// Work API
	define('DEDALO_API_URL',			DEDALO_CORE_URL . '/api/v1/json/');

// Diffusion engine API (socket path + internal token are declarative; see defaults.env)
	define('DEDALO_DIFFUSION_PATH', 	DEDALO_ROOT_PATH.'/diffusion');
	define('DEDALO_DIFFUSION_API_URL',	DEDALO_ROOT_WEB . '/diffusion/api/v1/');

// media base paths (entity-overridable subdir comes in a later phase)
	define('DEDALO_MEDIA_PATH',	DEDALO_ROOT_PATH	. '/media');
	define('DEDALO_MEDIA_URL',	DEDALO_ROOT_WEB		. '/media');

// sessions (kept outside httpdocs)
	define('DEDALO_SESSIONS_PATH', dirname(DEDALO_ROOT_PATH, 2) . '/sessions');

// backups (kept outside httpdocs)
	define('DEDALO_BACKUP_PATH',			dirname(DEDALO_ROOT_PATH, 2) . '/backups');
	define('DEDALO_BACKUP_PATH_TEMP',		DEDALO_BACKUP_PATH . '/temp');
	define('DEDALO_BACKUP_PATH_DB',			DEDALO_BACKUP_PATH . '/db');
	define('DEDALO_BACKUP_PATH_ONTOLOGY',	DEDALO_BACKUP_PATH . '/ontology');

// update log (web read forbidden)
	define('UPDATE_LOG_FILE', DEDALO_CONFIG_PATH . '/update.log');
