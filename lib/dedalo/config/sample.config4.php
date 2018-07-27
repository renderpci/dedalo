<?php
################################################################
################### DEDALO VERSION V4 ##########################
################################################################
/*	
	UNDER GNU PUBLIC LICENSE / BAJO LICENCIA PÚBLICA GNU
	http://www.gnu.org/licenses/licenses.es.html
	Version 4, 14 de marzo de 2012 / 5 May 2016
	
	Juan Francisco Onielfa Veneros
	Alejandro Peña Carbonell
	http://www.fmomo.org/
	http://dedalo4.antropolis.net/

	Reviewed: 12-05-2018
*/


################################################################
# DEDALO 4 MAIN VARS
	define('DEDALO_HOST'			, $_SERVER['HTTP_HOST'] );
	define('DEDALO_PROTOCOL'		, stripos( $_SERVER['SERVER_PROTOCOL'],'https') === true ? 'https://' : 'http://' );
	
	# Dedalo paths
	define('DEDALO_ROOT'			, dirname(dirname(dirname(dirname(__FILE__)))));
	#define('DEDALO_ROOT_WEB'		, '/'. substr(substr($_SERVER["REQUEST_URI"],1), 0,  strpos(substr($_SERVER["REQUEST_URI"],1), "/")));
	define('DEDALO_ROOT_WEB'		, explode('/lib/', $_SERVER["REQUEST_URI"])[0]);
	
	define('DEDALO_LIB_BASE_PATH'	, dirname( dirname(__FILE__) ));
	define('DEDALO_LIB_BASE_URL'	, DEDALO_ROOT_WEB . '/'. basename(dirname(DEDALO_LIB_BASE_PATH)) . '/'. basename(DEDALO_LIB_BASE_PATH) );
	
	define('DEDALO_EXTRAS_PATH'		, DEDALO_LIB_BASE_PATH .'/extras');
	
	# Dedalo information
	define('DEDALO_SALT_STRING'		, 'dedalo_cuatro');

	# TIME ZONE : Zona horaria (for backups archive names)
	define('DEDALO_TIMEZONE'		, 'Europe/Madrid');	date_default_timezone_set(DEDALO_TIMEZONE);
	# SET LOCALE (Spanish for example)	
	#setlocale(LC_ALL,'en_EN');
	setlocale(LC_ALL,'es_ES'); 			// For Mac
	#setlocale(LC_ALL, 'es_ES.utf8');	// For Linux



################################################################
# DEDALO 4 ENTITY
	define('DEDALO_ENTITY', 'my_entity_name'); # Like 'dedalo4'
	# DEDALO_ENTITY_LABEL . (Showed title of html pages)
	define('DEDALO_ENTITY_LABEL', DEDALO_ENTITY);
	# DEVELOPMENT_SERVER
	define('DEVELOPMENT_SERVER'	, false);



################################################################
# CACHE MANAGER
	define('DEDALO_CACHE_MANAGER', false );	# redis / memcached / zebra_db / false
	if(DEDALO_CACHE_MANAGER) {
		define('DEDALO_CACHE_MANAGER_DB', 'cache_'.substr(DEDALO_HOST, 0,-5) );
		include(DEDALO_LIB_BASE_PATH.'/config/cache_manager.php');
	}



################################################################
# CORE REQUIRE
	# BASIC FUNCTIONS	
	include_once(DEDALO_LIB_BASE_PATH.'/config/core_functions.php');
	# VERSION
	include(DEDALO_LIB_BASE_PATH.'/config/version.inc');
	# Dedalo str tipos
	include(DEDALO_LIB_BASE_PATH.'/config/dd_tipos.php');



################################################################
# DB : CONEXIÓN CON LA BASE DE DATOS MYSQL
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
		if(!isset($session_duration_hours)) $session_duration_hours = 8 * 10;
		$timeout_seconds = intval($session_duration_hours*3600); // in seconds

		# Session
		session_start_manager([
						'save_handler' 		=> 'files',
						'timeout_seconds'	=> $timeout_seconds,
						'session_name' 		=> 'dedalo_'.DEDALO_ENTITY
					]);
		
	}//end if (session_status() !== PHP_SESSION_ACTIVE)



