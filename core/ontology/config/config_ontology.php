<?php



// config. Dédalo main config file.
// This the only one difference between v5 and v6 versions dd ontology folder
	require_once(dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php');



// add legacy classes
	require DEDALO_CORE_PATH . '/legacy/class.css.php';
	require DEDALO_CORE_PATH . '/legacy/class.js.php';



// session auth user_id. May differ between v5 / v6 versions
	define('CURRENT_LOGGED_USED_ID', $_SESSION['dedalo']['auth']['user_id'] ?? null);



// main properties column. v5 uses 'propiedades' and v6 uses 'properties' as main JSON column
	define('MAIN_PROPERTIES_COLUMN', 'properties');



// equivalent to v5 base url
	define('DEDALO_LIB_BASE_URL', DEDALO_CORE_URL);
