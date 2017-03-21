<?php
/*
	JSON DISPATCHER
*/
include(dirname(dirname(__FILE__)) .'/config_api/server_config_api.php');


# get request vars options
$options = isset($_REQUEST['options']) ? json_decode( rawurldecode($_REQUEST['options']) ) : null;
	#dump($options, ' _GET ++ '.to_string());

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