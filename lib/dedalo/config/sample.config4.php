<?php
################################################################
################### DEDALO VERSION V5 ##########################
################################################################
/*
	UNDER GNU PUBLIC LICENSE / BAJO LICENCIA PÚBLICA GNU
	https://www.gnu.org/licenses/licenses.en.html
	March 14, 2012

	Juan Francisco Onielfa Veneros
	Alejandro Peña Carbonell
	https://dedalo.dev/

	Reviewed: 19-05-2022
*/



################################################################
# DEDALO 4 MAIN VARS
	define('DEDALO_HOST',			$_SERVER['HTTP_HOST'] );
	define('DEDALO_PROTOCOL',		(isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on') ? 'https://' : 'http://');

	# Dedalo paths
	define('DEDALO_ROOT',			dirname(dirname(dirname(dirname(__FILE__)))));
	define('DEDALO_ROOT_WEB',		explode('/lib/', $_SERVER["REQUEST_URI"])[0]);

	define('DEDALO_LIB_BASE_PATH',	dirname( dirname(__FILE__) ));
	define('DEDALO_LIB_BASE_URL',	DEDALO_ROOT_WEB . '/'. basename(dirname(DEDALO_LIB_BASE_PATH)) . '/'. basename(DEDALO_LIB_BASE_PATH) );

	define('DEDALO_EXTRAS_PATH',	DEDALO_LIB_BASE_PATH .'/extras');

	# Dedalo information
	define('DEDALO_SALT_STRING',	'dedalo_cuatro');

	# TIME ZONE : Time zone for backups archive names
	define('DEDALO_TIMEZONE',		'Europe/Madrid');	date_default_timezone_set(DEDALO_TIMEZONE);
	# SET LOCALE (Spanish for example)
	// setlocale(LC_ALL,'es_ES');		// For Mac
	setlocale(LC_ALL, 'es_ES.utf8');	// For Linux



################################################################
# DEDALO 4 ENTITY
	# Entity ASCII lowercase code. Use 16 chars MAX like 'mupreva' without spaces.
	# (!) Note that this entity code will be used to create session and folder names. Must be be system safe!
	# (!) DO NOT USE NON ASCII CODES LIKE: "Museu de la plaça de l'espart/teixits". Use instead, something like: "mupespart"
	# We recommend not using the camel-case notation, but underscores between words and without spaces
	# (!) Please note that this name is used for the encryption task and should NOT be changed after installation
	define('DEDALO_ENTITY',			'entity_codename');
	# DEDALO_ENTITY_LABEL . (Showed title of html pages. Yes you are free here!)
	define('DEDALO_ENTITY_LABEL',	'My entity label');
	# DEDALO_ENTITY_ID . (From Dédalo private list)
	define('DEDALO_ENTITY_ID',		0);
	# DEVELOPMENT_SERVER
	define('DEVELOPMENT_SERVER',	false);



################################################################
# CACHE MANAGER
	define('DEDALO_CACHE_MANAGER',	false);	// redis / memcached / zebra_db / false
	if(DEDALO_CACHE_MANAGER) {
		define('DEDALO_CACHE_MANAGER_DB', 'cache_'.substr(DEDALO_HOST, 0,-5) );
		include(DEDALO_LIB_BASE_PATH.'/config/cache_manager.php');
	}



################################################################
# CORE REQUIRE
	# BASIC FUNCTIONS
	include DEDALO_LIB_BASE_PATH.'/config/core_functions.php';
	# VERSION
	include DEDALO_LIB_BASE_PATH.'/config/version.inc';
	# Dedalo str tipos
	include DEDALO_LIB_BASE_PATH.'/config/dd_tipos.php';



################################################################
# DB
	// POSTGRESQL AND MYSQL DATABASE CONNECTION
	include(DEDALO_LIB_BASE_PATH.'/config/config4_db.php');
	define('SLOW_QUERY_MS'	, 1200);



################################################################
# SESSION
	if (session_status() !== PHP_SESSION_ACTIVE) {

		# HANDLER
		$SESSION_HANDLER = 'files';	// files | memcached | user | postgresql
		define('DEDALO_SESSION_HANDLER', $SESSION_HANDLER);

		# LIFETIME
		# Set max duration of dedalo user session
		# Use ini directive to set session.gc_maxlifetime (Garbage Collection lifetime)
		# Use session_cache_expire to set duration of session
		# Set duration max of session data in hours (default 8 hours)
		# Set before session start
		if(!isset($session_duration_hours)) $session_duration_hours = 8;
		$timeout_seconds = intval($session_duration_hours*3600); // in seconds

		# Session
		session_start_manager([
			'save_handler'		=> 'files',
			'timeout_seconds'	=> $timeout_seconds,
			'session_name'		=> 'dedalo_'.DEDALO_ENTITY
		]);

	}//end if (session_status() !== PHP_SESSION_ACTIVE)



################################################################
# BACKUP
	// Automatic backups control
	# DEDALO_BACKUP_ON_LOGIN : true / false
	define('DEDALO_BACKUP_ON_LOGIN',	true);
	# DEDALO_BACKUP_TIME_RANGE Minimum lapse of time (in hours) for run backup script again. Default: (int) 4
	define('DEDALO_BACKUP_TIME_RANGE',	8);



################################################################
# IS_DEVELOPER
	// Logged user is developer value
	$show_developer = (isset($_SESSION['dedalo4']['auth']['is_developer']) && $_SESSION['dedalo4']['auth']['is_developer']===true)
		? true
		: false;
	define('SHOW_DEVELOPER', $show_developer);



################################################################
# SHOW_DEBUG
	// Application debug config
	$show_debug = (isset($_SESSION['dedalo4']['auth']['user_id']) && $_SESSION['dedalo4']['auth']['user_id']==DEDALO_SUPERUSER)
		? true
		: false;
	define('SHOW_DEBUG', $show_debug);



################################################################
# LOG AND ERRORS
	// Store application data info and errors
	# Log data
	include(DEDALO_LIB_BASE_PATH . '/logger/class.logger.php');
	/*
	DEBUG		= 100;
	INFO		= 75;
	NOTICE		= 50;
	WARNING		= 25;
	ERROR		= 10;
	CRITICAL	= 5;

	Debug default: DEBUG
	Production default: ERROR
	*/
	define('LOGGER_LEVEL', (SHOW_DEBUG===true)
		? logger::DEBUG
		: logger::WARNING);

	# Log messages in page
	$log_messages = array();
	global $log_messages;

	# ACTIVITY LOG DB
	# Log application info in db
		logger::register('activity', 'activity://auto:auto@auto:3306/log_data?table=matrix_activity');
		# Store object in logger static array var
		logger::$obj['activity'] = logger::get_instance('activity');

	# ERROR LOG FILE
	# Log application errors in file
		# Logs dir (Maintain this directory inaccessible for security)
		define('DEDALO_LOGS_DIR',	dirname(dirname(DEDALO_ROOT)) . '/logs');	# !! In production mode log MUST BE out of site
		# Set file. In production mode log MUST BE out of site
		logger::register('error',	'file://'.DEDALO_LOGS_DIR.'/dedalo_errors.log');
		# Store object in logger static array var
		logger::$obj['error'] = logger::get_instance('error');

	# ERROR : Handler class
	include(DEDALO_LIB_BASE_PATH.'/config/class.Error.php');



################################################################
# LANG
	# DEDALO STRUCTURE LANG (default 'lg-spa')
	define('DEDALO_STRUCTURE_LANG', 'lg-spa'); // (!) ONLY USE 'lg-spa', Do not change this value !

	# APPLICATION LANG : Dedalo application lang
	define('DEDALO_APPLICATION_LANGS', serialize([
		'lg-spa'	=> 'Castellano',
		'lg-cat'	=> 'Català',
		'lg-eus'	=> 'Euskara',
		'lg-eng'	=> 'English',
		'lg-fra'	=> 'French'
	]));
	define('DEDALO_APPLICATION_LANGS_DEFAULT',	'lg-eng');
	define('DEDALO_APPLICATION_LANG',			fix_cascade_config4_var('dedalo_application_lang',DEDALO_APPLICATION_LANGS_DEFAULT));

	# DATA LANG : Dedalo data lang
	define('DEDALO_DATA_LANG_DEFAULT',			'lg-eng');
	define('DEDALO_DATA_LANG',					fix_cascade_config4_var('dedalo_data_lang',DEDALO_DATA_LANG_DEFAULT));
	define('DEDALO_DATA_LANG_SELECTOR',			false);

	# DEDALO_DATA_NOLAN
	define('DEDALO_DATA_NOLAN',					'lg-nolan');

	# Projects langs
	define('DEDALO_PROJECTS_DEFAULT_LANGS',		serialize([
		'lg-spa',
		'lg-cat',
		'lg-eng',
		'lg-fra'
	]));
	# DEDALO_DIFFUSION_LANGS
	# Default value is the same as project langs. Change for custom diffusion langs
	define('DEDALO_DIFFUSION_LANGS', DEDALO_PROJECTS_DEFAULT_LANGS);

	# TRANSLATOR
	define('DEDALO_TRANSLATOR_URL', 'https://babel.render.es/babel_engine/');	# Apertium, Google translator, etc..



################################################################
# DEDALO 4 DEFAULT CONFIG VALUES

	#
	# DEDALO_PREFIX_TIPOS
	define('DEDALO_PREFIX_TIPOS', serialize([
		'dd',
		'rsc',
		'hierarchy',
		'lg',
		'oh'
	]));

	# Fallback section
	define('MAIN_FALLBACK_SECTION',				'oh1'); # go after login (tipo inventory) forbidden 'dd242'!
	# NUMERICAL MATRIX VALUES. List of values 'yes/no' : used in login secuence before enter to system
	define('NUMERICAL_MATRIX_VALUE_YES',		1);
	define('NUMERICAL_MATRIX_VALUE_NO',			2);
	# PERMISSIONS DEDALO DEFAULT ROOT
	define('DEDALO_PERMISSIONS_ROOT',			1);
	# MAX ROWS . ROWS LIST MAX RECORDS PER PAGE
	define('DEDALO_MAX_ROWS_PER_PAGE',			10);
	# USER PROFLE BY DEFAULT
	define('DEDALO_PROFILE_DEFAULT',			2); // User (defined in profiles)
	# DEDALO_DEFAULT_PROJECT. Default section_id of target filter section
	define('DEDALO_DEFAULT_PROJECT',			1);
	# DEDALO_FILTER_SECTION_TIPO_DEFAULT. Target filter section (actually dd153)
	define('DEDALO_FILTER_SECTION_TIPO_DEFAULT', DEDALO_SECTION_PROJECTS_TIPO); // dd153 Projects section (dd tipos)



################################################################
# DEDALO_SECTION_ID_TEMP
	// Name / prefix of section_id temporal used to store special sections in memory or session
	define('DEDALO_SECTION_ID_TEMP', 'tmp');



################################################################
# LIBS PATH

	# JQUERY JS LIB
	define('JQUERY_LIB_URL_JS'			, DEDALO_ROOT_WEB . '/lib/jquery/jquery.min.js');
	# JQUERY UI
	define('JQUERY_UI_URL_JS'			, DEDALO_ROOT_WEB . '/lib/jquery/jquery-ui/jquery-ui.min.js');
	define('JQUERY_UI_URL_CSS'			, DEDALO_ROOT_WEB . '/lib/jquery/jquery-ui/jquery-ui.min.css');
	# TABLESORTER
	define('JQUERY_TABLESORTER_JS'		, DEDALO_ROOT_WEB . '/lib/jquery/jquery-tablesorter/jquery.tablesorter.min.js');
	# Text editor
	define('TEXT_EDITOR_URL_JS'			, DEDALO_ROOT_WEB . '/lib/tinymce/js/tinymce/tinymce.min.js');
	# PAPER
	define('PAPER_JS_URL' 				, DEDALO_ROOT_WEB .'/lib/paper/dist/paper-full.min.js'); // core | full
	# LEAFLET
	define('LEAFLET_JS_URL' 			, DEDALO_ROOT_WEB .'/lib/leaflet/stable_versions/leaflet.js');
	# D3
	define('D3_URL_JS' 					, DEDALO_ROOT_WEB .'/lib/nvd3/lib/d3.v3.min.js');
	# NVD3
	define('NVD3_URL_JS' 				, DEDALO_ROOT_WEB .'/lib/nvd3/build/nv.d3.min.js');
	define('NVD3_URL_CSS' 				, DEDALO_ROOT_WEB .'/lib/nvd3/build/nv.d3.min.css');
	# BOOTSTRAP
	define('BOOTSTRAP_CSS_URL' 			, DEDALO_ROOT_WEB .'/lib/bootstrap/dist/css/bootstrap.min.css');
	define('BOOTSTRAP_JS_URL' 			, DEDALO_ROOT_WEB .'/lib/bootstrap/dist/js/bootstrap.min.js');
	# CDN USE BOOL
	define('USE_CDN'					, false);



################################################################
# MEDIA CONFIG

	# MEDIA_BASE PATH
	define('DEDALO_MEDIA_BASE_PATH',	DEDALO_ROOT		. '/media');
	define('DEDALO_MEDIA_BASE_URL',		DEDALO_ROOT_WEB	. '/media');


	#
	# AV MEDIA
		# AV FOLDER normally '/media/av'
		define('DEDALO_AV_FOLDER',					'/av');
		# EXTENSION normally mp4, mov
		define('DEDALO_AV_EXTENSION',				'mp4');
		# DEDALO_IMAGE_EXTENSIONS_SUPPORTED
		define('DEDALO_AV_EXTENSIONS_SUPPORTED',	serialize(['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv']));
		# MIME normally video/mp4, quicktime/mov
		define('DEDALO_AV_MIME_TYPE',				'video/mp4');
		# TYPE normally h264/AAC
		define('DEDALO_AV_TYPE',					'h264/AAC');
		# QUALITY DEDALO_AV_QUALITY_ORIGINAL normally 'original'
		define('DEDALO_AV_QUALITY_ORIGINAL',		'original');
		# QUALITY DEFAULT normally '404' (standard dedalo 72x404)
		define('DEDALO_AV_QUALITY_DEFAULT',			'404');
		# QUALITY FOLDERS ARRAY normally '404','audio' (Sort DESC quality)
		define('DEDALO_AV_AR_QUALITY',				serialize([DEDALO_AV_QUALITY_ORIGINAL,'1080','720','576','404','240','audio']));
		# EXTENSION normally mp4, mov
		define('DEDALO_AV_POSTERFRAME_EXTENSION',	'jpg');
		# FFMPEG PATH
		define('DEDALO_AV_FFMPEG_PATH',				'/usr/bin/ffmpeg'); # Like /usr/bin/ffmpeg
		# FFMPEG SETTINGS
		define('DEDALO_AV_FFMPEG_SETTINGS',			DEDALO_LIB_BASE_PATH . '/media_engine/lib/ffmpeg_settings');
		# FAST START PATH
		define('DEDALO_AV_FASTSTART_PATH',			'/usr/bin/qt-faststart'); # Like /usr/bin/qt-faststart
		# DEDALO_AV_FFPROBE_PATH PATH usually /usr/bin/ffprobe
		define('DEDALO_AV_FFPROBE_PATH',			'/usr/bin/ffprobe'); # Like /usr/bin/ffprobe
		# AV STREAMER
		define('DEDALO_AV_STREAMER',				NULL);
		# AV DEDALO_AV_WATERMARK_FILE
		define('DEDALO_AV_WATERMARK_FILE',			DEDALO_MEDIA_BASE_PATH .'/'. DEDALO_AV_FOLDER . '/watermark/watermark.png');

		# TEXT_SUBTITLES_ENGINE (tool_subtitles)
		define('TEXT_SUBTITLES_ENGINE',				DEDALO_LIB_BASE_PATH . '/tools/tool_subtitles');
		# DEDALO_SUBTITLES_FOLDER (tool_subtitles)
		define('DEDALO_SUBTITLES_FOLDER',			'/subtitles');
		# EXTENSION normally vtt
		define('DEDALO_AV_SUBTITLES_EXTENSION',		'vtt');

		# DEDALO_AV_RECOMPRESS_ALL
		define('DEDALO_AV_RECOMPRESS_ALL',			1); // 1 re-compress all av files uploaded, 0 to only copy av files uploaded (default 0)


	#
	# IMAGE MEDIA
		# IMAGE FOLDER normally '/image'
		define('DEDALO_IMAGE_FOLDER',				'/image');
		# EXTENSION normally jpg
		define('DEDALO_IMAGE_EXTENSION',			'jpg');
		# MIME normally image/jpeg
		define('DEDALO_IMAGE_MIME_TYPE',			'image/jpeg');
		# TYPE normally jpeg
		define('DEDALO_IMAGE_TYPE',					'jpeg');
		# DEDALO_IMAGE_EXTENSIONS_SUPPORTED
		define('DEDALO_IMAGE_EXTENSIONS_SUPPORTED',	serialize(['jpg','jpeg','png','tif','tiff','bmp','psd','raw']));
		# QUALITY ORIGINAL normally 'original'
		define('DEDALO_IMAGE_QUALITY_ORIGINAL',		'original');
		# QUALITY MODIFY of original normally 'modified'
		define('DEDALO_IMAGE_QUALITY_RETOUCHED',	'modified');
		# QUALITY DEFAULT normally '1.5MB'
		define('DEDALO_IMAGE_QUALITY_DEFAULT',		'1.5MB');
		# DEDALO_IMAGE_THUMB_DEFAULT
		define('DEDALO_IMAGE_THUMB_DEFAULT',		'thumb');
		# QUALITY FOLDERS ARRAY IN MB
		define('DEDALO_IMAGE_AR_QUALITY',			serialize([DEDALO_IMAGE_QUALITY_ORIGINAL,DEDALO_IMAGE_QUALITY_RETOUCHED,'25MB','6MB','1.5MB',DEDALO_IMAGE_THUMB_DEFAULT]));
		# PRINT DPI (default 150. Used to calculate print size of images -tool_image_versions-)
		define('DEDALO_IMAGE_PRINT_DPI',			150);
		# IMAGE LIB
		define('DEDALO_IMAGE_LIB',					true);
		# IMG FILE
		define('DEDALO_IMAGE_FILE_URL',				DEDALO_LIB_BASE_URL . '/media_engine/img.php');

		# LIB ImageMagick MAGICK_PATH
		define('MAGICK_PATH',						'/usr/bin/'); # Like '/usr/bin/';
		# LIB exiftool
		define('EXIFTOOL_PATH', 					'/usr/bin/');
		# COLOR_PROFILES_PATH
		define('COLOR_PROFILES_PATH',				DEDALO_LIB_BASE_PATH . '/media_engine/lib/color_profiles_icc/');
		# DEDALO_IMAGE_WATERMARK_FILE
		define('DEDALO_IMAGE_WATERMARK_FILE', 		DEDALO_MEDIA_BASE_PATH .'/'. DEDALO_IMAGE_FOLDER . '/watermark/watermark.png');

		define('DEDALO_IMAGE_THUMB_WIDTH',			102);	# Default 102
		define('DEDALO_IMAGE_THUMB_HEIGHT',			57);	# Default 57

		# DEDALO_IMAGE_WEB_FOLDER normally '/web' Used to save uploaded files from component_html_text
		define('DEDALO_IMAGE_WEB_FOLDER',			'/web');
		# OPTIONAL IMAGE METADA INFO (used by tool metadata)
		define('DEDALO_IMAGE_METADATA_OPTIONS'		, [
			[
				'name'	=> 'creator',
				'value'	=> 'John Doe'
			],
			[
				'name'	=> 'title',
				'value'	=> 'Archive of ...'
			],
			[
				'name'	=> 'source',
				'value'	=> 'Source ...'
			],
			[
				'name'	=> 'copyright',
				'value'	=> 'This work is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License. To view a copy of this license, visit http://creativecommons.org/licenses/by-nc/4.0/'
			],
			[
				'name'	=> 'rights',
				'value'	=> 'This work is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License. To view a copy of this license, visit http://creativecommons.org/licenses/by-nc/4.0/'
			]
		]);


	#
	# PDF MEDIA
		# PDF FOLDER normally '/image'
		define('DEDALO_PDF_FOLDER',					'/pdf');
		# EXTENSION normally pdf
		define('DEDALO_PDF_EXTENSION',				'pdf');
		# DEDALO_PDF_EXTENSIONS_SUPPORTED
		define('DEDALO_PDF_EXTENSIONS_SUPPORTED',	serialize(['pdf']));
		# QUALITY DEFAULT normally 'standard'
		define('DEDALO_PDF_QUALITY_DEFAULT',		'standard');
		# QUALITY FOLDERS ARRAY
		define('DEDALO_PDF_AR_QUALITY',				serialize([DEDALO_PDF_QUALITY_DEFAULT]));
		# MIME normally application/pdf
		define('DEDALO_PDF_MIME_TYPE',				'application/pdf');
		# TYPE normally jpeg
		define('DEDALO_PDF_TYPE',					'pdf');
		# DEDALO_PDF_THUMB_DEFAULT
		define('DEDALO_PDF_THUMB_DEFAULT',			'thumb');

		# DEDALO_PDF_RENDERER (daemon for generate pdf from html files)
		define('DEDALO_PDF_RENDERER',				'/usr/bin/wkhtmltopdf');	# Like '/usr/bin/wkhtmltopdf'

		# PDF_AUTOMATIC_TRANSCRIPTION_ENGINE (daemon for generate text files from pdf files)
		define('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE','/usr/bin/pdftotext');	# Like '/usr/bin/pdftotext'


	#
	# HTML_FILES
		define('DEDALO_HTML_FILES_FOLDER',			'/html_files');
		define('DEDALO_HTML_FILES_EXTENSION',		'html');


	#
	# SVG MEDIA
		# SVG FOLDER normally '/svg'
		define('DEDALO_SVG_FOLDER',					'/svg');
		# EXTENSION normally svg
		define('DEDALO_SVG_EXTENSION',				'svg');
		# MIME normally image/svg+xml
		define('DEDALO_SVG_MIME_TYPE',				'image/svg+xml');
		# DEDALO_SVG_EXTENSIONS_SUPPORTED
		define('DEDALO_SVG_EXTENSIONS_SUPPORTED',	serialize(['svg']));



################################################################
# UPLOADER CONFIG
	define('DEDALO_UPLOADER_DIR',	DEDALO_ROOT		. '/lib/jquery/jQuery-File-Upload');
	define('DEDALO_UPLOADER_URL',	DEDALO_ROOT_WEB	. '/lib/jquery/jQuery-File-Upload');
	// DEDALO_UPLOAD_SERVICE_CHUNK_FILES
	// split files into chunks before upload at max size defined
	// values supported:
	// bool: false -> the files will not chunked
	// int: 95 -> files will be chunked in xMB fragments. 95MB files
	define('DEDALO_UPLOAD_SERVICE_CHUNK_FILES'			, false); // 5 = 5MB


################################################################
# GEO LOCATION
	define('DEDALO_GEO_PROVIDER',	'VARIOUS');	# OSM, ARCGIS, GOOGLE, VARIOUS, ARCGIS



################################################################
# LOADER
	// Auto load called classes
	include DEDALO_LIB_BASE_PATH.'/config/class.loader.php';



################################################################
# REST_CONFIG
	// Deprecated. Noting to config here..



################################################################
# MEDIA ENTITY MENU CONFIG
	# DEDALO_ENTITY_MEDIA_AREA_TIPO = remove the Real sections from menu ALL sections
	define('DEDALO_ENTITY_MEDIA_AREA_TIPO', '');
	# DEDALO_ENTITY_MENU_SKIP_TIPOS = skip the array of 'tipos' but walk the children, used for groupings that don't want see into the menu "Oral History" "list of values"...
	define('DEDALO_ENTITY_MENU_SKIP_TIPOS', serialize( array()));
	// define('DEDALO_INSPECTOR_EXTRAS', false); // Deprecated..



################################################################
# TOOLS VARS
	# TOOL EXPORT
	define('DEDALO_TOOL_EXPORT_FOLDER_PATH',			DEDALO_MEDIA_BASE_PATH . '/export/files');
	define('DEDALO_TOOL_EXPORT_FOLDER_URL' ,			DEDALO_MEDIA_BASE_URL  . '/export/files');
	# TOOL IMPORT
	define('DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH',	DEDALO_MEDIA_BASE_PATH . '/import/files');
	# TOOL_QR
	define('DEDALO_TOOL_QR_BASE_URL',					DEDALO_LIB_BASE_URL);



################################################################
# DEDALO_BYPASS_FILTER
	// Used to bypass user filter in some cases
	// Deprecated. Noting to config here..



################################################################
# LOCK_COMPONENTS
	# Lock and unlock components to avoid replacement data when more than one user edit the same component
	define('DEDALO_LOCK_COMPONENTS', false); // Default (bool)false



################################################################
# NOTIFICATIONS
	# Send notifications to user browser. E.g. Current lock components..
	define('DEDALO_NOTIFICATIONS',	false);
	define('DEDALO_NODEJS',			'/usr/local/bin/node');
	define('DEDALO_NODEJS_PM2',		'/usr/local/bin/pm2');


################################################################
# DEDALO_PROTECT_MEDIA
	// Useful in some publication context. bool default false
	define('DEDALO_PROTECT_MEDIA_FILES', false);



################################################################
# DEDALO_FILTER_USER_RECORDS_BY_ID
	// Activate user records filter restriction
	define('DEDALO_FILTER_USER_RECORDS_BY_ID', false);



################################################################
# ENCRYPTION_MODE
	// If not is defined, will be calculated from current Dédalo data version
	define('ENCRYPTION_MODE', 'openssl');



################################################################
# STRUCTURE CSS
	# Additional css processed from structure or created in additional external files
	define('DEDALO_STRUCTURE_CSS',	true);
	define('DEDALO_ADITIONAL_CSS',	false);



################################################################
# DIFFUSION DOMAIN
	define('DEDALO_DIFFUSION_DOMAIN',			'default');
	define('DEDALO_DIFFUSION_RESOLVE_LEVELS',	2);
	define('DEDALO_PUBLICATION_ALERT',			false);
	define('DEDALO_PUBLICATION_CLEAN_URL',		false);



################################################################
# DIFFUSION_CUSTOM
	# Optional custom class to manipulate diffusion options
	define('DIFFUSION_CUSTOM', false);



################################################################
# API
	# Auth code for access to rest API server
	# 'API_WEB_USER_CODE_MULTIPLE' is only for Dédalo use to allow several API_WEB_USER_CODE in same panel
	# In API server config, only one is accepted: 'API_WEB_USER_CODE'
	define('API_WEB_USER_CODE_MULTIPLE' , [
		[
			'db_name'	=> 'web_xxx',  // like web_my_entity
			'code'		=> 'xxxxxxxx'  // like asd38kjlkadsg2f68doWeqhijQks
		]
	]);



################################################################
# DEDALO_TEST_INSTALL
	# If true, check current admin user credentials on login page
	define('DEDALO_TEST_INSTALL', true);



################################################################
# REMOTE_STRUCTURE_SERVER_CODE
	define('STRUCTURE_FROM_SERVER',			true); 	# bool
	define('STRUCTURE_SERVER_CODE',			'x3a0B4Y020Eg9w'); 	 # string like aZdUs7asdasdhRsw4!sp
	define('STRUCTURE_SERVER_URL',			'https://master.render.es/dedalo/lib/dedalo/extras/str_manager/'); 	 # string like https	://master.render.es/dedalo/lib/dedalo/extras/str_manager/
	define('STRUCTURE_DOWNLOAD_DIR',		DEDALO_LIB_BASE_PATH . '/backup/backups_structure/srt_download');
	define('STRUCTURE_DOWNLOAD_JSON_FILE',	STRUCTURE_DOWNLOAD_DIR);
	define('STRUCTURE_IS_MASTER', 			false);
	// SERVER_PROXY Optional IP and port like 'XXX.XXX.XXX.XXX:3128'. Do not remove comment if its not necessary
	// define('SERVER_PROXY', 				'XXX.XXX.XXX.XXX:3128');



################################################################
# DEDALO_CODE
	// server side (master)
		// server git files (master) like /home/dedalo/master_dedalo.git
		// define('DEDALO_CODE_SERVER_GIT_DIR',	'/home/dedalo/master_dedalo.git');
		// target dir where git command send the compressed file like 'dedalo5_code.zip'
		// define('DEDALO_CODE_FILES_DIR',			DEDALO_ROOT . '/code');
	// client side
		// target dir where git command send the compressed file like 'https://master.render.es/dedalo/code/dedalo5_code.zip'
		define('DEDALO_SOURCE_VERSION_URL',			'https://master.render.es/dedalo/code/dedalo5_code.zip');
		// target dir where git command send the compressed file like 'https://master.render.es/dedalo/code/dedalo5_code.zip'
		define('DEDALO_SOURCE_VERSION_LOCAL_DIR',	'/tmp/'.DEDALO_ENTITY);



################################################################
# TOPONOMY_CENTRAL_SYNC
	// Deprecated. Noting to config here..



################################################################
# DEDALO_AR_EXCLUDE_COMPONENTS
	// Deprecated. Noting to config here..



################################################################
# DEDALO_THESAURUS
	// Deprecated. Noting to config here.. (Only for development transition v3 - v4)



################################################################
# GEONAMES
	// Only active for toponymy development
	// define('GEONAMES_ACCOUNT_USERNAME'	, 'my account');



################################################################
# TR_TAGS_CDN
	// Comment this line to use local server
	// Deprecated. Noting to config here..



################################################################
# LOGIN INIT_COOKIE_AUTH
	// Deprecated. Noting to config here..



################################################################
# EXPORT HIERARCHY
	// master development install only
	// define('EXPORT_HIERARCHY_PATH', '/local/path/install/import/hierarchy');



################################################################
# ZOTERO_IMPORT
	// Deprecated. Noting to config here..



################################################################
# SOCRATA CONFIG
	// custom socrata connection. Uncomment only if you have a Socrata custom connection
	// define('SOCRATA_CONFIG', array(
	// 	'app_token' 		=> 'XXXXXXXXXXXXXX',
	// 	'socrata_user' 		=> 'xxx@xxx.xx',
	// 	'socrata_password'	=> 'xxxxxxxxxxxxxx',
	// 	'server' 			=> 'xxxxxxxxxxxxxx',
	// 	'mode'				=> 'xxx'
	// ));



################################################################
# SAML CONFIG
	// SAML custom config. Only for systems with SALM users authorization



################################################################
# MAILER
	// Deprecated. Noting to config here..



################################################################
# SECTION_SKIP_PROJECT_FILTER
	// Sections where project filter is forced to be skipped always
	// Uncomment only if you really need to
	// define('SECTION_SKIP_PROJECT_FILTER', [
	// 	'xxxx'
	// ]);



################################################################
# MAINTENACE
	// maintenance mode active / inactive
	$maintenance_mode = false;
	define('DEDALO_MAINTENANCE_MODE', $maintenance_mode);
	if (DEDALO_MAINTENANCE_MODE) {
		include(DEDALO_LIB_BASE_PATH.'/maintenance/maintenance.php');
	}



################################################################
# NOTICE_TO_ACTIVE_USERS
	 // Warning to print in all pages to logged users
	$notice = "<b>Warning</b>. In a few minutes the system will shut down about 5 minutes for maintenance updates. <br>
	Please, save the unsaved work and log out as soon as possible.
	After a few minutes, you can re-login to Dédalo and get back to work";
	#notice_to_active_users(array('msg'=>$notice, 'mode'=>"warning"));
