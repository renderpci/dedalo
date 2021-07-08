<?php



// config4. Dédalo main config file. 
// This the only one difference between D5 and D6 versions dd ontology folder
	require_once(dirname(dirname(dirname(__FILE__))) .'/config/config4.php');



// session auth user_id. May differ between D5 / D6 vesions
	define('CURRENT_LOGGED_USED_ID', $_SESSION['dedalo4']['auth']['user_id']);



// main properties column. D5 uses 'propiedades' and D6 uses 'properties' as main json column
	define('MAIN_PROPERTIES_COLUMN', 'propiedades');


