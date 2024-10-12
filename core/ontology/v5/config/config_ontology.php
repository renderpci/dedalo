<?php



// config. Dédalo main config file. 
// This the only one difference between D5 and D6 versions dd ontology folder
	require_once(dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php');



// session auth user_id. May differ between D5 / D6 vesions
	define('CURRENT_LOGGED_USED_ID', $_SESSION['dedalo']['auth']['user_id'] ?? null);



// main properties column. D5 uses 'propiedades' and D6 uses 'properties' as main json column
	define('MAIN_PROPERTIES_COLUMN', 'properties');



// equivalent to v5 base url
	define('DEDALO_LIB_BASE_URL', DEDALO_CORE_URL);

