<?php
################################################################
# CONSTANTS

	# TIME ZONE : Zona horaria (for backups archive names)
	date_default_timezone_set('Europe/Madrid');
	# SET LOCALE (Spanish for example)
	#setlocale(LC_ALL,'en_EN');
	setlocale(LC_ALL,'es_ES'); 			// For Mac
	#setlocale(LC_ALL, 'es_ES.utf8');	// For Linux
	
	
	// Publication filter optional like "AND publicacion = 'si'"
	#define('PUBLICACION_FILTER_SQL' 	, " ");
	
	// Current lang default. If request get 'lang' overwrite value
	define('WEB_CURRENT_LANG_CODE' 		, !empty($_GET['lang']) ? $_GET['lang'] : 'lg-eng');

	// Current web root folder
	define('__WEB_ROOT__'				, dirname( dirname(__FILE__) ) );	
	
	// Web base url where json data is requested
	#define('__CONTENT_BASE_URL__' 		, 'http://192.168.0.7:8080');
	define('__CONTENT_BASE_URL__' 		, 'http://dedalo4.antropolis.net');

	// JSON data source url
	#define('JSON_TRIGGER_URL' 			, __CONTENT_BASE_URL__.'/dedalo4/lib/dedalo/publication/server_api/json/');
	define('JSON_TRIGGER_URL' 			, __CONTENT_BASE_URL__.'/dedalo/lib/dedalo/publication/server_api/json/');

	// Default table for data request. Util to preview data , etc.
	define('WEB_DEFAULT_TABLE' 			, 'interview');

	// API_WEB_USER_CODE
	#define('API_WEB_USER_CODE' 		, 'aR12asd546asEQW');
	define('API_WEB_USER_CODE' 			, 'antropolis_demo_110317');



	################################################################
	# DEBUG : Application debug config
	// Debug mode active . Set false on production	
	define('SHOW_DEBUG' 				,true);	




################################################################
# REQUIRED FILES

	// API basic functions
	include __WEB_ROOT__ .'/inc/class.json_web_data.php';

	// API basic functions
	include __WEB_ROOT__ .'/inc/core_functions.php';

	// Loader for api general classes
	include __WEB_ROOT__ .'/inc/class.loader.php';


?>