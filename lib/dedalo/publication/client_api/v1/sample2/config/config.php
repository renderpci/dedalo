<?php 
# config

# CUSTOM Development working vars
	switch ($_SERVER['SERVER_NAME']) {
		case 'cedis':
			$JSON_TRIGGER_URL 	= 'http://dedalo.cedis.fu-berlin.de/dedalo/lib/dedalo/publication/server_api/v1/json/';
			$API_WEB_USER_CODE 	= '85df5s$dKlw8adQdp€';
			$DEFAULT_LANG 		= 'lg-ell';
			$__WEB_BASE_URL__ 	= 'http://dedalo.cedis.fu-berlin.de';
			break;
		case 'mdcat':
			#$JSON_TRIGGER_URL 	= 'https://dedalo4.bancmemorial.extranet.gencat.cat/dedalo/lib/dedalo/publication/server_api/v1/json/';
			$JSON_TRIGGER_URL 	= 'http://mdcat:8080/dedalo4/lib/dedalo/publication/server_api/v1/json/';
			$API_WEB_USER_CODE 	= '85df5s$4KueñwQw5O2p4J1G9';
			$DEFAULT_LANG 		= 'lg-cat';
			$__WEB_BASE_URL__ 	= 'https://dedalo4.bancmemorial.extranet.gencat.cat';
			break;
		case 'mupreva':		
			$JSON_TRIGGER_URL 	= 'http://mupreva:8080/dedalo4/lib/dedalo/publication/server_api/v1/json/';
			$API_WEB_USER_CODE 	= 'lsi8wM5s$4KueñwkoPwgs';
			$DEFAULT_LANG 		= 'lg-spa';
			$__WEB_BASE_URL__ 	= 'http://www.museodeprehistoria.es';
			break;
		case '192.168.0.7':
			$JSON_TRIGGER_URL 	= 'http://192.168.0.7:8080/dedalo4/lib/dedalo/publication/server_api/v1/json/';
			$API_WEB_USER_CODE 	= '23df5s$85fKdw9wQ679z';
			$DEFAULT_LANG 		= 'lg-eng';
			$__WEB_BASE_URL__ 	= 'http://192.168.0.7:8080';
			break;
		default:
			# code...
			break;
	}



################################################################
	# API CONFIG
	
	# JSON_TRIGGER_URL data source url
	define('JSON_TRIGGER_URL', $JSON_TRIGGER_URL);
	
	# API_WEB_USER_CODE
	# Verification user code (must be identical in config of client and server)
	define('API_WEB_USER_CODE', $API_WEB_USER_CODE);

	# WEB_CURRENT_LANG_CODE
	# If received lang use it, else use default lg-ell (greek)
	define('WEB_CURRENT_LANG_CODE', isset($_GET['lang']) ? $_GET['lang'] : $DEFAULT_LANG);

	# SHOW_DEBUG
	# Show / hide debug messages
	define('SHOW_DEBUG', true);
	
	# JSON_WEB_DATA COLECTOR
	# PHP version http request manager (via CURL)
	include(dirname(dirname(__FILE__)) . '/api/class.json_web_data.php');



################################################################
# SITE CONFIG

	# WEB_VERSION
	define('WEB_VERSION', '0.0.1');

	# __WEB_BASE_URL__ . Absolute url base to target web
	# Used to build absolute calls to elements
	define('__WEB_BASE_URL__', $__WEB_BASE_URL__);

	# __WEB_ROOT_WEB__ . Relative url base to current web initial folder
	$base  = parse_url($_SERVER["REQUEST_URI"])['path'];
	$base  = substr($base,0,-1); # Remove last /
	$base2 = substr( $base, 0, strrpos($base, '/') );
	$base2 = '/dedalo4/lib/dedalo/publication/client_api/v1/sample2';
	#var_dump($base2);
	define('__WEB_ROOT_WEB__', $base2);	

	# __WEB_BASE_PATH__
	# Used to build absolute calls to elements
	define('__WEB_BASE_PATH__', dirname(dirname(__FILE__)));

	# Files
	#include(__WEB_BASE_PATH__ . '/common/core.php');
	include(__WEB_BASE_PATH__ . '/common/class.common.php');
	include(__WEB_BASE_PATH__ . '/page/class.page.php');



################################################################
# WEB CONFIG
	switch ($_SERVER['SERVER_NAME']) {	
		case 'mupreva':		
			$WEB_MENU_TABLE 	= 'ts_web_yacimientos';
			$WEB_TEMPLATE_MAP 	= __WEB_BASE_PATH__ .'/config/template_map.js';
			break;	
		default:
			$WEB_MENU_TABLE = null;
			break;
	}
	define('WEB_MENU_TABLE', $WEB_MENU_TABLE);

	# Web template file json
	define('WEB_TEMPLATE_MAP', __WEB_BASE_PATH__ .'/config/config_template_map.json');