################################################################
# BACKUP : Automatic backups control
	# DEDALO_BACKUP_ON_LOGIN : true / false	
	define('DEDALO_BACKUP_ON_LOGIN'	 , true);
	# DEDALO_BACKUP_TIME_RANGE Minimun lapse of time (in hours) for run backup script again. Default: (int) 4
	define('DEDALO_BACKUP_TIME_RANGE', 4);



################################################################
# DEBUG : Application debug config
	$show_debug = false;
	if(
		# SUPERUSER IS LOGGED
		(
			isset($_SESSION['dedalo4']['auth']['user_id'])
			&& 	 ($_SESSION['dedalo4']['auth']['user_id']==DEDALO_SUPERUSER)
		)
	) {
		$show_debug = true;
	}	
	define('SHOW_DEBUG', $show_debug);



################################################################
# IS_DEVELOPER : Logged user is developer value
	$show_developer = false;
	if (isset($_SESSION['dedalo4']['auth']['is_developer']) && $_SESSION['dedalo4']['auth']['is_developer']===true) {
		$show_developer = true;
	}
	define('SHOW_DEVELOPER', $show_developer);




################################################################
# LOG AND ERRORS : STORE APPLICATION DATA INFO AND ERRORS

	# Log data
	include(DEDALO_LIB_BASE_PATH . '/logger/class.logger.php');
	/*
	DEBUG 	 = 100;
	INFO 	 = 75;
	NOTICE 	 = 50; 
	WARNING  = 25;
	ERROR 	 = 10;
	CRITICAL = 5;

	Debug default: DEBUG
	Production default: ERROR
	*/
	define('LOGGER_LEVEL', logger::WARNING); 
	

	# Log messages in page
	$log_messages = array();
	global $log_messages;		
	
	# ACTIVITY LOG DB
	# Log application info in db
		logger::register('activity'	, 'activity://auto:auto@auto:3306/log_data?table=matrix_activity');
		# Store object in logger static array var
		logger::$obj['activity'] = logger::get_instance('activity');
	
	# ERROR LOG FILE 
	# Log aplication errors in file
		# Logs dir (Maintain this directory unaccessible for security)	
		define('DEDALO_LOGS_DIR'  , dirname(dirname(DEDALO_ROOT)) . '/logs');	# !! In production mode log MUST BE out of site	
		# Set file. In production mode log MUST BE out of site
		logger::register('error', 'file://'.DEDALO_LOGS_DIR.'/dedalo_errors.log');		
		# Store object in logger static array var
		logger::$obj['error'] = logger::get_instance('error');

	# ERROR : Handler class
	include(DEDALO_LIB_BASE_PATH.'/config/class.Error.php');



################################################################
# LANG
	# DEDALO STRUCTURE LANG (default 'lg-spa')
	define('DEDALO_STRUCTURE_LANG'				, 'lg-spa');

	# APPLICATION LANG : Dedalo application lang
	define('DEDALO_APPLICATION_LANGS'			, serialize([
													"lg-spa" => "Castellano",
													"lg-cat" => "Català",
													"lg-eus" => "Euskara",
													"lg-eng" => "English",
													"lg-fra" => "French",
													]));
	define('DEDALO_APPLICATION_LANGS_DEFAULT'	, 'lg-spa');
	define('DEDALO_APPLICATION_LANG'			, fix_cascade_config4_var('dedalo_application_lang',DEDALO_APPLICATION_LANGS_DEFAULT));
	
	# DATA LANG : Dedalo data lang
	define('DEDALO_DATA_LANG_DEFAULT'			, 'lg-spa');
	define('DEDALO_DATA_LANG'					, fix_cascade_config4_var('dedalo_data_lang',DEDALO_DATA_LANG_DEFAULT));
	define('DEDALO_DATA_LANG_SELECTOR' 			, false);
	
	# DEDALO_DATA_NOLAN
	define('DEDALO_DATA_NOLAN'					, 'lg-nolan');

	# Projects langs
	define('DEDALO_PROJECTS_DEFAULT_LANGS'		, serialize([
													'lg-spa',
													'lg-cat',
													'lg-eng',
													]));

	# TRANSLATOR
	define('DEDALO_TRANSLATOR_URL'				, 'http://babel.antropolis.net/babel_engine/');	# Apertium, Google translator, etc..



