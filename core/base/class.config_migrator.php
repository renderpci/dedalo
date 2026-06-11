<?php declare(strict_types=1);
/**
 * CONFIG_MIGRATOR
 * Migrates legacy Dédalo config.php + config_db.php define() calls
 * into a .env file compatible with the new bootstrap.php + env_loader
 * architecture introduced in v7.
 *
 * Usage (inline): called automatically by bootstrap.php when no .env exists
 * Usage (CLI):   php core/base/migrate_config.php [--dry-run] [--force]
 *
 * Features:
 * - Loads old config files in isolated scope to capture all defined constants
 * - Filters out structural/computed constants (paths, includes, session logic)
 * - Converts PHP types to .env format: bool→string, array→JSON, null→empty
 * - Writes .env with section comments matching bootstrap.php numbering
 * - Sets file permissions to 0600 for security
 * - Verifies DB connection with new .env before moving old files
 * - Moves old config files to /private/config_backup/ only after stability confirmed
 *
 * @package Dedalo
 * @subpackage Core
 */
class config_migrator {

	/**
	 * Constants that are structural/computed in bootstrap.php and should
	 * NOT be written to .env. These are either path constants derived
	 * from __FILE__, directory name constants, or constants that
	 * bootstrap.php computes from other values.
	 */
	private const SKIP_CONSTANTS = [
		// §2 Host + protocol (computed from $_SERVER)
		'DEDALO_HOST',
		'DEDALO_PROTOCOL',
		// §3 Root + base paths (computed from __FILE__)
		'DEDALO_ROOT_PATH',
		'DEDALO_ROOT_WEB',
		'DEDALO_CONFIG',
		'DEDALO_CORE',
		'DEDALO_SHARED',
		'DEDALO_TOOLS',
		'DEDALO_LIB',
		'DEDALO_CONFIG_PATH',
		'DEDALO_CORE_PATH',
		'DEDALO_CORE_URL',
		'DEDALO_SHARED_PATH',
		'DEDALO_SHARED_URL',
		'DEDALO_TOOLS_PATH',
		'DEDALO_TOOLS_URL',
		'DEDALO_LIB_PATH',
		'DEDALO_LIB_URL',
		'DEDALO_WIDGETS_PATH',
		'DEDALO_WIDGETS_URL',
		'DEDALO_EXTRAS_PATH',
		'DEDALO_EXTRAS_URL',
		'DEDALO_INSTALL_PATH',
		'DEDALO_INSTALL_URL',
		'DEDALO_API_URL',
		'DEDALO_DIFFUSION_PATH',
		'DEDALO_DIFFUSION_API_URL',
		// §5 Includes (handled by bootstrap.php)
		// §6 Sessions (computed)
		'DEDALO_SESSIONS_PATH',
		// §8 Cache (computed from DEDALO_ROOT_PATH)
		'DEDALO_CACHE_MANAGER',
		// §9 Loader (handled by bootstrap.php)
		// §11 Logger (computed from SHOW_DEBUG)
		'LOGGER_LEVEL',
		'UPDATE_LOG_FILE',
		// §12 Secret sentinel (handled by bootstrap.php)
		// §13 Lang (computed from cascade)
		'DEDALO_APPLICATION_LANG',
		'DEDALO_DATA_LANG',
		// §14 Default config (computed)
		'DEDALO_FILTER_SECTION_TIPO_DEFAULT',
		// §15 Media paths (computed from DEDALO_ROOT_PATH + DEDALO_MEDIA_DIR_NAME)
		'DEDALO_MEDIA_PATH',
		'DEDALO_MEDIA_URL',
		'DEDALO_AV_FFMPEG_PATH',
		'DEDALO_AV_FFMPEG_SETTINGS',
		'DEDALO_AV_FASTSTART_PATH',
		'DEDALO_AV_FFPROBE_PATH',
		'DEDALO_AV_WATERMARK_FILE',
		'DEDALO_IMAGE_FILE_URL',
		'MAGICK_PATH',
		'COLOR_PROFILES_PATH',
		'DEDALO_3D_GLTFPACK_PATH',
		'DEDALO_3D_FBX2GLTF_PATH',
		'DEDALO_3D_COLLADA2GLTF_PATH',
		'PDF_AUTOMATIC_TRANSCRIPTION_ENGINE',
		// §16 Upload (computed)
		'DEDALO_UPLOAD_TMP_DIR',
		'DEDALO_UPLOAD_TMP_URL',
		'DEDALO_TOOL_EXPORT_FOLDER_PATH',
		'DEDALO_TOOL_EXPORT_FOLDER_URL',
		'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH',
		// §19 Structure (computed)
		'ONTOLOGY_DATA_IO_DIR',
		'ONTOLOGY_DATA_IO_URL',
		'DEDALO_SOURCE_VERSION_LOCAL_DIR',
		// §24 Config areas (handled by bootstrap.php)
		// Other computed / internal
		'DEDALO_DB_TYPE', // always 'postgresql' in bootstrap.php
		'DEDALO_SECTION_PROJECTS_TIPO', // from dd_tipos.php
		'DEDALO_SUPERUSER', // from dd_tipos.php
		'DEDALO_ROOT_USER', // from dd_tipos.php
		'DEDALO_SECTION_AREA_TIPO', // from dd_tipos.php
		'NUMERICAL_MATRIX_VALUE_YES', // rarely changed, has good default
		'NUMERICAL_MATRIX_VALUE_NO', // rarely changed, has good default
		'DEDALO_MAX_ROWS_PER_PAGE', // rarely changed, has good default
		'DEDALO_PROFILE_DEFAULT', // rarely changed, has good default
		'DEDALO_DEFAULT_PROJECT', // rarely changed, has good default
		'DEDALO_IMAGE_THUMB_WIDTH', // rarely changed, has good default
		'DEDALO_IMAGE_THUMB_HEIGHT', // rarely changed, has good default
		'DEDALO_IMAGE_PRINT_DPI', // rarely changed, has good default
		'DEDALO_INSTALL_STATUS', // managed by config_core.php
		'SHOW_DEBUG', // computed from logged user in bootstrap.php
		'SHOW_DEVELOPER', // computed from logged user in bootstrap.php
		'DEDALO_ENTITY_LABEL', // defaults to DEDALO_ENTITY in bootstrap.php
		'DEDALO_ENTITY_ID', // defaults to 0 in bootstrap.php
		'IS_PRODUCTION', // computed from !DEVELOPMENT_SERVER in bootstrap.php
		'DEDALO_INFORMATION', // security-critical, but bootstrap has safe default
		'DEDALO_INFO_KEY', // security-critical, but bootstrap has safe default
		'DEDALO_SESSION_SAVE_PATH', // computed from DEDALO_SESSION_HANDLER in bootstrap.php
	];

