<?php
################################################################
################### DEDALO VERSION V4 ##########################
################################################################
/*
	BAJO LICENCIA PÚBLICA GNU
	http://www.gnu.org/licenses/licenses.es.html
	Versión 4, 23 de Junio de 2015
	
	© Fundación MOMO 
	Juan Francisco Onielfa Veneros
	Alejandro Peña Carbonell
	http://www.fmomo.org/
	http://dedalo.antropolis.net/
*/


################################################################
# DEDALO 4 MAIN VARS	
	define('DEDALO_HOST'			, $_SERVER['HTTP_HOST'] );
	
	# Dedalo paths
	define('DEDALO_ROOT'			, dirname(dirname(dirname(dirname(__FILE__)))));
	define('DEDALO_ROOT_WEB'		, '/'. substr(substr($_SERVER["REQUEST_URI"],1), 0,  strpos(substr($_SERVER["REQUEST_URI"],1), "/")));
	
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



################################################################
# LOG AND ERRORS : STORE APPLICATION DATA INFO AND ERRORS

	# Log data	
	require(DEDALO_LIB_BASE_PATH . '/logger/class.logger.php');
	define('LOGGER_LEVEL', logger::ERROR);

	# Log messages in page
	$log_messages = NULL;
	global $log_messages;		
	
	# APP : LOG APPLICATION INFO IN DB
	#logger::register('activity'	, 'mysql://auto:auto@auto:3306/log_data?table=log_data');
	logger::register('activity'	, 'activity://auto:auto@auto:3306/log_data?table=matrix_activity');
	# Store in logger static array var
	logger::$obj['activity']	= logger::get_instance('activity');		
	
	# ERROR : LOG APLICATION ERRORS IN FILE
	# Logs dir (Maintain this directory unaccessible for security)
	define('DEDALO_LOGS_DIR'			, DEDALO_LIB_BASE_PATH . '/logs');	# !! In production mode log MUST BE out of site

	logger::register('error', 'file://'.DEDALO_LOGS_DIR.'/dedalo_errors.log');	# In production mode log MUST BE out of site
	
	# Store in logger static array var
	logger::$obj['error']	= logger::get_instance('error');




################################################################
# CACHE MANAGER
	define('DEDALO_CACHE_MANAGER', false );	# redis / memcached / zebra_db / false
	if(DEDALO_CACHE_MANAGER) {
		define('DEDALO_CACHE_MANAGER_DB', 'cache_'.substr(DEDALO_HOST, 0,-5) );
		require('cache_manager.php');
	}



################################################################
# SESSION 
	# LIFETIME
	# Set max duration of dedalo user session
	# Use ini directive to set session.gc_maxlifetime (Garbage Collection lifetime)
	# Use session_cache_expire to set duration of session 
	# Set duration max of session data in hours (default 5 hours)
	# Set before session start
	if(!isset($session_duration_hours)) $session_duration_hours = 5;
	ini_set( 'session.gc_maxlifetime', intval($session_duration_hours*3600) );	# in secs (*3600)	Defaul php usually : 1440
	session_cache_expire( intval($session_duration_hours*60) );	# in minues (*60)					Defaul php usually : 180	

	if(!isset($_SESSION)) session_start();



################################################################
# CORE REQUIRE
	# BASIC FUNCTIONS
	require('core_functions.php');
	# VERSION
	require('version.inc');
	


################################################################
# DB : CONEXION TO DATABASE		
	require('config4_db.php');
	define('SLOW_QUERY_MS'	, 1200);



################################################################
# BACKUP : Automatic backups control
	define('DEDALO_BACKUP_ON_LOGIN'	, true);