################################################################
# DEDALO 4 DEFAULT CONFIG VALUES

	#
	# DEDALO_PREFIX_TIPOS
	define('DEDALO_PREFIX_TIPOS', serialize( ['dd',
											  'rsc',
											  'oh',
											  'ich'
											  ]
											));

	# Fallback section
	define('MAIN_FALLBACK_SECTION'				,'oh1'); # go after login (tipo inventory)	
	# NUMERICAL MATRIX VALUES. List of values 'yes/no' : used in login secuence before enter to system	
	define('NUMERICAL_MATRIX_VALUE_YES'			, 1);
	define('NUMERICAL_MATRIX_VALUE_NO'			, 2);
	# PERMISSIONS DEDALO DEFAULT ROOT
	define('DEDALO_PERMISSIONS_ROOT'			, 1);
	# MAX ROWS . ROWS LIST MAX RECORDS PER PAGE
	define('DEDALO_MAX_ROWS_PER_PAGE'			, 10);
	# USER PROFLE BY DEFAULT
	define('DEDALO_PROFILE_DEFAULT'				, 2); // User (defined in profiles)
	# DEDALO_DEFAULT_PROJECT. Default section_id of target filter section
	define('DEDALO_DEFAULT_PROJECT'				, 1);
	# DEDALO_FILTER_SECTION_TIPO_DEFAULT. Target filter section (actually dd153)
	define('DEDALO_FILTER_SECTION_TIPO_DEFAULT'	, DEDALO_SECTION_PROJECTS_TIPO); // dd153 Projects section (dd tipos)



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
	#define('TEXT_EDITOR_URL_JS'			, DEDALO_ROOT_WEB . '/vendor/tinymce/tinymce/tinymce.min.js');
	# PAPER
	define('PAPER_JS_URL' 				, DEDALO_ROOT_WEB .'/lib/paper/dist/paper-full.min.js');
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
	define('USE_CDN' 					, false);