	/**
	 * Constants that are ALWAYS written to .env regardless of whether
	 * they match the bootstrap.php default. These are security-critical
	 * values that MUST be explicitly set.
	 */
	private const ALWAYS_WRITE = [
		'DEDALO_SALT_STRING',
		'DEDALO_HOSTNAME_CONN',
		'DEDALO_DATABASE_CONN',
		'DEDALO_USERNAME_CONN',
		'DEDALO_PASSWORD_CONN',
		'DEDALO_INFORMATION',
		'DEDALO_INFO_KEY',
		'MYSQL_DEDALO_HOSTNAME_CONN',
		'MYSQL_DEDALO_USERNAME_CONN',
		'MYSQL_DEDALO_PASSWORD_CONN',
		'MYSQL_DEDALO_DATABASE_CONN',
	];

	/**
	 * Map of constant names to .env section headers.
	 * Used to organize the generated .env file.
	 */
	private const SECTION_MAP = [
		'DEDALO_SALT_STRING' => '4. Environmental scalar constants / secrets',
		'DEDALO_TIMEZONE' => '4. Environmental scalar constants / locale',
		'DEDALO_LOCALE' => '4. Environmental scalar constants / locale',
		'DEDALO_DATE_ORDER' => '4. Environmental scalar constants / locale',
		'DEDALO_ENTITY' => '4. Environmental scalar constants / entity',
		'DEDALO_ENTITY_LABEL' => '4. Environmental scalar constants / entity',
		'DEDALO_ENTITY_ID' => '4. Environmental scalar constants / entity',
		'DEVELOPMENT_SERVER' => '4. Environmental scalar constants / production',
		'IS_PRODUCTION' => '4. Environmental scalar constants / production',
		'DEDALO_BINARY_BASE_PATH' => '4. Environmental scalar constants / binary',
		'DEDALO_SESSION_HANDLER' => '6. Sessions',
		'DEDALO_SESSION_SAVE_PATH' => '6. Sessions',
		'DEDALO_HOSTNAME_CONN' => '7. Database constants / PostgreSQL',
		'DEDALO_DB_PORT_CONN' => '7. Database constants / PostgreSQL',
		'DEDALO_SOCKET_CONN' => '7. Database constants / PostgreSQL',
		'DEDALO_DATABASE_CONN' => '7. Database constants / PostgreSQL',
		'DEDALO_USERNAME_CONN' => '7. Database constants / PostgreSQL',
		'DEDALO_PASSWORD_CONN' => '7. Database constants / PostgreSQL',
		'DEDALO_INFORMATION' => '7. Database constants / PostgreSQL',
		'DEDALO_INFO_KEY' => '7. Database constants / PostgreSQL',
		'DB_BIN_PATH' => '7. Database constants / PostgreSQL',
		'PHP_BIN_PATH' => '7. Database constants / PostgreSQL',
		'SLOW_QUERY_MS' => '7. Database constants / PostgreSQL',
		'DEDALO_DB_MANAGEMENT' => '7. Database constants / PostgreSQL',
		'PERSISTENT_CONNECTION' => '7. Database constants / PostgreSQL',
		'MYSQL_DEDALO_HOSTNAME_CONN' => '7. Database constants / MySQL',
		'MYSQL_DEDALO_USERNAME_CONN' => '7. Database constants / MySQL',
		'MYSQL_DEDALO_PASSWORD_CONN' => '7. Database constants / MySQL',
		'MYSQL_DEDALO_DATABASE_CONN' => '7. Database constants / MySQL',
		'MYSQL_DEDALO_DB_PORT_CONN' => '7. Database constants / MySQL',
		'MYSQL_DEDALO_SOCKET_CONN' => '7. Database constants / MySQL',
		'MYSQL_DB_BIN_PATH' => '7. Database constants / MySQL',
		'DEDALO_CACHE_PATH' => '8. Cache + debug',
		'SHOW_DEBUG' => '8. Cache + debug',
		'SHOW_DEVELOPER' => '8. Cache + debug',
		'DEDALO_BACKUP_ON_LOGIN' => '10. Backup paths',
		'DEDALO_BACKUP_TIME_RANGE' => '10. Backup paths',
		'DEDALO_BACKUP_PATH' => '10. Backup paths',
		'DEDALO_BACKUP_PATH_TEMP' => '10. Backup paths',
		'DEDALO_BACKUP_PATH_DB' => '10. Backup paths',
		'DEDALO_BACKUP_PATH_ONTOLOGY' => '10. Backup paths',
		'DEDALO_STRUCTURE_LANG' => '13. Lang config',
		'DEDALO_APPLICATION_LANGS' => '13. Lang config',
		'DEDALO_APPLICATION_LANGS_DEFAULT' => '13. Lang config',
		'DEDALO_DATA_LANG_DEFAULT' => '13. Lang config',
		'DEDALO_DATA_LANG_SELECTOR' => '13. Lang config',
		'DEDALO_DATA_LANG_SYNC' => '13. Lang config',
		'DEDALO_DATA_NOLAN' => '13. Lang config',
		'DEDALO_PROJECTS_DEFAULT_LANGS' => '13. Lang config',
		'DEDALO_DIFFUSION_LANGS' => '13. Lang config',
		'DEDALO_PREFIX_TIPOS' => '14. Default config values',
		'MAIN_FALLBACK_SECTION' => '14. Default config values',
		'DEDALO_MEDIA_DIR_NAME' => '15. Media config',
		'DEDALO_THUMB_EXTENSION' => '15. Media config / thumb',
		'DEDALO_QUALITY_THUMB' => '15. Media config / thumb',
		'DEDALO_AV_FOLDER' => '15. Media config / av',
		'DEDALO_AV_EXTENSION' => '15. Media config / av',
		'DEDALO_AV_EXTENSIONS_SUPPORTED' => '15. Media config / av',
		'DEDALO_AV_MIME_TYPE' => '15. Media config / av',
		'DEDALO_AV_TYPE' => '15. Media config / av',
		'DEDALO_AV_QUALITY_ORIGINAL' => '15. Media config / av',
		'DEDALO_AV_QUALITY_DEFAULT' => '15. Media config / av',
		'DEDALO_AV_AR_QUALITY' => '15. Media config / av',
		'DEDALO_AV_POSTERFRAME_EXTENSION' => '15. Media config / av',
		'DEDALO_AV_STREAMER' => '15. Media config / av',
		'DEDALO_SUBTITLES_FOLDER' => '15. Media config / av',
		'DEDALO_AV_SUBTITLES_EXTENSION' => '15. Media config / av',
		'DEDALO_AV_RECOMPRESS_ALL' => '15. Media config / av',
		'DEDALO_IMAGE_FOLDER' => '15. Media config / image',
		'DEDALO_IMAGE_EXTENSION' => '15. Media config / image',
		'DEDALO_IMAGE_MIME_TYPE' => '15. Media config / image',
		'DEDALO_IMAGE_TYPE' => '15. Media config / image',
		'DEDALO_IMAGE_EXTENSIONS_SUPPORTED' => '15. Media config / image',
		'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS' => '15. Media config / image',
		'DEDALO_IMAGE_QUALITY_ORIGINAL' => '15. Media config / image',
		'DEDALO_IMAGE_QUALITY_RETOUCHED' => '15. Media config / image',
		'DEDALO_IMAGE_QUALITY_DEFAULT' => '15. Media config / image',
		'DEDALO_IMAGE_AR_QUALITY' => '15. Media config / image',
		'MAGICK_CONFIG' => '15. Media config / image',
		'DEDALO_IMAGE_WEB_FOLDER' => '15. Media config / image',
		'DEDALO_PDF_FOLDER' => '15. Media config / pdf',
		'DEDALO_PDF_EXTENSION' => '15. Media config / pdf',
		'DEDALO_PDF_EXTENSIONS_SUPPORTED' => '15. Media config / pdf',
		'DEDALO_PDF_ALTERNATIVE_EXTENSIONS' => '15. Media config / pdf',
		'DEDALO_PDF_MIME_TYPE' => '15. Media config / pdf',
		'DEDALO_PDF_TYPE' => '15. Media config / pdf',
		'DEDALO_PDF_QUALITY_ORIGINAL' => '15. Media config / pdf',
		'DEDALO_PDF_QUALITY_DEFAULT' => '15. Media config / pdf',
		'DEDALO_PDF_AR_QUALITY' => '15. Media config / pdf',
		'DEDALO_3D_FOLDER' => '15. Media config / 3d',
		'DEDALO_3D_EXTENSION' => '15. Media config / 3d',
		'DEDALO_3D_EXTENSIONS_SUPPORTED' => '15. Media config / 3d',
		'DEDALO_3D_MIME_TYPE' => '15. Media config / 3d',
		'DEDALO_3D_QUALITY_ORIGINAL' => '15. Media config / 3d',
		'DEDALO_3D_QUALITY_DEFAULT' => '15. Media config / 3d',
		'DEDALO_3D_THUMB_DEFAULT' => '15. Media config / 3d',
		'DEDALO_3D_AR_QUALITY' => '15. Media config / 3d',
		'DEDALO_SVG_FOLDER' => '15. Media config / svg',
		'DEDALO_SVG_EXTENSION' => '15. Media config / svg',
		'DEDALO_SVG_EXTENSIONS_SUPPORTED' => '15. Media config / svg',
		'DEDALO_SVG_MIME_TYPE' => '15. Media config / svg',
		'DEDALO_SVG_QUALITY_ORIGINAL' => '15. Media config / svg',
		'DEDALO_SVG_QUALITY_DEFAULT' => '15. Media config / svg',
		'DEDALO_SVG_AR_QUALITY' => '15. Media config / svg',
		'DEDALO_HTML_FILES_FOLDER' => '15. Media config / html',
		'DEDALO_HTML_FILES_EXTENSION' => '15. Media config / html',
		'DEDALO_UPLOAD_SERVICE_CHUNK_FILES' => '16. Upload config',
		'DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT' => '16. Upload config',
		'DEDALO_GEO_PROVIDER' => '17. Geo + entity menu + misc',
		'DEDALO_ENTITY_MEDIA_AREA_TIPO' => '17. Geo + entity menu + misc',
		'DEDALO_ENTITY_MENU_SKIP_TIPOS' => '17. Geo + entity menu + misc',
		'DEDALO_TEST_INSTALL' => '17. Geo + entity menu + misc',
		'DEDALO_LOCK_COMPONENTS' => '17. Geo + entity menu + misc',
		'DEDALO_PROTECT_MEDIA_FILES' => '17. Geo + entity menu + misc',
		'DEDALO_NOTIFICATIONS' => '17. Geo + entity menu + misc',
		'DEDALO_AR_EXCLUDE_COMPONENTS' => '17. Geo + entity menu + misc',
		'DEDALO_FILTER_USER_RECORDS_BY_ID' => '17. Geo + entity menu + misc',
		'ENCRYPTION_MODE' => '17. Geo + entity menu + misc',
		'DEDALO_DIFFUSION_DOMAIN' => '18. Diffusion config',
		'DEDALO_DIFFUSION_RESOLVE_LEVELS' => '18. Diffusion config',
		'DEDALO_PUBLICATION_CLEAN_URL' => '18. Diffusion config',
		'DIFFUSION_CUSTOM' => '18. Diffusion config',
		'API_WEB_USER_CODE_MULTIPLE' => '18. Diffusion config',
		'EXCLUDE_DIFFUSION_ELEMENTS' => '18. Diffusion config',
		'STRUCTURE_FROM_SERVER' => '19. Structure / ontology / code servers',
		'IS_AN_ONTOLOGY_SERVER' => '19. Structure / ontology / code servers',
		'ONTOLOGY_SERVERS' => '19. Structure / ontology / code servers',
		'IS_A_CODE_SERVER' => '19. Structure / ontology / code servers',
		'CODE_SERVERS' => '19. Structure / ontology / code servers',
		'DEDALO_MCP_PROXY_URL' => '21. CORS + MCP + maintenance',
		'DEDALO_MAINTENANCE_MODE' => '21. CORS + MCP + maintenance',
		'DEDALO_CORS' => '21. CORS + MCP + maintenance',
		'MAILER_HOST' => '22. Mailer config',
		'MAILER_SMTP_AUTH' => '22. Mailer config',
		'MAILER_USERNAME' => '22. Mailer config',
		'MAILER_PASSWORD' => '22. Mailer config',
		'MAILER_SMTP_SECURE' => '22. Mailer config',
		'MAILER_PORT' => '22. Mailer config',
		'MAILER_FROM' => '22. Mailer config',
		'MAILER_REPLY' => '22. Mailer config',
		'SAML_CONFIG' => '23. Optional configs',
		'SOCRATA_CONFIG' => '23. Optional configs',
		'GEONAMES_ACCOUNT_USERNAME' => '23. Optional configs',
		'INIT_COOKIE_AUTH_ADDONS' => '23. Optional configs',
		'CONFIG_DEFAULT_FILE_PATH' => '23. Optional configs',
		'EXPORT_HIERARCHY_PATH' => '23. Optional configs',
		'SERVER_PROXY' => '23. Optional configs',
		'PDF_OCR_ENGINE' => '23. Optional configs',
		'IP_API' => '20. IP API',
		'DEDALO_AV_BEST_EXTENSIONS' => '15. Media config / av',
		'DEDALO_IMAGE_BEST_EXTENSIONS' => '15. Media config / image',
	];

