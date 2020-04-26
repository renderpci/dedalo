<?php
/*
	JSON DISPATCHER

	Received vars (normally by CURL post)

		code : Auth code to validate request

		lang : Code lang of requested data like lg-spa
			   Is set as constant 'WEB_CURRENT_LANG_CODE' and you can use later as a valid constant in all server api
		
		options : json encoded data than contains all vars necessaries to build the api logic
				The first var inside json object is 'dedalo_get' and is used to determine the function to call in each case

*/


// debug			
	#error_log(print_r($_REQUEST,true));
	#error_log(print_r(file_get_contents('php://input'),true));


// headers 
	# Allow CORS
	$ACCESS_CONTROL_ALLOW_ORIGIN = defined('ACCESS_CONTROL_ALLOW_ORIGIN') ? ACCESS_CONTROL_ALLOW_ORIGIN : '*';
	header("Access-Control-Allow-Origin: {$ACCESS_CONTROL_ALLOW_ORIGIN}");


	# function cors() {
	# 
	#     // Allow from any origin
	#     if (isset($_SERVER['HTTP_ORIGIN'])) {
	#         // Decide if the origin in $_SERVER['HTTP_ORIGIN'] is one
	#         // you want to allow, and if so:
	#         header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
	#         header('Access-Control-Allow-Credentials: true');
	#         header('Access-Control-Max-Age: 86400');    // cache for 1 day
	#     }
	# 
	#     // Access-Control headers are received during OPTIONS requests
	#     if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
	# 
	#         if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
	#         	// may also be using PUT, PATCH, HEAD etc
	#             header("Access-Control-Allow-Methods: GET, POST, OPTIONS"); 
	#         }                    
	# 
	#         if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
	#             header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
	#         }
	# 
	# 		exit(0);
	#     }
	# 
	#     echo "You have CORS!";
	# }
	# cors();

// safe_xss 
	$safe_xss = function($value) {
		return $value;

		//var_dump($value);
		if (is_string($value)) {
			if ($decode_json=json_decode($value)) {
				// If var is a stringify json, not verify string now
			}else{
				$value = strip_tags($value,'<br><strong><em>');
				$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
			}
		}

		return $value;
	};//end safe_xss


// js fetch calls try with format like 
	# {	
	#	code 		: 'mmycode',
	# 	dedalo_get 	: 'records', 
	#	db_name 	: 'web_myweb',
	# 	table 		: 'mytable',
	# 	lang 		: 'lg-spa',
	# 	limit 		: 10
	# }
	if (empty($_REQUEST['code'])) {
		// try to get vars from json object
		$str_json = file_get_contents('php://input');
		if (!empty($str_json)) {
			$json_object= json_decode( $str_json );
			foreach($json_object as $key => $value) {
				if (!empty($value))
					$_REQUEST[$key] = $value;
			}
		}
	}

// auth code 
	// must to be identic to server config defined code
	$code = isset($_REQUEST['code']) ? $safe_xss($_REQUEST['code']) : false;

// lang 
	$lang = isset($_REQUEST['lang']) ? $safe_xss($_REQUEST['lang']) : false;

// db 
	$db_name = isset($_REQUEST['db_name']) ? $safe_xss($_REQUEST['db_name']) : false;

// config . Load server api config vars 
	# If received code if different to defined code, and error was launched
	# lang for the api was fixed here with received lang var or default value is used if not
	if(!include(dirname(dirname(__FILE__)) .'/config_api/server_config_api.php')) {
		exit("Error. Server API config file not found");
	}

// options . Get request vars options to send to manager 
	$options = isset($_REQUEST['options']) ? $_REQUEST['options'] : false;

	if ($options!==false) {
		if (is_string($options)) { 
			$options = json_decode( $options );
		}
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

// dedalo_get. Inject option dedalo_get as current dir name (captured as var from Apache regex) 
	$dedalo_get = isset($_REQUEST['dedalo_get']) ? $safe_xss($_REQUEST['dedalo_get']) : false;
	if ($dedalo_get!==false && is_object($options)) {
		$options->dedalo_get = $dedalo_get;
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
		# $options->conn 			 = web_data::get_db_connection();	

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


	$manager = new manager();

	#
	# PRINT AS JSON DATA
	header('Content-Type: application/json');

	try {
		$dedalo_data = $manager->manage_request( $options );
		$result 	 = json_encode($dedalo_data, JSON_UNESCAPED_UNICODE);
		echo $result;
	} catch (Exception $e) {
		$error_obj = new stdClass();
			$error_obj->result 	= false;
			$error_obj->msg 	= 'Exception when calling Dédalo API: '. $e->getMessage();
		$result = json_encode($error_obj, JSON_UNESCAPED_UNICODE);
		echo $result;
	}


	#if(SHOW_DEBUG===true) {
	#	error_log("api call ".PHP_EOL. json_encode($options, JSON_PRETTY_PRINT));
	#	error_log("api result ".PHP_EOL. $result);
	#	
	#	$t = time();	
	#	error_log( 'API SERVER CALL $_REQUEST: '. $t . PHP_EOL . print_r($_REQUEST,true));
	#}

	