################################################################
# MEDIA CONFIG

	# MEDIA_BASE PATH
	define('DEDALO_MEDIA_BASE_PATH'		, DEDALO_ROOT 		. '/media');
	define('DEDALO_MEDIA_BASE_URL'		, DEDALO_ROOT_WEB 	. '/media');	
	

	#
	# AV MEDIA
		# AV FOLDER normally '/media/av'
		define('DEDALO_AV_FOLDER'					, '/av');
		# EXTENSION normally mp4, mov
		define('DEDALO_AV_EXTENSION'				, 'mp4');
		# DEDALO_IMAGE_EXTENSIONS_SUPPORTED
		define('DEDALO_AV_EXTENSIONS_SUPPORTED'		, serialize(['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg']));
		# MIME normally video/mp4, quicktime/mov
		define('DEDALO_AV_MIME_TYPE'				, 'video/mp4');
		# TYPE normally h264/AAC
		define('DEDALO_AV_TYPE'						, 'h264/AAC');
		# QUALITY DEDALO_AV_QUALITY_ORIGINAL normally 'original'
		define('DEDALO_AV_QUALITY_ORIGINAL'			, 'original');
		# QUALITY DEFAULT normally '404' (estándar dedalo 72x404)	
		define('DEDALO_AV_QUALITY_DEFAULT'			, '404');
		# QUALITY FOLDERS ARRAY normally '404','audio' (Sort DESC quality) 
		define('DEDALO_AV_AR_QUALITY'				, serialize([DEDALO_AV_QUALITY_ORIGINAL,'1080','720','576','404','240','audio']));
		# EXTENSION normally mp4, mov
		define('DEDALO_AV_POSTERFRAME_EXTENSION'	, 'jpg');
		# FFMPEG PATH
		define('DEDALO_AV_FFMPEG_PATH'				, '/usr/bin/ffmpeg'); # Like /usr/bin/ffmpeg
		# FFMPEG SETTINGS
		define('DEDALO_AV_FFMPEG_SETTINGS'			, DEDALO_LIB_BASE_PATH . '/media_engine/lib/ffmpeg_settings');
		# FAST START PATH
		define('DEDALO_AV_FASTSTART_PATH'			, '/usr/bin/qt-faststart');	# Like /usr/bin/qt-faststart
		# DEDALO_AV_FFPROBE_PATH PATH usualmente /usr/bin/ffprobe
		define('DEDALO_AV_FFPROBE_PATH'				, '/usr/bin/ffprobe'); # Like /usr/bin/ffprobe
		# AV STREAMER
		define('DEDALO_AV_STREAMER'					, NULL);
		# AV DEDALO_AV_WATERMARK_FILE
		define('DEDALO_AV_WATERMARK_FILE'			, DEDALO_MEDIA_BASE_PATH .'/'. DEDALO_AV_FOLDER . '/watermark/watermark.png');
		
		# TEXT_SUBTITLES_ENGINE (tool_subtitles)
		define('TEXT_SUBTITLES_ENGINE'				, DEDALO_LIB_BASE_PATH . '/tools/tool_subtitles');
		# DEDALO_SUBTITLES_FOLDER (tool_subtitles)
		define('DEDALO_SUBTITLES_FOLDER'			, '/subtitles');
		# EXTENSION normally vtt
		define('DEDALO_AV_SUBTITLES_EXTENSION'		, 'vtt');
		
		# DEDALO_AV_RECOMPRESS_ALL
		define('DEDALO_AV_RECOMPRESS_ALL'			, 1); // 1 re-compress all av files uploaded, 0 to only copy av files uploaded (default 0)
		

	#
	# IMAGE MEDIA
		# IMAGE FOLDER normally '/image'
		define('DEDALO_IMAGE_FOLDER'				, '/image');
		# EXTENSION normally jpg
		define('DEDALO_IMAGE_EXTENSION'				, 'jpg');
		# MIME normally image/jpeg
		define('DEDALO_IMAGE_MIME_TYPE'				, 'image/jpeg');
		# TYPE normally jpeg
		define('DEDALO_IMAGE_TYPE'					, 'jpeg');
		# QUALITY ORIGINAL normally 'original'
		define('DEDALO_IMAGE_QUALITY_ORIGINAL'		, 'original');
		# QUALITY DEFAULT normally '1.5MB'
		define('DEDALO_IMAGE_QUALITY_DEFAULT'		, '1.5MB');
		# DEDALO_IMAGE_THUMB_DEFAULT
		define('DEDALO_IMAGE_THUMB_DEFAULT'			, 'thumb');
		# QUALITY FOLDERS ARRAY IN MB		
		define('DEDALO_IMAGE_AR_QUALITY'			, serialize([DEDALO_IMAGE_QUALITY_ORIGINAL,'25MB','6MB','1.5MB','<1MB',DEDALO_IMAGE_THUMB_DEFAULT]));
		# DEDALO_IMAGE_EXTENSIONS_SUPPORTED
		define('DEDALO_IMAGE_EXTENSIONS_SUPPORTED'	, serialize(['jpg','jpeg','png','tif','tiff','bmp','psd','raw']));		
		# PRINT DPI (default 150. Used to calculate print size of images -tool_image_versions-)
		define('DEDALO_IMAGE_PRINT_DPI'				, 150);
		# IMAGE LIB
		define('DEDALO_IMAGE_LIB'					, true);
		# IMG FILE
		define('DEDALO_IMAGE_FILE_URL'				, DEDALO_LIB_BASE_URL . '/media_engine/img.php');
		
		# LIB ImageMagick MAGICK_PATH		
		define('MAGICK_PATH'						, '/usr/bin/'); 	# Like '/usr/bin/';
		define('COLOR_PROFILES_PATH'				, DEDALO_LIB_BASE_PATH . '/media_engine/lib/color_profiles_icc/');

		define('DEDALO_IMAGE_THUMB_WIDTH'			, 102);	// Default 102
		define('DEDALO_IMAGE_THUMB_HEIGHT'			, 57);	// Default 57
		
		# DEDALO_IMAGE_WEB_FOLDER normally '/web' Used to save uploaded files from component_html_text
		define('DEDALO_IMAGE_WEB_FOLDER'			, '/web');

	
	#
	# PDF MEDIA
		# PDF FOLDER normally '/image'
		define('DEDALO_PDF_FOLDER'					, '/pdf');
		# EXTENSION normally pdf
		define('DEDALO_PDF_EXTENSION'				, 'pdf');
		# DEDALO_PDF_EXTENSIONS_SUPPORTED
		define('DEDALO_PDF_EXTENSIONS_SUPPORTED'	, serialize(['pdf']));
		# QUALITY DEFAULT normally 'standar'
		define('DEDALO_PDF_QUALITY_DEFAULT'			, 'standar');
		# QUALITY FOLDERS ARRAY					
		define('DEDALO_PDF_AR_QUALITY'				, serialize([DEDALO_PDF_QUALITY_DEFAULT]));
		# MIME normally application/pdf
		define('DEDALO_PDF_MIME_TYPE'				, 'application/pdf');
		# TYPE normally jpeg
		define('DEDALO_PDF_TYPE'					, 'pdf');
		# DEDALO_PDF_THUMB_DEFAULT
		define('DEDALO_PDF_THUMB_DEFAULT'			, 'thumb');
		
		# DEDALO_PDF_RENDERER (daemon for generate pdf from html files)
		define('DEDALO_PDF_RENDERER'				, '/usr/bin/wkhtmltopdf');	# Like '/usr/bin/wkhtmltopdf'

		# PDF_AUTOMATIC_TRANSCRIPTION_ENGINE (daemon for generate text files from pdf files)
		define('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE'	, '/usr/bin/pdftotext');	# Like '/usr/bin/pdftotext'
		
	
	#
	# HTML_FILES
		define('DEDALO_HTML_FILES_FOLDER'			, '/html_files');
		define('DEDALO_HTML_FILES_EXTENSION'		, 'html');


	#
	# SVG MEDIA
		# SVG FOLDER normally '/svg'
		define('DEDALO_SVG_FOLDER'				, '/svg');
		# EXTENSION normally svg
		define('DEDALO_SVG_EXTENSION'			, 'svg');
		# MIME normally image/svg+xml
		define('DEDALO_SVG_MIME_TYPE'			, 'image/svg+xml');
		# DEDALO_SVG_EXTENSIONS_SUPPORTED
		define('DEDALO_SVG_EXTENSIONS_SUPPORTED', serialize( array('svg') ));