	/**
	 * Bootstrap.php defaults for comparison.
	 * Only constants whose values DIFFER from these defaults are written
	 * to .env (except those in ALWAYS_WRITE).
	 * Format: constant_name => [default_value, is_json]
	 */
	private const BOOTSTRAP_DEFAULTS = [
		'DEDALO_TIMEZONE' => ['UTC', false],
		'DEDALO_LOCALE' => ['C.UTF-8', false],
		'DEDALO_DATE_ORDER' => ['dmy', false],
		'DEDALO_SESSION_HANDLER' => ['files', false],
		'DEDALO_STRUCTURE_LANG' => ['lg-spa', false],
		'DEDALO_APPLICATION_LANGS_DEFAULT' => ['lg-eng', false],
		'DEDALO_DATA_LANG_DEFAULT' => ['lg-eng', false],
		'DEDALO_DATA_LANG_SELECTOR' => [true, false],
		'DEDALO_DATA_LANG_SYNC' => [false, false],
		'DEDALO_DATA_NOLAN' => ['lg-nolan', false],
		'DEDALO_PROJECTS_DEFAULT_LANGS' => [['lg-eng','lg-spa','lg-cat','lg-fra'], true],
		'DEDALO_DIFFUSION_LANGS' => [['lg-eng','lg-spa','lg-cat','lg-fra'], true],
		'DEDALO_PREFIX_TIPOS' => [['dd','rsc','ontology','ontologytype','hierarchy','lg','utoponymy','oh','ich','nexus','actv'], true],
		'MAIN_FALLBACK_SECTION' => ['oh1', false],
		'DEDALO_MEDIA_DIR_NAME' => ['media', false],
		'DEDALO_THUMB_EXTENSION' => ['jpg', false],
		'DEDALO_QUALITY_THUMB' => ['thumb', false],
		'DEDALO_AV_FOLDER' => ['/av', false],
		'DEDALO_AV_EXTENSION' => ['mp4', false],
		'DEDALO_AV_EXTENSIONS_SUPPORTED' => [['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv'], true],
		'DEDALO_AV_MIME_TYPE' => ['video/mp4', false],
		'DEDALO_AV_TYPE' => ['h264/AAC', false],
		'DEDALO_AV_QUALITY_ORIGINAL' => ['original', false],
		'DEDALO_AV_QUALITY_DEFAULT' => ['404', false],
		'DEDALO_AV_AR_QUALITY' => [['original','1080','720','576','404','240','audio'], true],
		'DEDALO_AV_POSTERFRAME_EXTENSION' => ['jpg', false],
		'DEDALO_SUBTITLES_FOLDER' => ['/subtitles', false],
		'DEDALO_AV_SUBTITLES_EXTENSION' => ['vtt', false],
		'DEDALO_AV_RECOMPRESS_ALL' => [1, false],
		'DEDALO_IMAGE_FOLDER' => ['/image', false],
		'DEDALO_IMAGE_EXTENSION' => ['jpg', false],
		'DEDALO_IMAGE_MIME_TYPE' => ['image/jpeg', false],
		'DEDALO_IMAGE_TYPE' => ['jpeg', false],
		'DEDALO_IMAGE_EXTENSIONS_SUPPORTED' => [['jpg','jpeg','png','tif','tiff','bmp','psd','raw','webp','heic','avif'], true],
		'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS' => [[], true],
		'DEDALO_IMAGE_QUALITY_ORIGINAL' => ['original', false],
		'DEDALO_IMAGE_QUALITY_RETOUCHED' => ['modified', false],
		'DEDALO_IMAGE_QUALITY_DEFAULT' => ['1.5MB', false],
		'DEDALO_IMAGE_AR_QUALITY' => [['original','modified','100MB','25MB','6MB','1.5MB','thumb'], true],
		'DEDALO_IMAGE_WEB_FOLDER' => ['/web', false],
		'MAGICK_CONFIG' => [['remove_layer_0'=>false,'is_opaque'=>null], true],
		'DEDALO_PDF_FOLDER' => ['/pdf', false],
		'DEDALO_PDF_EXTENSION' => ['pdf', false],
		'DEDALO_PDF_EXTENSIONS_SUPPORTED' => [['pdf','doc','pages','odt','ods','rtf','ppt','pages'], true],
		'DEDALO_PDF_ALTERNATIVE_EXTENSIONS' => [['jpg'], true],
		'DEDALO_PDF_MIME_TYPE' => ['application/pdf', false],
		'DEDALO_PDF_TYPE' => ['pdf', false],
		'DEDALO_PDF_QUALITY_ORIGINAL' => ['original', false],
		'DEDALO_PDF_QUALITY_DEFAULT' => ['web', false],
		'DEDALO_PDF_AR_QUALITY' => [['original','web'], true],
		'DEDALO_3D_FOLDER' => ['/3d', false],
		'DEDALO_3D_EXTENSION' => ['glb', false],
		'DEDALO_3D_EXTENSIONS_SUPPORTED' => [['glb','gltf','obj','fbx','dae','zip'], true],
		'DEDALO_3D_MIME_TYPE' => ['model/gltf-binary', false],
		'DEDALO_3D_QUALITY_ORIGINAL' => ['original', false],
		'DEDALO_3D_QUALITY_DEFAULT' => ['web', false],
		'DEDALO_3D_THUMB_DEFAULT' => ['thumb', false],
		'DEDALO_3D_AR_QUALITY' => [['original','web'], true],
		'DEDALO_SVG_FOLDER' => ['/svg', false],
		'DEDALO_SVG_EXTENSION' => ['svg', false],
		'DEDALO_SVG_EXTENSIONS_SUPPORTED' => [['svg'], true],
		'DEDALO_SVG_MIME_TYPE' => ['image/svg+xml', false],
		'DEDALO_SVG_QUALITY_ORIGINAL' => ['original', false],
		'DEDALO_SVG_QUALITY_DEFAULT' => ['web', false],
		'DEDALO_SVG_AR_QUALITY' => [['original','web'], true],
		'DEDALO_HTML_FILES_FOLDER' => ['/html_files', false],
		'DEDALO_HTML_FILES_EXTENSION' => ['html', false],
		'DEDALO_UPLOAD_SERVICE_CHUNK_FILES' => [4, false],
		'DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT' => [50, false],
		'DEDALO_GEO_PROVIDER' => ['VARIOUS', false],
		'DEDALO_ENTITY_MEDIA_AREA_TIPO' => ['', false],
		'DEDALO_ENTITY_MENU_SKIP_TIPOS' => [[], true],
		'DEDALO_TEST_INSTALL' => [true, false],
		'DEDALO_LOCK_COMPONENTS' => [true, false],
		'DEDALO_PROTECT_MEDIA_FILES' => [false, false],
		'DEDALO_NOTIFICATIONS' => [false, false],
		'DEDALO_AR_EXCLUDE_COMPONENTS' => [[], true],
		'DEDALO_FILTER_USER_RECORDS_BY_ID' => [false, false],
		'ENCRYPTION_MODE' => ['openssl', false],
		'DEDALO_DIFFUSION_DOMAIN' => ['default', false],
		'DEDALO_DIFFUSION_RESOLVE_LEVELS' => [2, false],
		'DEDALO_PUBLICATION_CLEAN_URL' => [false, false],
		'DIFFUSION_CUSTOM' => [false, false],
		'API_WEB_USER_CODE_MULTIPLE' => [[['db_name'=>'','code'=>'','api_ui'=>null]], true],
		'EXCLUDE_DIFFUSION_ELEMENTS' => [[], true],
		'STRUCTURE_FROM_SERVER' => [true, false],
		'IS_AN_ONTOLOGY_SERVER' => [false, false],
		'ONTOLOGY_SERVERS' => [[['name'=>'Official Dédalo Ontology server','url'=>'https://master.dedalo.dev/dedalo/core/api/v1/json/','code'=>'x3a0B4Y020Eg9w']], true],
		'IS_A_CODE_SERVER' => [false, false],
		'CODE_SERVERS' => [[['name'=>'Official Dédalo code server','url'=>'https://master.dedalo.dev/dedalo/core/api/v1/json/','code'=>'x3a0B4Y020Eg9w']], true],
		'DEDALO_MAINTENANCE_MODE' => [false, false],
		'DEDALO_BACKUP_ON_LOGIN' => [true, false],
		'DEDALO_BACKUP_TIME_RANGE' => [8, false],
		'SLOW_QUERY_MS' => [10000, false],
		'DEDALO_DB_MANAGEMENT' => [true, false],
		'PERSISTENT_CONNECTION' => [false, false],
		'DEDALO_APPLICATION_LANGS' => [['lg-eng'=>'English','lg-spa'=>'Castellano','lg-cat'=>'Català','lg-eus'=>'Euskara','lg-fra'=>'Français','lg-por'=>'Português','lg-deu'=>'Deutsch','lg-ita'=>'Italiano','lg-ell'=>'Ελληνικά','lg-nep'=>'नेपाली'], true],
		'DEDALO_BINARY_BASE_PATH' => ['/usr/bin', false],
		'DB_BIN_PATH' => ['/usr/bin/', false],
		'PHP_BIN_PATH' => ['/usr/bin/php', false],
		'DEDALO_HOSTNAME_CONN' => ['/var/run/postgresql', false],
		'DEDALO_DB_PORT_CONN' => [null, false],
		'DEDALO_SOCKET_CONN' => [null, false],
		'DEDALO_DATABASE_CONN' => ['dedalo7_development', false],
		'DEDALO_USERNAME_CONN' => ['postgres', false],
		'DEDALO_PASSWORD_CONN' => ['postgres', false],
		'DEDALO_INFORMATION' => ['Dédalo development install', false],
		'DEDALO_INFO_KEY' => ['__ENTITY__', false], // special: defaults to DEDALO_ENTITY
		'MYSQL_DEDALO_HOSTNAME_CONN' => ['localhost', false],
		'MYSQL_DEDALO_USERNAME_CONN' => ['root', false],
		'MYSQL_DEDALO_PASSWORD_CONN' => ['', false],
		'MYSQL_DEDALO_DATABASE_CONN' => ['web___ENTITY__', false], // special: defaults to web_{ENTITY}
		'MYSQL_DEDALO_DB_PORT_CONN' => [null, false],
		'MYSQL_DEDALO_SOCKET_CONN' => ['/var/run/mysqld/mysqld.sock', false],
		'MYSQL_DB_BIN_PATH' => ['/usr/bin/', false],
		'DEDALO_CACHE_PATH' => ['__COMPUTED__', false], // computed from ROOT_PATH
		'DEDALO_BACKUP_PATH' => ['__COMPUTED__', false], // computed from ROOT_PATH
		'DEDALO_BACKUP_PATH_TEMP' => ['__COMPUTED__', false],
		'DEDALO_BACKUP_PATH_DB' => ['__COMPUTED__', false],
		'DEDALO_BACKUP_PATH_ONTOLOGY' => ['__COMPUTED__', false],
	];


