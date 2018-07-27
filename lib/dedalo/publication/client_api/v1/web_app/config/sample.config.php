<?php 
# config Dédalo API client



# Used to build absolute calls to elements
#define('__WEB_BASE_PATH__', __WEB_BASE_PATH__);



################################################################
# CUSTOM Development working vars (API CLIENT)
	$WEB_ENTITY = $_SERVER['SERVER_NAME'];	
	define('WEB_ENTITY',$WEB_ENTITY);
	
	
	$JSON_TRIGGER_URL 	= 'http://entity:80/dedalo4/lib/dedalo/publication/server_api/v1/json/';
	$API_WEB_USER_CODE 	= 'XXXXXXXXXXXX';
	$DEFAULT_LANG 		= 'lg-spa';
	$__WEB_BASE_URL__ 	= '';



################################################################
# API CONFIG
	
	# JSON_TRIGGER_URL data source url
	define('JSON_TRIGGER_URL', $JSON_TRIGGER_URL);
	
	# API_WEB_USER_CODE
	# Verification user code (must be identical in config of client and server)
	define('API_WEB_USER_CODE', $API_WEB_USER_CODE);

	# COMMON core functions
	include(__WEB_BASE_PATH__ . '/common/class.common.php');

	# WEB_CURRENT_LANG_CODE
	# If received lang use it, else use default lg-ell (greek)
	if (session_status() !== PHP_SESSION_ACTIVE) {
		session_name('web_'.WEB_ENTITY);
		session_start();
	}
	# Lang cascade set
	define('WEB_DEFAULT_LANG_CODE', $DEFAULT_LANG);
	if (isset($_GET['lang'])) {
		$lang = $_GET['lang'];
		$_SESSION['web']['lang'] = $lang;
	}elseif (isset($_SESSION['web']['lang'])) {
		$lang = $_SESSION['web']['lang'];
	}else{
		$lang = $DEFAULT_LANG;
	}
	if (strpos($lang, 'lg-')===false) {
		$lang = lang2iso3($lang);
	}
	define('WEB_CURRENT_LANG_CODE', $lang);
	include(__WEB_BASE_PATH__ . '/lang/'.WEB_ENTITY.'/'.WEB_CURRENT_LANG_CODE.'.php');
		

	# SHOW_DEBUG
	# Show / hide debug messages
	$SHOW_DEBUG = false;
	define('SHOW_DEBUG', $SHOW_DEBUG);

	
	# JSON_WEB_DATA COLECTOR
	# PHP version http request manager (via CURL)
	include(__WEB_BASE_PATH__ . '/api/class.json_web_data.php');



################################################################
# SITE CONFIG

	# WEB_VERSION
	define('WEB_VERSION', '0.0.3e');

	# __WEB_BASE_URL__ . Absolute url base to target web
	# Used to build absolute calls to elements
	define('__WEB_BASE_URL__', $__WEB_BASE_URL__);

	# __WEB_ROOT_WEB__ . Relative url base to current web initial folder	
	$base = '/web_app';
	
	#echo "$base <br> $base2";	
	define('__WEB_ROOT_WEB__', $base);
	#error_log("__WEB_ROOT_WEB__: ".__WEB_ROOT_WEB__);	

	# WEB_DISPATCH_DIR
	define('WEB_DISPATCH_DIR', 'web');

	# __WEB_TEMPLATE_WEB_
	define('__WEB_TEMPLATE_WEB__', __WEB_ROOT_WEB__ .'/'. WEB_DISPATCH_DIR . '/tpl/' . WEB_ENTITY );
		
	# Files	
	include(__WEB_BASE_PATH__ . '/page/class.page.php');



