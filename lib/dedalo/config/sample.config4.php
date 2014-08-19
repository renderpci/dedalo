<?php
################################################################
################### DEDALO VERSION V4 ##########################
################################################################
/*
	BAJO LICENCIA PÚBLICA GNU
	http://www.gnu.org/licenses/licenses.es.html
	Versión 4, 14 de marzo de 2012
	
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
	define('DEDALO_ROOT'			, dirname(dirname(dirname(dirname(__FILE__)))));		#echo DEDALO_ROOT ;
	define('DEDALO_ROOT_WEB'		, '/'. substr(substr($_SERVER["REQUEST_URI"],1), 0,  strpos(substr($_SERVER["REQUEST_URI"],1), "/")));
	
	define('DEDALO_LIB_BASE_PATH'	, dirname( dirname(__FILE__) ));
	define('DEDALO_LIB_BASE_URL'	, DEDALO_ROOT_WEB . '/'. basename(dirname(DEDALO_LIB_BASE_PATH)) . '/'. basename(DEDALO_LIB_BASE_PATH) );
	
	# Dedalo informacion
	#define('DEDALO_INFORMACION'		, 'la Rana CantoRa baila un baile nUevo +- n`Rño');
	define('DEDALO_SALT_STRING'		, 'dedalo_cuatro');

	# TIME ZONE : Zona horaria (for backups archive names)
	define('DEDALO_TIMEZONE'		, 'Europe/Madrid');	date_default_timezone_set(DEDALO_TIMEZONE);
	# SET LOCALE (Spanish for example)
	setlocale(LC_ALL,'es_ES');

	# ICONV ENCODING
	#iconv_set_encoding("internal_encoding", "UTF-8");
	#iconv_set_encoding("output_encoding", "UTF-8");



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
	ini_set( 'session.gc_maxlifetime', intval($session_duration_hours*3600) );	#in secs (*3600)	Defaul php usually : 1440
	session_cache_expire( intval($session_duration_hours*60) );	#in minues (*60)					Defaul php usually : 180	

	if(!isset($_SESSION)) session_start();



################################################################
# CORE REQUIRE
	# BASIC FUNCTIONS
	require('core_functions.php');
	# VERSION
	require('version.inc');
	


################################################################
# DB : CONEXIÓN CON LA BASE DE DATOS MYSQL		
	require('config4_db.php');
	define('SLOW_QUERY_MS'	, 60);



################################################################
# BACKUP : Automatic backups control
	# DEDALO_BACKUP_ON_LOGIN : true / false
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
	define('DEDALO_DATA_LANG_DEFAULT'			, 'lg-spa');
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
	define('DEDALO_TRANSLATOR_URL'				, 'http://babel.antropolis.net/babel_engine/');	# default Babel: http://babel.antropolis.net/babel_engine/




################################################################
# DEDALO 4 DEFAULT CONFIG VALUES
	# Dedalo str tipos
	require('dd_tipos.php');

	# Fallback section
	define('MAIN_FALLBACK_SECTION'				, 'dd335');		# after login tipo inventario : 'dd229'dd13
	define('DEFAULT_PROJECT'					, 7);
	# NUMERICAL MATRIX VALUES OS LIST OF VALUES 'SI/NO' : USED IN LOGIN SECUENCE BEFORE ENTER TO SYSTEM
	# TODO: FIXED VALUES (NOT FOR MATRIX OR STRUCTURE)
	define('NUMERICAL_MATRIX_VALUE_YES'			, 1);	#52
	define('NUMERICAL_MATRIX_VALUE_NO'			, 3);	#54
	# PERMISOS POR DEFECTO PARA DEDALO
	$_SESSION['auth4']['permissions_root']		= 1 ;
	# MAX ROWS . LISTADOS MAX REGISTROS POR PÁGINA
	if(isset($_REQUEST['max_rows'])) $_SESSION['config4']['max_rows'] = $_REQUEST['max_rows'];
	if(empty($_SESSION['config4']['max_rows']))
	$_SESSION['config4']['max_rows']			= 10 ;		# SEARCH MAX PER PAGE COMPONENT
	# SKIN	
	$_SESSION['config4']['css_skin'] 			= NULL;		# 'lg21710' ;


################################################################
# DEBUG : Application debug config
	$show_debug = FALSE;
	if(
		# SUPERUSER IS LOGGED
		(
			isset($_SESSION['auth4']['userID_matrix'])
			&& 	 ($_SESSION['auth4']['userID_matrix']==DEDALO_SUPERUSER)
		)		
	) {
		$show_debug = true;
	}
	define('SHOW_DEBUG'				, $show_debug);

	# ERROR : Handler class
	require('class.Error.php');


################################################################
# LIBS PATH
	# JQUERY JS LIB
	define('JQUERY_LIB_URL_JS'			, DEDALO_ROOT_WEB . '/lib/jquery/jquery-2.1.0.min.js');	
	# JQUERY UI
	define('JQUERY_UI_URL_JS'			, DEDALO_ROOT_WEB . '/lib/jquery/jquery-ui-1.10.4/js/jquery-ui-1.10.4.min.js');
	define('JQUERY_UI_URL_CSS'			, DEDALO_ROOT_WEB . '/lib/jquery/jquery-ui-1.10.4/css/ui-lightness/jquery-ui-1.10.4.min.css');

	define('JQUERY_TABLESORTER_JS'		, DEDALO_ROOT_WEB . '/lib/jquery/jquery-tablesorter/jquery.tablesorter.min.js');
	# Text editor
	define('TEXT_EDITOR_URL_JS'			, DEDALO_ROOT_WEB . '/lib/tinymce/js/tinymce/tinymce.min.js');



################################################################
# MEDIA CONFIG

	define('DEDALO_MEDIA_BASE_PATH'		, DEDALO_ROOT 		. '/media');
	define('DEDALO_MEDIA_BASE_URL'		, DEDALO_ROOT_WEB 	. '/media');
	

	# AV MEDIA
		# AV FOLDER normally '/media/av'
		define('DEDALO_AV_FOLDER'					, '/av');
		# EXTENSION normally mp4, mov
		define('DEDALO_AV_EXTENSION'				, 'mp4');
		# DEDALO_IMAGE_EXTENSIONS_SUPPORTED
		define('DEDALO_AV_EXTENSIONS_SUPPORTED'		, serialize( array('mp4') ));	# NO habilitar mas de 1 extensión de momento!!	#'mp4','mov','mpg','mpeg'
		# MIME normally video/mp4, quicktime/mov
		define('DEDALO_AV_MIME_TYPE'				, 'video/mp4');
		# TYPE normally h264/AAC
		define('DEDALO_AV_TYPE'						, 'h264/AAC');
		# QUALITY FOLDERS ARRAY normally '404','audio' ORDENAR DE MAYOR A MENOR CALIDAD
		define('DEDALO_AV_AR_QUALITY'				, serialize( array('1080','720','576','404','240','audio') ));
		# QUALITY DEFAULT normally '404' (estándar dedalo 72x404)	
		define('DEDALO_AV_QUALITY_DEFAULT'			, '404');
		# EXTENSION normally mp4, mov
		define('DEDALO_AV_POSTERFRAME_EXTENSION'	, 'jpg');
		# FFMPEG PATH usualmente /usr/local/bin/ffmpeg
		define('DEDALO_AV_FFMPEG_PATH'				, '/usr/local/bin/ffmpeg');	#'/Applications/ffmpeg'); #	
		# FFMPEG SETTINGS
		define('DEDALO_AV_FFMPEG_SETTINGS'			, DEDALO_LIB_BASE_PATH . '/media_engine/lib/ffmpeg_settings');
		# FAST START PATH usualmente /usr/local/bin/qt-faststart
		define('DEDALO_AV_FASTSTART_PATH'			, '/usr/local/bin/qt-faststart');	#'/Applications/qt-faststart';
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
		define('DEDALO_IMAGE_LIB'					, true);#gd_info()['JPEG Support']);	#dump(DEDALO_IMAGE_LIB,'DEDALO_IMAGE_LIB');	
		# IMG FILE
		define('DEDALO_IMAGE_FILE_URL'				, DEDALO_LIB_BASE_URL . '/media_engine/img.php');
		
		# LIB ImageMagick MAGICK_PATH		
		define('MAGICK_PATH'						, '/usr/local/bin/');
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

		
?>