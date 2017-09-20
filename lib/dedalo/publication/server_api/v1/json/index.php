<?php
# Allow CORS
header("Access-Control-Allow-Origin: *");
/*
	JSON DISPATCHER

	Received vars (normally by CURL post)

		code : Auth code to validate request

		lang : Code lang of requested data like lg-spa
			   Is setted as constant WEB_CURRENT_LANG_CODE and you can use later as a valid constant in all server api
		
		options : json encoded data than contains all vars necessaries to build the api logic
				The first var iside json object is 'dedalo_get' and is used to determine the function to call in any case

*/
# Auth code
	$code = isset($_REQUEST['code']) ? $_REQUEST['code'] : false;
# Lang
	$lang = isset($_REQUEST['lang']) ? $_REQUEST['lang'] : false;
#
# CONFIG . Loads server api config vars.
# If received code if different to defined code, and error was launched
# lang for the api was fixed here with received lang var or default value is used if not
include(dirname(dirname(__FILE__)) .'/config_api/server_config_api.php');

#
# OPTIONS . Get request vars options to send to manager
if (isset($_REQUEST['options'])) {
	$options = json_decode( $_REQUEST['options'] );
}else{
	$options = new stdClass();
	foreach ($_REQUEST as $key => $cvalue) {
		switch ($cvalue) {
			case 'true':
				$cvalue = true;
				break;
			case 'false':
				$cvalue = false;
				break;			
		}
		$options->$key = $cvalue;
	}
}


# Inject option dedalo_get as current dir name (captured as var from Apache regex)
if (isset($_GET['dedalo_get']) && is_object($options)) {
	$options->dedalo_get = $_GET['dedalo_get'];
}


	#
	# SEARCH OPTIONS AND DEFAULTS
	#
	# $options->table 		 	 = null;
	# $options->ar_fields 	 	 = array('*');
	# $options->sql_fullselect 	 = false; // default false
	# $options->sql_filter 	 	 = "";
	# $options->lang 			 = WEB_CURRENT_LANG_CODE; // default WEB_CURRENT_LANG_CODE (lg-spa)
	# $options->order 		 	 = '`id` ASC';
	# $options->limit 		 	 = null;
	# $options->group 		 	 = false;
	# $options->offset 		 	 = false;
	# $options->count 		 	 = false;
	# $options->resolve_portal 	 = false;
	# $options->conn 			 = DBi::_getConnection_mysql();	

	#
	# DATA 
	# SAMPLE GET ALL RECORDS FROM TABLE
		/*
		$table = 'edificios';
		$options = new stdClass();
			$options->table 		 = $table;
			$options->ar_fields 	 = array('*');
			$options->order 		 = null;
			$options->sql_filter 	 = PUBLICACION_FILTER_SQL;
		*/

	/*
	$dedalo_get = isset($options->dedalo_get) ? $options->dedalo_get : null;

	switch ($dedalo_get) {

		case 'tables_info':
			#
			# Execute data retrieving
			$full = isset($options->full) ? $options->full : false;
			$dedalo_data = (object)web_data::get_tables_info( $full );
			break;
		case 'publication_schema':
			#
			# Execute data retrieving
			$dedalo_data = (array)web_data::get_full_publication_schema( );
			break;
		case 'records':
		default:
			#
			# Execute data retrieving
			$dedalo_data = (object)web_data::get_rows_data( $options );
			break;
	}
	*/

	$manager 	 = new manager();
	$dedalo_data = $manager->manage_request( $options );
		#dump($dedalo_data, ' dedalo_data'); #die();	

#
# PRINT AS JSON DATA
header('Content-Type: application/json');
$result = json_encode($dedalo_data, JSON_UNESCAPED_UNICODE);
echo $result;
?>