################################################################
# WEB CONFIG	
	$WEB_MENU_TABLE 				 = 'ts_web';
	$WEB_MENU_SECTION_TIPO 			 = '';
	$WEB_MENU_PARENT 				 = '';
	$WEB_TEMPLATE_MAP 				 = __WEB_BASE_PATH__ .'/config/template_maps/'.WEB_ENTITY;
	$WEB_TEMPLATE_MAP_DEFAULT_SOURCE = 'db'; // file | db
	$WEB_HOME_PATH 					 = 'web';
	$WEB_AR_LANGS 					 = [
		"lg-vlca" => "Valencià",
		"lg-spa" => "Castellano"
	];
	// Maps
	$WEB_MAP_PROVIDER_URL = '//server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
	$WEB_PATH_MAP = [];			

	define('WEB_MENU_TABLE', 		$WEB_MENU_TABLE);
	define('WEB_MENU_SECTION_TIPO', $WEB_MENU_SECTION_TIPO);
	define('WEB_MENU_PARENT', 		$WEB_MENU_PARENT);
	define('WEB_HOME_PATH', 		$WEB_HOME_PATH);

	define('WEB_AR_LANGS', json_encode($WEB_AR_LANGS));

	define('WEB_MAP_PROVIDER_URL',	$WEB_MAP_PROVIDER_URL);

	# Web template file json
	define('WEB_TEMPLATE_MAP', 				 $WEB_TEMPLATE_MAP);
	define('WEB_TEMPLATE_MAP_DEFAULT_SOURCE',$WEB_TEMPLATE_MAP_DEFAULT_SOURCE);

	# WEB_PATH_MAP . Run name map for url's path Like redirect 'mon' to 'catalogo'
	define('WEB_PATH_MAP',	$WEB_PATH_MAP);


################################################################
# LIBRARIES
	
	// JQuery
	page::$js_ar_url[]   	= __WEB_ROOT_WEB__ . '/lib/jquery/jquery.min.js';
	#page::$js_ar_url[]   	= '//code.jquery.com/jquery-3.2.1.slim.min.js';

	// JQuery ColorBox
	page::$js_ar_url[]   	= __WEB_ROOT_WEB__ . '/lib/jquery-colorbox/jquery.colorbox-min.js';
	page::$css_ar_url[]  	= __WEB_ROOT_WEB__ . '/lib/jquery-colorbox/example4/colorbox.css';

	# jquery ui
	page::$css_ar_url[] 	= __WEB_ROOT_WEB__ . '/lib/jquery/jquery-ui/jquery-ui.min.css';
	page::$js_ar_url[]  	= __WEB_ROOT_WEB__ . '/lib/jquery/jquery-ui/jquery-ui.min.js';

	// Bootstrap 4
	page::$css_ar_url[]  	= 'https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css';
	page::$js_ar_url[]   	= 'https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.12.9/umd/popper.min.js';
	page::$js_ar_url[]   	= 'https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/js/bootstrap.min.js';

	// Maps
	$WEB_MAP_PROVIDER_URL = '//server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
	// leaflet
	page::$js_ar_url[]   	= __WEB_ROOT_WEB__ . '/lib/leaflet/leaflet.js';
	page::$css_ar_url[]  	= __WEB_ROOT_WEB__ . '/lib/leaflet/leaflet.css';

	// fontawesome
	#page::$css_ar_url[]  	= __WEB_ROOT_WEB__ . '/lib/fontawesome/fa-brands.css';
	page::$css_ar_url[]  	= __WEB_ROOT_WEB__ . '/lib/fontawesome/css/fontawesome-all.css';

	// Menu
	page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/'. WEB_DISPATCH_DIR. '/tpl/' . WEB_ENTITY . '/menu/css/menu.css';
	
	$BUILD_BREADCRUMB = false;	
	define('BUILD_BREADCRUMB',$BUILD_BREADCRUMB);



################################################################
# TABLE TO TEMPLE	
	$TABLE_TO_TEMPLATE = [];
	define('TABLE_TO_TEMPLATE', json_encode($TABLE_TO_TEMPLATE));



################################################################
# FIELDS MAP	
	// New projects	(using standard ww structure)
	$WEB_FIELDS_MAP = array(
		"term_id" 	=> 'term_id',
		"term"		=> 'term',
		"web_path"	=> 'web_path',
		"title"		=> 'title',
		"parent" 	=> 'parent',
		"childrens" => 'childrens'
	);
	define('WEB_FIELDS_MAP', json_encode($WEB_FIELDS_MAP));


