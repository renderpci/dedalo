<?php
################################################################
################### DEDALO VERSION 6 ###########################
################################################################
/*
	UNDER GNU PUBLIC LICENSE
	http://www.gnu.org/licenses/licenses.es.html
	Versión 4, 14 de marzo de 2012 / 21 Abril 2015

	Juan Francisco Onielfa Veneros
	Alejandro Peña Carbonell
	https://dedalo.dev

	Reviewed: 17-05-2022
*/



// duplicity check
	if (defined('DEDALO_ROOT_PATH')) {
		throw new Exception("Error Processing Request: config file is already included!", 1);
	}



// dedalo paths
	// xx_PATH is absolute system path like '/user/httpdocs/dedalo/core'
	// xx_WEB is relative url path (to current dedalo url dir, often 'dedalo') like '/dedalo/core'

	// host
		define('DEDALO_HOST',		$_SERVER['HTTP_HOST']);
		define('DEDALO_PROTOCOL',	(isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on') ? 'https://' : 'http://');

	// root paths
		define('DEDALO_ROOT_PATH',	dirname(dirname(__FILE__)));
		define('DEDALO_ROOT_WEB',	'/' . explode('/', $_SERVER["REQUEST_URI"])[1]);

	// base paths
		define('DEDALO_CONFIG',	'config');
		define('DEDALO_CORE',	'core');
		define('DEDALO_SHARED',	'shared');
		define('DEDALO_TOOLS',	'tools');
		define('DEDALO_LIB',	'lib');

	// config
		define('DEDALO_CONFIG_PATH',	DEDALO_ROOT_PATH .'/'. DEDALO_CONFIG );

	// core
		define('DEDALO_CORE_PATH',		DEDALO_ROOT_PATH .'/'. DEDALO_CORE);
		define('DEDALO_CORE_URL',		DEDALO_ROOT_WEB .'/'. DEDALO_CORE );

	// shared
		define('DEDALO_SHARED_PATH',	DEDALO_ROOT_PATH .'/'. DEDALO_SHARED);
		define('DEDALO_SHARED_URL',		DEDALO_ROOT_WEB  .'/'. DEDALO_SHARED );

	// tools
		define('DEDALO_TOOLS_PATH',		DEDALO_ROOT_PATH .'/'. DEDALO_TOOLS);
		define('DEDALO_TOOLS_URL',		DEDALO_ROOT_WEB .'/'. DEDALO_TOOLS );

	// lib
		define('DEDALO_LIB_PATH',		DEDALO_ROOT_PATH .'/'. DEDALO_LIB);
		define('DEDALO_LIB_URL',		DEDALO_ROOT_WEB .'/'. DEDALO_LIB );

	// widgets
		define('DEDALO_WIDGETS_PATH',	DEDALO_CORE_PATH . '/widgets');
		define('DEDALO_WIDGETS_URL',	DEDALO_CORE_URL . '/widgets');

	// extras
		define('DEDALO_EXTRAS_PATH',	DEDALO_CORE_PATH . '/extras');
		define('DEDALO_EXTRAS_URL',		DEDALO_CORE_URL . '/extras');



// Dedalo information
	// string to use in Dédalo cryptography
	define('DEDALO_SALT_STRING', 'dedalo_six');



// time zone (for backups archive names)
	define('DEDALO_TIMEZONE', 'Europe/Madrid');
	date_default_timezone_set(DEDALO_TIMEZONE);



// locale options
	// set locale ('en_ES' Spanish for example) es_ES | en_EN | ...
	// For Mac, use format as 'es_ES'. For Linux as 'es_ES.utf8'
	define('DEDALO_LOCALE', 'es-ES');
	setlocale(LC_ALL, DEDALO_LOCALE);
	// date order, used to input and output dates in different order
	// options:
	// dmy = common way order day/moth/year
	// mdy = USA way order moth/day/year
	// ymd = China, Japan, Korean, Iran way year/month/day
	define('DEDALO_DATE_ORDER', 'dmy');



// dedalo entity
	// dedalo_entity string. Do not use here spaces or non ASCII chars
	define('DEDALO_ENTITY', 'my_entity_name'); # Like 'dedalo4'
	// dedalo_entity_label . (Showed title of html pages)
	define('DEDALO_ENTITY_LABEL', DEDALO_ENTITY);
	// dedalo_entity_id . (From Dédalo private list. You need to be register before but it's not mandatory fill this)
	define('DEDALO_ENTITY_ID', 0);
	// development_server. Default is false
	define('DEVELOPMENT_SERVER', false);



// cache
	// dedalo_cache_manager. string|bool : redis | memcached | zebra_db | false . Default is false
	define('DEDALO_CACHE_MANAGER', false);



// required files
	// core_functions. Basic common functions (before session start)
	include(DEDALO_CORE_PATH . '/base/core_functions.php');
	// config_core. core definitions and status.
	include(DEDALO_CONFIG_PATH . '/config_core.php');
	// dd_tipos. List of main Dédalo resolved tipos
	include(DEDALO_CONFIG_PATH . '/dd_tipos.php');
	// version. Info about current version and build
	include(DEDALO_CONFIG_PATH . '/version.inc');
	// config_db. Dédalo PostgreSQL and MariaDB config file
	include(DEDALO_CONFIG_PATH . '/config_db.php');



// session
	if (session_status()!==PHP_SESSION_ACTIVE) {

		# HANDLER
		$SESSION_HANDLER = 'files';	// files | memcached | user | postgresql
		define('DEDALO_SESSION_HANDLER', $SESSION_HANDLER);

		# LIFETIME
		# Set max duration of dedalo user session
		# Use ini directive to set session.gc_maxlifetime (Garbage Collection lifetime)
		# Use session_cache_expire to set duration of session
		# Set duration max of session data in hours (default 8 hours)
		# Set before session start
		$session_duration_hours	= $session_duration_hours ?? 8;
		$timeout_seconds		= intval($session_duration_hours*3600); // in seconds

		// session start
		$cookie_secure		= (DEDALO_PROTOCOL==='https://');
		$cookie_samesite	= (DEVELOPMENT_SERVER===true) ? 'Lax' : 'Strict';
		session_start_manager([
			'save_handler'				=> 'files',
			'timeout_seconds'			=> $timeout_seconds,
			// 'save_path'				=> '/tmp', string optional
			// 'aditional_save_path'	=> false, bool optional
			'prevent_session_lock'		=> defined('PREVENT_SESSION_LOCK') ? PREVENT_SESSION_LOCK : false,
			'session_name'				=> 'dedalo_'.DEDALO_ENTITY,
			// cookie params
			'cookie_secure'				=> $cookie_secure, // Only https (true | false)
			'cookie_samesite'			=> $cookie_samesite // (None | Lax | Strict)
		]);
	}//end if (session_status()!==PHP_SESSION_ACTIVE)



// show_debug
	// Application debug config. When user is DEDALO_SUPERUSER is active by default, else is not
	define('SHOW_DEBUG',
		(isset($_SESSION['dedalo']['auth']['user_id']) && $_SESSION['dedalo']['auth']['user_id']==DEDALO_SUPERUSER)
			? true
			: false
	);



// is_developer
	// Logged user is developer value. Depends of user config 'is_developer' value from database
	define('SHOW_DEVELOPER',
		(isset($_SESSION['dedalo']['auth']['is_developer']) && $_SESSION['dedalo']['auth']['is_developer']===true)
			? true
			: false // false
	);



// loader
	// auto load basic and called classes
	include DEDALO_CORE_PATH . '/base/class.loader.php';



// backup : Automatic backups control
	# DEDALO_BACKUP_ON_LOGIN : true / false
	define('DEDALO_BACKUP_ON_LOGIN'	 , true);
	# DEDALO_BACKUP_TIME_RANGE Minimum lapse of time (in hours) for run backup script again. Default: (int) 4
	define('DEDALO_BACKUP_TIME_RANGE', 4);
	// backups paths. Try to keep backups directory out of httpdocs scope for security
	define('DEDALO_BACKUP_PATH' 	 		, dirname(DEDALO_ROOT_PATH) . '/backups');
	define('DEDALO_BACKUP_PATH_TEMP' 	 	, DEDALO_BACKUP_PATH . '/temp');
	define('DEDALO_BACKUP_PATH_DB' 	 		, DEDALO_BACKUP_PATH . '/db');
	define('DEDALO_BACKUP_PATH_STRUCTURE' 	, DEDALO_BACKUP_PATH . '/structure');
	define('DEDALO_BACKUP_PATH_USERS' 		, DEDALO_BACKUP_PATH . '/users');
	// structure_download. When ontology is updated, download files are saved here
	define('STRUCTURE_DOWNLOAD_JSON_FILE', DEDALO_BACKUP_PATH_STRUCTURE);



// log and errors : Store application data info and errors
	// logger_level. default: ERROR
		// level error codes
		// DEBUG	= 100;
		// INFO		= 75;
		// NOTICE	= 50;
		// WARNING	= 25;
		// ERROR	= 10;
		// CRITICAL	= 5;
		define('LOGGER_LEVEL', logger::DEBUG);
	// Log messages in page
		$log_messages = array();
		global $log_messages;
	// activity log db
		// Log application info in db
		logger::register('activity'	, 'activity://auto:auto@auto:3306/log_data?table=matrix_activity');
		// Store object in logger static array var
		logger::$obj['activity'] = logger::get_instance('activity');
	// error log file
		// Log application errors in file
		// Logs dir (Maintain this directory inaccessible for security)
		define('DEDALO_LOGS_DIR'  , dirname(DEDALO_ROOT_PATH) . '/temp/logs');	# !! In production mode log MUST BE out of site
		// define('DEDALO_LOGS_DIR'  , DEDALO_LIB_PATH . '/logs');
		// Set file. In production mode log MUST BE out of site
		logger::register('error', 'file://'.DEDALO_LOGS_DIR.'/dedalo_errors.log');
		// Store object in logger static array var
		logger::$obj['error'] = logger::get_instance('error');



// lang
	# DEDALO STRUCTURE LANG (default 'lg-spa')
	define('DEDALO_STRUCTURE_LANG', 'lg-spa');

	# APPLICATION LANG : Dedalo application lang
	define('DEDALO_APPLICATION_LANGS', [
		'lg-eng'	=> 'English',
		'lg-spa'	=> 'Castellano',
		'lg-cat'	=> 'Català',
		'lg-eus'	=> 'Euskara',
		'lg-fra'	=> 'French'
	]);
	// dedalo_application_langs_default
	define('DEDALO_APPLICATION_LANGS_DEFAULT', 'lg-eng');
	// dedalo_application_lang. Current Dédalo application lang (cascade calculate from get, post, session vars, default)
	define('DEDALO_APPLICATION_LANG',			fix_cascade_config4_var('dedalo_application_lang',DEDALO_APPLICATION_LANGS_DEFAULT));
	// dedalo_data_lang
	define('DEDALO_DATA_LANG_DEFAULT',			'lg-eng');
	define('DEDALO_DATA_LANG',					fix_cascade_config4_var('dedalo_data_lang',DEDALO_DATA_LANG_DEFAULT));
	// dedalo_data_lang_selector. Show/hide menu data lang selector. bool default true
	define('DEDALO_DATA_LANG_SELECTOR',			true);
	// dedalo_data_nolan. string default 'lg-nolan'. Do not change this
	define('DEDALO_DATA_NOLAN',					'lg-nolan');
	// Projects langs
	define('DEDALO_PROJECTS_DEFAULT_LANGS',		[
		'lg-spa',
		'lg-cat',
		'lg-eng',
		'lg-fra'
	]);
	// dedalo_diffusion_langs. Default value is the same as project langs. Change for custom diffusion langs
	define('DEDALO_DIFFUSION_LANGS', DEDALO_PROJECTS_DEFAULT_LANGS);
	// translator
	// define('DEDALO_TRANSLATOR_URL' , [
	// 	'babel' => 'https://babel.render.es/babel_engine/'
	// ]);	# default Babel: http://babel.render.net/babel_engine/



// dedalo default config values
	// dedalo_prefix_tipos. Array of tipos (FIXME: available tipos?) to import and manage by Dédalo. mandatory: ['dd','rsc','tool','hierarchy','lg']
	define('DEDALO_PREFIX_TIPOS', [
		'dd',
		'rsc',
		'hierarchy',
		'lg',
		'oh',
		'ich'
	]);
	// main_fallback_section. Default section tipo to go when it's not defined any
	define('MAIN_FALLBACK_SECTION', 'oh1'); # go after login (tipo inventory)
	// numerical matrix values of list of values 'yes/no'. Do not change this values !
	define('NUMERICAL_MATRIX_VALUE_YES', 1);
	define('NUMERICAL_MATRIX_VALUE_NO',  2);
	// dedalo_permissions_root. Default permissions
	// define('DEDALO_PERMISSIONS_ROOT', 1); DEPRECATED !
	// dedalo_max_rows_per_page . Default max record per page. int default 10
	define('DEDALO_MAX_ROWS_PER_PAGE', 10);
	// user profile by default. Default profile id. int default 2 (regular user)
	define('DEDALO_PROFILE_DEFAULT', 2);
	// dedalo_default_project. Default section_id of target filter section. int default 1
	define('DEDALO_DEFAULT_PROJECT', 1);
	// dedalo_filter_section_tipo_default. Target filter section (current 'dd153' - Projects section). Do not change this
	define('DEDALO_FILTER_SECTION_TIPO_DEFAULT'	, DEDALO_SECTION_PROJECTS_TIPO);



// media config
	// media_base paths
	define('DEDALO_MEDIA_PATH'	, DEDALO_ROOT_PATH	. '/media');
	define('DEDALO_MEDIA_URL'	, DEDALO_ROOT_WEB 	. '/media');

	// av media
		// dedalo_av_folder. string default '/av'
		define('DEDALO_AV_FOLDER'					, '/av');
		// dedalo_av_extension string default 'mp4'
		define('DEDALO_AV_EXTENSION'				, 'mp4');
		// dedalo_av_extensions_supported. array default ['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv']
		define('DEDALO_AV_EXTENSIONS_SUPPORTED'		, ['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv']);
		// dedalo_av_mime_type. string default 'video/mp4'
		define('DEDALO_AV_MIME_TYPE'				, 'video/mp4');
		// dedalo_av_type. string default 'h264/AAC'
		define('DEDALO_AV_TYPE'						, 'h264/AAC');
		// dedalo_av_quality_original. string default 'original'
		define('DEDALO_AV_QUALITY_ORIGINAL'			, 'original');
		// quality default normally '404' (standard dedalo 72x404)
		define('DEDALO_AV_QUALITY_DEFAULT'			, '404');
		// quality folders array normally '404','audio' (sort desc quality)
		define('DEDALO_AV_AR_QUALITY'				, [DEDALO_AV_QUALITY_ORIGINAL,'1080','720','576','404','240','audio']);

		// av_posterframe_extension normally 'jpg'
		define('DEDALO_AV_POSTERFRAME_EXTENSION'	, 'jpg');
		// ffmpeg path normally /usr/bin/ffmpeg
		define('DEDALO_AV_FFMPEG_PATH'				, '/usr/bin/ffmpeg');
		// ffmpeg_settings (quality conversion and aspect ratio definitions)
		define('DEDALO_AV_FFMPEG_SETTINGS'			, DEDALO_CORE_PATH . '/media_engine/lib/ffmpeg_settings');
		// av_faststart_path normally /usr/bin/qt-faststart
		define('DEDALO_AV_FASTSTART_PATH'			, '/usr/bin/qt-faststart');
		// av_ffprobe_path normally /usr/bin/ffprobe
		define('DEDALO_AV_FFPROBE_PATH'				, '/usr/bin/ffprobe');
		// av_streamer. Optional media streamer. Default is null
		define('DEDALO_AV_STREAMER'					, null);
		// av_watermark_file
		define('DEDALO_AV_WATERMARK_FILE'			, DEDALO_MEDIA_PATH .'/'. DEDALO_AV_FOLDER . '/watermark/watermark.png');

		// text_subtitles_engine (tool_subtitles)
		// define('TEXT_SUBTITLES_ENGINE'			, DEDALO_CORE_PATH . '/tools/tool_subtitles'); (!) DEPRECATED
		// dedalo_subtitles_folder (tool_subtitles)
		define('DEDALO_SUBTITLES_FOLDER'			, '/subtitles');
		// dedalo_av_subtitles_extension . Default is 'vtt'
		define('DEDALO_AV_SUBTITLES_EXTENSION'		, 'vtt');

		// dedalo_av_recompress_all. On 1, all video files are re-compressed to 960k/s variable bit rate and keyframe every 75 frames
		define('DEDALO_AV_RECOMPRESS_ALL'			, 1); // 1 re-compress all av files uploaded, 0 to only copy av files uploaded (default 0)

	// 3d media
		// dedalo_3d_foler. string default '/av'
		define('DEDALO_3D_FOLDER'					, '/3d');
		// dedalo_3d_extension. string default 'gltf'
		define('DEDALO_3D_EXTENSION'				, 'gltf');
		// dedalo_3d_extensions_supported. array default ['gltf', 'glb', 'obj', 'fbx', 'dae']
		define('DEDALO_3D_EXTENSIONS_SUPPORTED'		, ['gltf', 'glb', 'obj', 'fbx', 'dae']);

		// dedalo_3d_obj2gltf_path normally /usr/bin/obj2gltf
		define('DEDALO_3D_OBJ2GLTF_PATH'			, '/usr/bin/obj2gltf');
		// dedalo_3d_fbx2gltf_path normally /usr/bin/FBX2glTF
		define('DEDALO_3D_FBX2GLTF_PATH'			, '/usr/bin/FBX2glTF');
		// dedalo_3d_collada2gltf_path normally /usr/bin/COLLADA2GLTF-bin
		define('DEDALO_3D_COLLADA2GLTF_PATH'		, '/usr/bin/COLLADA2GLTF-bin');

	// image media
		// image_folder. Default: '/image'
		define('DEDALO_IMAGE_FOLDER'				, '/image');
		// image_extension.  Default: 'jpg'
		define('DEDALO_IMAGE_EXTENSION'				, 'jpg');
		// image_mime_type. Default: 'image/jpeg'
		define('DEDALO_IMAGE_MIME_TYPE'				, 'image/jpeg');
		// image_type. Default: 'jpeg'
		define('DEDALO_IMAGE_TYPE'					, 'jpeg');
		// image_extensions_supported. Array default: ['jpg','jpeg','png','tif','tiff','bmp','psd','raw','webp','heic']
		define('DEDALO_IMAGE_EXTENSIONS_SUPPORTED'	, ['jpg','jpeg','png','tif','tiff','bmp','psd','raw','webp','heic']);
		// image_quality_original. Default: 'original'
		define('DEDALO_IMAGE_QUALITY_ORIGINAL'		, 'original');
		// image_quality_retouched of original. Default: 'modified' ('modificada' in old versions)
		define('DEDALO_IMAGE_QUALITY_RETOUCHED'		, 'modified');
		// quality default. Default: '1.5MB'
		define('DEDALO_IMAGE_QUALITY_DEFAULT'		, '1.5MB');
		// dedalo_image_thumb_default. Default: 'thumb')
		define('DEDALO_IMAGE_THUMB_DEFAULT'			, 'thumb');
		// image_ar_quality. Array of image quality specifications like [DEDALO_IMAGE_QUALITY_ORIGINAL,DEDALO_IMAGE_QUALITY_DEFAULT,'<1MB',DEDALO_IMAGE_THUMB_DEFAULT]
		define('DEDALO_IMAGE_AR_QUALITY'			, [DEDALO_IMAGE_QUALITY_ORIGINAL,DEDALO_IMAGE_QUALITY_RETOUCHED,'25MB','6MB','1.5MB',DEDALO_IMAGE_THUMB_DEFAULT]);
		// image_print_dpi (default int 150. Used to calculate print size of images -tool_image_versions-)
		define('DEDALO_IMAGE_PRINT_DPI'				, 150);
		// image lib
		// define('DEDALO_IMAGE_LIB'				, true);  (!) DEPRECATED
		// image_file_url
		define('DEDALO_IMAGE_FILE_URL'				, DEDALO_CORE_URL . '/media_engine/img.php');
		// lib ImageMagick magick_path
		define('MAGICK_PATH'						, '/usr/bin/'); 	# Like '/usr/bin/';
		// color_profiles_path
		define('COLOR_PROFILES_PATH'				, DEDALO_CORE_PATH . '/media_engine/lib/color_profiles_icc/');
		// thumbs dedalo_image_thumb sizes. Integer as pixels
		define('DEDALO_IMAGE_THUMB_WIDTH'			, 224);	// int Default 102 | 224
		define('DEDALO_IMAGE_THUMB_HEIGHT'			, 149);	// int Default 57 | 149
		// image_web_folder normally '/web' Used to save uploaded files from component_html_text
		define('DEDALO_IMAGE_WEB_FOLDER'			, '/web');



	// pdf media
		// pdf_folder. Default '/pdf'
		define('DEDALO_PDF_FOLDER'					, '/pdf');
		// pdf_extension normally 'pdf'
		define('DEDALO_PDF_EXTENSION'				, 'pdf');
		// pdf_extensions_supported. Array default: ['pdf']
		define('DEDALO_PDF_EXTENSIONS_SUPPORTED'	, ['pdf']);
		// dedalo_pdf_quality_original. string default 'original'
		define('DEDALO_PDF_QUALITY_ORIGINAL'		, 'original');
		// pdf_quality_default. Default: 'standard'
		define('DEDALO_PDF_QUALITY_DEFAULT'			, 'standard');
		// pdf_ar_quality. Array of PDF quality definitions
		define('DEDALO_PDF_AR_QUALITY'				, [DEDALO_PDF_QUALITY_DEFAULT]);
		// pdf_mime_type. Default: 'application/pdf'
		define('DEDALO_PDF_MIME_TYPE'				, 'application/pdf');
		# pdf_type. Default: 'pdf'
		define('DEDALO_PDF_TYPE'					, 'pdf');
		// pdf_thumb_default Default: 'thumb'
		define('DEDALO_PDF_THUMB_DEFAULT'			, 'thumb');
		// pdf_renderer (path of daemon pdf generator from html) Normally wkhtmltopdf (https://wkhtmltopdf.org) lib is used
		define('DEDALO_PDF_RENDERER'				, '/usr/bin/wkhtmltopdf');
		// automatic_transcription_engine (path of daemon generator of text files from PDF) Using XPDF from http://www.foolabs.com/xpdf/ or https://pdftotext.com
		define('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE'	, '/usr/bin/pdftotext');



	// html_files
		define('DEDALO_HTML_FILES_FOLDER'			, '/html_files');
		define('DEDALO_HTML_FILES_EXTENSION'		, 'html');



	// svg media
		// svg_folder. Default: '/svg'
		define('DEDALO_SVG_FOLDER'					, '/svg');
		// svg_extension normally 'svg'
		define('DEDALO_SVG_EXTENSION'				, 'svg');
		// svg_extensions_supported. Default ['svg']
		define('DEDALO_SVG_EXTENSIONS_SUPPORTED'	, ['svg']);
		// svg_quality_default. Default 'standard'
		define('DEDALO_SVG_QUALITY_DEFAULT'			, 'standard');
		// svg_ar_quality
		define('DEDALO_SVG_AR_QUALITY'				, [DEDALO_SVG_QUALITY_DEFAULT]);
		// svg_mime_type. Default 'image/svg+xml'
		define('DEDALO_SVG_MIME_TYPE'				, 'image/svg+xml');



// uploader config
	define('DEDALO_UPLOADER_DIR', 	DEDALO_LIB_PATH . '/lib/jquery/jQuery-File-Upload');
	define('DEDALO_UPLOADER_URL', 	DEDALO_LIB_URL . '/jquery/jQuery-File-Upload');
	define('DEDALO_UPLOAD_TMP_DIR', DEDALO_MEDIA_PATH . '/upload/service_upload/tmp');



// geo location. string from values: OSM | ARCGIS | GOOGLE | VARIOUS | ARCGIS . Default: 'VARIOUS'
	define('DEDALO_GEO_PROVIDER', 'VARIOUS');



// rest_config
	// Deprecated. Not used here.



// media entity menu config
	# DEDALO_ENTITY_MEDIA_AREA_TIPO = remove the Real sections from menu ALL sections
	define('DEDALO_ENTITY_MEDIA_AREA_TIPO', '');
	# DEDALO_ENTITY_MENU_SKIP_TIPOS = skip the array of tipos but walk the children, used for groupings that don't want see into the menu "Oral History" "list of values"...
	define('DEDALO_ENTITY_MENU_SKIP_TIPOS', []);



// dedalo_test_install. bool
	// On true, check current admin (root) user password on login page
	define('DEDALO_TEST_INSTALL', true);



// dedalo_section_id_temp
	// name / prefix of section_id temporal used to store special sections in memory or session. Do not change this
	define('DEDALO_SECTION_ID_TEMP', 'tmp');



// tools vars
	// tool export
	define('DEDALO_TOOL_EXPORT_FOLDER_PATH',			DEDALO_MEDIA_PATH . '/export/files');
	define('DEDALO_TOOL_EXPORT_FOLDER_URL' ,			DEDALO_MEDIA_URL  . '/export/files');
	// tool import
	define('DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH',	DEDALO_MEDIA_PATH . '/import/files');



// lock_components
	// Set lock components function when users are editing fields. boolean
	define('DEDALO_LOCK_COMPONENTS', false);



// notifications
	// Send notifications to user browser. E.g. Current lock components..
	define('DEDALO_NOTIFICATIONS'			, false);
	define('DEDALO_NODEJS'					, '/usr/bin/node');
	define('DEDALO_NODEJS_PM2'				, '/usr/bin/pm2');



// diffusion domain
	// Set publication diffusion domain. Default value is 'default'
	define('DEDALO_DIFFUSION_DOMAIN'			, 'default');
	define('DEDALO_DIFFUSION_RESOLVE_LEVELS'	, 2);
	define('DEDALO_PUBLICATION_ALERT'			, false);



// diffusion_custom
	// Optional custom class to manipulate diffusion options. string|bool . Default: false
	define('DIFFUSION_CUSTOM', false);



// dedalo_ar_exclude_components
	// optional array of component tipo to exclude
	define('DEDALO_AR_EXCLUDE_COMPONENTS', []);



// dedalo_protect_media
	// Deprecated. Not used here.



// dedalo_filter_user_records_by_id
	// Activate user records filter restriction
	define('DEDALO_FILTER_USER_RECORDS_BY_ID', false);



// geonames
	// geonames_account_username. Only to development
	define('GEONAMES_ACCOUNT_USERNAME', 'my_account');



// encryption_mode
	// If not is defined, will be calculated from current Dédalo data version
	define('ENCRYPTION_MODE', 'openssl');



// remote_structure_server_code
	define('STRUCTURE_FROM_SERVER'		, true);
	define('STRUCTURE_SERVER_CODE'		, 'x3a0B4Y020Eg9w');
	define('STRUCTURE_SERVER_URL'		, 'https://master.render.es/dedalo/lib/dedalo/extras/str_manager/');
	define('STRUCTURE_DOWNLOAD_DIR'		, DEDALO_BACKUP_PATH_STRUCTURE . '/download');



// login init_cookie_auth
	// Deprecated. Not used here.



// export hierarchy
	// This is ONLY for MASTER ! . Not use for other domains !



// zotero_import
	// Deprecated. Not used here.



// api (publication). This definition is used in administration panels to auto-fill main vars
	// Note that in the public server config file, you need to define again this values because
	// the public API files could be place in another location/server as independent files
	define('API_WEB_USER_CODE_MULTIPLE' , [
		[
			'db_name'	=> '', // like web_my_entity
			'code'		=> ''  // like asd38kjlkasd6gadsg2fasdoijQks
		]
	]);



// socrata config
	// Custom connection config. Not used here.



// saml config
	// Custom connection config. Not used here.



// mailer
	// Custom connection config. Not used here.



// maintenance
	// maintenance mode active / inactive
	$maintenance_mode = false;
	define('DEDALO_MAINTENANCE_MODE', $maintenance_mode);
	if (DEDALO_MAINTENANCE_MODE===true) {
		include(DEDALO_CORE_PATH.'/maintenance/maintenance.php');
	}



// notice_to_active_users : Warning to print in all pages to logged users
	$notice = '<b>Warning</b>. In a few minutes the system will shut down about 5 minutes for maintenance updates. <br>
	Please, save the unsaved work and log out as soon as possible.
	After a few minutes, you can re-login to Dédalo and work again';
	// notice_to_active_users(array('msg'=>$notice, 'mode'=>'warning'));