################################################################
# UPLOADER CONFIG
	define('DEDALO_UPLOADER_DIR'			, DEDALO_ROOT 		. '/lib/jquery/jQuery-File-Upload');
	define('DEDALO_UPLOADER_URL'			, DEDALO_ROOT_WEB	. '/lib/jquery/jQuery-File-Upload');	
	


################################################################
# GEO LOCATION
	define('DEDALO_GEO_PROVIDER'			, 'VARIOUS');	# OSM, ARCGIS, GOOGLE, VARIOUS, ARCGIS



################################################################
# LOADER (AUTO LOAD CALLED CLASSES)
	include(DEDALO_LIB_BASE_PATH.'/config/class.loader.php');



################################################################
# MEDIA ENTITY
	# DEDALO_ENTITY_MEDIA_AREA_TIPO = remove the Real sections from menu ALL sections
	define('DEDALO_ENTITY_MEDIA_AREA_TIPO'			, '');
	# DEDALO_ENTITY_MENU_SKIP_TIPOS = skip the array of tipos but walk the childrens, used for agrupations that don't want see into the menu "Oral History" "list of values"...	
	define('DEDALO_ENTITY_MENU_SKIP_TIPOS'			, serialize( array()));



################################################################
# DEDALO_TEST_INSTALL
# If true, check current admin user password on login page
	define('DEDALO_TEST_INSTALL', true);