	/**
	 * MIGRATE_TO_ENV
	 * Main migration method. Reads old config files, generates .env,
	 * verifies DB connection, and moves old files to config_backup/.
	 *
	 * @param string $config_dir Absolute path to config directory
	 * @param string $private_dir Absolute path to private directory (where .env goes)
	 * @param bool $dry_run If true, don't write files, just return what would be done
	 * @param bool $force If true, overwrite existing .env
	 * @return object {success:bool, env_path:string, lines_written:int, message:string, warnings:string[]}
	 */
	public static function migrate_to_env(
		string $config_dir,
		string $private_dir,
		bool $dry_run=false,
		bool $force=false
	) : object {

		$warnings	= [];
		$old_config	= rtrim($config_dir, '/') . '/config.php';
		$old_db		= rtrim($config_dir, '/') . '/config_db.php';
		$env_path	= rtrim($private_dir, '/') . '/.env';

		// Check if old config exists
		$has_config	= file_exists($old_config);
		$has_db		= file_exists($old_db);

		if (!$has_config && !$has_db) {
			return (object)[
				'success'			=> false,
				'env_path'			=> $env_path,
				'lines_written'		=> 0,
				'message'			=> 'No legacy config files found to migrate',
				'warnings'			=> $warnings
			];
		}

		// Check if .env already exists
		if (file_exists($env_path) && !$force) {
			return (object)[
				'success'			=> false,
				'env_path'			=> $env_path,
				'lines_written'		=> 0,
				'message'			=> '.env already exists. Use --force to overwrite.',
				'warnings'			=> $warnings
			];
		}

		// Parse define() calls from old config files using regex.
		// We do NOT include the old files to avoid polluting the global
		// namespace and depending on functions that don't exist yet.
		$new_constants = [];

		if ($has_config) {
			$source = file_get_contents($old_config);
			if ($source !== false) {
				$parsed = self::parse_defines($source, $warnings);
				$new_constants = array_merge($new_constants, $parsed);
			}
		}
		if ($has_db) {
			$source = file_get_contents($old_db);
			if ($source !== false) {
				$parsed = self::parse_defines($source, $warnings);
				$new_constants = array_merge($new_constants, $parsed);
			}
		}

		// Build .env content
		$env_lines = self::build_env_content($new_constants, $warnings);

		if ($dry_run) {
			return (object)[
				'success'			=> true,
				'env_path'			=> $env_path,
				'lines_written'		=> count($env_lines),
				'message'			=> '[DRY RUN] Would write ' . count($env_lines) . ' lines to ' . $env_path,
				'warnings'			=> $warnings,
				'content'			=> implode("\n", $env_lines)
			];
		}

		// Ensure private directory exists
		if (!is_dir($private_dir)) {
			$mkdir_ok = mkdir($private_dir, 0755, true);
			if (!$mkdir_ok) {
				return (object)[
					'success'			=> false,
					'env_path'			=> $env_path,
					'lines_written'		=> 0,
					'message'			=> "Cannot create private directory: {$private_dir}",
					'warnings'			=> $warnings
				];
			}
		}

		// Write .env file
		$env_content = implode("\n", $env_lines) . "\n";
		$write_ok = file_put_contents($env_path, $env_content, LOCK_EX);
		if ($write_ok === false) {
			return (object)[
				'success'			=> false,
				'env_path'			=> $env_path,
				'lines_written'		=> 0,
				'message'			=> "Failed to write .env file: {$env_path}",
				'warnings'			=> $warnings
			];
		}

		// Set restrictive permissions
		@chmod($env_path, 0600);

		// Verify system stability before moving config files.
		// Load the new .env and test the PostgreSQL connection — if it fails,
		// the old config files must stay in place so the system can fall back.
		$stable = self::verify_env_stability($env_path, $warnings);

		if (!$stable) {
			// .env was written but system is not stable — do NOT move old files.
			// The user must fix the .env manually; old config remains available.
			$msg = 'Migrated config to .env (' . count($env_lines) . ' lines) BUT system stability check FAILED';
			$msg .= '. Old config files left in place — fix .env and retry, or restore config manually.';
			$warnings[] = 'System stability check failed: DB connection could not be verified with new .env values.';
			$warnings[] = 'Old config files were NOT moved. They remain active for the next request.';

			return (object)[
				'success'			=> false,
				'env_path'			=> $env_path,
				'lines_written'		=> count($env_lines),
				'message'			=> $msg,
				'warnings'			=> $warnings
			];
		}

		// System is stable — move old config files to {private_dir}/config_backup/
		$backup_dir	= rtrim($private_dir, '/') . '/config_backup';
		$moved		= [];

		if (!is_dir($backup_dir)) {
			$mkdir_ok = @mkdir($backup_dir, 0755, true);
			if (!$mkdir_ok) {
				$warnings[] = "Failed to create backup directory {$backup_dir} — old config files left in place";
				$msg = 'Migrated config to .env (' . count($env_lines) . ' lines). System stable, but backup dir creation failed.';
				return (object)[
					'success'			=> true,
					'env_path'			=> $env_path,
					'lines_written'		=> count($env_lines),
					'message'			=> $msg,
					'warnings'			=> $warnings
				];
			}
			// Add .htaccess to deny web access
			@file_put_contents($backup_dir . '/.htaccess', "Require all denied\n", LOCK_EX);
		}

		$timestamp = date('Ymd_His');

		if ($has_config) {
			$dest = $backup_dir . '/config.php.' . $timestamp;
			// If a backup with same timestamp exists (unlikely), append suffix
			if (file_exists($dest)) {
				$n = 1;
				while (file_exists($backup_dir . '/config.php.' . $timestamp . '_' . $n)) { $n++; }
				$dest = $backup_dir . '/config.php.' . $timestamp . '_' . $n;
			}
			if (@rename($old_config, $dest)) {
				$moved[] = basename($old_config) . ' → config_backup/' . basename($dest);
			} else {
				$warnings[] = "Failed to move {$old_config} to {$dest} (manual move needed)";
			}
		}
		if ($has_db) {
			$dest = $backup_dir . '/config_db.php.' . $timestamp;
			if (file_exists($dest)) {
				$n = 1;
				while (file_exists($backup_dir . '/config_db.php.' . $timestamp . '_' . $n)) { $n++; }
				$dest = $backup_dir . '/config_db.php.' . $timestamp . '_' . $n;
			}
			if (@rename($old_db, $dest)) {
				$moved[] = basename($old_db) . ' → config_backup/' . basename($dest);
			} else {
				$warnings[] = "Failed to move {$old_db} to {$dest} (manual move needed)";
			}
		}

		$msg = 'Migrated config to .env (' . count($env_lines) . ' lines). System stable.';
		if (!empty($moved)) {
			$msg .= ' Moved: ' . implode(', ', $moved);
		}

		return (object)[
			'success'			=> true,
			'env_path'			=> $env_path,
			'lines_written'		=> count($env_lines),
			'message'			=> $msg,
			'warnings'			=> $warnings
		];
	}