################################################################
# LANG
	# APPLICATION LANG : Dedalo application lang
	define('DEDALO_APPLICATION_LANGS'			, serialize( array(
													"lg-spa"=> "Castellano",
													"lg-cat"=> "Català",
													"lg-eus"=> "Euskara",
													"lg-eng"=> "English",
													"lg-fra"=> "French",
													)));
	define('DEDALO_APPLICATION_LANGS_DEFAULT'	, 'lg-spa');
	define('DEDALO_APPLICATION_LANG'			, fix_cascade_config4_var('dedalo_application_lang',DEDALO_APPLICATION_LANGS_DEFAULT));
	
	# DATA LANG : Dedalo data lang
	define('DEDALO_DATA_LANG_DEFAULT'			, DEDALO_APPLICATION_LANG);
	define('DEDALO_DATA_LANG'					, fix_cascade_config4_var('dedalo_data_lang',DEDALO_DATA_LANG_DEFAULT));
	define('DEDALO_DATA_NOLAN'					, 'lg-nolan');

	# Projects langs
	define('DEDALO_PROJECTS_DEFAULT_LANGS'		, serialize(array(
													'lg-spa',
													'lg-cat',
													'lg-eus',
													'lg-eng',
													'lg-fra',
													)));

	# TRANSLATOR
	define('DEDALO_TRANSLATOR_URL'				, '');	# Apertium, Google translator, etc..



################################################################
# DEDALO 4 DEFAULT CONFIG VALUES
	# Dedalo str tipos
	require('dd_tipos.php');

	#
	# DEDALO_PREFIX_TIPOS
	define('DEDALO_PREFIX_TIPOS', serialize( array('dd','rsc','oh','ich') ));

	# Fallback section
	define('MAIN_FALLBACK_SECTION'				,'oh1');		# go after login (tipo inventory)
	define('DEDALO_DEFAULT_PROJECT'				, 1);
	# NUMERICAL MATRIX VALUES OS LIST OF VALUES 'SI/NO' : USED IN LOGIN SECUENCE BEFORE ENTER TO SYSTEM	
	define('NUMERICAL_MATRIX_VALUE_YES'			, 1);
	define('NUMERICAL_MATRIX_VALUE_NO'			, 2);
	# PERMISSIONS DEDALO DEFAULT ROOT
	define('DEDALO_PERMISSIONS_ROOT'			, 1);
	# MAX ROWS . ROWS LIST MAX RECORDS PER PAGE
	define('DEDALO_MAX_ROWS_PER_PAGE'			, 10);
	

################################################################
# DEBUG : Application debug config
	$show_debug = false;
	/*
	if(
		# SUPERUSER IS LOGGED
		(
			isset($_SESSION['dedalo4']['auth']['user_id'])
			&& 	 ($_SESSION['dedalo4']['auth']['user_id']==DEDALO_SUPERUSER)
		)		
	) {
		$show_debug = true;
	}
	*/
	define('SHOW_DEBUG'				, $show_debug);

	# ERROR : Handler class
	require('class.Error.php');




################################################################
# LIBS PATH
	# JQUERY JS LIB
	define('JQUERY_LIB_URL_JS'		, DEDALO_ROOT_WEB . '/lib/jquery/jquery-2.1.4.min.js');
	# JQUERY UI
	define('JQUERY_UI_URL_JS'		, DEDALO_ROOT_WEB . '/lib/jquery/jquery-ui-1.11.2/jquery-ui.min.js');
	define('JQUERY_UI_URL_CSS'		, DEDALO_ROOT_WEB . '/lib/jquery/jquery-ui-1.11.2/jquery-ui.min.css');
	
	define('JQUERY_TABLESORTER_JS'	, DEDALO_ROOT_WEB . '/lib/jquery/jquery-tablesorter/jquery.tablesorter.min.js');

	# Text editor
	define('TEXT_EDITOR_URL_JS'		, DEDALO_ROOT_WEB . '/lib/tinymce/js/tinymce/tinymce.min.js');

	# PAPER
	define('PAPER_JS_URL'			, DEDALO_ROOT_WEB .'/lib/paper/dist/paper-full.min.js');

	# D3
	define('D3_URL_JS'				, DEDALO_ROOT_WEB.'/lib/nvd3/lib/d3.v3.min.js');
	# NVD3
	define('NVD3_URL_JS'			, DEDALO_ROOT_WEB .'/lib/nvd3/nv.d3.min.js');

	# CDN USE BOOL
	define('USE_CDN', false);