################################################################
# DEDALO_SECTION_ID_TEMP : Name / prefix of section_id temporals used to store special sections in memory or session
	define('DEDALO_SECTION_ID_TEMP', 'tmp');



################################################################
# TOOLS VARS
	# TOOL EXPORT
	define('DEDALO_TOOL_EXPORT_FOLDER_PATH',	DEDALO_MEDIA_BASE_PATH . '/export/files');
	define('DEDALO_TOOL_EXPORT_FOLDER_URL' ,	DEDALO_MEDIA_BASE_URL  . '/export/files');
	# TOOL IMPORT
	define('DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH',	DEDALO_MEDIA_BASE_PATH . '/import/files');



################################################################
# LOCK_COMPONENTS
	# Lock and unlock components to avoid replacement data when more than one user edit the same component
	define('DEDALO_LOCK_COMPONENTS', false);	# Default (bool)false



################################################################
# NOTIFICATIONS
	# Send notifications to user browser. E.g. Current lock components..
	define('DEDALO_NOTIFICATIONS'			, false);
	define('DEDALO_NODEJS'					, '/usr/local/bin/node');
	define('DEDALO_NODEJS_PM2'				, '/usr/local/bin/pm2');



################################################################
# STRUCTURE CSS
	# Aditional css precessed from structure or created in aditional external files
	define('DEDALO_STRUCTURE_CSS', true);
	define('DEDALO_ADITIONAL_CSS', false);



################################################################
# DIFFUSION DOMAIN
	define('DEDALO_DIFFUSION_DOMAIN'			, 'default');
	define('DEDALO_DIFFUSION_RESOLVE_LEVELS'	, 2);
	define('DEDALO_PUBLICATION_ALERT'			, false);


################################################################
# DIFFUSION_CUSTOM
# Otional custom class to maniputate diffusion options
	define('DIFFUSION_CUSTOM'					, false);



################################################################
# DEDALO_PROTECT_MEDIA	
	define('DEDALO_PROTECT_MEDIA_FILES'			, false);



################################################################
# DEDALO_FILTER_USER_RECORDS_BY_ID
# Activate user records filter restriction
	define('DEDALO_FILTER_USER_RECORDS_BY_ID'	, false);



################################################################
# ENCRYPTION_MODE. If not is defined, will be calculated from current Dédalo data version
	define('ENCRYPTION_MODE', 'openssl');



################################################################
# REMOTE_STRUCTURE_SERVER_CODE
	define('STRUCTURE_FROM_SERVER'		, true); # bool
	define('STRUCTURE_SERVER_CODE'		, ''); 	 # string like aZdUs7asdasdhRsw4!sp
	define('STRUCTURE_SERVER_URL'		, ''); 	 # string like https://master.render.es/dedalo/lib/dedalo/extras/str_manager/
	define('STRUCTURE_DOWNLOAD_DIR'		, DEDALO_LIB_BASE_PATH . '/backup/backups_structure/srt_download');


################################################################
# API
	# Auth code for acces to rest api server
	define('API_WEB_USER_CODE' , 'not defined'); # string like mJdUs745Ew38Wq


################################################################
# MAINTENACE : maintenance mode active / unactive
	$maintenance_mode = false;
	define('DEDALO_MAINTENANCE_MODE', $maintenance_mode);
	if (DEDALO_MAINTENANCE_MODE) {
		include(DEDALO_LIB_BASE_PATH.'/maintenance/maintenance.php');
	}



################################################################
# NOTICE_TO_ACTIVE_USERS  : Warning to print in all pages to logged users
	$notice = "<b>Warning</b>. In a few minutes the system will shut down about 5 minutes for maintenance updates. <br>
	Please, save the unsaved work and log out as soon as possible. 
	After a few minutes, you can re-login to Dédalo and work again";
	#notice_to_active_users(array('msg'=>$notice, 'mode'=>"warning"));