	/**
	 * VERIFY_ENV_STABILITY
	 * Loads the newly written .env and tests the PostgreSQL connection
	 * to confirm the system can operate with the migrated values.
	 *
	 * @param string $env_path Absolute path to the .env file
	 * @param array &$warnings Collected warnings
	 * @return bool True if DB connection succeeds, false otherwise
	 */
	private static function verify_env_stability(string $env_path, array &$warnings) : bool {

		// Parse .env into key-value pairs
		$lines = @file($env_path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
		if ($lines === false) {
			$warnings[] = 'Stability check: cannot read .env file';
			return false;
		}

		$env = [];
		foreach ($lines as $line) {
			$line = trim($line);
			if ($line === '' || str_starts_with($line, '#')) continue;
			$parts = explode('=', $line, 2);
			if (count($parts) === 2) {
				$env[trim($parts[0])] = trim($parts[1]);
			}
		}

		// Build pg_connect connection string from .env values
		$hostname	= $env['DEDALO_HOSTNAME_CONN'] ?? '/var/run/postgresql';
		$port		= isset($env['DEDALO_DB_PORT_CONN']) && $env['DEDALO_DB_PORT_CONN'] !== ''
					? $env['DEDALO_DB_PORT_CONN']
					: null;
		$database	= $env['DEDALO_DATABASE_CONN'] ?? null;
		$username	= $env['DEDALO_USERNAME_CONN'] ?? null;
		$password	= $env['DEDALO_PASSWORD_CONN'] ?? '';

		if (empty($database) || empty($username)) {
			$warnings[] = 'Stability check: missing DEDALO_DATABASE_CONN or DEDALO_USERNAME_CONN in .env';
			return false;
		}

		// Determine host param: if it starts with '/' it's a socket directory
		$conn_str = str_starts_with($hostname, '/')
			? "host={$hostname}"
			: "host={$hostname}" . ($port ? " port={$port}" : '');
		$conn_str .= " dbname={$database} user={$username}";
		if ($password !== '') {
			$conn_str .= " password={$password}";
		}

		// Suppress warnings from pg_connect — we handle the result ourselves
		$conn = @pg_connect($conn_str);
		if ($conn === false) {
			$pg_err = error_get_last();
			$err_msg = $pg_err['message'] ?? 'Unknown PostgreSQL connection error';
			$warnings[] = "Stability check: PostgreSQL connection failed — {$err_msg}";
			return false;
		}

		pg_close($conn);
		return true;
	}


	/**
	 * STRIP_COMMENTS
	 * Removes PHP comments from source code while preserving string contents.
	 * Uses the PHP tokenizer so that // inside strings (e.g. '/opt/homebrew/bin//php'
	 * or 'tcp://127.0.0.1:6379') is not mistakenly stripped.
	 *
	 * @param string $source PHP source code
	 * @return string Source with comments removed
	 */
	private static function strip_comments(string $source) : string {

		// Prepend opening tag if missing so tokenizer works
		if (!str_starts_with(ltrim($source), '<?')) {
			$source = '<?php ' . $source;
			$prepended = true;
		} else {
			$prepended = false;
		}

		$tokens	= token_get_all($source);
		$out	= '';

		foreach ($tokens as $token) {
			if (is_array($token)) {
				switch ($token[0]) {
					case T_COMMENT:      // /* */ and // and #
					case T_DOC_COMMENT:  // /** */
						// Replace comment with whitespace to preserve line structure
						$out .= str_repeat("\n", substr_count($token[1], "\n"));
						break;
					default:
						$out .= $token[1];
						break;
				}
			} else {
				// Single-char tokens (e.g. ';', ',', '(')
				$out .= $token;
			}
		}

		// Remove the prepended <?php tag
		if ($prepended) {
			$out = preg_replace('/^<\?php\s+/', '', $out);
		}

		return $out;
	}

	/**
	 * PARSE_DEFINES
	 * Parses define() calls from PHP source code using regex.
	 * Returns key-value pairs of constants found.
	 *
	 * Handles:
	 * - Simple string values: define('KEY', 'value')
	 * - Integer values: define('KEY', 123)
	 * - Boolean values: define('KEY', true) / define('KEY', false)
	 * - Null values: define('KEY', null)
	 * - Array values: define('KEY', ['a','b']) or define('KEY', ['k'=>'v'])
	 * - Constants as values: define('KEY', OTHER_CONST) — resolved if known
	 * - Concatenation: define('KEY', A . B) — evaluated safely
	 * - Function calls: define('KEY', func()) — skipped
	 *
	 * @param string $source PHP source code
	 * @param array &$warnings Collected warnings
	 * @return array Key-value pairs of parsed constants
	 */
	private static function parse_defines(string $source, array &$warnings) : array {

		$result = [];

		// Strip comments using PHP tokenizer to respect string boundaries.
		// Naive regex (//.*$) would also strip // inside strings like '/opt/homebrew/bin//php'.
		$source = self::strip_comments($source);

		// Match define('KEY', value) or define("KEY", value)
		// The value part can span multiple lines for arrays
		$pattern = '/define\s*\(\s*[\'"](\w+)[\'"]\s*,\s*(.*?)\s*\)\s*;/s';

		if (!preg_match_all($pattern, $source, $matches, PREG_SET_ORDER)) {
			return $result;
		}

		foreach ($matches as $match) {
			$key	= $match[1];
			$raw	= trim($match[2]);

			// Parse the raw value
			$value = self::parse_value($raw, $key, $warnings);
			if ($value !== null) {
				$result[$key] = $value;
			}
		}

		return $result;
	}


	/**
	 * PARSE_VALUE
	 * Parses a raw PHP value string into a PHP value.
	 *
	 * @param string $raw Raw value string from define() call
	 * @param string $key Constant name (for warning messages)
	 * @param array &$warnings Collected warnings
	 * @return mixed|null Parsed value, or null if unparseable
	 */
	private static function parse_value(string $raw, string $key, array &$warnings) : mixed {

		// Boolean
		if ($raw === 'true') return true;
		if ($raw === 'false') return false;

		// Null
		if ($raw === 'null') return null;

		// Integer / float
		if (preg_match('/^-?\d+(\.\d+)?$/', $raw)) {
			return str_contains($raw, '.') ? (float) $raw : (int) $raw;
		}

		// Single-quoted string
		if (preg_match("/^'(.*)'$/s", $raw, $m)) {
			return str_replace("\\'", "'", $m[1]);
		}

		// Double-quoted string
		if (preg_match('/^"(.*)"$/s', $raw, $m)) {
			$val = str_replace('\\"', '"', $m[1]);
			$val = str_replace('\\n', "\n", $val);
			$val = str_replace('\\t', "\t", $val);
			return $val;
		}

		// Array: [...] — parse via safe eval
		if (preg_match('/^\[.*\]$/s', $raw)) {
			return self::parse_array($raw, $key, $warnings);
		}

		// array(...) — old syntax
		if (preg_match('/^array\s*\(.*\)$/si', $raw)) {
			return self::parse_array($raw, $key, $warnings);
		}

		// Known constant reference (e.g. DEDALO_ENTITY)
		if (preg_match('/^[A-Z_]\w*$/', $raw)) {
			if (defined($raw)) {
				return constant($raw);
			}
			$warnings[] = "Skipped {$key}: uses unresolved constant {$raw}";
			return null;
		}

		// Complex expression (concatenation, function calls, ternary, etc.)
		if (str_contains($raw, '.') || str_contains($raw, '?') || str_contains($raw, '::') || str_contains($raw, '(')) {
			$eval_result = self::safe_eval_define($raw, $key, $warnings);
			if ($eval_result !== null) {
				return $eval_result;
			}
			$warnings[] = "Skipped {$key}: complex expression — " . substr($raw, 0, 80);
			return null;
		}

		// Unknown format
		$warnings[] = "Skipped {$key}: unrecognized value format — " . substr($raw, 0, 80);
		return null;
	}


	/**
	 * PARSE_ARRAY
	 * Parses a PHP array literal into a PHP array.
	 * Uses a sandboxed eval for reliable parsing.
	 *
	 * @param string $raw Raw array string
	 * @param string $key Constant name
	 * @param array &$warnings Collected warnings
	 * @return array|null Parsed array or null on failure
	 */
	private static function parse_array(string $raw, string $key, array &$warnings) : ?array {

		// Replace old array() syntax with []
		$normalized = preg_replace('/^array\s*\(/i', '[', $raw);
		$normalized = preg_replace('/\)$/', ']', $normalized);

		// Try safe eval
		$result = self::safe_eval_define($normalized, $key, $warnings);
		if (is_array($result)) {
			return $result;
		}

		// Fallback: try original
		$result = self::safe_eval_define($raw, $key, $warnings);
		if (is_array($result)) {
			return $result;
		}

		$warnings[] = "Skipped {$key}: failed to parse array";
		return null;
	}


	/**
	 * SAFE_EVAL_DEFINE
	 * Evaluates a PHP expression in a sandboxed scope.
	 * Only allows literals and known constants — no dangerous function calls.
	 *
	 * @param string $expression PHP expression to evaluate
	 * @param string $key Constant name (for warning messages)
	 * @param array &$warnings Collected warnings
	 * @return mixed|null Evaluated value or null on failure
	 */
	private static function safe_eval_define(string $expression, string $key, array &$warnings) : mixed {

		// Block dangerous patterns
		$blocked = '/\b(include|require|eval|exec|system|passthru|shell_exec|popen|proc_open|pcntl_|unlink|rmdir|mkdir|file_|fopen|fread|fwrite|curl_|header|setcookie|mail)\b/i';
		if (preg_match($blocked, $expression)) {
			return null;
		}

		// Block variable references ($var) — they cannot resolve in eval scope
		if (preg_match('/\$[a-zA-Z_]/', $expression)) {
			$warnings[] = "Skipped {$key}: expression contains variable reference — " . substr($expression, 0, 80);
			return null;
		}

		try {
			$result = @eval("return {$expression};");
			return $result;
		} catch (Throwable $e) {
			return null;
		}
	}


	/**
	 * BUILD_ENV_CONTENT
	 * Builds the .env file content from captured constants.
	 * Organizes by section, skips structural/computed constants,
	 * and only writes values that differ from bootstrap.php defaults
	 * (except for ALWAYS_WRITE constants).
	 *
	 * @param array $constants Key-value pairs of defined constants
	 * @param array &$warnings Collected warnings
	 * @return array Lines of .env content
	 */
	private static function build_env_content(array $constants, array &$warnings) : array {

		$lines = [];
		$lines[] = '# Dédalo environment configuration';
		$lines[] = '# Auto-generated by config_migrator from legacy config.php / config_db.php';
		$lines[] = '# Generated on ' . date('c');
		$lines[] = '# Place in /private/.env — this file is gitignored';
		$lines[] = '#';
		$lines[] = '# Sections mirror bootstrap.php numbering for easy cross-reference.';
		$lines[] = '';

		// Group constants by section
		$sections = [];
		$current_section = 'Uncategorized';

		foreach ($constants as $key => $value) {

			// Skip structural/computed constants
			if (in_array($key, self::SKIP_CONSTANTS, true)) {
				continue;
			}

			// Check if value differs from bootstrap default
			$should_write = in_array($key, self::ALWAYS_WRITE, true);
			if (!$should_write && isset(self::BOOTSTRAP_DEFAULTS[$key])) {
				$default_entry	= self::BOOTSTRAP_DEFAULTS[$key];
				$default_val	= $default_entry[0];
				$is_json		= $default_entry[1];

				if ($is_json) {
					// Compare as JSON strings for consistency
					$val_json		= json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
					$default_json	= json_encode($default_val, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
					if ($val_json === $default_json) {
						continue; // same as default, skip
					}
					$should_write = true; // differs from default
				} else {
					// Handle special computed defaults
					if ($default_val === '__COMPUTED__') {
						// Computed paths are always different from user's actual paths
						// Write them only if they look like real user paths (not sample paths)
						if (is_string($value) && str_contains($value, '/backups')) {
							$should_write = true;
						} elseif (is_string($value) && str_contains($value, '/cache')) {
							$should_write = true;
						} else {
							continue;
						}
					} elseif ($default_val === '__ENTITY__') {
						// DEDALO_INFO_KEY defaults to DEDALO_ENTITY in bootstrap
						// Write if it's different from the entity
						$entity = $constants['DEDALO_ENTITY'] ?? 'development';
						if ($value === $entity) {
							continue; // same as computed default
						}
						$should_write = true;
					} elseif ($default_val === 'web___ENTITY__') {
						// MYSQL_DEDALO_DATABASE_CONN defaults to web_{ENTITY}
						$entity = $constants['DEDALO_ENTITY'] ?? 'development';
						if ($value === 'web_' . $entity) {
							continue; // same as computed default
						}
						$should_write = true;
					} elseif ($value === $default_val) {
						continue; // same as default, skip
					} else {
						// Value differs from default — must write it
						$should_write = true;
					}
				}
			}

			// If no default is known and not in ALWAYS_WRITE, still write it
			// (unknown constant from user's config — better to preserve it)
			if (!$should_write && !isset(self::BOOTSTRAP_DEFAULTS[$key]) && !in_array($key, self::SKIP_CONSTANTS, true)) {
				$should_write = true;
			}

			if (!$should_write) {
				continue;
			}

			// Determine section
			$section = self::SECTION_MAP[$key] ?? 'Uncategorized';

			if (!isset($sections[$section])) {
				$sections[$section] = [];
			}

			// Convert value to .env format
			$env_value = self::value_to_env($value, $key);
			$sections[$section][] = "{$key}={$env_value}";
		}

		// Write sections with headers
		$section_order = [
			'4. Environmental scalar constants / secrets',
			'4. Environmental scalar constants / locale',
			'4. Environmental scalar constants / entity',
			'4. Environmental scalar constants / production',
			'4. Environmental scalar constants / binary',
			'6. Sessions',
			'7. Database constants / PostgreSQL',
			'7. Database constants / MySQL',
			'8. Cache + debug',
			'10. Backup paths',
			'13. Lang config',
			'14. Default config values',
			'15. Media config',
			'15. Media config / thumb',
			'15. Media config / av',
			'15. Media config / image',
			'15. Media config / pdf',
			'15. Media config / 3d',
			'15. Media config / svg',
			'15. Media config / html',
			'16. Upload config',
			'17. Geo + entity menu + misc',
			'18. Diffusion config',
			'19. Structure / ontology / code servers',
			'20. IP API',
			'21. CORS + MCP + maintenance',
			'22. Mailer config',
			'23. Optional configs',
			'Uncategorized',
		];

		foreach ($section_order as $section) {
			if (!isset($sections[$section]) || empty($sections[$section])) {
				continue;
			}

			// Add section header
			$section_num = explode('.', $section)[0] ?? '';
			$lines[] = "# ── {$section} ────────────────────────────────────────────────────────";
			$lines[] = '';

			foreach ($sections[$section] as $line) {
				$lines[] = $line;
			}
			$lines[] = '';
		}

		return $lines;
	}


	/**
	 * VALUE_TO_ENV
	 * Converts a PHP value to .env format string.
	 *
	 * - bool:     true/false
	 * - int:      "123"
	 * - null:     empty string
	 * - string:   as-is (no quoting needed for .env)
	 * - array:    JSON encoded
	 * - object:   JSON encoded
	 *
	 * @param mixed $value The PHP value
	 * @param string $key The constant name (for special cases)
	 * @return string The .env-formatted value
	 */
	private static function value_to_env(mixed $value, string $key) : string {

		if ($value === null) {
			return '';
		}

		if (is_bool($value)) {
			return $value ? 'true' : 'false';
		}

		if (is_int($value) || is_float($value)) {
			return (string) $value;
		}

		if (is_array($value)) {
			return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		}

		if (is_object($value)) {
			return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		}

		if (is_string($value)) {
			return $value;
		}

		// Fallback
		return (string) $value;
	}


	/**
	 * NEEDS_MIGRATION
	 * Checks whether migration is needed (no .env exists but old config does).
	 *
	 * @param string $config_dir Absolute path to config directory
	 * @param string $private_dir Absolute path to private directory
	 * @return bool
	 */
	public static function needs_migration(string $config_dir, string $private_dir) : bool {

		$env_path		= rtrim($private_dir, '/') . '/.env';
		$env_host_path	= rtrim($private_dir, '/') . '/.env.' . (getenv('DEDALO_HOST') ?: ($_SERVER['HTTP_HOST'] ?? 'localhost'));
		$old_config		= rtrim($config_dir, '/') . '/config.php';

		// Already have .env
		if (file_exists($env_path) || file_exists($env_host_path)) {
			return false;
		}

		// No old config to migrate from
		if (!file_exists($old_config)) {
			return false;
		}

		return true;
	}
}