################################################################
# MEDIA CONFIG
	# MEDIA_BASE PATH
	define('DEDALO_MEDIA_BASE_PATH'		, DEDALO_ROOT 		. '/media');
	define('DEDALO_MEDIA_BASE_URL'		, DEDALO_ROOT_WEB 	. '/media');
	define('DEDALO_MEDIA_COLLECTION_PATH', false);
	

	# AV MEDIA
		# AV FOLDER normally '/media/av'
		define('DEDALO_AV_FOLDER'					, '/av');
		# EXTENSION normally mp4, mov
		define('DEDALO_AV_EXTENSION'				, 'mp4');
		# DEDALO_IMAGE_EXTENSIONS_SUPPORTED
		define('DEDALO_AV_EXTENSIONS_SUPPORTED'		, serialize( array('mp4') ));
		# MIME normally video/mp4, quicktime/mov
		define('DEDALO_AV_MIME_TYPE'				, 'video/mp4');
		# TYPE normally h264/AAC
		define('DEDALO_AV_TYPE'						, 'h264/AAC');
		# QUALITY FOLDERS ARRAY normally '404','audio' (Sort DESC quality) 
		define('DEDALO_AV_AR_QUALITY'				, serialize( array('1080','720','576','404','240','audio') ));
		# QUALITY DEFAULT normally '404' (estándar dedalo 72x404)	
		define('DEDALO_AV_QUALITY_DEFAULT'			, '404');
		# EXTENSION normally mp4, mov
		define('DEDALO_AV_POSTERFRAME_EXTENSION'	, 'jpg');
		# FFMPEG PATH usualmente /usr/local/bin/ffmpeg
		define('DEDALO_AV_FFMPEG_PATH'				, '/usr/local/bin/ffmpeg');			# Like '/usr/local/bin/ffmpeg'
		# FFMPEG SETTINGS
		define('DEDALO_AV_FFMPEG_SETTINGS'			, DEDALO_LIB_BASE_PATH . '/media_engine/lib/ffmpeg_settings');
		# FAST START PATH usualmente /usr/local/bin/qt-faststart
		define('DEDALO_AV_FASTSTART_PATH'			, '/usr/local/bin/qt-faststart');	# Like '/usr/local/bin/qt-faststart';
		# AV STREAMER
		define('DEDALO_AV_STREAMER'					, NULL);
		# AV STREAMER
		define('DEDALO_AV_WATERMARK_FILE'			, DEDALO_MEDIA_BASE_PATH .'/'. DEDALO_AV_FOLDER . '/watermark/watermark.png');

	# IMAGE MEDIA
		# IMAGE FOLDER normally '/image'
		define('DEDALO_IMAGE_FOLDER'				, '/image');
		# EXTENSION normally jpg
		define('DEDALO_IMAGE_EXTENSION'				, 'jpg');
		# MIME normally image/jpeg
		define('DEDALO_IMAGE_MIME_TYPE'				, 'image/jpeg');
		# DEDALO_IMAGE_EXTENSIONS_SUPPORTED
		define('DEDALO_IMAGE_EXTENSIONS_SUPPORTED'	, serialize( array('jpg','jpeg','png','tif','tiff','bmp','psd') ));
		# TYPE normally jpeg
		define('DEDALO_IMAGE_TYPE'					, 'jpeg');
		# QUALITY FOLDERS ARRAY IN MB		
		define('DEDALO_IMAGE_AR_QUALITY'			, serialize( array('>100MB','25MB','6MB','1.5MB','<1MB','thumb') ));		
		# QUALITY DEFAULT normally '1.5MB'
		define('DEDALO_IMAGE_QUALITY_DEFAULT'		, '1.5MB');
		# DEDALO_IMAGE_THUMB_DEFAULT
		define('DEDALO_IMAGE_THUMB_DEFAULT'			, 'thumb');
		# PRINT DPI (default 150. Used to calculate print size of images -tool_image_versions-)
		define('DEDALO_IMAGE_PRINT_DPI'				, 150);
		# IMAGE LIB
		define('DEDALO_IMAGE_LIB'					, true);
		# IMG FILE
		define('DEDALO_IMAGE_FILE_URL'				, DEDALO_LIB_BASE_URL . '/media_engine/img.php');
		
		# LIB ImageMagick MAGICK_PATH		
		define('MAGICK_PATH'						, '/usr/bin/'); 	# Like '/usr/bin/';
		define('COLOR_PROFILES_PATH'				, DEDALO_LIB_BASE_PATH . '/media_engine/lib/color_profiles_icc/');

	
	# PDF MEDIA
		# PDF FOLDER normally '/image'
		define('DEDALO_PDF_FOLDER'					, '/pdf');
		# EXTENSION normally pdf
		define('DEDALO_PDF_EXTENSION'				, 'pdf');
		# DEDALO_PDF_EXTENSIONS_SUPPORTED
		define('DEDALO_PDF_EXTENSIONS_SUPPORTED'	, serialize( array('pdf') ));
		# QUALITY FOLDERS ARRAY					
		define('DEDALO_PDF_AR_QUALITY'				, serialize( array('standar') ));
		# QUALITY DEFAULT normally 'standar'
		define('DEDALO_PDF_QUALITY_DEFAULT'			, 'standar');
		# MIME normally application/pdf
		define('DEDALO_PDF_MIME_TYPE'				, 'application/pdf');
		# TYPE normally jpeg
		define('DEDALO_PDF_TYPE'					, 'pdf');
		
		# DEDALO_PDF_RENDERER (daemon generador de pdf a partir de html)
		define('DEDALO_PDF_RENDERER'				, '/usr/local/bin/wkhtmltopdf');	# Like '/usr/local/bin/wkhtmltopdf'

		# PDF_AUTOMATIC_TRANSCRIPTION_ENGINE (daemon generador de ficheros de texto a partir de pdf)
		define('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE'	, '/usr/local/bin/pdftotext');		# Like '/usr/local/bin/pdftotext'
		
	
	# HTML_FILES
		define('DEDALO_HTML_FILES_FOLDER'			, '/html_files');
		define('DEDALO_HTML_FILES_EXTENSION'		, 'html');
		


################################################################
# UPLOADER CONFIG

	define('DEDALO_UPLOADER_DIR'			, DEDALO_ROOT 		. '/lib/jquery/jQuery-File-Upload');
	define('DEDALO_UPLOADER_URL'			, DEDALO_ROOT_WEB	. '/lib/jquery/jQuery-File-Upload');	
	

################################################################
# GEO LOCATION
	define('DEDALO_GEO_PROVIDER'			, 'VARIOUS');	# OSM, ARCGIS, GOOGLE, VARIOUS, ARCGIS


################################################################
# LOADER (AUTO LOAD CALLED CLASSES)
	require('class.loader.php');

################################################################
# MEDIA ENTITY
# DEDALO_ENTITY_MEDIA_AREA_TIPO = remove the Real sections from menu ALL sections
# DEDALO_ENTITY_MENU_SKIP_TIPOS = skip the array of tipos but walk the childrens, used for agrupations that don't want see into the menu "Oral History" "list of values"...
	define('DEDALO_ENTITY_MEDIA_AREA_TIPO'			, '');
	define('DEDALO_ENTITY_MENU_SKIP_TIPOS'			, serialize( array()));


# DEDALO_TEST_INSTALL
define('DEDALO_TEST_INSTALL', true);
?>