<?php
################################################################
# CONSTANTS	
		
	// Current lang default. If request get 'lang' overwrite value
	define('WEB_CURRENT_LANG_CODE' 		, !empty($_GET['lang']) ? $_GET['lang'] : 'lg-eng');

	// Current web absolute root folder
	define('__WEB_ROOT__'				, dirname( dirname(__FILE__) ) );	
	
	// Web base url where json data is requested
	define('__CONTENT_BASE_URL__' 		, 'http://www.mydomain.com');

	// JSON data source url in remote server
	define('JSON_TRIGGER_URL' 			, __CONTENT_BASE_URL__.'/dedalo/lib/dedalo/publication/server_api/json/');

	// Default table for data request. Util to preview data , etc.
	define('WEB_DEFAULT_TABLE' 			, 'interview');

	// API_WEB_USER_CODE
	define('API_WEB_USER_CODE' 			, 'kR12ajy3t46asEQW');



################################################################
# DEBUG : Application debug config
	// Debug mode active . Set false on production	
	define('SHOW_DEBUG' 				,false);



################################################################
# REQUIRED FILES

	// API basic functions
	include __WEB_ROOT__ .'/inc/class.json_web_data.php';

	// API basic functions
	include __WEB_ROOT__ .'/inc/core_functions.php';

	// Loader for api general classes
	include __WEB_ROOT__ .'/inc/class.loader.php';



?>